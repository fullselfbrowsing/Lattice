import canonicalize from "canonicalize";

import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import { getCapabilityProfile } from "../capabilities/lookup.js";
import type { TrainingClass } from "../capabilities/profile.js";
import type { CapabilityContract } from "../contract/contract.js";
import { evaluateTripwires, type TripwireEvidence } from "../contract/tripwire.js";
import {
  buildContextPack,
  type ContextPack,
  type ContextSummarizer,
} from "../context/context-pack.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { validateOutputMap } from "../outputs/validate.js";
import {
  createExecutionPlan,
  markStage,
  withPlanStatus,
  type ExecutionPlan,
  type ProviderAttemptRecord,
  type RouteRejectReason,
  type SelectedRoute,
  type UsageRecord,
} from "../plan/plan.js";
import { mergePolicy, type GatewayMetadataValue, type PolicySpec } from "../policy/policy.js";
import { packageArtifactsForProvider } from "../providers/packaging.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
  Usage,
} from "../providers/provider.js";
import { createReceipt } from "../receipts/receipt.js";
import type {
  ContractVerdict,
  ReceiptEnvelope,
  ReceiptModel,
  ReceiptRoute,
} from "../receipts/types.js";
import { createCapabilityCatalog } from "../routing/catalog.js";
import { routeDeterministically } from "../routing/router.js";
import type { RunResult } from "../results/result.js";
import type { SessionRecord, SessionRef } from "../sessions/session.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import { runTool, type ToolCallResult, type ToolDefinition } from "../tools/tools.js";
import { createRunEvent, type RunEvent } from "../tracing/tracing.js";
import {
  normalizeConfig,
  type LatticeConfig,
  type NormalizedLatticeConfig,
} from "./config.js";

export interface RuntimeOverrides {
  readonly provider?: string;
  readonly model?: string;
  readonly routingPolicy?: PolicySpec;
  readonly tokenBudget?: number;
  readonly summarizer?: ContextSummarizer;
  readonly transforms?: readonly RuntimeArtifactTransform[];
  readonly hooks?: RuntimeHooks;
}

export interface RuntimeArtifactTransform {
  readonly name: string;
  transform(input: {
    readonly task: string;
    readonly artifacts: readonly ArtifactInput[];
  }): Promise<ArtifactInput | readonly ArtifactInput[]> | ArtifactInput | readonly ArtifactInput[];
}

export interface RuntimeHooks {
  readonly beforeProviderCall?: (input: {
    readonly plan: ExecutionPlan;
    readonly request: ProviderRunRequest;
  }) => void | Promise<void>;
  readonly afterProviderCall?: (input: {
    readonly plan: ExecutionPlan;
    readonly response: unknown;
  }) => void | Promise<void>;
}

export interface RunIntent<TOutputs extends OutputContractMap> {
  readonly task: string;
  readonly artifacts?: readonly ArtifactInput[];
  readonly outputs: TOutputs;
  readonly policy?: PolicySpec;
  readonly session?: SessionRef;
  readonly signal?: AbortSignal;
  readonly overrides?: RuntimeOverrides;
  readonly tools?: readonly ToolDefinition<any>[];
  readonly toolInputs?: Record<string, unknown>;
  readonly contract?: CapabilityContract;
}

const ZERO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, costUsd: 0 };
const UNMEASURED_USAGE: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };

export interface AI {
  session(id: string): SessionRef;
  plan<const TOutputs extends OutputContractMap>(
    intent: RunIntent<TOutputs>,
  ): Promise<ExecutionPlan>;
  run<const TOutputs extends OutputContractMap>(
    intent: RunIntent<TOutputs>,
  ): Promise<RunResult<TOutputs>>;
  /**
   * Phase 19 (v1.2): single-agent execution loop. Drives multiple provider
   * iterations under one call, dispatching tool requests between iterations.
   * Composes with the v1.2 hook pipeline (SAFETY-band veto, OBSERVABILITY-band
   * checkpoint receipts) and the v1.2 capability receipts (when
   * `intent.signer` is provided + `intent.autoRegisterCheckpoint !== false`).
   *
   * See `packages/lattice/src/agent/runtime.ts` for orchestration details.
   */
  runAgent<const TOutputs extends OutputContractMap>(
    intent: import("../agent/types.js").AgentIntent<TOutputs>,
  ): Promise<import("../agent/types.js").AgentResult<TOutputs>>;
  /**
   * Phase 39 (v1.3): opt-in multi-agent crew execution. Runs a literal
   * `AgentSpec` tree through the existing single-agent loop plus the crew
   * dispatcher, with shared budget/rate-limit coordination and chained
   * completion receipts.
   *
   * See `packages/lattice/src/agent/crew/run-crew.ts` for orchestration details.
   */
  runAgentCrew(
    options: import("../agent/crew/run-crew.js").RunAgentCrewOptions,
  ): Promise<import("../agent/crew/run-crew.js").CrewResult>;
}

