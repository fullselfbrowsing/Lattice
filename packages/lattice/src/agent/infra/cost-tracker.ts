/**
 * CostTracker — Phase 21 (v1.2).
 *
 * Pure accumulator over per-iteration `Usage`. Standalone (no dependency
 * on the agent runtime); callers can plug it in via a hook handler or
 * read it after a run completes.
 */

import type { BudgetInvariant } from "../../contract/contract.js";
import type { Usage } from "../../providers/provider.js";

export type CostBudgetStatus = "ok" | "warning" | "exceeded";

export interface CostTracker {
  readonly kind: "cost-tracker";
  /** Append a per-iteration Usage record. Mutates internal state. */
  recordIteration(usage: Usage): void;
  /** Returns the running sum across all recorded iterations. */
  total(): Usage;
  /**
   * Reports budget status against `contract.budget`:
   *   - "ok" — under 80% of maxCostUsd.
   *   - "warning" — at or over 80% but under 100%.
   *   - "exceeded" — at or over 100% of maxCostUsd.
   * Returns "ok" when no budget is declared or when cumulative cost is null.
   */
  budgetStatus(budget?: BudgetInvariant): CostBudgetStatus;
}

const WARNING_THRESHOLD = 0.8;

export function createCostTracker(): CostTracker {
  let promptTokens = 0;
  let completionTokens = 0;
  let costUsd: number | null = null;

  return {
    kind: "cost-tracker" as const,
    recordIteration(usage: Usage): void {
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      if (usage.costUsd !== null) {
        costUsd = (costUsd ?? 0) + usage.costUsd;
      }
    },
    total(): Usage {
      return { promptTokens, completionTokens, costUsd };
    },
    budgetStatus(budget?: BudgetInvariant): CostBudgetStatus {
      const max = budget?.maxCostUsd;
      if (max === undefined || costUsd === null) return "ok";
      if (costUsd >= max) return "exceeded";
      if (costUsd >= max * WARNING_THRESHOLD) return "warning";
      return "ok";
    },
  };
}
