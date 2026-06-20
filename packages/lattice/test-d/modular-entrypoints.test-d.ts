import { expectType } from "tsd";

import { artifact, type ArtifactInput } from "@full-self-browsing/lattice/artifacts";
import {
  createMemoryKeySet,
  type KeySet,
  type ReceiptEnvelope,
} from "@full-self-browsing/lattice/audit";
import {
  buildContextPack,
  type ContextPack,
} from "@full-self-browsing/lattice/context";
import {
  contract,
  output,
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
  routeDeterministically,
  type CapabilityCatalog,
} from "@full-self-browsing/lattice/routing";
import {
  createMemoryArtifactStore,
  type ArtifactStore,
} from "@full-self-browsing/lattice/storage";
import {
  parseToolUseEnvelope,
  type ToolUseRequest,
} from "@full-self-browsing/lattice/tools";
import {
  runAgent,
  type AgentIntent,
} from "@full-self-browsing/lattice/agents";

const provider = createFakeProvider();
expectType<ProviderAdapter>(provider);
expectType<CoreProviderAdapter>(provider);
expectType<typeof collectStream>(collectStream);

const keySet = createMemoryKeySet([]);
expectType<KeySet>(keySet);
const maybeReceipt = undefined as ReceiptEnvelope | undefined;
expectType<ReceiptEnvelope | undefined>(maybeReceipt);

const input = artifact.text("case body");
expectType<ArtifactInput>(input);

const pack = buildContextPack({
  task: "Summarize",
  artifacts: [input],
});
expectType<ContextPack>(pack);

const outputs = {
  answer: output.citations(),
};
expectType<"capability-contract">(contract().kind);

const catalog: CapabilityCatalog = {
  version: "test",
  models: [],
};
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

expectType<typeof runAgent>(runAgent);
const intent = {
  task: "Call a tool",
  tools: [],
} satisfies AgentIntent;
void intent;
