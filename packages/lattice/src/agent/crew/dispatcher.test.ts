import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createHookPipeline } from "../../contract/bands.js";
import { createFakeProvider } from "../../providers/fake.js";
import type { ProviderRunResponse, Usage } from "../../providers/provider.js";
import { receiptCid } from "../../receipts/cid.js";
import { createMemoryKeySet } from "../../receipts/keyset.js";
import { createReceipt } from "../../receipts/receipt.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../../receipts/sign.js";
import type { CapabilityReceiptBody, ReceiptEnvelope, ReceiptSigner } from "../../receipts/types.js";
import { verifyReceipt } from "../../receipts/verify.js";
import type { SerializedSnapshot } from "../../runtime/survivability.js";
import { defineTool } from "../../tools/tools.js";

import { formatToolsForProvider } from "../format-tools.js";
import { createNoopAgentHost, type AgentHost } from "../host.js";
import { runAgentInternal, type DispatchToolUseContext } from "../runtime.js";
import type { AgentFailure } from "../types.js";

import { defineAgent, type AgentSpec } from "./agent-spec.js";
import { validateCrewPolicy } from "./crew-policy.js";
import {
  classifyChildFailure,
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

// ---------------------------------------------------------------------------
// Task 2 — cycle/depth enforcement (D-05)
// ---------------------------------------------------------------------------

const ZERO_USAGE: Usage = { promptTokens: 0, completionTokens: 0, costUsd: null };

function makeFailure(
  kind: AgentFailure["kind"],
  reason?: string,
): AgentFailure {
  return {
    kind,
    usage: ZERO_USAGE,
    iterations: [],
    ...(reason !== undefined ? { reason } : {}),
  };
}

function parseError(content: string | undefined): {
  error: { kind: string; reason: string; terminal: boolean };
} {
  return JSON.parse(content ?? "{}") as {
    error: { kind: string; reason: string; terminal: boolean };
  };
}

describe("createCrewDispatcher — cycle + depth enforcement (D-05)", () => {
  it("rejects a dispatch whose target id already appears in the ancestry chain", async () => {
    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake([]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        ancestry: ["researcher"],
        policy: validateCrewPolicy({ maxDepth: 5 }),
      }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "c1", name: "researcher", args: { task: "loop back" } },
      makeLoopCtx(),
    );

    const parsed = parseError(dispatched?.content);
    expect(parsed.error.kind).toBe("crew-cycle-rejected");
    expect(parsed.error.terminal).toBe(false);
    // The child loop never ran.
    expect(scripted.calls()).toBe(0);
  });

  it("rejects self-dispatch (target id equals the dispatching agent's id)", async () => {
    const selfChild = makeResearcherSpec({ id: "lead" });
    const root = makeRootSpec([selfChild]);
    const scripted = makeScriptedFake([]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "c2", name: "lead", args: { task: "recurse" } },
      makeLoopCtx(),
    );

    expect(parseError(dispatched?.content).error.kind).toBe("crew-cycle-rejected");
    expect(scripted.calls()).toBe(0);
  });

  it("rejects a child's own delegation at maxDepth 1 (ancestry length >= maxDepth gate)", async () => {
    const digger = makeResearcherSpec({ id: "digger" });
    const researcher = makeResearcherSpec({ childAgents: [digger] });
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake([
      // child iter0: the researcher tries to dispatch its own child.
      '{"tool_calls":[{"id":"g1","name":"digger","args":{"task":"dig"}}]}',
      // child iter1: after receiving the depth rejection, it answers.
      "summary without digging",
    ]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "d5", name: "researcher", args: { task: "research deep" } },
      makeLoopCtx(),
    );

    // The grandchild never ran: only the researcher's two iterations hit the
    // provider — the depth rejection happened at the child's own dispatcher.
    expect(scripted.calls()).toBe(2);
    expect(scripted.tasks[1]).toContain('"kind":"crew-depth-exceeded"');
    expect(scripted.tasks[1]).toContain('"terminal":false');
    const parsed = JSON.parse(dispatched?.content ?? "{}") as { summary?: string };
    expect(parsed.summary).toBe("summary without digging");
  });

  it("persists the ancestry chain on the child's AgentSnapshot when snapshots are captured", async () => {
    const noop = makeTool("noop");
    const researcher = makeResearcherSpec({ tools: [noop] });
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake([
      '{"tool_calls":[{"id":"s1","name":"noop","args":{}}]}',
      "snapshot summary",
    ]);
    const saved: SerializedSnapshot[] = [];
    const childHost: AgentHost = {
      kind: "agent-host",
      storage: {
        async save(snapshot) {
          saved.push(snapshot);
        },
        async load() {
          return null;
        },
        async clear() {
          // no-op
        },
      },
    };
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] }, childHost }),
    );

    await dispatcher.dispatchToolUse(
      { id: "d6", name: "researcher", args: { task: "persist me" } },
      makeLoopCtx(),
    );

    expect(saved.length).toBeGreaterThan(0);
    const snapshot = JSON.parse(saved[0]?.payload ?? "{}") as {
      ancestry?: readonly string[];
      version?: string;
    };
    expect(snapshot.version).toBe("agent-snapshot/v1");
    expect(snapshot.ancestry).toEqual(["lead", "researcher"]);
  });
});

