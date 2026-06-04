import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createFakeProvider } from "../providers/fake.js";
import {
  createNoopSurvivabilityAdapter,
  type SerializedSnapshot,
} from "../runtime/survivability.js";
import { defineTool } from "../tools/tools.js";

import {
  createNoopAgentHost,
  type AgentHost,
  type AgentSnapshot,
} from "./host.js";
import { runAgent } from "./runtime.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "host-integration",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

function makeTool(name: string, execute: (input: unknown) => unknown | Promise<unknown> = () => "ok") {
  return defineTool({ name, inputSchema: makeSchema(), execute });
}

/**
 * Builds an in-memory storage seam useful for tests. Captures every save()
 * call in an ordered array (`saves`) and surfaces the most recent snapshot
 * through `load()`. Tests use this to assert per-iteration persistence.
 */
function makeInMemoryStorageHost(initial?: SerializedSnapshot | null) {
  const saves: SerializedSnapshot[] = [];
  let current: SerializedSnapshot | null = initial ?? null;
  const clears: number[] = [];
  const host: AgentHost = {
    ...createNoopAgentHost(),
    storage: {
      async save(snapshot) {
        saves.push(snapshot);
        current = snapshot;
      },
      async load() {
        return current;
      },
      async clear() {
        clears.push(Date.now());
        current = null;
      },
    },
  };
  return { host, saves, clears };
}

describe("runAgent — AgentHost transport seam (Phase 20)", () => {
  it("dispatches provider.execute through host.transport.call when configured", async () => {
    let transportCalls = 0;
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "ok" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const noop = createNoopAgentHost();
    const host: AgentHost = {
      ...noop,
      transport: {
        async call(provider, request) {
          transportCalls += 1;
          if (provider.execute === undefined) throw new Error("no execute");
          return provider.execute(request);
        },
      },
    };
    const result = await runAgent(
      { task: "Hi.", tools: [], host },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    expect(transportCalls).toBe(1);
  });
});

describe("runAgent — AgentHost scheduler seam (Phase 20)", () => {
  it("invokes scheduler.scheduleNext between iterations (one per non-final iter)", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"noop","args":{}}]}`,
      "Done.",
    ];
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const scheduledAt: number[] = [];
    const host: AgentHost = {
      ...createNoopAgentHost(),
      scheduler: {
        async scheduleNext(iterationIndex) {
          scheduledAt.push(iterationIndex);
        },
      },
    };
    const result = await runAgent(
      { task: "Loop.", tools: [makeTool("noop")], host },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    // Iteration 0 (tool_use) calls scheduleNext(0); iteration 1 (final)
    // does NOT schedule again (loop exits before the scheduler stub).
    expect(scheduledAt).toEqual([0]);
  });
});

describe("runAgent — AgentHost storage seam (Phase 20)", () => {
  it("saves a snapshot after each non-final iteration; clears on success", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"noop","args":{}}]}`,
      "Done.",
    ];
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const { host, saves, clears } = makeInMemoryStorageHost();
    const result = await runAgent(
      { task: "Loop.", tools: [makeTool("noop")], host },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    // Iteration 0 (tool_use) saves a snapshot. Iteration 1 (final) does NOT
    // save (the loop exits before the snapshot block in the tool-dispatch
    // branch).
    expect(saves.length).toBe(1);
    expect(saves[0]?.kind).toBe("survivability-snapshot");
    expect(saves[0]?.version).toBe("lattice-survivability/v1");
    // Clear was called on final-answer success.
    expect(clears.length).toBe(1);
  });

  it("resumes from a pre-existing snapshot, restoring iterationIndex and conversation", async () => {
    // Build a snapshot pretending we already completed iteration 0 + 1 and
    // would be entering iteration 2 next.
    const adapter = createNoopSurvivabilityAdapter<AgentSnapshot>();
    const snapshot = adapter.serialize({
      version: "agent-snapshot/v1",
      iterationIndex: 2,
      conversation: [
        { role: "user", content: "Resumed task." },
        { role: "assistant", content: "Partial work." },
        { role: "tool", content: "ok", toolCallId: "c0", toolName: "noop" },
      ],
      cumulativeUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 },
      providerName: "sticky-fake",
      capturedAt: "2026-05-31T00:00:00.000Z",
    });
    const { host } = makeInMemoryStorageHost(snapshot);

    // Track emitted recovery events.
    const recoveryEvents: Array<{ kind: string; payload?: Record<string, unknown> | undefined }> = [];
    const tracer = {
      kind: "tracer" as const,
      event: (kind: string, payload?: Record<string, unknown>) => {
        if (kind.startsWith("recovery.")) recoveryEvents.push({ kind, payload });
      },
    };

    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "Resumed final." },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });

    const result = await runAgent(
      { task: "Resumed task.", tools: [makeTool("noop")], host, tracer },
      { providers: [fake] },
    );

    expect(result.kind).toBe("success");
    // recovery.start + recovery.complete fired.
    expect(recoveryEvents.map((e) => e.kind)).toEqual([
      "recovery.start",
      "recovery.complete",
    ]);
    expect((recoveryEvents[1]?.payload as { iterationIndex?: number })?.iterationIndex).toBe(2);
    if (result.kind === "success") {
      // Loop ran exactly 1 NEW iteration (iteration index 2 -> final answer).
      expect(result.iterations.length).toBe(1);
      // Cumulative usage includes the restored 10/5/0.001 PLUS the
      // single new iteration's 1/1/0 = 11/6/0.001.
      expect(result.usage.promptTokens).toBe(11);
      expect(result.usage.completionTokens).toBe(6);
      expect(result.usage.costUsd).toBeCloseTo(0.001);
    }
  });

  it("emits recovery.failed and starts fresh when a snapshot is corrupt", async () => {
    // Build a snapshot whose payload is invalid JSON — deserialize() throws.
    const corrupt: SerializedSnapshot = {
      kind: "survivability-snapshot",
      version: "lattice-survivability/v1",
      payload: "{this-is-not-json",
      capturedAt: "2026-05-31T00:00:00.000Z",
    };
    const { host, clears } = makeInMemoryStorageHost(corrupt);
    const recoveryEvents: Array<{ kind: string; payload?: Record<string, unknown> | undefined }> = [];
    const tracer = {
      kind: "tracer" as const,
      event: (kind: string, payload?: Record<string, unknown>) => {
        if (kind.startsWith("recovery.")) recoveryEvents.push({ kind, payload });
      },
    };
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "Fresh final." },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      { task: "Anything.", tools: [], host, tracer },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    // recovery.start fired, then recovery.failed (NOT complete).
    const kinds = recoveryEvents.map((e) => e.kind);
    expect(kinds).toContain("recovery.start");
    expect(kinds).toContain("recovery.failed");
    expect(kinds).not.toContain("recovery.complete");
    // Corrupt snapshot was cleared so the next run starts fresh.
    expect(clears.length).toBeGreaterThanOrEqual(1);
    if (result.kind === "success") {
      // Loop ran exactly 1 iteration (the fresh-start single shot).
      expect(result.iterations.length).toBe(1);
    }
  });

  it("does not emit recovery.* events when no snapshot exists", async () => {
    const { host } = makeInMemoryStorageHost(null);
    const recoveryEvents: string[] = [];
    const tracer = {
      kind: "tracer" as const,
      event: (kind: string) => {
        if (kind.startsWith("recovery.")) recoveryEvents.push(kind);
      },
    };
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "ok" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      { task: "x", tools: [], host, tracer },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    expect(recoveryEvents).toEqual([]);
  });
});
