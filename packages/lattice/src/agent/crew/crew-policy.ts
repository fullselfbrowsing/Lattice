/**
 * CrewPolicy — Phase 39 (v1.3). Crew-level policy contract + normalizer
 * (D-06, D-11, D-16).
 *
 * `CrewPolicy.budget` reuses `BudgetInvariant` verbatim from
 * `contract/contract.ts` (D-06) — the crew-level shared pool. Structural
 * caps (`maxTotalIterations`, `maxIterationsPerAgent`,
 * `maxConcurrentChildren`, `maxDepth`) bound the crew shape independently
 * of cost.
 *
 * v1.3 executes children serially (D-11): the `maxConcurrentChildren`
 * field exists for forward compatibility but `validateCrewPolicy` rejects
 * values > 1 with a `TypeError` at entry (fail-fast, research Pattern 5 —
 * reject, not clamp, per the project's "explicit config, no magic" stance).
 *
 * `limits` is keyed by `adapter.id` and overrides the rate-limit-group
 * defaults per provider key (D-16). `coordination: "unmanaged"` is the
 * explicit escape hatch for consumers who handle 429s themselves.
 *
 * `validateCrewPolicy` follows the `contract()` factory template
 * (contract/contract.ts): conditional spread for optional members
 * (`exactOptionalPropertyTypes`-safe), `Object.freeze` on the result and
 * nested objects, input never mutated.
 */

import type { BudgetInvariant } from "../../contract/contract.js";

/** Per-adapter rate-limit override (keyed by `adapter.id` in `limits`). */
export interface CrewRateLimitOverride {
  readonly requestsPerMinute?: number;
  readonly tokensPerMinute?: number;
}

/** Crew-level policy contract (D-06, D-11, D-16). */
export interface CrewPolicy {
  /** Crew-level shared budget pool — `BudgetInvariant` reused verbatim. */
  readonly budget?: BudgetInvariant;
  readonly maxTotalIterations?: number;
  readonly maxIterationsPerAgent?: number;
  /** Forward-compat field; the v1.3 runtime rejects values > 1 (D-11). */
  readonly maxConcurrentChildren?: number;
  /** Delegation depth cap; defaults to 1 (parent→child only, D-05). */
  readonly maxDepth?: number;
  /** Per-adapter-id rate-limit overrides (D-16). */
  readonly limits?: Readonly<Record<string, CrewRateLimitOverride>>;
  /** "managed" (default) wraps transports in the rate-limit group; "unmanaged" skips it. */
  readonly coordination?: "managed" | "unmanaged";
}

/**
 * Normalized policy returned by `validateCrewPolicy`: defaults applied,
 * structurally frozen.
 */
export interface ValidatedCrewPolicy extends CrewPolicy {
  readonly maxConcurrentChildren: number;
  readonly maxDepth: number;
  readonly coordination: "managed" | "unmanaged";
}

/**
 * Validates and normalizes a `CrewPolicy`.
 *
 * - Applies defaults: `maxDepth: 1`, `maxConcurrentChildren: 1`,
 *   `coordination: "managed"`.
 * - Throws `TypeError` when `maxConcurrentChildren > 1` (serial-only v1.3
 *   limit, D-11) or when any structural cap is a non-integer or < 1.
 * - Returns a frozen normalized policy; the input is never mutated.
 */
export function validateCrewPolicy(policy: CrewPolicy = {}): ValidatedCrewPolicy {
  assertStructuralCap("maxConcurrentChildren", policy.maxConcurrentChildren);
  if (policy.maxConcurrentChildren !== undefined && policy.maxConcurrentChildren > 1) {
    throw new TypeError(
      "CrewPolicy.maxConcurrentChildren > 1 is not supported in v1.3 — children execute serially (D-11).",
    );
  }
  assertStructuralCap("maxDepth", policy.maxDepth);
  assertStructuralCap("maxTotalIterations", policy.maxTotalIterations);
  assertStructuralCap("maxIterationsPerAgent", policy.maxIterationsPerAgent);

  return Object.freeze({
    ...(policy.budget !== undefined ? { budget: Object.freeze({ ...policy.budget }) } : {}),
    ...(policy.maxTotalIterations !== undefined
      ? { maxTotalIterations: policy.maxTotalIterations }
      : {}),
    ...(policy.maxIterationsPerAgent !== undefined
      ? { maxIterationsPerAgent: policy.maxIterationsPerAgent }
      : {}),
    maxConcurrentChildren: policy.maxConcurrentChildren ?? 1,
    maxDepth: policy.maxDepth ?? 1,
    ...(policy.limits !== undefined
      ? {
          limits: Object.freeze(
            Object.fromEntries(
              Object.entries(policy.limits).map(([adapterId, override]) => [
                adapterId,
                Object.freeze({ ...override }),
              ]),
            ),
          ),
        }
      : {}),
    coordination: policy.coordination ?? "managed",
  });
}

function assertStructuralCap(field: string, value: number | undefined): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(
      `CrewPolicy.${field} must be a positive integer (>= 1); received ${String(value)}.`,
    );
  }
}