// ---------------------------------------------------------------------------
// Task 2 — classified failure routing (D-09/D-10)
// ---------------------------------------------------------------------------

describe("classifyChildFailure — D-09/D-10 terminal mapping", () => {
  it("marks iteration/wall-time exhaustion recoverable", () => {
    expect(classifyChildFailure("c", makeFailure("agent-max-iterations")).terminal).toBe(false);
    expect(classifyChildFailure("c", makeFailure("agent-wall-time-exceeded")).terminal).toBe(false);
  });

  it("marks STUCK_REASONS stalls recoverable (SAFETY-band stuck detection)", () => {
    const stalled = classifyChildFailure(
      "c",
      makeFailure("agent-iteration-denied", "consecutive-identical-tool-call"),
    );
    expect(stalled.terminal).toBe(false);
    expect(
      classifyChildFailure("c", makeFailure("agent-iteration-denied", "ping-pong")).terminal,
    ).toBe(false);
  });

  it("marks tripwire violations and non-stuck SAFETY denials terminal (D-10)", () => {
    expect(classifyChildFailure("c", makeFailure("tripwire-violated")).terminal).toBe(true);
    expect(
      classifyChildFailure("c", makeFailure("agent-iteration-denied", "PII detected in output"))
        .terminal,
    ).toBe(true);
    expect(classifyChildFailure("c", makeFailure("crew-budget-exceeded")).terminal).toBe(true);
  });

  it("preserves the failure kind and reason strings verbatim", () => {
    const mapped = classifyChildFailure("c", makeFailure("agent-max-iterations", "ran out"));
    expect(mapped.kind).toBe("agent-max-iterations");
    expect(mapped.reason).toBe("ran out");
  });
});

describe("createCrewDispatcher — recoverable vs terminal routing (D-09/D-10)", () => {
  it("returns recoverable errors the parent MAY retry — a re-dispatch runs the child again", async () => {
    const noop = makeTool("noop");
    const researcher = makeResearcherSpec({
      tools: [noop],
      contract: { kind: "capability-contract", budget: { maxIterations: 1 } },
    });
    const root = makeRootSpec([researcher]);
    const loopEnvelope = '{"tool_calls":[{"id":"x","name":"noop","args":{}}]}';
    const scripted = makeScriptedFake([loopEnvelope, loopEnvelope]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const first = await dispatcher.dispatchToolUse(
      { id: "r1", name: "researcher", args: { task: "try" } },
      makeLoopCtx(),
    );
    expect(parseError(first?.content).error).toEqual({
      kind: "agent-max-iterations",
      reason: expect.stringContaining("Iteration budget") as never,
      terminal: false,
    });
    expect(scripted.calls()).toBe(1);

    // Recoverable → the second dispatch RUNS the child loop again.
    await dispatcher.dispatchToolUse(
      { id: "r2", name: "researcher", args: { task: "try again" } },
      makeLoopCtx(),
    );
    expect(scripted.calls()).toBe(2);
  });

  it("short-circuits a SECOND dispatch of a terminally-failed child without running it (D-10)", async () => {
    const noop = makeTool("noop");
    const researcher = makeResearcherSpec({
      tools: [noop],
      // Tiny cost budget: the first iteration's usage trips the cost check
      // (kind "no-contract-match" — isTerminal-true in results/errors.ts).
      contract: { kind: "capability-contract", budget: { maxCostUsd: 0.001 } },
    });
    const root = makeRootSpec([researcher]);
    const loopEnvelope = '{"tool_calls":[{"id":"x","name":"noop","args":{}}]}';
    const scripted = makeScriptedFake(
      [loopEnvelope, loopEnvelope],
      { promptTokens: 10, completionTokens: 5, costUsd: 0.01 },
    );
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({ config: { providers: [scripted.fake] } }),
    );

    const first = await dispatcher.dispatchToolUse(
      { id: "t1", name: "researcher", args: { task: "expensive" } },
      makeLoopCtx(),
    );
    const firstError = parseError(first?.content);
    expect(firstError.error.kind).toBe("no-contract-match");
    expect(firstError.error.terminal).toBe(true);
    const callsAfterFirst = scripted.calls();
    expect(callsAfterFirst).toBe(1);

    // Terminal → second dispatch returns the SAME cached error and the
    // child loop function is NOT invoked again (spy/counter assertion).
    const second = await dispatcher.dispatchToolUse(
      { id: "t2", name: "researcher", args: { task: "expensive again" } },
      makeLoopCtx(),
    );
    expect(second?.content).toBe(first?.content);
    expect(scripted.calls()).toBe(callsAfterFirst);
  });

  it("emits terminal crew-budget-exceeded and signals the orchestrator when the crew pool is exhausted (D-10)", async () => {
    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake(["never used"]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        remainingBudget: () => ({ maxIterations: 0 }),
      }),
    );

    expect(dispatcher.crewBudgetExhausted()).toBe(false);
    const dispatched = await dispatcher.dispatchToolUse(
      { id: "b1", name: "researcher", args: { task: "anything" } },
      makeLoopCtx(),
    );

    const parsed = parseError(dispatched?.content);
    expect(parsed.error.kind).toBe("crew-budget-exceeded");
    expect(parsed.error.terminal).toBe(true);
    expect(scripted.calls()).toBe(0);
    expect(dispatcher.crewBudgetExhausted()).toBe(true);
  });

  it("exposes the exact D-09 structured error JSON shape", async () => {
    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake([]);
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        ancestry: ["researcher"],
      }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "s1", name: "researcher", args: { task: "x" } },
      makeLoopCtx(),
    );

    const parsed = JSON.parse(dispatched?.content ?? "{}") as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["error"]);
    const error = parsed["error"] as Record<string, unknown>;
    expect(Object.keys(error)).toEqual(["kind", "reason", "terminal"]);
    expect(typeof error["kind"]).toBe("string");
    expect(typeof error["reason"]).toBe("string");
    expect(typeof error["terminal"]).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// Task 2 — receipt chaining (D-02, DELEG-06, research Pattern 2)
