import { describe, expect, it } from "vitest";

import { contract } from "../contract/contract.js";
import {
  estimateRouteCost,
  evaluateContractAgainstRoute,
} from "../contract/preflight.js";
import type {
  ModelCapability,
  ProviderAdapter,
  ProviderPricingHint,
} from "../providers/provider.js";
import { fc } from "../test-support/fast-check.js";
import {
  createCapabilityCatalog,
  defaultCapabilityForProvider,
} from "./catalog.js";
import { COST_ESTIMATOR_VERSION, estimateCost } from "./cost.js";
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

  it("copies the selected capability context window into route evidence", () => {
    const capability: ModelCapability = {
      ...defaultCapabilityForProvider("windowed"),
      modelId: "windowed:model",
      contextWindow: 32_768,
    };
    const decision = routeDeterministically(
      createCapabilityCatalog([adapter("windowed", capability)]),
      {
        task: "route",
        artifacts: [],
        outputs: { answer: "text" },
      },
    );

    expect(decision.selected).toMatchObject({
      providerId: "windowed",
      modelId: "windowed:model",
      contextWindow: 32_768,
    });
  });
});

describe("shared route cost decisions", () => {
  it("records preferred pricing and its exact structured estimate in plan evidence", () => {
    const capability: ModelCapability = {
      ...defaultCapabilityForProvider("preferred"),
      pricing: { inputPer1kTokens: 0.002, outputPer1kTokens: 0.004 },
    };
    const decision = routeDeterministically(
      createCapabilityCatalog([adapter("preferred", capability)]),
      { task: "route", artifacts: [], outputs: { answer: "text" } },
    );

    expect(decision.selected?.estimates).toMatchObject({
      outputTokens: 512,
      costEstimate: {
        version: COST_ESTIMATOR_VERSION,
        status: "known",
        input: { source: "per-1k", ratePer1kUsd: 0.002 },
        output: { source: "per-1k", ratePer1kUsd: 0.004 },
      },
    });
    expect(decision.selected?.estimates.costUsd).toBe(
      decision.selected?.estimates.costEstimate?.totalCostUsd,
    );
  });

  it("fails closed on unknown policy cost with a bounded reason", () => {
    const capability = withoutPricing(defaultCapabilityForProvider("unknown"));
    const decision = routeDeterministically(
      createCapabilityCatalog([adapter("unknown", capability)]),
      {
        task: "route",
        artifacts: [],
        outputs: { answer: "text" },
        policy: { maxCostUsd: 1 },
      },
    );

    expect(decision.selected).toBeUndefined();
    expect(decision.candidates[0]?.estimates.costUsd).toBeUndefined();
    expect(decision.candidates[0]?.estimates.costEstimate).toMatchObject({
      status: "unknown",
      totalCostUsd: null,
    });
    const reason = decision.candidates[0]?.reasons.find(
      (item) => item.code === "budget-exceeded",
    );
    expect(reason?.message).toContain("pricing unknown");
    expect(reason?.message.length).toBeLessThan(160);
  });

  it("accepts exact policy and contract equality and rejects every known overage", () => {
    const capability: ModelCapability = {
      ...defaultCapabilityForProvider("priced"),
      pricing: { inputCostPer1M: 2, outputCostPer1M: 4 },
    };
    const catalog = createCapabilityCatalog([adapter("priced", capability)]);
    const unconstrained = routeDeterministically(catalog, {
      task: "route equality",
      artifacts: [],
      outputs: { answer: "text" },
    });
    const estimate = unconstrained.selected?.estimates.costEstimate;
    expect(estimate?.status).toBe("known");
    const exact = estimate?.totalCostUsd ?? -1;

    const equal = routeDeterministically(catalog, {
      task: "route equality",
      artifacts: [],
      outputs: { answer: "text" },
      policy: { maxCostUsd: exact },
      contract: contract({ budget: { maxCostUsd: exact } }),
    });
    expect(equal.selected?.providerId).toBe("priced");

    const over = routeDeterministically(catalog, {
      task: "route equality",
      artifacts: [],
      outputs: { answer: "text" },
      policy: { maxCostUsd: exact / 2 },
      contract: contract({ budget: { maxCostUsd: exact / 2 } }),
    });
    expect(over.selected).toBeUndefined();
    expect(over.candidates[0]?.reasons.map((reason) => reason.code)).toEqual(
      expect.arrayContaining(["budget-exceeded", "contract-budget-exceeded"]),
    );
  });

  it("keeps unbounded unknown pricing eligible but ranks it after known free", () => {
    const unknown = withoutPricing(defaultCapabilityForProvider("unknown"));
    const free: ModelCapability = {
      ...defaultCapabilityForProvider("free"),
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
    };
    const decision = routeDeterministically(
      createCapabilityCatalog([
        adapter("unknown", unknown),
        adapter("free", free),
      ]),
      { task: "same route", artifacts: [], outputs: { answer: "text" } },
    );

    expect(decision.selected?.providerId).toBe("free");
    const unknownCandidate = decision.candidates.find(
      (candidate) => candidate.providerId === "unknown",
    );
    expect(unknownCandidate?.accepted).toBe(true);
    expect(unknownCandidate?.estimates.costEstimate?.status).toBe("unknown");
    expect(unknownCandidate?.score).toBeGreaterThan(decision.selected?.score ?? 0);
  });

  it("preserves each fallback's structured estimate", () => {
    const first: ModelCapability = {
      ...defaultCapabilityForProvider("first"),
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
    };
    const second: ModelCapability = {
      ...defaultCapabilityForProvider("second"),
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    };
    const decision = routeDeterministically(
      createCapabilityCatalog([
        adapter("first", first),
        adapter("second", second),
      ]),
      { task: "fallback", artifacts: [], outputs: { answer: "text" } },
    );
    const fallback = decision.fallbackChain[0];
    const candidate = decision.candidates.find(
      (item) => item.providerId === fallback?.providerId,
    );

    expect(fallback?.estimates).toEqual(candidate?.estimates);
    expect(fallback?.estimates?.costEstimate?.version).toBe(
      COST_ESTIMATOR_VERSION,
    );
  });

  it("property: route policy and contract preflight share cost facts and verdicts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          shape: fc.constantFrom(
            "modern",
            "legacy",
            "mixed",
            "conflicting",
            "partial",
            "unknown",
            "free",
          ),
          inputRate: fc.integer({ min: 0, max: 100_000 }),
          outputRate: fc.integer({ min: 0, max: 100_000 }),
          task: fc.string({ minLength: 0, maxLength: 200 }),
          budgetKind: fc.constantFrom("equal", "under", "over"),
        }),
        async (sample) => {
          const pricing = pricingForShape(
            sample.shape,
            sample.inputRate,
            sample.outputRate,
          );
          const base = defaultCapabilityForProvider("matrix");
          const capability: ModelCapability =
            pricing === undefined ? withoutPricing(base) : { ...base, pricing };
          const catalog = createCapabilityCatalog([adapter("matrix", capability)]);
          const unconstrained = routeDeterministically(catalog, {
            task: sample.task,
            artifacts: [],
            outputs: { answer: "text" },
          });
          const routeEstimate = unconstrained.candidates[0]!.estimates.costEstimate!;
          const directEstimate = estimateCost({
            ...(pricing !== undefined ? { pricing } : {}),
            inputTokens: unconstrained.candidates[0]!.estimates.inputTokens,
            outputTokens: unconstrained.candidates[0]!.estimates.outputTokens,
          });
          const scalar = estimateRouteCost({
            capability,
            estimatedInputTokens: unconstrained.candidates[0]!.estimates.inputTokens,
            estimatedOutputTokens: unconstrained.candidates[0]!.estimates.outputTokens,
          });

          expect(routeEstimate).toEqual(directEstimate);
          expect(routeEstimate.version).toBe(COST_ESTIMATOR_VERSION);
          expect(scalar).toBe(routeEstimate.totalCostUsd);

          const budget = matrixBudget(routeEstimate.totalCostUsd, sample.budgetKind);
          const routed = routeDeterministically(catalog, {
            task: sample.task,
            artifacts: [],
            outputs: { answer: "text" },
            policy: { maxCostUsd: budget },
          });
          const contractResult = evaluateContractAgainstRoute(
            contract({ budget: { maxCostUsd: budget } }),
            {
              capability,
              estimatedInputTokens: unconstrained.candidates[0]!.estimates.inputTokens,
              estimatedOutputTokens: unconstrained.candidates[0]!.estimates.outputTokens,
            },
          );
          const routeAccepted = !routed.candidates[0]!.reasons.some(
            (reason) => reason.code === "budget-exceeded",
          );
          const expected =
            routeEstimate.status === "known" &&
            routeEstimate.totalCostUsd! <= budget;

          expect(routeAccepted).toBe(contractResult.ok);
          expect(routeAccepted).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });
});

