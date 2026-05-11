import { describe, expect, expectTypeOf, it } from "vitest";

import { defaultCapabilityForProvider, effectivePer1kPricing } from "../routing/catalog.js";

import type { ProviderPricingHint, Usage } from "./provider.js";

describe("Phase 7 pricing + Usage", () => {
  it("default catalog populates per-1k pricing fields", () => {
    const cap = defaultCapabilityForProvider("openai");
    expect(cap.pricing?.inputPer1kTokens).toBe(0);
    expect(cap.pricing?.outputPer1kTokens).toBe(0);
  });

  it("effectivePer1kPricing converts legacy per-1M to per-1k", () => {
    const got = effectivePer1kPricing({ inputCostPer1M: 5, outputCostPer1M: 15 });
    expect(got.inputPer1kTokens).toBe(0.005);
    expect(got.outputPer1kTokens).toBe(0.015);
  });

  it("effectivePer1kPricing prefers explicit per-1k over per-1M", () => {
    const got = effectivePer1kPricing({
      inputCostPer1M: 5,
      outputCostPer1M: 15,
      inputPer1kTokens: 0.01,
      outputPer1kTokens: 0.02,
    });
    expect(got.inputPer1kTokens).toBe(0.01);
    expect(got.outputPer1kTokens).toBe(0.02);
  });

  it("effectivePer1kPricing returns undefined for unknown pricing", () => {
    const empty = effectivePer1kPricing(undefined);
    expect(empty.inputPer1kTokens).toBeUndefined();
    expect(empty.outputPer1kTokens).toBeUndefined();

    const partial = effectivePer1kPricing({});
    expect(partial.inputPer1kTokens).toBeUndefined();
    expect(partial.outputPer1kTokens).toBeUndefined();
  });

  it("Usage.costUsd accepts both number and null", () => {
    const u1: Usage = { promptTokens: 10, completionTokens: 20, costUsd: 0.001 };
    const u2: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };
    expectTypeOf(u1.costUsd).toEqualTypeOf<number | null>();
    expect(u2.costUsd).toBeNull();
    expect(u1.costUsd).toBe(0.001);
  });

  it("ProviderPricingHint accepts both legacy and new fields as optional", () => {
    const legacy: ProviderPricingHint = { inputCostPer1M: 5, outputCostPer1M: 15 };
    const modern: ProviderPricingHint = { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015 };
    const both: ProviderPricingHint = {
      inputCostPer1M: 5,
      outputCostPer1M: 15,
      inputPer1kTokens: 0.005,
      outputPer1kTokens: 0.015,
    };
    const empty: ProviderPricingHint = {};
    expect(legacy.inputCostPer1M).toBe(5);
    expect(modern.inputPer1kTokens).toBe(0.005);
    expect(both.outputPer1kTokens).toBe(0.015);
    expect(Object.keys(empty)).toEqual([]);
  });
});
