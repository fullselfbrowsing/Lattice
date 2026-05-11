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

export type LatticeRunError =
  | ValidationError
  | ExecutionUnavailableError
  | NoRouteError
  | ProviderExecutionError
  | TimeoutError
  | NoContractMatchError;
