import type { ArtifactRef, ArtifactSize } from "../artifacts/artifact.js";
import type { ArtifactLineage } from "../artifacts/lineage.js";
import type { CapabilityContract } from "../contract/contract.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { InferOutputMap } from "../outputs/infer.js";
import type {
  ContextPackItemPlan,
  ContextPackPlan,
  ContextProjectionPlan,
  ExecutionPlan,
  ExecutionPlanStage,
  ProviderAttemptRecord,
  ProviderPackagingPlan,
  RouteCandidate,
  RouteDecision,
  SelectedRoute,
  UsageRecord,
} from "../plan/plan.js";
import type { Usage } from "../providers/provider.js";
import type { ReceiptEnvelope } from "../receipts/types.js";
import type { RunResult } from "../results/result.js";
import type { AI, RunIntent } from "../runtime/create-ai.js";
import type { RunEvent } from "../tracing/tracing.js";
import { latticeVersion } from "../version.js";

export interface ReplayEnvelope<TOutputs extends OutputContractMap = OutputContractMap> {
  readonly kind: "replay-envelope";
  readonly version: 1;
  readonly runtimeVersion: string;
  readonly catalogVersion: string;
  readonly createdAt: string;
  readonly plan: ExecutionPlan;
  readonly artifacts: readonly ArtifactRef[];
  readonly outputs?: InferOutputMap<TOutputs>;
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
  readonly usage?: UsageRecord;
  readonly events: readonly RunEvent[];
  /**
   * Phase 10 — optional signed receipt recorded alongside the envelope so a
   * single artifact is sufficient to materialize an offline replay session
   * deterministically. Type-only import — replay.ts stays runtime-import-free
   * of the receipts builder.
   */
  readonly receipt?: ReceiptEnvelope;
  /**
   * Phase 10 — optional contract recorded so replays can re-run pre-flight
   * checks deterministically.
   */
  readonly contract?: CapabilityContract;
}

export function createReplayEnvelope<TOutputs extends OutputContractMap>(
  result: RunResult<TOutputs>,
): ReplayEnvelope<TOutputs> {
  if (result.plan.kind !== "execution-plan") {
    throw new Error("Replay envelopes require an execution plan.");
  }

  const usage = result.plan.attempts.at(-1)?.usage;

  return {
    kind: "replay-envelope",
    version: 1,
    runtimeVersion: latticeVersion,
    catalogVersion: result.plan.route.catalogVersion,
    createdAt: new Date().toISOString(),
    plan: redactPlan(result.plan),
    artifacts: result.ok ? result.artifacts : result.plan.artifactRefs,
    ...(result.ok ? { outputs: result.outputs } : {}),
    warnings: result.plan.warnings,
    errors: result.ok ? [] : [result.error.message],
    ...(usage !== undefined ? { usage } : {}),
    events: result.events ?? [],
  };
}

export async function replayOffline<TOutputs extends OutputContractMap>(
  envelope: ReplayEnvelope<TOutputs>,
): Promise<RunResult<TOutputs>> {
  const replayedUsage = envelopeUsage(envelope);
  if (envelope.outputs === undefined) {
    return {
      ok: false,
      error: {
        kind: "execution_unavailable",
        message: "Replay envelope does not contain successful outputs.",
      },
      usage: replayedUsage,
      plan: envelope.plan,
      events: envelope.events,
    };
  }

  return {
    ok: true,
    outputs: envelope.outputs,
    artifacts: envelope.artifacts,
    usage: replayedUsage,
    plan: envelope.plan,
    events: envelope.events,
  };
}

function envelopeUsage(envelope: ReplayEnvelope<OutputContractMap>): Usage {
  if (envelope.usage === undefined) {
    return { promptTokens: 0, completionTokens: 0, costUsd: null };
  }
  return {
    promptTokens: envelope.usage.inputTokens ?? 0,
    completionTokens: envelope.usage.outputTokens ?? 0,
    costUsd: envelope.usage.costUsd ?? null,
  };
}

