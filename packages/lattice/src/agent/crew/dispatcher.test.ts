import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createHookPipeline } from "../../contract/bands.js";
import { createFakeProvider } from "../../providers/fake.js";
import type { ProviderRunResponse, Usage } from "../../providers/provider.js";
import { defineTool } from "../../tools/tools.js";

import { formatToolsForProvider } from "../format-tools.js";
import { createNoopAgentHost } from "../host.js";
import { runAgentInternal, type DispatchToolUseContext } from "../runtime.js";

import { defineAgent, type AgentSpec } from "./agent-spec.js";
import { validateCrewPolicy } from "./crew-policy.js";
import {
  createCrewDispatcher,
  deriveChildBudget,
  type CrewDispatchContext,
} from "./dispatcher.js";

// ---------------------------------------------------------------------------
// Test helpers (mirrors runtime.test.ts stub conventions)
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

function makeRejectingSchema(message: string): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      validate: () => ({ issues: [{ message }] }),
    } as never,
  } as StandardSchemaV1;
}

function makeTool(
  name: string,
  execute: (input: unknown) => unknown | Promise<unknown> = () => "ok",
) {
  return defineTool({
    name,
    inputSchema: makePassingSchema(),
    execute,
  });
}

/**
 * Scripted fake provider: returns queued responses in order, records every
 * incoming request task, and counts calls.
 */
function makeScriptedFake(
  responses: readonly string[],
  usage: Usage = { promptTokens: 5, completionTokens: 3, costUsd: null },
) {
  const queue = [...responses];
  const tasks: string[] = [];
  let calls = 0;
  const fake = createFakeProvider({
    id: "crew-fake",
    response: (request): ProviderRunResponse => {
      calls += 1;
      tasks.push(request.task);
      return {
        rawOutputs: { answer: queue.shift() ?? "" },
        normalizedUsage: { ...usage },
      };
    },
  });
  return {
    fake,
    tasks,
    calls: () => calls,
  };
}

function makeResearcherSpec(overrides: Partial<Omit<AgentSpec, "kind">> = {}): AgentSpec {
  return defineAgent({
    id: "researcher",
    intent: "Research the delegated task and produce a concise summary.",
    tools: [],
    summaryReturnSchema: makePassingSchema(),
    ...overrides,
  });
}

function makeRootSpec(children: readonly AgentSpec[]): AgentSpec {
  return defineAgent({
    id: "lead",
    intent: "Coordinate research by delegating to child agents.",
    tools: [],
    childAgents: [...children],
    summaryReturnSchema: makePassingSchema(),
  });
}

