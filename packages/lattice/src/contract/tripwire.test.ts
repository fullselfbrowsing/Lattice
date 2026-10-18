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
        foundAt: "text",
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
        foundAt: "text",
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
        foundAt: "text",
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
        foundAt: "text",
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
      expect(result.evidence.observed).toEqual({
        detector: "redact-foo",
        substring: "FOO",
        foundAt: "text",
      });
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

// ---------------------------------------------------------------------------
// Issue #21 F8 — no-pii walks nested containers deterministically
// ---------------------------------------------------------------------------

describe("no-pii nested walk (issue #21 F8)", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  it("flags PII inside a nested object below the declared path and reports the sub-path", async () => {
    const result = await evaluateTripwires(
      { result: { customer: { email: "alice@example.com" }, note: "fine" } },
      [inv.noPII("result")],
    );
    expectViolation(result);
    // `path` stays the declared path; the concrete location rides in
    // observed.foundAt and the message (runtime error only).
    expect(result.evidence.path).toBe("result");
    expect(result.evidence.observed).toEqual({
      detector: "email",
      substring: "alice@example.com",
      foundAt: "result.customer.email",
    });
    expect(result.evidence.message).toContain('"result.customer.email"');
  });

  it("flags PII inside an array and carries the index in the path", async () => {
    const result = await evaluateTripwires(
      { items: ["ok", "ok", { note: "SSN 123-45-6789" }] },
      [inv.noPII("items")],
    );
    expectViolation(result);
    expect(result.evidence.path).toBe("items");
    expect(result.evidence.observed).toMatchObject({ detector: "us-ssn", foundAt: "items[2].note" });
  });

  it("a wildcard path reports the concrete index of the offending element", async () => {
    const result = await evaluateTripwires(
      { items: [{ note: "fine" }, { note: "fine" }, { note: "call 415-555-1234" }] },
      [inv.noPII("items[*].note")],
    );
    expectViolation(result);
    expect(result.evidence.path).toBe("items[*].note");
    expect(result.evidence.observed).toEqual({
      detector: "us-phone",
      substring: "415-555-1234",
      foundAt: "items[2].note",
    });
  });

  it("nested wildcards substitute each materialized index in order", async () => {
    const result = await evaluateTripwires(
      { a: [{ b: ["x"] }, { b: ["y", "bob@example.com"] }] },
      [inv.noPII("a[*].b")],
    );
    expectViolation(result);
    expect(result.evidence.path).toBe("a[*].b");
    expect(result.evidence.observed).toMatchObject({ foundAt: "a[1].b[1]" });
  });

  it("an empty path scans the whole output", async () => {
    const result = await evaluateTripwires({ x: { y: "alice@example.com" } }, [inv.noPII("")]);
    expectViolation(result);
    expect(result.evidence.path).toBe("");
    expect(result.evidence.observed).toMatchObject({ foundAt: "x.y" });
  });

  it("non-string primitives pass: numbers are not stringified", async () => {
    const result = await evaluateTripwires(
      { data: { n: 4155551234, b: true, z: null, ssnLike: 123456789 } },
      [inv.noPII("data")],
    );
    expect(result).toEqual({ ok: true });
  });

  it("non-plain objects (Date, Map, typed arrays) are skipped", async () => {
    const result = await evaluateTripwires(
      {
        data: {
          when: new Date("2026-01-01T00:00:00Z"),
          map: new Map([["k", "alice@example.com"]]),
          bytes: new Uint8Array([1, 2, 3]),
        },
      },
      [inv.noPII("data")],
    );
    expect(result).toEqual({ ok: true });
  });

  it("is cycle-safe and still finds PII beside a self-reference", async () => {
    const clean: Record<string, unknown> = { label: "clean" };
    clean.self = clean;
    expect(await evaluateTripwires({ graph: clean }, [inv.noPII("graph")])).toEqual({ ok: true });

    const dirty: Record<string, unknown> = { label: "clean" };
    dirty.self = dirty;
    dirty.z = "alice@example.com";
    const result = await evaluateTripwires({ graph: dirty }, [inv.noPII("graph")]);
    expectViolation(result);
    expect(result.evidence.path).toBe("graph");
    expect(result.evidence.observed).toMatchObject({ foundAt: "graph.z" });
  });

  it("is deterministic: key insertion order does not change the reported violation", async () => {
    const first = await evaluateTripwires(
      { data: { b: "SSN 123-45-6789", a: "alice@example.com" } },
      [inv.noPII("data", { id: "fixed" })],
    );
    const second = await evaluateTripwires(
      { data: { a: "alice@example.com", b: "SSN 123-45-6789" } },
      [inv.noPII("data", { id: "fixed" })],
    );
    expect(first).toEqual(second);
    expectViolation(first);
    expect(first.evidence.path).toBe("data");
    expect(first.evidence.observed).toMatchObject({ foundAt: "data.a" });
  });

  it("traversal order beats detector order: the first string reached wins", async () => {
    const result = await evaluateTripwires(
      { a: "415-555-1234", b: "alice@example.com" },
      [inv.noPII("")],
    );
    expectViolation(result);
    expect(result.evidence.path).toBe("");
    expect(result.evidence.observed).toMatchObject({ detector: "us-phone", foundAt: "a" });
  });

  it("depth is capped at 32 levels (documented bound): 40 deep passes, 20 deep fires", async () => {
    const nest = (levels: number): unknown => {
      let value: unknown = "alice@example.com";
      for (let i = 0; i < levels; i += 1) value = { a: value };
      return value;
    };
    expect(await evaluateTripwires({ root: nest(40) }, [inv.noPII("root")])).toEqual({ ok: true });
    const shallow = await evaluateTripwires({ root: nest(20) }, [inv.noPII("root")]);
    expectViolation(shallow);
    expect(shallow.evidence.path).toBe("root");
    expect(shallow.evidence.observed).toMatchObject({ foundAt: `root${".a".repeat(20)}` });
  });

  it("evidence still excludes the surrounding text", async () => {
    const result = await evaluateTripwires(
      { items: [{ note: "please contact alice@example.com today" }] },
      [inv.noPII("items")],
    );
    expectViolation(result);
    expect(JSON.stringify(result.evidence.observed)).not.toContain("please");
    expect(JSON.stringify(result.evidence.observed)).not.toContain("today");
  });
});

