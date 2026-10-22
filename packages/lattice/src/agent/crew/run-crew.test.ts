import { afterEach, describe, expect, it, vi } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { createFakeProvider } from "../../providers/fake.js";
import type { ProviderRunResponse, Usage } from "../../providers/provider.js";
import { hashOutputForReceipt } from "../../receipts/hashes.js";
import { createMemoryKeySet } from "../../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../../receipts/sign.js";
import type { CapabilityReceiptBody, ReceiptSigner } from "../../receipts/types.js";
import { verifyChain } from "../../receipts/chain.js";
import { verifyReceipt } from "../../receipts/verify.js";
import { ReceiptSigningError } from "../../results/errors.js";
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

    // Review follow-up: every receipt in the tree shares the crew runId, so
    // the whole CrewResult.receipts set verifies as one chain.
    expect(result.runId).toBe(bodies[0]?.runId);
    for (const body of bodies) {
      expect(body.runId).toBe(result.runId);
    }
    const chain = await verifyChain(result.receipts, keySet, {
      expectedRunId: result.runId,
      ...(result.crewRootCid !== undefined ? { expectedRootCid: result.crewRootCid } : {}),
      expectedCount: result.receipts.length,
    });
    expect(chain).toMatchObject({ ok: true, rootCid: result.crewRootCid, count: result.receipts.length });

    // The crew-start receipt commits to the crew's agent id tree rather
    // than a null output hash. Agent completion receipts still commit to
    // each agent's output.
    expect(bodies[0]?.outputHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(bodies[0]?.outputHash).toBe(
      await hashOutputForReceipt({
        kind: "crew-start",
        agents: { id: "lead", children: [{ id: "researcher", children: [] }] },
      }),
    );
    expect(bodies[0]?.chainClosure).toBe("member-cids");
    expect(bodies[0]?.inputHashes).toEqual([]);
    const closeBody = bodies.find((body) => body.stepName === "crew-close:lead");
    expect(closeBody?.chainMemberCids?.length).toBe(result.receipts.length - 1);
    expect(closeBody?.contractVerdict).toBe("success");
    expect(result.receipts).toHaveLength(4);
    expect(result.receiptError).toBeUndefined();
    expect(await verifyChain(result.receipts, keySet, { requireClosure: true })).toMatchObject({
      ok: true,
    });
    const leadBody = bodies.find((body) => body.stepName === "crew-agent-completion:lead");
    expect(leadBody).toBeDefined();
    if (result.result.kind === "success") {
      expect(leadBody?.outputHash).toBe(await hashOutputForReceipt(result.result.output));
    }
    const researcherBody = bodies.find(
      (body) => body.stepName === "crew-agent-completion:researcher",
    );
    expect(researcherBody?.outputHash).toMatch(/^[a-f0-9]{64}$/u);
  });
});

/** stepName of the receipt whose PAE bytes are being signed. */
function signedStepName(pae: Uint8Array): string | undefined {
  const text = new TextDecoder().decode(pae);
  const payload = text.slice(text.lastIndexOf(" ") + 1);
  return decodeReceiptBody(payload).stepName;
}

async function makeSignerPair(kid = "crew-close-test"): Promise<{
  readonly signer: ReceiptSigner;
  readonly keySet: ReturnType<typeof createMemoryKeySet>;
}> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  return {
    signer: createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk }),
    keySet: createMemoryKeySet([{ kid, publicKeyJwk, state: "active" }]),
  };
}

/** Wrap `inner` so signing a receipt whose stepName matches `failOn` throws. */
function failingSigner(inner: ReceiptSigner, failOn: (step: string) => boolean): ReceiptSigner {
  return {
    kid: inner.kid,
    publicKeyJwk: inner.publicKeyJwk,
    async sign(bytes) {
      const step = signedStepName(bytes) ?? "";
      if (failOn(step)) throw new Error(`remote signer 503 on ${step}`);
      return inner.sign(bytes);
    },
  };
}

function oneChildCrew(usage: Usage = { promptTokens: 1, completionTokens: 1, costUsd: null }) {
  const root = makeRoot([makeChild("alpha")]);
  const { provider } = makeScriptedProvider(
    ['{"tool_calls":[{"id":"a","name":"alpha","args":{"task":"A"}}]}', "alpha summary", "final"],
    [usage, usage, usage],
  );
  return { root, provider };
}

