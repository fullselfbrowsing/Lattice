import { afterEach, describe, expect, it, vi } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createFakeProvider } from "../../providers/fake.js";
import type { ProviderRunResponse, Usage } from "../../providers/provider.js";
import { createMemoryKeySet } from "../../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../../receipts/sign.js";
import type { CapabilityReceiptBody } from "../../receipts/types.js";
import { verifyReceipt } from "../../receipts/verify.js";
import { createAI } from "../../runtime/create-ai.js";
import { createNoopAgentHost } from "../host.js";

import { defineAgent, type AgentSpec } from "./agent-spec.js";
import { runAgentCrew } from "./run-crew.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

function makeChild(id: string): AgentSpec {
  return defineAgent({
    id,
    intent: `Run delegated task as ${id}.`,
    tools: [],
    summaryReturnSchema: makeSchema(),
  });
}

function makeRoot(children: readonly AgentSpec[]): AgentSpec {
  return defineAgent({
    id: "lead",
    intent: "Coordinate child researchers and produce a final answer.",
    tools: [],
    childAgents: [...children],
    summaryReturnSchema: makeSchema(),
  });
}

function makeScriptedProvider(
  answers: readonly string[],
  usages: readonly Usage[],
) {
  const answerQueue = [...answers];
  const usageQueue = [...usages];
  const tasks: string[] = [];
  const provider = createFakeProvider({
    id: "crew-fake",
    response: (request): ProviderRunResponse => {
      tasks.push(request.task);
      return {
        rawOutputs: { answer: answerQueue.shift() ?? "" },
        normalizedUsage: usageQueue.shift() ?? {
          promptTokens: 0,
          completionTokens: 0,
          costUsd: null,
        },
      };
    },
  });
  return { provider, tasks };
}

function decodeReceiptBody(payload: string): CapabilityReceiptBody {
  return JSON.parse(atob(payload)) as CapabilityReceiptBody;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("runAgentCrew — orchestration and accounting", () => {
  it("completes a minimal parent + child crew and returns aggregate usage", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"find facts"}}]}',
        "child facts",
        "final synthesis",
      ],
      [
        { promptTokens: 10, completionTokens: 2, costUsd: 0.01 },
        { promptTokens: 7, completionTokens: 3, costUsd: 0.02 },
        { promptTokens: 11, completionTokens: 5, costUsd: 0.03 },
      ],
    );

    const result = await runAgentCrew(
      { root, hosts: { childHost: createNoopAgentHost() } },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.output).toEqual({ answer: "final synthesis" });
    }
    expect(result.perAgent.map((entry) => entry.id).sort()).toEqual([
      "lead",
      "researcher",
    ]);
    expect(result.perAgent.find((entry) => entry.id === "lead")?.iterations).toBe(2);
    expect(result.perAgent.find((entry) => entry.id === "researcher")?.iterations).toBe(1);
    expect(result.usage).toEqual({
      promptTokens: 28,
      completionTokens: 10,
      costUsd: 0.06,
    });
    const manualPrompt = result.perAgent.reduce(
      (sum, entry) => sum + entry.usage.promptTokens,
      0,
    );
    const manualCompletion = result.perAgent.reduce(
      (sum, entry) => sum + entry.usage.completionTokens,
      0,
    );
    const manualCost = result.perAgent.reduce(
      (sum, entry) => sum + (entry.usage.costUsd ?? 0),
      0,
    );
    expect(result.usage.promptTokens).toBe(manualPrompt);
    expect(result.usage.completionTokens).toBe(manualCompletion);
    expect(result.usage.costUsd).toBeCloseTo(manualCost);
  });

  it("runs policy validation at entry before provider calls", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider, tasks } = makeScriptedProvider(["unused"], []);

    await expect(
      runAgentCrew(
        {
          root,
          hosts: { childHost: createNoopAgentHost() },
          policy: { maxConcurrentChildren: 2 },
        },
        { providers: [provider] },
      ),
    ).rejects.toThrow(/maxConcurrentChildren > 1/u);
    expect(tasks).toHaveLength(0);
  });

  it("treats the crew policy budget as a shared sequential child pool", async () => {
    const alpha = makeChild("alpha");
    const beta = makeChild("beta");
    const root = makeRoot([alpha, beta]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"a","name":"alpha","args":{"task":"A"}}]}',
        "alpha summary",
        '{"tool_calls":[{"id":"b","name":"beta","args":{"task":"B"}}]}',
        "parent handled budget failure",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
      ],
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: { budget: { maxIterations: 1 } },
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("crew-budget-exceeded");
    expect(result.perAgent.map((entry) => entry.id)).toContain("alpha");
    expect(result.perAgent.map((entry) => entry.id)).not.toContain("beta");
  });

  it("does not trip the cost dimension when provider cost is unmeasured", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"free"}}]}',
        "free child",
        "free parent",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
      ],
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: { budget: { maxCostUsd: 0.001, maxIterations: 10 } },
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    expect(result.usage.costUsd).toBeNull();
  });
});

describe("runAgentCrew — rate-limit wiring and facade", () => {
  it("shares one managed RateLimitGroup across parent and child calls for the same adapter instance", async () => {
    vi.useFakeTimers();
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"limited"}}]}',
        "limited child",
        "limited parent",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
      ],
    );

    let resolved = false;
    const pending = runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: {
          limits: {
            "crew-fake": { requestsPerMinute: 1, tokensPerMinute: 100_000 },
          },
        },
      },
      { providers: [provider] },
    ).then((result) => {
      resolved = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    const result = await pending;
    expect(resolved).toBe(true);
    expect(result.result.kind).toBe("success");
  });

  it("skips rate-limit wrapping when coordination is unmanaged", async () => {
    vi.useFakeTimers();
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"direct"}}]}',
        "direct child",
        "direct parent",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
      ],
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: {
          coordination: "unmanaged",
          limits: {
            "crew-fake": { requestsPerMinute: 1, tokensPerMinute: 1 },
          },
        },
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
  });

  it("resolves through createAI().runAgentCrew", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"facade"}}]}',
        "facade child",
        "facade parent",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
        { promptTokens: 1, completionTokens: 1, costUsd: null },
      ],
    );

    const ai = createAI({ providers: [provider] });
    const result = await ai.runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.output).toEqual({ answer: "facade parent" });
    }
  });
});

describe("runAgentCrew — signed receipt chain", () => {
  it("mints the crew-root receipt before child completion receipts and chains all completion receipts to it", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"chain"}}]}',
        "child chain",
        "parent chain",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: 0.01 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.01 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.01 },
      ],
    );
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "crew-test",
      publicKeyJwk,
    });

    const result = await runAgentCrew(
      { root, hosts: { childHost: createNoopAgentHost() }, signer },
      { providers: [provider] },
    );

    expect(result.crewRootCid).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.receipts.length).toBeGreaterThanOrEqual(3);

    const bodies = result.receipts.map((envelope) => decodeReceiptBody(envelope.payload));
    expect(bodies[0]?.route).toEqual({
      providerId: "lattice-crew",
      capabilityId: "lattice-crew/run",
      attemptNumber: 1,
    });
    expect(bodies[0]?.parentReceiptCid).toBeUndefined();
    for (const body of bodies.slice(1)) {
      expect(body.parentReceiptCid).toBe(result.crewRootCid);
    }

    const keySet = createMemoryKeySet([{ kid: signer.kid, publicKeyJwk, state: "active" }]);
    for (const envelope of result.receipts) {
      expect(await verifyReceipt(envelope, keySet)).toMatchObject({ ok: true });
    }
  });
});
