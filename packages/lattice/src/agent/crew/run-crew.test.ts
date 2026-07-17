import { afterEach, describe, expect, it, vi } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createFakeProvider } from "../../providers/fake.js";
import type {
  ModelCapability,
  ProviderAdapter,
  ProviderPricingHint,
  ProviderRunRequest,
  ProviderRunResponse,
  Usage,
} from "../../providers/provider.js";
import { defaultCapabilityForProvider } from "../../routing/catalog.js";
import { createMemoryKeySet } from "../../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../../receipts/sign.js";
import type {
  CapabilityReceiptBody,
  ReceiptSigner,
} from "../../receipts/types.js";
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
  pricing?: ProviderPricingHint | null,
) {
  const answerQueue = [...answers];
  const usageQueue = [...usages];
  const tasks: string[] = [];
  const provider = createFakeProvider({
    id: "crew-fake",
    ...(pricing !== undefined
      ? { capabilities: [crewCapability(pricing)] }
      : {}),
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

function crewCapability(
  pricing: ProviderPricingHint | null,
): ModelCapability {
  const base = {
    ...defaultCapabilityForProvider("crew-fake"),
    modelId: "crew-fake:cost-test",
  };
  if (pricing !== null) {
    return { ...base, pricing };
  }
  const { pricing: inheritedPricing, ...unpriced } = base;
  return inheritedPricing === undefined ? base : unpriced;
}

function decodeReceiptBody(payload: string): CapabilityReceiptBody {
  return JSON.parse(atob(payload)) as CapabilityReceiptBody;
}

function sequenceSigner(options: {
  readonly failOn?: readonly number[];
  readonly secret?: string;
} = {}): {
  readonly signer: ReceiptSigner;
  readonly calls: { value: number };
} {
  const calls = { value: 0 };
  const failOn = new Set(options.failOn ?? []);
  const signer: ReceiptSigner = {
    kid: "crew-policy-test-key",
    publicKeyJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "test",
    } as JsonWebKey,
    async sign(): Promise<Uint8Array> {
      calls.value += 1;
      if (failOn.has(calls.value)) {
        throw new Error(options.secret ?? "SECRET-CREW-SIGNER-FAILURE");
      }
      return new Uint8Array([1, 2, 3]);
    },
  };
  return { signer, calls };
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

  it("fails the crew when the final parent iteration pushes total iterations over maxTotalIterations", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"find facts"}}]}',
        "child facts",
        "final synthesis",
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
        policy: { maxTotalIterations: 2 },
      },
      { providers: [provider] },
    );

    expect(result.totalIterations).toBe(3);
    expect(result.result.kind).toBe("crew-budget-exceeded");
    if (result.result.kind === "crew-budget-exceeded") {
      expect(result.result.reason).toContain("Crew budget pool exhausted");
    }
  });

  it("treats the fake provider's explicit zero pricing as known free", async () => {
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
    expect(result.usage.costUsd).toBe(0);
  });

  it("fails closed before the root call when crew pricing is unknown", async () => {
    const root = makeRoot([]);
    const { provider, tasks } = makeScriptedProvider(
      ["must not execute"],
      [{ promptTokens: 1, completionTokens: 1, costUsd: null }],
      null,
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: { budget: { maxCostUsd: 1 } },
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("no-contract-match");
    expect(tasks).toHaveLength(0);
    expect(result.totalIterations).toBe(0);
  });

  it("shares cumulative cost across root and child preflight", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider, tasks } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"work"}}]}',
        "child summary",
        "must not run final parent call",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
      ],
      { inputPer1kTokens: 0, outputPer1kTokens: 0.09765625 },
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: { budget: { maxCostUsd: 0.14, maxIterations: 10 } },
      },
      { providers: [provider] },
    );

    expect(tasks).toHaveLength(2);
    expect(result.usage.costUsd).toBeCloseTo(0.1, 12);
    expect(result.result.kind).toBe("no-contract-match");
  });

  it("rejects a child before transport when parent spend leaves too little budget", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider, tasks } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"work"}}]}',
        "must not run child or parent again",
      ],
      [{ promptTokens: 1, completionTokens: 1, costUsd: 0.05 }],
      { inputPer1kTokens: 0, outputPer1kTokens: 0.09765625 },
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: { budget: { maxCostUsd: 0.08, maxIterations: 10 } },
      },
      { providers: [provider] },
    );

    expect(tasks).toHaveLength(1);
    expect(result.perAgent.find((entry) => entry.id === "researcher")?.iterations).toBe(0);
    expect(result.result.kind).toBe("no-contract-match");
  });

  it("threads active ancestor spend into nested child preflight", async () => {
    const grandchild = makeChild("digger");
    const child = defineAgent({
      id: "researcher",
      intent: "Delegate research.",
      tools: [],
      childAgents: [grandchild],
      summaryReturnSchema: makeSchema(),
    });
    const root = makeRoot([child]);
    const { provider, tasks } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"work"}}]}',
        '{"tool_calls":[{"id":"c2","name":"digger","args":{"task":"dig"}}]}',
        "must not run grandchild or resume an ancestor",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
      ],
      { inputPer1kTokens: 0, outputPer1kTokens: 0.09765625 },
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: {
          budget: { maxCostUsd: 0.14, maxIterations: 10 },
          maxDepth: 2,
        },
      },
      { providers: [provider] },
    );

    expect(tasks).toHaveLength(2);
    expect(result.usage.costUsd).toBeCloseTo(0.1, 12);
    expect(result.result.kind).toBe("no-contract-match");
  });

  it("allows exact aggregate equality across root and child calls", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider, tasks } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"work"}}]}',
        "child summary",
        "final synthesis",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.05 },
      ],
      { inputPer1kTokens: 0, outputPer1kTokens: 0.09765625 },
    );

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        policy: { budget: { maxCostUsd: 0.15, maxIterations: 10 } },
      },
      { providers: [provider] },
    );

    expect(tasks).toHaveLength(3);
    expect(result.result.kind).toBe("success");
    expect(result.usage.costUsd).toBeCloseTo(0.15, 12);
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

