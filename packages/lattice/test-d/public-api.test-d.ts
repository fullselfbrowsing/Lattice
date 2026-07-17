import { expectAssignable, expectType } from "tsd";

import type {
  AppendSessionTurnInput,
  ArtifactInput,
  ArtifactLifecycleReport,
  ArtifactRef,
  ArtifactRetentionPolicy,
  ArtifactStorageRef,
  ArtifactStore,
  ContextMaterializationError,
  ContextProjectionPlan,
  LatticeRunError,
  MaterializeContextInput,
  MaterializedContext,
  MissingArtifactRefPolicy,
  PersistenceError,
  PolicySpec,
  ProviderAdapter,
  ProviderAttemptRecord,
  ProviderRunRequest,
  ProviderRunResponse,
  SessionRecord,
  SessionStore,
} from "@full-self-browsing/lattice";

const retention: ArtifactRetentionPolicy = "durable";
const missingReference: MissingArtifactRefPolicy = "omit";
const policy: PolicySpec = {
  tenantId: "tenant:public",
  retention,
  missingArtifactRef: missingReference,
};
expectType<"durable">(retention);
expectType<"omit">(missingReference);
expectType<PolicySpec>(policy);

const storageRef: ArtifactStorageRef = {
  storeId: "store:public",
  key: "artifact/public",
  tenantId: "tenant:public",
  retention,
};
const artifactRef: ArtifactRef = {
  id: "artifact:public",
  kind: "text",
  source: "inline",
  privacy: "sensitive",
  storage: storageRef,
};

const projection: ContextProjectionPlan = {
  id: "projection:public",
  providerId: "legacy-provider",
  modelId: "legacy-provider:model",
  artifactRefs: [artifactRef],
  summaryArtifactRefs: [],
  inputHashes: ["sha256:public"],
  omittedArtifactIds: [],
  warnings: [],
};
const attempt: ProviderAttemptRecord = {
  providerId: projection.providerId,
  modelId: projection.modelId,
  status: "succeeded",
  contextProjection: projection,
  inputHashes: projection.inputHashes,
};
expectType<ContextProjectionPlan | undefined>(attempt.contextProjection);
expectType<readonly string[] | undefined>(attempt.inputHashes);

const lifecycleReport: ArtifactLifecycleReport = {
  lifecycle: "provider-output",
  status: "preserved",
  artifactId: artifactRef.id,
  ref: artifactRef,
  inputHash: "sha256:public",
};
expectType<"preserved">(lifecycleReport.status);

const contextError: ContextMaterializationError = {
  kind: "context_materialization",
  message: "Stored context is unavailable.",
  reason: "missing-reference",
  artifactId: artifactRef.id,
  terminal: true,
};
const persistenceError: PersistenceError = {
  kind: "persistence",
  message: "Provider output could not be stored.",
  operation: "write",
  lifecycle: "provider-output",
  artifactId: artifactRef.id,
  storeId: storageRef.storeId,
  postProvider: true,
  terminal: true,
};
expectAssignable<LatticeRunError>(contextError);
expectAssignable<LatticeRunError>(persistenceError);

function inspectTerminalError(error: LatticeRunError) {
  if (error.kind === "context_materialization") {
    expectType<ContextMaterializationError>(error);
    expectType<true>(error.terminal);
  }
  if (error.kind === "persistence") {
    expectType<PersistenceError>(error);
    expectType<true>(error.terminal);
  }
}
void inspectTerminalError;

const legacyProvider = {
  id: "legacy-provider",
  kind: "provider-adapter",
  capabilities: [],
  async execute(_request: ProviderRunRequest): Promise<ProviderRunResponse> {
    return { rawOutputs: { answer: "ok" } };
  },
} satisfies ProviderAdapter;
expectAssignable<ProviderAdapter>(legacyProvider);

const legacyArtifactStore = {
  kind: "artifact-store",
  id: "legacy-artifacts",
  async put(artifact: ArtifactInput): Promise<ArtifactRef> {
    return artifact;
  },
  async get(_id: string) {
    return undefined;
  },
  async load(_id: string) {
    return undefined;
  },
  async has(_id: string) {
    return false;
  },
  async delete(_id: string) {
    return false;
  },
  async list() {
    return [] as readonly ArtifactRef[];
  },
} satisfies ArtifactStore;
expectAssignable<ArtifactStore>(legacyArtifactStore);

const legacySessionRecord = {
  id: "session:legacy",
  kind: "session-ref",
  turns: [],
  summaries: [],
  artifactRefs: [],
  planIds: [],
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
} satisfies SessionRecord;
const legacySessionStore = {
  kind: "session-store",
  id: "legacy-sessions",
  async create() {
    return legacySessionRecord;
  },
  async load(_id: string) {
    return legacySessionRecord;
  },
  async save(_session: SessionRecord) {
    return legacySessionRecord;
  },
  async branch(_parentId: string) {
    return legacySessionRecord;
  },
  async appendTurn(_input: AppendSessionTurnInput) {
    return legacySessionRecord;
  },
} satisfies SessionStore;
expectAssignable<SessionStore>(legacySessionStore);

const legacyAppend = {
  sessionId: legacySessionRecord.id,
  task: "Continue",
  artifactRefs: [artifactRef],
} satisfies AppendSessionTurnInput;
void legacyAppend;

declare const materializeInput: MaterializeContextInput;
declare const materialized: MaterializedContext;
expectType<PolicySpec | undefined>(materializeInput.policy);
expectType<readonly ArtifactLifecycleReport[]>(
  materialized.summaryLifecycleReports,
);