export async function rerunLive<TOutputs extends OutputContractMap>(
  ai: AI,
  envelope: ReplayEnvelope<TOutputs>,
  intent: RunIntent<TOutputs>,
): Promise<RunResult<TOutputs>> {
  const result = await ai.run(intent);

  if (result.plan.kind === "execution-plan") {
    return {
      ...result,
      plan: {
        ...result.plan,
        warnings: [
          ...result.plan.warnings,
          `Live rerun of ${envelope.plan.id}: provider behavior, model versions, cost, and latency may differ.`,
        ],
      },
    };
  }

  return result;
}

export function redactReplayEnvelope<TOutputs extends OutputContractMap>(
  envelope: ReplayEnvelope<TOutputs>,
): ReplayEnvelope<TOutputs> {
  return {
    kind: envelope.kind,
    version: envelope.version,
    runtimeVersion: envelope.runtimeVersion,
    catalogVersion: envelope.catalogVersion,
    createdAt: envelope.createdAt,
    plan: redactPlan(envelope.plan),
    artifacts: envelope.artifacts.map(redactArtifactRef),
    ...(envelope.outputs !== undefined ? { outputs: envelope.outputs } : {}),
    warnings: redactWarnings(envelope.warnings),
    errors: envelope.errors.map(() => "redacted-error"),
    ...(envelope.usage !== undefined ? { usage: redactUsage(envelope.usage) } : {}),
    events: envelope.events.map(redactRunEvent),
    ...(envelope.receipt !== undefined ? { receipt: envelope.receipt } : {}),
    ...(envelope.contract !== undefined ? { contract: envelope.contract } : {}),
  };
}

