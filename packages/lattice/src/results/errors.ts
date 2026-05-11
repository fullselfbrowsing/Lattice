import type { TripwireEvidence } from "../contract/tripwire.js";
import type { RouteRejectReason } from "../plan/plan.js";

export interface ValidationIssue {
  readonly message: string;
  readonly path?: readonly (string | number | symbol)[];
}

export interface ValidationError {
  readonly kind: "validation";
  readonly message: string;
  readonly output?: string;
  readonly issues: readonly ValidationIssue[];
}

export interface ExecutionUnavailableError {
  readonly kind: "execution_unavailable";
  readonly message: string;
}

export interface NoRouteError {
  readonly kind: "no_route";
  readonly message: string;
  readonly reasons: readonly string[];
}

export interface ProviderExecutionError {
  readonly kind: "provider_execution";
  readonly message: string;
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface TimeoutError {
  readonly kind: "timeout";
  readonly message: string;
}

/**
 * Phase 7 addition: emitted by the runtime when no candidate route can
 * satisfy the caller-supplied `CapabilityContract` (budget, modality,
 * privacy, or quality-floor invariants).
 *
 * `noRouteReasons` carries the full deterministic-router rejection list
 * so callers can inspect per-candidate detail. Phase 9 (receipts) will
 * persist this array for deterministic verdict reconstruction.
 */
export interface NoContractMatchError {
  readonly kind: "no-contract-match";
  readonly message: string;
  readonly noRouteReasons: readonly RouteRejectReason[];
}

/**
 * Phase 8 addition: emitted when a `CapabilityContract.invariants` tripwire
 * fires after the provider returned a schema-valid output. Carries the
 * `TripwireEvidence` produced by `evaluateTripwires`.
 *
 * `terminal: true` is a structural marker — combined with the `isTerminal()`
 * predicate it tells the fallback chain in `runWithConfig` to refuse retry.
 * `NoContractMatchError` does NOT carry the field (to avoid breaking Phase 7
 * callers) but `isTerminal()` still returns true for it via the kind check.
 */
export interface TripwireViolationError {
  readonly kind: "tripwire-violated";
  readonly message: string;
  readonly invariantId: string;
  readonly evidence: TripwireEvidence;
  readonly terminal: true;
}

export type LatticeRunError =
  | ValidationError
  | ExecutionUnavailableError
  | NoRouteError
  | ProviderExecutionError
  | TimeoutError
  | NoContractMatchError
  | TripwireViolationError;

/**
 * Returns `true` for run errors that MUST NOT be retried by the fallback
 * chain. Phase 8 covers two kinds:
 *
 *   - `tripwire-violated` — the contract's invariants rejected the output;
 *     a different provider will not change the verdict, so retry burns
 *     budget for no gain (T-08-06 in 08-02-PLAN threat register).
 *   - `no-contract-match` — no route satisfies the contract at all; the
 *     run never executed and no retry will help.
 *
 * All other error kinds return `false` and remain eligible for fallback.
 * The predicate is exported so Phase 12's eval gate and any user-side
 * retry wrappers can share one source of truth.
 */
export function isTerminal(error: LatticeRunError): boolean {
  return error.kind === "tripwire-violated" || error.kind === "no-contract-match";
}
