import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createHookPipeline } from "../../contract/bands.js";
import { createFakeProvider } from "../../providers/fake.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
} from "../../providers/provider.js";
import type { AnthropicQuirks } from "../../providers/quirks.js";
import { defineTool } from "../../tools/tools.js";

import { formatToolsForProvider } from "../format-tools.js";
import { createNoopAgentHost } from "../host.js";
import type { DispatchToolUseContext } from "../runtime.js";

import { defineAgent, type AgentSpec } from "./agent-spec.js";
import { validateCrewPolicy } from "./crew-policy.js";
import {
  composeCrewCachePrefix,
  createCrewDispatcher,
  type CrewDispatchContext,
} from "./dispatcher.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePassingSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

const LOOKUP_TOOL = defineTool({
  name: "lookup",
  description: "Look up a fact in the crew knowledge base.",
  inputSchema: makePassingSchema(),
  execute: () => "fact",
});

function makeResearcher(): AgentSpec {
  return defineAgent({
    id: "researcher",
    intent: "Research the delegated task and produce a concise summary.",
    tools: [LOOKUP_TOOL],
    summaryReturnSchema: makePassingSchema(),
  });
}

function makeRoot(child: AgentSpec): AgentSpec {
  return defineAgent({
    id: "lead",
    intent: "Coordinate research.",
    tools: [],
    childAgents: [child],
    summaryReturnSchema: makePassingSchema(),
  });
}

const BASE_QUIRKS = {
  supportsToolChoice: false,
  parallelToolCalls: false,
  structuredOutputs: false,
  responseFormatHonored: false,
  streamingDiverges: false,
};

/** Fake provider capturing every full ProviderRunRequest it receives. */
function makeCapturingFake(options: { readonly quirked: boolean }) {
  const requests: ProviderRunRequest[] = [];
  const base = createFakeProvider({
    id: options.quirked ? "quirked-fake" : "plain-fake",
    response: (request): ProviderRunResponse => {
      requests.push(request);
      return {
        rawOutputs: { answer: "summary text" },
        normalizedUsage: { promptTokens: 5, completionTokens: 3, costUsd: null },
      };
    },
  });
  const adapter: ProviderAdapter = options.quirked
    ? {
        ...base,
        quirks: {
          ...BASE_QUIRKS,
          promptCachingSupported: true,
          extendedThinkingSupported: false,
          toolUseInputSchemaStrict: false,
        } as AnthropicQuirks,
      }
    : base;
  return { adapter, requests };
}

function makeCtx(
  adapter: ProviderAdapter,
  sharedPrefix: string,
  overrides: Partial<CrewDispatchContext> = {},
): CrewDispatchContext {
  return {
    policy: validateCrewPolicy({}),
    childHost: createNoopAgentHost(),
    ancestry: [],
    recordUsage: () => {},
    remainingBudget: () => undefined,
    sharedPrefix,
    mintedReceipts: () => {},
    config: { providers: [adapter] },
    ...overrides,
  };
}

function makeLoopCtx(): DispatchToolUseContext {
  return {
    iterationIndex: 0,
    conversation: [],
    pipeline: createHookPipeline(),
  };
}

// ---------------------------------------------------------------------------
// Behavior 1: byte-identical prefix across 3 consecutive child dispatches.
// ---------------------------------------------------------------------------

describe("crew cache prefix — byte stability across dispatches (DELEG-04)", () => {
  it("carries a strictly identical (===) cacheSystemPrefix across 3 consecutive child dispatches", async () => {
    const researcher = makeResearcher();
    const root = makeRoot(researcher);
    const sharedPrefix = composeCrewCachePrefix(researcher.tools);
    const { adapter, requests } = makeCapturingFake({ quirked: true });
    const dispatcher = createCrewDispatcher(root, makeCtx(adapter, sharedPrefix));

    for (const id of ["p1", "p2", "p3"]) {
      const dispatched = await dispatcher.dispatchToolUse(
        { id, name: "researcher", args: { task: "find X" } },
        makeLoopCtx(),
      );
      expect(dispatched).toBeDefined();
    }

    expect(requests.length).toBe(3);
    const prefixes = requests.map((request) => request.cacheSystemPrefix);
    expect(prefixes[0]).toBeDefined();
    // Strict byte equality — not just snapshot match.
    expect(prefixes[0] === sharedPrefix).toBe(true);
    expect(prefixes[0] === prefixes[1]).toBe(true);
    expect(prefixes[1] === prefixes[2]).toBe(true);
    expect(prefixes[0]).toMatchSnapshot();
  });
});

