/**
 * evalAgentRun — Phase 22 (v1.2).
 *
 * Pure helper that gates a baseline-relative regression on iterations-to-goal
 * and total cost for an agent run. Standalone (no I/O). Callers wire fixture
 * discovery + persistence themselves; this kernel is the comparison engine.
 *
 * The shape mirrors the existing v1.1 `lattice eval` cost-regression contract
 * so a future `lattice eval --agent` CLI subcommand can reuse the same gate.
 */

import type { Usage } from "../providers/provider.js";

/**
 * Summary of an agent run sufficient for regression analysis. Callers
 * typically derive this from an `AgentSuccess` via `iterations.length` and
 * cumulative `usage`. The schema is intentionally minimal so callers can
 * persist + load it across runs without dragging the full ReplayEnvelope.
 */
export interface AgentRunSnapshot {
  readonly iterationsToGoal: number;
  readonly usage: Usage;
}

export interface EvalOptions {
  /**
   * Maximum tolerated INCREASE in iterations-to-goal versus the baseline.
   * Default 1 (one extra iteration tolerated). Set to 0 to require parity.
   */
  readonly iterationsToGoalRegressionLimit?: number;
  /**
   * Maximum tolerated FRACTIONAL cost increase versus the baseline.
   * Default 0.10 (10% increase tolerated). Compared as
   * `(current - baseline) / baseline`. Cost regressions are only
   * considered when BOTH snapshots have a non-null `costUsd`; mixed-cost
   * snapshots emit a `mixed-cost-unknown` regression so callers can decide
   * how to handle them.
   */
  readonly costUsdRegressionLimit?: number;
}

export type EvalRegressionKind =
  | "iterations-to-goal"
  | "cost-regression"
  | "mixed-cost-unknown";

export interface EvalRegression {
  readonly kind: EvalRegressionKind;
  readonly baseline: number | null;
  readonly current: number | null;
  readonly limit: number;
  readonly message: string;
}

export interface AgentEvalResult {
  readonly ok: boolean;
  readonly regressions: ReadonlyArray<EvalRegression>;
}

export function evalAgentRun(
  baseline: AgentRunSnapshot,
  current: AgentRunSnapshot,
  options: EvalOptions = {},
): AgentEvalResult {
  const iterLimit = options.iterationsToGoalRegressionLimit ?? 1;
  const costLimit = options.costUsdRegressionLimit ?? 0.1;
  const regressions: EvalRegression[] = [];

  // Iterations-to-goal regression.
  const iterDelta = current.iterationsToGoal - baseline.iterationsToGoal;
  if (iterDelta > iterLimit) {
    regressions.push({
      kind: "iterations-to-goal",
      baseline: baseline.iterationsToGoal,
      current: current.iterationsToGoal,
      limit: iterLimit,
      message: `Iterations-to-goal ${current.iterationsToGoal} exceeds baseline ${baseline.iterationsToGoal} by ${iterDelta} (limit: ${iterLimit}).`,
    });
  }

  // Cost regression.
  const bCost = baseline.usage.costUsd;
  const cCost = current.usage.costUsd;
  if (bCost === null && cCost === null) {
    // Both unmeasured — no signal, no regression.
  } else if (bCost === null || cCost === null) {
    regressions.push({
      kind: "mixed-cost-unknown",
      baseline: bCost,
      current: cCost,
      limit: costLimit,
      message: `Cost mixed: baseline=${bCost} current=${cCost}; cannot compare regression.`,
    });
  } else if (bCost > 0) {
    const ratio = (cCost - bCost) / bCost;
    if (ratio > costLimit) {
      regressions.push({
        kind: "cost-regression",
        baseline: bCost,
        current: cCost,
        limit: costLimit,
        message: `Cost regression: $${cCost.toFixed(6)} vs baseline $${bCost.toFixed(6)} (+${(ratio * 100).toFixed(1)}%; limit ${(costLimit * 100).toFixed(1)}%).`,
      });
    }
  } else if (bCost === 0 && cCost > 0) {
    // Baseline is free; any positive cost is a regression by definition.
    regressions.push({
      kind: "cost-regression",
      baseline: bCost,
      current: cCost,
      limit: costLimit,
      message: `Cost regression: baseline was $0; current $${cCost.toFixed(6)}.`,
    });
  }

  return {
    ok: regressions.length === 0,
    regressions: Object.freeze(regressions),
  };
}
