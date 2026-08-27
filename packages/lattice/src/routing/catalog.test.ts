import { describe, expect, it } from "vitest";

import { effectivePer1kPricing } from "./catalog.js";

describe("effectivePer1kPricing compatibility", () => {
  it("delegates modern, legacy, and per-side precedence to the cost kernel", () => {
    expect(
      effectivePer1kPricing({
        inputPer1kTokens: 0.01,
        inputCostPer1M: 999,
        outputCostPer1M: 5,
      }),
    ).toEqual({
      inputPer1kTokens: 0.01,
      outputPer1kTokens: 0.005,
    });
  });

  it("preserves explicit free rates separately from missing or invalid rates", () => {
    expect(
      effectivePer1kPricing({
        inputPer1kTokens: 0,
        outputPer1kTokens: 0,
      }),
    ).toEqual({ inputPer1kTokens: 0, outputPer1kTokens: 0 });
    expect(effectivePer1kPricing(undefined)).toEqual({
      inputPer1kTokens: undefined,
      outputPer1kTokens: undefined,
    });
    expect(
      effectivePer1kPricing({
        inputPer1kTokens: Number.NaN,
        outputCostPer1M: -1,
      }),
    ).toEqual({
      inputPer1kTokens: undefined,
      outputPer1kTokens: undefined,
    });
  });
});