interface BuiltPlan {
  readonly plan: ExecutionPlan;
  readonly artifacts: readonly ArtifactInput[];
  readonly contextPack: ContextPack;
  readonly packagedArtifacts: readonly ArtifactRef[];
  readonly blockedPackaging: readonly string[];
  readonly toolResults: readonly ToolCallResult[];
  readonly mergedPolicy?: PolicySpec;
  readonly sessionRecord?: SessionRecord;
}

function gatewayMetadataForRoute(
  route: SelectedRoute,
  policy: PolicySpec["gateway"] | undefined,
): Record<string, unknown> | undefined {
  if (policy === undefined) {
    return undefined;
  }

  const sanitizedPolicy = sanitizeGatewayPolicyForEvents(policy);

  return {
    providerId: route.providerId,
    selectedProviderId: route.providerId,
    requestedModel: route.modelId,
    ...(sanitizedPolicy !== undefined ? { policy: sanitizedPolicy } : {}),
  };
}

function sanitizeGatewayPolicyForEvents(
  policy: PolicySpec["gateway"] | undefined,
): Record<string, unknown> | undefined {
  if (policy === undefined) {
    return undefined;
  }

  const metadata = sanitizeGatewayMetadataForEvents(policy.metadata);

  return {
    ...(policy.routeTags !== undefined && policy.routeTags.length > 0
      ? { routeTags: [...policy.routeTags] }
      : {}),
    ...(policy.providerPreferences !== undefined && policy.providerPreferences.length > 0
      ? { providerPreferences: [...policy.providerPreferences] }
      : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(policy.allowFallbacks !== undefined ? { allowFallbacks: policy.allowFallbacks } : {}),
  };
}

function sanitizeGatewayMetadataForEvents(
  metadata: Record<string, GatewayMetadataValue> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    Object.entries(metadata).flatMap(([key, value]) => {
      if (isSecretGatewayMetadataKey(key) || containsSecretGatewayMetadataValue(value)) {
        return [];
      }

      return [[key, value]];
    }),
  );

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function isSecretGatewayMetadataKey(key: string): boolean {
  return /api[-_]?key|authorization|headers?|secret|token|password/iu.test(key);
}

function containsSecretGatewayMetadataValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /^sk-[\w-]+/u.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsSecretGatewayMetadataValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([key, nested]) => (
      isSecretGatewayMetadataKey(key) || containsSecretGatewayMetadataValue(nested)
    ));
  }

  return false;
}

export function createAI(config: LatticeConfig = {}): AI {
  const normalized = normalizeConfig(config);

  return {
    session(id: string): SessionRef {
      return {
        id,
        kind: "session-ref",
      };
    },
    async plan<const TOutputs extends OutputContractMap>(
      intent: RunIntent<TOutputs>,
    ): Promise<ExecutionPlan> {
      return (await buildPlan(normalized, intent)).plan;
    },
    run<const TOutputs extends OutputContractMap>(
      intent: RunIntent<TOutputs>,
    ): Promise<RunResult<TOutputs>> {
      return runWithConfig(normalized, intent);
    },
    runAgent<const TOutputs extends OutputContractMap>(
      intent: import("../agent/types.js").AgentIntent<TOutputs>,
    ): Promise<import("../agent/types.js").AgentResult<TOutputs>> {
      // Lazy import avoids a hard cycle (agent/runtime.ts imports from
      // ../runtime/config.js for its `LatticeConfig` parameter type only).
      return import("../agent/runtime.js").then((mod) => mod.runAgent(intent, config));
    },
    runAgentCrew(
      options: import("../agent/crew/run-crew.js").RunAgentCrewOptions,
    ): Promise<import("../agent/crew/run-crew.js").CrewResult> {
      // Lazy import mirrors runAgent and avoids pulling the crew surface
      // into the beginner `run()` path unless explicitly used.
      return import("../agent/crew/run-crew.js").then((mod) =>
        mod.runAgentCrew(options, config),
      );
    },
  };
}

