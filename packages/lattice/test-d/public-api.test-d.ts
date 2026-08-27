import { expectAssignable, expectType } from "tsd";

import {
  CANONICAL_PROJECTED_OUTPUT_TOKENS,
  COST_ESTIMATOR_VERSION,
  createCostTracker,
  estimateCost,
  resolveReceiptPolicy,
} from "@full-self-browsing/lattice";

import type {
  AppendSessionTurnInput,
  AgentFailure,
  AgentResult,
  AgentSnapshot,
  AuditError,
  ArtifactInput,
  ArtifactLifecycleReport,
  ArtifactRef,
  ArtifactRetentionPolicy,
  ArtifactStorageRef,
  ArtifactStore,
  ContextMaterializationError,
  ContextProjectionPlan,
  CostEstimate,
  CostTrackerOptions,
  IterationRecord,
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
  ReceiptIssuanceMode,
  ReceiptEnvelope,
  ReceiptSigner,
  SelectedRoute,
  SessionRecord,
  SessionStore,
} from "@full-self-browsing/lattice";

const receiptMode: ReceiptIssuanceMode = "required";
expectType<"required">(receiptMode);
expectType<ReceiptIssuanceMode>(resolveReceiptPolicy({ mode: receiptMode }).mode);

const auditError: AuditError = {
  kind: "audit",
  code: "receipt-signing-failed",
  stage: "post-execution",
  message: "Receipt signing failed.",
  terminal: true,
};
expectType<"audit">(auditError.kind);

const costEstimate: CostEstimate = estimateCost({
  pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
  inputTokens: 1_000,
  outputTokens: CANONICAL_PROJECTED_OUTPUT_TOKENS,
});
expectType<typeof COST_ESTIMATOR_VERSION>(costEstimate.version);

const trackerOptions: CostTrackerOptions = {
  pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
};
const configuredTracker = createCostTracker(trackerOptions);
const legacyTracker = createCostTracker();
expectType<number | null>(configuredTracker.total().costUsd);
expectType<number | null>(legacyTracker.total().costUsd);

const legacySigner = {
  kid: "legacy-signer",
  publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "test" },
  async sign(_bytes: Uint8Array) {
    return new Uint8Array([1, 2, 3]);
  },
} satisfies ReceiptSigner;
expectAssignable<ReceiptSigner>(legacySigner);

const legacySelectedRoute: SelectedRoute = {
  providerId: "legacy-provider",
  modelId: "legacy-provider:model",
  score: 1,
  estimates: {
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0,
  },
  inputModalities: ["text"],
  outputModalities: ["text"],
  fileTransport: ["inline"],
};
expectType<number | undefined>(legacySelectedRoute.estimates.costUsd);

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

declare const agentReceipt: ReceiptEnvelope;
declare const agentResult: AgentResult;

const historicalIteration: IterationRecord = {
  index: 0,
  provider: "legacy-provider",
  promptTokens: 0,
  completionTokens: 0,
  costUsd: null,
  durationMs: 0,
  toolCalls: [],
};
const evidenceIteration: IterationRecord = {
  ...historicalIteration,
  iterationId: "agent-execution:packed:iteration:0",
  receipt: agentReceipt,
};
const historicalSnapshot: AgentSnapshot = {
  version: "agent-snapshot/v1",
  iterationIndex: 0,
  conversation: [],
  cumulativeUsage: { promptTokens: 0, completionTokens: 0, costUsd: null },
  providerName: "legacy-provider",
  capturedAt: "2026-07-17T00:00:00.000Z",
};
const evidenceSnapshot: AgentSnapshot = {
  ...historicalSnapshot,
  executionId: "agent-execution:packed",
  iterations: [evidenceIteration],
};
const recoveryFailure = {
  kind: "agent-recovery-failed",
  reason: "snapshot-invalid",
  usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
  iterations: [],
} satisfies AgentFailure;

expectType<string | undefined>(historicalIteration.iterationId);
expectType<ReceiptEnvelope | undefined>(evidenceIteration.receipt);
expectType<string | undefined>(historicalSnapshot.executionId);
expectType<readonly IterationRecord[] | undefined>(evidenceSnapshot.iterations);
expectType<"agent-recovery-failed">(recoveryFailure.kind);
expectType<ReceiptEnvelope | undefined>(agentResult.receipt);
expectType<string | undefined>(agentResult.iterations[0]!.iterationId);