// ---------------------------------------------------------------------------
// Behavior 2: quirks-gated hoist — prefix on the field, body-only task.
// ---------------------------------------------------------------------------

describe("crew cache prefix — quirks-gated hoist (Anthropic path)", () => {
  it("hoists the prefix to cacheSystemPrefix and sends a body-only task (no duplication)", async () => {
    const researcher = makeResearcher();
    const root = makeRoot(researcher);
    const sharedPrefix = composeCrewCachePrefix(researcher.tools);
    const { adapter, requests } = makeCapturingFake({ quirked: true });
    const dispatcher = createCrewDispatcher(root, makeCtx(adapter, sharedPrefix));

    await dispatcher.dispatchToolUse(
      { id: "h1", name: "researcher", args: { task: "find X" } },
      makeLoopCtx(),
    );

    expect(requests.length).toBe(1);
    const request = requests[0];
    expect(request).toBeDefined();
    if (request === undefined) return;

    // Field carries the EXACT shared prefix.
    expect(request.cacheSystemPrefix).toBe(sharedPrefix);
    // The task lacks the prefix substring entirely (no duplication) ...
    expect(request.task.includes(sharedPrefix)).toBe(false);
    // ... and is EXACTLY the 39-03 body-only rendering of the child's
    // iteration-0 conversation.
    const handle = formatToolsForProvider(adapter.id, researcher.tools);
    expect(request.task).toBe(handle.buildTaskBody([{ role: "user", content: "find X" }]));
    // Reconstruction invariant: prefix + "\n" + body === full buildTask.
    expect(`${sharedPrefix}\n${request.task}`).toBe(
      handle.buildTask([{ role: "user", content: "find X" }]),
    );
  });
});

// ---------------------------------------------------------------------------
// Behavior 3: non-quirked providers — no field, prefix at head of task.
// ---------------------------------------------------------------------------

describe("crew cache prefix — non-quirked fold-in (OpenAI token-prefix path)", () => {
  it("sets NO cacheSystemPrefix own-property and keeps the prefix at the HEAD of task", async () => {
    const researcher = makeResearcher();
    const root = makeRoot(researcher);
    const sharedPrefix = composeCrewCachePrefix(researcher.tools);
    const { adapter, requests } = makeCapturingFake({ quirked: false });
    const dispatcher = createCrewDispatcher(root, makeCtx(adapter, sharedPrefix));

    await dispatcher.dispatchToolUse(
      { id: "f1", name: "researcher", args: { task: "find X" } },
      makeLoopCtx(),
    );

    expect(requests.length).toBe(1);
    const request = requests[0];
    expect(request).toBeDefined();
    if (request === undefined) return;

    // No own-property at all (conditional spread — never undefined-assigned,
    // Pitfall 6).
    expect(Object.prototype.hasOwnProperty.call(request, "cacheSystemPrefix")).toBe(false);
    // The prefix sits at the HEAD of the task (OpenAI automatic token-prefix
    // caching path — buildTask unchanged).
    expect(request.task.startsWith(sharedPrefix)).toBe(true);
    const handle = formatToolsForProvider(adapter.id, researcher.tools);
    expect(request.task).toBe(handle.buildTask([{ role: "user", content: "find X" }]));
  });
});

// ---------------------------------------------------------------------------
// Behavior 4: deterministic composition (anti-pattern guard).
// ---------------------------------------------------------------------------

describe("composeCrewCachePrefix — deterministic composition", () => {
  it("yields identical bytes when composed twice from the same tool surface", () => {
    const researcher = makeResearcher();
    const first = composeCrewCachePrefix(researcher.tools);
    const second = composeCrewCachePrefix(researcher.tools);
    expect(first === second).toBe(true);
    expect(first.length).toBeGreaterThan(0);
  });

  it("yields identical bytes across independently-synthesized child declarations", () => {
    const { adapter } = makeCapturingFake({ quirked: false });
    const dispatcherA = createCrewDispatcher(makeRoot(makeResearcher()), makeCtx(adapter, ""));
    const dispatcherB = createCrewDispatcher(makeRoot(makeResearcher()), makeCtx(adapter, ""));
    const prefixA = composeCrewCachePrefix(dispatcherA.childToolDeclarations);
    const prefixB = composeCrewCachePrefix(dispatcherB.childToolDeclarations);
    // Declarations are pure derivations of the spec — no timestamps or
    // random ids may leak into the prefix bytes.
    expect(prefixA === prefixB).toBe(true);
  });

  it("contains no ISO timestamps (anti-pattern guard)", () => {
    const prefix = composeCrewCachePrefix(makeResearcher().tools);
    expect(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(prefix)).toBe(false);
  });
});