async function runWithConfig<const TOutputs extends OutputContractMap>(
  normalized: NormalizedLatticeConfig,
  intent: RunIntent<TOutputs>,
): Promise<RunResult<TOutputs>> {
  if (intent.signal?.aborted === true) {
    throw new DOMException("Run aborted before execution.", "AbortError");
  }

  const runId = createRunId();
  const events: RunEvent[] = [];
  await emitEvent(normalized, events, createRunEvent("run.start", { runId }));

  const built = await buildPlan(normalized, intent, runId, events);
  let plan = built.plan;
  const selected = plan.route.selected;

  if (selected === undefined) {
    const contractReasons = plan.route.noRouteReasons.filter(
      (r) =>
        r.code === "contract-budget-exceeded" ||
        r.code === "contract-quality-floor" ||
        r.code === "contract-modality-missing" ||
        r.code === "contract-privacy-mismatch",
    );
    const isContractFailure = contractReasons.length > 0;
    const receipt = await maybeIssueReceipt(normalized, {
      runId,
      ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
      artifacts: intent.artifacts ?? [],
      contractVerdict: isContractFailure
        ? "no-contract-match"
        : "execution-failed",
      model: {
        requested: intent.overrides?.model ?? "",
        observed: null,
      },
      route: { providerId: "", capabilityId: "", attemptNumber: 0 },
      usage: ZERO_USAGE,
      ...(isContractFailure
        ? { noRouteReasons: plan.route.noRouteReasons }
        : {}),
    });
    const failure: RunResult<TOutputs> = isContractFailure
      ? {
          ok: false as const,
          error: {
            kind: "no-contract-match" as const,
            message: "No route satisfies the contract.",
            noRouteReasons: plan.route.noRouteReasons,
          },
          usage: { ...ZERO_USAGE },
          plan,
          events,
          ...(receipt !== undefined ? { receipt } : {}),
        }
      : {
          ok: false as const,
          error: {
            kind: "no_route" as const,
            message: "No route satisfied the run requirements.",
            reasons: plan.route.noRouteReasons.map((reason) => reason.message),
          },
          usage: { ...ZERO_USAGE },
          plan,
          events,
          ...(receipt !== undefined ? { receipt } : {}),
        };
    await emitEvent(normalized, events, createRunEvent("run.failed", {
      runId,
      planId: plan.id,
      metadata: { reason: isContractFailure ? "no-contract-match" : "no-route" },
    }));

    return failure;
  }

  const routes = [
    selected,
    ...plan.route.fallbackChain.map((fallback) =>
      routeFromCandidate(plan, fallback.providerId, fallback.modelId) ?? {
        providerId: fallback.providerId,
        modelId: fallback.modelId,
        score: fallback.score,
        estimates: selected.estimates,
        inputModalities: selected.inputModalities,
        outputModalities: selected.outputModalities,
        fileTransport: selected.fileTransport,
      } satisfies SelectedRoute,
    ),
  ];
  const attempts: ProviderAttemptRecord[] = [];
  let lastError: Error | undefined;
  let anyExecutableAdapter = false;

  for (const [index, route] of routes.entries()) {
    const adapter = findExecutableAdapter(normalized, route.providerId);

    if (adapter === undefined) {
      lastError = new Error("No Phase 1 provider adapter with execute() is configured.");
      continue;
    }

    anyExecutableAdapter = true;

    if (index > 0) {
      await emitEvent(normalized, events, createRunEvent("fallback.activated", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
      }));
    }

    const startedAt = new Date().toISOString();
    const attemptPackaging = packageArtifactsForProvider({
      artifacts: built.artifacts,
      route,
      ...(built.mergedPolicy !== undefined ? { policy: built.mergedPolicy } : {}),
    });

    if (attemptPackaging.blocked.length > 0) {
      const message = attemptPackaging.blocked.join("; ");
      attempts.push(attemptFailed(route.providerId, route.modelId, startedAt, new Date().toISOString(), message));
      lastError = new Error(message);
      continue;
    }

    const request: ProviderRunRequest = {
      task: intent.task,
      artifacts: built.artifacts,
      outputs: Object.keys(intent.outputs),
      outputContracts: intent.outputs,
      ...(built.mergedPolicy !== undefined ? { policy: built.mergedPolicy } : {}),
      ...(intent.signal !== undefined ? { signal: intent.signal } : {}),
      plan,
      contextPack: built.contextPack,
      providerPackaging: attemptPackaging.plan,
      packagedArtifacts: attemptPackaging.packagedArtifacts,
    };
    const gatewayMetadata = gatewayMetadataForRoute(route, built.mergedPolicy?.gateway);

    try {
      await emitEvent(normalized, events, createRunEvent("provider.attempt", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "started",
          fallback: index > 0,
          ...(gatewayMetadata !== undefined ? { gateway: gatewayMetadata } : {}),
        },
      }));
      await intent.overrides?.hooks?.beforeProviderCall?.({ plan, request });

      plan = withPlanStatus(plan, "running", {
        stages: markStage(plan.stages, "execution", "running"),
        attempts: [
          ...attempts,
          {
            providerId: route.providerId,
            modelId: route.modelId,
            status: "running",
            startedAt,
          },
        ],
      });

      const response = await adapter.execute(request);
      await intent.overrides?.hooks?.afterProviderCall?.({ plan, response });
      await emitEvent(normalized, events, createRunEvent("provider.attempt", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "succeeded",
          fallback: index > 0,
          ...(response.gateway !== undefined ? { gateway: response.gateway } : {}),
        },
      }));

      const completedAt = new Date().toISOString();
      const validation = await validateOutputMap(intent.outputs, response.rawOutputs, plan);
      const succeededAttempt = attemptSucceeded(
        route.providerId,
        route.modelId,
        startedAt,
        completedAt,
        response.usage,
        response.gateway !== undefined ? { gateway: response.gateway } : undefined,
      );

      if (!validation.ok) {
        attempts.push({
          ...succeededAttempt,
          status: "failed",
          error: validation.error.message,
        });
        const failedPlan = withPlanStatus(plan, "failed", {
          stages: markStage(plan.stages, "validation", "failed"),
          attempts,
        });
        await emitEvent(normalized, events, createRunEvent("validation.failed", {
          runId,
          planId: plan.id,
          providerId: route.providerId,
          modelId: route.modelId,
          metadata: { error: validation.error.message },
        }));
        if (index === routes.length - 1) {
          const receipt = await maybeIssueReceipt(normalized, {
            runId,
            ...(intent.contract !== undefined
              ? { contract: intent.contract }
              : {}),
            artifacts: built.artifacts,
            contractVerdict: "validation-failed",
            model: { requested: route.modelId, observed: observedModelForReceipt(response) },
            route: {
              providerId: route.providerId,
              capabilityId: route.modelId,
              attemptNumber: attempts.length,
            },
            usage: normalizeAdapterUsage(response),
          });
          return {
            ...validation,
            usage: normalizeAdapterUsage(response),
            plan: failedPlan,
            events,
            ...(response.gateway !== undefined ? { gateway: response.gateway } : {}),
            ...(receipt !== undefined ? { receipt } : {}),
          };
        }
        lastError = new Error(validation.error.message);
        continue;
      }

      // Phase 8 tripwire evaluation — TRIP-02, TRIP-03, TRIP-04, TRIP-05.
      // Runs ONLY when output schema validation succeeded (we are inside the
      // `validation.ok === true` branch). First violation aborts the run
      // and short-circuits the fallback chain (terminal by construction —
      // see the early return below).
      const invariants = intent.contract?.invariants ?? [];
      if (invariants.length > 0) {
        // validation.ok === true was just verified; narrow to the success
        // shape so we can hand the validated outputs to the evaluator.
        const validatedSuccess = validation as Extract<typeof validation, { ok: true }>;
        const tripwireResult = await evaluateTripwires(
          validatedSuccess.outputs,
          invariants,
        );
        if (!tripwireResult.ok) {
          const tripwireFailedAt = new Date().toISOString();
          attempts.push({
            ...succeededAttempt,
            status: "failed",
            error: tripwireResult.evidence.message,
            completedAt: tripwireFailedAt,
          });
          const failedPlan = withPlanStatus(plan, "failed", {
            stages: markStage(
              markStage(
                markStage(plan.stages, "execution", "completed"),
                "validation",
                "completed",
              ),
              "tripwire",
              "failed",
              { invariantId: tripwireResult.evidence.invariantId },
            ),
            attempts,
          });
          await emitEvent(
            normalized,
            events,
            createRunEvent("run.failed", {
              runId,
              planId: failedPlan.id,
              providerId: route.providerId,
              modelId: route.modelId,
              metadata: {
                reason: "tripwire-violated",
                invariantId: tripwireResult.evidence.invariantId,
              },
            }),
          );
          const receipt = await maybeIssueReceipt(normalized, {
            runId,
            ...(intent.contract !== undefined
              ? { contract: intent.contract }
              : {}),
            artifacts: built.artifacts,
            contractVerdict: "tripwire-violated",
            model: { requested: route.modelId, observed: observedModelForReceipt(response) },
            route: {
              providerId: route.providerId,
              capabilityId: route.modelId,
              attemptNumber: attempts.length,
            },
            usage: normalizeAdapterUsage(response),
            tripwireEvidence: tripwireResult.evidence,
          });
          // TERMINAL by design — isTerminal(error) === true; fallback chain
          // bypassed via early return before the `for` loop advances.
          return {
            ok: false,
            error: {
              kind: "tripwire-violated" as const,
              message: tripwireResult.evidence.message,
              invariantId: tripwireResult.evidence.invariantId,
              evidence: tripwireResult.evidence,
              terminal: true as const,
            },
            usage: normalizeAdapterUsage(response),
            plan: failedPlan,
            events,
            ...(response.gateway !== undefined ? { gateway: response.gateway } : {}),
            ...(receipt !== undefined ? { receipt } : {}),
          };
        }
      }

      attempts.push(succeededAttempt);
      const artifactRefs =
        response.artifactRefs !== undefined
          ? response.artifactRefs.map(toArtifactRef)
          : [];
      const completedPlan = withPlanStatus(plan, "completed", {
        stages: markStage(
          markStage(
            markStage(
              markStage(
                markStage(plan.stages, "execution", "completed"),
                "validation",
                "completed",
              ),
              "persistence",
              "completed",
            ),
            "tool-execution",
            built.toolResults.length > 0 ? "completed" : "skipped",
          ),
          "tripwire",
          invariants.length > 0 ? "completed" : "skipped",
        ),
        attempts,
      });

      if (built.sessionRecord !== undefined && normalized.sessions !== undefined) {
        await normalized.sessions.appendTurn({
          sessionId: built.sessionRecord.id,
          task: intent.task,
          artifactRefs: built.artifacts.map(toArtifactRef),
          outputArtifactRefs: artifactRefs,
          planId: completedPlan.id,
        });
      }

      await emitEvent(normalized, events, createRunEvent("validation.complete", {
        runId,
        planId: completedPlan.id,
        providerId: route.providerId,
        modelId: route.modelId,
      }));
      await emitEvent(normalized, events, createRunEvent("run.complete", {
        runId,
        planId: completedPlan.id,
      }));

      const successValidation = validation as Extract<
        typeof validation,
        { ok: true }
      >;
      const receipt = await maybeIssueReceipt(normalized, {
        runId,
        ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
        artifacts: built.artifacts,
        contractVerdict: "success",
        model: { requested: route.modelId, observed: observedModelForReceipt(response) },
        route: {
          providerId: route.providerId,
          capabilityId: route.modelId,
          attemptNumber: attempts.length,
        },
        usage: normalizeAdapterUsage(response),
        outputs: JSON.stringify(successValidation.outputs),
      });

      return {
        ...validation,
        artifacts: artifactRefs,
        usage: normalizeAdapterUsage(response),
        plan: completedPlan,
        events,
        ...(response.gateway !== undefined ? { gateway: response.gateway } : {}),
        ...(receipt !== undefined ? { receipt } : {}),
      };
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message =
        error instanceof Error ? error.message : "Provider adapter execution failed.";
      attempts.push(attemptFailed(route.providerId, route.modelId, startedAt, completedAt, message));
      lastError = error instanceof Error ? error : new Error(message);
      await emitEvent(normalized, events, createRunEvent("provider.attempt", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: { status: "failed", error: message },
      }));
    }
  }

  if (!anyExecutableAdapter) {
    const receipt = await maybeIssueReceipt(normalized, {
      runId,
      ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
      artifacts: built.artifacts,
      contractVerdict: "execution-failed",
      model: { requested: selected.modelId, observed: null },
      route: {
        providerId: selected.providerId,
        capabilityId: selected.modelId,
        attemptNumber: 0,
      },
      usage: ZERO_USAGE,
    });
    return {
      ok: false,
      error: {
        kind: "execution_unavailable",
        message: "No Phase 1 provider adapter with execute() is configured.",
      },
      usage: { ...ZERO_USAGE },
      plan,
      events,
      ...(receipt !== undefined ? { receipt } : {}),
    };
  }

  const failedPlan = withPlanStatus(plan, "failed", {
    stages: markStage(plan.stages, "execution", "failed"),
    attempts,
  });
  await emitEvent(normalized, events, createRunEvent("run.failed", {
    runId,
    planId: failedPlan.id,
    metadata: {
      error: lastError?.message ?? "Provider adapter execution failed.",
    },
  }));

  const receipt = await maybeIssueReceipt(normalized, {
    runId,
    ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
    artifacts: built.artifacts,
    contractVerdict: "execution-failed",
    model: { requested: selected.modelId, observed: null },
    route: {
      providerId: selected.providerId,
      capabilityId: selected.modelId,
      attemptNumber: attempts.length,
    },
    usage: UNMEASURED_USAGE,
  });

  return {
    ok: false,
    error: {
      kind: "provider_execution",
      message: lastError?.message ?? "Provider adapter execution failed.",
      providerId: selected.providerId,
      modelId: selected.modelId,
    },
    usage: { ...UNMEASURED_USAGE },
    plan: failedPlan,
    events,
    ...(receipt !== undefined ? { receipt } : {}),
  };
}