export function redactPlan(plan: ExecutionPlan): ExecutionPlan {
  const metadata = redactPlanMetadata(plan.metadata);

  return {
    id: plan.id,
    kind: plan.kind,
    version: plan.version,
    createdAt: plan.createdAt,
    status: plan.status,
    task: "redacted-task",
    outputNames: [...plan.outputNames],
    artifactRefs: plan.artifactRefs.map(redactArtifactRef),
    route: redactRouteDecision(plan.route),
    stages: plan.stages.map(redactStage),
    ...(plan.context !== undefined ? { context: redactContextPack(plan.context) } : {}),
    ...(plan.contextProjection !== undefined
      ? { contextProjection: redactContextProjection(plan.contextProjection) }
      : {}),
    ...(plan.providerPackaging !== undefined
      ? { providerPackaging: redactProviderPackaging(plan.providerPackaging) }
      : {}),
    attempts: plan.attempts.map(redactAttempt),
    warnings: redactWarnings(plan.warnings),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

export function redactArtifactRef(ref: ArtifactRef): ArtifactRef {
  const metadata = redactArtifactMetadata(ref);

  return {
    id: ref.id,
    kind: ref.kind,
    source: ref.source,
    privacy: ref.privacy,
    ...(ref.mediaType !== undefined ? { mediaType: ref.mediaType } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(ref.size !== undefined ? { size: redactArtifactSize(ref.size) } : {}),
    ...(ref.fingerprint !== undefined
      ? {
          fingerprint: {
            algorithm: ref.fingerprint.algorithm,
            value: ref.fingerprint.value,
          },
        }
      : {}),
    ...(ref.lineage !== undefined ? { lineage: redactLineage(ref.lineage) } : {}),
  };
}

function redactRouteDecision(route: RouteDecision): RouteDecision {
  return {
    catalogVersion: route.catalogVersion,
    ...(route.selected !== undefined ? { selected: redactSelectedRoute(route.selected) } : {}),
    candidates: route.candidates.map(redactRouteCandidate),
    rejected: route.rejected.map(redactRouteCandidate),
    fallbackChain: route.fallbackChain.map((fallback) => ({
      providerId: fallback.providerId,
      modelId: fallback.modelId,
      score: fallback.score,
      ...(fallback.estimates !== undefined
        ? { estimates: redactRouteEstimates(fallback.estimates) }
        : {}),
      reason: fallback.reason,
    })),
    noRouteReasons: route.noRouteReasons.map((reason) => ({
      code: reason.code,
      message: "redacted-route-reason",
    })),
  };
}

function redactSelectedRoute(route: SelectedRoute): SelectedRoute {
  return {
    providerId: route.providerId,
    modelId: route.modelId,
    score: route.score,
    estimates: redactRouteEstimates(route.estimates),
    ...(route.contextWindow !== undefined ? { contextWindow: route.contextWindow } : {}),
    inputModalities: [...route.inputModalities],
    outputModalities: [...route.outputModalities],
    fileTransport: [...route.fileTransport],
  };
}

function redactRouteCandidate(candidate: RouteCandidate): RouteCandidate {
  const capability = candidate.capability;

  return {
    providerId: candidate.providerId,
    modelId: candidate.modelId,
    capability: {
      providerId: capability.providerId,
      modelId: capability.modelId,
      inputModalities: [...capability.inputModalities],
      outputModalities: [...capability.outputModalities],
      fileTransport: [...capability.fileTransport],
      contextWindow: capability.contextWindow,
      structuredOutput: capability.structuredOutput,
      toolUse: capability.toolUse,
      streaming: capability.streaming,
      ...(capability.pricing !== undefined
        ? {
            pricing: {
              ...(capability.pricing.inputCostPer1M !== undefined
                ? { inputCostPer1M: capability.pricing.inputCostPer1M }
                : {}),
              ...(capability.pricing.outputCostPer1M !== undefined
                ? { outputCostPer1M: capability.pricing.outputCostPer1M }
                : {}),
              ...(capability.pricing.inputPer1kTokens !== undefined
                ? { inputPer1kTokens: capability.pricing.inputPer1kTokens }
                : {}),
              ...(capability.pricing.outputPer1kTokens !== undefined
                ? { outputPer1kTokens: capability.pricing.outputPer1kTokens }
                : {}),
            },
          }
        : {}),
      latency: capability.latency,
      dataPolicy: {
        privacy: [...capability.dataPolicy.privacy],
        ...(capability.dataPolicy.uploadRetention !== undefined
          ? { uploadRetention: capability.dataPolicy.uploadRetention }
          : {}),
        ...(capability.dataPolicy.supportsNoLogging !== undefined
          ? { supportsNoLogging: capability.dataPolicy.supportsNoLogging }
          : {}),
        ...(capability.dataPolicy.supportsNoTraining !== undefined
          ? { supportsNoTraining: capability.dataPolicy.supportsNoTraining }
          : {}),
      },
      ...(capability.available !== undefined ? { available: capability.available } : {}),
    },
    score: candidate.score,
    accepted: candidate.accepted,
    reasons: candidate.reasons.map((reason) => ({
      code: reason.code,
      message: "redacted-route-reason",
    })),
    estimates: redactRouteEstimates(candidate.estimates),
  };
}

function redactRouteEstimates(
  estimates: SelectedRoute["estimates"],
): SelectedRoute["estimates"] {
  return {
    inputTokens: estimates.inputTokens,
    outputTokens: estimates.outputTokens,
    ...(estimates.costEstimate !== undefined
      ? {
          costEstimate: {
            version: estimates.costEstimate.version,
            status: estimates.costEstimate.status,
            input: { ...estimates.costEstimate.input },
            output: { ...estimates.costEstimate.output },
            totalCostUsd: estimates.costEstimate.totalCostUsd,
            unknownReasons: [...estimates.costEstimate.unknownReasons],
          },
        }
      : {}),
    ...(estimates.costUsd !== undefined ? { costUsd: estimates.costUsd } : {}),
    ...(estimates.latencyMs !== undefined ? { latencyMs: estimates.latencyMs } : {}),
  };
}

function redactContextPack(context: ContextPackPlan): ContextPackPlan {
  return {
    id: context.id,
    tokenBudget: context.tokenBudget,
    estimatedTokens: context.estimatedTokens,
    included: context.included.map(redactContextItem),
    summarized: context.summarized.map(redactContextItem),
    archived: context.archived.map(redactContextItem),
    omitted: context.omitted.map(redactContextItem),
    warnings: redactWarnings(context.warnings),
  };
}

function redactContextItem(item: ContextPackItemPlan): ContextPackItemPlan {
  return {
    ...(item.artifactId !== undefined ? { artifactId: item.artifactId } : {}),
    ...(item.artifactIds !== undefined ? { artifactIds: [...item.artifactIds] } : {}),
    ...(item.summaryArtifactIds !== undefined
      ? { summaryArtifactIds: [...item.summaryArtifactIds] }
      : {}),
    ...(item.sessionTurnId !== undefined ? { sessionTurnId: item.sessionTurnId } : {}),
    reason: contextReasonCode(item.reason),
    estimatedTokens: item.estimatedTokens,
    trust: item.trust,
  };
}

function redactContextProjection(
  projection: ContextProjectionPlan,
): ContextProjectionPlan {
  return {
    id: projection.id,
    providerId: projection.providerId,
    modelId: projection.modelId,
    artifactRefs: projection.artifactRefs.map(redactArtifactRef),
    summaryArtifactRefs: projection.summaryArtifactRefs.map(redactArtifactRef),
    inputHashes: [...projection.inputHashes],
    omittedArtifactIds: [...projection.omittedArtifactIds],
    warnings: redactWarnings(projection.warnings),
  };
}

function redactProviderPackaging(
  packaging: ProviderPackagingPlan,
): ProviderPackagingPlan {
  return {
    providerId: packaging.providerId,
    modelId: packaging.modelId,
    artifacts: packaging.artifacts.map((item) => ({
      artifactId: item.artifactId,
      transport: item.transport,
      ...(item.mediaType !== undefined ? { mediaType: item.mediaType } : {}),
      lineageTransform: item.lineageTransform,
      ...(item.providerRequest !== undefined
        ? {
            providerRequest: {
              shape: item.providerRequest.shape,
              sourceType: item.providerRequest.sourceType,
              reason: packagingReasonCode(item.providerRequest.reason),
              ...(item.providerRequest.mediaType !== undefined
                ? { mediaType: item.providerRequest.mediaType }
                : {}),
              ...(item.providerRequest.sizeBytes !== undefined
                ? { sizeBytes: item.providerRequest.sizeBytes }
                : {}),
              ...(item.providerRequest.reference !== undefined
                ? { reference: { kind: item.providerRequest.reference.kind } }
                : {}),
            },
          }
        : {}),
      warnings: redactWarnings(item.warnings),
    })),
    warnings: redactWarnings(packaging.warnings),
  };
}

function redactAttempt(attempt: ProviderAttemptRecord): ProviderAttemptRecord {
  const metadata = redactAttemptMetadata(attempt.metadata);

  return {
    providerId: attempt.providerId,
    modelId: attempt.modelId,
    status: attempt.status,
    ...(attempt.startedAt !== undefined ? { startedAt: attempt.startedAt } : {}),
    ...(attempt.completedAt !== undefined ? { completedAt: attempt.completedAt } : {}),
    ...(attempt.error !== undefined ? { error: "redacted-attempt-error" } : {}),
    ...(attempt.usage !== undefined ? { usage: redactUsage(attempt.usage) } : {}),
    ...(attempt.context !== undefined ? { context: redactContextPack(attempt.context) } : {}),
    ...(attempt.contextProjection !== undefined
      ? { contextProjection: redactContextProjection(attempt.contextProjection) }
      : {}),
    ...(attempt.providerPackaging !== undefined
      ? { providerPackaging: redactProviderPackaging(attempt.providerPackaging) }
      : {}),
    ...(attempt.inputHashes !== undefined ? { inputHashes: [...attempt.inputHashes] } : {}),
    ...(attempt.warnings !== undefined ? { warnings: redactWarnings(attempt.warnings) } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function redactStage(stage: ExecutionPlanStage): ExecutionPlanStage {
  const metadata = redactStageMetadata(stage.metadata);

  return {
    id: stage.id,
    kind: stage.kind,
    status: stage.status,
    ...(stage.inputArtifacts !== undefined
      ? { inputArtifacts: [...stage.inputArtifacts] }
      : {}),
    ...(stage.outputArtifacts !== undefined
      ? { outputArtifacts: [...stage.outputArtifacts] }
      : {}),
    warnings: redactWarnings(stage.warnings),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function redactStageMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const safe: Record<string, unknown> = {};
  assignFiniteNumber(safe, "artifactCount", metadata.artifactCount);
  assignSafeString(safe, "invariantId", metadata.invariantId);

  if (Array.isArray(metadata.reports)) {
    const reports = metadata.reports
      .map(redactLifecycleReport)
      .filter((report): report is Record<string, unknown> => report !== undefined);
    if (reports.length > 0) {
      safe.reports = reports;
    }
  }

  const failure = redactLifecycleFailure(metadata.failure);
  if (failure !== undefined) {
    safe.failure = failure;
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactLifecycleReport(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const lifecycle = safeLifecycle(value.lifecycle);
  const status = safePersistenceStatus(value.status);
  if (lifecycle === undefined || status === undefined) {
    return undefined;
  }

  return {
    lifecycle,
    status,
    ...(typeof value.artifactId === "string" ? { artifactId: value.artifactId } : {}),
    ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}),
    ...(value.reason === "unconfigured" || value.reason === "policy"
      ? { reason: value.reason }
      : {}),
  };
}

function redactLifecycleFailure(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const lifecycle = safeLifecycle(value.lifecycle);
  if (lifecycle === undefined) {
    return undefined;
  }

  return {
    lifecycle,
    ...(typeof value.artifactId === "string" ? { artifactId: value.artifactId } : {}),
    ...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}),
  };
}

function redactPlanMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const safe: Record<string, unknown> = {};
  assignSafeString(safe, "receiptId", metadata.receiptId);
  assignSafeString(safe, "runId", metadata.runId);
  assignSafeBoolean(safe, "materialized", metadata.materialized);
  assignSafeBoolean(safe, "externalExecution", metadata.externalExecution);

  if (isBoundedFailureKind(metadata.contractVerdict)) {
    safe.contractVerdict = metadata.contractVerdict;
  }
  if (
    Array.isArray(metadata.summaryArtifactIds) &&
    metadata.summaryArtifactIds.every((value) => typeof value === "string")
  ) {
    safe.summaryArtifactIds = [...metadata.summaryArtifactIds];
  }

  const preparationFailure = redactFailureDescriptor(metadata.preparationFailure);
  if (preparationFailure !== undefined) {
    safe.preparationFailure = preparationFailure;
  }

  const gateway = redactGatewayMetadata(metadata.gateway);
  if (gateway !== undefined) {
    safe.gateway = gateway;
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactAttemptMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const safe = redactPlanMetadata(metadata) ?? {};
  const gateway = redactGatewayMetadata(metadata.gateway);
  if (gateway !== undefined) {
    safe.gateway = gateway;
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactFailureDescriptor(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value) || !isBoundedFailureKind(value.kind)) {
    return undefined;
  }

  return {
    kind: value.kind,
    ...(isBoundedFailureReason(value.reason) ? { reason: value.reason } : {}),
  };
}

function redactGatewayMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const safe: Record<string, unknown> = {};
  assignSafeBoolean(safe, "used", value.used);
  assignSafeString(safe, "providerId", value.providerId);
  assignSafeString(safe, "selectedProviderId", value.selectedProviderId);
  assignSafeString(safe, "requestedModel", value.requestedModel);
  assignSafeString(safe, "observedModel", value.observedModel);
  if (
    Array.isArray(value.fallbackModels) &&
    value.fallbackModels.every((model) => typeof model === "string")
  ) {
    safe.fallbackModels = [...value.fallbackModels];
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactRunEvent(event: RunEvent): RunEvent {
  const metadata = redactEventMetadata(event.metadata);

  return {
    kind: event.kind,
    timestamp: event.timestamp,
    runId: event.runId,
    ...(event.planId !== undefined ? { planId: event.planId } : {}),
    ...(event.stageId !== undefined ? { stageId: event.stageId } : {}),
    ...(event.providerId !== undefined ? { providerId: event.providerId } : {}),
    ...(event.modelId !== undefined ? { modelId: event.modelId } : {}),
    ...(event.artifactId !== undefined ? { artifactId: event.artifactId } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

function redactEventMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const safe: Record<string, unknown> = {};
  if (isEventStatus(metadata.status)) {
    safe.status = metadata.status;
  }
  if (isBoundedFailureKind(metadata.failureKind)) {
    safe.failureKind = metadata.failureKind;
  }
  if (isBoundedFailureReason(metadata.failureReason)) {
    safe.failureReason = metadata.failureReason;
  }
  if (isBoundedFailureReason(metadata.reason)) {
    safe.reason = metadata.reason;
  }
  const lifecycle = safeLifecycle(metadata.lifecycle);
  if (lifecycle !== undefined) {
    safe.lifecycle = lifecycle;
  } else if (Array.isArray(metadata.lifecycle)) {
    const reports = metadata.lifecycle
      .map(redactLifecycleReport)
      .filter((report): report is Record<string, unknown> => report !== undefined);
    if (reports.length > 0) {
      safe.lifecycle = reports;
    }
  }
  const persistenceStatus = safePersistenceStatus(metadata.persistenceStatus);
  if (persistenceStatus !== undefined) {
    safe.persistenceStatus = persistenceStatus;
  }

  for (const key of [
    "artifactCount",
    "estimatedTokens",
    "fallbacks",
    "included",
    "omitted",
    "rejected",
    "summarized",
    "summaryCount",
  ] as const) {
    assignFiniteNumber(safe, key, metadata[key]);
  }
  assignSafeBoolean(safe, "fallback", metadata.fallback);
  for (const key of ["invariantId", "projectionId", "receiptId", "selected"] as const) {
    assignSafeString(safe, key, metadata[key]);
  }
  if (
    Array.isArray(metadata.inputHashes) &&
    metadata.inputHashes.every((hash) => typeof hash === "string")
  ) {
    safe.inputHashes = [...metadata.inputHashes];
  }

  const usage = redactUsageMetadata(metadata.normalizedUsage ?? metadata.usage);
  if (usage !== undefined) {
    safe.normalizedUsage = usage;
  }
  const gateway = redactGatewayMetadata(metadata.gateway);
  if (gateway !== undefined) {
    safe.gateway = gateway;
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactUsageMetadata(value: unknown): Record<string, number | null> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const safe: Record<string, number | null> = {};
  for (const key of [
    "promptTokens",
    "completionTokens",
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "costUsd",
    "latencyMs",
  ] as const) {
    if (typeof value[key] === "number" && Number.isFinite(value[key])) {
      safe[key] = value[key];
    } else if (key === "costUsd" && value[key] === null) {
      safe[key] = null;
    }
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactArtifactMetadata(ref: ArtifactRef): Record<string, unknown> | undefined {
  const safe: Record<string, unknown> = {};
  const trust = ref.metadata?.trust;
  if (
    trust === "developer" ||
    trust === "user" ||
    trust === "tool" ||
    trust === "model-summary"
  ) {
    safe.trust = trust;
  }
  const sourceArtifactIds = ref.metadata?.sourceArtifactIds;
  if (
    Array.isArray(sourceArtifactIds) &&
    sourceArtifactIds.every((id) => typeof id === "string")
  ) {
    safe.sourceArtifactIds = [...sourceArtifactIds];
  }
  if (ref.source === "url") {
    safe.redactedSource = "url";
  }

  return Object.keys(safe).length > 0 ? safe : undefined;
}

function redactArtifactSize(size: ArtifactSize): ArtifactSize {
  return {
    ...(size.bytes !== undefined ? { bytes: size.bytes } : {}),
    ...(size.characters !== undefined ? { characters: size.characters } : {}),
    ...(size.pages !== undefined ? { pages: size.pages } : {}),
    ...(size.width !== undefined ? { width: size.width } : {}),
    ...(size.height !== undefined ? { height: size.height } : {}),
    ...(size.durationMs !== undefined ? { durationMs: size.durationMs } : {}),
  };
}

function redactLineage(lineage: ArtifactLineage): ArtifactLineage {
  return {
    parents: lineage.parents.map(redactArtifactRef),
    transform: { kind: lineage.transform.kind },
  };
}

function redactUsage(usage: UsageRecord): UsageRecord {
  return {
    ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
    ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
    ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
    ...(usage.costUsd !== undefined ? { costUsd: usage.costUsd } : {}),
    ...(usage.latencyMs !== undefined ? { latencyMs: usage.latencyMs } : {}),
  };
}

function redactWarnings(warnings: readonly string[]): readonly string[] {
  return [...new Set(warnings.map(warningCode))];
}

function warningCode(warning: string): string {
  if (warning.startsWith("Duplicate artifact ")) {
    return "context-duplicate-artifact";
  }
  if (warning.startsWith("Duplicate session turn ")) {
    return "context-duplicate-session-turn";
  }
  if (warning.includes("omitted") || warning.includes("unavailable")) {
    return "context-artifact-omitted";
  }
  if (warning.includes("summarizer")) {
    return "context-summary-skipped";
  }
  if (warning.includes("base64") || warning.includes("inline media limit")) {
    return "packaging-inline-media";
  }
  if (warning.includes("selected route")) {
    return "packaging-no-route";
  }
  if (warning.includes("policy-safe transport") || warning.includes("provider upload")) {
    return "packaging-transport-unavailable";
  }
  return "redacted-warning";
}

function contextReasonCode(reason: string): string {
  if (reason === "Run artifact included for provider consideration.") {
    return "run-artifact-included";
  }
  if (reason.includes("needs summary packaging")) {
    return "summary-required";
  }
  if (reason.includes("cannot be summarized")) {
    return "context-budget-omitted";
  }
  if (reason.startsWith("Prior session summary covers turns:")) {
    return "session-summary-included";
  }
  if (reason.startsWith("Prior session summary archived")) {
    return "session-summary-archived";
  }
  if (reason === "Prior session turn retained for continuity.") {
    return "session-turn-included";
  }
  if (reason.startsWith("Prior session turn archived because selected summary")) {
    return "session-turn-covered";
  }
  if (reason === "Prior session turn archived because the run budget was exhausted.") {
    return "session-turn-archived";
  }
  if (reason.includes("stored value was unavailable")) {
    return "stored-value-unavailable";
  }
  if (reason.includes("no context summarizer")) {
    return "summarizer-unconfigured";
  }
  return "redacted-context-reason";
}

function packagingReasonCode(reason: string): string {
  if (reason.includes("provider file reference")) {
    return "provider-file-reference";
  }
  if (reason.includes("URL metadata") || reason === "URL artifact can be referenced directly.") {
    return "url-reference";
  }
  if (reason.includes("inline media bytes") || reason.includes("sent inline")) {
    return "inline-content";
  }
  if (reason.includes("sent as JSON")) {
    return "json-content";
  }
  if (reason.includes("provider upload")) {
    return "provider-upload";
  }
  if (reason.includes("extracted or referenced")) {
    return "document-transport";
  }
  if (reason.includes("transcribed or referenced")) {
    return "audio-transport";
  }
  if (reason.includes("provider packaging")) {
    return "media-transport";
  }
  if (reason === "No provider-supported transport was available.") {
    return "transport-unavailable";
  }
  return "redacted-packaging-reason";
}

function safeLifecycle(value: unknown): string | undefined {
  return typeof value === "string" && [
    "input",
    "derived",
    "tool",
    "summary",
    "provider-output",
    "session",
  ].includes(value)
    ? value
    : undefined;
}

function safePersistenceStatus(value: unknown): string | undefined {
  return typeof value === "string" && [
    "stored",
    "preserved",
    "skipped",
    "failed",
    "completed",
  ].includes(value)
    ? value
    : undefined;
}

function isEventStatus(value: unknown): value is string {
  return typeof value === "string" && [
    "pending",
    "running",
    "started",
    "completed",
    "succeeded",
    "failed",
    "skipped",
    "stored",
    "preserved",
  ].includes(value);
}

function isBoundedFailureKind(value: unknown): value is string {
  return typeof value === "string" && [
    "success",
    "execution-failed",
    "validation-failed",
    "tripwire-violated",
    "validation",
    "execution_unavailable",
    "no_route",
    "no-route",
    "no-contract-match",
    "provider_execution",
    "timeout",
    "context_materialization",
    "persistence",
  ].includes(value);
}

function isBoundedFailureReason(value: unknown): value is string {
  return typeof value === "string" && [
    "missing-reference",
    "load-failed",
    "policy-denied",
    "summary-failed",
    "no-route",
    "no-contract-match",
    "provider_execution",
    "tripwire-violated",
    "persistence",
  ].includes(value);
}

function assignSafeString(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (typeof value === "string" && value.length > 0) {
    target[key] = value;
  }
}

function assignFiniteNumber(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    target[key] = value;
  }
}

function assignSafeBoolean(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (typeof value === "boolean") {
    target[key] = value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
