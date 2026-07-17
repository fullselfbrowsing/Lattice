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

export type ContextMaterializationFailureReason =
  | "missing-reference"
  | "load-failed"
  | "policy-denied"
  | "summary-failed";

export interface ContextMaterializationError {
  readonly kind: "context_materialization";
  readonly message: string;
  readonly reason: ContextMaterializationFailureReason;
  readonly artifactId?: string;
  readonly sessionId?: string;
  readonly terminal: true;
}

export type PersistenceLifecycleKind =
  | "input"
  | "derived"
  | "tool"
  | "summary"
  | "provider-output"
  | "session";

export interface PersistenceError {
  readonly kind: "persistence";
  readonly message: string;
  readonly operation: "write" | "load";
  readonly lifecycle: PersistenceLifecycleKind;
  readonly artifactId?: string;
  readonly storeId?: string;
  readonly sessionId?: string;
  readonly postProvider: boolean;
  readonly terminal: true;
}

export type AuditErrorCode =
  | "receipt-signer-missing"
  | "receipt-signing-failed";

export type AuditErrorStage = "pre-execution" | "post-execution";

export interface AuditError {
  readonly kind: "audit";
  readonly code: AuditErrorCode;
  readonly stage: AuditErrorStage;
  readonly message: string;
  readonly terminal: true;
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
  | ContextMaterializationError
  | PersistenceError
  | AuditError
  | NoContractMatchError
  | TripwireViolationError;

/**
 * Returns `true` for run errors that MUST NOT be retried by the fallback
 * chain:
 *
 *   - `tripwire-violated` — the contract's invariants rejected the output;
 *     a different provider will not change the verdict, so retry burns
 *     budget for no gain (T-08-06 in 08-02-PLAN threat register).
 *   - `no-contract-match` — no route satisfies the contract at all; the
 *     run never executed and no retry will help.
 *   - `context_materialization` — the selected context could not be made
 *     policy-safe before a provider call.
 *   - `persistence` — replaying cannot repair storage and can duplicate a
 *     provider call when the write failed after execution.
 *
 * All other error kinds return `false` and remain eligible for fallback.
 * The predicate is exported so Phase 12's eval gate and any user-side
 * retry wrappers can share one source of truth.
 */
export function isTerminal(error: LatticeRunError): boolean {
  return (
    error.kind === "tripwire-violated" ||
    error.kind === "no-contract-match" ||
    error.kind === "context_materialization" ||
    error.kind === "persistence" ||
    error.kind === "audit"
  );
}