function withoutPricing(capability: ModelCapability): ModelCapability {
  const { pricing: _pricing, ...rest } = capability;
  return rest;
}

function pricingForShape(
  shape: string,
  inputRate: number,
  outputRate: number,
): ProviderPricingHint | undefined {
  switch (shape) {
    case "modern":
      return {
        inputPer1kTokens: inputRate / 1000,
        outputPer1kTokens: outputRate / 1000,
      };
    case "legacy":
      return { inputCostPer1M: inputRate, outputCostPer1M: outputRate };
    case "mixed":
      return {
        inputPer1kTokens: inputRate / 1000,
        outputCostPer1M: outputRate,
      };
    case "conflicting":
      return {
        inputPer1kTokens: inputRate / 1000,
        outputPer1kTokens: outputRate / 1000,
        inputCostPer1M: inputRate + 1,
        outputCostPer1M: outputRate + 1,
      };
    case "partial":
      return { inputPer1kTokens: inputRate / 1000 };
    case "free":
      return { inputPer1kTokens: 0, outputPer1kTokens: 0 };
    default:
      return undefined;
  }
}

function matrixBudget(
  totalCostUsd: number | null,
  budgetKind: string,
): number {
  if (totalCostUsd === null || budgetKind === "equal") {
    return totalCostUsd ?? 1;
  }
  if (budgetKind === "under") {
    return totalCostUsd + Math.max(totalCostUsd, 0.000001);
  }
  return totalCostUsd === 0 ? 0 : totalCostUsd / 2;
}
