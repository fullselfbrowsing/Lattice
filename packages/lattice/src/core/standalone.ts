import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import type { CapabilityContract } from "../contract/contract.js";
import type { BuildContextPackInput, ContextPack } from "../context/context-pack.js";
import { buildContextPack } from "../context/context-pack.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { ExecutionPlan, RouteDecision } from "../plan/plan.js";
import { createExecutionPlan } from "../plan/plan.js";
import type { PolicySpec } from "../policy/policy.js";
import type { CapabilityCatalog } from "../routing/catalog.js";
import { routeDeterministically } from "../routing/router.js";
import { persistArtifactLifecycleBatch } from "../runtime/artifact-lifecycle.js";
import type { SessionRecord } from "../sessions/session.js";
import type { ArtifactStore } from "../storage/storage.js";

export interface PrepareCoreRunInput<TOutputs extends OutputContractMap = OutputContractMap> {
  readonly task: string;
  readonly artifacts?: readonly ArtifactInput[];
  readonly outputs: TOutputs;
  readonly catalog?: CapabilityCatalog;
  readonly policy?: PolicySpec;
  readonly provider?: string;
  readonly model?: string;
  readonly contract?: CapabilityContract;
  readonly session?: SessionRecord;
  readonly tokenBudget?: number;
  readonly storage?: ArtifactStore;
  readonly metadata?: Record<string, unknown>;
}

export interface PreparedCoreArtifact {
  readonly ref: ArtifactRef;
  readonly stored: boolean;
  readonly inputHash?: string;
}

export interface PreparedCoreRun<TOutputs extends OutputContractMap = OutputContractMap> {
  readonly kind: "prepared-core-run";
  readonly version: 1;
  readonly createdAt: string;
  readonly task: string;
  readonly outputNames: readonly (keyof TOutputs & string)[];
  readonly artifacts: readonly PreparedCoreArtifact[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly context: ContextPack;
  readonly route: RouteDecision;
  readonly plan: ExecutionPlan;
  readonly inputHashes: readonly string[];
  readonly warnings: readonly string[];
}

const EMPTY_STANDALONE_CATALOG: CapabilityCatalog = {
  version: "standalone-empty",
  models: [],
};

export async function prepareCoreRun<TOutputs extends OutputContractMap>(
  input: PrepareCoreRunInput<TOutputs>,
): Promise<PreparedCoreRun<TOutputs>> {
  const lifecycleResults = await persistArtifactLifecycleBatch(
    (input.artifacts ?? []).map((artifact) => ({
      artifact,
      lifecycle: "input" as const,
    })),
    {
      ...(input.storage !== undefined ? { storage: input.storage } : {}),
      ...(input.policy !== undefined ? { policy: input.policy } : {}),
    },
  );
  const preparedArtifacts: readonly PreparedArtifactInternal[] = lifecycleResults.map(
    ({ artifact, report }) => ({
      input: artifact,
      artifact: {
        ref: report.ref,
        stored: report.status === "stored" || report.status === "preserved",
        ...(report.inputHash !== undefined ? { inputHash: report.inputHash } : {}),
      },
    }),
  );
  const preparedInputs = preparedArtifacts.map((prepared) => prepared.input);
  const artifactRefs = preparedArtifacts.map((prepared) => prepared.artifact.ref);
  const catalog = input.catalog ?? EMPTY_STANDALONE_CATALOG;
  const route = routeDeterministically(catalog, {
    task: input.task,
    artifacts: preparedInputs,
    outputs: input.outputs,
    ...(input.policy !== undefined ? { policy: input.policy } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.contract !== undefined ? { contract: input.contract } : {}),
  });
  const contextInput: BuildContextPackInput = {
    task: input.task,
    artifacts: preparedInputs,
    ...(route.selected !== undefined ? { route: route.selected } : {}),
    ...(input.session !== undefined ? { session: input.session } : {}),
    ...(input.tokenBudget !== undefined ? { tokenBudget: input.tokenBudget } : {}),
  };
  const context = buildContextPack(contextInput);
  const outputNames = Object.keys(input.outputs) as readonly (keyof TOutputs & string)[];
  const plan = createExecutionPlan({
    task: input.task,
    artifacts: artifactRefs,
    outputs: input.outputs,
    route,
    context,
    metadata: {
      ...input.metadata,
      standaloneCore: true,
    },
  });
  const artifacts = preparedArtifacts.map((prepared) => prepared.artifact);

  return {
    kind: "prepared-core-run",
    version: 1,
    createdAt: plan.createdAt,
    task: input.task,
    outputNames,
    artifacts,
    artifactRefs,
    context,
    route,
    plan,
    inputHashes: artifacts.flatMap((artifact) =>
      artifact.inputHash === undefined ? [] : [artifact.inputHash],
    ),
    warnings: plan.warnings,
  };
}

interface PreparedArtifactInternal {
  readonly input: ArtifactInput;
  readonly artifact: PreparedCoreArtifact;
}
