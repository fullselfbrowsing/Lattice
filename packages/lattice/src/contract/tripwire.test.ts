import type { StandardSchemaV1 } from "@standard-schema/spec";
import { beforeEach, describe, expect, it } from "vitest";

import { inv, type MustCiteOptions } from "./invariants.js";
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

  it("shared reference first met at the depth cap is still scanned through a shallower path (review follow-up round 5)", async () => {
    // X sits at depth 31 under the "a" chain, so its children are cut at 32.
    // Keys scan in sorted order, so the deep path is visited before the
    // shallow "z" path. A set-based visited guard would mark X on the deep
    // visit and skip it on the shallow one, hiding the email.
    const shared = { inner: { email: "alice@example.com" } };
    let deep: unknown = shared;
    for (let i = 0; i < 30; i += 1) deep = { d: deep };
    const result = await evaluateTripwires({ graph: { a: deep, z: shared } }, [inv.noPII("graph")]);
    expectViolation(result);
    expect(result.evidence.path).toBe("graph");
    expect(result.evidence.observed).toMatchObject({ detector: "email", foundAt: "graph.z.inner.email" });
  });

  it("shared references do not multiply work: a 25-level diamond graph scans each node once", async () => {
    // Every node points at the same child twice. A path-stack-only cycle
    // guard would walk 2^25 paths; the depth-keyed visited map walks 26.
    let node: Record<string, unknown> = { email: "alice@example.com" };
    for (let i = 0; i < 25; i += 1) node = { l: node, r: node };
    const result = await evaluateTripwires({ graph: node }, [inv.noPII("graph")]);
    expectViolation(result);
    expect(result.evidence.observed).toMatchObject({ foundAt: `graph${".l".repeat(25)}.email` });
  });

  it("a clean shared reference met again at a shallower depth is rescanned and still passes", async () => {
    const shared = { inner: { note: "nothing here" } };
    let deep: unknown = shared;
    for (let i = 0; i < 30; i += 1) deep = { d: deep };
    expect(await evaluateTripwires({ graph: { a: deep, z: shared } }, [inv.noPII("graph")])).toEqual({ ok: true });
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

  it("real PII after a common word such as customer or ID still fails the invariant", async () => {
    const ssn = await evaluateTripwires({ answer: "Customer SSN 123-45-6789" }, [inv.noPII("answer")]);
    expectViolation(ssn);
    expect(ssn.evidence.observed).toEqual({
      detector: "us-ssn",
      substring: "123-45-6789",
      foundAt: "answer",
    });

    const patient = await evaluateTripwires(
      { answer: { title: "Intake", note: "Patient ID 987-65-4321" } },
      [inv.noPII("answer")],
    );
    expectViolation(patient);
    expect(patient.evidence.observed).toMatchObject({ detector: "us-ssn", foundAt: "answer.note" });

    // The "Order" header is on an earlier line, so it does not label the row.
    const table = await evaluateTripwires(
      { answer: { rows: "| Order | Phone |\n|---|---|\n| 5521 | 415-555-1234 |" } },
      [inv.noPII("answer")],
    );
    expectViolation(table);
    expect(table.evidence.observed).toEqual({
      detector: "us-phone",
      substring: "415-555-1234",
      foundAt: "answer.rows",
    });
  });

  it("string timestamps, sizes, and JSON text that carries them are not PII", async () => {
    const result = await evaluateTripwires(
      {
        answer: {
          createdAt: "1729555200",
          bytes: "123456789",
          dims: "512 64 4096",
          log: JSON.stringify({ event: "login", ts: 1729555200, size: 104857600 }),
          pi: "3.1415926535",
        },
      },
      [inv.noPII("answer")],
    );
    expect(result).toEqual({ ok: true });
  });

  it("detectors see only the string: a bare value under a telling key passes, a dashed one does not", async () => {
    // Documented limit: the field name is not a cue, so the undashed form
    // needs "SSN" in the string itself.
    expect(await evaluateTripwires({ answer: { ssn: "123456789" } }, [inv.noPII("answer")])).toEqual({ ok: true });
    const cued = await evaluateTripwires({ answer: { ssn: "SSN 123456789" } }, [inv.noPII("answer")]);
    expectViolation(cued);
    expect(cued.evidence.observed).toMatchObject({ detector: "us-ssn", foundAt: "answer.ssn" });
    const dashed = await evaluateTripwires({ answer: { ssn: "123-45-6789" } }, [inv.noPII("answer")]);
    expectViolation(dashed);
    expect(dashed.evidence.observed).toMatchObject({ detector: "us-ssn", foundAt: "answer.ssn" });
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

  it("inline accepts a bracket or parenthesis citation with no citations array", async () => {
    expect(
      await evaluateTripwires({ answer: "per [doc-a], refund" }, [
        inv.mustCite("doc-a", { inline: true }),
      ]),
    ).toEqual({ ok: true });
    expect(
      await evaluateTripwires({ answer: "see (doc-a) for the policy" }, [
        inv.mustCite("doc-a", { inline: true }),
      ]),
    ).toEqual({ ok: true });
  });

  it("by default an inline marker alone does not satisfy must-cite", async () => {
    const result = await evaluateTripwires({ answer: "per [doc-a], refund" }, [inv.mustCite("doc-a")]);
    expectViolation(result);
    expect(result.evidence.message).toBe('must-cite: no citation found for "doc-a".');
  });

  it("rejectUncited rejects a listed entry when the prose cites a different work", async () => {
    const result = await evaluateTripwires(
      { answer: "Refund per [Smith 1999].", citations: ["doc-a"] },
      [inv.mustCite("doc-a", { rejectUncited: true })],
    );
    expectViolation(result);
    expect(result.evidence.message).toContain("not cited in the text");
  });

  it("by default a listed entry passes whatever the prose brackets say", async () => {
    expect(
      await evaluateTripwires(
        { answer: "Refund per [Smith 1999].", citations: ["doc-a"] },
        [inv.mustCite("doc-a")],
      ),
    ).toEqual({ ok: true });
  });

  it("rejectUncited accepts a listed entry when the prose cites the same work", async () => {
    expect(
      await evaluateTripwires(
        { answer: "Refund per [doc-a].", citations: ["doc-a"] },
        [inv.mustCite("doc-a", { rejectUncited: true })],
      ),
    ).toEqual({ ok: true });
  });

  it("rejectUncited still accepts a listed entry when the prose has no citation markers", async () => {
    expect(
      await evaluateTripwires({ text: "ok", citations: ["artifact-1"] }, [
        inv.mustCite("artifact-1", { rejectUncited: true }),
      ]),
    ).toEqual({ ok: true });
  });

  it("finds a citations array nested under the answer by default", async () => {
    expect(
      await evaluateTripwires(
        { answer: { text: "a", citations: ["doc-a"] } },
        [inv.mustCite("doc-a")],
      ),
    ).toEqual({ ok: true });
  });

  it("inline does not treat a longer fabricated title as the artifact name", async () => {
    expectViolation(
      await evaluateTripwires({ answer: "per [doc-a-draft], refund" }, [
        inv.mustCite("doc-a", { inline: true }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// must-cite: default structured match, opt-in inline and rejectUncited
// ---------------------------------------------------------------------------

const POLICY = "policy-refund";

function nestUnder(value: unknown, levels: number): unknown {
  let node = value;
  for (let i = 0; i < levels; i += 1) node = { n: node };
  return node;
}

describe("must-cite: correct citations pass by default and with rejectUncited", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  const correctlyCited: ReadonlyArray<readonly [string, unknown]> = [
    ["a numeric marker [1]", { answer: "Refunds take 5 days [1].", citations: [POLICY] }],
    ["adjacent markers [1][2]", { answer: "Refunds take 5 days [1][2].", citations: [POLICY] }],
    ["a markdown link", { answer: "[see docs](https://x)", citations: [POLICY] }],
    ["an editorial [sic]", { answer: "He said [sic] it.", citations: [POLICY] }],
    ["[citation needed]", { answer: "Refunds are fast [citation needed].", citations: [POLICY] }],
    ["a bracketed list [a, b]", { answer: "Values are [a, b].", citations: [POLICY] }],
    ["a bracketed timestamp", { answer: "[2026-01-01] Refund approved.", citations: [POLICY] }],
    ["a differently cased name", { answer: "Per [Policy-Refund].", citations: [POLICY] }],
    ["a task checkbox [x]", { answer: "- [x] refund issued", citations: [POLICY] }],
    ["an ellipsis [...]", { answer: "The policy [...] applies.", citations: [POLICY] }],
    ["arr[0] in a code span", { answer: "Use `arr[0]` for the first item.", citations: [POLICY] }],
    ["a fenced code block", { answer: "Example:\n```\nx = rows[7]\n```\nDone.", citations: [POLICY] }],
    ["a footnote [^1]", { answer: "Refunds take 5 days.[^1]", citations: [POLICY] }],
    ["[INFO] in a sibling log field", { answer: "Refund in 5 days.", log: "[INFO] done", citations: [POLICY] }],
    [
      "a bracket in another output field",
      { answer: "Refund approved.", action: { reason: "Charged twice [duplicate order]" }, citations: [POLICY] },
    ],
    [
      "a marker resolved through an entry marker",
      { answer: "Refunds take 5 days [1].", citations: [{ source: POLICY, marker: "1" }] },
    ],
    ["an IPv6 URL", { answer: "Fetched from http://[::1]:8080/doc", citations: [POLICY] }],
    ["JSON text in a sibling field", { answer: "Done.", data: { raw: '{"ids":["x"]}' }, citations: [POLICY] }],
    ["the artifact cited by name", { answer: "Refund per [policy-refund].", citations: [POLICY] }],
    ["a locator after the name", { answer: "Refund per [policy-refund, p. 4].", citations: [POLICY] }],
    ["several works in one bracket", { answer: "Per [policy-refund; doc-b].", citations: [POLICY, "doc-b"] }],
    ["a range covering the artifact", { answer: "Refunds [1-2].", citations: ["doc-b", POLICY] }],
    ["a list of numbers covering the artifact", { answer: "Refunds [1, 3].", citations: ["doc-b", "doc-c", POLICY] }],
    ["one citing marker among others", { answer: "Fast [2] and fair [1].", citations: [POLICY, "doc-b"] }],
    ["no brackets at all", { answer: "Refund in 5 days.", citations: [POLICY] }],
  ];

  it.each(correctlyCited)("%s", async (_label, output) => {
    expect(await evaluateTripwires(output, [inv.mustCite(POLICY)])).toEqual({ ok: true });
    expect(await evaluateTripwires(output, [inv.mustCite(POLICY, { rejectUncited: true })])).toEqual({
      ok: true,
    });
  });

  it("resolves [1] through a label key, matching the output.citations() shape", async () => {
    const output = {
      answer: "Refunds take 5 days [1].",
      citations: [{ artifactId: POLICY, label: "1" }],
    };
    const decl = inv.mustCite(POLICY, { keys: ["artifactId"], rejectUncited: true });
    expect(await evaluateTripwires(output, [decl])).toEqual({ ok: true });
  });

  it("an artifact whose name contains brackets, mentioned verbatim", async () => {
    const name = "Refund Policy [v2]";
    const output = { answer: "See Refund Policy [v2] for details.", citations: [name] };
    expect(await evaluateTripwires(output, [inv.mustCite(name, { rejectUncited: true })])).toEqual({
      ok: true,
    });
  });
});

describe("must-cite rejectUncited: what counts as citing something else", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  it("an author-year marker that matches no entry rejects, and the message names it", async () => {
    const result = await evaluateTripwires(
      { answer: "Refund per [Smith 1999].", citations: ["doc-a"] },
      [inv.mustCite("doc-a", { rejectUncited: true })],
    );
    expectViolation(result);
    expect(result.evidence.path).toBe("citations");
    expect(result.evidence.observed).toEqual(["doc-a"]);
    expect(result.evidence.message).toBe(
      'must-cite: citation "doc-a" is not cited in the text; [Smith 1999] at "answer" cites another source.',
    );
  });

  it("an out-of-range number cites something else", async () => {
    const result = await evaluateTripwires(
      { answer: "Refunds take 5 days [7].", citations: [POLICY] },
      [inv.mustCite(POLICY, { rejectUncited: true })],
    );
    expectViolation(result);
    expect(result.evidence.message).toBe(
      `must-cite: citation "${POLICY}" is not cited in the text; [7] at "answer" cites another source.`,
    );
  });

  it("numbers resolve by position, and by label when entries carry one", async () => {
    const byPosition = { answer: "Refunds take 5 days [2].", citations: [POLICY, "doc-b"] };
    expectViolation(await evaluateTripwires(byPosition, [inv.mustCite(POLICY, { rejectUncited: true })]));

    const labelled = [
      { source: "doc-b", label: "1" },
      { source: POLICY, label: "2" },
    ];
    expectViolation(
      await evaluateTripwires({ answer: "Fast [1].", citations: labelled }, [
        inv.mustCite(POLICY, { rejectUncited: true }),
      ]),
    );
    expect(
      await evaluateTripwires({ answer: "Fast [2].", citations: labelled }, [
        inv.mustCite(POLICY, { rejectUncited: true }),
      ]),
    ).toEqual({ ok: true });
  });

  it("a bracket naming another listed entry rejects", async () => {
    const result = await evaluateTripwires(
      { answer: "Refund per [doc-b].", citations: ["doc-b", "doc-a"] },
      [inv.mustCite("doc-a", { rejectUncited: true })],
    );
    expectViolation(result);
    expect(result.evidence.message).toContain("[doc-b]");
  });

  it("a parenthesized mention does not offset a competing square-bracket citation", async () => {
    const result = await evaluateTripwires(
      { answer: "per [Smith 1999] (we ignored doc-a)", citations: ["doc-a"] },
      [inv.mustCite("doc-a", { rejectUncited: true })],
    );
    expectViolation(result);
  });

  it("reports where a competing marker sits in a nested field", async () => {
    const result = await evaluateTripwires(
      { result: { summary: "Refund per [Smith et al., 2001]." }, citations: ["doc-a"] },
      [inv.mustCite("doc-a", { rejectUncited: true })],
    );
    expectViolation(result);
    expect(result.evidence.message).toContain('[Smith et al., 2001] at "result.summary"');
  });

  it("inline does not rescue a listed entry that rejectUncited rejects", async () => {
    const result = await evaluateTripwires(
      { answer: "Refund per [Smith 1999].", citations: ["doc-a"] },
      [inv.mustCite("doc-a", { inline: true, rejectUncited: true })],
    );
    expectViolation(result);
  });
});

describe("must-cite inline: the bracket content must equal the name", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  const cases: ReadonlyArray<readonly [string, string, unknown, MustCiteOptions, boolean]> = [
    ["an aside with an empty list (syntactic match)", POLICY, { answer: "This answer does not use (policy-refund).", citations: [] }, {}, true],
    ["a negated parenthetical", POLICY, { answer: "(not policy-refund)" }, {}, false],
    ["the name inside a longer aside", POLICY, { answer: "Refund (policy-refund is outdated) no." }, {}, false],
    ["a marker against a list that omits it", POLICY, { answer: "I did not read [policy-refund].", citations: ["other"] }, {}, false],
    ["a debug field against a list that omits it", POLICY, { answer: "x", debug: "(policy-refund)", citations: ["other"] }, {}, false],
    ["an aside beside a competing citation", "doc-a", { answer: "per [Smith 1999] (we ignored doc-a)" }, {}, false],
    ["a single-letter name", "a", { answer: "Choose option (a) or (b)." }, {}, true],
    ["a numeric name", "1", { answer: "Refunds take 5 days [1]." }, {}, true],
    ["a bare string output", POLICY, "see [policy-refund]", {}, true],
    ["a path-scoped empty list with a note elsewhere", "doc-a", { result: { refs: [] }, notes: "(doc-a)" }, { path: "result.refs" }, true],
    ["emoticons around the name", POLICY, { answer: "Sorry :( the policy-refund doc is gone :)", citations: [] }, {}, false],
    ["a non-ASCII letter before the name", "rich", { answer: "see [Zürich]" }, {}, false],
    ["a dotted suffix", "doc-a", { answer: "per [doc-a.v2]" }, {}, false],
    ["a colon suffix", "doc-a", { answer: "per [doc-a:draft]" }, {}, false],
    ["a name ending in its own delimiter, parenthesized", "v1.0)", { answer: "see (v1.0))" }, {}, false],
    ["a name ending in a parenthesis, square-bracketed", "v1.0)", { answer: "see [v1.0)]" }, {}, true],
    ["a name containing ], square-bracketed", "doc]a", { answer: "[doc]a]" }, {}, false],
    ["a name containing ], parenthesized", "doc]a", { answer: "(doc]a)" }, {}, true],
    ["a page locator", "doc-a", { answer: "See (doc-a, p. 4)." }, {}, true],
    ["a section locator", "doc-a", { answer: "See [doc-a §3]." }, {}, true],
    ["one of several works", "doc-b", { answer: "Per [doc-a; doc-b]." }, {}, true],
    ["link text", "doc-a", { answer: "See [doc-a](https://example.com/doc-a)." }, {}, false],
    ["a code span", "doc-a", { answer: "Run `lookup(doc-a)`." }, {}, false],
  ];

  it.each(cases)("%s", async (_label, name, output, options, inlineVerdict) => {
    const byDefault = await evaluateTripwires(output, [inv.mustCite(name, options)]);
    expectViolation(byDefault);
    expect(byDefault.evidence.message).toBe(`must-cite: no citation found for "${name}".`);
    const inline = await evaluateTripwires(output, [inv.mustCite(name, { ...options, inline: true })]);
    expect(inline.ok).toBe(inlineVerdict);
  });
});

describe("must-cite path scoping", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  it("brackets inside the declared list's entries are not prose", async () => {
    const titled = {
      answer: "Refund in 5 days.",
      result: { refs: [{ source: "doc-a", title: "Refund Policy [v2]" }] },
    };
    expect(await evaluateTripwires(titled, [inv.mustCite("doc-a", { path: "result.refs" })])).toEqual({ ok: true });
    expect(
      await evaluateTripwires(titled, [inv.mustCite("doc-a", { path: "result.refs", rejectUncited: true })]),
    ).toEqual({ ok: true });

    const drafted = { answer: "Refund in 5 days.", refs: [{ source: "doc-a", title: "[draft]" }] };
    expect(
      await evaluateTripwires(drafted, [inv.mustCite("doc-a", { path: "refs", rejectUncited: true })]),
    ).toEqual({ ok: true });
  });

  it("a citation-like bracket inside the declared subtree is skipped, outside it is read", async () => {
    const inside = { answer: "Refund in 5 days.", refs: [{ source: "doc-a", note: "[Smith 1999]" }] };
    expect(
      await evaluateTripwires(inside, [inv.mustCite("doc-a", { path: "refs", rejectUncited: true })]),
    ).toEqual({ ok: true });

    const outside = { answer: "Refund per [Smith 1999].", refs: [{ source: "doc-a" }] };
    expectViolation(
      await evaluateTripwires(outside, [inv.mustCite("doc-a", { path: "refs", rejectUncited: true })]),
    );
  });

  it("a declared path disables the nested fallback", async () => {
    const result = await evaluateTripwires(
      { result: { refs: [] }, answer: { citations: ["doc-a"] } },
      [inv.mustCite("doc-a", { path: "result.refs" })],
    );
    expectViolation(result);
    expect(result.evidence.path).toBe("result.refs");
  });
});

describe("must-cite nested fallback", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  const nestedPasses: ReadonlyArray<readonly [string, unknown]> = [
    ["an empty top-level list", { citations: [], answer: { citations: ["doc-a"] } }],
    ["a non-array top-level value", { citations: "doc-a", answer: { citations: ["doc-a"] } }],
    ["a top-level list that omits the artifact", { citations: ["doc-b"], answer: { citations: ["doc-a"] } }],
    ["a second nested list", { a: { deep: { citations: ["doc-b"] } }, b: { citations: ["doc-a"] } }],
    ["a list inside an array of answers", { answers: [{ text: "x", citations: ["doc-a"] }] }],
    ["a nested evidence list", { answer: { text: "x", evidence: ["doc-a"] } }],
  ];

  it.each(nestedPasses)("%s", async (_label, output) => {
    expect(await evaluateTripwires(output, [inv.mustCite("doc-a")])).toEqual({ ok: true });
  });

  it("evidence names the top-level list, else the first nested list in walk order", async () => {
    const withTop = await evaluateTripwires(
      { citations: ["doc-b"], answer: { citations: ["doc-c"] } },
      [inv.mustCite("doc-a")],
    );
    expectViolation(withTop);
    expect(withTop.evidence.path).toBe("citations");
    expect(withTop.evidence.observed).toEqual(["doc-b"]);

    const nestedOnly = await evaluateTripwires(
      { answers: [{ citations: ["doc-b"] }], other: { citations: ["doc-c"] } },
      [inv.mustCite("doc-a")],
    );
    expectViolation(nestedOnly);
    expect(nestedOnly.evidence.path).toBe("answers[0].citations");
    expect(nestedOnly.evidence.observed).toEqual(["doc-b"]);
  });

  it("the top-level evidence list is not consulted when a top-level citations list exists", async () => {
    expectViolation(
      await evaluateTripwires({ citations: ["doc-b"], evidence: ["doc-a"] }, [inv.mustCite("doc-a")]),
    );
  });
});

describe("must-cite walk bounds and determinism", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  it("key insertion order does not change the verdict", async () => {
    const rows = ["[Smith 1999] header", ...Array.from({ length: 205 }, (_, i) => `row ${i}`)];
    const decl = inv.mustCite("doc-a", { rejectUncited: true, id: "fixed" });
    const rowsFirst = await evaluateTripwires({ rows, answer: "per [doc-a]", citations: ["doc-a"] }, [decl]);
    const answerFirst = await evaluateTripwires({ answer: "per [doc-a]", rows, citations: ["doc-a"] }, [decl]);
    expect(rowsFirst).toEqual({ ok: true });
    expect(answerFirst).toEqual(rowsFirst);
  });

  it("a competing marker nine levels deep or after 205 strings is still read", async () => {
    const decl = inv.mustCite("doc-a", { rejectUncited: true });
    expectViolation(
      await evaluateTripwires({ citations: ["doc-a"], answer: nestUnder("per [Smith 1999]", 9) }, [decl]),
    );
    const rows = Array.from({ length: 205 }, (_, i) => `row ${i}`);
    expectViolation(
      await evaluateTripwires({ rows, zAnswer: "per [Smith 1999]", citations: ["doc-a"] }, [decl]),
    );
  });

  it("reaching the 32-level bound makes rejectUncited unknown, so it does not reject", async () => {
    const decl = inv.mustCite("doc-a", { rejectUncited: true });
    expect(
      await evaluateTripwires(
        { citations: ["doc-a"], answer: "per [Smith 1999]", deep: nestUnder("x", 40) },
        [decl],
      ),
    ).toEqual({ ok: true });
    expectViolation(
      await evaluateTripwires(
        { citations: ["doc-a"], answer: "per [Smith 1999]", deep: nestUnder("x", 20) },
        [decl],
      ),
    );
  });

  it("an inline marker below the bound is not seen, so inline does not accept it", async () => {
    const decl = inv.mustCite("doc-a", { inline: true });
    expectViolation(await evaluateTripwires({ answer: nestUnder("per [doc-a]", 40) }, [decl]));
    expect(await evaluateTripwires({ answer: nestUnder("per [doc-a]", 20) }, [decl])).toEqual({ ok: true });
  });

  it("cycles terminate in every walk", async () => {
    const cyclic: Record<string, unknown> = { text: "per [doc-a]" };
    cyclic.self = cyclic;
    expect(await evaluateTripwires({ answer: cyclic }, [inv.mustCite("doc-a", { inline: true })])).toEqual({
      ok: true,
    });
    expect(
      await evaluateTripwires({ answer: cyclic, citations: ["doc-a"] }, [
        inv.mustCite("doc-a", { rejectUncited: true }),
      ]),
    ).toEqual({ ok: true });
    expectViolation(await evaluateTripwires({ answer: cyclic }, [inv.mustCite("doc-a")]));
  });

  it("shared references do not multiply the walks: a 12-wide, 10-deep DAG evaluates in under 100 ms", async () => {
    let node: Record<string, unknown> = { n: 1, note: "plain [x] text" };
    for (let depth = 0; depth < 10; depth += 1) {
      const next: Record<string, unknown> = {};
      for (let i = 0; i < 12; i += 1) next[`k${i}`] = node;
      node = next;
    }
    const started = performance.now();
    expect(
      await evaluateTripwires({ answer: "Refund in 5 days.", data: node, citations: ["doc-a"] }, [
        inv.mustCite("doc-a", { rejectUncited: true }),
      ]),
    ).toEqual({ ok: true });
    expectViolation(
      await evaluateTripwires({ answer: "Refund in 5 days.", data: node }, [
        inv.mustCite("doc-a", { inline: true }),
      ]),
    );
    expectViolation(await evaluateTripwires({ data: node }, [inv.mustCite("doc-a")]));
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("must-cite caseInsensitive folds lists and prose the same way", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  it("a dotted capital I matches in the list and in the prose", async () => {
    const name = "i̇stanbul";
    const listed = { answer: "per [İstanbul]", citations: ["İstanbul"] };
    expect(
      await evaluateTripwires(listed, [inv.mustCite(name, { caseInsensitive: true, rejectUncited: true })]),
    ).toEqual({ ok: true });
    expect(
      await evaluateTripwires({ answer: "per [İstanbul]" }, [
        inv.mustCite(name, { caseInsensitive: true, inline: true }),
      ]),
    ).toEqual({ ok: true });
  });

  it("case-sensitive matching stays the default for prose too", async () => {
    expectViolation(
      await evaluateTripwires({ answer: "per [DOC-A]" }, [inv.mustCite("doc-a", { inline: true })]),
    );
    expect(
      await evaluateTripwires({ answer: "per [DOC-A]" }, [
        inv.mustCite("doc-a", { inline: true, caseInsensitive: true }),
      ]),
    ).toEqual({ ok: true });
  });
});
