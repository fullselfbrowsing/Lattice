import type { ArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { InferOutputMap } from "../outputs/infer.js";
import type { ResultPlan } from "../plan/plan.js";
import type { Usage } from "../providers/provider.js";
import type { RunEvent } from "../tracing/tracing.js";
import type { LatticeRunError } from "./errors.js";

export interface RunSuccess<TOutputs extends OutputContractMap> {
  readonly ok: true;
  readonly outputs: InferOutputMap<TOutputs>;
  readonly artifacts: readonly ArtifactRef[];
  readonly usage: Usage;
  readonly plan: ResultPlan;
  readonly events?: readonly RunEvent[];
}

export interface RunFailure {
  readonly ok: false;
  readonly error: LatticeRunError;
  readonly usage: Usage;
  readonly raw?: unknown;
  readonly partialOutputs?: Record<string, unknown>;
  readonly plan: ResultPlan;
  readonly events?: readonly RunEvent[];
}

export type RunResult<TOutputs extends OutputContractMap> =
  | RunSuccess<TOutputs>
  | RunFailure;