describe("runAgentCrew — crew-close verdict and timing", () => {
  it("signs the crew-close receipt execution-failed when the crew budget is exceeded", async () => {
    const { signer, keySet } = await makeSignerPair();
    const { root, provider } = oneChildCrew({ promptTokens: 1, completionTokens: 1, costUsd: 1 });

    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer,
        policy: { budget: { maxCostUsd: 1.5 } },
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("crew-budget-exceeded");
    const close = result.receipts
      .map((envelope) => decodeReceiptBody(envelope.payload))
      .find((body) => body.stepName === "crew-close:lead");
    expect(close?.contractVerdict).toBe("execution-failed");
    expect(await verifyChain(result.receipts, keySet)).toMatchObject({ ok: true });
  });

  it("does not count receipt signing against the crew wall-time budget", async () => {
    const { signer: inner } = await makeSignerPair();
    let offsetMs = 0;
    const realNow = Date.now.bind(Date);
    const clock = vi.spyOn(Date, "now").mockImplementation(() => realNow() + offsetMs);
    // A slow remote signer: each post-work mint takes "10 s" on the mocked clock.
    const slow: ReceiptSigner = {
      kid: inner.kid,
      publicKeyJwk: inner.publicKeyJwk,
      async sign(bytes) {
        const step = signedStepName(bytes) ?? "";
        if (step === "crew-agent-completion:lead" || step.startsWith("crew-close:")) {
          offsetMs += 10_000;
        }
        return inner.sign(bytes);
      },
    };
    try {
      const { root, provider } = oneChildCrew();
      const result = await runAgentCrew(
        {
          root,
          hosts: { childHost: createNoopAgentHost() },
          signer: slow,
          policy: { budget: { maxWallTimeMs: 5_000 } },
        },
        { providers: [provider] },
      );
      expect(offsetMs).toBe(20_000);
      expect(result.result.kind).toBe("success");
      const close = result.receipts
        .map((envelope) => decodeReceiptBody(envelope.payload))
        .find((body) => body.stepName === "crew-close:lead");
      expect(close?.contractVerdict).toBe("success");
    } finally {
      clock.mockRestore();
    }
  });

  it("commits the crew-start hash to every descendant id, not only direct children", async () => {
    const { signer } = await makeSignerPair();
    async function startHash(leafId: string): Promise<string | null | undefined> {
      const leaf = makeChild(leafId);
      const mid = defineAgent({
        id: "mid",
        intent: "Delegate to the leaf.",
        tools: [],
        childAgents: [leaf],
        summaryReturnSchema: makeSchema(),
      });
      const { provider } = makeScriptedProvider(
        [
          '{"tool_calls":[{"id":"a","name":"mid","args":{"task":"M"}}]}',
          `{"tool_calls":[{"id":"b","name":"${leafId}","args":{"task":"L"}}]}`,
          "leaf summary",
          "mid summary",
          "final",
        ],
        [],
      );
      const result = await runAgentCrew(
        { root: makeRoot([mid]), hosts: { childHost: createNoopAgentHost() }, signer, policy: { maxDepth: 3 } },
        { providers: [provider] },
      );
      return decodeReceiptBody(result.receipts[0]!.payload).outputHash;
    }

    const withLeaf = await startHash("leaf");
    expect(withLeaf).toBe(
      await hashOutputForReceipt({
        kind: "crew-start",
        agents: {
          id: "lead",
          children: [{ id: "mid", children: [{ id: "leaf", children: [] }] }],
        },
      }),
    );
    expect(await startHash("other-leaf")).not.toBe(withLeaf);
  });
});

describe("runAgentCrew — receipt signer failures after the crew's work", () => {
  const isParent = (step: string): boolean => step === "crew-agent-completion:lead";
  const isClose = (step: string): boolean => step.startsWith("crew-close:");

  it("flags a failed root completion mint, still closes the chain, and keeps the result", async () => {
    const { signer, keySet } = await makeSignerPair();
    const { root, provider } = oneChildCrew();
    const events: Array<{ readonly name: string; readonly attributes?: Record<string, unknown> }> = [];
    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer: failingSigner(signer, isParent),
        tracer: {
          kind: "tracer",
          event(name, attributes) {
            events.push({ name, ...(attributes !== undefined ? { attributes } : {}) });
          },
        },
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    expect(result.receiptError?.kind).toBe("signer-failed");
    expect(result.receiptError?.message).toContain("crew-agent-completion:lead");
    expect(Object.isFrozen(result.receiptError)).toBe(true);
    const steps = result.receipts.map((envelope) => decodeReceiptBody(envelope.payload).stepName);
    expect(steps).toEqual(["crew-start:lead", "crew-agent-completion:alpha", "crew-close:lead"]);
    expect(await verifyChain(result.receipts, keySet)).toMatchObject({ ok: true, count: 3 });
    expect(events).toContainEqual(
      expect.objectContaining({
        name: "step.transition",
        attributes: expect.objectContaining({ stepName: "crew-agent-completion:lead" }),
      }),
    );
  });

  it("flags a failed crew-close mint and says the chain cannot verify without it", async () => {
    const { signer, keySet } = await makeSignerPair();
    const { root, provider } = oneChildCrew();
    const result = await runAgentCrew(
      { root, hosts: { childHost: createNoopAgentHost() }, signer: failingSigner(signer, isClose) },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    expect(result.receiptError?.message).toContain("crew-close:lead");
    expect(result.receiptError?.message).toContain("chainClosure");
    expect(result.receipts).toHaveLength(3);
    expect(await verifyChain(result.receipts, keySet)).toMatchObject({
      ok: false,
      error: { kind: "count-mismatch" },
    });
  });

  it("reports both failures in one receiptError when every post-work mint fails", async () => {
    const { signer } = await makeSignerPair();
    const { root, provider } = oneChildCrew();
    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer: failingSigner(signer, (step) => isParent(step) || isClose(step)),
      },
      { providers: [provider] },
    );
    expect(result.result.kind).toBe("success");
    expect(result.receiptError?.message).toContain("crew-agent-completion:lead");
    expect(result.receiptError?.message).toContain("crew-close:lead");
  });

  it.each([
    ["root completion", isParent],
    ["crew-close", isClose],
  ])("throws ReceiptSigningError for a failed %s mint under onSignerError: throw", async (_label, failOn) => {
    const { signer } = await makeSignerPair();
    const { root, provider } = oneChildCrew();
    const run = runAgentCrew(
      { root, hosts: { childHost: createNoopAgentHost() }, signer: failingSigner(signer, failOn) },
      { providers: [provider], receipts: { onSignerError: "throw" } },
    );
    await expect(run).rejects.toBeInstanceOf(ReceiptSigningError);
    await expect(run).rejects.toThrow(/remote signer 503/u);
  });
});
