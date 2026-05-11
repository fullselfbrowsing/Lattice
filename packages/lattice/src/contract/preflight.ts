import type { RouteRejectReason } from "../plan/plan.js";
import type { ModelCapability } from "../providers/provider.js";
import { effectivePer1kPricing } from "../routing/catalog.js";
import type { CapabilityContract } from "./contract.js";

/**
 * Result of a single pre-flight contract evaluation against a candidate
 * capability. `reasons` is empty when `ok` is true and contains one or more
 * `RouteRejectReason` entries when `ok` is false.
 *
 * The evaluator surfaces ALL failing reasons in a single pass — not the
 * first-failing only — so the deterministic router can aggregate per-candidate
 * rejection detail (CONTEXT.md "Pre-flight surfaces ALL failed candidates
 * with per-candidate rejection reasons").
 */
export interface ContractPreflightResult {
  readonly ok: boolean;
  readonly reasons: readonly RouteRejectReason[];
}

/**
 * Input for the pure cost estimator. Token counts come from the router's
 * existing `estimateRoute()` helper so preflight and router agree on the
 * projected output size (one source of truth — see `evaluateContractAgainstRoute`).
 */
export interface EstimateRouteCostInput {
  readonly capability: ModelCapability;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}

/**
 * Pure cost estimator. Returns `null` when pricing is unknown (so downstream
 * gates can distinguish "free / zero" from "unmeasured" per the Phase 7
 * cost-normalization decision). Uses static catalog metadata only — no probes,
 * no external pricing APIs.
 */
export function estimateRouteCost(input: EstimateRouteCostInput): number | null {
  const { inputPer1kTokens, outputPer1kTokens } = effectivePer1kPricing(
    input.capability.pricing,
  );
  if (inputPer1kTokens === undefined && outputPer1kTokens === undefined) {
    return null;
  }
  const inputCost = ((inputPer1kTokens ?? 0) * input.estimatedInputTokens) / 1000;
  const outputCost = ((outputPer1kTokens ?? 0) * input.estimatedOutputTokens) / 1000;
  return inputCost + outputCost;
}

/** Input for the pre-flight evaluator. */
export interface EvaluateContractInput {
  readonly capability: ModelCapability;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}

/**
 * Pure pre-flight evaluator. Phase 9 receipts will reuse this for deterministic
 * verdict reconstruction.
 *
 * Token estimation: Phase 7 does NOT define a separate token estimator. Output-
 * token projection is the canonical responsibility of the router's existing
 * `estimateRoute()` helper (in `routing/router.ts`), which already produces an
 * `estimatedOutputTokens` value. The router passes that same value into this
 * evaluator via `EvaluateContractInput.estimatedOutputTokens`, so preflight
 * and the router always agree on the projected output size. Phase 9 receipts
 * will pin the router's estimate as the deterministic input — intentionally
 * one source of truth.
 *
 * Reject taxonomy (Phase 7 emits three of four codes):
 *  - `contract-budget-exceeded` (CONTRACT-04 + COST-03)
 *  - `contract-modality-missing` (CONTRACT-06)
 *  - `contract-privacy-mismatch` (CONTRACT-06)
 *  - `contract-quality-floor` (reserved for Phase 12 `lattice eval`; NEVER emitted here)
 */
export function evaluateContractAgainstRoute(
  contract: CapabilityContract | undefined,
  input: EvaluateContractInput,
): ContractPreflightResult {
  if (contract === undefined) {
    return { ok: true, reasons: [] };
  }
  const reasons: RouteRejectReason[] = [];

  // BUDGET — CONTRACT-04 + COST-03
  if (contract.budget?.maxCostUsd !== undefined) {
    const estimatedCost = estimateRouteCost({
      capability: input.capability,
      estimatedInputTokens: input.estimatedInputTokens,
      estimatedOutputTokens: input.estimatedOutputTokens,
    });
    if (estimatedCost === null) {
      reasons.push({
        code: "contract-budget-exceeded",
        message: `${input.capability.modelId} pricing unknown; contract budget declared (maxCostUsd=${contract.budget.maxCostUsd}).`,
      });
    } else if (estimatedCost > contract.budget.maxCostUsd) {
      reasons.push({
        code: "contract-budget-exceeded",
        message: `${input.capability.modelId} estimated ${estimatedCost.toFixed(6)} exceeds contract budget ${contract.budget.maxCostUsd}.`,
      });
    }
  }

  // MODALITY — CONTRACT-06 (contract-modality-missing)
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

  // PRIVACY — CONTRACT-06 (contract-privacy-mismatch)
  if (contract.requiredPrivacy !== undefined) {
    if (!input.capability.dataPolicy.privacy.includes(contract.requiredPrivacy)) {
      reasons.push({
        code: "contract-privacy-mismatch",
        message: `${input.capability.modelId} does not satisfy contract privacy ${contract.requiredPrivacy}.`,
      });
    }
  }

  // QUALITY FLOOR — declared but NOT enforced on the capability side in Phase 7.
  // CONTEXT.md: "qualityFloor is parsed and forwarded into the pre-flight
  // evaluator but only enforced by Phase 12's lattice eval".
  // The reject code "contract-quality-floor" stays reserved for Phase 12.

  return { ok: reasons.length === 0, reasons };
}
