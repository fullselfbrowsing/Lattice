import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createFakeProvider } from "../providers/fake.js";
import type { ReceiptSigner } from "../receipts/types.js";
import {
  createNoopSurvivabilityAdapter,
  type SerializedSnapshot,
} from "../runtime/survivability.js";
import { fc } from "../test-support/fast-check.js";
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

function serializeAgentSnapshot(value: unknown): SerializedSnapshot {
  return createNoopSurvivabilityAdapter<unknown>().serialize(value);
}

function makeSnapshotRecord(executionId: string, index: number) {
  return {
    iterationId: `${executionId}:iteration:${index}`,
    index,
    provider: "sticky-fake",
    promptTokens: 1,
    completionTokens: 1,
    costUsd: 0,
    durationMs: 1,
    toolCalls: [],
  };
}

async function expectInvalidRecovery(
  snapshot: SerializedSnapshot,
  expectedReason: "deserialize-failed" | "snapshot-invalid",
  secret: string,
): Promise<void> {
  let signerCalls = 0;
  let transportCalls = 0;
  let providerCalls = 0;
  const signer: ReceiptSigner = {
    kid: "snapshot-validation-key",
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "test" } as JsonWebKey,
    async sign() {
      signerCalls += 1;
      return new Uint8Array([1]);
    },
  };
  const provider = createFakeProvider({
    id: "sticky-fake",
    response: () => {
      providerCalls += 1;
      return { rawOutputs: { answer: "must not run" } };
    },
  });
  const memory = makeInMemoryStorageHost(snapshot);
  const host: AgentHost = {
    ...memory.host,
    transport: {
      async call(adapter, request) {
        transportCalls += 1;
        return adapter.execute!(request);
      },
    },
  };
  const recoveryEvents: Array<{
    kind: string;
    payload?: Record<string, unknown>;
  }> = [];
  const result = await runAgent(
    {
      task: "Do not restart invalid state.",
      tools: [],
      host,
      signer,
      receiptMode: "required",
      autoRegisterCheckpoint: false,
      tracer: {
        kind: "tracer",
        event(kind, payload) {
          if (kind.startsWith("recovery.")) {
            recoveryEvents.push({
              kind,
              ...(payload !== undefined ? { payload } : {}),
            });
          }
        },
      },
    },
    { providers: [provider] },
  );

  expect(result).toMatchObject({
    kind: "agent-recovery-failed",
    reason: expectedReason,
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    iterations: [],
  });
  expect(recoveryEvents).toEqual([
    {
      kind: "recovery.start",
      payload: { snapshotVersion: "lattice-survivability/v1" },
    },
    { kind: "recovery.failed", payload: { reason: expectedReason } },
  ]);
  expect({ signerCalls, transportCalls, providerCalls }).toEqual({
    signerCalls: 0,
    transportCalls: 0,
    providerCalls: 0,
  });
  expect(memory.clears).toHaveLength(0);
  expect(JSON.stringify({ result, recoveryEvents })).not.toContain(secret);
}

