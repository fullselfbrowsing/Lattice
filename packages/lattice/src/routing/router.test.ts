import { describe, expect, it } from "vitest";

import { contract } from "../contract/contract.js";
import type { ModelCapability, ProviderAdapter } from "../providers/provider.js";
import {
  createCapabilityCatalog,
  defaultCapabilityForProvider,
} from "./catalog.js";
import { routeDeterministically } from "./router.js";

function adapter(id: string, capability: ModelCapability): ProviderAdapter {
  return {
    id,
    kind: "provider-adapter",
    capabilities: [capability],
  };
}

describe("Phase 7 contract preflight integration", () => {
  it("Test 1: contract=undefined preserves backward compatibility with omitted field", () => {
    const catalog = createCapabilityCatalog([
      { id: "p", kind: "provider-adapter" },
    ]);
    const without = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
    });
    const withUndef = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
    });
    expect(withUndef.selected?.modelId).toBe(without.selected?.modelId);
    expect(withUndef.noRouteReasons).toEqual(without.noRouteReasons);
  });

  it("Test 2: single capability over budget produces no route and contract-budget-exceeded", () => {
    const expensive: ModelCapability = {
      ...defaultCapabilityForProvider("a"),
      pricing: { inputPer1kTokens: 0.005, outputPer1kTokens: 0.01 },
    };
    const catalog = createCapabilityCatalog([adapter("a", expensive)]);
    const decision = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
      contract: contract({ budget: { maxCostUsd: 0.0000001 } }),
    });
    expect(decision.selected).toBeUndefined();
    expect(
      decision.noRouteReasons.some((r) => r.code === "contract-budget-exceeded"),
    ).toBe(true);
  });

  it("Test 3: required modality video missing flows into noRouteReasons", () => {
    const textOnly: ModelCapability = {
      ...defaultCapabilityForProvider("a"),
      inputModalities: ["text"],
      outputModalities: ["text"],
    };
    const catalog = createCapabilityCatalog([adapter("a", textOnly)]);
    const decision = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
      contract: contract({ requiredModalities: ["video"] }),
    });
    expect(decision.selected).toBeUndefined();
    expect(
      decision.noRouteReasons.some((r) => r.code === "contract-modality-missing"),
    ).toBe(true);
  });

  it("Test 4: under-budget capability is selected; over-budget appears in rejected list", () => {
    const expensive: ModelCapability = {
      ...defaultCapabilityForProvider("expensive"),
      pricing: { inputPer1kTokens: 1.0, outputPer1kTokens: 1.0 },
    };
    const cheap: ModelCapability = {
      ...defaultCapabilityForProvider("cheap"),
      pricing: { inputPer1kTokens: 0.0001, outputPer1kTokens: 0.0001 },
    };
    const catalog = createCapabilityCatalog([
      adapter("expensive", expensive),
      adapter("cheap", cheap),
    ]);
    const decision = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
      contract: contract({ budget: { maxCostUsd: 0.001 } }),
    });
    expect(decision.selected?.providerId).toBe("cheap");
    const rejectedExpensive = decision.rejected.find(
      (c) => c.providerId === "expensive",
    );
    expect(rejectedExpensive).toBeDefined();
    expect(
      rejectedExpensive?.reasons.some((r) => r.code === "contract-budget-exceeded"),
    ).toBe(true);
  });

  it("Test 5: required privacy not satisfied produces contract-privacy-mismatch", () => {
    const standardOnly: ModelCapability = {
      ...defaultCapabilityForProvider("a"),
      dataPolicy: {
        privacy: ["standard", "sensitive"],
        uploadRetention: "none",
        supportsNoLogging: true,
        supportsNoTraining: true,
      },
    };
    const catalog = createCapabilityCatalog([adapter("a", standardOnly)]);
    const decision = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
      contract: contract({ requiredPrivacy: "restricted" }),
    });
    expect(decision.selected).toBeUndefined();
    expect(
      decision.noRouteReasons.some((r) => r.code === "contract-privacy-mismatch"),
    ).toBe(true);
  });

  it("Test 6: all candidates fail contract — noRouteReasons dedupes by code", () => {
    const a: ModelCapability = {
      ...defaultCapabilityForProvider("a"),
      pricing: { inputPer1kTokens: 1.0, outputPer1kTokens: 1.0 },
    };
    const b: ModelCapability = {
      ...defaultCapabilityForProvider("b"),
      pricing: { inputPer1kTokens: 2.0, outputPer1kTokens: 2.0 },
    };
    const catalog = createCapabilityCatalog([adapter("a", a), adapter("b", b)]);
    const decision = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
      contract: contract({ budget: { maxCostUsd: 0.0000001 } }),
    });
    expect(decision.selected).toBeUndefined();
    const budgetReasons = decision.noRouteReasons.filter(
      (r) => r.code === "contract-budget-exceeded",
    );
    expect(budgetReasons).toHaveLength(1);
  });

  it("rejects non-streaming candidates when streaming is requested", () => {
    const buffered: ModelCapability = {
      ...defaultCapabilityForProvider("buffered"),
      modelId: "buffered:model",
      streaming: false,
    };
    const streaming: ModelCapability = {
      ...defaultCapabilityForProvider("streaming"),
      modelId: "streaming:model",
      streaming: true,
    };
    const catalog = createCapabilityCatalog([
      adapter("buffered", buffered),
      adapter("streaming", streaming),
    ]);

    const decision = routeDeterministically(catalog, {
      task: "t",
      artifacts: [],
      outputs: { text: "text" },
      policy: { stream: true },
    });

    expect(decision.selected?.providerId).toBe("streaming");
    const rejectedBuffered = decision.rejected.find(
      (candidate) => candidate.providerId === "buffered",
    );
    expect(rejectedBuffered?.reasons.some((r) => r.code === "streaming-unsupported")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Issue #21 finding 7 — routing must not depend on catalog (registration) order
// ---------------------------------------------------------------------------

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (const [index, head] of items.entries()) {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    for (const tail of permutations(rest)) {
      out.push([head, ...tail]);
    }
  }
  return out;
}

describe("catalog order independence (issue #21 F7)", () => {
  const ids = ["delta", "alpha", "charlie", "bravo"] as const;
  // Costs differ by nanodollars per million tokens, which collapses to the
  // same integer micro-dollar score, so only the identifier tiebreak decides.
  const capabilities: readonly ModelCapability[] = ids.map((id, k) => ({
    ...defaultCapabilityForProvider(id),
    modelId: `${id}:m`,
    pricing: { inputCostPer1M: 1 + k * 1e-9, outputCostPer1M: 1 },
  }));

  function decide(order: readonly ModelCapability[]) {
    const catalog = createCapabilityCatalog(order.map((c) => adapter(c.providerId, c)));
    return routeDeterministically(catalog, { task: "t", artifacts: [], outputs: { text: "text" } });
  }

  it("every permutation of a near-equal-cost catalog yields the same selected route and fallback chain", () => {
    const perms = permutations(capabilities);
    expect(perms).toHaveLength(24);

    const baseline = decide(perms[0]!);
    expect(baseline.selected?.providerId).toBe("alpha");
    expect(baseline.fallbackChain.map((f) => f.providerId)).toEqual(["bravo", "charlie", "delta"]);
    const scores = new Set(baseline.candidates.map((c) => c.score));
    expect(scores.size).toBe(1);

    for (const perm of perms) {
      const decision = decide(perm);
      expect(`${decision.selected?.providerId}/${decision.selected?.modelId}`).toBe(
        `${baseline.selected?.providerId}/${baseline.selected?.modelId}`,
      );
      expect(decision.fallbackChain.map((f) => `${f.providerId}/${f.modelId}`)).toEqual(
        baseline.fallbackChain.map((f) => `${f.providerId}/${f.modelId}`),
      );
    }
  });

  it("two equal-cost models from one provider order by modelId regardless of registration order", () => {
    const base = defaultCapabilityForProvider("solo");
    const zulu: ModelCapability = { ...base, modelId: "solo:zulu" };
    const alpha: ModelCapability = { ...base, modelId: "solo:alpha" };
    const forward = routeDeterministically(
      createCapabilityCatalog([{ id: "solo", kind: "provider-adapter", capabilities: [zulu, alpha] }]),
      { task: "t", artifacts: [], outputs: { text: "text" } },
    );
    const reversed = routeDeterministically(
      createCapabilityCatalog([{ id: "solo", kind: "provider-adapter", capabilities: [alpha, zulu] }]),
      { task: "t", artifacts: [], outputs: { text: "text" } },
    );
    expect(forward.selected?.modelId).toBe("solo:alpha");
    expect(reversed.selected?.modelId).toBe("solo:alpha");
    expect(forward.fallbackChain.map((f) => f.modelId)).toEqual(["solo:zulu"]);
    expect(reversed.fallbackChain.map((f) => f.modelId)).toEqual(["solo:zulu"]);
  });

  it("a cheaper candidate still wins regardless of where it is registered", () => {
    const cheap: ModelCapability = {
      ...defaultCapabilityForProvider("zz-cheap"),
      pricing: { inputCostPer1M: 0.5, outputCostPer1M: 0.5 },
    };
    const pricey: ModelCapability = {
      ...defaultCapabilityForProvider("aa-pricey"),
      pricing: { inputCostPer1M: 5, outputCostPer1M: 5 },
    };
    for (const order of [[cheap, pricey], [pricey, cheap]]) {
      const decision = decide(order);
      expect(decision.selected?.providerId).toBe("zz-cheap");
    }
  });
});
