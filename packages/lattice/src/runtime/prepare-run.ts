import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { toArtifactRef } from "../artifacts/artifact.js";
import type { CapabilityContract } from "../contract/contract.js";
import {
  buildContextPack,
  type ContextPack,
  type ContextSummarizer,
} from "../context/context-pack.js";
import {
  ContextMaterializationFailure,
  materializeContext,
  toContextProjectionPlan,
  validateContextSessionScope,
  type MaterializedContext,
} from "../context/materialize.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import {
  createExecutionPlan,
  markStage,
  withPlanStatus,
  type ExecutionPlan,
  type RouteDecision,
  type SelectedRoute,
} from "../plan/plan.js";
import {
  mergePolicy,
  type GatewayMetadataValue,
  type PolicySpec,
} from "../policy/policy.js";
import {
  packageArtifactsForProvider,
  type ProviderPackagingResult,
} from "../providers/packaging.js";
import type { LatticeRunError } from "../results/errors.js";
import { createCapabilityCatalog } from "../routing/catalog.js";
import { routeDeterministically } from "../routing/router.js";
import {
  ArtifactLifecycleFailure,
  persistArtifactLifecycleBatch,
  type ArtifactLifecycleKind,
  type ArtifactLifecycleReport,
} from "./artifact-lifecycle.js";
import type { SessionRecord, SessionRef } from "../sessions/session.js";
import { runTool, type ToolCallResult, type ToolDefinition } from "../tools/tools.js";
import { createRunEvent, type RunEvent } from "../tracing/tracing.js";
import type { NormalizedLatticeConfig } from "./config.js";

export interface PrepareRunArtifactTransform {
  readonly name: string;
  transform(input: {
    readonly task: string;
    readonly artifacts: readonly ArtifactInput[];
  }):
    | Promise<ArtifactInput | readonly ArtifactInput[]>
    | ArtifactInput
    | readonly ArtifactInput[];
}

export interface PrepareRunIntent<
  TOutputs extends OutputContractMap = OutputContractMap,
> {
  readonly task: string;
  readonly artifacts?: readonly ArtifactInput[];
  readonly outputs: TOutputs;
  readonly policy?: PolicySpec;
  readonly session?: SessionRef;
  readonly overrides?: {
    readonly provider?: string;
    readonly model?: string;
    readonly routingPolicy?: PolicySpec;
    readonly tokenBudget?: number;
    readonly summarizer?: ContextSummarizer;
    readonly transforms?: readonly PrepareRunArtifactTransform[];
  };
  readonly tools?: readonly ToolDefinition<any>[];
  readonly toolInputs?: Record<string, unknown>;
  readonly contract?: CapabilityContract;
}

export interface PrepareRunOptions {
  readonly runId?: string;
  readonly emit?: (event: RunEvent) => void | Promise<void>;
}

interface PreparedRunBase {
  readonly plan: ExecutionPlan;
  readonly preparedArtifactRefs: readonly ArtifactRef[];
  readonly lifecycleReports: readonly ArtifactLifecycleReport[];
  readonly toolResults: readonly ToolCallResult[];
  readonly mergedPolicy?: PolicySpec;
  readonly sessionRecord?: SessionRecord;
}

export interface PreparedRunSuccess extends PreparedRunBase {
  readonly ok: true;
  readonly preparedArtifacts: readonly ArtifactInput[];
  readonly contextPack: ContextPack;
  readonly materialized?: MaterializedContext;
  readonly packaging: ProviderPackagingResult;
}

export interface PreparedRunFailure extends PreparedRunBase {
  readonly ok: false;
  readonly error: LatticeRunError;
}

export type PreparedRun = PreparedRunSuccess | PreparedRunFailure;

export interface PreparedRouteSuccess {
  readonly ok: true;
  readonly contextPack: ContextPack;
  readonly materialized: MaterializedContext;
  readonly packaging: ProviderPackagingResult;
}

