import type { StandardSchemaV1 } from "@standard-schema/spec";
import { beforeEach, describe, expect, it } from "vitest";

import { inv } from "./invariants.js";
import { defaultPiiDetectors, type PiiDetector } from "./pii-detectors.js";
import {
  __resolvePathForTests,
  evaluateTripwires,
  type TripwireResult,
} from "./tripwire.js";

function stringSchema(minLength = 0): StandardSchemaV1<unknown, string> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate(value) {
        if (typeof value !== "string") {
          return { issues: [{ message: "Expected string." }] };
        }
        if (value.length < minLength) {
          return { issues: [{ message: `Expected length >= ${minLength}.` }] };
        }
        return { value };
      },
    },
  };
}

function expectViolation(result: TripwireResult): asserts result is Extract<
  TripwireResult,
  { ok: false }
> {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected violation");
}

describe("resolvePath", () => {
  it("Test 1: dotted path — resolvePath({a:{b:1}}, 'a.b') returns 1", () => {
    expect(__resolvePathForTests({ a: { b: 1 } }, "a.b")).toBe(1);
  });

  it("Test 2: missing path returns undefined", () => {
    expect(__resolvePathForTests({ a: { b: 1 } }, "a.c.d")).toBeUndefined();
    expect(__resolvePathForTests(undefined, "x")).toBeUndefined();
  });

  it("Test 3: bracket index — resolvePath({a:[{b:1},{b:2}]}, 'a[0].b') returns 1", () => {
    expect(__resolvePathForTests({ a: [{ b: 1 }, { b: 2 }] }, "a[0].b")).toBe(1);
    expect(__resolvePathForTests({ a: [{ b: 1 }, { b: 2 }] }, "a[1].b")).toBe(2);
  });

  it("Test 4: wildcard — resolvePath({a:[{b:1},{b:2}]}, 'a[*].b') returns [1, 2]", () => {
    expect(__resolvePathForTests({ a: [{ b: 1 }, { b: 2 }] }, "a[*].b")).toEqual([1, 2]);
  });

  it("Test 5: empty path returns the input", () => {
    expect(__resolvePathForTests({ a: 1 }, "")).toEqual({ a: 1 });
  });
});