// ---------------------------------------------------------------------------
// Issue #21 F9 — must-cite options
// ---------------------------------------------------------------------------

describe("must-cite options (issue #21 F9)", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  it("path option locates a nested citations array", async () => {
    const ok = await evaluateTripwires(
      { result: { refs: [{ source: "doc-1" }] } },
      [inv.mustCite("doc-1", { path: "result.refs" })],
    );
    expect(ok).toEqual({ ok: true });

    const missing = await evaluateTripwires(
      { result: { refs: [{ source: "doc-2" }] } },
      [inv.mustCite("doc-1", { path: "result.refs" })],
    );
    expectViolation(missing);
    expect(missing.evidence.path).toBe("result.refs");
    expect(missing.evidence.observed).toEqual([{ source: "doc-2" }]);
  });

  it("path pointing at a non-array yields a violation with observed []", async () => {
    const result = await evaluateTripwires(
      { result: { refs: "doc-1" } },
      [inv.mustCite("doc-1", { path: "result.refs" })],
    );
    expectViolation(result);
    expect(result.evidence.observed).toEqual([]);
    expect(result.evidence.path).toBe("result.refs");
  });

  it("keys option compares the given object keys", async () => {
    const output = { citations: [{ id: "doc-1" }] };
    const byDefault = await evaluateTripwires(output, [inv.mustCite("doc-1")]);
    expectViolation(byDefault);
    const byId = await evaluateTripwires(output, [inv.mustCite("doc-1", { keys: ["id"] })]);
    expect(byId).toEqual({ ok: true });
    const byEither = await evaluateTripwires(output, [
      inv.mustCite("doc-1", { keys: ["source", "id"] }),
    ]);
    expect(byEither).toEqual({ ok: true });
  });

  it("caseInsensitive matches strings and object keys", async () => {
    const strings = { citations: ["DOC-1"] };
    expectViolation(await evaluateTripwires(strings, [inv.mustCite("doc-1")]));
    expect(
      await evaluateTripwires(strings, [inv.mustCite("doc-1", { caseInsensitive: true })]),
    ).toEqual({ ok: true });

    const objects = { citations: [{ source: "DOC-1" }] };
    expectViolation(await evaluateTripwires(objects, [inv.mustCite("doc-1")]));
    expect(
      await evaluateTripwires(objects, [inv.mustCite("doc-1", { caseInsensitive: true })]),
    ).toEqual({ ok: true });
  });

  it("defaults are unchanged: the evidence fallback key still works", async () => {
    const result = await evaluateTripwires({ evidence: ["doc-1"] }, [inv.mustCite("doc-1")]);
    expect(result).toEqual({ ok: true });
  });
});