export interface PreparedRouteFailure {
  readonly ok: false;
  readonly error: LatticeRunError;
  readonly contextPack: ContextPack;
  readonly failedStage: "context-packing" | "persistence";
}

export type PreparedRoute = PreparedRouteSuccess | PreparedRouteFailure;

interface PreparedArtifactEntry {
  readonly artifact: ArtifactInput;
  readonly lifecycle: ArtifactLifecycleKind;
}

interface PreparedArtifacts {
  readonly entries: readonly PreparedArtifactEntry[];
  readonly toolResults: readonly ToolCallResult[];
  readonly transformCount: number;
}

export async function prepareRun<
  const TOutputs extends OutputContractMap,
>(
  normalized: NormalizedLatticeConfig,
  intent: PrepareRunIntent<TOutputs>,
  options: PrepareRunOptions = {},
): Promise<PreparedRun> {
  const mergedPolicy = mergePolicy(
    mergePolicy(normalized.defaults.policy, intent.policy),
    intent.overrides?.routingPolicy,
  );
  let sessionRecord: SessionRecord | undefined;

  try {
    sessionRecord = await resolveSession(normalized, intent.session, mergedPolicy);
  } catch (cause) {
    const internal = asContextFailure(cause, intent.session?.id);
    const error = publicContextError(internal);
    const plan = createFailurePlan({
      intent,
      error,
      artifactRefs: (intent.artifacts ?? []).map(toArtifactRef),
      failedStage: "context-packing",
    });
    await emitFailure(options, plan, error);

    return {
      ok: false,
      error,
      plan,
      preparedArtifactRefs: [],
      lifecycleReports: [],
      toolResults: [],
      ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
    };
  }

  const prepared = await prepareArtifacts(intent);
  const declaredRefs = prepared.entries.map(({ artifact }) => toArtifactRef(artifact));
  let lifecycleResults;

  try {
    lifecycleResults = await persistArtifactLifecycleBatch(prepared.entries, {
      ...(normalized.storage !== undefined ? { storage: normalized.storage } : {}),
      ...(mergedPolicy !== undefined ? { policy: mergedPolicy } : {}),
    });
  } catch (cause) {
    const internal = asLifecycleFailure(cause);
    const error = publicPersistenceError(internal);
    const plan = createFailurePlan({
      intent,
      error,
      artifactRefs: declaredRefs,
      failedStage: "persistence",
      toolResults: prepared.toolResults,
      transformCount: prepared.transformCount,
    });
    await emitFailure(options, plan, error);

    return {
      ok: false,
      error,
      plan,
      preparedArtifactRefs: declaredRefs,
      lifecycleReports: [],
      toolResults: prepared.toolResults,
      ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
      ...(sessionRecord !== undefined ? { sessionRecord } : {}),
    };
  }

  const preparedArtifacts = lifecycleResults.map((result) => result.artifact);
  const inputLifecycleReports = lifecycleResults.map((result) => result.report);
  const preparedArtifactRefs = lifecycleResults.map((result) => result.report.ref);
  const catalog = createCapabilityCatalog(normalized.providers);
  const route = routeDeterministically(catalog, {
    task: intent.task,
    artifacts: preparedArtifacts,
    outputs: intent.outputs,
    ...(mergedPolicy !== undefined ? { policy: mergedPolicy } : {}),
    ...(intent.overrides?.provider !== undefined
      ? { provider: intent.overrides.provider }
      : {}),
    ...(intent.overrides?.model !== undefined
      ? { model: intent.overrides.model }
      : {}),
    ...(intent.contract !== undefined ? { contract: intent.contract } : {}),
  });
  if (route.selected === undefined) {
    const contextPack = buildContextPack({
      task: intent.task,
      artifacts: preparedArtifacts,
      ...(sessionRecord !== undefined ? { session: sessionRecord } : {}),
      ...(intent.overrides?.tokenBudget !== undefined
        ? { tokenBudget: intent.overrides.tokenBudget }
        : {}),
    });
    const packaging = packageArtifactsForProvider({
      artifacts: [],
      ...(mergedPolicy !== undefined ? { policy: mergedPolicy } : {}),
    });
    const plan = createPreparedPlan({
      intent,
      route,
      contextPack,
      packaging,
      preparedArtifactRefs,
      lifecycleReports: inputLifecycleReports,
      toolResults: prepared.toolResults,
      transformCount: prepared.transformCount,
      ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
    });
    await emitPreparedEvents(options, {
      plan,
      route,
      contextPack,
      preparedArtifactRefs,
      lifecycleReports: inputLifecycleReports,
      toolResults: prepared.toolResults,
      ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
    });

    return {
      ok: true,
      plan,
      preparedArtifacts,
      contextPack,
      packaging,
      preparedArtifactRefs,
      lifecycleReports: inputLifecycleReports,
      toolResults: prepared.toolResults,
      ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
      ...(sessionRecord !== undefined ? { sessionRecord } : {}),
    };
  }

  const preparedRoute = await prepareRouteAttempt(
    normalized,
    intent,
    preparedArtifacts,
    route.selected,
    {
      ...(mergedPolicy !== undefined ? { policy: mergedPolicy } : {}),
      ...(sessionRecord !== undefined ? { sessionRecord } : {}),
    },
  );

  if (!preparedRoute.ok) {
    const { error, contextPack, failedStage } = preparedRoute;
    const plan = createFailurePlan({
      intent,
      error,
      artifactRefs: preparedArtifactRefs,
      route,
      contextPack,
      failedStage,
      toolResults: prepared.toolResults,
      transformCount: prepared.transformCount,
      lifecycleReports: inputLifecycleReports,
    });
    await emitFailure(options, plan, error);

    return {
      ok: false,
      error,
      plan,
      preparedArtifactRefs,
      lifecycleReports: inputLifecycleReports,
      toolResults: prepared.toolResults,
      ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
      ...(sessionRecord !== undefined ? { sessionRecord } : {}),
    };
  }

  const { contextPack, materialized, packaging } = preparedRoute;

  const lifecycleReports = [
    ...inputLifecycleReports,
    ...materialized.summaryLifecycleReports,
  ];
  const plan = createPreparedPlan({
    intent,
    route,
    contextPack: materialized.contextPack,
    materialized,
    packaging,
    preparedArtifactRefs,
    lifecycleReports,
    toolResults: prepared.toolResults,
    transformCount: prepared.transformCount,
    ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
  });
  await emitPreparedEvents(options, {
    plan,
    route,
    contextPack: materialized.contextPack,
    materialized,
    preparedArtifactRefs,
    lifecycleReports,
    toolResults: prepared.toolResults,
    ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
  });

  return {
    ok: true,
    plan,
    preparedArtifacts,
    contextPack: materialized.contextPack,
    materialized,
    packaging,
    preparedArtifactRefs,
    lifecycleReports,
    toolResults: prepared.toolResults,
    ...(mergedPolicy !== undefined ? { mergedPolicy } : {}),
    ...(sessionRecord !== undefined ? { sessionRecord } : {}),
  };
}

