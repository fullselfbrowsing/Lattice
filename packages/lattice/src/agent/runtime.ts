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
 *   - `signer?` / `receiptMode?` — invocation receipt policy overrides.
 *                   Signers fall back to runtime config; enabled checkpoint
 *                   issuance auto-registers on BAND.OBSERVABILITY unless
 *                   explicitly disabled.
 *   - `tracer?`   — Phase 5 TracerLike; flows through pipeline.
 *   - `outputs?`  — final-answer schema map; validated only on the final
 *                   assistant message (no intermediate validation).
 *   - `contract?` — Phase 7 CapabilityContract; budget invariants are
 *                   enforced pre-iteration.
 *
 * Every terminal result passes through one receipt finalizer. Required-mode
 * checkpoint failure is reused there so completed provider work is not
 * repeated and signing is not attempted twice.
 */

import type { ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import { estimateTokens } from "../context/context-pack.js";
import { type HookPipeline, createHookPipeline } from "../contract/bands.js";
import {
  createCheckpointHook,
  type CheckpointHookContext,
} from "../contract/checkpoint.js";
import type { BudgetInvariant } from "../contract/contract.js";
import type { LatticeConfig } from "./../runtime/config.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { validateOutputMapValues } from "../outputs/validate.js";
import type {
  ModelCapability,
  ProviderAdapter,
  ProviderRunResponse,
  Usage,
} from "../providers/provider.js";
import {
  issueReceipt,
  preflightReceiptPolicy,
  resolveReceiptPolicy,
  type EffectiveReceiptPolicy,
  type ReceiptIssuanceOutcome,
} from "../receipts/policy.js";
import type { CreateReceiptInput } from "../receipts/receipt.js";
import type { AuditError, AuditErrorStage } from "../results/errors.js";
import {
  CANONICAL_PROJECTED_OUTPUT_TOKENS,
  accumulatedCostExceedsBudget,
  estimateCost,
  resolveUsageCostUsd,
  type CostEstimate,
} from "../routing/cost.js";
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
  type AgentExecutionFailure,
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
  readonly cumulativeUsage?: Usage;
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
  readonly onReceiptOutcome?: (event: {
    readonly scope: "checkpoint" | "terminal";
    readonly outcome: ReceiptIssuanceOutcome;
  }) => void;
  readonly terminalReceipt?: {
    readonly stepName: string;
    readonly parentReceiptCid: string;
  };
  /** Dynamic shared pool excluding this invocation's local cumulative usage. */
  readonly remainingBudget?: () => BudgetInvariant | undefined;
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
  let executionId = `agent-execution:${crypto.randomUUID()}`;
  const cumulativeUsage = { promptTokens: 0, completionTokens: 0, costUsd: null as number | null };
  const iterations: IterationRecord[] = [];
  const receiptPolicy = resolveAgentReceiptPolicy(intent, config);
  let checkpointFailure: AuditError | undefined;
  let executionStarted = false;
  let providerName = "lattice-agent/unavailable";

  const observeReceiptOutcome = (
    scope: "checkpoint" | "terminal",
    outcome: ReceiptIssuanceOutcome,
  ): void => {
    try {
      internalOptions.onReceiptOutcome?.({ scope, outcome });
    } catch {
      // Internal observers collect evidence only; they cannot change execution.
    }
    if (
      scope === "checkpoint" &&
      receiptPolicy.mode === "required" &&
      outcome.status === "failed" &&
      checkpointFailure === undefined
    ) {
      checkpointFailure = outcome.error;
    }
  };

  const finalize = async (
    result: AgentResult<TOutputs> | undefined,
  ): Promise<AgentResult<TOutputs>> => {
    if (checkpointFailure !== undefined) {
      return buildAuditFailure(
        checkpointFailure,
        iterations,
        cumulativeUsage,
      );
    }
    if (result === undefined) {
      throw new Error("Agent terminal finalization requires a result.");
    }

    const stage: AuditErrorStage = executionStarted
      ? "post-execution"
      : "pre-execution";
    const outcome = await issueReceipt(
      buildAgentTerminalReceiptInput(
        executionId,
        providerName,
        result,
        internalOptions.terminalReceipt,
      ),
      receiptPolicy,
      stage,
    );
    observeReceiptOutcome("terminal", outcome);
    emitAgentReceiptOutcome(intent, "terminal", outcome);

    if (outcome.status === "failed" && receiptPolicy.mode === "required") {
      return buildAuditFailure(outcome.error, iterations, cumulativeUsage);
    }
    if (outcome.status === "issued") {
      return Object.freeze({
        ...result,
        receipt: outcome.envelope,
      });
    }
    return result;
  };

  const preflight = preflightReceiptPolicy(receiptPolicy);
  if (preflight?.status === "failed") {
    observeReceiptOutcome("terminal", preflight);
    emitAgentReceiptOutcome(intent, "terminal", preflight);
    return buildAuditFailure(preflight.error, iterations, cumulativeUsage);
  }

  // 0. Host adapter + survivability defaults.
  const host: AgentHost = intent.host ?? createNoopAgentHost();
  const survivabilityAdapter: SurvivabilityAdapter<AgentSnapshot> =
    intent.survivabilityAdapter ?? createNoopSurvivabilityAdapter<AgentSnapshot>();

  // 1. Restore persisted state before receipt handlers capture identity.
  const pipeline = ensurePipeline(intent);
  let conversation: ConversationTurn[] = [{ role: "user", content: intent.task }];
  const outputContracts = intent.outputs ?? DEFAULT_AGENT_OUTPUTS;
  const outputNames = Object.keys(outputContracts);

  const budget = intent.contract?.budget;
  const maxIterations = budget?.maxIterations ?? Number.POSITIVE_INFINITY;
  const maxWallTimeMs = budget?.maxWallTimeMs ?? Number.POSITIVE_INFINITY;
  const maxCostUsd = budget?.maxCostUsd ?? Number.POSITIVE_INFINITY;

  let iterationIndex = 0;
  const existingSnapshot = await host.storage?.load();
  if (existingSnapshot !== null && existingSnapshot !== undefined) {
    intent.tracer?.event?.("recovery.start", {
      snapshotVersion: "lattice-survivability/v1",
    });
    if (!isSerializedSnapshot(existingSnapshot)) {
      return buildRecoveryFailure(intent, "snapshot-invalid");
    }
    let restored: AgentSnapshot;
    try {
      restored = survivabilityAdapter.deserialize(existingSnapshot);
    } catch {
      return buildRecoveryFailure(intent, "deserialize-failed");
    }
    if (!isValidAgentSnapshot(restored)) {
      return buildRecoveryFailure(intent, "snapshot-invalid");
    }

    iterationIndex = restored.iterationIndex;
    conversation = [...restored.conversation];
    cumulativeUsage.promptTokens = restored.cumulativeUsage.promptTokens;
    cumulativeUsage.completionTokens = restored.cumulativeUsage.completionTokens;
    cumulativeUsage.costUsd = restored.cumulativeUsage.costUsd;
    providerName = restored.providerName;
    executionId = restored.executionId ??
      await deriveHistoricalExecutionId(existingSnapshot.payload);
    if (restored.iterations !== undefined) {
      iterations.push(...restored.iterations);
    }
    intent.tracer?.event?.("recovery.complete", {
      iterationIndex,
      providerName,
    });
  }

  // 2. Invocation-local managed checkpoint uses the restored execution ID.
  const managedCheckpoint = createManagedCheckpointRunner(
    intent,
    receiptPolicy,
    executionId,
    (outcome) => {
      observeReceiptOutcome("checkpoint", outcome);
    },
  );
  const completeIteration = async (
    record: IterationRecord,
  ): Promise<IterationRecord> => {
    const stepName = record.iterationId!;
    const context = {
      iterationIndex: record.index,
      intent,
      record,
      stepName,
      stepIndex: record.index,
      timestamp: new Date().toISOString(),
      previousStepName: `${stepName}:before`,
    };
    await pipeline.run("AFTER_AGENT_ITERATION", context);
    const outcome = await managedCheckpoint?.(context);
    if (outcome?.status !== "issued") return record;

    const attached = Object.freeze({
      ...record,
      receipt: outcome.envelope,
    });
    iterations[iterations.length - 1] = attached;
    return attached;
  };

  // 3. Provider selection prefers the sticky provider restored by the host.
  const provider = pickFirstExecutableProvider(
    config,
    providerName === "lattice-agent/unavailable" ? undefined : providerName,
  );
  if (provider === null) {
    return finalize(buildFailure({
      kind: "execution_unavailable",
      reason: "No provider adapter with execute() is configured.",
      iterations,
      usage: cumulativeUsage,
    }));
  }
  providerName = provider.id;
  const capability = pickFirstAvailableCapability(provider);
  const handle = formatToolsForProvider(providerName, intent.tools);

  while (iterationIndex < maxIterations) {
    const iterationId = buildIterationId(executionId, iterationIndex);
    // 4a. Budget pre-checks.
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= maxWallTimeMs) {
      return finalize(buildFailure({
        kind: "agent-wall-time-exceeded",
        reason: `Wall-time budget ${maxWallTimeMs}ms exceeded after ${elapsedMs}ms`,
        iterations,
        usage: cumulativeUsage,
      }));
    }
    if (
      cumulativeUsage.costUsd !== null &&
      accumulatedCostExceedsBudget(cumulativeUsage.costUsd, maxCostUsd)
    ) {
      // Reuses v1.1 "no-contract-match" kind for contract-budget-exceeded
      // (per LatticeRunError taxonomy); agent-specific cost-budget exhaustion
      // surfaces with this kind and a descriptive `reason`.
      return finalize(buildFailure({
        kind: "no-contract-match",
        reason: `Cost budget $${maxCostUsd} exceeded at $${cumulativeUsage.costUsd}`,
        iterations,
        usage: cumulativeUsage,
      }));
    }

    // 4b. BEFORE_AGENT_ITERATION + deny check.
    await pipeline.run("BEFORE_AGENT_ITERATION", {
      iterationIndex,
      intent,
      conversation: conversation.map((t) => ({ ...t })),
      stepName: `${iterationId}:before`,
      stepIndex: iterationIndex,
      timestamp: new Date().toISOString(),
      ...(iterationIndex > 0
        ? { previousStepName: buildIterationId(executionId, iterationIndex - 1) }
        : {}),
    });
    const denial = pipeline.lastDenialReason();
    if (denial !== null) {
      const failedRecord: IterationRecord = {
        iterationId,
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
      await completeIteration(failedRecord);
      return finalize(buildFailure({
        kind: "agent-iteration-denied",
        reason: denial,
        iterations,
        usage: cumulativeUsage,
      }));
    }

    // 4c. Build task + dispatch via host transport seam.
    const task = handle.buildTask(conversation);
    const callEstimate = estimateCost({
      ...(capability?.pricing !== undefined
        ? { pricing: capability.pricing }
        : {}),
      inputTokens: estimateTokens(task),
      outputTokens: CANONICAL_PROJECTED_OUTPUT_TOKENS,
    });
    emitAgentCostEstimate(intent, callEstimate);
    const hardMaxCostUsd = minDefined(
      budget?.maxCostUsd,
      internalOptions.remainingBudget?.()?.maxCostUsd,
    );
    if (hardMaxCostUsd !== undefined) {
      const hasPriorUsage =
        iterationIndex > 0 ||
        cumulativeUsage.promptTokens > 0 ||
        cumulativeUsage.completionTokens > 0;
      const spentCostUsd = cumulativeUsage.costUsd;
      if (
        callEstimate.status === "unknown" ||
        (hasPriorUsage && spentCostUsd === null)
      ) {
        return finalize(buildFailure({
          kind: "no-contract-match",
          reason: "Cost estimate is unknown for a call with maxCostUsd.",
          iterations,
          usage: cumulativeUsage,
        }));
      }
      const projectedCostUsd =
        (spentCostUsd ?? 0) + callEstimate.totalCostUsd!;
      if (accumulatedCostExceedsBudget(projectedCostUsd, hardMaxCostUsd)) {
        return finalize(buildFailure({
          kind: "no-contract-match",
          reason: `Estimated next call exceeds remaining maxCostUsd ${hardMaxCostUsd}.`,
          iterations,
          usage: cumulativeUsage,
        }));
      }
    }
    const iterStart = Date.now();
    let response: ProviderRunResponse;
    try {
      if (provider.execute === undefined) {
        return finalize(buildFailure({
          kind: "execution_unavailable",
          reason: "Selected provider has no execute() method.",
          iterations,
          usage: cumulativeUsage,
        }));
      }
      const providerRequest = {
        task,
        artifacts: [],
        outputs: outputNames,
        outputContracts,
        ...(intent.policy !== undefined ? { policy: intent.policy } : {}),
      };
      executionStarted = true;
      response = host.transport !== undefined
        ? await host.transport.call(provider, providerRequest)
        : await provider.execute(providerRequest);
    } catch (error) {
      return finalize(buildFailure({
        kind: "provider_execution",
        reason: error instanceof Error ? error.message : "Provider execution failed",
        cause: error,
        iterations,
        usage: cumulativeUsage,
      }));
    }
    const iterDuration = Date.now() - iterStart;
    const iterUsage = resolveAgentUsage(response, capability);
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
        iterationId,
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
      await completeIteration(finalRecord);

      if (checkpointFailure !== undefined) {
        return finalize(undefined);
      }

      // 4f. Output materialization. When `intent.outputs` is omitted, the
      // default contract remains `{ answer: "text" }`. Declared outputs are
      // validated through the same kernel used by the single-shot runtime.
      const outputValidation = await validateOutputMapValues(
        outputContracts,
        response.rawOutputs,
      );
      if (!outputValidation.ok) {
        return finalize(buildFailure({
          kind: "validation",
          reason: outputValidation.error.message,
          cause: outputValidation.error,
          iterations,
          usage: cumulativeUsage,
        }));
      }

      const artifactRefs =
        response.artifactRefs !== undefined
          ? response.artifactRefs.map(toArtifactRef)
          : [];
      const finalized = await finalize({
        kind: "success",
        output: outputValidation.outputs as never,
        ...(artifactRefs.length > 0 ? { artifacts: artifactRefs } : {}),
        usage: snapshotUsage(cumulativeUsage),
        iterations: Object.freeze([...iterations]),
      });
      if (finalized.kind === "success") {
        await host.storage?.clear();
      }
      return finalized;
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
          cumulativeUsage: snapshotUsage(cumulativeUsage),
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
      iterationId,
      index: iterationIndex,
      provider: providerName,
      promptTokens: iterUsage.promptTokens,
      completionTokens: iterUsage.completionTokens,
      costUsd: iterUsage.costUsd,
      durationMs: iterDuration,
      toolCalls: Object.freeze([...toolCallRecords]),
    };
    iterations.push(record);
    await completeIteration(record);

    if (checkpointFailure !== undefined) {
      return finalize(undefined);
    }

    // 4h. Persist agent state via host.storage so the loop can resume
    // after eviction (Phase 20). The survivability adapter handles
    // serialization (default: createNoopSurvivabilityAdapter which
    // JSON.stringifies the state).
    if (host.storage !== undefined) {
      const snapshot = survivabilityAdapter.serialize({
        version: "agent-snapshot/v1",
        executionId,
        iterations: Object.freeze([...iterations]),
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

  return finalize(buildFailure({
    kind: "agent-max-iterations",
    reason: `Iteration budget ${maxIterations} reached without a final answer`,
    iterations,
    usage: cumulativeUsage,
  }));
}

function ensurePipeline<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
): HookPipeline {
  if (intent.pipeline !== undefined) return intent.pipeline;
  const options: Parameters<typeof createHookPipeline>[0] =
    intent.tracer !== undefined ? { tracer: intent.tracer } : {};
  return createHookPipeline(options);
}

function createManagedCheckpointRunner<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
  policy: EffectiveReceiptPolicy,
  executionId: string,
  onReceiptOutcome: (outcome: ReceiptIssuanceOutcome) => void,
):
  | ((
      context: CheckpointHookContext,
    ) => Promise<ReceiptIssuanceOutcome | undefined>)
  | undefined {
  if (policy.mode === "off" || policy.signer === undefined) return undefined;
  if (intent.autoRegisterCheckpoint === false) return undefined;
  let latestOutcome: ReceiptIssuanceOutcome | undefined;
  const handler = createCheckpointHook({
    runId: executionId,
    receiptMode: policy.mode,
    signer: policy.signer,
    onReceiptOutcome: (outcome) => {
      latestOutcome = outcome;
      onReceiptOutcome(outcome);
    },
    ...(intent.tracer !== undefined ? { tracer: intent.tracer } : {}),
  });
  return async (context) => {
    latestOutcome = undefined;
    await handler(context);
    return latestOutcome;
  };
}

function buildIterationId(executionId: string, index: number): string {
  return `${executionId}:iteration:${index}`;
}

type RecoveryFailureReason = "deserialize-failed" | "snapshot-invalid";

function buildRecoveryFailure<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
  reason: RecoveryFailureReason,
): AgentExecutionFailure {
  intent.tracer?.event?.("recovery.failed", { reason });
  return buildFailure({
    kind: "agent-recovery-failed",
    reason,
    iterations: [],
    usage: ZERO_USAGE,
  });
}

