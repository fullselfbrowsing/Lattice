import canonicalize from "canonicalize";

import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { getCapabilityProfile } from "../capabilities/lookup.js";
import type { TrainingClass } from "../capabilities/profile.js";
import type { CapabilityContract } from "../contract/contract.js";
import { evaluateTripwires, type TripwireEvidence } from "../contract/tripwire.js";
import type { ContextSummarizer } from "../context/context-pack.js";
import { toContextProjectionPlan } from "../context/materialize.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { validateOutputMap } from "../outputs/validate.js";
import {
  createExecutionPlanStub,
  markStage,
  withPlanAttemptEvidence,
  withPlanStatus,
  type ContextPackPlan,
  type ContextProjectionPlan,
  type ExecutionPlan,
  type ProviderPackagingPlan,
  type ProviderAttemptRecord,
  type RouteRejectReason,
  type SelectedRoute,
  type UsageRecord,
} from "../plan/plan.js";
import type { PolicySpec } from "../policy/policy.js";
import { collectStream } from "../providers/streaming.js";
import type {
  ProviderAdapter,
  ProviderGatewayMetadata,
  ProviderRunRequest,
  ProviderRunResponse,
  Usage,
} from "../providers/provider.js";
import { computeArtifactLineageMerkleRoot } from "../receipts/lineage.js";
import {
  issueReceiptFrom,
  preflightReceiptPolicy,
  resolveReceiptPolicy,
  type EffectiveReceiptPolicy,
} from "../receipts/policy.js";
import type {
  ContractVerdict,
  ReceiptModel,
  ReceiptRoute,
} from "../receipts/types.js";
import type { RunResult } from "../results/result.js";
import type { AuditErrorStage, PersistenceError } from "../results/errors.js";
import {
  validateSessionAppendResult,
  type AppendSessionTurnInput,
  type SessionRef,
} from "../sessions/session.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import type { ToolDefinition } from "../tools/tools.js";
import { createRunEvent, type RunEvent } from "../tracing/tracing.js";
import {
  normalizeConfig,
  type LatticeConfig,
  type NormalizedLatticeConfig,
} from "./config.js";
import {
  gatewayMetadataForRoute,
  prepareRun,
  prepareRouteAttempt,
  type PreparedRun,
  type PreparedRouteSuccess,
} from "./prepare-run.js";
import {
  ArtifactLifecycleFailure,
  persistArtifactLifecycle,
  type ArtifactLifecycleReport,
} from "./artifact-lifecycle.js";

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
  runAgent<const TOutputs extends OutputContractMap = import("../agent/types.js").DefaultAgentOutputs>(
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
  const receiptPolicy = receiptPolicyForConfig(normalized);
  const receiptPreflight = preflightReceiptPolicy(receiptPolicy);
  if (receiptPreflight?.status === "failed") {
    const plan = createExecutionPlanStub([receiptPreflight.error.message]);
    await emitEvent(normalized, events, createRunEvent("run.start", { runId }));
    await emitEvent(normalized, events, createRunEvent("receipt.issuance", {
      runId,
      planId: plan.id,
      metadata: {
        status: "failed",
        code: receiptPreflight.error.code,
        stage: receiptPreflight.error.stage,
      },
    }));
    await emitEvent(normalized, events, createRunEvent("run.failed", {
      runId,
      planId: plan.id,
      metadata: { reason: "audit", code: receiptPreflight.error.code },
    }));

    return {
      ok: false,
      error: receiptPreflight.error,
      usage: { ...ZERO_USAGE },
      plan,
      events,
    };
  }
  await emitEvent(normalized, events, createRunEvent("run.start", { runId }));

  const built = await buildPlan(normalized, intent, runId, events);
  let plan = built.plan;

  if (!built.ok) {
    const selectedFailureRoute = plan.route.selected;
    const receiptInput: MaybeIssueReceiptInput = {
      runId,
      ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
      artifacts: [],
      contractVerdict: "execution-failed",
      model: {
        requested: selectedFailureRoute?.modelId ?? intent.overrides?.model ?? "",
        observed: null,
      },
      route: {
        providerId: selectedFailureRoute?.providerId ?? "",
        capabilityId: selectedFailureRoute?.modelId ?? "",
        attemptNumber: 0,
      },
      usage: ZERO_USAGE,
    };
    await emitEvent(normalized, events, createRunEvent("run.failed", {
      runId,
      planId: plan.id,
      metadata: { reason: built.error.kind },
    }));

    return finalizeRunResult(normalized, events, receiptInput, "pre-execution", {
      ok: false,
      error: built.error,
      usage: { ...ZERO_USAGE },
      plan,
      events,
    });
  }

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
    const receiptInput: MaybeIssueReceiptInput = {
      runId,
      ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
      artifacts: [],
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
    };
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
        };
    await emitEvent(normalized, events, createRunEvent("run.failed", {
      runId,
      planId: plan.id,
      metadata: { reason: isContractFailure ? "no-contract-match" : "no-route" },
    }));

    return finalizeRunResult(
      normalized,
      events,
      receiptInput,
      "pre-execution",
      failure,
    );
  }

  const materialized = built.materialized;

  if (materialized === undefined) {
    const error = {
      kind: "context_materialization" as const,
      message: "Selected route has no provider-visible context projection.",
      reason: "missing-reference" as const,
      terminal: true as const,
    };
    plan = withPlanStatus(plan, "failed", {
      stages: markStage(plan.stages, "context-packing", "failed"),
      attempts: [],
    });
    await emitEvent(normalized, events, createRunEvent("run.failed", {
      runId,
      planId: plan.id,
      metadata: { reason: error.kind },
    }));

    return finalizeRunResult(normalized, events, {
      runId,
      ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
      artifacts: [],
      inputHashes: [],
      contractVerdict: "execution-failed",
      model: { requested: selected.modelId, observed: null },
      route: {
        providerId: selected.providerId,
        capabilityId: selected.modelId,
        attemptNumber: 0,
      },
      usage: ZERO_USAGE,
    }, "pre-execution", {
      ok: false,
      error,
      usage: { ...ZERO_USAGE },
      plan,
      events,
    });
  }

  const routes = [
    selected,
    ...plan.route.fallbackChain.map((fallback) =>
      routeFromCandidate(plan, fallback.providerId, fallback.modelId) ?? {
        providerId: fallback.providerId,
        modelId: fallback.modelId,
        score: fallback.score,
        estimates: selected.estimates,
        ...(selected.contextWindow !== undefined
          ? { contextWindow: selected.contextWindow }
          : {}),
        inputModalities: selected.inputModalities,
        outputModalities: selected.outputModalities,
        fileTransport: selected.fileTransport,
      } satisfies SelectedRoute,
    ),
  ];
  const attempts: ProviderAttemptRecord[] = [];
  let lastError: Error | undefined;
  let lastExecutedRoute: SelectedRoute | undefined;
  let lastExecutedPreparation: PreparedRouteSuccess | undefined;
  let anyExecutableAdapter = false;
  const streamingRequested = isStreamingRequested(built.mergedPolicy);

  for (const [index, route] of routes.entries()) {
    const startedAt = new Date().toISOString();
    const adapter = streamingRequested
      ? findStreamingAdapter(normalized, route.providerId)
      : findExecutableAdapter(normalized, route.providerId);

    if (adapter === undefined) {
      if (streamingRequested) {
        const message =
          `Streaming requested for provider ${route.providerId} but executeStream() is unavailable.`;
        attempts.push(
          attemptFailed(
            route.providerId,
            route.modelId,
            startedAt,
            new Date().toISOString(),
            message,
          ),
        );
        lastError = new Error(message);
        anyExecutableAdapter = true;
        continue;
      }
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

    const preparedRoute =
      index === 0
        ? {
            ok: true as const,
            contextPack: built.contextPack,
            materialized,
            packaging: built.packaging,
          }
        : await prepareRouteAttempt(
            normalized,
            intent,
            built.preparedArtifacts,
            route,
            {
              ...(built.mergedPolicy !== undefined
                ? { policy: built.mergedPolicy }
                : {}),
              ...(built.sessionRecord !== undefined
                ? { sessionRecord: built.sessionRecord }
                : {}),
            },
          );

    if (!preparedRoute.ok) {
      const completedAt = new Date().toISOString();
      const failedAttempt = attemptFailed(
        route.providerId,
        route.modelId,
        startedAt,
        completedAt,
        preparedRoute.error.message,
        {
          context: preparedRoute.contextPack,
          warnings: [preparedRoute.error.message],
        },
      );
      attempts.push(failedAttempt);
      const failedStages = markStage(
        markStage(plan.stages, preparedRoute.failedStage, "failed"),
        "execution",
        "skipped",
      );
      plan = withPlanAttemptEvidence(plan, "failed", {
        route,
        context: preparedRoute.contextPack,
        attempts,
        stages: failedStages,
        warnings: [preparedRoute.error.message],
        metadata: metadataForAttempt(plan, undefined),
      });
      await emitEvent(normalized, events, createRunEvent("context.packed", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "failed",
          failureKind: preparedRoute.error.kind,
          ...("reason" in preparedRoute.error
            ? { failureReason: preparedRoute.error.reason }
            : {}),
        },
      }));
      await emitEvent(normalized, events, createRunEvent("run.failed", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: { reason: preparedRoute.error.kind },
      }));
      const receiptInput: MaybeIssueReceiptInput = {
        runId,
        ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
        artifacts: [],
        inputHashes: [],
        contractVerdict: "execution-failed",
        model: { requested: route.modelId, observed: null },
        route: {
          providerId: route.providerId,
          capabilityId: route.modelId,
          attemptNumber: attempts.length,
        },
        usage: ZERO_USAGE,
      };

      return finalizeRunResult(normalized, events, receiptInput, "pre-execution", {
        ok: false,
        error: preparedRoute.error,
        usage: { ...ZERO_USAGE },
        plan,
        events,
      });
    }

    const attemptMaterialized = preparedRoute.materialized;
    const providerArtifacts = attemptMaterialized.artifacts;
    const attemptPackaging = preparedRoute.packaging;
    const attemptEvidence = evidenceForPreparedRoute(preparedRoute);
    const projectionMetadata = projectionEventMetadata(preparedRoute);
    if (index > 0) {
      await emitEvent(normalized, events, createRunEvent("context.packed", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "completed",
          estimatedTokens: preparedRoute.contextPack.estimatedTokens,
          included: preparedRoute.contextPack.included.length,
          summarized: preparedRoute.contextPack.summarized.length,
          ...projectionMetadata,
          inputHashes: attemptMaterialized.inputHashes,
        },
      }));
    }

    if (attemptPackaging.blocked.length > 0) {
      const message = attemptPackaging.blocked.join("; ");
      attempts.push(
        attemptFailed(
          route.providerId,
          route.modelId,
          startedAt,
          new Date().toISOString(),
          message,
          attemptEvidence,
        ),
      );
      plan = withPlanAttemptEvidence(plan, "running", {
        route,
        context: preparedRoute.contextPack,
        contextProjection: attemptEvidence.contextProjection,
        providerPackaging: attemptPackaging.plan,
        attempts,
        warnings: attemptMaterialized.warnings,
        metadata: metadataForAttempt(plan, undefined),
      });
      lastError = new Error(message);
      continue;
    }
    const gatewayMetadata = gatewayMetadataForRoute(
      route.providerId,
      route.modelId,
      built.mergedPolicy?.gateway,
    );
    const runningAttempt: ProviderAttemptRecord = {
      providerId: route.providerId,
      modelId: route.modelId,
      status: "running",
      startedAt,
      ...attemptEvidence,
    };
    plan = withPlanAttemptEvidence(plan, "running", {
      route,
      context: preparedRoute.contextPack,
      contextProjection: attemptEvidence.contextProjection,
      providerPackaging: attemptPackaging.plan,
      attempts: [...attempts, runningAttempt],
      stages: markStage(plan.stages, "execution", "running"),
      warnings: attemptMaterialized.warnings,
      metadata: metadataForAttempt(plan, gatewayMetadata),
    });
    const request: ProviderRunRequest = {
      task: intent.task,
      artifacts: providerArtifacts,
      outputs: Object.keys(intent.outputs),
      outputContracts: intent.outputs,
      ...(built.mergedPolicy !== undefined ? { policy: built.mergedPolicy } : {}),
      ...(intent.signal !== undefined ? { signal: intent.signal } : {}),
      plan,
      contextPack: preparedRoute.contextPack,
      providerPackaging: attemptPackaging.plan,
      packagedArtifacts: attemptPackaging.packagedArtifacts,
    };

    try {
      await emitEvent(normalized, events, createRunEvent("provider.attempt", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "started",
          fallback: index > 0,
          ...projectionMetadata,
          ...(gatewayMetadata !== undefined ? { gateway: gatewayMetadata } : {}),
        },
      }));
      await intent.overrides?.hooks?.beforeProviderCall?.({ plan, request });
      lastExecutedRoute = route;
      lastExecutedPreparation = preparedRoute;

      const response = streamingRequested
        ? await executeStreamingProvider({
            normalized,
            events,
            runId,
            plan,
            route,
            request,
            adapter: adapter as ProviderAdapter &
              Required<Pick<ProviderAdapter, "executeStream">>,
            ...(gatewayMetadata !== undefined ? { gatewayMetadata } : {}),
          })
        : await (adapter as ProviderAdapter &
            Required<Pick<ProviderAdapter, "execute">>).execute(request);
      await intent.overrides?.hooks?.afterProviderCall?.({ plan, response });
      await emitEvent(normalized, events, createRunEvent("provider.attempt", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "succeeded",
          fallback: index > 0,
          ...projectionMetadata,
          normalizedUsage: normalizeAdapterUsage(response),
          ...(response.gateway !== undefined
            ? { gateway: gatewayResponseMetadataForEvents(response.gateway) }
            : {}),
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
        attemptEvidence,
        response.gateway !== undefined
          ? { gateway: gatewayResponseMetadataForEvents(response.gateway) }
          : undefined,
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
          metadata: {
            failureKind: "validation",
            ...projectionMetadata,
          },
        }));
        if (index === routes.length - 1) {
          const receiptInput: MaybeIssueReceiptInput = {
            runId,
            ...(intent.contract !== undefined
              ? { contract: intent.contract }
              : {}),
            artifacts: providerArtifacts,
            inputHashes: attemptMaterialized.inputHashes,
            lineageArtifacts: [
              ...providerArtifacts,
              ...attemptPackaging.packagedArtifacts,
            ],
            contractVerdict: "validation-failed",
            model: { requested: route.modelId, observed: observedModelForReceipt(response) },
            route: {
              providerId: route.providerId,
              capabilityId: route.modelId,
              attemptNumber: attempts.length,
            },
            usage: normalizeAdapterUsage(response),
          };
          return finalizeRunResult(normalized, events, receiptInput, "post-execution", {
            ...validation,
            usage: normalizeAdapterUsage(response),
            plan: failedPlan,
            events,
            ...(response.gateway !== undefined ? { gateway: response.gateway } : {}),
          });
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
          const receiptInput: MaybeIssueReceiptInput = {
            runId,
            ...(intent.contract !== undefined
              ? { contract: intent.contract }
              : {}),
            artifacts: providerArtifacts,
            inputHashes: attemptMaterialized.inputHashes,
            lineageArtifacts: [
              ...providerArtifacts,
              ...attemptPackaging.packagedArtifacts,
            ],
            contractVerdict: "tripwire-violated",
            model: { requested: route.modelId, observed: observedModelForReceipt(response) },
            route: {
              providerId: route.providerId,
              capabilityId: route.modelId,
              attemptNumber: attempts.length,
            },
            usage: normalizeAdapterUsage(response),
            tripwireEvidence: tripwireResult.evidence,
          };
          // TERMINAL by design — isTerminal(error) === true; fallback chain
          // bypassed via early return before the `for` loop advances.
          return finalizeRunResult(normalized, events, receiptInput, "post-execution", {
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
          });
        }
      }

      attempts.push(succeededAttempt);
      const successValidation = validation as Extract<
        typeof validation,
        { ok: true }
      >;
      const partialOutputs = {
        ...successValidation.outputs,
      } as Record<string, unknown>;
      const routeLifecycleReports = [
        ...built.lifecycleReports,
        ...(index > 0 ? attemptMaterialized.summaryLifecycleReports : []),
      ];
      const outputPersistence = await persistProviderOutputs({
        response,
        route,
        projectionRefs: attemptMaterialized.artifactRefs,
        normalized,
        ...(built.mergedPolicy !== undefined
          ? { policy: built.mergedPolicy }
          : {}),
      });
      const postProviderStages = markPostProviderStages(
        plan.stages,
        built.toolResults.length,
        invariants.length,
      );

      if (!outputPersistence.ok) {
        const failedPlan = withPlanStatus(plan, "failed", {
          stages: markPersistenceStage(
            postProviderStages,
            [...routeLifecycleReports, ...outputPersistence.reports],
            {
              failure: {
                lifecycle: "provider-output",
                ...(outputPersistence.error.artifactId !== undefined
                  ? { artifactId: outputPersistence.error.artifactId }
                  : {}),
              },
            },
          ),
          attempts,
        });

        return postProviderPersistenceFailure(normalized, {
          runId,
          intent,
          error: outputPersistence.error,
          plan: failedPlan,
          events,
          route,
          preparedRoute,
          attempts,
          partialOutputs,
          artifactRefs: outputPersistence.artifactRefs,
          response,
          lineageArtifacts: [
            ...providerArtifacts,
            ...attemptPackaging.packagedArtifacts,
            ...outputPersistence.artifactRefs,
          ],
        });
      }

      const artifactRefs = outputPersistence.artifactRefs;
      const persistenceReports: PersistenceStageReport[] = [
        ...routeLifecycleReports.map(toPersistenceStageReport),
        ...outputPersistence.reports.map(toPersistenceStageReport),
      ];

      if (built.sessionRecord !== undefined && normalized.sessions !== undefined) {
        const sessionInputRefs = resolvableSessionRefs(
          attemptMaterialized.artifactRefs,
          normalized,
          built.mergedPolicy,
        );
        const sessionOutputRefs = outputPersistence.reports.flatMap((report) =>
          report.status === "stored" || report.status === "preserved"
            ? [report.ref]
            : [],
        );

        try {
          const appendInput: AppendSessionTurnInput = {
            sessionId: built.sessionRecord.id,
            task: intent.task,
            artifactRefs: sessionInputRefs,
            outputArtifactRefs: sessionOutputRefs,
            planId: plan.id,
            ...(built.sessionRecord.tenantId !== undefined
              ? { tenantId: built.sessionRecord.tenantId }
              : {}),
            ...(built.sessionRecord.privacy !== undefined
              ? { privacy: built.sessionRecord.privacy }
              : {}),
            ...(built.sessionRecord.retention !== undefined
              ? { retention: built.sessionRecord.retention }
              : {}),
          };
          const appended = await normalized.sessions.appendTurn(appendInput);
          validateSessionAppendResult(appended, appendInput);
          persistenceReports.push({
            lifecycle: "session",
            status: "stored",
            sessionId: built.sessionRecord.id,
          });
        } catch {
          const error = postProviderSessionError(built.sessionRecord.id);
          const failedPlan = withPlanStatus(plan, "failed", {
            stages: markPersistenceStage(
              postProviderStages,
              persistenceReports,
              {
                failure: {
                  lifecycle: "session",
                  sessionId: built.sessionRecord.id,
                },
              },
            ),
            attempts,
          });

          return postProviderPersistenceFailure(normalized, {
            runId,
            intent,
            error,
            plan: failedPlan,
            events,
            route,
            preparedRoute,
            attempts,
            partialOutputs,
            artifactRefs,
            response,
            lineageArtifacts: [
              ...providerArtifacts,
              ...attemptPackaging.packagedArtifacts,
              ...artifactRefs,
            ],
          });
        }
      }

      const completedPlan = withPlanStatus(plan, "completed", {
        stages: markPersistenceStage(postProviderStages, persistenceReports),
        attempts,
      });

      await emitEvent(normalized, events, createRunEvent("validation.complete", {
        runId,
        planId: completedPlan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: projectionMetadata,
      }));
      const receiptInput: MaybeIssueReceiptInput = {
        runId,
        ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
        artifacts: providerArtifacts,
        inputHashes: attemptMaterialized.inputHashes,
        lineageArtifacts: [
          ...providerArtifacts,
          ...attemptPackaging.packagedArtifacts,
          ...artifactRefs,
        ],
        contractVerdict: "success",
        model: { requested: route.modelId, observed: observedModelForReceipt(response) },
        route: {
          providerId: route.providerId,
          capabilityId: route.modelId,
          attemptNumber: attempts.length,
        },
        usage: normalizeAdapterUsage(response),
        outputs: JSON.stringify(successValidation.outputs),
      };

      const finalized = await finalizeRunResult(
        normalized,
        events,
        receiptInput,
        "post-execution",
        {
          ...validation,
          artifacts: artifactRefs,
          usage: normalizeAdapterUsage(response),
          plan: completedPlan,
          events,
          ...(response.gateway !== undefined
            ? { gateway: response.gateway }
            : {}),
        },
      );
      await emitEvent(
        normalized,
        events,
        createRunEvent(finalized.ok ? "run.complete" : "run.failed", {
          runId,
          planId: completedPlan.id,
          providerId: route.providerId,
          modelId: route.modelId,
          metadata: finalized.ok
            ? {
                ...projectionMetadata,
                persistenceStatus:
                  completedPlan.stages.find(
                    (stage) => stage.kind === "persistence",
                  )?.status ?? "skipped",
              }
            : { reason: "audit" },
        }),
      );
      return finalized;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const message =
        error instanceof Error ? error.message : "Provider adapter execution failed.";
      attempts.push(
        attemptFailed(
          route.providerId,
          route.modelId,
          startedAt,
          completedAt,
          message,
          attemptEvidence,
        ),
      );
      lastError = error instanceof Error ? error : new Error(message);
      await emitEvent(normalized, events, createRunEvent("provider.attempt", {
        runId,
        planId: plan.id,
        providerId: route.providerId,
        modelId: route.modelId,
        metadata: {
          status: "failed",
          failureKind: "provider_execution",
          ...projectionMetadata,
        },
      }));
    }
  }

  if (!anyExecutableAdapter) {
    const receiptInput: MaybeIssueReceiptInput = {
      runId,
      ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
      artifacts: [],
      inputHashes: [],
      contractVerdict: "execution-failed",
      model: { requested: selected.modelId, observed: null },
      route: {
        providerId: selected.providerId,
        capabilityId: selected.modelId,
        attemptNumber: 0,
      },
      usage: ZERO_USAGE,
    };
    return finalizeRunResult(normalized, events, receiptInput, "pre-execution", {
      ok: false,
      error: {
        kind: "execution_unavailable",
        message: "No Phase 1 provider adapter with execute() is configured.",
      },
      usage: { ...ZERO_USAGE },
      plan,
      events,
    });
  }

  const failedPlan = withPlanStatus(plan, "failed", {
    stages: markStage(plan.stages, "execution", "failed"),
    attempts,
  });
  await emitEvent(normalized, events, createRunEvent("run.failed", {
    runId,
    planId: failedPlan.id,
    ...(lastExecutedRoute !== undefined
      ? {
          providerId: lastExecutedRoute.providerId,
          modelId: lastExecutedRoute.modelId,
        }
      : {}),
    metadata: {
      reason: "provider_execution",
      ...(lastExecutedPreparation !== undefined
        ? projectionEventMetadata(lastExecutedPreparation)
        : {}),
    },
  }));

  const receiptInput: MaybeIssueReceiptInput = {
    runId,
    ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
    artifacts: lastExecutedPreparation?.materialized.artifacts ?? [],
    inputHashes: lastExecutedPreparation?.materialized.inputHashes ?? [],
    contractVerdict: "execution-failed",
    model: { requested: lastExecutedRoute?.modelId ?? selected.modelId, observed: null },
    route: {
      providerId: lastExecutedRoute?.providerId ?? selected.providerId,
      capabilityId: lastExecutedRoute?.modelId ?? selected.modelId,
      attemptNumber: attempts.length,
    },
    usage: UNMEASURED_USAGE,
  };

  return finalizeRunResult(normalized, events, receiptInput, "post-execution", {
    ok: false,
    error: {
      kind: "provider_execution",
      message: lastError?.message ?? "Provider adapter execution failed.",
      providerId: lastExecutedRoute?.providerId ?? selected.providerId,
      modelId: lastExecutedRoute?.modelId ?? selected.modelId,
    },
    usage: { ...UNMEASURED_USAGE },
    plan: failedPlan,
    events,
  });
}