export async function prepareRouteAttempt<
  const TOutputs extends OutputContractMap,
>(
  normalized: NormalizedLatticeConfig,
  intent: PrepareRunIntent<TOutputs>,
  preparedArtifacts: readonly ArtifactInput[],
  route: SelectedRoute,
  input: {
    readonly policy?: PolicySpec;
    readonly sessionRecord?: SessionRecord;
  } = {},
): Promise<PreparedRoute> {
  const contextPack = buildContextPack({
    task: intent.task,
    artifacts: preparedArtifacts,
    route,
    ...(input.sessionRecord !== undefined
      ? { session: input.sessionRecord }
      : {}),
    ...(intent.overrides?.tokenBudget !== undefined
      ? { tokenBudget: intent.overrides.tokenBudget }
      : {}),
  });
  let materialized: MaterializedContext;

  try {
    materialized = await materializeContext({
      contextPack,
      route,
      artifacts: preparedArtifacts,
      ...(input.policy !== undefined ? { policy: input.policy } : {}),
      ...(input.sessionRecord !== undefined
        ? { session: input.sessionRecord }
        : {}),
      ...(normalized.storage !== undefined
        ? { storage: normalized.storage }
        : {}),
      ...(intent.overrides?.summarizer !== undefined
        ? { summarizer: intent.overrides.summarizer }
        : {}),
    });
  } catch (cause) {
    if (cause instanceof ArtifactLifecycleFailure) {
      return {
        ok: false,
        error: publicPersistenceError(cause),
        contextPack,
        failedStage: "persistence",
      };
    }

    const internal = asContextFailure(cause, input.sessionRecord?.id);
    return {
      ok: false,
      error: publicContextError(internal),
      contextPack,
      failedStage: "context-packing",
    };
  }

  return {
    ok: true,
    contextPack: materialized.contextPack,
    materialized,
    packaging: packageArtifactsForProvider({
      artifacts: materialized.artifacts,
      route,
      ...(input.policy !== undefined ? { policy: input.policy } : {}),
    }),
  };
}