describe("runAgent — AgentHost transport seam (Phase 20)", () => {
  it("dispatches provider.execute through host.transport.call when configured", async () => {
    let transportCalls = 0;
    const fake = createFakeProvider({
      id: "sticky-fake",
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
    const savedState = createNoopSurvivabilityAdapter<AgentSnapshot>().deserialize(
      saves[0]!,
    );
    expect(savedState.version).toBe("agent-snapshot/v1");
    expect(savedState.executionId).toMatch(/^agent-execution:/);
    expect(savedState.iterations).toHaveLength(1);
    expect(savedState.iterations?.[0]?.iterationId).toBe(
      `${savedState.executionId}:iteration:0`,
    );
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
      expect(result.iterations[0]?.index).toBe(2);
      expect(result.iterations[0]?.iterationId).toMatch(
        /^agent-execution:legacy:[a-f0-9]{64}:iteration:2$/,
      );
      // Cumulative usage includes the restored 10/5/0.001 PLUS the
      // single new iteration's 1/1/0 = 11/6/0.001.
      expect(result.usage.promptTokens).toBe(11);
      expect(result.usage.completionTokens).toBe(6);
      expect(result.usage.costUsd).toBeCloseTo(0.001);
    }

    const second = await runAgent(
      {
        task: "Resumed task.",
        tools: [makeTool("noop")],
        host: makeInMemoryStorageHost(snapshot).host,
      },
      { providers: [fake] },
    );
    expect(second.iterations[0]?.iterationId).toBe(
      result.iterations[0]?.iterationId,
    );
  });

  it("returns bounded recovery failure without clearing or restarting corrupt state", async () => {
    const secret = "SECRET-CORRUPT-SNAPSHOT-CONTENT";
    const corrupt: SerializedSnapshot = {
      kind: "survivability-snapshot",
      version: "lattice-survivability/v1",
      payload: `{${secret}`,
      capturedAt: "2026-05-31T00:00:00.000Z",
    };
    await expectInvalidRecovery(corrupt, "deserialize-failed", secret);
  });

  it("rejects malformed explicit identity and receipt ledgers before transport", async () => {
    const secret = "SECRET-INVALID-SNAPSHOT-CONTENT";
    const executionId = "agent-execution:validation-fixture";
    const receipt = {
      payloadType: "application/vnd.lattice.receipt+json",
      payload: "payload",
      signatures: [{ keyid: "kid", sig: "signature" }],
    };
    const base = {
      version: "agent-snapshot/v1",
      executionId,
      iterations: [makeSnapshotRecord(executionId, 0)],
      iterationIndex: 1,
      conversation: [{ role: "user", content: secret }],
      cumulativeUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      providerName: "sticky-fake",
      capturedAt: "2026-07-17T00:00:00.000Z",
    };
    const cases: ReadonlyArray<{ readonly name: string; readonly value: unknown }> = [
      { name: "wrong version", value: { ...base, version: "agent-snapshot/v2" } },
      { name: "empty identity", value: { ...base, executionId: "" } },
      {
        name: "oversized identity",
        value: { ...base, executionId: `agent-execution:${"x".repeat(200)}` },
      },
      {
        name: "missing ledger",
        value: { ...base, iterations: undefined },
      },
      {
        name: "duplicate index and id",
        value: {
          ...base,
          iterationIndex: 2,
          iterations: [
            makeSnapshotRecord(executionId, 0),
            makeSnapshotRecord(executionId, 0),
          ],
        },
      },
      {
        name: "out of order indexes",
        value: {
          ...base,
          iterationIndex: 3,
          iterations: [
            makeSnapshotRecord(executionId, 1),
            makeSnapshotRecord(executionId, 0),
          ],
        },
      },
      {
        name: "future index",
        value: {
          ...base,
          iterations: [makeSnapshotRecord(executionId, 1)],
        },
      },
      {
        name: "mismatched iteration id",
        value: {
          ...base,
          iterations: [
            {
              ...makeSnapshotRecord(executionId, 0),
              iterationId: "agent-execution:other:iteration:0",
            },
          ],
        },
      },
      {
        name: "malformed receipt",
        value: {
          ...base,
          iterations: [
            {
              ...makeSnapshotRecord(executionId, 0),
              receipt: { ...receipt, signatures: [] },
            },
          ],
        },
      },
      {
        name: "invalid cumulative usage",
        value: {
          ...base,
          cumulativeUsage: { promptTokens: -1, completionTokens: 1, costUsd: 0 },
        },
      },
      {
        name: "invalid record usage",
        value: {
          ...base,
          iterations: [
            { ...makeSnapshotRecord(executionId, 0), costUsd: -1 },
          ],
        },
      },
    ];

    for (const testCase of cases) {
      await expectInvalidRecovery(
        serializeAgentSnapshot(testCase.value),
        "snapshot-invalid",
        secret,
      );
    }
  });

  it("property: duplicate generated ledger positions always fail closed", async () => {
    const secret = "SECRET-GENERATED-LEDGER";
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 25 }), async (index) => {
        const executionId = "agent-execution:generated-ledger";
        const snapshot = serializeAgentSnapshot({
          version: "agent-snapshot/v1",
          executionId,
          iterations: [
            makeSnapshotRecord(executionId, index),
            makeSnapshotRecord(executionId, index),
          ],
          iterationIndex: index + 1,
          conversation: [{ role: "user", content: secret }],
          cumulativeUsage: { promptTokens: 0, completionTokens: 0, costUsd: null },
          providerName: "sticky-fake",
          capturedAt: "2026-07-17T00:00:00.000Z",
        });
        await expectInvalidRecovery(snapshot, "snapshot-invalid", secret);
      }),
      { numRuns: 20 },
    );
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
