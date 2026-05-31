import { describe, expect, it } from "vitest";

import { evalAgentRun, type AgentRunSnapshot } from "./eval.js";

const baseline: AgentRunSnapshot = {
  iterationsToGoal: 3,
  usage: { promptTokens: 30, completionTokens: 15, costUsd: 0.01 },
};

describe("evalAgentRun", () => {
  it("passes when current is identical to baseline", () => {
    const r = evalAgentRun(baseline, baseline);
    expect(r.ok).toBe(true);
    expect(r.regressions.length).toBe(0);
  });

  it("passes when iterations increase within the limit", () => {
    const r = evalAgentRun(baseline, { ...baseline, iterationsToGoal: 4 });
    expect(r.ok).toBe(true); // +1 within default limit
  });

  it("regresses when iterations exceed the limit", () => {
    const r = evalAgentRun(baseline, { ...baseline, iterationsToGoal: 6 });
    expect(r.ok).toBe(false);
    expect(r.regressions[0]?.kind).toBe("iterations-to-goal");
  });

  it("respects custom iteration limit", () => {
    const r = evalAgentRun(
      baseline,
      { ...baseline, iterationsToGoal: 4 },
      { iterationsToGoalRegressionLimit: 0 },
    );
    expect(r.ok).toBe(false);
  });

  it("passes when cost change is within 10%", () => {
    const r = evalAgentRun(baseline, {
      ...baseline,
      usage: { ...baseline.usage, costUsd: 0.0105 },
    });
    expect(r.ok).toBe(true);
  });

  it("regresses when cost increase exceeds 10%", () => {
    const r = evalAgentRun(baseline, {
      ...baseline,
      usage: { ...baseline.usage, costUsd: 0.02 },
    });
    expect(r.ok).toBe(false);
    expect(r.regressions[0]?.kind).toBe("cost-regression");
  });

  it("respects custom cost limit", () => {
    const r = evalAgentRun(
      baseline,
      { ...baseline, usage: { ...baseline.usage, costUsd: 0.015 } },
      { costUsdRegressionLimit: 0.5 },
    );
    expect(r.ok).toBe(true);
  });

  it("emits mixed-cost-unknown when baseline has cost but current is null", () => {
    const r = evalAgentRun(baseline, {
      ...baseline,
      usage: { ...baseline.usage, costUsd: null },
    });
    expect(r.ok).toBe(false);
    expect(r.regressions[0]?.kind).toBe("mixed-cost-unknown");
  });

  it("does not regress when both snapshots are unmeasured", () => {
    const unmeasured: AgentRunSnapshot = {
      iterationsToGoal: 3,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    };
    const r = evalAgentRun(unmeasured, unmeasured);
    expect(r.ok).toBe(true);
  });

  it("treats baseline=$0 -> current>$0 as a regression", () => {
    const free: AgentRunSnapshot = {
      iterationsToGoal: 3,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    };
    const r = evalAgentRun(free, {
      ...free,
      usage: { ...free.usage, costUsd: 0.0001 },
    });
    expect(r.ok).toBe(false);
    expect(r.regressions[0]?.kind).toBe("cost-regression");
  });

  it("aggregates multiple regressions in one run", () => {
    const r = evalAgentRun(baseline, {
      iterationsToGoal: 10,
      usage: { promptTokens: 100, completionTokens: 50, costUsd: 1.0 },
    });
    expect(r.ok).toBe(false);
    const kinds = r.regressions.map((g) => g.kind);
    expect(kinds).toContain("iterations-to-goal");
    expect(kinds).toContain("cost-regression");
  });
});
