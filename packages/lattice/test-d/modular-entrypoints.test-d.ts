import { expectType } from "tsd";
import { z } from "zod";

import { artifact, type ArtifactInput } from "@full-self-browsing/lattice/artifacts";
import {
  createExternalExecutionAudit,
  createMemoryKeySet,
  createNobleEd25519Signer,
  resolveReceiptPolicy,
  type AuditError,
  type ExternalExecutionAuditInput,
  type KeySet,
  type ReceiptEnvelope,
  type ReceiptIssuanceMode,
} from "@full-self-browsing/lattice/audit";
import {
  buildContextPack,
  materializeContext,
  type ArtifactLifecycleReport,
  type ArtifactRetentionPolicy,
  type ContextMaterializationError,
  type ContextPack,
  type ContextProjectionPlan,
  type MaterializeContextInput,
  type MaterializedContext,
  type MissingArtifactRefPolicy,
  type SelectedRoute,
} from "@full-self-browsing/lattice/context";
import {
  contract,
  materializeContext as materializeCoreContext,
  output,
  prepareCoreRun,
  type PersistenceError,
  type PreparedCoreRun,
  type PrepareCoreRunInput,
  type ProviderAdapter as CoreProviderAdapter,
} from "@full-self-browsing/lattice/core";
import {
  evalAgentRun,
  type AgentEvalResult,
} from "@full-self-browsing/lattice/eval";
import {
  collectStream,
  createFakeProvider,
  type ProviderAdapter,
} from "@full-self-browsing/lattice/providers";
import {
  COST_ESTIMATOR_VERSION,
  estimateCost,
  routeDeterministically,
  type CapabilityCatalog,
  type CostEstimate,
} from "@full-self-browsing/lattice/routing";
import {
  createMemoryArtifactStore,
  type ArtifactStore,
} from "@full-self-browsing/lattice/storage";
import {
  defineTool,
  mcpPromptArtifact,
  mcpResourceArtifact,
  mcpToolResultArtifact,
  parseToolUseEnvelope,
  validateToolCallRequests,
  type McpPromptArtifactInput,
  type McpResourceArtifactInput,
  type McpToolResultArtifactInput,
  type ToolUseRequest,
  type ValidatedToolCall,
} from "@full-self-browsing/lattice/tools";
import {
  createCostTracker,
  runAgent,
  type AgentIntent,
  type CostTrackerOptions,
} from "@full-self-browsing/lattice/agents";

const receiptMode: ReceiptIssuanceMode = "required";
expectType<ReceiptIssuanceMode>(resolveReceiptPolicy({ mode: receiptMode }).mode);
const auditError: AuditError = {
  kind: "audit",
  code: "receipt-signer-missing",
  stage: "pre-execution",
  message: "Receipt issuance requires a configured signer.",
  terminal: true,
};
expectType<"audit">(auditError.kind);

const modularEstimate: CostEstimate = estimateCost({
  pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
  inputTokens: 1,
  outputTokens: 1,
});
expectType<typeof COST_ESTIMATOR_VERSION>(modularEstimate.version);
const trackerOptions: CostTrackerOptions = {
  pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
};
expectType<number | null>(createCostTracker(trackerOptions).total().costUsd);
expectType<number | null>(createCostTracker().total().costUsd);

const provider = createFakeProvider();
expectType<ProviderAdapter>(provider);
expectType<CoreProviderAdapter>(provider);
expectType<typeof collectStream>(collectStream);

const keySet = createMemoryKeySet([]);
expectType<KeySet>(keySet);
const maybeReceipt = undefined as ReceiptEnvelope | undefined;
expectType<ReceiptEnvelope | undefined>(maybeReceipt);
expectType<typeof createExternalExecutionAudit>(createExternalExecutionAudit);
expectType<typeof createNobleEd25519Signer>(createNobleEd25519Signer);

const input = artifact.text("case body");
expectType<ArtifactInput>(input);

const pack = buildContextPack({
  task: "Summarize",
  artifacts: [input],
});
expectType<ContextPack>(pack);

const selectedRoute: SelectedRoute = {
  providerId: "custom",
  modelId: "custom:model",
  score: 1,
  estimates: { inputTokens: 1, outputTokens: 1 },
  contextWindow: 4_096,
  inputModalities: ["text"],
  outputModalities: ["text"],
  fileTransport: ["inline"],
};
const materializeInput = {
  contextPack: pack,
  route: selectedRoute,
  artifacts: [input],
  policy: {
    retention: "durable",
    missingArtifactRef: "omit",
  },
} satisfies MaterializeContextInput;
expectType<Promise<MaterializedContext>>(materializeContext(materializeInput));
expectType<typeof materializeContext>(materializeCoreContext);

