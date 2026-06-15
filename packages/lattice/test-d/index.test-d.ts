import { expectAssignable, expectType } from "tsd";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  createAI,
  createNoopAgentHost,
  createRateLimitGroup,
  defineAgent,
  latticeVersion,
  receiptCid,
  withRateLimit,
} from "..";
import type {
  AgentTransport,
  CrewResult,
  RateLimitGroup,
  ReceiptEnvelope,
} from "..";

expectAssignable<string>(latticeVersion);

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