async function prepareArtifacts<
  TOutputs extends OutputContractMap,
>(intent: PrepareRunIntent<TOutputs>): Promise<PreparedArtifacts> {
  const entries: PreparedArtifactEntry[] = (intent.artifacts ?? []).map(
    (artifact) => ({ artifact, lifecycle: "input" }),
  );
  let artifacts = entries.map((entry) => entry.artifact);
  let transformCount = 0;

  for (const transform of intent.overrides?.transforms ?? []) {
    const transformed = await transform.transform({
      task: intent.task,
      artifacts,
    });
    const outputs = Array.isArray(transformed) ? transformed : [transformed];
    transformCount += outputs.length;

    for (const output of outputs) {
      entries.push({ artifact: output, lifecycle: "derived" });
      artifacts.push(output);
    }
  }

  const toolResults: ToolCallResult[] = [];

  for (const tool of intent.tools ?? []) {
    const result = await runTool(tool, intent.toolInputs?.[tool.name] ?? {});
    toolResults.push(result);
    entries.push({ artifact: result.artifact, lifecycle: "tool" });
    artifacts.push(result.artifact);
  }

  return { entries, toolResults, transformCount };
}

async function resolveSession(
  normalized: NormalizedLatticeConfig,
  session: SessionRef | undefined,
  policy: PolicySpec | undefined,
): Promise<SessionRecord | undefined> {
  if (session === undefined || normalized.sessions === undefined) {
    return undefined;
  }

  let existing: SessionRecord | undefined;

  try {
    existing = await normalized.sessions.load(session.id);
  } catch (cause) {
    throw new ContextMaterializationFailure({
      message: "Session record load failed.",
      reason: "load-failed",
      sessionId: session.id,
      cause,
    });
  }

  if (existing !== undefined) {
    validateContextSessionScope(existing, policy);
    return existing;
  }

  try {
    const created = await normalized.sessions.create({
      id: session.id,
      ...(policy?.tenantId !== undefined ? { tenantId: policy.tenantId } : {}),
      privacy: policy?.privacy ?? "standard",
      retention: policy?.retention ?? "session",
    });
    validateContextSessionScope(created, policy);
    return created;
  } catch (cause) {
    if (cause instanceof ContextMaterializationFailure) {
      throw cause;
    }

    throw new ContextMaterializationFailure({
      message: "Session record creation failed.",
      reason: "load-failed",
      sessionId: session.id,
      cause,
    });
  }
}