async function deriveHistoricalExecutionId(payload: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `agent-execution:legacy:${hex}`;
}

function isSerializedSnapshot(value: unknown): value is {
  readonly kind: "survivability-snapshot";
  readonly version: "lattice-survivability/v1";
  readonly payload: string;
  readonly capturedAt: string;
} {
  return isRecord(value) &&
    value["kind"] === "survivability-snapshot" &&
    value["version"] === "lattice-survivability/v1" &&
    typeof value["payload"] === "string" &&
    typeof value["capturedAt"] === "string";
}

function isValidAgentSnapshot(value: unknown): value is AgentSnapshot {
  if (!isRecord(value) || value["version"] !== "agent-snapshot/v1") {
    return false;
  }
  const iterationIndex = value["iterationIndex"];
  if (!isNonNegativeInteger(iterationIndex)) return false;
  if (!isConversation(value["conversation"])) return false;
  if (!isUsage(value["cumulativeUsage"])) return false;
  if (!isBoundedString(value["providerName"], 256)) return false;
  if (typeof value["capturedAt"] !== "string") return false;
  if (
    value["ancestry"] !== undefined &&
    (!Array.isArray(value["ancestry"]) ||
      !value["ancestry"].every((id) => isBoundedString(id, 256)))
  ) {
    return false;
  }

  const executionId = value["executionId"];
  const iterations = value["iterations"];
  if ((executionId === undefined) !== (iterations === undefined)) return false;
  if (executionId === undefined) return true;
  if (!isExecutionId(executionId) || !Array.isArray(iterations)) return false;

  let previousIndex = -1;
  const iterationIds = new Set<string>();
  for (const record of iterations) {
    if (!isIterationRecord(record)) return false;
    if (record.index <= previousIndex || record.index >= iterationIndex) {
      return false;
    }
    if (record.iterationId !== buildIterationId(executionId, record.index)) {
      return false;
    }
    if (iterationIds.has(record.iterationId)) return false;
    iterationIds.add(record.iterationId);
    previousIndex = record.index;
  }
  return true;
}

