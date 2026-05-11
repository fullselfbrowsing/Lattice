import { describe, expect, it } from "vitest";

import type { ModelCapability } from "../providers/provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import { contract } from "./contract.js";
import {
  estimateRouteCost,
  evaluateContractAgainstRoute,
} from "./preflight.js";

function baseCapability(overrides: Partial<ModelCapability> = {}): ModelCapability {
  return {
    ...defaultCapabilityForProvider("test"),
    ...overrides,
  };
}

describe("evaluateContractAgainstRoute", () => {
  it("Test 1: budget pass — pricing comfortably under the declared budget returns ok=true", () => {
    const capability = baseCapability({
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    });
    const result = evaluateContractAgainstRoute(
      contract({ budget: { maxCostUsd: 1.0 } }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("Test 2: budget fail — estimated cost over budget surfaces contract-budget-exceeded", () => {
    const capability = baseCapability({
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    });
    const result = evaluateContractAgainstRoute(
      contract({ budget: { maxCostUsd: 0.00001 } }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "contract-budget-exceeded")).toBe(true);
  });

  it("Test 3: budget unpriced with budget declared — rejects with 'pricing unknown' message", () => {
    const capability = baseCapability({ pricing: undefined });
    const result = evaluateContractAgainstRoute(
      contract({ budget: { maxCostUsd: 0.05 } }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(false);
    const reason = result.reasons.find((r) => r.code === "contract-budget-exceeded");
    expect(reason).toBeDefined();
    expect(reason?.message.toLowerCase()).toContain("pricing unknown");
  });

  it("Test 4: budget unpriced with no budget declared — ok=true", () => {
    const capability = baseCapability({ pricing: undefined });
    const result = evaluateContractAgainstRoute(contract({}), {
      capability,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 256,
    });
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("Test 5: qualityFloor declared but NEVER emits contract-quality-floor in Phase 7", () => {
    const capability = baseCapability({
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    });
    const result = evaluateContractAgainstRoute(
      contract({ qualityFloor: { suite: "fixtures/x", minScore: 0.99 } }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(true);
    expect(result.reasons.some((r) => r.code === "contract-quality-floor")).toBe(false);
  });

  it("Test 6: required modality missing — rejects with contract-modality-missing", () => {
    const capability = baseCapability({
      inputModalities: ["text", "json"],
      outputModalities: ["text"],
    });
    const result = evaluateContractAgainstRoute(
      contract({ requiredModalities: ["image"] }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "contract-modality-missing")).toBe(true);
  });

  it("Test 7: required privacy not satisfied — rejects with contract-privacy-mismatch", () => {
    const capability = baseCapability({
      dataPolicy: {
        privacy: ["standard", "sensitive"],
        uploadRetention: "none",
        supportsNoLogging: true,
        supportsNoTraining: true,
      },
    });
    const result = evaluateContractAgainstRoute(
      contract({ requiredPrivacy: "restricted" }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "contract-privacy-mismatch")).toBe(true);
  });

  it("Test 8: surfaces ALL failures — both budget and modality rejected in a single evaluation", () => {
    const capability = baseCapability({
      pricing: { inputPer1kTokens: 1.0, outputPer1kTokens: 1.0 },
      inputModalities: ["text"],
      outputModalities: ["text"],
    });
    const result = evaluateContractAgainstRoute(
      contract({
        budget: { maxCostUsd: 0.000001 },
        requiredModalities: ["video"],
      }),
      { capability, estimatedInputTokens: 100, estimatedOutputTokens: 256 },
    );
    expect(result.ok).toBe(false);
    expect(result.reasons.some((r) => r.code === "contract-budget-exceeded")).toBe(true);
    expect(result.reasons.some((r) => r.code === "contract-modality-missing")).toBe(true);
  });

  it("Test 9: no contract — early return ok=true with empty reasons", () => {
    const capability = baseCapability();
    const result = evaluateContractAgainstRoute(undefined, {
      capability,
      estimatedInputTokens: 100,
      estimatedOutputTokens: 256,
    });
    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("Test 10: estimateRouteCost computes per-1k pricing and returns null for unpriced", () => {
    const priced = baseCapability({
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    });
    const cost = estimateRouteCost({
      capability: priced,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 256,
    });
    // 1000/1000 * 0.001 + 256/1000 * 0.002 = 0.001 + 0.000512 = 0.001512
    expect(cost).not.toBeNull();
    expect(cost).toBeCloseTo(0.001512, 6);

    const unpriced = baseCapability({ pricing: undefined });
    const noCost = estimateRouteCost({
      capability: unpriced,
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 256,
    });
    expect(noCost).toBeNull();
  });
});
