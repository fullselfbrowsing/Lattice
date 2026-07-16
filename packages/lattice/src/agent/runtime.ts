/**
 * runAgent — Phase 19 (v1.2).
 *
 * The agent-loop orchestrator. Wraps multiple provider iterations under one
 * `ai.runAgent(intent)` call. Each iteration:
 *
 *   1. Budget pre-check (maxIterations, maxWallTimeMs, maxCostUsd).
 *   2. Emit BEFORE_AGENT_ITERATION through the hook pipeline; check
 *      `pipeline.lastDenialReason()` for SAFETY-band veto.
 *   3. Build the provider request via formatToolsForProvider.buildTask().
 *   4. Call the sticky provider's `execute()` (or pick first provider on
 *      iteration 0).
 *   5. Parse tool-use envelopes from the response. If absent, the response
 *      is a final answer: validate against `intent.outputs` (if declared)
 *      and exit with AgentSuccess.
 *   6. If tool-use envelopes are present: dispatch each via `runTool`,
 *      append assistant + tool-result turns to the conversation, record an
 *      IterationRecord, emit AFTER_AGENT_ITERATION, continue.
 *
 * Composition surfaces (all optional on AgentIntent):
 *
 *   - `pipeline?` — Phase 15 HookPipeline; runtime creates one if absent.
 *   - `signer?`   — Phase 9 ReceiptSigner; when present AND
 *                   `autoRegisterCheckpoint !== false`, the runtime
 *                   auto-registers `createCheckpointHook` on
 *                   BAND.OBSERVABILITY for per-iteration receipts.
 *   - `tracer?`   — Phase 5 TracerLike; flows through pipeline.
 *   - `outputs?`  — final-answer schema map; validated only on the final
 *                   assistant message (no intermediate validation).
 *   - `contract?` — Phase 7 CapabilityContract; budget invariants are
 *                   enforced pre-iteration.
 */

import type { ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import { BAND, type HookPipeline, createHookPipeline } from "../contract/bands.js";
import { createCheckpointHook } from "../contract/checkpoint.js";
import type { LatticeConfig } from "./../runtime/config.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { validateOutputMapValues } from "../outputs/validate.js";
import type { ProviderAdapter, ProviderRunResponse, Usage } from "../providers/provider.js";
import { createNoopSurvivabilityAdapter, type SurvivabilityAdapter } from "../runtime/survivability.js";
import { runTool, type ToolCallResult } from "../tools/tools.js";

import { formatToolsForProvider, type ConversationTurn } from "./format-tools.js";
import {
  createNoopAgentHost,
  type AgentHost,
  type AgentSnapshot,
} from "./host.js";
import {
  AgentDeniedError,
  type DefaultAgentOutputs,
  type AgentFailure,
  type AgentIntent,
  type AgentResult,
  type IterationRecord,
  type ToolUseRequest,
} from "./types.js";

const ZERO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };
const DEFAULT_AGENT_OUTPUTS: DefaultAgentOutputs = { answer: "text" };

/**
 * Context handed to an injected `dispatchToolUse` seam (Phase 39, internal).
 * Carries the loop position plus read-only views of the live conversation
 * and the hook pipeline so a crew dispatcher can run its own pipeline
 * events around child execution.
 */
export interface DispatchToolUseContext {
  readonly iterationIndex: number;
  readonly conversation: readonly ConversationTurn[];
  readonly pipeline: HookPipeline;
}

/**
 * Internal (in-package only — NOT re-exported from src/index.ts) options
 * for `runAgentInternal`. Phase 39 (v1.3) adds the injectable tool-use
 * dispatch seam the CrewDispatcher (39-05) routes child-agent calls
 * through.
 *
 * Semantics: for each `ToolUseRequest` in step 4g, when `dispatchToolUse`
 * is present it is consulted FIRST. If it resolves `{ content }`, that
 * content is pushed as the `role: "tool"` turn (same toolCallId/toolName
 * as the default path) and recorded in `toolCallRecords`; the default
 * lookup/`runTool` path — including its BEFORE_TOOL/AFTER_TOOL hook band
 * semantics — is bypassed for that request (the dispatcher owns its own
 * pipeline events). If it resolves `undefined`, the existing
 * lookup/`runTool` path executes verbatim (fall-through).
 */
