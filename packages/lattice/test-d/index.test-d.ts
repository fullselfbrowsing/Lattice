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