// ---------------------------------------------------------------------------

async function makeSigner(
  kid = "kid:crew-dispatcher-test",
): Promise<{ signer: ReceiptSigner; publicKeyJwk: JsonWebKey; kid: string }> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk, kid };
}

describe("createCrewDispatcher — receipt chaining via parentReceiptCid (DELEG-06)", () => {
  it("mints a child completion receipt chained to the crew-root CID that round-trips verifyReceipt", async () => {
    const { signer, publicKeyJwk, kid } = await makeSigner();
    const keySet = createMemoryKeySet([{ kid, state: "active", publicKeyJwk }]);

    // Crew-root receipt minted BEFORE children run (Pitfall 2 — the chain
    // anchor must exist first).
    const rootEnvelope = await createReceipt(
      {
        runId: "crew-run-receipts",
        model: { requested: "lattice-crew/run", observed: null },
        route: { providerId: "lattice-crew", capabilityId: "lattice-crew/run", attemptNumber: 1 },
        usage: ZERO_USAGE,
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
      },
      signer,
    );
    const crewRootCid = await receiptCid(rootEnvelope);

    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake(["receipted summary"]);
    const minted: ReceiptEnvelope[] = [];
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        signer,
        crewRootCid,
        mintedReceipts: (envelope) => {
          minted.push(envelope);
        },
      }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "rc1", name: "researcher", args: { task: "mint me" } },
      makeLoopCtx(),
    );

    // Exactly one child completion envelope collected at the chokepoint.
    expect(minted.length).toBe(1);
    const childEnvelope = minted[0];
    expect(childEnvelope).toBeDefined();
    if (childEnvelope === undefined) return;

    // Signed body carries parentReceiptCid === crew-root CID.
    const body = JSON.parse(atob(childEnvelope.payload)) as CapabilityReceiptBody;
    expect(body.parentReceiptCid).toBe(crewRootCid);
    // Synthetic route identifiers (checkpoint.ts DEFAULT_ROUTE precedent).
    expect(body.route.providerId).toBe("lattice-crew");
    expect(body.route.capabilityId).toBe("lattice-crew/agent-completion");

    // The envelope verifies with the ephemeral test KeySet.
    const verified = await verifyReceipt(childEnvelope, keySet);
    expect(verified.ok).toBe(true);

    // The child's summary receipts array contains the completion CID.
    const summary = JSON.parse(dispatched?.content ?? "{}") as { receipts: string[] };
    expect(summary.receipts).toEqual([await receiptCid(childEnvelope)]);
  });

  it("does not mint when no signer is configured; summary receipts is [] and the run still succeeds", async () => {
    const researcher = makeResearcherSpec();
    const root = makeRootSpec([researcher]);
    const scripted = makeScriptedFake(["unsigned summary"]);
    const minted: ReceiptEnvelope[] = [];
    const dispatcher = createCrewDispatcher(
      root,
      makeCtx({
        config: { providers: [scripted.fake] },
        mintedReceipts: (envelope) => {
          minted.push(envelope);
        },
      }),
    );

    const dispatched = await dispatcher.dispatchToolUse(
      { id: "rc2", name: "researcher", args: { task: "no signer" } },
      makeLoopCtx(),
    );

    expect(minted.length).toBe(0);
    const summary = JSON.parse(dispatched?.content ?? "{}") as {
      summary: string;
      receipts: string[];
    };
    expect(summary.summary).toBe("unsigned summary");
    expect(summary.receipts).toEqual([]);
  });
});