export interface RunAgentInternalOptions {
  readonly dispatchToolUse?: (
    req: ToolUseRequest,
    ctx: DispatchToolUseContext,
  ) => Promise<{ readonly content: string } | undefined>;
}

/**
 * Resolves the runtime's behaviour for a single `ai.runAgent(intent)` call.
 *
 * Phase 19 ships an in-process default scheduler (the loop runs in the
 * calling Promise), direct transport (provider.execute()), and in-memory
 * transcript (the `conversation` array). Phase 20 promotes scheduler /
 * transport / storage to the pluggable `AgentHost` adapter.
 *
 * Phase 39: `runAgent` is a thin public wrapper over `runAgentInternal`
 * with no internal options — the public signature and behavior are
 * unchanged.
 */
export async function runAgent<TOutputs extends OutputContractMap = DefaultAgentOutputs>(
  intent: AgentIntent<TOutputs>,
  config: LatticeConfig = {},
): Promise<AgentResult<TOutputs>> {
  return runAgentInternal(intent, config);
}

/**
 * The agent-loop implementation with the internal dispatch seam (Phase 39).
 * In-package consumers (agent/crew/, 39-05) call this directly; it is NOT
 * part of the public package surface.
 */
export async function runAgentInternal<TOutputs extends OutputContractMap = DefaultAgentOutputs>(
  intent: AgentIntent<TOutputs>,
  config: LatticeConfig = {},
  internalOptions: RunAgentInternalOptions = {},
): Promise<AgentResult<TOutputs>> {
  const startedAt = Date.now();
  const cumulativeUsage = { promptTokens: 0, completionTokens: 0, costUsd: null as number | null };
  const iterations: IterationRecord[] = [];

  // 0. Host adapter + survivability defaults.
  const host: AgentHost = intent.host ?? createNoopAgentHost();
  const survivabilityAdapter: SurvivabilityAdapter<AgentSnapshot> =
    intent.survivabilityAdapter ?? createNoopSurvivabilityAdapter<AgentSnapshot>();

  // 1. Hook pipeline + auto-checkpoint registration.
  const pipeline = ensurePipeline(intent);
  maybeAutoRegisterCheckpoint(pipeline, intent);

  // 2. Provider selection — pick the first adapter with execute().
  const provider = pickFirstExecutableProvider(config);
  if (provider === null) {
    return buildFailure({
      kind: "execution_unavailable",
      reason: "No provider adapter with execute() is configured.",
      iterations,
      usage: cumulativeUsage,
    });
  }
  let providerName = provider.id;

  // 3. Initialize conversation + tools handle.
  let conversation: ConversationTurn[] = [{ role: "user", content: intent.task }];
  const handle = formatToolsForProvider(providerName, intent.tools);
  const outputContracts = intent.outputs ?? DEFAULT_AGENT_OUTPUTS;
  const outputNames = Object.keys(outputContracts);

  const budget = intent.contract?.budget;
  const maxIterations = budget?.maxIterations ?? Number.POSITIVE_INFINITY;
  const maxWallTimeMs = budget?.maxWallTimeMs ?? Number.POSITIVE_INFINITY;
  const maxCostUsd = budget?.maxCostUsd ?? Number.POSITIVE_INFINITY;

  let iterationIndex = 0;

  // 3.5. Resume path (Phase 20): attempt to load a snapshot from host.storage.
  // On success, deserialize via the survivability adapter and re-enter at the
  // recorded iteration index. Emits recovery.start / recovery.complete /
  // recovery.failed events on the configured tracer (TRACE-EXT-01).
  const existingSnapshot = await host.storage?.load();
  if (existingSnapshot !== null && existingSnapshot !== undefined) {
    intent.tracer?.event?.("recovery.start", {
      snapshotVersion: existingSnapshot.version,
      capturedAt: existingSnapshot.capturedAt,
    });
    try {
      const restored = survivabilityAdapter.deserialize(existingSnapshot);
      iterationIndex = restored.iterationIndex;
      conversation = [...restored.conversation];
      cumulativeUsage.promptTokens = restored.cumulativeUsage.promptTokens;
      cumulativeUsage.completionTokens = restored.cumulativeUsage.completionTokens;
      cumulativeUsage.costUsd = restored.cumulativeUsage.costUsd;
      providerName = restored.providerName;
      intent.tracer?.event?.("recovery.complete", {
        iterationIndex,
        providerName,
      });
    } catch (error) {
      intent.tracer?.event?.("recovery.failed", {
        reason: error instanceof Error ? error.message : "deserialize failed",
      });
      await host.storage?.clear();
      // Fall through to fresh start (iterationIndex stays 0).
    }
  }

  while (iterationIndex < maxIterations) {
    // 4a. Budget pre-checks.
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= maxWallTimeMs) {
      return buildFailure({
        kind: "agent-wall-time-exceeded",
        reason: `Wall-time budget ${maxWallTimeMs}ms exceeded after ${elapsedMs}ms`,
        iterations,
        usage: cumulativeUsage,
      });
    }
    if (
      cumulativeUsage.costUsd !== null &&
      cumulativeUsage.costUsd >= maxCostUsd
    ) {
      // Reuses v1.1 "no-contract-match" kind for contract-budget-exceeded
      // (per LatticeRunError taxonomy); agent-specific cost-budget exhaustion
      // surfaces with this kind and a descriptive `reason`.
      return buildFailure({
        kind: "no-contract-match",
        reason: `Cost budget $${maxCostUsd} exceeded at $${cumulativeUsage.costUsd}`,
        iterations,
        usage: cumulativeUsage,
      });
    }

    // 4b. BEFORE_AGENT_ITERATION + deny check.
    await pipeline.run("BEFORE_AGENT_ITERATION", {
      iterationIndex,
      intent,
      conversation: conversation.map((t) => ({ ...t })),
      // CheckpointHookContext fields — the auto-registered checkpoint hook
      // reads these to assemble its receipt + tracer event metadata.
      stepName: `agent-iteration-${iterationIndex}-before`,
      stepIndex: iterationIndex,
      timestamp: new Date().toISOString(),
      ...(iterationIndex > 0
        ? { previousStepName: `agent-iteration-${iterationIndex - 1}-after` }
        : {}),
    });
    const denial = pipeline.lastDenialReason();
    if (denial !== null) {
      const failedRecord: IterationRecord = {
        index: iterationIndex,
        provider: providerName,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: null,
        durationMs: 0,
        toolCalls: [],
        deniedReason: denial,
      };
      iterations.push(failedRecord);
      await pipeline.run("AFTER_AGENT_ITERATION", {
        iterationIndex,
        intent,
        record: failedRecord,
        stepName: `agent-iteration-${iterationIndex}-after`,
        stepIndex: iterationIndex,
        timestamp: new Date().toISOString(),
        previousStepName: `agent-iteration-${iterationIndex}-before`,
      });
      return buildFailure({
        kind: "agent-iteration-denied",
        reason: denial,
        iterations,
        usage: cumulativeUsage,
      });
    }

    // 4c. Build task + dispatch via host transport seam.
    const task = handle.buildTask(conversation);
    const iterStart = Date.now();
    let response: ProviderRunResponse;
    try {
      if (provider.execute === undefined) {
        return buildFailure({
          kind: "execution_unavailable",
          reason: "Selected provider has no execute() method.",
          iterations,
          usage: cumulativeUsage,
        });
      }
      const providerRequest = {
        task,
        artifacts: [],
        outputs: outputNames,
        outputContracts,
        ...(intent.policy !== undefined ? { policy: intent.policy } : {}),
      };
      response = host.transport !== undefined
        ? await host.transport.call(provider, providerRequest)
        : await provider.execute(providerRequest);
    } catch (error) {
      return buildFailure({
        kind: "provider_execution",
        reason: error instanceof Error ? error.message : "Provider execution failed",
        cause: error,
        iterations,
        usage: cumulativeUsage,
      });
    }
    const iterDuration = Date.now() - iterStart;
    const iterUsage = response.normalizedUsage ?? ZERO_USAGE;
    accumulateUsage(cumulativeUsage, iterUsage);

    // 4d. Extract response text + parse tool-use envelope.
    const responseText = extractResponseText(response);
    const toolUseRequests = response.toolCalls !== undefined
      ? response.toolCalls.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.name,
          args: toolCall.args,
        }))
      : handle.parseToolUse(responseText);

    if (toolUseRequests === null || toolUseRequests.length === 0) {
      // 4e. Final answer path.
      const finalRecord: IterationRecord = {
        index: iterationIndex,
        provider: providerName,
        promptTokens: iterUsage.promptTokens,
        completionTokens: iterUsage.completionTokens,
        costUsd: iterUsage.costUsd,
        durationMs: iterDuration,
        toolCalls: [],
      };
      iterations.push(finalRecord);
      conversation.push({ role: "assistant", content: responseText });

      await pipeline.run("AFTER_AGENT_ITERATION", {
        iterationIndex,
        intent,
        record: finalRecord,
        stepName: `agent-iteration-${iterationIndex}-after`,
        stepIndex: iterationIndex,
        timestamp: new Date().toISOString(),
        previousStepName: `agent-iteration-${iterationIndex}-before`,
      });

      // 4f. Output materialization. When `intent.outputs` is omitted, the
      // default contract remains `{ answer: "text" }`. Declared outputs are
      // validated through the same kernel used by the single-shot runtime.
      const outputValidation = await validateOutputMapValues(
        outputContracts,
        response.rawOutputs,
      );
      if (!outputValidation.ok) {
        return buildFailure({
          kind: "validation",
          reason: outputValidation.error.message,
          cause: outputValidation.error,
          iterations,
          usage: cumulativeUsage,
        });
      }

      // 4e.1. Clear persistent storage on final-answer success so the next
      // run starts fresh (Phase 20).
      await host.storage?.clear();

      const artifactRefs =
        response.artifactRefs !== undefined
          ? response.artifactRefs.map(toArtifactRef)
          : [];
      return {
        kind: "success",
        output: outputValidation.outputs as never,
        ...(artifactRefs.length > 0 ? { artifacts: artifactRefs } : {}),
        usage: snapshotUsage(cumulativeUsage),
        iterations: Object.freeze([...iterations]),
      };
    }

    // 4g. Tool dispatch path.
    conversation.push({ role: "assistant", content: responseText });
    const toolCallRecords: Array<{
      readonly id: string;
      readonly name: string;
      readonly argsHash: string;
      readonly resultHash: string;
    }> = [];
    for (const req of toolUseRequests) {
      let resultContent: string | null = null;
      let resultHash = "tool-not-found";

      // Phase 39 internal dispatch seam: consult the injected dispatcher
      // first. `{ content }` short-circuits the default path; `undefined`
      // falls through to the existing lookup/runTool path verbatim.
      if (internalOptions.dispatchToolUse !== undefined) {
        const dispatched = await internalOptions.dispatchToolUse(req, {
          iterationIndex,
          conversation,
          pipeline,
        });
        if (dispatched !== undefined) {
          resultContent = dispatched.content;
          resultHash = stableHash(dispatched.content);
        }
      }

      if (resultContent === null) {
        const tool = intent.tools.find((t) => t.name === req.name);
        let toolResult: ToolCallResult | null = null;
        if (tool === undefined) {
          resultContent = JSON.stringify({
            error: `Unknown tool: ${req.name}`,
          });
        } else {
          try {
            await pipeline.run("BEFORE_TOOL", {
              iterationIndex,
              toolName: req.name,
              args: req.args,
            });
            toolResult = await runTool(tool, req.args);
            resultContent = stringifyArtifactValue(toolResult.artifact.value);
            resultHash = toolResult.callId;
            await pipeline.run("AFTER_TOOL", {
              iterationIndex,
              toolName: req.name,
              args: req.args,
              result: toolResult.artifact.value,
            });
          } catch (error) {
            resultContent = JSON.stringify({
              error: error instanceof Error ? error.message : "Tool execution failed",
            });
          }
        }
      }
      conversation.push({
        role: "tool",
        content: resultContent,
        toolCallId: req.id,
        toolName: req.name,
      });
      toolCallRecords.push({
        id: req.id,
        name: req.name,
        argsHash: stableHash(req.args),
        resultHash,
      });
    }

    const record: IterationRecord = {
      index: iterationIndex,
      provider: providerName,
      promptTokens: iterUsage.promptTokens,
      completionTokens: iterUsage.completionTokens,
      costUsd: iterUsage.costUsd,
      durationMs: iterDuration,
      toolCalls: Object.freeze([...toolCallRecords]),
    };
    iterations.push(record);

    await pipeline.run("AFTER_AGENT_ITERATION", {
      iterationIndex,
      intent,
      record,
      stepName: `agent-iteration-${iterationIndex}-after`,
      stepIndex: iterationIndex,
      timestamp: new Date().toISOString(),
      previousStepName: `agent-iteration-${iterationIndex}-before`,
    });

    // 4h. Persist agent state via host.storage so the loop can resume
    // after eviction (Phase 20). The survivability adapter handles
    // serialization (default: createNoopSurvivabilityAdapter which
    // JSON.stringifies the state).
    if (host.storage !== undefined) {
      const snapshot = survivabilityAdapter.serialize({
        version: "agent-snapshot/v1",
        iterationIndex: iterationIndex + 1,
        conversation: [...conversation],
        cumulativeUsage: snapshotUsage(cumulativeUsage),
        providerName,
        capturedAt: new Date().toISOString(),
      });
      await host.storage.save(snapshot);
    }

    // 4i. Yield to the host scheduler between iterations.
    if (host.scheduler !== undefined) {
      await host.scheduler.scheduleNext(iterationIndex);
    }

    iterationIndex += 1;
  }

  return buildFailure({
    kind: "agent-max-iterations",
    reason: `Iteration budget ${maxIterations} reached without a final answer`,
    iterations,
    usage: cumulativeUsage,
  });
}