describe("runAgentCrew — receipt policy", () => {
  it("returns a frozen required-missing-signer result before host or provider work", async () => {
    const child = makeChild("researcher");
    const root = makeRoot([child]);
    const { provider, tasks } = makeScriptedProvider(["must not run"], []);
    const hostCalls = { load: 0, transport: 0 };
    const childHost = {
      ...createNoopAgentHost(),
      storage: {
        async load() {
          hostCalls.load += 1;
          return null;
        },
        async save() {
          hostCalls.load += 1;
        },
        async clear() {
          hostCalls.load += 1;
        },
      },
      transport: {
        async call(adapter: ProviderAdapter, request: ProviderRunRequest) {
          hostCalls.transport += 1;
          return adapter.execute!(request);
        },
      },
    };

    const result = await runAgentCrew(
      { root, hosts: { childHost } },
      { providers: [provider], receiptMode: "required" },
    );

    expect(result.result).toMatchObject({
      kind: "audit",
      code: "receipt-signer-missing",
      stage: "pre-execution",
      terminal: true,
    });
    expect(result).toMatchObject({
      perAgent: [],
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      totalIterations: 0,
      receipts: [],
    });
    expect(tasks).toHaveLength(0);
    expect(hostCalls).toEqual({ load: 0, transport: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.result)).toBe(true);
    expect(Object.isFrozen(result.receipts)).toBe(true);
    expect(Object.isFrozen(result.usage)).toBe(true);
  });

  it("returns a safe audit failure when required crew-root signing fails", async () => {
    const secret = "SECRET-CREW-ROOT-KMS";
    const root = makeRoot([]);
    const { provider, tasks } = makeScriptedProvider(["must not run"], []);
    const { signer, calls } = sequenceSigner({ failOn: [1], secret });

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer,
        receiptMode: "required",
      },
      { providers: [provider] },
    );

    expect(result.result).toMatchObject({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "pre-execution",
    });
    expect(calls.value).toBe(1);
    expect(tasks).toHaveLength(0);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("lets local mode and signer override runtime config", async () => {
    const root = makeRoot([]);
    const { provider } = makeScriptedProvider(["done", "done"], []);
    const configSigner = sequenceSigner({ failOn: [1] });
    const localSigner = sequenceSigner();

    const offResult = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        receiptMode: "off",
      },
      {
        providers: [provider],
        receiptMode: "required",
        signer: configSigner.signer,
      },
    );
    expect(offResult.result.kind).toBe("success");
    expect(offResult.receipts).toHaveLength(0);
    expect(configSigner.calls.value).toBe(0);

    const localResult = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer: localSigner.signer,
      },
      {
        providers: [provider],
        receiptMode: "required",
        signer: configSigner.signer,
      },
    );
    expect(localResult.result.kind).toBe("success");
    expect(localResult.receipts).toHaveLength(2);
    expect(localSigner.calls.value).toBe(4);
    expect(configSigner.calls.value).toBe(0);
  });

  it("replaces the parent result when required completion signing fails", async () => {
    const secret = "SECRET-PARENT-COMPLETION-KMS";
    const root = makeRoot([]);
    const { provider, tasks } = makeScriptedProvider(
      ["parent completed"],
      [{ promptTokens: 3, completionTokens: 2, costUsd: 0.01 }],
    );
    const { signer, calls } = sequenceSigner({ failOn: [4], secret });

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer,
        receiptMode: "required",
      },
      { providers: [provider] },
    );

    expect(result.result).toMatchObject({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "post-execution",
      usage: { promptTokens: 3, completionTokens: 2, costUsd: 0.01 },
    });
    expect(result.result.iterations).toHaveLength(1);
    expect(result.receipts).toHaveLength(1);
    expect(tasks).toHaveLength(1);
    expect(calls.value).toBe(4);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("keeps best-effort root and terminal signing failures non-terminal", async () => {
    const secret = "SECRET-BEST-EFFORT-CREW-KMS";
    const root = makeRoot([]);
    const { provider, tasks } = makeScriptedProvider(["done"], []);
    const { signer, calls } = sequenceSigner({
      failOn: [1, 2, 3],
      secret,
    });

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer,
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    expect(result.receipts).toHaveLength(0);
    expect(tasks).toHaveLength(1);
    expect(calls.value).toBe(3);
    expect(JSON.stringify(result)).not.toContain(secret);
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
