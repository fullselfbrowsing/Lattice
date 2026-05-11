import { describe, expect, it } from "vitest";

import { contract, createAI } from "../src/index.js";
import type {
  BudgetInvariant,
  CapabilityContract,
  ContractRejectReasonCode,
  InvariantDeclaration,
  QualityFloorInvariant,
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
    const inv: InvariantDeclaration = { id: "x", kind: "policy" };
    const code: ContractRejectReasonCode = "contract-budget-exceeded";
    const usage: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };
    expect([b, q, inv, code, usage]).toHaveLength(5);
  });
});
