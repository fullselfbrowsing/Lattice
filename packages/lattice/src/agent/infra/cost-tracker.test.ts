import { describe, expect, it } from "vitest";

import { COST_ESTIMATOR_VERSION, estimateCost } from "../../routing/cost.js";
import { createCostTracker } from "./cost-tracker.js";

describe("createCostTracker", () => {
  it("starts at zeros with null cost", () => {
    const t = createCostTracker();
    expect(t.total()).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: null });
  });

  it("accumulates promptTokens and completionTokens", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 10, completionTokens: 5, costUsd: 0.001 });
    t.recordIteration({ promptTokens: 4, completionTokens: 2, costUsd: 0.0005 });
    const total = t.total();
    expect(total.promptTokens).toBe(14);
    expect(total.completionTokens).toBe(7);
    expect(total.costUsd).toBeCloseTo(0.0015);
  });

  it("treats null per-iteration cost as 'unmeasured' and preserves overall total when mixed", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: null });
    expect(t.total().costUsd).toBeNull();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: 0.01 });
    expect(t.total().costUsd).toBeCloseTo(0.01);
  });

  it("budgetStatus returns 'ok' when no budget is declared", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: 5 });
    expect(t.budgetStatus(undefined)).toBe("ok");
  });

  it("budgetStatus returns 'ok' below 80%", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: 0.3 });
    expect(t.budgetStatus({ maxCostUsd: 1 })).toBe("ok");
  });

  it("budgetStatus returns 'warning' between 80% and 100%", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: 0.85 });
    expect(t.budgetStatus({ maxCostUsd: 1 })).toBe("warning");
  });

  it("budgetStatus returns 'exceeded' at or over 100%", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: 1.5 });
    expect(t.budgetStatus({ maxCostUsd: 1 })).toBe("exceeded");
  });

  it("budgetStatus returns 'ok' when cumulative cost is null", () => {
    const t = createCostTracker();
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: null });
    expect(t.budgetStatus({ maxCostUsd: 1 })).toBe("ok");
  });

  it("fills null usage cost from configured pricing and preserves reported cost", () => {
    const t = createCostTracker({
      pricing: { inputCostPer1M: 2, outputCostPer1M: 4 },
    });
    t.recordIteration({ promptTokens: 1_000, completionTokens: 500, costUsd: null });
    t.recordIteration({ promptTokens: 1, completionTokens: 1, costUsd: 0.25 });

    expect(t.total().costUsd).toBeCloseTo(0.254, 12);
    expect(t.latestEstimate()).toMatchObject({
      version: COST_ESTIMATOR_VERSION,
      status: "known",
    });
  });

  it("keeps partial pricing unknown for a nonzero dimension", () => {
    const t = createCostTracker({ pricing: { inputPer1kTokens: 0.001 } });
    t.recordIteration({ promptTokens: 1_000, completionTokens: 1, costUsd: null });

    expect(t.total().costUsd).toBeNull();
    expect(t.latestEstimate()).toMatchObject({
      status: "unknown",
      totalCostUsd: null,
    });
  });

  it("accepts a structured estimate diagnostic without changing zero-argument construction", () => {
    const seen: string[] = [];
    const estimate = estimateCost({
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
      inputTokens: 1_000,
      outputTokens: 500,
    });
    const t = createCostTracker({
      onEstimate(value) {
        seen.push(value.version);
      },
    });
    t.recordIteration(
      { promptTokens: 1_000, completionTokens: 500, costUsd: null },
      estimate,
    );

    expect(t.total().costUsd).toBe(estimate.totalCostUsd);
    expect(t.latestEstimate()).toBe(estimate);
    expect(seen).toEqual([COST_ESTIMATOR_VERSION]);
  });
});
