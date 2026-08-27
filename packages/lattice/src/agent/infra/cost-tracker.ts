/** Pure accumulator over per-iteration usage and optional cost estimates. */

import type { BudgetInvariant } from "../../contract/contract.js";
import type { ProviderPricingHint, Usage } from "../../providers/provider.js";
import {
  estimateCost,
  resolveUsageCostUsd,
  type CostEstimate,
} from "../../routing/cost.js";

export type CostBudgetStatus = "ok" | "warning" | "exceeded";

export interface CostTracker {
  readonly kind: "cost-tracker";
  /** Append a per-iteration Usage record. Mutates internal state. */
  recordIteration(usage: Usage, estimate?: CostEstimate): void;
  /** Returns the running sum across all recorded iterations. */
  total(): Usage;
  /** Latest structured estimate observed or derived by the tracker. */
  latestEstimate(): CostEstimate | undefined;
  /**
   * Reports budget status against `contract.budget`:
   *   - "ok" — under 80% of maxCostUsd.
   *   - "warning" — at or over 80% but under 100%.
   *   - "exceeded" — at or over 100% of maxCostUsd.
   * Returns "ok" when no budget is declared or when cumulative cost is null.
   */
  budgetStatus(budget?: BudgetInvariant): CostBudgetStatus;
}

export interface CostTrackerOptions {
  readonly pricing?: ProviderPricingHint;
  readonly onEstimate?: (estimate: CostEstimate) => void;
}

const WARNING_THRESHOLD = 0.8;

export function createCostTracker(options: CostTrackerOptions = {}): CostTracker {
  let promptTokens = 0;
  let completionTokens = 0;
  let costUsd: number | null = null;
  let latestEstimate: CostEstimate | undefined;

  return {
    kind: "cost-tracker" as const,
    recordIteration(usage: Usage, suppliedEstimate?: CostEstimate): void {
      promptTokens += usage.promptTokens;
      completionTokens += usage.completionTokens;
      const derivedEstimate =
        suppliedEstimate ??
        (options.pricing !== undefined
          ? estimateCost({
              pricing: options.pricing,
              inputTokens: usage.promptTokens,
              outputTokens: usage.completionTokens,
            })
          : undefined);
      if (derivedEstimate !== undefined) {
        latestEstimate = derivedEstimate;
        options.onEstimate?.(derivedEstimate);
      }
      const resolvedCost = resolveUsageCostUsd({
        ...(options.pricing !== undefined ? { pricing: options.pricing } : {}),
        ...(usage.costUsd !== null ? { reportedCostUsd: usage.costUsd } : {}),
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
      });
      const effectiveCost = usage.costUsd ?? derivedEstimate?.totalCostUsd ?? resolvedCost;
      if (effectiveCost !== null) {
        costUsd = (costUsd ?? 0) + effectiveCost;
      }
    },
    total(): Usage {
      return { promptTokens, completionTokens, costUsd };
    },
    latestEstimate(): CostEstimate | undefined {
      return latestEstimate;
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