function makeCtx(overrides: Partial<CrewDispatchContext> = {}): CrewDispatchContext {
  return {
    policy: validateCrewPolicy({}),
    childHost: createNoopAgentHost(),
    ancestry: [],
    recordUsage: () => {},
    remainingBudget: () => undefined,
    sharedPrefix: "",
    mintedReceipts: () => {},
    config: {},
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
// Behavior 1: dispatch branch routes a named child through the seam and the
// summary envelope re-enters the parent conversation as a role:"tool" turn.
// ---------------------------------------------------------------------------

describe("createCrewDispatcher — dispatch branch + summary re-entry (D-01/D-04)", () => {
  it("runs the child loop on a childAgents id match and re-enters the validated summary as a tool turn", async () => {
    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake([
      '{"tool_calls":[{"id":"d1","name":"researcher","args":{"task":"find X"}}]}',
      "found X result",
      "Done.",
    ]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const result = await runAgentInternal(
      { task: "Find X for me.", tools: dispatcher.childToolDeclarations },
      { providers: [scripted.fake] },
      { dispatchToolUse: dispatcher.dispatchToolUse },
    );

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.output).toEqual({ answer: "Done." });
    }
    // Call order: parent iter0 (dispatch envelope), child iter0 (summary),
    // parent iter1 (final answer).
    expect(scripted.calls()).toBe(3);
    // The child's task carries the delegated task string.
    expect(scripted.tasks[1]).toContain("USER:\nfind X");
    // The parent's second request renders the summary envelope as a standard
    // TOOL_RESULT turn with the ORIGINAL toolCallId/toolName (D-04).
    const expectedEnvelope = JSON.stringify({
      summary: "found X result",
      artifacts: [],
      receipts: [],
    });
    expect(scripted.tasks[2]).toContain(
      `TOOL_RESULT (name=researcher id=d1):\n${expectedEnvelope}`,
    );
  });

  // Behavior 2: non-child names fall through to the default runTool path.
  it("returns undefined for a name NOT in childAgents (seam fall-through contract)", async () => {
    const root = makeRootSpec([makeResearcherSpec()]);
    const scripted = makeScriptedFake([]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "t1", name: "ordinary-tool", args: { value: 1 } },
      makeLoopCtx(),
    );

    expect(dispatched).toBeUndefined();
    expect(scripted.calls()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Behavior 3: summary envelopes are schema-validated; failures return the
// structured recoverable error (D-09).
// ---------------------------------------------------------------------------

describe("createCrewDispatcher — summaryReturnSchema validation (D-09)", () => {
  it("returns a structured recoverable error when the assembled envelope fails validation", async () => {
    const researcher = makeResearcherSpec({
      summaryReturnSchema: makeRejectingSchema("summary must cite sources"),
    });
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake(["unciteable summary"]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "d2", name: "researcher", args: { task: "summarize" } },
      makeLoopCtx(),
    );

    expect(dispatched).toBeDefined();
    const parsed = JSON.parse(dispatched?.content ?? "{}") as {
      error: { kind: string; reason: string; terminal: boolean };
    };
    expect(parsed.error.kind).toBe("summary-validation-failed");
    expect(parsed.error.terminal).toBe(false);
    expect(typeof parsed.error.reason).toBe("string");
    expect(parsed.error.reason).toContain("summary must cite sources");
  });
});

// ---------------------------------------------------------------------------
// Behavior 4: per-dimension budget derivation (D-07) with null-cost safety
// (Pitfall 4).
// ---------------------------------------------------------------------------

describe("deriveChildBudget — per-dimension min (D-07, Pitfall 4)", () => {
  it("takes the per-dimension min of spec budget and crew pool", () => {
    const effective = deriveChildBudget(
      { maxIterations: 5, maxCostUsd: 2, maxWallTimeMs: 60_000 },
      { maxIterations: 3, maxCostUsd: 4, maxWallTimeMs: 90_000 },
    );
    expect(effective).toEqual({
      maxIterations: 3,
      maxWallTimeMs: 60_000,
      maxCostUsd: 2,
    });
  });

  it("caps iterations by policy.maxIterationsPerAgent", () => {
    const effective = deriveChildBudget({ maxIterations: 5 }, undefined, 2);
    expect(effective).toEqual({ maxIterations: 2 });
  });

  it("never produces NaN when one side of a dimension is missing or null (null-cost safety)", () => {
    const effective = deriveChildBudget(
      { maxCostUsd: 2, maxIterations: 3 },
      // A pool derived from null-cost (unmeasured) usage omits maxCostUsd; a
      // sloppy caller might even pass null — neither may poison min().
      { maxCostUsd: null as never, maxIterations: 5 },
    );
    expect(effective).toEqual({ maxIterations: 3, maxCostUsd: 2 });
    for (const value of Object.values(effective ?? {})) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("returns undefined when no dimension is bounded anywhere", () => {
    expect(deriveChildBudget(undefined, undefined)).toBeUndefined();
    expect(deriveChildBudget({}, {})).toBeUndefined();
  });
});

describe("createCrewDispatcher — child budget enforcement (D-07)", () => {
  it("bounds the child loop by min(spec budget, remaining crew pool)", async () => {
    const noop = makeTool("noop");
    const researcher = makeResearcherSpec({
      tools: [noop],
      contract: { kind: "capability-contract", budget: { maxIterations: 5 } },
    });
    const root = makeRootSpec([researcher]);
    const loopEnvelope = '{"tool_calls":[{"id":"x","name":"noop","args":{}}]}';
    // Child never produces a final answer; it must be cut off by the derived
    // budget min(5, 2) = 2 iterations.
    const scripted = makeScriptedFake([loopEnvelope, loopEnvelope, loopEnvelope, loopEnvelope]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        remainingBudget: () => ({ maxIterations: 2 }),
      }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "d3", name: "researcher", args: { task: "loop forever" } },
      makeLoopCtx(),
    );

    expect(scripted.calls()).toBe(2);
    const parsed = JSON.parse(dispatched?.content ?? "{}") as {
      error: { kind: string; reason: string; terminal: boolean };
    };
    expect(parsed.error.kind).toBe("agent-max-iterations");
    expect(parsed.error.terminal).toBe(false);
  });

  it("derives budgets without NaN when the fake provider reports costUsd: null", async () => {
    const researcher = makeResearcherSpec({
      contract: { kind: "capability-contract", budget: { maxCostUsd: 2 } },
    });
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake(
      ["null-cost summary"],
      { promptTokens: 5, completionTokens: 3, costUsd: null },
    );
    const usages: Usage[] = [];
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        remainingBudget: () => ({ maxCostUsd: 3, maxIterations: 4 }),
        recordUsage: (_agentId, usage) => {
          usages.push(usage);
        },
      }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "d4", name: "researcher", args: { task: "free task" } },
      makeLoopCtx(),
    );

    const parsed = JSON.parse(dispatched?.content ?? "{}") as { summary?: string };
    expect(parsed.summary).toBe("null-cost summary");
    // Child usage recorded exactly once (Pitfall 3) and null cost preserved
    // (never coerced to NaN/0-poisoned arithmetic).
    expect(usages.length).toBe(1);
    expect(usages[0]?.costUsd).toBeNull();
    expect(Number.isNaN(usages[0]?.promptTokens)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Behavior 5: synthesized child tool declarations (Pitfall 5).
// ---------------------------------------------------------------------------

describe("createCrewDispatcher — childToolDeclarations synthesis (D-01, Pitfall 5)", () => {
  it("synthesizes ToolDefinition-shaped declarations the model + Phase 37 registries accept", () => {
    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake([]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    expect(dispatcher.childToolDeclarations.length).toBe(1);
    const decl = dispatcher.childToolDeclarations[0];
    expect(decl).toBeDefined();
    if (decl === undefined) return;

    // ToolDefinition shape (Phase 37 validateToolCalls registries take
    // ToolDefinition[] — synthetic entries must be real members).
    expect(decl.kind).toBe("tool");
    expect(decl.name).toBe("researcher");
    expect(typeof decl.execute).toBe("function");
    // Description embeds the child's intent + the summary envelope shape.
    expect(decl.description).toContain(researcher.intent);
    expect(decl.description).toContain("summary");
    expect(decl.description).toContain("receipts");

    // ~standard input schema validates { task: string } and rejects others.
    const standard = decl.inputSchema["~standard"];
    expect(standard.vendor).toBe("lattice-crew");
    const ok = standard.validate({ task: "do it" });
    expect(ok).toHaveProperty("value");
    const bad = standard.validate({ nope: true });
    expect(bad).toHaveProperty("issues");

    // formatToolsForProvider renders the declarations (model-visible tools).
    const handle = formatToolsForProvider("crew-fake", dispatcher.childToolDeclarations);
    const systemBlock = handle.describeForSystem();
    expect(systemBlock).toContain("name: researcher");
    expect(systemBlock).toContain(researcher.intent);
  });
});
