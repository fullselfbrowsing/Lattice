import type { ArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type {
  CapabilityModality,
  ModelCapability,
  ProviderTransportMode,
} from "../providers/provider.js";

export type ExecutionPlanStatus =
  | "stub"
  | "planned"
  | "no-route"
  | "running"
  | "completed"
  | "failed";

export type ExecutionStageKind =
  | "analysis"
  | "transforms"
  | "context-packing"
  | "provider-packaging"
  | "tool-execution"
  | "execution"
  | "validation"
  | "tripwire"
  | "persistence"
  | "replay";

export type ExecutionStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

export interface ExecutionPlanStage {
  readonly id: string;
  readonly kind: ExecutionStageKind;
  readonly status: ExecutionStageStatus;
  readonly inputArtifacts?: readonly string[];
  readonly outputArtifacts?: readonly string[];
  readonly warnings: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface RouteRejectReason {
  readonly code: string;
  readonly message: string;
}

export interface RouteCandidate {
  readonly providerId: string;
  readonly modelId: string;
  readonly capability: ModelCapability;
  readonly score: number;
  readonly accepted: boolean;
  readonly reasons: readonly RouteRejectReason[];
  readonly estimates: RouteEstimates;
}

export interface RouteEstimates {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd?: number;
  readonly latencyMs?: number;
}

export interface SelectedRoute {
  readonly providerId: string;
  readonly modelId: string;
  readonly score: number;
  readonly estimates: RouteEstimates;
  readonly inputModalities: readonly CapabilityModality[];
  readonly outputModalities: readonly CapabilityModality[];
  readonly fileTransport: readonly ProviderTransportMode[];
}

export interface FallbackRoute {
  readonly providerId: string;
  readonly modelId: string;
  readonly score: number;
  readonly reason: "policy-preserving-fallback";
}

export interface RouteDecision {
  readonly catalogVersion: string;
  readonly selected?: SelectedRoute;
  readonly candidates: readonly RouteCandidate[];
  readonly rejected: readonly RouteCandidate[];
  readonly fallbackChain: readonly FallbackRoute[];
  readonly noRouteReasons: readonly RouteRejectReason[];
}

export interface ContextPackPlan {
  readonly id: string;
  readonly tokenBudget: number;
  readonly estimatedTokens: number;
  readonly included: readonly ContextPackItemPlan[];
  readonly summarized: readonly ContextPackItemPlan[];
  readonly archived: readonly ContextPackItemPlan[];
  readonly omitted: readonly ContextPackItemPlan[];
  readonly warnings: readonly string[];
}

export interface ContextPackItemPlan {
  readonly artifactId?: string;
  readonly sessionTurnId?: string;
  readonly reason: string;
  readonly estimatedTokens: number;
  readonly trust: "developer" | "user" | "tool" | "model-summary";
}

export interface ProviderPackagingPlan {
  readonly providerId: string;
  readonly modelId: string;
  readonly artifacts: readonly ProviderPackagedArtifactPlan[];
  readonly warnings: readonly string[];
}

export interface ProviderPackagedArtifactPlan {
  readonly artifactId: string;
  readonly transport: ProviderTransportMode;
  readonly mediaType?: string;
  readonly lineageTransform: "provider-packaging";
  readonly warnings: readonly string[];
}

export interface ProviderAttemptRecord {
  readonly providerId: string;
  readonly modelId: string;
  readonly status: "pending" | "running" | "succeeded" | "failed" | "cancelled";
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly error?: string;
  readonly usage?: UsageRecord;
}

export interface UsageRecord {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
  readonly costUsd?: number;
  readonly latencyMs?: number;
}

export interface ExecutionPlan {
  readonly id: string;
  readonly kind: "execution-plan";
  readonly version: 1;
  readonly createdAt: string;
  readonly status: ExecutionPlanStatus;
  readonly task: string;
  readonly outputNames: readonly string[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly route: RouteDecision;
  readonly stages: readonly ExecutionPlanStage[];
  readonly context?: ContextPackPlan;
  readonly providerPackaging?: ProviderPackagingPlan;
  readonly attempts: readonly ProviderAttemptRecord[];
  readonly warnings: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface ExecutionPlanStub {
  readonly id: string;
  readonly kind: "plan-stub";
  readonly createdAt: string;
  readonly status: "stub";
  readonly stages: readonly [];
  readonly warnings: readonly string[];
}

export type ResultPlan = ExecutionPlan | ExecutionPlanStub;

export interface CreateExecutionPlanInput {
  readonly task: string;
  readonly artifacts: readonly ArtifactRef[];
  readonly outputs: OutputContractMap;
  readonly route: RouteDecision;
  readonly context?: ContextPackPlan;
  readonly providerPackaging?: ProviderPackagingPlan;
  readonly warnings?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export function createExecutionPlan(input: CreateExecutionPlanInput): ExecutionPlan {
  const selected = input.route.selected;
  const status: ExecutionPlanStatus = selected === undefined ? "no-route" : "planned";
  const contextWarnings = input.context?.warnings ?? [];
  const packagingWarnings = input.providerPackaging?.warnings ?? [];
  const warnings = [
    ...(input.warnings ?? []),
    ...contextWarnings,
    ...packagingWarnings,
    ...input.route.noRouteReasons.map((reason) => reason.message),
  ];

  return {
    id: createPlanId(),
    kind: "execution-plan",
    version: 1,
    createdAt: new Date().toISOString(),
    status,
    task: input.task,
    outputNames: Object.keys(input.outputs),
    artifactRefs: input.artifacts,
    route: input.route,
    stages: createDefaultStages(status, input.artifacts, warnings),
    ...(input.context !== undefined ? { context: input.context } : {}),
    ...(input.providerPackaging !== undefined
      ? { providerPackaging: input.providerPackaging }
      : {}),
    attempts:
      selected === undefined
        ? []
        : [
            {
              providerId: selected.providerId,
              modelId: selected.modelId,
              status: "pending",
            },
          ],
    warnings,
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  };
}

export function createExecutionPlanStub(
  warnings: readonly string[] = [],
): ExecutionPlanStub {
  return {
    id: createPlanId(),
    kind: "plan-stub",
    createdAt: new Date().toISOString(),
    status: "stub",
    stages: [],
    warnings: [...warnings],
  };
}

export function withPlanStatus(
  plan: ExecutionPlan,
  status: ExecutionPlanStatus,
  updates: {
    readonly stages?: readonly ExecutionPlanStage[];
    readonly attempts?: readonly ProviderAttemptRecord[];
    readonly warnings?: readonly string[];
  } = {},
): ExecutionPlan {
  return {
    ...plan,
    status,
    ...(updates.stages !== undefined ? { stages: updates.stages } : {}),
    ...(updates.attempts !== undefined ? { attempts: updates.attempts } : {}),
    ...(updates.warnings !== undefined ? { warnings: updates.warnings } : {}),
  };
}

export function markStage(
  stages: readonly ExecutionPlanStage[],
  kind: ExecutionStageKind,
  status: ExecutionStageStatus,
  metadata?: Record<string, unknown>,
): readonly ExecutionPlanStage[] {
  return stages.map((stage) =>
    stage.kind === kind
      ? {
          ...stage,
          status,
          ...(metadata !== undefined
            ? { metadata: { ...stage.metadata, ...metadata } }
            : {}),
        }
      : stage,
  );
}

function createDefaultStages(
  status: ExecutionPlanStatus,
  artifacts: readonly ArtifactRef[],
  warnings: readonly string[],
): readonly ExecutionPlanStage[] {
  const skipped = status === "no-route";
  const artifactIds = artifacts.map((artifact) => artifact.id);

  return [
    {
      id: "stage:analysis",
      kind: "analysis",
      status: "completed",
      inputArtifacts: artifactIds,
      warnings: [],
    },
    {
      id: "stage:transforms",
      kind: "transforms",
      status: "pending",
      inputArtifacts: artifactIds,
      warnings: [],
    },
    {
      id: "stage:context-packing",
      kind: "context-packing",
      status: "completed",
      inputArtifacts: artifactIds,
      warnings: [],
    },
    {
      id: "stage:provider-packaging",
      kind: "provider-packaging",
      status: skipped ? "skipped" : "completed",
      inputArtifacts: artifactIds,
      warnings,
    },
    {
      id: "stage:tool-execution",
      kind: "tool-execution",
      status: "pending",
      warnings: [],
    },
    {
      id: "stage:execution",
      kind: "execution",
      status: skipped ? "skipped" : "pending",
      warnings: skipped ? warnings : [],
    },
    {
      id: "stage:validation",
      kind: "validation",
      status: skipped ? "skipped" : "pending",
      warnings: [],
    },
    {
      id: "stage:tripwire",
      kind: "tripwire",
      status: skipped ? "skipped" : "pending",
      warnings: [],
    },
    {
      id: "stage:persistence",
      kind: "persistence",
      status: "pending",
      warnings: [],
    },
  ];
}

function createPlanId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `plan:${crypto.randomUUID()}`;
  }

  return `plan:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}
