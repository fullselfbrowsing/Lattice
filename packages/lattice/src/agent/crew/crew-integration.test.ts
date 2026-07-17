import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  BAND,
  createAI,
  createFakeProvider,
  createHookPipeline,
  createInMemorySigner,
  createMemoryKeySet,
  createNoopAgentHost,
  defineAgent,
  defineTool,
  generateEd25519KeyPairJwk,
  receiptCid,
  verifyReceipt,
  type CapabilityReceiptBody,
  type ProviderRunRequest,
  type ProviderRunResponse,
  type ReceiptEnvelope,
  type ReceiptSigner,
  type Usage,
} from "../../index.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "crew-integration",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

function makeStrictTaskSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "crew-integration",
      validate: (value: unknown) => {
        if (
          typeof value === "object" &&
          value !== null &&
          typeof (value as Record<string, unknown>)["task"] === "string"
        ) {
          return { value: value as never };
        }
        return { issues: [{ message: "task must be a string" }] };
      },
    } as never,
    toJSONSchema: () => ({
      type: "object",
      properties: { task: { type: "string" } },
      required: ["task"],
      additionalProperties: false,
    }),
  } as unknown as StandardSchemaV1;
}

function makeScriptedProvider(
  answers: readonly (string | ProviderRunResponse)[],
  usages: readonly Usage[] = [],
) {
  const answerQueue = [...answers];
  const usageQueue = [...usages];
  const tasks: string[] = [];
  const provider = createFakeProvider({
    id: "crew-integration-fake",
    response: (request): ProviderRunResponse => {
      tasks.push(request.task);
      const next = answerQueue.shift() ?? "";
      if (typeof next !== "string") return next;
      return {
        rawOutputs: { answer: next },
        normalizedUsage: usageQueue.shift() ?? {
          promptTokens: 1,
          completionTokens: 1,
          costUsd: null,
        },
      };
    },
  });
  return { provider, tasks };
}

function decodeReceipt(envelope: ReceiptEnvelope): CapabilityReceiptBody {
  return JSON.parse(atob(envelope.payload)) as CapabilityReceiptBody;
}

async function makeSigner() {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const baseSigner = createInMemorySigner(privateKeyJwk, {
    kid: "crew-integration",
    publicKeyJwk,
  });
  const calls = { value: 0 };
  const signer: ReceiptSigner = {
    ...baseSigner,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      calls.value += 1;
      return baseSigner.sign(bytes);
    },
  };
  const keySet = createMemoryKeySet([
    { kid: signer.kid, publicKeyJwk, state: "active" },
  ]);
  return { signer, keySet, calls };
}

function completionFaultSigner(failOn: number, secret: string): {
  readonly signer: ReceiptSigner;
  readonly calls: { value: number };
} {
  const calls = { value: 0 };
  return {
    calls,
    signer: {
      kid: "crew-completion-fault",
      publicKeyJwk: {
        kty: "OKP",
        crv: "Ed25519",
        x: "test",
      } as JsonWebKey,
      async sign(): Promise<Uint8Array> {
        calls.value += 1;
        if (calls.value === failOn) throw new Error(secret);
        return new Uint8Array([1, 2, 3]);
      },
    },
  };
}

