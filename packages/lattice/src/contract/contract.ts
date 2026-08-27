import type { CapabilityModality } from "../providers/provider.js";

export type {
  FieldFromTableInvariant,
  InvariantDeclaration,
  MatchesInvariant,
  MustCiteInvariant,
  NoPiiInvariant,
} from "./invariants.js";

// Local alias so the union can be referenced in this module without
// re-importing through the public re-export above.
import type { InvariantDeclaration as InvariantDeclarationUnion } from "./invariants.js";

/**
 * Budget invariant declaration attached to a CapabilityContract.
 *
 * `maxCostUsd` is enforced at preflight. `p95LatencyMs` is informational
 * until the runtime has route-level latency observations.
 *
 * `maxIterations` and `maxWallTimeMs` bound the agent
 * runtime. Both are additive and optional; non-agent callers ignore them.
 * `maxIterations` caps the number of `runAgent` iterations; `maxWallTimeMs`
 * caps wall-clock duration per `runAgent` invocation. Both are enforced
 * pre-iteration in the agent loop.
 */
export interface BudgetInvariant {
  readonly maxCostUsd?: number;
  readonly maxIterations?: number;
  readonly maxWallTimeMs?: number;
  readonly p95LatencyMs?: number;
}

/**
 * Quality-floor invariant.
 *
 * `suite` is a fixture-directory path string; `minScore` is in 0..1.
 * Preflight only enforces capability-side rejects; `lattice eval` enforces
 * the score after execution.
 */
export interface QualityFloorInvariant {
  readonly suite: string;
  readonly minScore: number;
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
  readonly invariants?: readonly InvariantDeclarationUnion[];
  readonly qualityFloor?: QualityFloorInvariant;
  readonly requiredModalities?: readonly CapabilityModality[];
  readonly requiredPrivacy?: "standard" | "sensitive" | "restricted";
}

/**
 * Closed reject-reason taxonomy used by the preflight evaluator and
 * `RouteRejectReason.code`.
 */
export type ContractRejectReasonCode =
  | "contract-budget-exceeded"
  | "contract-quality-floor"
  | "contract-modality-missing"
  | "contract-privacy-mismatch";

/** Input shape accepted by `contract()`. Mirrors `CapabilityContract` minus `kind`. */
export interface CapabilityContractInput {
  readonly budget?: BudgetInvariant;
  readonly invariants?: readonly InvariantDeclarationUnion[];
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
 * rely on structural immutability during canonicalization.
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