const retention: ArtifactRetentionPolicy = "durable";
const missingReference: MissingArtifactRefPolicy = "omit";
expectType<"durable">(retention);
expectType<"omit">(missingReference);

const lifecycleReport: ArtifactLifecycleReport = {
  lifecycle: "summary",
  status: "skipped",
  reason: "policy",
  artifactId: input.id,
  ref: input,
};
expectType<"skipped">(lifecycleReport.status);

const projection: ContextProjectionPlan = {
  id: "projection:modular",
  providerId: selectedRoute.providerId,
  modelId: selectedRoute.modelId,
  artifactRefs: [input],
  summaryArtifactRefs: [],
  inputHashes: ["sha256:modular"],
  omittedArtifactIds: [],
  warnings: [],
};
expectType<readonly string[]>(projection.inputHashes);

const contextError: ContextMaterializationError = {
  kind: "context_materialization",
  message: "missing",
  reason: "missing-reference",
  terminal: true,
};
const persistenceError: PersistenceError = {
  kind: "persistence",
  message: "write failed",
  operation: "write",
  lifecycle: "provider-output",
  postProvider: true,
  terminal: true,
};
expectType<"context_materialization">(contextError.kind);
expectType<"persistence">(persistenceError.kind);

const outputs = {
  answer: output.citations(),
};
expectType<"capability-contract">(contract().kind);

const catalog: CapabilityCatalog = {
  version: "test",
  models: [],
};
const coreRunInput = {
  task: "Prepare standalone core inputs",
  artifacts: [input],
  outputs,
  catalog,
} satisfies PrepareCoreRunInput;
expectType<Promise<PreparedCoreRun<typeof outputs>>>(prepareCoreRun(coreRunInput));
routeDeterministically(catalog, {
  task: "Summarize",
  artifacts: [input],
  outputs,
});

const store = createMemoryArtifactStore();
expectType<ArtifactStore>(store);

const evalResult = evalAgentRun(
  { iterationsToGoal: 1, usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 } },
  { iterationsToGoal: 1, usage: { promptTokens: 1, completionTokens: 1, costUsd: 0 } },
);
expectType<AgentEvalResult>(evalResult);

const toolCalls = parseToolUseEnvelope('{"tool_calls":[{"id":"1","name":"lookup","args":{}}]}');
expectType<readonly ToolUseRequest[] | null>(toolCalls);
const tool = defineTool({
  name: "lookup",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "ok",
});
expectType<Promise<readonly ValidatedToolCall[] | undefined>>(
  validateToolCallRequests(
    [{ id: "1", name: "lookup", args: { query: "lattice" } }],
    { tools: [tool] },
  ),
);
const resourceInput: McpResourceArtifactInput = {
  uri: "file:///case.md",
  text: "Case body",
};
const promptInput: McpPromptArtifactInput = {
  name: "summarize",
  messages: [{ role: "user", content: "Summarize." }],
};
const resultInput: McpToolResultArtifactInput = {
  toolName: "lookup",
  callId: "call-1",
  content: [{ type: "text", text: "found" }],
};
expectType<ArtifactInput>(mcpResourceArtifact(resourceInput));
expectType<ArtifactInput>(mcpPromptArtifact(promptInput));
expectType<ArtifactInput>(mcpToolResultArtifact(resultInput));

expectType<typeof runAgent>(runAgent);
const intent = {
  task: "Call a tool",
  tools: [],
} satisfies AgentIntent;
void intent;

async function typedAgentOutputSmoke() {
  const result = await runAgent({
    task: "Return a build config",
    tools: [],
    outputs: {
      build: z.object({ command: z.string() }),
    },
  });

  if (result.kind === "success") {
    expectType<string>(result.output.build.command);
  }
}
void typedAgentOutputSmoke;

const externalAuditInput = {
  task: "Audit an external call",
  policy: {},
  contract: contract(),
  model: { requested: "external-model", observed: null },
  route: { providerId: "external", capabilityId: "external-model", attemptNumber: 1 },
  usage: { promptTokens: 1, completionTokens: 1, costUsd: null },
  outputs: { answer: "ok" },
} satisfies ExternalExecutionAuditInput;
void externalAuditInput;