interface CreatePreparedPlanInput<TOutputs extends OutputContractMap> {
  readonly intent: PrepareRunIntent<TOutputs>;
  readonly route: RouteDecision;
  readonly contextPack: ContextPack;
  readonly materialized?: MaterializedContext;
  readonly packaging: ProviderPackagingResult;
  readonly preparedArtifactRefs: readonly ArtifactRef[];
  readonly lifecycleReports: readonly ArtifactLifecycleReport[];
  readonly toolResults: readonly ToolCallResult[];
  readonly transformCount: number;
  readonly mergedPolicy?: PolicySpec;
}

function createPreparedPlan<TOutputs extends OutputContractMap>(
  input: CreatePreparedPlanInput<TOutputs>,
): ExecutionPlan {
  const gatewayMetadata =
    input.route.selected === undefined
      ? undefined
      : gatewayMetadataForRoute(
          input.route.selected.providerId,
          input.route.selected.modelId,
          input.mergedPolicy?.gateway,
        );
  let plan = createExecutionPlan({
    task: input.intent.task,
    artifacts: input.preparedArtifactRefs,
    outputs: input.intent.outputs,
    route: input.route,
    context: input.contextPack,
    ...(input.materialized !== undefined
      ? { contextProjection: toContextProjectionPlan(input.materialized) }
      : {}),
    providerPackaging: input.packaging.plan,
    warnings: input.packaging.blocked,
    metadata: {
      ...(input.intent.tools !== undefined
        ? { tools: input.intent.tools.map((tool) => tool.name) }
        : {}),
      ...(input.materialized !== undefined &&
      input.materialized.summaryArtifactRefs.length > 0
        ? {
            summaryArtifactIds: input.materialized.summaryArtifactRefs.map(
              (summary) => summary.id,
            ),
          }
        : {}),
      ...(gatewayMetadata !== undefined ? { gateway: gatewayMetadata } : {}),
    },
  });
  plan = withPlanStatus(plan, plan.status, {
    stages: markPreparationStages(
      plan.stages,
      input.lifecycleReports,
      input.toolResults.length,
      input.transformCount,
    ),
  });

  return plan;
}

interface CreateFailurePlanInput<TOutputs extends OutputContractMap> {
  readonly intent: PrepareRunIntent<TOutputs>;
  readonly error: LatticeRunError;
  readonly artifactRefs: readonly ArtifactRef[];
  readonly failedStage: "context-packing" | "persistence";
  readonly route?: RouteDecision;
  readonly contextPack?: ContextPack;
  readonly toolResults?: readonly ToolCallResult[];
  readonly transformCount?: number;
  readonly lifecycleReports?: readonly ArtifactLifecycleReport[];
}

function createFailurePlan<TOutputs extends OutputContractMap>(
  input: CreateFailurePlanInput<TOutputs>,
): ExecutionPlan {
  const route = input.route ?? emptyFailureRoute(input.error.message);
  let plan = createExecutionPlan({
    task: input.intent.task,
    artifacts: input.artifactRefs,
    outputs: input.intent.outputs,
    route,
    ...(input.contextPack !== undefined ? { context: input.contextPack } : {}),
    warnings: [input.error.message],
    metadata: {
      preparationFailure: {
        kind: input.error.kind,
        ...("reason" in input.error ? { reason: input.error.reason } : {}),
      },
    },
  });
  let stages = markPreparationStages(
    plan.stages,
    input.lifecycleReports ?? [],
    input.toolResults?.length ?? 0,
    input.transformCount ?? 0,
  );
  stages = markStage(stages, input.failedStage, "failed");
  for (const stage of [
    "provider-packaging",
    "execution",
    "validation",
    "tripwire",
  ] as const) {
    stages = markStage(stages, stage, "skipped");
  }
  plan = withPlanStatus(plan, "failed", { stages, attempts: [] });

  return plan;
}

