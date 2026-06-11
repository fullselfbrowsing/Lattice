import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  expectAssignable,
  expectError,
  expectType,
} from "tsd";

import {
  createAI,
  createFakeProvider,
  createNoopAgentHost,
  createRateLimitGroup,
  defineAgent,
  defineTool,
  receiptCid,
  runAgentCrew,
  withRateLimit,
} from "@full-self-browsing/lattice";
import type {
  AgentResult,
  AgentSpec,
  AgentTransport,
  BudgetInvariant,
  CrewAgentResult,
  CrewPolicy,
  CrewResult,
  ProviderRunRequest,
  ProviderRunResponse,
  RateLimitGroup,
  RateLimitGroupOptions,
  RateLimitLease,
  ReceiptEnvelope,
  RunAgentCrewOptions,
  Usage,
} from "@full-self-browsing/lattice";

declare const summarySchema: StandardSchemaV1;
declare const request: ProviderRunRequest;
declare const envelope: ReceiptEnvelope;
declare const crewResult: CrewResult;

const lookupTool = defineTool({
  name: "lookup",
  inputSchema: summarySchema,
  execute(input) {
    expectType<unknown>(input);
    return { ok: true };
  },
});

const child = defineAgent({
  id: "researcher",
  intent: "Research a focused topic and return a summary.",
  tools: [lookupTool],
  summaryReturnSchema: summarySchema,
});

const root = defineAgent({
  id: "lead",
  intent: "Delegate to the researcher, then synthesize the result.",
  tools: [],
  childAgents: [child],
  summaryReturnSchema: summarySchema,
});

expectType<AgentSpec>(root);
expectType<"agent">(root.kind);
expectType<ReadonlyArray<AgentSpec> | undefined>(root.childAgents);
expectType<StandardSchemaV1>(root.summaryReturnSchema);
expectError(
  defineAgent({
    id: "missing-summary-schema",
    intent: "This must fail because the schema is required.",
    tools: [],
  }),
);

const budget = {
  maxCostUsd: 0.05,
  maxIterations: 6,
  maxWallTimeMs: 30_000,
} satisfies BudgetInvariant;

const policy = {
  budget,
  maxTotalIterations: 8,
  maxIterationsPerAgent: 3,
  maxConcurrentChildren: 1,
  maxDepth: 2,
  limits: {
    fake: { requestsPerMinute: 10, tokensPerMinute: 1_000 },
  },
  coordination: "managed",
} satisfies CrewPolicy;

expectAssignable<CrewPolicy>(policy);
expectError<CrewPolicy>({ coordination: "parallel" });
expectError<CrewPolicy>({
  limits: { fake: { requestsPerMinute: "fast" } },
});

const childHost = createNoopAgentHost();
const crewOptions = {
  root,
  hosts: { childHost },
  policy,
} satisfies RunAgentCrewOptions;

expectAssignable<RunAgentCrewOptions>(crewOptions);
expectError<RunAgentCrewOptions>({ root, policy });
expectType<Promise<CrewResult>>(runAgentCrew(crewOptions));
expectType<Promise<CrewResult>>(
  createAI({ providers: [createFakeProvider()] }).runAgentCrew(crewOptions),
);

expectType<AgentResult>(crewResult.result);
expectType<ReadonlyArray<CrewAgentResult>>(crewResult.perAgent);
expectType<Usage>(crewResult.usage);
expectType<number>(crewResult.totalIterations);
expectType<ReadonlyArray<ReceiptEnvelope>>(crewResult.receipts);
expectType<string | undefined>(crewResult.crewRootCid);
expectType<string>(crewResult.perAgent[0]!.id);
expectType<Usage>(crewResult.perAgent[0]!.usage);
expectType<number>(crewResult.perAgent[0]!.iterations);
expectType<readonly string[]>(crewResult.perAgent[0]!.receiptCids);

const rateLimitOptions = {
  requestsPerMinute: 5,
  tokensPerMinute: 500,
} satisfies RateLimitGroupOptions;
const group = createRateLimitGroup(rateLimitOptions);

expectType<RateLimitGroup>(group);
expectType<"rate-limit-group">(group.kind);
expectType<Promise<RateLimitLease>>(group.acquire({ inputTokens: 42 }));

declare const lease: RateLimitLease;
expectType<void>(lease.release({ promptTokens: 21 }));

const transport = withRateLimit(group);
expectType<AgentTransport>(transport);
expectType<Promise<ProviderRunResponse>>(
  transport.call(createFakeProvider(), request),
);

expectAssignable<ProviderRunRequest>({
  task: "Use the shared cache prefix.",
  artifacts: [],
  outputs: ["answer"],
  cacheSystemPrefix: "stable crew instructions",
});

expectType<Promise<string>>(receiptCid(envelope));