describe("evaluateTripwires", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  describe("must-cite", () => {
    it("Test 6: happy path — citations array contains the artifact name → ok=true", async () => {
      const result = await evaluateTripwires(
        { citations: [{ source: "artifact-1" }] },
        [inv.mustCite("artifact-1")],
      );
      expect(result).toEqual({ ok: true });
    });

    it("Test 7: happy path — citations array of plain strings → ok=true", async () => {
      const result = await evaluateTripwires(
        { citations: ["artifact-1", "artifact-2"] },
        [inv.mustCite("artifact-2")],
      );
      expect(result).toEqual({ ok: true });
    });

    it("Test 8: violation — missing artifact → ok=false with kind=must-cite evidence", async () => {
      const output = { citations: [{ source: "artifact-1" }] };
      const decl = inv.mustCite("artifact-2");
      const result = await evaluateTripwires(output, [decl]);
      expectViolation(result);
      expect(result.evidence.invariantId).toBe(decl.id);
      expect(result.evidence.kind).toBe("must-cite");
      expect(result.evidence.observed).toEqual([{ source: "artifact-1" }]);
      expect(result.evidence.message).toMatch(/artifact-2/);
    });

    it("Test 9: violation — no citations array present → ok=false", async () => {
      const result = await evaluateTripwires({ text: "no cites" }, [inv.mustCite("artifact-1")]);
      expectViolation(result);
      expect(result.evidence.kind).toBe("must-cite");
    });
  });

  describe("field-from-table", () => {
    it("Test 10: happy — value is in allowedValues → ok=true", async () => {
      const result = await evaluateTripwires({ action: { kind: "create" } }, [
        inv.fieldFromTable("action.kind", ["create", "update"]),
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("Test 11: violation — value not in allowedValues → ok=false with observed=actual", async () => {
      const decl = inv.fieldFromTable("action.kind", ["delete"]);
      const result = await evaluateTripwires({ action: { kind: "create" } }, [decl]);
      expectViolation(result);
      expect(result.evidence.kind).toBe("field-from-table");
      expect(result.evidence.path).toBe("action.kind");
      expect(result.evidence.observed).toBe("create");
      expect(result.evidence.invariantId).toBe(decl.id);
    });
  });

  describe("no-pii", () => {
    it("Test 12: violation — email detector — evidence.observed contains only {detector, substring}", async () => {
      const result = await evaluateTripwires({ text: "ping alice@example.com" }, [
        inv.noPII("text"),
      ]);
      expectViolation(result);
      expect(result.evidence.kind).toBe("no-pii");
      expect(result.evidence.observed).toEqual({
        detector: "email",
        substring: "alice@example.com",
      });
      // CRITICAL: observed never carries the full input.
      expect(JSON.stringify(result.evidence.observed)).not.toContain("ping ");
    });

    it("Test 13: violation — us-ssn detector", async () => {
      const result = await evaluateTripwires({ text: "SSN 123-45-6789 confirmed" }, [
        inv.noPII("text"),
      ]);
      expectViolation(result);
      expect(result.evidence.observed).toEqual({
        detector: "us-ssn",
        substring: "123-45-6789",
      });
    });

    it("Test 14: violation — credit-card detector (Luhn-valid)", async () => {
      const result = await evaluateTripwires(
        { text: "Card 4111 1111 1111 1111 charged" },
        [inv.noPII("text")],
      );
      expectViolation(result);
      expect(result.evidence.observed).toEqual({
        detector: "credit-card",
        substring: "4111 1111 1111 1111",
      });
    });

    it("Test 15: violation — us-phone detector", async () => {
      const result = await evaluateTripwires({ text: "Call 415-555-1234 later" }, [
        inv.noPII("text"),
      ]);
      expectViolation(result);
      expect(result.evidence.observed).toEqual({
        detector: "us-phone",
        substring: "415-555-1234",
      });
    });

    it("Test 16: happy — no PII at path → ok=true", async () => {
      const result = await evaluateTripwires({ text: "nothing sensitive here" }, [
        inv.noPII("text"),
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("Test 17: caller-supplied detectors override defaults", async () => {
      const customDetector: PiiDetector = {
        name: "redact-foo",
        detect(input) {
          const idx = input.indexOf("FOO");
          return idx >= 0 ? { matched: true, substring: "FOO" } : { matched: false };
        },
      };
      const result = await evaluateTripwires(
        { text: "alice@example.com but watch for FOO" },
        [inv.noPII("text")],
        [customDetector],
      );
      expectViolation(result);
      // Default email detector was NOT used — custom list flagged FOO instead.
      expect(result.evidence.observed).toEqual({ detector: "redact-foo", substring: "FOO" });
    });
  });

  describe("matches", () => {
    it("Test 18: happy — schema validates the value at path → ok=true", async () => {
      const result = await evaluateTripwires({ payload: "hello" }, [
        inv.matches("payload", stringSchema()),
      ]);
      expect(result).toEqual({ ok: true });
    });

    it("Test 19: violation — schema rejects → evidence.observed is the value at path", async () => {
      const decl = inv.matches("payload", stringSchema(10));
      const result = await evaluateTripwires({ payload: "short" }, [decl]);
      expectViolation(result);
      expect(result.evidence.kind).toBe("matches");
      expect(result.evidence.path).toBe("payload");
      expect(result.evidence.observed).toBe("short");
      expect(result.evidence.invariantId).toBe(decl.id);
      expect(result.evidence.message.length).toBeGreaterThan(0);
    });
  });

  describe("evaluation flow", () => {
    it("Test 20: first-violation-aborts — returns FIRST failing invariant; later invariants not evaluated", async () => {
      let secondEvaluated = false;
      // Probe schema that mutates a flag if it ever runs.
      const probe: StandardSchemaV1<unknown, unknown> = {
        "~standard": {
          version: 1,
          vendor: "test",
          validate(value) {
            secondEvaluated = true;
            return { value };
          },
        },
      };
      const result = await evaluateTripwires({ action: { kind: "create" } }, [
        inv.fieldFromTable("action.kind", ["delete"]),
        inv.matches("action.kind", probe),
      ]);
      expectViolation(result);
      expect(result.evidence.kind).toBe("field-from-table");
      expect(secondEvaluated).toBe(false);
    });

    it("Test 21: empty invariants — returns ok=true and does not throw", async () => {
      const result = await evaluateTripwires({ anything: 1 }, []);
      expect(result).toEqual({ ok: true });
    });

    it("Test 22: detectors defaults to defaultPiiDetectors when omitted", async () => {
      // Sanity check that the default detector set is the one we ship.
      expect(defaultPiiDetectors.length).toBeGreaterThan(0);
      const result = await evaluateTripwires({ text: "alice@example.com" }, [inv.noPII("text")]);
      expectViolation(result);
      expect(result.evidence.observed).toMatchObject({ detector: "email" });
    });

    it("Test 23: purity — same (output, invariants) returns deep-equal results across two calls", async () => {
      const output = { citations: [{ source: "a" }] };
      const invariants = [inv.mustCite("missing")];
      const first = await evaluateTripwires(output, invariants);
      const second = await evaluateTripwires(output, invariants);
      expect(first).toEqual(second);
    });
  });
});
