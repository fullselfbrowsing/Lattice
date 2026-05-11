import type { StandardSchemaV1 } from "@standard-schema/spec";
import { beforeEach, describe, expect, it } from "vitest";

import type { CapabilityContract } from "./contract.js";
import {
  inv,
  type FieldFromTableInvariant,
  type InvariantDeclaration,
  type MatchesInvariant,
  type MustCiteInvariant,
  type NoPiiInvariant,
} from "./invariants.js";

function stringSchema(): StandardSchemaV1<unknown, string> {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate(value) {
        if (typeof value === "string") return { value };
        return { issues: [{ message: "Expected string." }] };
      },
    },
  };
}

describe("inv builder", () => {
  beforeEach(() => {
    inv.__resetCounterForTests();
  });

  describe("inv.mustCite", () => {
    it("Test 1: returns kind=must-cite, captures artifactName, auto-generates id with counter", () => {
      const result = inv.mustCite("artifact-1");
      const expected: MustCiteInvariant = {
        id: "must-cite-1",
        kind: "must-cite",
        artifactName: "artifact-1",
      };
      expect(result).toEqual(expected);
    });

    it("Test 2: caller-supplied id wins over auto-generation", () => {
      const result = inv.mustCite("artifact-1", { id: "custom" });
      expect(result.id).toBe("custom");
      expect(result.kind).toBe("must-cite");
      expect(result.artifactName).toBe("artifact-1");
    });
  });

  describe("inv.fieldFromTable", () => {
    it("Test 3: returns kind=field-from-table with path + allowedValues", () => {
      const result = inv.fieldFromTable("action.kind", ["create", "update"]);
      const expected: FieldFromTableInvariant = {
        id: "field-from-table-1",
        kind: "field-from-table",
        path: "action.kind",
        allowedValues: Object.freeze(["create", "update"]),
      };
      expect(result).toEqual(expected);
    });

    it("Test 4: allowedValues is frozen (defensive copy)", () => {
      const inputArray = ["a", "b"];
      const result = inv.fieldFromTable("x", inputArray);
      expect(Object.isFrozen(result.allowedValues)).toBe(true);
      // Mutating the source array does not affect the captured allowedValues.
      inputArray.push("c");
      expect(result.allowedValues).toEqual(["a", "b"]);
    });
  });

  describe("inv.noPII", () => {
    it("Test 5: returns kind=no-pii with path", () => {
      const result = inv.noPII("output.text");
      const expected: NoPiiInvariant = {
        id: "no-pii-1",
        kind: "no-pii",
        path: "output.text",
      };
      expect(result).toEqual(expected);
    });
  });

  describe("inv.matches", () => {
    it("Test 6: returns kind=matches with path + schema reference", () => {
      const schema = stringSchema();
      const result = inv.matches("payload", schema);
      const expected: MatchesInvariant<string> = {
        id: "matches-1",
        kind: "matches",
        path: "payload",
        schema,
      };
      expect(result).toEqual(expected);
      expect(result.schema).toBe(schema);
    });
  });

  describe("counter behavior", () => {
    it("Test 7: counter is monotonic across kinds — sequential calls produce 1, 2, 3, 4", () => {
      const a = inv.mustCite("a");
      const b = inv.fieldFromTable("x", ["y"]);
      const c = inv.noPII("z");
      const d = inv.matches("p", stringSchema());
      expect(a.id).toBe("must-cite-1");
      expect(b.id).toBe("field-from-table-2");
      expect(c.id).toBe("no-pii-3");
      expect(d.id).toBe("matches-4");
    });

    it("Test 8: __resetCounterForTests rewinds the counter to 0", () => {
      inv.mustCite("first");
      inv.mustCite("second");
      inv.__resetCounterForTests();
      const next = inv.mustCite("third");
      expect(next.id).toBe("must-cite-1");
    });
  });

  describe("immutability", () => {
    it("Test 9: returned declarations are frozen at the top level", () => {
      const m = inv.mustCite("a");
      const f = inv.fieldFromTable("x", ["y"]);
      const n = inv.noPII("z");
      const s = inv.matches("p", stringSchema());
      expect(Object.isFrozen(m)).toBe(true);
      expect(Object.isFrozen(f)).toBe(true);
      expect(Object.isFrozen(n)).toBe(true);
      expect(Object.isFrozen(s)).toBe(true);
    });
  });

  describe("type assignability into CapabilityContract", () => {
    it("Test 10: CapabilityContract.invariants accepts a heterogenous list of the discriminated union", () => {
      const declarations: readonly InvariantDeclaration[] = [
        inv.mustCite("artifact-1"),
        inv.fieldFromTable("action.kind", ["create", "update"]),
        inv.noPII("output.text"),
        inv.matches("payload", stringSchema()),
      ];
      // Structural use — proves CapabilityContract.invariants accepts the
      // union shape. Compile-time check via assignment.
      const c: Pick<CapabilityContract, "invariants"> = { invariants: declarations };
      expect(c.invariants?.length).toBe(4);
    });
  });
});