async function buildPlan<const TOutputs extends OutputContractMap>(
  normalized: NormalizedLatticeConfig,
  intent: RunIntent<TOutputs>,
  runId = createRunId(),
  events: RunEvent[] = [],
): Promise<PreparedRun> {
  return prepareRun(normalized, intent, {
    runId,
    emit: (event) => emitEvent(normalized, events, event),
  });
}

function attemptSucceeded(
  providerId: string,
  modelId: string,
  startedAt: string,
  completedAt: string,
  usage?: UsageRecord,
  evidence?: AttemptEvidence,
  metadata?: Record<string, unknown>,
): ProviderAttemptRecord {
  return {
    providerId,
    modelId,
    status: "succeeded",
    startedAt,
    completedAt,
    ...(usage !== undefined ? { usage } : {}),
    ...(evidence !== undefined ? evidence : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function attemptFailed(
  providerId: string,
  modelId: string,
  startedAt: string,
  completedAt: string,
  error: string,
  evidence?: Partial<AttemptEvidence>,
): ProviderAttemptRecord {
  return {
    providerId,
    modelId,
    status: "failed",
    startedAt,
    completedAt,
    error,
    ...(evidence !== undefined ? evidence : {}),
  };
}

interface AttemptEvidence {
  readonly context: ContextPackPlan;
  readonly contextProjection: ContextProjectionPlan;
  readonly providerPackaging: ProviderPackagingPlan;
  readonly inputHashes: readonly string[];
  readonly warnings: readonly string[];
}

function evidenceForPreparedRoute(
  prepared: PreparedRouteSuccess,
): AttemptEvidence {
  const contextProjection = toContextProjectionPlan(prepared.materialized);

  return {
    context: prepared.contextPack,
    contextProjection,
    providerPackaging: prepared.packaging.plan,
    inputHashes: contextProjection.inputHashes,
    warnings: prepared.materialized.warnings,
  };
}

function projectionEventMetadata(
  prepared: PreparedRouteSuccess,
): Record<string, string | number> {
  return {
    projectionId: prepared.materialized.id,
    artifactCount: prepared.materialized.artifacts.length,
    summaryCount: prepared.materialized.summaryArtifactRefs.length,
    omitted: prepared.contextPack.omitted.length,
  };
}

function requestProjectionEventMetadata(
  request: ProviderRunRequest,
): Record<string, string | number> {
  const projection = request.plan?.contextProjection;

  return {
    ...(projection !== undefined ? { projectionId: projection.id } : {}),
    artifactCount: request.artifacts.length,
    summaryCount: projection?.summaryArtifactRefs.length ?? 0,
    omitted: request.contextPack?.omitted.length ?? 0,
  };
}

function metadataForAttempt(
  plan: ExecutionPlan,
  gateway: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const metadata = { ...plan.metadata };
  delete metadata.gateway;

  if (gateway !== undefined) {
    metadata.gateway = gateway;
  }

  return metadata;
}

interface ProviderOutputPersistenceSuccess {
  readonly ok: true;
  readonly artifactRefs: readonly ArtifactRef[];
  readonly reports: readonly ArtifactLifecycleReport[];
}

interface ProviderOutputPersistenceFailure {
  readonly ok: false;
  readonly error: PersistenceError;
  readonly artifactRefs: readonly ArtifactRef[];
  readonly reports: readonly ArtifactLifecycleReport[];
}

type ProviderOutputPersistence =
  | ProviderOutputPersistenceSuccess
  | ProviderOutputPersistenceFailure;

async function persistProviderOutputs(input: {
  readonly response: ProviderRunResponse;
  readonly route: SelectedRoute;
  readonly projectionRefs: readonly ArtifactRef[];
  readonly normalized: NormalizedLatticeConfig;
  readonly policy?: PolicySpec;
}): Promise<ProviderOutputPersistence> {
  const artifactRefs: ArtifactRef[] = [];
  const reports: ArtifactLifecycleReport[] = [];

  for (const output of input.response.artifactRefs ?? []) {
    const normalizedOutput: ArtifactInput = {
      ...output,
      ...(output.lineage === undefined
        ? {
            lineage: {
              parents: input.projectionRefs,
              transform: {
                kind: "model-output" as const,
                name: `${input.route.providerId}:${input.route.modelId}`,
              },
            },
          }
        : {}),
    };

    try {
      const persisted = await persistArtifactLifecycle(
        { artifact: normalizedOutput, lifecycle: "provider-output" },
        {
          ...(input.normalized.storage !== undefined
            ? { storage: input.normalized.storage }
            : {}),
          ...(input.policy !== undefined ? { policy: input.policy } : {}),
          postProvider: true,
        },
      );
      artifactRefs.push(persisted.report.ref);
      reports.push(persisted.report);
    } catch (cause) {
      return {
        ok: false,
        error: postProviderOutputError(cause, output.id),
        artifactRefs,
        reports,
      };
    }
  }

  return { ok: true, artifactRefs, reports };
}

function postProviderOutputError(
  cause: unknown,
  artifactId: string,
): PersistenceError {
  if (cause instanceof ArtifactLifecycleFailure) {
    return {
      kind: "persistence",
      message: cause.message,
      operation: cause.operation,
      lifecycle: cause.lifecycle,
      artifactId: cause.artifactId,
      ...(cause.storeId !== undefined ? { storeId: cause.storeId } : {}),
      postProvider: true,
      terminal: true,
    };
  }

  return {
    kind: "persistence",
    message: "Provider output lifecycle write failed.",
    operation: "write",
    lifecycle: "provider-output",
    artifactId,
    postProvider: true,
    terminal: true,
  };
}

function postProviderSessionError(sessionId: string): PersistenceError {
  return {
    kind: "persistence",
    message: "Session continuity write failed.",
    operation: "write",
    lifecycle: "session",
    sessionId,
    postProvider: true,
    terminal: true,
  };
}

interface PersistenceStageReport {
  readonly lifecycle: PersistenceError["lifecycle"];
  readonly status: "stored" | "preserved" | "skipped";
  readonly artifactId?: string;
  readonly sessionId?: string;
  readonly reason?: "unconfigured" | "policy";
}

function toPersistenceStageReport(
  report: ArtifactLifecycleReport,
): PersistenceStageReport {
  return {
    lifecycle: report.lifecycle,
    status: report.status,
    artifactId: report.artifactId,
    ...(report.status === "skipped" ? { reason: report.reason } : {}),
  };
}

function markPostProviderStages(
  stages: ExecutionPlan["stages"],
  toolCount: number,
  invariantCount: number,
): ExecutionPlan["stages"] {
  return markStage(
    markStage(
      markStage(
        markStage(stages, "execution", "completed"),
        "validation",
        "completed",
      ),
      "tool-execution",
      toolCount > 0 ? "completed" : "skipped",
    ),
    "tripwire",
    invariantCount > 0 ? "completed" : "skipped",
  );
}

function markPersistenceStage(
  stages: ExecutionPlan["stages"],
  reports: readonly (ArtifactLifecycleReport | PersistenceStageReport)[],
  input: {
    readonly failure?: {
      readonly lifecycle: PersistenceError["lifecycle"];
      readonly artifactId?: string;
      readonly sessionId?: string;
    };
  } = {},
): ExecutionPlan["stages"] {
  const safeReports = reports.map((report) =>
    "ref" in report ? toPersistenceStageReport(report) : report,
  );
  const status = input.failure !== undefined
    ? "failed"
    : safeReports.some(
        (report) => report.status === "stored" || report.status === "preserved",
      )
      ? "completed"
      : "skipped";

  return markStage(stages, "persistence", status, {
    reports: safeReports,
    ...(input.failure !== undefined
      ? {
          failure: {
            lifecycle: input.failure.lifecycle,
            ...(input.failure.artifactId !== undefined
              ? { artifactId: input.failure.artifactId }
              : {}),
            ...(input.failure.sessionId !== undefined
              ? { sessionId: input.failure.sessionId }
              : {}),
          },
        }
      : {}),
  });
}

function resolvableSessionRefs(
  refs: readonly ArtifactRef[],
  normalized: NormalizedLatticeConfig,
  policy: PolicySpec | undefined,
): readonly ArtifactRef[] {
  const storage = normalized.storage;
  const retention = policy?.retention ?? "session";

  if (storage === undefined || retention === "none") {
    return [];
  }

  return refs.filter(
    (ref) =>
      ref.storage?.storeId === storage.id &&
      ref.storage.tenantId === policy?.tenantId &&
      (ref.storage.retention ?? "session") === retention,
  );
}

async function postProviderPersistenceFailure<
  const TOutputs extends OutputContractMap,
>(
  normalized: NormalizedLatticeConfig,
  input: {
    readonly runId: string;
    readonly intent: RunIntent<TOutputs>;
    readonly error: PersistenceError;
    readonly plan: ExecutionPlan;
    readonly events: RunEvent[];
    readonly route: SelectedRoute;
    readonly preparedRoute: PreparedRouteSuccess;
    readonly attempts: readonly ProviderAttemptRecord[];
    readonly partialOutputs: Record<string, unknown>;
    readonly artifactRefs: readonly ArtifactRef[];
    readonly response: ProviderRunResponse;
    readonly lineageArtifacts: readonly (ArtifactInput | ArtifactRef)[];
  },
): Promise<RunResult<TOutputs>> {
  await emitEvent(normalized, input.events, createRunEvent("run.failed", {
    runId: input.runId,
    planId: input.plan.id,
    providerId: input.route.providerId,
    modelId: input.route.modelId,
    ...(input.error.artifactId !== undefined
      ? { artifactId: input.error.artifactId }
      : {}),
    metadata: {
      reason: "persistence",
      failureKind: input.error.kind,
      lifecycle: input.error.lifecycle,
      persistenceStatus: "failed",
      ...projectionEventMetadata(input.preparedRoute),
    },
  }));
  const receiptInput: MaybeIssueReceiptInput = {
    runId: input.runId,
    ...(input.intent.contract !== undefined
      ? { contract: input.intent.contract }
      : {}),
    artifacts: input.preparedRoute.materialized.artifacts,
    inputHashes: input.preparedRoute.materialized.inputHashes,
    lineageArtifacts: input.lineageArtifacts,
    contractVerdict: "execution-failed",
    model: {
      requested: input.route.modelId,
      observed: observedModelForReceipt(input.response),
    },
    route: {
      providerId: input.route.providerId,
      capabilityId: input.route.modelId,
      attemptNumber: input.attempts.length,
    },
    usage: normalizeAdapterUsage(input.response),
    outputs: JSON.stringify(input.partialOutputs),
  };

  return finalizeRunResult(
    normalized,
    input.events,
    receiptInput,
    "post-execution",
    {
      ok: false,
      error: input.error,
      usage: normalizeAdapterUsage(input.response),
      partialOutputs: input.partialOutputs,
      artifacts: input.artifactRefs,
      plan: input.plan,
      events: input.events,
      ...(input.response.gateway !== undefined
        ? { gateway: input.response.gateway }
        : {}),
    },
  );
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

function isStreamingRequested(policy: PolicySpec | undefined): boolean {
  return policy?.stream === true;
}

function findStreamingAdapter(
  normalized: NormalizedLatticeConfig,
  providerId: string,
): (ProviderAdapter & Required<Pick<ProviderAdapter, "executeStream">>) | undefined {
  return normalized.providers.find((provider) =>
    provider.kind === "provider-adapter" &&
    provider.id === providerId &&
    typeof provider.executeStream === "function",
  ) as (ProviderAdapter & Required<Pick<ProviderAdapter, "executeStream">>) | undefined;
}

async function executeStreamingProvider(input: {
  readonly normalized: NormalizedLatticeConfig;
  readonly events: RunEvent[];
  readonly runId: string;
  readonly plan: ExecutionPlan;
  readonly route: SelectedRoute;
  readonly request: ProviderRunRequest;
  readonly adapter: ProviderAdapter & Required<Pick<ProviderAdapter, "executeStream">>;
  readonly gatewayMetadata?: Record<string, unknown>;
}): Promise<ProviderRunResponse> {
  const projectionMetadata = requestProjectionEventMetadata(input.request);
  await emitEvent(input.normalized, input.events, createRunEvent("stream.start", {
    runId: input.runId,
    planId: input.plan.id,
    providerId: input.route.providerId,
    modelId: input.route.modelId,
    metadata: {
      status: "started",
      ...projectionMetadata,
      ...(input.gatewayMetadata !== undefined ? { gateway: input.gatewayMetadata } : {}),
    },
  }));

  try {
    const stream = await input.adapter.executeStream(input.request);
    const defaultOutput = input.request.outputs[0];
    const response = await collectStream(
      stream,
      defaultOutput !== undefined ? { defaultOutput } : {},
    );
    await emitEvent(input.normalized, input.events, createRunEvent("stream.complete", {
      runId: input.runId,
      planId: input.plan.id,
      providerId: input.route.providerId,
      modelId: input.route.modelId,
      metadata: {
        status: "completed",
        ...projectionMetadata,
        outputNames: Object.keys(response.rawOutputs),
        ...(response.gateway !== undefined
          ? { gateway: gatewayResponseMetadataForEvents(response.gateway) }
          : {}),
      },
    }));

    return response;
  } catch (error) {
    await emitEvent(input.normalized, input.events, createRunEvent("stream.failed", {
      runId: input.runId,
      planId: input.plan.id,
      providerId: input.route.providerId,
      modelId: input.route.modelId,
      metadata: {
        status: "failed",
        failureKind: "provider_execution",
        ...projectionMetadata,
      },
    }));
    throw error;
  }
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
    contextWindow: candidate.capability.contextWindow,
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

function gatewayResponseMetadataForEvents(
  gateway: ProviderGatewayMetadata,
): Record<string, unknown> {
  return {
    used: gateway.used,
    ...(gateway.requestedModel !== undefined
      ? { requestedModel: gateway.requestedModel }
      : {}),
    ...(gateway.observedModel !== undefined
      ? { observedModel: gateway.observedModel }
      : {}),
    ...(gateway.fallbackModels !== undefined
      ? { fallbackModels: gateway.fallbackModels }
      : {}),
  };
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
  readonly inputHashes?: readonly string[];
  readonly lineageArtifacts?: readonly (ArtifactInput | ArtifactRef)[];
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

function receiptPolicyForConfig(
  normalized: NormalizedLatticeConfig,
): EffectiveReceiptPolicy {
  return resolveReceiptPolicy({
    ...(normalized.receiptMode !== undefined
      ? { mode: normalized.receiptMode }
      : {}),
    ...(normalized.signer !== undefined ? { signer: normalized.signer } : {}),
  });
}

async function maybeIssueReceipt(
  policy: EffectiveReceiptPolicy,
  input: MaybeIssueReceiptInput,
  stage: AuditErrorStage,
) {
  return issueReceiptFrom(
    async () => {
      const inputHashes =
        input.inputHashes ?? await hashInputArtifacts(input.artifacts);
      const lineageMerkleRoot = await computeArtifactLineageMerkleRoot(
        input.lineageArtifacts ?? input.artifacts,
      );
      const outputHash =
        input.outputs === undefined
          ? null
          : ((await fingerprintArtifactValue(input.outputs))?.value ?? null);
      const contractHash = await sha256HexOfCanonicalContract(input.contract);
      const modelClass = resolveReceiptModelClass(input.route, input.model);
      return {
        runId: input.runId,
        model: input.model,
        route: input.route,
        ...(modelClass !== undefined ? { modelClass } : {}),
        ...(lineageMerkleRoot !== undefined ? { lineageMerkleRoot } : {}),
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
      };
    },
    policy,
    stage,
  );
}

async function finalizeRunResult<const TOutputs extends OutputContractMap>(
  normalized: NormalizedLatticeConfig,
  events: RunEvent[],
  receiptInput: MaybeIssueReceiptInput,
  stage: AuditErrorStage,
  result: RunResult<TOutputs>,
): Promise<RunResult<TOutputs>> {
  const policy = receiptPolicyForConfig(normalized);
  const outcome = await maybeIssueReceipt(policy, receiptInput, stage);

  if (outcome.status === "issued") {
    return { ...result, receipt: outcome.envelope };
  }

  if (outcome.status !== "failed") {
    return result;
  }

  await emitEvent(normalized, events, createRunEvent("receipt.issuance", {
    runId: receiptInput.runId,
    planId: result.plan.id,
    metadata: {
      status: "failed",
      code: outcome.error.code,
      stage: outcome.error.stage,
    },
  }));

  if (policy.mode !== "required") {
    return result;
  }

  if (result.ok) {
    return {
      ok: false,
      error: outcome.error,
      usage: result.usage,
      partialOutputs: result.outputs as Record<string, unknown>,
      artifacts: result.artifacts,
      plan: result.plan,
      events,
      ...(result.gateway !== undefined ? { gateway: result.gateway } : {}),
    };
  }

  return {
    ok: false,
    error: outcome.error,
    usage: result.usage,
    ...(result.partialOutputs !== undefined
      ? { partialOutputs: result.partialOutputs }
      : {}),
    ...(result.artifacts !== undefined ? { artifacts: result.artifacts } : {}),
    plan: result.plan,
    events,
    ...(result.gateway !== undefined ? { gateway: result.gateway } : {}),
  };
}