function markPreparationStages(
  stages: ExecutionPlan["stages"],
  reports: readonly ArtifactLifecycleReport[],
  toolCount: number,
  transformCount: number,
): ExecutionPlan["stages"] {
  const persistenceStatus = reports.some(
    (report) => report.status === "stored" || report.status === "preserved",
  )
    ? "completed"
    : "skipped";
  let next = markStage(
    stages,
    "persistence",
    persistenceStatus,
    {
      reports: reports.map((report) => ({
        artifactId: report.artifactId,
        lifecycle: report.lifecycle,
        status: report.status,
        ...(report.status === "skipped" ? { reason: report.reason } : {}),
      })),
    },
  );
  next = markStage(
    next,
    "transforms",
    transformCount > 0 ? "completed" : "skipped",
    { artifactCount: transformCount },
  );
  next = markStage(
    next,
    "tool-execution",
    toolCount > 0 ? "completed" : "skipped",
    { artifactCount: toolCount },
  );

  return next;
}

function emptyFailureRoute(message: string): RouteDecision {
  return {
    catalogVersion: "preparation-failed",
    candidates: [],
    rejected: [],
    fallbackChain: [],
    noRouteReasons: [{ code: "preparation-failed", message }],
  };
}

function asLifecycleFailure(cause: unknown): ArtifactLifecycleFailure {
  if (cause instanceof ArtifactLifecycleFailure) {
    return cause;
  }

  return new ArtifactLifecycleFailure({
    message: "Artifact lifecycle write failed.",
    lifecycle: "input",
    artifactId: "unknown",
    postProvider: false,
    cause,
  });
}

function asContextFailure(
  cause: unknown,
  sessionId: string | undefined,
): ContextMaterializationFailure {
  if (cause instanceof ContextMaterializationFailure) {
    return cause;
  }

  return new ContextMaterializationFailure({
    message: "Context materialization failed.",
    reason: "load-failed",
    ...(sessionId !== undefined ? { sessionId } : {}),
    cause,
  });
}

function publicPersistenceError(
  error: ArtifactLifecycleFailure,
): Extract<LatticeRunError, { kind: "persistence" }> {
  return {
    kind: "persistence",
    message: error.message,
    operation: error.operation,
    lifecycle: error.lifecycle,
    ...(error.artifactId !== "unknown"
      ? { artifactId: error.artifactId }
      : {}),
    ...(error.storeId !== undefined ? { storeId: error.storeId } : {}),
    postProvider: error.postProvider,
    terminal: true,
  };
}

function publicContextError(
  error: ContextMaterializationFailure,
): Extract<LatticeRunError, { kind: "context_materialization" }> {
  return {
    kind: "context_materialization",
    message: error.message,
    reason: error.reason,
    ...(error.artifactId !== undefined ? { artifactId: error.artifactId } : {}),
    ...(error.sessionId !== undefined ? { sessionId: error.sessionId } : {}),
    terminal: true,
  };
}

