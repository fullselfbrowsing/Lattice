import type { CapabilityModality } from "../providers/provider.js";

/**
 * Budget invariant declaration attached to a CapabilityContract.
 *
 * Phase 7 implements `maxCostUsd` enforcement at pre-flight. The
 * `p95LatencyMs` field is declared per CONTRACT-02 but is informational
 * only in Phase 7 — latency observations are wired in a later phase.
 */
export interface BudgetInvariant {
  readonly maxCostUsd?: number;
  readonly p95LatencyMs?: number;
}

/**
 * Quality-floor invariant.
 *
 * `suite` is a fixture-directory path string; `minScore` is in 0..1.
 * Phase 7 forwards this into the pre-flight evaluator but only enforces
 * capability-side rejects. Full enforcement lives in Phase 12 (`lattice eval`).
 */
export interface QualityFloorInvariant {
  readonly suite: string;
  readonly minScore: number;
}

/**
 * Tripwire invariant declaration — declared in the Phase 7 type surface
 * but NOT evaluated until Phase 8 (tripwire runtime).
 *
 * Kept structural and minimal so Phase 8 can extend without breaking
 * Phase 7 callers.
 */
export interface InvariantDeclaration {
  readonly id: string;
  readonly kind: "policy" | "semantic" | "schema";
  readonly description?: string;
}

/**
 * The full Capability Contract attached to `RunIntent.contract`.
 *
 * All fields are optional. v1.0 callers compile and run unchanged when
 * the field is omitted entirely. PROJECT.md explicitly rejects mandatory
 * contracts.
 */
export interface CapabilityContract {
  readonly kind: "capability-contract";
  readonly budget?: BudgetInvariant;
  readonly invariants?: readonly InvariantDeclaration[];
  readonly qualityFloor?: QualityFloorInvariant;
  readonly requiredModalities?: readonly CapabilityModality[];
  readonly requiredPrivacy?: "standard" | "sensitive" | "restricted";
}

/**
 * Reject-reason taxonomy added to `RouteRejectReason.code` by Phase 7's
 * pre-flight evaluator. Closed four-value union per the locked decisions
 * in 07-CONTEXT.md.
 */
export type ContractRejectReasonCode =
  | "contract-budget-exceeded"
  | "contract-quality-floor"
  | "contract-modality-missing"
  | "contract-privacy-mismatch";

/** Input shape accepted by `contract()`. Mirrors `CapabilityContract` minus `kind`. */
export interface CapabilityContractInput {
  readonly budget?: BudgetInvariant;
  readonly invariants?: readonly InvariantDeclaration[];
  readonly qualityFloor?: QualityFloorInvariant;
  readonly requiredModalities?: readonly CapabilityModality[];
  readonly requiredPrivacy?: "standard" | "sensitive" | "restricted";
}

/**
 * Factory for `CapabilityContract` values.
 *
 * Mirrors the `output()` and adapter factory style — exact-optional safe
 * (does not emit `field: undefined` properties under `exactOptionalPropertyTypes`).
 * Returns a frozen value with frozen nested objects so downstream code can
 * rely on structural immutability when canonicalizing in Phase 9.
 */
export function contract(input: CapabilityContractInput = {}): CapabilityContract {
  return Object.freeze({
    kind: "capability-contract" as const,
    ...(input.budget !== undefined ? { budget: Object.freeze({ ...input.budget }) } : {}),
    ...(input.invariants !== undefined
      ? { invariants: Object.freeze(input.invariants.map((inv) => Object.freeze({ ...inv }))) }
      : {}),
    ...(input.qualityFloor !== undefined
      ? { qualityFloor: Object.freeze({ ...input.qualityFloor }) }
      : {}),
    ...(input.requiredModalities !== undefined
      ? { requiredModalities: Object.freeze([...input.requiredModalities]) }
      : {}),
    ...(input.requiredPrivacy !== undefined ? { requiredPrivacy: input.requiredPrivacy } : {}),
  });
}
