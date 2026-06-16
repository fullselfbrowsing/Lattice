/**
 * Agent runtime type definitions — Phase 19 (v1.2).
 *
 * The agent surface is intentionally distinct from the v1.0 single-shot
 * runtime (`RunIntent` / `RunResult`). The agent loop wraps multiple
 * provider iterations, dispatches tool calls between them, and threads
 * v1.1 capability receipts through Phase 16's `createCheckpointHook` when
 * a signer is configured.
 *
 * Composition surfaces (all optional on `AgentIntent`):
 *   - `pipeline?` — Phase 15 `HookPipeline`; if absent, runtime creates a default.
 *   - `signer?`   — Phase 9 `ReceiptSigner`; if present, auto-registers Phase 16
 *                   checkpoint hook on `BAND.OBSERVABILITY`.
 *   - `tracer?`   — Phase 5 `TracerLike`; flows through pipeline + provider calls.
 *   - `host?`     — Phase 20 `AgentHost` pluggable adapter (forward-declared here;
 *                   default in-process implementation lives in `runtime.ts`).
 *   - `contract?` — Phase 7 `CapabilityContract`; budget.maxIterations + .maxWallTimeMs
 *                   enforced by the loop.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { ArtifactRef } from "../artifacts/artifact.js";
import type { HookPipeline } from "../contract/bands.js";
import type { CapabilityContract } from "../contract/contract.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { InferOutputMap } from "../outputs/infer.js";
import type { PolicySpec } from "../policy/policy.js";
import type { Usage } from "../providers/provider.js";
import type { LatticeRunError } from "../results/errors.js";
import type { ReceiptEnvelope, ReceiptSigner } from "../receipts/types.js";
import type { SurvivabilityAdapter } from "../runtime/survivability.js";
import type { ToolDefinition } from "../tools/tools.js";
import type { TracerLike } from "../tracing/tracing.js";

// Phase 20 (v1.2): the AgentHost forward-decl that shipped in Phase 19 is
// replaced by the full interface in host.ts. Existing imports of AgentHost
// from "./types.js" continue to resolve via this re-export.
export type {
  AgentHost,
  AgentScheduler,
  AgentSnapshot,
  AgentStorage,
  AgentTransport,
} from "./host.js";
import type { AgentHost as _AgentHost } from "./host.js";

/**
 * Per-iteration record stored on `AgentSuccess.iterations` for inspectability.
 *
 * `toolCalls` carries content-addressed args/result hashes (sha256) so
 * downstream receipts can reference them without inlining the bodies.
 *
 * `deniedReason` is populated on iterations whose `BEFORE_AGENT_ITERATION`
 * SAFETY-band handler set `controls.deny(...)`.
 */
export interface IterationRecord {
  readonly index: number;
  readonly provider: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number | null;
  readonly durationMs: number;
  readonly toolCalls: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly argsHash: string;
    readonly resultHash: string;
  }>;
  readonly deniedReason?: string;
  readonly receipt?: ReceiptEnvelope;
}

/**
 * Input shape accepted by `ai.runAgent(intent)`.
 *
 * All fields except `task` and `tools` are optional. The runtime supplies
 * sensible defaults (in-process host, fresh pipeline, no signer, no tracer).
 *
 * `TOutputs` parameterizes the final-answer schema map; defaults to a free-form
 * `{ answer: "text" }` shape when the field is omitted. Validation runs once
 * against the final assistant message (no intermediate iteration validation).
 */