async function buildPlan<const TOutputs extends OutputContractMap>(
  normalized: NormalizedLatticeConfig,
  intent: RunIntent<TOutputs>,
  runId = createRunId(),
  events: RunEvent[] = [],
): Promise<BuiltPlan> {
  const prepared = await prepareArtifacts(intent);
  const artifacts = prepared.artifacts;
  const mergedPolicy = mergePolicy(
    mergePolicy(normalized.defaults.policy, intent.policy),
    intent.overrides?.routingPolicy,
  );
  const sessionRecord =
    intent.session !== undefined && normalized.sessions !== undefined
      ? await loadOrCreateSession(normalized, intent.session)
      : undefined;
  const catalog = createCapabilityCatalog(normalized.providers);
  const route = routeDeterministically(catalog, {
    task: intent.task,
    artifacts,
    outputs: intent.outputs,
    ...(mergedPolicy !== undefined ? { policy: mergedPolicy } : {}),
    ...(intent.overrides?.provider !== undefined
      ? { provider: intent.overrides.provider }
      : {}),
    ...(intent.overrides?.model !== undefined ? { model: intent.overrides.model } : {}),
    ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
  });
  const contextPack = buildContextPack({
    task: intent.task,
    artifacts,
    ...(route.selected !== undefined ? { route: route.selected } : {}),
    ...(sessionRecord !== undefined ? { session: sessionRecord } : {}),
    ...(intent.overrides?.tokenBudget !== undefined
      ? { tokenBudget: intent.overrides.tokenBudget }
      : {}),
  });
  const summaryRefs =
    contextPack.summarized.length > 0 && intent.overrides?.summarizer !== undefined
      ? await intent.overrides.summarizer.summarize({
          artifacts: artifacts.map(toArtifactRef),
          budgetTokens: contextPack.tokenBudget,
        })
      : [];
  const packaging = packageArtifactsForProvider({
    artifacts,
    ...(route.selected !== undefined ? { route: route.selected } : {}),
    ...(mergedPolicy !== undefined ? { policy: mergedPolicy } : {}),
  });
  const gatewayMetadata = route.selected !== undefined
    ? gatewayMetadataForRoute(route.selected, mergedPolicy?.gateway)
    : undefined;
  let plan = createExecutionPlan({
    task: intent.task,
    artifacts: artifacts.map(toArtifactRef),
    outputs: intent.outputs,
    route,
    context: contextPack,
    providerPackaging: packaging.plan,
    warnings: packaging.blocked,
    metadata: {
      ...(intent.tools !== undefined
        ? { tools: intent.tools.map((tool) => tool.name) }
        : {}),
      ...(summaryRefs.length > 0
        ? { summaryArtifactIds: summaryRefs.map((summary) => summary.id) }
        : {}),
      ...(gatewayMetadata !== undefined ? { gateway: gatewayMetadata } : {}),
    },
  });
  plan = withPlanStatus(plan, plan.status, {
    stages: markStage(
      plan.stages,
      "tool-execution",
      prepared.toolResults.length > 0 ? "completed" : "skipped",
      prepared.toolResults.length > 0
        ? {
            toolNames: prepared.toolResults.map((result) => result.toolName),
          }
        : undefined,
    ),
  });

  for (const result of prepared.toolResults) {
    await emitEvent(normalized, events, createRunEvent("tool.call", {
      runId,
      planId: plan.id,
      artifactId: result.artifact.id,
      metadata: {
        toolName: result.toolName,
        callId: result.callId,
      },
    }));
    await emitEvent(normalized, events, createRunEvent("artifact.created", {
      runId,
      planId: plan.id,
      artifactId: result.artifact.id,
      metadata: {
        source: "tool",
      },
    }));
  }

  for (const artifactRef of artifacts.map(toArtifactRef)) {
    await emitEvent(normalized, events, createRunEvent("artifact.ingested", {
      runId,
      planId: plan.id,
      artifactId: artifactRef.id,
    }));
  }

  await emitEvent(normalized, events, createRunEvent("context.packed", {
    runId,
    planId: plan.id,
    metadata: {
      estimatedTokens: contextPack.estimatedTokens,
      included: contextPack.included.length,
      summarized: contextPack.summarized.length,
      omitted: contextPack.omitted.length,
    },
  }));
  await emitEvent(normalized, events, createRunEvent("router.candidates", {
    runId,
    planId: plan.id,
    metadata: {
      selected: route.selected?.modelId,
      rejected: route.rejected.length,
      fallbacks: route.fallbackChain.length,
      ...(gatewayMetadata !== undefined ? { gateway: gatewayMetadata } : {}),
    },
  }));

  return {
    plan,
    artifacts,
    contextPack,
    packagedArtifacts: packaging.packagedArtifacts,
    blockedPackaging: packaging.blocked,
    toolResults: prepared.toolResults,
    ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
    ...(sessionRecord !== undefined ? { sessionRecord } : {}),
  };
}