describe("runAgentCrew public integration", () => {
  it("runs parent + two children end-to-end and verifies the signed receipt chain", async () => {
    const alpha = defineAgent({
      id: "alpha",
      intent: "Research alpha.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const beta = defineAgent({
      id: "beta",
      intent: "Research beta.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Dispatch alpha then beta and synthesize.",
      tools: [],
      childAgents: [alpha, beta],
      summaryReturnSchema: makeSchema(),
    });
    const { provider } = makeScriptedProvider([
      '{"tool_calls":[{"id":"a","name":"alpha","args":{"task":"A"}}]}',
      "alpha summary",
      '{"tool_calls":[{"id":"b","name":"beta","args":{"task":"B"}}]}',
      "beta summary",
      "final synthesis",
    ]);
    const { signer, keySet, calls } = await makeSigner();

    const result = await createAI({ providers: [provider] }).runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
      signer,
    });

    expect(result.result.kind).toBe("success");
    if (result.result.kind === "success") {
      expect(result.result.output).toEqual({ answer: "final synthesis" });
    }
    expect(result.perAgent.map((entry) => entry.id).sort()).toEqual([
      "alpha",
      "beta",
      "lead",
    ]);
    expect(result.totalIterations).toBe(5);
    expect(result.crewRootCid).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.receipts).toHaveLength(4);
    for (const envelope of result.receipts) {
      expect(await verifyReceipt(envelope, keySet)).toMatchObject({ ok: true });
    }
    const bodies = result.receipts.map(decodeReceipt);
    expect(bodies.map((body) => body.stepName)).toEqual([
      "crew-start:lead",
      "crew-agent-completion:alpha",
      "crew-agent-completion:beta",
      "crew-agent-completion:lead",
    ]);
    for (const body of bodies.slice(1)) {
      expect(body.parentReceiptCid).toBe(result.crewRootCid);
    }
    expect(result.result.receipt).toBe(result.receipts[3]);
    expect(
      result.perAgent.find((entry) => entry.id === "alpha")?.receiptCids,
    ).toEqual([await receiptCid(result.receipts[1]!)]);
    expect(
      result.perAgent.find((entry) => entry.id === "beta")?.receiptCids,
    ).toEqual([await receiptCid(result.receipts[2]!)]);
    expect(
      result.perAgent.find((entry) => entry.id === "lead")?.receiptCids,
    ).toEqual([await receiptCid(result.receipts[3]!)]);
    expect(calls.value).toBe(9);
  });

  it("accepts adapter-validated child tool calls without falling into unknown_tool", async () => {
    const researcher = defineAgent({
      id: "researcher",
      intent: "Research with a validated tool-call envelope.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Use the validated child call.",
      tools: [],
      childAgents: [researcher],
      summaryReturnSchema: makeSchema(),
    });
    const { provider, tasks } = makeScriptedProvider([
      {
        rawOutputs: { answer: "ignored because validated toolCalls wins" },
        toolCalls: [{ id: "validated", name: "researcher", args: { task: "validated" } }],
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: null },
      },
      "validated child summary",
      "validated final",
    ]);

    const result = await createAI({ providers: [provider] }).runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
    });

    expect(result.result.kind).toBe("success");
    expect(tasks.join("\n")).not.toContain("Unknown tool");
    expect(tasks.join("\n")).toContain("validated child summary");
  });

  it("surfaces terminal child failures to the parent without rerunning the child", async () => {
    const loop = defineTool({
      name: "loop",
      inputSchema: makeSchema(),
      execute: () => "loop",
    });
    const researcher = defineAgent({
      id: "researcher",
      intent: "Fail terminally after one costly loop.",
      tools: [loop],
      contract: {
        kind: "capability-contract",
        budget: { maxCostUsd: 0.001 },
      },
      summaryReturnSchema: makeSchema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Handle a terminal child failure.",
      tools: [],
      childAgents: [researcher],
      summaryReturnSchema: makeSchema(),
    });
    const { provider, tasks } = makeScriptedProvider(
      [
        '{"tool_calls":[{"id":"r1","name":"researcher","args":{"task":"expensive"}}]}',
        '{"tool_calls":[{"id":"l1","name":"loop","args":{}}]}',
        "handled terminal error",
      ],
      [
        { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0.01 },
        { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      ],
    );

    const result = await createAI({ providers: [provider] }).runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
    });

    expect(result.result.kind).toBe("success");
    expect(tasks.filter((task) => task.includes("USER:\nexpensive"))).toHaveLength(1);
    expect(tasks.join("\n")).toContain('"terminal":true');
    expect(tasks.join("\n")).toContain('"kind":"no-contract-match"');
  });

  it("turns required child completion signing failure into one cached terminal child result", async () => {
    const researcher = defineAgent({
      id: "researcher",
      intent: "Complete once before audit signing.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Dispatch the same child twice and handle its terminal result.",
      tools: [],
      childAgents: [researcher],
      summaryReturnSchema: makeSchema(),
    });
    const { provider, tasks } = makeScriptedProvider([
      '{"tool_calls":[{"id":"r1","name":"researcher","args":{"task":"once"}},{"id":"r2","name":"researcher","args":{"task":"once"}}]}',
      "child completed",
      "parent handled audit failure",
    ]);
    const secret = "SECRET-CHILD-COMPLETION-KMS";
    const { signer, calls } = completionFaultSigner(3, secret);

    const result = await createAI({ providers: [provider] }).runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
      signer,
      receiptMode: "required",
    });

    expect(result.result.kind).toBe("success");
    expect(tasks.filter((task) => task.includes("USER:\nonce"))).toHaveLength(1);
    expect(tasks).toHaveLength(3);
    expect(tasks.at(-1)).toContain('"kind":"audit"');
    expect(tasks.at(-1)).toContain('"terminal":true');
    expect(tasks.join("\n")).not.toContain(secret);
    expect(result.receipts).toHaveLength(2);
    expect(calls.value).toBe(6);
  });

  it("executes two child calls from one parent envelope strictly serially", async () => {
    const alpha = defineAgent({
      id: "alpha",
      intent: "Research alpha.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const beta = defineAgent({
      id: "beta",
      intent: "Research beta.",
      tools: [],
      summaryReturnSchema: makeSchema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Dispatch both children in one response.",
      tools: [],
      childAgents: [alpha, beta],
      summaryReturnSchema: makeSchema(),
    });
    const { provider, tasks } = makeScriptedProvider([
      '{"tool_calls":[{"id":"a","name":"alpha","args":{"task":"A"}},{"id":"b","name":"beta","args":{"task":"B"}}]}',
      "alpha summary",
      "beta summary",
      "final answer",
    ]);

    const result = await createAI({ providers: [provider] }).runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
    });

    expect(result.result.kind).toBe("success");
    const alphaIndex = tasks.findIndex((task) => task.includes("USER:\nA"));
    const betaIndex = tasks.findIndex((task) => task.includes("USER:\nB"));
    expect(alphaIndex).toBeGreaterThan(-1);
    expect(betaIndex).toBeGreaterThan(alphaIndex);
  });

  it("preserves SAFETY-band child denials inside crew child loops", async () => {
    const dangerous = defineTool({
      name: "dangerous",
      inputSchema: makeStrictTaskSchema(),
      execute: () => "should not execute",
    });
    const researcher = defineAgent({
      id: "researcher",
      intent: "Try a denied child action.",
      tools: [dangerous],
      summaryReturnSchema: makeSchema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Dispatch the child task and handle its response.",
      tools: [],
      childAgents: [researcher],
      summaryReturnSchema: makeSchema(),
    });
    const pipeline = createHookPipeline();
    pipeline.register(
      "BEFORE_AGENT_ITERATION",
      (ctx, controls) => {
        const task = (ctx as { readonly intent?: { readonly task?: string } }).intent?.task;
        if (task?.includes("deny-child") === true) {
          controls?.deny("child safety deny");
        }
      },
      { band: BAND.SAFETY },
    );
    const { provider, tasks } = makeScriptedProvider([
      '{"tool_calls":[{"id":"r1","name":"researcher","args":{"task":"deny-child"}}]}',
      "parent handled child safety deny",
    ]);

    const result = await createAI({ providers: [provider] }).runAgentCrew({
      root,
      hosts: { childHost: createNoopAgentHost() },
      pipeline,
    });

    expect(result.result.kind).toBe("success");
    expect(tasks.join("\n")).toContain('"kind":"agent-iteration-denied"');
    expect(tasks.join("\n")).toContain("child safety deny");
  });
});