function isIterationRecord(value: unknown): value is IterationRecord & {
  readonly iterationId: string;
} {
  if (!isRecord(value)) return false;
  if (!isExecutionId(value["iterationId"])) return false;
  if (!isNonNegativeInteger(value["index"])) return false;
  if (!isBoundedString(value["provider"], 256)) return false;
  if (!isNonNegativeInteger(value["promptTokens"])) return false;
  if (!isNonNegativeInteger(value["completionTokens"])) return false;
  if (!isNullableNonNegativeFiniteNumber(value["costUsd"])) return false;
  if (!isNonNegativeFiniteNumber(value["durationMs"])) return false;
  if (!Array.isArray(value["toolCalls"])) return false;
  if (!value["toolCalls"].every(isToolCallRecord)) return false;
  if (
    value["deniedReason"] !== undefined &&
    typeof value["deniedReason"] !== "string"
  ) {
    return false;
  }
  return value["receipt"] === undefined || isReceiptEnvelope(value["receipt"]);
}

function isToolCallRecord(value: unknown): boolean {
  return isRecord(value) &&
    typeof value["id"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["argsHash"] === "string" &&
    typeof value["resultHash"] === "string";
}

function isReceiptEnvelope(value: unknown): boolean {
  return isRecord(value) &&
    value["payloadType"] === "application/vnd.lattice.receipt+json" &&
    isBoundedString(value["payload"], 1_000_000) &&
    Array.isArray(value["signatures"]) &&
    value["signatures"].length > 0 &&
    value["signatures"].every((signature) =>
      isRecord(signature) &&
      isBoundedString(signature["keyid"], 1024) &&
      isBoundedString(signature["sig"], 1_000_000)
    );
}

function isConversation(value: unknown): value is ConversationTurn[] {
  return Array.isArray(value) && value.every((turn) =>
    isRecord(turn) &&
    (turn["role"] === "user" ||
      turn["role"] === "assistant" ||
      turn["role"] === "tool") &&
    typeof turn["content"] === "string" &&
    (turn["toolCallId"] === undefined ||
      typeof turn["toolCallId"] === "string") &&
    (turn["toolName"] === undefined || typeof turn["toolName"] === "string")
  );
}

function isUsage(value: unknown): value is Usage {
  return isRecord(value) &&
    isNonNegativeInteger(value["promptTokens"]) &&
    isNonNegativeInteger(value["completionTokens"]) &&
    isNullableNonNegativeFiniteNumber(value["costUsd"]);
}

function isExecutionId(value: unknown): value is string {
  return isBoundedString(value, 128) &&
    /^agent-execution:[A-Za-z0-9:._-]+$/u.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullableNonNegativeFiniteNumber(
  value: unknown,
): value is number | null {
  return value === null || isNonNegativeFiniteNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveAgentReceiptPolicy<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
  config: LatticeConfig,
): EffectiveReceiptPolicy {
  const mode = intent.receiptMode ?? config.receiptMode;
  const signer = intent.signer ?? config.signer;
  return resolveReceiptPolicy({
    ...(mode !== undefined ? { mode } : {}),
    ...(signer !== undefined ? { signer } : {}),
  });
}

function buildAgentTerminalReceiptInput(
  executionId: string,
  providerName: string,
  result: AgentResult,
  context: RunAgentInternalOptions["terminalReceipt"],
): CreateReceiptInput {
  return {
    runId: executionId,
    model: {
      requested: providerName,
      observed:
        providerName === "lattice-agent/unavailable" ? null : providerName,
    },
    route: {
      providerId: providerName,
      capabilityId: "lattice-agent/terminal",
      attemptNumber: Math.max(1, result.iterations.length),
    },
    usage: result.usage,
    contractVerdict: agentContractVerdict(result),
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    stepName: context?.stepName ?? `${executionId}:terminal`,
    stepIndex: result.iterations.length,
    ...(context !== undefined
      ? { parentReceiptCid: context.parentReceiptCid }
      : {}),
  };
}

function agentContractVerdict(
  result: AgentResult,
): CreateReceiptInput["contractVerdict"] {
  if (result.kind === "success") return "success";
  if (result.kind === "tripwire-violated") return "tripwire-violated";
  if (result.kind === "no-contract-match") return "no-contract-match";
  if (result.kind === "validation") return "validation-failed";
  return "execution-failed";
}

function emitAgentReceiptOutcome<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
  scope: "checkpoint" | "terminal",
  outcome: ReceiptIssuanceOutcome,
): void {
  intent.tracer?.event?.("receipt.issuance", {
    scope,
    status: outcome.status,
    ...(outcome.status === "skipped" ? { reason: outcome.reason } : {}),
    ...(outcome.status === "failed"
      ? { code: outcome.error.code, stage: outcome.error.stage }
      : {}),
  });
}

function pickFirstExecutableProvider(
  config: LatticeConfig,
  preferredId?: string,
): ProviderAdapter | null {
  const providers = config.providers ?? [];
  let first: ProviderAdapter | null = null;
  for (const entry of providers) {
    if (typeof entry === "string") continue;
    if ("kind" in entry && entry.kind === "provider-adapter" && entry.execute !== undefined) {
      if (first === null) first = entry;
      if (entry.id === preferredId) return entry;
    }
  }
  return first;
}

function minDefined(
  left: number | undefined,
  right: number | undefined,
): number | undefined {
  if (left !== undefined && right !== undefined) {
    return Math.min(left, right);
  }
  return left ?? right;
}

function pickFirstAvailableCapability(
  provider: ProviderAdapter,
): ModelCapability | undefined {
  return provider.capabilities?.find(
    (capability) => capability.available !== false,
  );
}

function emitAgentCostEstimate<TOutputs extends OutputContractMap>(
  intent: AgentIntent<TOutputs>,
  estimate: CostEstimate,
): void {
  intent.tracer?.event?.("agent.cost.estimate", {
    version: estimate.version,
    status: estimate.status,
    inputTokens: estimate.input.tokenCount,
    outputTokens: estimate.output.tokenCount,
    ...(estimate.totalCostUsd !== null
      ? { totalCostUsd: estimate.totalCostUsd }
      : {}),
  });
}

function resolveAgentUsage(
  response: ProviderRunResponse,
  capability: ModelCapability | undefined,
): Usage {
  const baseUsage =
    response.normalizedUsage ??
    (response.usage !== undefined
      ? {
          promptTokens: response.usage.inputTokens ?? 0,
          completionTokens: response.usage.outputTokens ?? 0,
          costUsd: response.usage.costUsd ?? null,
        }
      : ZERO_USAGE);
  const reportedCostUsd = baseUsage.costUsd ?? response.usage?.costUsd;

  return {
    promptTokens: baseUsage.promptTokens,
    completionTokens: baseUsage.completionTokens,
    costUsd: resolveUsageCostUsd({
      ...(capability?.pricing !== undefined
        ? { pricing: capability.pricing }
        : {}),
      ...(reportedCostUsd !== undefined && reportedCostUsd !== null
        ? { reportedCostUsd }
        : {}),
      inputTokens: baseUsage.promptTokens,
      outputTokens: baseUsage.completionTokens,
    }),
  };
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
  kind: AgentExecutionFailure["kind"];
  reason?: string;
  cause?: unknown;
  iterations: readonly IterationRecord[];
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
}): AgentExecutionFailure {
  return {
    kind: input.kind,
    usage: snapshotUsage(input.usage),
    iterations: Object.freeze([...input.iterations]),
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.cause !== undefined ? { cause: input.cause } : {}),
  };
}

function buildAuditFailure(
  error: AuditError,
  iterations: readonly IterationRecord[],
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null },
): AgentFailure {
  return {
    ...error,
    reason: error.message,
    usage: snapshotUsage(usage),
    iterations: Object.freeze([...iterations]),
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