async function prepareArtifacts<const TOutputs extends OutputContractMap>(
  intent: RunIntent<TOutputs>,
): Promise<{
  readonly artifacts: readonly ArtifactInput[];
  readonly toolResults: readonly ToolCallResult[];
}> {
  let artifacts = [...(intent.artifacts ?? [])];

  for (const transform of intent.overrides?.transforms ?? []) {
    const transformed = await transform.transform({
      task: intent.task,
      artifacts,
    });
    artifacts = artifacts.concat(Array.isArray(transformed) ? transformed : [transformed]);
  }

  const toolResults: ToolCallResult[] = [];

  for (const tool of intent.tools ?? []) {
    const result = await runTool(tool, intent.toolInputs?.[tool.name] ?? {});
    toolResults.push(result);
    artifacts.push(result.artifact);
  }

  return { artifacts, toolResults };
}

async function loadOrCreateSession(
  normalized: NormalizedLatticeConfig,
  session: SessionRef,
): Promise<SessionRecord> {
  const existing = await normalized.sessions?.load(session.id);

  if (existing !== undefined) {
    return existing;
  }

  if (normalized.sessions === undefined) {
    throw new Error("Session storage is not configured.");
  }

  return normalized.sessions.create({ id: session.id });
}

function attemptSucceeded(
  providerId: string,
  modelId: string,
  startedAt: string,
  completedAt: string,
  usage?: UsageRecord,
  metadata?: Record<string, unknown>,
): ProviderAttemptRecord {
  return {
    providerId,
    modelId,
    status: "succeeded",
    startedAt,
    completedAt,
    ...(usage !== undefined ? { usage } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function attemptFailed(
  providerId: string,
  modelId: string,
  startedAt: string,
  completedAt: string,
  error: string,
): ProviderAttemptRecord {
  return {
    providerId,
    modelId,
    status: "failed",
    startedAt,
    completedAt,
    error,
  };
}

function findExecutableAdapter(
  normalized: NormalizedLatticeConfig,
  providerId: string,
): (ProviderAdapter & Required<Pick<ProviderAdapter, "execute">>) | undefined {
  return normalized.providers.find((provider) =>
    provider.kind === "provider-adapter" &&
    provider.id === providerId &&
    typeof provider.execute === "function",
  ) as (ProviderAdapter & Required<Pick<ProviderAdapter, "execute">>) | undefined;
}

function routeFromCandidate(
  plan: ExecutionPlan,
  providerId: string,
  modelId: string,
): SelectedRoute | undefined {
  const candidate = plan.route.candidates.find(
    (item) => item.providerId === providerId && item.modelId === modelId,
  );

  if (candidate === undefined) {
    return undefined;
  }

  return {
    providerId,
    modelId,
    score: candidate.score,
    estimates: candidate.estimates,
    inputModalities: candidate.capability.inputModalities,
    outputModalities: candidate.capability.outputModalities,
    fileTransport: candidate.capability.fileTransport,
  };
}

async function emitEvent(
  normalized: NormalizedLatticeConfig,
  events: RunEvent[],
  event: RunEvent,
): Promise<void> {
  events.push(event);
  normalized.tracing?.event?.(event.kind, {
    ...event.metadata,
    planId: event.planId,
    providerId: event.providerId,
    modelId: event.modelId,
    artifactId: event.artifactId,
  });

  await Promise.all(normalized.events.map((sink) => sink(event)));
}

function createRunId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `run:${crypto.randomUUID()}`;
  }

  return `run:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

/**
 * Normalize an adapter response into the `RunResult.usage` shape.
 *
 * Prefers `ProviderRunResponse.normalizedUsage` (the Phase 7 shape emitted by
 * openai / openai-compat / ai-sdk / fake adapters). Falls back to mapping the
 * legacy `UsageRecord` (inputTokens / outputTokens) so v1.0 adapters that have
 * not yet been re-rolled still surface a usable Usage value.
 */
function normalizeAdapterUsage(response: ProviderRunResponse): Usage {
  if (response.normalizedUsage !== undefined) {
    return response.normalizedUsage;
  }
  return {
    promptTokens: response.usage?.inputTokens ?? 0,
    completionTokens: response.usage?.outputTokens ?? 0,
    costUsd: response.usage?.costUsd ?? null,
  };
}

function observedModelForReceipt(response: ProviderRunResponse): string | null {
  return response.gateway?.observedModel ?? null;
}

/**
 * Phase 9 — hash each artifact's canonical value via SHA-256 and return the
 * hex digests in declaration order. Missing/undefined values produce an
 * empty string so the array length matches `artifacts.length` exactly.
 */
async function hashInputArtifacts(
  artifacts: readonly ArtifactInput[],
): Promise<readonly string[]> {
  const out: string[] = [];
  for (const artifact of artifacts) {
    const fp = await fingerprintArtifactValue(
      (artifact as { readonly value?: unknown }).value,
    );
    out.push(fp?.value ?? "");
  }
  return out;
}

/**
 * Phase 9 — SHA-256 hex of `canonicalize(contract)` for the receipt's
 * contractHash field. Returns null when no contract is attached or when
 * canonicalize cannot serialize the input.
 */
async function sha256HexOfCanonicalContract(
  contract: unknown,
): Promise<string | null> {
  if (contract === undefined || contract === null) return null;
  const canonical = canonicalize(contract);
  if (canonical === undefined) return null;
  const bytes = new TextEncoder().encode(canonical);
  const ab = new Uint8Array(bytes.byteLength);
  ab.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", ab.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface MaybeIssueReceiptInput {
  readonly runId: string;
  readonly contract?: CapabilityContract;
  readonly artifacts: readonly ArtifactInput[];
  readonly contractVerdict: ContractVerdict;
  readonly model: ReceiptModel;
  readonly route: ReceiptRoute;
  readonly usage: Usage;
  readonly outputs?: unknown;
  readonly noRouteReasons?: readonly RouteRejectReason[];
  readonly tripwireEvidence?: TripwireEvidence;
}

function resolveReceiptModelClass(
  route: ReceiptRoute,
  model: ReceiptModel,
): TrainingClass | undefined {
  if (route.providerId === "" || model.requested === "") return undefined;
  const modelForClass = model.observed ?? model.requested;
  return getCapabilityProfile(`${route.providerId}:${modelForClass}`)?.trainingClass
    ?? getCapabilityProfile(`${route.providerId}:${model.requested}`)?.trainingClass;
}

/**
 * Phase 9 — issue a signed receipt at a terminal branch when a signer is
 * configured. Signer failures degrade gracefully to `undefined` so a faulty
 * signer never crashes `ai.run`.
 */
async function maybeIssueReceipt(
  normalized: NormalizedLatticeConfig,
  input: MaybeIssueReceiptInput,
): Promise<ReceiptEnvelope | undefined> {
  if (normalized.signer === undefined) return undefined;
  try {
    const inputHashes = await hashInputArtifacts(input.artifacts);
    const outputHash =
      input.outputs === undefined
        ? null
        : ((await fingerprintArtifactValue(input.outputs))?.value ?? null);
    const contractHash = await sha256HexOfCanonicalContract(input.contract);
    const modelClass = resolveReceiptModelClass(input.route, input.model);
    return await createReceipt(
      {
        runId: input.runId,
        model: input.model,
        route: input.route,
        ...(modelClass !== undefined ? { modelClass } : {}),
        usage: input.usage,
        contractVerdict: input.contractVerdict,
        contractHash,
        inputHashes,
        outputHash,
        ...(input.noRouteReasons !== undefined
          ? { noRouteReasons: input.noRouteReasons }
          : {}),
        ...(input.tripwireEvidence !== undefined
          ? { tripwireEvidence: input.tripwireEvidence }
          : {}),
      },
      normalized.signer,
    );
  } catch {
    // Receipt emission is best-effort. A signer failure must NOT crash
    // ai.run — the run result already encodes the verdict.
    return undefined;
  }
}
