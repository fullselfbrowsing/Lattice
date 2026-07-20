import type { RouteRejectReason } from "../plan/plan.js";
import type { ModelCapability } from "../providers/provider.js";
import { estimateCost, type CostEstimate } from "../routing/cost.js";
import type { CapabilityContract } from "./contract.js";

/**
 * Result of a single pre-flight contract evaluation against a candidate
 * capability. `reasons` is empty when `ok` is true and contains one or more
 * `RouteRejectReason` entries when `ok` is false.
 *
 * The evaluator surfaces all failing reasons in a single pass, not the
 * first-failing only — so the deterministic router can aggregate per-candidate
 * rejection detail.
 */
export interface ContractPreflightResult {
  readonly ok: boolean;
  readonly reasons: readonly RouteRejectReason[];
}

/**
 * Input for the pure cost estimator. Token counts come from the router's
 * route estimate so preflight and router agree on the projected output size.
 */
export interface EstimateRouteCostInput {
  readonly capability: ModelCapability;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}

/**
 * Compatibility scalar estimator. Returns `null` when pricing is unknown and
 * delegates all normalization and arithmetic to the structured cost kernel.
 */
export function estimateRouteCost(input: EstimateRouteCostInput): number | null {
  return estimateRouteCostDetails(input).totalCostUsd;
}

function estimateRouteCostDetails(input: EstimateRouteCostInput): CostEstimate {
  return estimateCost({
    ...(input.capability.pricing !== undefined
      ? { pricing: input.capability.pricing }
      : {}),
    inputTokens: input.estimatedInputTokens,
    outputTokens: input.estimatedOutputTokens,
  });
}

/** Input for the pre-flight evaluator. */
export interface EvaluateContractInput {
  readonly capability: ModelCapability;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}

/**
 * Pure pre-flight evaluator. Callers provide the route's canonical token
 * projection so verdict reconstruction uses the same inputs.
 *
 * Reject taxonomy:
 *  - `contract-budget-exceeded`
 *  - `contract-modality-missing`
 *  - `contract-privacy-mismatch`
 *  - `contract-quality-floor` (reserved for post-execution evaluation)
 */
export function evaluateContractAgainstRoute(
  contract: CapabilityContract | undefined,
  input: EvaluateContractInput,
): ContractPreflightResult {
  if (contract === undefined) {
    return { ok: true, reasons: [] };
  }
  const reasons: RouteRejectReason[] = [];

  if (contract.budget?.maxCostUsd !== undefined) {
    const estimatedCost = estimateRouteCostDetails({
      capability: input.capability,
      estimatedInputTokens: input.estimatedInputTokens,
      estimatedOutputTokens: input.estimatedOutputTokens,
    });
    if (estimatedCost.status === "unknown") {
      reasons.push({
        code: "contract-budget-exceeded",
        message: `${input.capability.modelId} pricing unknown; contract budget declared (maxCostUsd=${contract.budget.maxCostUsd}).`,
      });
    } else if (estimatedCost.totalCostUsd! > contract.budget.maxCostUsd) {
      reasons.push({
        code: "contract-budget-exceeded",
        message: `${input.capability.modelId} estimated ${estimatedCost.totalCostUsd!.toFixed(6)} exceeds contract budget ${contract.budget.maxCostUsd}.`,
      });
    }
  }

  if (contract.requiredModalities !== undefined) {
    for (const modality of contract.requiredModalities) {
      if (
        !input.capability.inputModalities.includes(modality) &&
        !input.capability.outputModalities.includes(modality)
      ) {
        reasons.push({
          code: "contract-modality-missing",
          message: `${input.capability.modelId} does not support required modality ${modality}.`,
        });
      }
    }
  }

  if (contract.requiredPrivacy !== undefined) {
    if (!input.capability.dataPolicy.privacy.includes(contract.requiredPrivacy)) {
      reasons.push({
        code: "contract-privacy-mismatch",
        message: `${input.capability.modelId} does not satisfy contract privacy ${contract.requiredPrivacy}.`,
      });
    }
  }

  // Quality floors require post-execution evidence and are not enforced here.

  return { ok: reasons.length === 0, reasons };
}
