import { describe, expect, it } from "vitest";

import { fc } from "../test-support/fast-check.js";
import {
  CANONICAL_PROJECTED_OUTPUT_TOKENS,
  COST_ESTIMATOR_VERSION,
  accumulatedCostExceedsBudget,
  estimateCost,
  resolveUsageCostUsd,
} from "./cost.js";

describe("estimateCost", () => {
  it("uses stable version and canonical projected output constants", () => {
    expect(COST_ESTIMATOR_VERSION).toBe("lattice-cost/v1");
    expect(CANONICAL_PROJECTED_OUTPUT_TOKENS).toBe(512);
  });

  it.each([0, 1, 1_000, 1_000_000])(
    "computes modern per-1k prices at %i tokens",
    (tokens) => {
      const estimate = estimateCost({
        pricing: { inputPer1kTokens: 0.002, outputPer1kTokens: 0.004 },
        inputTokens: tokens,
        outputTokens: tokens,
      });

      expect(estimate.status).toBe("known");
      expect(estimate.totalCostUsd).toBeCloseTo((0.006 * tokens) / 1000, 12);
      expect(estimate.input).toMatchObject({
        status: "known",
        tokenCount: tokens,
        ratePer1kUsd: 0.002,
        source: "per-1k",
        unknownReason: null,
      });
      expect(estimate.output).toMatchObject({
        status: "known",
        tokenCount: tokens,
        ratePer1kUsd: 0.004,
        source: "per-1k",
        unknownReason: null,
      });
    },
  );

  it("normalizes legacy, mixed, and conflicting hints independently", () => {
    const legacy = estimateCost({
      pricing: { inputCostPer1M: 2, outputCostPer1M: 4 },
      inputTokens: 1_000,
      outputTokens: 1_000,
    });
    expect(legacy).toMatchObject({
      status: "known",
      totalCostUsd: 0.006,
      input: { ratePer1kUsd: 0.002, source: "legacy-per-1m" },
      output: { ratePer1kUsd: 0.004, source: "legacy-per-1m" },
    });

    const mixed = estimateCost({
      pricing: { inputPer1kTokens: 0.003, outputCostPer1M: 5 },
      inputTokens: 1_000,
      outputTokens: 1_000,
    });
    expect(mixed).toMatchObject({
      totalCostUsd: 0.008,
      input: { ratePer1kUsd: 0.003, source: "per-1k" },
      output: { ratePer1kUsd: 0.005, source: "legacy-per-1m" },
    });

    const conflicting = estimateCost({
      pricing: {
        inputPer1kTokens: 0.01,
        inputCostPer1M: 999,
        outputPer1kTokens: 0.02,
        outputCostPer1M: 999,
      },
      inputTokens: 1_000,
      outputTokens: 1_000,
    });
    expect(conflicting).toMatchObject({
      totalCostUsd: 0.03,
      input: { ratePer1kUsd: 0.01, source: "per-1k" },
      output: { ratePer1kUsd: 0.02, source: "per-1k" },
    });
  });

  it("distinguishes known free, zero-token missing price, partial unknown, and fully unknown", () => {
    const free = estimateCost({
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
      inputTokens: 10_000,
      outputTokens: 10_000,
    });
    expect(free).toMatchObject({ status: "known", totalCostUsd: 0 });

    const zeroTokenMissing = estimateCost({
      pricing: { inputPer1kTokens: 0.01 },
      inputTokens: 1_000,
      outputTokens: 0,
    });
    expect(zeroTokenMissing).toMatchObject({
      status: "known",
      totalCostUsd: 0.01,
      output: {
        status: "known",
        tokenCount: 0,
        ratePer1kUsd: null,
        costUsd: 0,
        source: "missing",
      },
    });

    const partial = estimateCost({
      pricing: { inputPer1kTokens: 0.01 },
      inputTokens: 1_000,
      outputTokens: 1,
    });
    expect(partial).toMatchObject({
      status: "unknown",
      totalCostUsd: null,
      input: { status: "known", costUsd: 0.01 },
      output: {
        status: "unknown",
        costUsd: null,
        unknownReason: "missing-rate",
      },
    });
    expect(partial.unknownReasons).toEqual(["missing-rate"]);

    const unknown = estimateCost({ inputTokens: 1, outputTokens: 1 });
    expect(unknown.status).toBe("unknown");
    expect(unknown.totalCostUsd).toBeNull();
    expect(unknown.input.source).toBe("missing");
    expect(unknown.output.source).toBe("missing");
  });

  it.each([
    {
      name: "negative input tokens",
      input: { inputTokens: -1, outputTokens: 1, pricing: { inputPer1kTokens: 1, outputPer1kTokens: 1 } },
      reason: "invalid-token-count",
    },
    {
      name: "non-finite output tokens",
      input: { inputTokens: 1, outputTokens: Number.POSITIVE_INFINITY, pricing: { inputPer1kTokens: 1, outputPer1kTokens: 1 } },
      reason: "invalid-token-count",
    },
    {
      name: "negative preferred rate",
      input: { inputTokens: 1, outputTokens: 1, pricing: { inputPer1kTokens: -1, outputPer1kTokens: 1 } },
      reason: "invalid-rate",
    },
    {
      name: "non-finite legacy rate",
      input: { inputTokens: 1, outputTokens: 1, pricing: { inputCostPer1M: Number.NaN, outputCostPer1M: 1 } },
      reason: "invalid-rate",
    },
  ])("returns a bounded unknown estimate for $name", ({ input, reason }) => {
    const estimate = estimateCost(input);
    expect(estimate.status).toBe("unknown");
    expect(estimate.totalCostUsd).toBeNull();
    expect(estimate.unknownReasons).toContain(reason);
    expect(JSON.stringify(estimate)).not.toMatch(/NaN|Infinity/u);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      pricing: { inputPer1kTokens: 0.004, outputCostPer1M: 12 },
      inputTokens: 123_456,
      outputTokens: 789,
    } as const;
    expect(estimateCost(input)).toEqual(estimateCost(input));
  });

  it("keeps reported usage cost authoritative and otherwise uses known static pricing", () => {
    expect(
      resolveUsageCostUsd({
        pricing: { inputPer1kTokens: 999, outputPer1kTokens: 999 },
        inputTokens: 1_000,
        outputTokens: 1_000,
        reportedCostUsd: 0.25,
      }),
    ).toBe(0.25);
    expect(
      resolveUsageCostUsd({
        pricing: { inputCostPer1M: 2, outputCostPer1M: 4 },
        inputTokens: 1_000,
        outputTokens: 500,
      }),
    ).toBe(0.004);
    expect(resolveUsageCostUsd({ inputTokens: 0, outputTokens: 0 })).toBeNull();
  });

  it("allows one-ULP accumulation noise but rejects a material overage", () => {
    expect(accumulatedCostExceedsBudget(0.1 + 0.05, 0.15)).toBe(false);
    expect(accumulatedCostExceedsBudget(0.151, 0.15)).toBe(true);
  });

  it("property: equivalent modern and legacy units produce identical costs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          inputRatePer1M: fc.integer({ min: 0, max: 1_000_000 }),
          outputRatePer1M: fc.integer({ min: 0, max: 1_000_000 }),
          inputTokens: fc.integer({ min: 0, max: 1_000_000 }),
          outputTokens: fc.integer({ min: 0, max: 1_000_000 }),
        }),
        async (sample) => {
          const legacy = estimateCost({
            pricing: {
              inputCostPer1M: sample.inputRatePer1M,
              outputCostPer1M: sample.outputRatePer1M,
            },
            inputTokens: sample.inputTokens,
            outputTokens: sample.outputTokens,
          });
          const modern = estimateCost({
            pricing: {
              inputPer1kTokens: sample.inputRatePer1M / 1000,
              outputPer1kTokens: sample.outputRatePer1M / 1000,
            },
            inputTokens: sample.inputTokens,
            outputTokens: sample.outputTokens,
          });

          expect(modern.status).toBe("known");
          expect(legacy.status).toBe("known");
          expect(modern.totalCostUsd).toBe(legacy.totalCostUsd);
          expect(modern.input.costUsd).toBe(legacy.input.costUsd);
          expect(modern.output.costUsd).toBe(legacy.output.costUsd);
          expect(Number.isFinite(modern.totalCostUsd)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