function ensurePipeline<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
): HookPipeline {
  if (intent.pipeline !== undefined) return intent.pipeline;
  const options: Parameters<typeof createHookPipeline>[0] =
    intent.tracer !== undefined ? { tracer: intent.tracer } : {};
  return createHookPipeline(options);
}

function maybeAutoRegisterCheckpoint<TOutputs extends OutputContractMap>(
  pipeline: HookPipeline,
  intent: AgentIntent<TOutputs>,
): void {
  if (intent.signer === undefined) return;
  if (intent.autoRegisterCheckpoint === false) return;
  if (pipeline.isFrozen()) return;
  const handler = createCheckpointHook({
    runId: `runAgent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    signer: intent.signer,
    ...(intent.tracer !== undefined ? { tracer: intent.tracer } : {}),
  });
  pipeline.register("AFTER_AGENT_ITERATION", handler, { band: BAND.OBSERVABILITY });
}

function pickFirstExecutableProvider(config: LatticeConfig): ProviderAdapter | null {
  const providers = config.providers ?? [];
  for (const entry of providers) {
    if (typeof entry === "string") continue;
    if ("kind" in entry && entry.kind === "provider-adapter" && entry.execute !== undefined) {
      return entry;
    }
  }
  return null;
}

function extractResponseText(response: ProviderRunResponse): string {
  const raw = response.rawOutputs ?? {};
  const text = raw["answer"];
  if (typeof text === "string") return text;
  // Fallback: any string value in rawOutputs.
  for (const value of Object.values(raw)) {
    if (typeof value === "string") return value;
  }
  return "";
}

function accumulateUsage(
  cumulative: { promptTokens: number; completionTokens: number; costUsd: number | null },
  iter: Usage,
): void {
  cumulative.promptTokens += iter.promptTokens;
  cumulative.completionTokens += iter.completionTokens;
  if (iter.costUsd !== null) {
    cumulative.costUsd = (cumulative.costUsd ?? 0) + iter.costUsd;
  }
}

function snapshotUsage(c: {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}): Usage {
  return {
    promptTokens: c.promptTokens,
    completionTokens: c.completionTokens,
    costUsd: c.costUsd,
  };
}

function buildFailure(input: {
  kind: AgentFailure["kind"];
  reason?: string;
  cause?: unknown;
  iterations: readonly IterationRecord[];
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
}): AgentFailure {
  return {
    kind: input.kind,
    usage: snapshotUsage(input.usage),
    iterations: Object.freeze([...input.iterations]),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.cause !== undefined ? { cause: input.cause } : {}),
  };
}

function stringifyArtifactValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stableHash(input: unknown): string {
  try {
    const json = JSON.stringify(input);
    let hash = 5381;
    for (let i = 0; i < json.length; i += 1) {
      hash = (hash * 33) ^ json.charCodeAt(i);
    }
    return `djb2:${(hash >>> 0).toString(16)}`;
  } catch {
    return "djb2:0";
  }
}

// Forward-compat re-export: AgentDeniedError is the typed error class
// callers can catch (vs reading `result.kind === "agent-iteration-denied"`).
void AgentDeniedError;
