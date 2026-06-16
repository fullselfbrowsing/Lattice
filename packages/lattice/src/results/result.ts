import type { ArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { InferOutputMap } from "../outputs/infer.js";
import type { ResultPlan } from "../plan/plan.js";
import type { ProviderGatewayMetadata, Usage } from "../providers/provider.js";
import type { ReceiptEnvelope } from "../receipts/types.js";
import type { RunEvent } from "../tracing/tracing.js";
import type { LatticeRunError } from "./errors.js";

export interface RunSuccess<TOutputs extends OutputContractMap> {
  readonly ok: true;
  readonly outputs: InferOutputMap<TOutputs>;
  readonly artifacts: readonly ArtifactRef[];
  readonly usage: Usage;
  readonly plan: ResultPlan;
  readonly events?: readonly RunEvent[];
  readonly gateway?: ProviderGatewayMetadata;
  /**
   * Phase 9 — signed capability receipt issued when `LatticeConfig.signer`
   * is configured. Undefined when no signer is set.
   */
  readonly receipt?: ReceiptEnvelope;
}

export interface RunFailure {
  readonly ok: false;
  readonly error: LatticeRunError;
  readonly usage: Usage;
  readonly raw?: unknown;
  readonly partialOutputs?: Record<string, unknown>;
  readonly plan: ResultPlan;
  readonly events?: readonly RunEvent[];
  readonly gateway?: ProviderGatewayMetadata;
  /**
   * Phase 9 — signed capability receipt issued when `LatticeConfig.signer`
   * is configured. Undefined when no signer is set.
   */
  readonly receipt?: ReceiptEnvelope;
}

export type RunResult<TOutputs extends OutputContractMap> =
  | RunSuccess<TOutputs>
  | RunFailure;