async function emitPreparedEvents(
  options: PrepareRunOptions,
  input: {
    readonly plan: ExecutionPlan;
    readonly route: RouteDecision;
    readonly contextPack: ContextPack;
    readonly materialized?: MaterializedContext;
    readonly preparedArtifactRefs: readonly ArtifactRef[];
    readonly lifecycleReports: readonly ArtifactLifecycleReport[];
    readonly toolResults: readonly ToolCallResult[];
    readonly mergedPolicy?: PolicySpec;
  },
): Promise<void> {
  if (options.emit === undefined || options.runId === undefined) {
    return;
  }

  for (const result of input.toolResults) {
    await options.emit(createRunEvent("tool.call", {
      runId: options.runId,
      planId: input.plan.id,
      artifactId: result.artifact.id,
      metadata: { toolName: result.toolName, callId: result.callId },
    }));
    await options.emit(createRunEvent("artifact.created", {
      runId: options.runId,
      planId: input.plan.id,
      artifactId: result.artifact.id,
      metadata: { source: "tool" },
    }));
  }

  for (const ref of input.preparedArtifactRefs) {
    await options.emit(createRunEvent("artifact.ingested", {
      runId: options.runId,
      planId: input.plan.id,
      artifactId: ref.id,
    }));
  }

  await options.emit(createRunEvent("context.packed", {
    runId: options.runId,
    planId: input.plan.id,
    ...(input.materialized !== undefined
      ? {
          providerId: input.materialized.route.providerId,
          modelId: input.materialized.route.modelId,
        }
      : {}),
    metadata: {
      status: "completed",
      estimatedTokens: input.contextPack.estimatedTokens,
      included: input.contextPack.included.length,
      summarized: input.contextPack.summarized.length,
      omitted: input.contextPack.omitted.length,
      ...(input.materialized !== undefined
        ? {
            projectionId: input.materialized.id,
            artifactCount: input.materialized.artifacts.length,
            summaryCount: input.materialized.summaryArtifactRefs.length,
            inputHashes: input.materialized.inputHashes,
          }
        : {}),
      lifecycle: input.lifecycleReports.map((report) => ({
        artifactId: report.artifactId,
        lifecycle: report.lifecycle,
        status: report.status,
        ...(report.status === "skipped" ? { reason: report.reason } : {}),
      })),
    },
  }));
  const gatewayMetadata =
    input.route.selected === undefined
      ? undefined
      : gatewayMetadataForRoute(
          input.route.selected.providerId,
          input.route.selected.modelId,
          input.mergedPolicy?.gateway,
        );
  await options.emit(createRunEvent("router.candidates", {
    runId: options.runId,
    planId: input.plan.id,
    metadata: {
      selected: input.route.selected?.modelId,
      rejected: input.route.rejected.length,
      fallbacks: input.route.fallbackChain.length,
      ...(gatewayMetadata !== undefined ? { gateway: gatewayMetadata } : {}),
    },
  }));
}

async function emitFailure(
  options: PrepareRunOptions,
  plan: ExecutionPlan,
  error: LatticeRunError,
): Promise<void> {
  if (options.emit === undefined || options.runId === undefined) {
    return;
  }

  await options.emit(createRunEvent("context.packed", {
    runId: options.runId,
    planId: plan.id,
    metadata: {
      status: "failed",
      failureKind: error.kind,
      ...("reason" in error ? { failureReason: error.reason } : {}),
    },
  }));
}

export function gatewayMetadataForRoute(
  providerId: string,
  modelId: string,
  policy: PolicySpec["gateway"] | undefined,
): Record<string, unknown> | undefined {
  if (policy === undefined) {
    return undefined;
  }

  const metadata = sanitizeGatewayMetadataForEvents(policy.metadata);
  const sanitizedPolicy = {
    ...(policy.routeTags !== undefined && policy.routeTags.length > 0
      ? { routeTags: [...policy.routeTags] }
      : {}),
    ...(policy.providerPreferences !== undefined &&
    policy.providerPreferences.length > 0
      ? { providerPreferences: [...policy.providerPreferences] }
      : {}),
    ...(metadata !== undefined ? { metadata } : {}),
    ...(policy.allowFallbacks !== undefined
      ? { allowFallbacks: policy.allowFallbacks }
      : {}),
  };

  return {
    providerId,
    selectedProviderId: providerId,
    requestedModel: modelId,
    policy: sanitizedPolicy,
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
      if (
        /api[-_]?key|authorization|headers?|secret|token|password/iu.test(key) ||
        containsSecretGatewayMetadataValue(value)
      ) {
        return [];
      }

      return [[key, value]];
    }),
  );

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function containsSecretGatewayMetadataValue(value: unknown): boolean {
  if (typeof value === "string") {
    return /^sk-[\w-]+/u.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsSecretGatewayMetadataValue);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(
      ([key, nested]) =>
        /api[-_]?key|authorization|headers?|secret|token|password/iu.test(key) ||
        containsSecretGatewayMetadataValue(nested),
    );
  }

  return false;
}
