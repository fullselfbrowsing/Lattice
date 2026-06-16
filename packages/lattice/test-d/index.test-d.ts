import { expectAssignable, expectType } from "tsd";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  collectStream,
  createAI,
  createLiteLLMProvider,
  createNoopAgentHost,
  createOpenRouterProvider,
  createRateLimitGroup,
  defineAgent,
  latticeVersion,
  receiptCid,
  withRateLimit,
} from "..";
import type {
  AgentTransport,
  CollectStreamOptions,
  CrewResult,
  GatewayMetadataValue,
  GatewayPolicy,
  LiteLLMProviderOptions,
  LiteLLMQuirks,
  OpenRouterProviderOptions,
  PolicySpec,
  ProviderGatewayMetadata,
  ProviderRunResponse,
  ProviderStream,
  ProviderStreamChunk,
  ProviderStreamTextDeltaChunk,
  RateLimitGroup,
  ReceiptEnvelope,
} from "..";

// Phase 40 public-surface guard:
// - Value exports are inventory-checked by test/public-surface.test.ts.
// - Type-only exports must still be asserted through package-root tsd files.
// - Any future v1.4 export added to src/index.ts must update either this
//   package-index smoke or a focused sibling test-d file.
expectAssignable<string>(latticeVersion);
expectAssignable<Function>(createAI);

declare const summarySchema: StandardSchemaV1;
declare const envelope: ReceiptEnvelope;

const agent = defineAgent({
  id: "public-index-smoke",
  intent: "Verify the package index exports the crew surface.",
  tools: [],
  summaryReturnSchema: summarySchema,
});

expectType<"agent">(agent.kind);
expectType<RateLimitGroup>(createRateLimitGroup());
expectType<AgentTransport>(withRateLimit(createRateLimitGroup()));
expectType<Promise<string>>(receiptCid(envelope));
expectType<Promise<CrewResult>>(
  createAI().runAgentCrew({
    root: agent,
    hosts: { childHost: createNoopAgentHost() },
  }),
);

const gatewayPolicy: GatewayPolicy = {
  routeTags: ["prod"],
  providerPreferences: ["openai"],
  metadata: { trace_id: "trace-41" },
  allowFallbacks: false,
};
const options: LiteLLMProviderOptions = {
  model: "gpt-4o",
  gateway: gatewayPolicy,
};
const litellm = createLiteLLMProvider(options);
expectType<"provider-adapter">(litellm.kind);
expectAssignable<LiteLLMQuirks>(litellm.quirks);
const openrouterOptions: OpenRouterProviderOptions = {
  model: "openai/gpt-oss-120b",
  fallbackModels: ["anthropic/claude-sonnet-4.5"],
};
const openrouter = createOpenRouterProvider(openrouterOptions);
expectType<"provider-adapter">(openrouter.kind);
const gatewayObservation: ProviderGatewayMetadata = {
  used: true,
  requestedModel: "openai/gpt-oss-120b",
  fallbackModels: ["anthropic/claude-sonnet-4.5"],
  observedModel: "anthropic/claude-sonnet-4.5",
};
void gatewayObservation;
const metadataValue: GatewayMetadataValue = { nested: ["ok", 1, false, null] };
void metadataValue;
const streamChunk: ProviderStreamTextDeltaChunk = {
  kind: "text-delta",
  output: "answer",
  text: "hi",
};
const streamChunks: ProviderStreamChunk[] = [streamChunk];
async function* publicStream(): ProviderStream {
  for (const chunk of streamChunks) {
    yield chunk;
  }
}
const collectOptions: CollectStreamOptions = { defaultOutput: "answer" };
expectType<Promise<ProviderRunResponse>>(collectStream(publicStream(), collectOptions));
const streamPolicy: PolicySpec = { stream: true };
void streamPolicy;
