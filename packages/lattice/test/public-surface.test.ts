import { describe, expect, it } from "vitest";

import {
  contract,
  createAI,
  evaluateTripwires,
  inv,
  isTerminal,
} from "../src/index.js";
import type {
  BudgetInvariant,
  CapabilityContract,
  ContractRejectReasonCode,
  FieldFromTableInvariant,
  InvariantDeclaration,
  MatchesInvariant,
  MustCiteInvariant,
  NoPiiInvariant,
  QualityFloorInvariant,
  TripwireEvidence,
  TripwireResult,
  TripwireViolationError,
  Usage,
} from "../src/index.js";

describe("Phase 7 public surface", () => {
  it("contract is exported as a function from the package root", () => {
    expect(typeof contract).toBe("function");
  });

  it("contract() returns a capability-contract object", () => {
    const c: CapabilityContract = contract({ budget: { maxCostUsd: 0.5 } });
    expect(c.kind).toBe("capability-contract");
    expect(c.budget?.maxCostUsd).toBe(0.5);
  });

  it("createAI accepts a RunIntent with a contract field (type compile check)", () => {
    const ai = createAI({});
    const intent = {
      task: "ping",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    };
    expect(typeof ai.run).toBe("function");
    void intent;
  });

  it("type-only: BudgetInvariant, QualityFloorInvariant, InvariantDeclaration, ContractRejectReasonCode, Usage are exported", () => {
    const b: BudgetInvariant = {};
    const q: QualityFloorInvariant = { suite: "fixtures/x", minScore: 0.5 };
    // Phase 8 reshape: InvariantDeclaration is a discriminated union over
    // four kinds (must-cite | field-from-table | no-pii | matches).
    const invDecl: InvariantDeclaration = { id: "x", kind: "must-cite", artifactName: "doc-1" };
    const code: ContractRejectReasonCode = "contract-budget-exceeded";
    const usage: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };
    expect([b, q, invDecl, code, usage]).toHaveLength(5);
  });
});

describe("Phase 8 public surface", () => {
  it("exports inv as a function-bag with the four builder helpers", () => {
    expect(typeof inv.mustCite).toBe("function");
    expect(typeof inv.fieldFromTable).toBe("function");
    expect(typeof inv.noPII).toBe("function");
    expect(typeof inv.matches).toBe("function");
  });

  it("inv.mustCite returns an InvariantDeclaration with the must-cite shape", () => {
    inv.__resetCounterForTests();
    const decl = inv.mustCite("artifact-1");
    expect(decl.kind).toBe("must-cite");
    expect(typeof decl.id).toBe("string");
    expect(decl.id.length).toBeGreaterThan(0);
    expect(decl.artifactName).toBe("artifact-1");
  });

  it("exports evaluateTripwires as an async function returning a TripwireResult", async () => {
    const result = await evaluateTripwires({ foo: "bar" }, []);
    expect(result.ok).toBe(true);
  });

  it("exports isTerminal predicate with the right truth table", () => {
    expect(
      isTerminal({
        kind: "tripwire-violated",
        message: "x",
        invariantId: "id",
        evidence: {
          invariantId: "id",
          kind: "must-cite",
          path: "citations",
          observed: [],
          message: "x",
        },
        terminal: true,
      }),
    ).toBe(true);
    expect(
      isTerminal({
        kind: "no-contract-match",
        message: "x",
        noRouteReasons: [],
      }),
    ).toBe(true);
    expect(
      isTerminal({
        kind: "validation",
        message: "x",
        issues: [],
      }),
    ).toBe(false);
  });

  it("type-only: Phase 8 invariant variant types are exported", () => {
    const mc: MustCiteInvariant = { id: "1", kind: "must-cite", artifactName: "a" };
    const ff: FieldFromTableInvariant = {
      id: "2",
      kind: "field-from-table",
      path: "action.kind",
      allowedValues: ["create"],
    };
    const np: NoPiiInvariant = { id: "3", kind: "no-pii", path: "text" };
    const mt: MatchesInvariant = {
      id: "4",
      kind: "matches",
      path: "payload",
      schema: {
        "~standard": {
          version: 1,
          vendor: "test",
          validate: (v: unknown) => ({ value: v }),
        },
      },
    };
    expect([mc.kind, ff.kind, np.kind, mt.kind]).toEqual([
      "must-cite",
      "field-from-table",
      "no-pii",
      "matches",
    ]);
  });

  it("type-only: TripwireEvidence, TripwireResult, TripwireViolationError are exported", () => {
    const evidence: TripwireEvidence = {
      invariantId: "id",
      kind: "no-pii",
      path: "text",
      observed: { detector: "email", substring: "a@b.co" },
      message: "PII detected",
    };
    const okResult: TripwireResult = { ok: true };
    const failResult: TripwireResult = { ok: false, evidence };
    const err: TripwireViolationError = {
      kind: "tripwire-violated",
      message: "",
      invariantId: "id",
      evidence,
      terminal: true,
    };
    expect(err.terminal).toBe(true);
    expect(okResult.ok).toBe(true);
    expect(failResult.ok).toBe(false);
  });

  it("createAI accepts a contract with invariants built via inv (compile + run)", async () => {
    inv.__resetCounterForTests();
    const ai = createAI({});
    const c: CapabilityContract = contract({
      invariants: [inv.fieldFromTable("action.kind", ["create"])],
    });
    expect(c.invariants).toHaveLength(1);
    expect(c.invariants?.[0]?.kind).toBe("field-from-table");
    expect(typeof ai.run).toBe("function");
  });
});
