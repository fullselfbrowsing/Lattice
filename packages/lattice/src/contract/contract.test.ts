import { describe, expect, it } from "vitest";

import type { ContractRejectReasonCode } from "./contract.js";
import { contract } from "./contract.js";

describe("contract() factory", () => {
  it("returns a frozen object with kind = capability-contract and no other fields when called with {}", () => {
    const c = contract({});

    expect(c.kind).toBe("capability-contract");
    expect(Object.isFrozen(c)).toBe(true);
    expect(c.budget).toBeUndefined();
    expect(c.invariants).toBeUndefined();
    expect(c.qualityFloor).toBeUndefined();
    expect(c.requiredModalities).toBeUndefined();
    expect(c.requiredPrivacy).toBeUndefined();
    // Exact keys check — only `kind` should be present when no input fields supplied.
    expect(Object.keys(c)).toEqual(["kind"]);
  });

  it("preserves a budget with maxCostUsd", () => {
    const c = contract({ budget: { maxCostUsd: 0.05 } });
    expect(c.budget?.maxCostUsd).toBe(0.05);
  });

  it("preserves a qualityFloor with suite and minScore", () => {
    const c = contract({ qualityFloor: { suite: "fixtures/inbox", minScore: 0.8 } });
    expect(c.qualityFloor?.suite).toBe("fixtures/inbox");
    expect(c.qualityFloor?.minScore).toBe(0.8);
  });

  it("declares invariants without evaluating them in Phase 7", () => {
    const c = contract({ invariants: [{ id: "must-cite", kind: "policy" }] });
    expect(c.invariants?.length).toBe(1);
    expect(c.invariants?.[0]?.id).toBe("must-cite");
    expect(c.invariants?.[0]?.kind).toBe("policy");
  });

  it("survives a JSON.parse(JSON.stringify(...)) round-trip with field equality", () => {
    const c = contract({
      budget: { maxCostUsd: 0.05 },
      qualityFloor: { suite: "fixtures/inbox", minScore: 0.8 },
      invariants: [{ id: "must-cite", kind: "policy", description: "all claims must cite" }],
      requiredModalities: ["text", "image"],
      requiredPrivacy: "sensitive",
    });
    const round = JSON.parse(JSON.stringify(c)) as typeof c;
    expect(round).toEqual(c);
  });

  it("ContractRejectReasonCode is the closed four-value union", () => {
    // Type-level + value-level: assigning each member must compile.
    const a: ContractRejectReasonCode = "contract-budget-exceeded";
    const b: ContractRejectReasonCode = "contract-quality-floor";
    const c: ContractRejectReasonCode = "contract-modality-missing";
    const d: ContractRejectReasonCode = "contract-privacy-mismatch";
    const all: readonly ContractRejectReasonCode[] = [a, b, c, d];
    expect(all).toHaveLength(4);
    expect(new Set(all).size).toBe(4);
  });
});