export interface AgentIntent<TOutputs extends OutputContractMap = OutputContractMap> {
  readonly task: string;
  readonly tools: ReadonlyArray<ToolDefinition<StandardSchemaV1>>;
  readonly host?: _AgentHost;
  /**
   * Phase 20 (v1.2): when the agent loop resumes from a host.storage snapshot,
   * the configured SurvivabilityAdapter handles the serialize/deserialize
   * round-trip. When absent, runtime defaults to
   * `createNoopSurvivabilityAdapter<AgentSnapshot>()`.
   */
  readonly survivabilityAdapter?: SurvivabilityAdapter<
    import("./host.js").AgentSnapshot
  >;
  readonly contract?: CapabilityContract;
  readonly policy?: PolicySpec;
  readonly outputs?: TOutputs;
  readonly pipeline?: HookPipeline;
  readonly signer?: ReceiptSigner;
  readonly tracer?: TracerLike;
  /**
   * When `false`, the runtime will NOT auto-register `createCheckpointHook`
   * even if `signer` is provided. Callers who want full manual control over
   * receipt minting set this to `false` and register their own hook.
   * Defaults to `true` (auto-register when signer present).
   */
  readonly autoRegisterCheckpoint?: boolean;
}

/**
 * Success result returned by `ai.runAgent` when the loop reaches a final
 * answer and (when `outputs` is declared) the final answer validates.
 *
 * `iterations[]` records every iteration that ran — including the one that
 * produced the final answer. `receipt` is the outermost receipt minted at
 * loop close when `signer` is configured (separate from per-iteration
 * receipts on `iterations[i].receipt`).
 */
export interface AgentSuccess<TOutputs extends OutputContractMap = OutputContractMap> {
  readonly kind: "success";
  readonly output: InferOutputMap<TOutputs>;
  readonly artifacts?: readonly ArtifactRef[];
  readonly usage: Usage;
  readonly iterations: ReadonlyArray<IterationRecord>;
  readonly receipt?: ReceiptEnvelope;
}

/**
 * Failure kinds specific to the agent loop. v1.1 `LatticeRunError.kind`
 * values remain valid (provider errors, no-contract-match, validation-failed,
 * tripwire-violated) and are reused verbatim. Phase 19 adds three
 * agent-specific kinds. Phase 39 (v1.3) adds `crew-budget-exceeded` —
 * crew-level shared-pool exhaustion, terminal across the parent/child
 * boundary (D-10).
 */
export type AgentFailureKind =
  | LatticeRunError["kind"]
  | "agent-iteration-denied"
  | "agent-max-iterations"
  | "agent-wall-time-exceeded"
  | "crew-budget-exceeded";

/**
 * Failure result returned by `ai.runAgent`. Discriminates via `kind`.
 *
 * `iterations[]` carries any iterations that completed before the failure
 * (empty if the failure occurred pre-iteration). For `agent-iteration-denied`,
 * the failing iteration is the LAST entry and carries `deniedReason`.
 */
export interface AgentFailure {
  readonly kind: AgentFailureKind;
  readonly usage: Usage;
  readonly iterations: ReadonlyArray<IterationRecord>;
  readonly reason?: string;
  readonly cause?: unknown;
  readonly receipt?: ReceiptEnvelope;
}

/**
 * Discriminated union returned by `ai.runAgent`.
 */
export type AgentResult<TOutputs extends OutputContractMap = OutputContractMap> =
  | AgentSuccess<TOutputs>
  | AgentFailure;

/**
 * Typed error raised when a SAFETY-band handler sets `controls.deny(reason)`
 * during `BEFORE_AGENT_ITERATION`. Carries `terminal: true` semantics to
 * align with v1.1 `TripwireViolationError`: the failure is NOT retried by
 * the fallback chain.
 *
 * Surfaced via `AgentFailure { kind: "agent-iteration-denied", reason, ... }`
 * — callers can also catch the typed error if they prefer.
 */
export class AgentDeniedError extends Error {
  readonly kind = "agent-iteration-denied" as const;
  readonly terminal = true as const;
  readonly reason: string;
  readonly iterationIndex: number;

  constructor(reason: string, iterationIndex: number) {
    super(`Agent iteration ${iterationIndex} denied: ${reason}`);
    this.name = "AgentDeniedError";
    this.reason = reason;
    this.iterationIndex = iterationIndex;
  }
}

/**
 * Returned by `formatToolsForProvider` (Phase 19 Plan 19-03). Re-exported
 * here for convenience; the canonical declaration lives in format-tools.ts.
 */
export interface ToolUseRequest {
  readonly id: string;
  readonly name: string;
  readonly args: unknown;
}
