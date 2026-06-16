import { describe, expect, it } from "vitest";

import canonicalize from "canonicalize";

import { artifact } from "../artifacts/artifact.js";
import { contract } from "../contract/contract.js";
import { inv } from "../contract/invariants.js";
import {
  createFakeProvider,
  type FakeProviderOptions,
} from "../providers/fake.js";
import { createOpenAICompatibleProvider } from "../providers/adapters.js";
import { createOpenRouterProvider } from "../providers/openrouter.js";
import type {
  ModelCapability,
  ProviderAdapter,
  ProviderStream,
  ProviderStreamChunk,
} from "../providers/provider.js";
import { createMemoryKeySet } from "../receipts/keyset.js";
import { computeArtifactLineageMerkleRoot } from "../receipts/lineage.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import type { ReceiptSigner } from "../receipts/types.js";
import { verifyReceipt } from "../receipts/verify.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import { fc } from "../test-support/fast-check.js";
import { createAI } from "./create-ai.js";

function pricedFakeProvider(): ReturnType<typeof createFakeProvider> {
  return createFakeProvider({
    capabilities: [
      {
        ...defaultCapabilityForProvider("fake"),
        modelId: "fake:deterministic",
        pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.001 },
      },
    ],
  });
}

describe("Phase 7 contract + cost integration", () => {
  it("Test 1: RunIntent literal with contract field compiles and routes", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const intent = {
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0.5 } }),
    };
    const plan = await ai.plan(intent);
    expect(plan.kind).toBe("execution-plan");
  });

  it("Test 2: v1.0 backward compatibility — no contract field", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const plan = await ai.plan({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(plan.kind).toBe("execution-plan");
    expect(plan.route.selected).toBeDefined();
  });

  it("Test 3: contract flows to router — preflight reject reasons appear in plan", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const plan = await ai.plan({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    const allReasons = plan.route.candidates.flatMap((c) => c.reasons);
    expect(allReasons.some((r) => r.code === "contract-budget-exceeded")).toBe(true);
  });

  it("Test 4: no-contract-match classification — returns RunFailure with kind no-contract-match", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-budget-exceeded"),
        ).toBe(true);
      }
    }
  });

  it("Test 5: no-route remains no-route without contract", async () => {
    const restrictedCapability: ModelCapability = {
      ...defaultCapabilityForProvider("fake"),
      modelId: "fake:text-only",
      inputModalities: ["text"],
      outputModalities: ["text"],
      structuredOutput: false,
    };
    const provider = createFakeProvider({ capabilities: [restrictedCapability] });
    const ai = createAI({ providers: [provider] });
    // Trigger a no-route by requiring an output modality unsupported (json structured).
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        action: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (_v: unknown) => ({ value: _v }),
          },
        } as never,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no_route");
    }
  });

  it("Test 6: usage 0/0/0 on no-contract-match per CONTEXT.md", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });
});

describe("Phase 7 end-to-end integration", () => {
  it("E1: modality reject — contract requiredModalities:[video] on text-only fake yields no-contract-match with contract-modality-missing", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:text-only",
          inputModalities: ["text"],
          outputModalities: ["text"],
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ requiredModalities: ["video"] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-modality-missing"),
        ).toBe(true);
      }
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });

  it("E2: privacy reject — contract requiredPrivacy:restricted on standard-only fake yields no-contract-match with contract-privacy-mismatch", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:standard-only",
          dataPolicy: { privacy: ["standard"] },
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ requiredPrivacy: "restricted" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-privacy-mismatch"),
        ).toBe(true);
      }
    }
  });

  it("E3: budget reject — contract budget=0 on priced fake yields no-contract-match (integration-level safety net)", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:priced",
          pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.001 },
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
    }
  });

  it("E4: success populates usage from normalizedUsage", async () => {
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "hello" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, costUsd: 0.0001 });
    }
    const succeededAttemptEvent = result.events?.find(
      (event) =>
        event.kind === "provider.attempt" &&
        event.metadata?.status === "succeeded",
    );
    expect(succeededAttemptEvent?.metadata?.normalizedUsage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      costUsd: 0.0001,
    });
  });

  it("E5: v1.0 backward compatibility — no contract field, default fake yields RunSuccess with present usage (costUsd null)", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toBeDefined();
      expect(result.usage.costUsd).toBeNull();
      expect(typeof result.usage.promptTokens).toBe("number");
      expect(typeof result.usage.completionTokens).toBe("number");
    }
  });

  it("E6: no-route still works without contract — fake with no structured output and structured-output request returns no_route (not no-contract-match)", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:text-only-unstructured",
          inputModalities: ["text"],
          outputModalities: ["text"],
          structuredOutput: false,
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        action: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (_v: unknown) => ({ value: _v }),
          },
        } as never,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no_route");
      // Sanity: still carries usage even on the no-route branch (zero, per design)
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });
});

describe("Phase 8 tripwire integration", () => {
  it("T1: tripwire violation produces typed failure with terminal flag, invariantId, and evidence", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "ok" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        invariants: [inv.fieldFromTable("text", ["create", "delete"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("tripwire-violated");
      if (result.error.kind === "tripwire-violated") {
        expect(result.error.terminal).toBe(true);
        expect(typeof result.error.invariantId).toBe("string");
        expect(result.error.invariantId.length).toBeGreaterThan(0);
        expect(result.error.evidence.kind).toBe("field-from-table");
        expect(result.error.evidence.path).toBe("text");
      }
    }
  });

  it("T2: no retry on tripwire violation — second provider in fallback chain is not attempted", async () => {
    inv.__resetCounterForTests();
    // Provider A: violates the invariant.
    const providerA = createFakeProvider({
      id: "fake",
      modelId: "fake:a",
      response: {
        rawOutputs: { text: "violator" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    // Provider B: would pass but should NEVER be reached.
    const providerB = createFakeProvider({
      id: "fake-b",
      modelId: "fake-b:passing",
      response: {
        rawOutputs: { text: "create" },
        normalizedUsage: { promptTokens: 999, completionTokens: 999, costUsd: 9.99 },
      },
    });
    const ai = createAI({ providers: [providerA, providerB] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        invariants: [inv.fieldFromTable("text", ["create"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("tripwire-violated");
      // Plan should record exactly one attempt — provider B never reached.
      if (result.plan.kind === "execution-plan") {
        expect(result.plan.attempts).toHaveLength(1);
      }
      // No fallback.activated event emitted.
      const fallbackEvents = (result.events ?? []).filter(
        (event) => event.kind === "fallback.activated",
      );
      expect(fallbackEvents).toHaveLength(0);
    }
  });

  it("T3: usage populated on tripwire violation from normalizedUsage (cost-so-far)", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "ok" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        invariants: [inv.fieldFromTable("text", ["create"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, costUsd: 0.0001 });
    }
  });

  it("T4: no contract field — success and stage:tripwire status is 'skipped'", async () => {
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "hello" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      expect(tripwire?.status).toBe("skipped");
    }
  });

  it("T5: empty invariants array — stage:tripwire skipped, success returned", async () => {
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "hello" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [] }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      expect(tripwire?.status).toBe("skipped");
    }
  });

  it("T6: must-cite happy path — citations array satisfies invariant, stage:tripwire completed", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "ok", citations: ["artifact-1"] },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        citations: { kind: "citations" as const },
      },
      contract: contract({ invariants: [inv.mustCite("artifact-1")] }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      expect(tripwire?.status).toBe("completed");
    }
  });

  it("T7: no-PII violation — evidence carries redacted detector + substring (not full input)", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "Contact alice@example.com please" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [inv.noPII("text")] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "tripwire-violated") {
      expect(result.error.evidence.kind).toBe("no-pii");
      const observed = result.error.evidence.observed as {
        detector: string;
        substring: string;
      };
      expect(observed.detector).toBe("email");
      expect(observed.substring).toBe("alice@example.com");
      // Critical: full input string must NOT appear inside the evidence.
      expect(JSON.stringify(result.error.evidence)).not.toContain("Contact ");
      expect(JSON.stringify(result.error.evidence)).not.toContain("please");
    }
  });

  it("T8: validation failure precedes tripwire — error.kind is 'validation', stage:tripwire never runs", async () => {
    inv.__resetCounterForTests();
    // Provider returns a non-string for `text` so output schema validation
    // rejects it BEFORE tripwires evaluate.
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: 42 as unknown as string },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        // This invariant would ALSO fail if reached; assert it never runs.
        invariants: [inv.fieldFromTable("text", ["create"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      // Tripwire stage never advanced — stays at its initial 'pending'/'skipped'
      // status. It must NOT be 'completed' or 'failed'.
      expect(["pending", "skipped"]).toContain(tripwire?.status);
    }
  });
});

describe("Phase 43 streaming runtime", () => {
  function streamingProvider(input: {
    readonly execute?: ProviderAdapter["execute"];
    readonly executeStream?: ProviderAdapter["executeStream"];
  }): ProviderAdapter {
    const providerId = "streaming-runtime";
    const modelId = "streaming-runtime:model";
    return {
      id: providerId,
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider(providerId),
          modelId,
          outputModalities: ["text"],
          streaming: true,
        },
      ],
      ...(input.execute !== undefined ? { execute: input.execute } : {}),
      ...(input.executeStream !== undefined ? { executeStream: input.executeStream } : {}),
    };
  }

  async function* streamFrom(
    chunks: readonly ProviderStreamChunk[],
  ): ProviderStream {
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  function openAICompatibleSseData(payload: unknown): string {
    return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
  }

  function makeOpenAICompatibleStreamingFetch(chunks: readonly string[]): typeof fetch {
    const encoder = new TextEncoder();
    return (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      )) as unknown as typeof fetch;
  }

  it("uses executeStream only when policy.stream is true", async () => {
    let executeCalls = 0;
    let streamCalls = 0;
    const provider = streamingProvider({
      execute: async () => {
        executeCalls += 1;
        return { rawOutputs: { answer: "buffered" } };
      },
      executeStream: () => {
        streamCalls += 1;
        return streamFrom([
          { kind: "text-delta", output: "answer", text: "streamed" },
        ]);
      },
    });
    const ai = createAI({ providers: [provider] });

    const buffered = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
    });
    expect(buffered.ok).toBe(true);
    if (buffered.ok) {
      expect(buffered.outputs.answer).toBe("buffered");
    }
    expect(executeCalls).toBe(1);
    expect(streamCalls).toBe(0);

    const streamed = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });
    expect(streamed.ok).toBe(true);
    if (streamed.ok) {
      expect(streamed.outputs.answer).toBe("streamed");
    }
    expect(executeCalls).toBe(1);
    expect(streamCalls).toBe(1);
  });

  it("routes streaming runs only to streaming-capable candidates", async () => {
    let bufferedExecuteCalls = 0;
    let streamCalls = 0;
    const bufferedProvider = {
      id: "buffered-runtime",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("buffered-runtime"),
          modelId: "buffered-runtime:model",
          streaming: false,
        },
      ],
      execute: async () => {
        bufferedExecuteCalls += 1;
        return { rawOutputs: { answer: "buffered" } };
      },
    } satisfies ProviderAdapter;
    const streamProvider = {
      id: "streaming-runtime-fallback",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("streaming-runtime-fallback"),
          modelId: "streaming-runtime-fallback:model",
          streaming: true,
        },
      ],
      executeStream: () => {
        streamCalls += 1;
        return streamFrom([
          { kind: "text-delta", output: "answer", text: "streamed" },
        ]);
      },
    } satisfies ProviderAdapter;
    const ai = createAI({ providers: [bufferedProvider, streamProvider] });

    const plan = await ai.plan({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });
    expect(plan.route.selected?.providerId).toBe("streaming-runtime-fallback");
    const rejectedBuffered = plan.route.rejected.find(
      (candidate) => candidate.providerId === "buffered-runtime",
    );
    expect(rejectedBuffered?.reasons.some((r) => r.code === "streaming-unsupported")).toBe(true);

    const result = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs.answer).toBe("streamed");
    }
    expect(bufferedExecuteCalls).toBe(0);
    expect(streamCalls).toBe(1);
  });

  it("runs policy.stream through a real OpenAI-compatible adapter factory", async () => {
    const provider = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      fetch: makeOpenAICompatibleStreamingFetch([
        openAICompatibleSseData({ choices: [{ delta: { content: "real " } }] }),
        openAICompatibleSseData({
          choices: [{ delta: { content: "stream" } }],
          usage: { prompt_tokens: 2, completion_tokens: 3 },
        }),
        openAICompatibleSseData("[DONE]"),
      ]),
    });
    const ai = createAI({ providers: [provider] });

    const result = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs.answer).toBe("real stream");
      const eventKinds = (result.events ?? []).map((event) => event.kind);
      expect(eventKinds).toContain("stream.start");
      expect(eventKinds).toContain("stream.complete");
      if (result.plan.kind === "execution-plan") {
        expect(result.plan.attempts[0]?.status).toBe("succeeded");
      }
    }
  });

  it("emits stream start and complete without per-chunk events", async () => {
    const provider = streamingProvider({
      executeStream: () => streamFrom([
        { kind: "text-delta", output: "answer", text: "a" },
        { kind: "text-delta", output: "answer", text: "b" },
        { kind: "text-delta", output: "answer", text: "c" },
      ]),
    });
    const ai = createAI({ providers: [provider] });

    const result = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });

    expect(result.ok).toBe(true);
    const eventKinds = (result.events ?? []).map((event) => event.kind);
    expect(eventKinds.filter((kind) => kind === "stream.start")).toHaveLength(1);
    expect(eventKinds.filter((kind) => kind === "stream.complete")).toHaveLength(1);
    expect(eventKinds.some((kind) => kind.startsWith("stream.delta"))).toBe(false);
    const completeEvent = result.events?.find((event) => event.kind === "stream.complete");
    expect(completeEvent?.metadata?.outputNames).toEqual(["answer"]);
  });

  it("emits stream.failed and returns provider_execution when collection throws", async () => {
    async function* failingStream(): ProviderStream {
      yield { kind: "text-delta", output: "answer", text: "partial-secret" };
      throw new Error("stream boom");
    }
    const provider = streamingProvider({
      executeStream: () => failingStream(),
    });
    const ai = createAI({ providers: [provider] });

    const result = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("provider_execution");
    }
    expect((result.events ?? []).some((event) => event.kind === "stream.failed")).toBe(true);
    for (const event of result.events ?? []) {
      expect(JSON.stringify(event.metadata ?? {})).not.toContain("partial-secret");
    }
  });

  it("surfaces non-zero usage from streaming final chunk into result.usage and signed receipt", async () => {
    // Local copy of makeSignerAndKeySet (defined in Phase 9 scope, not accessible here)
    const kid = "phase-43-streaming-usage";
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
    const keySet = createMemoryKeySet([
      { kid, publicKeyJwk, state: "active" },
    ]);

    // Use the OpenAI-compatible adapter with a final SSE chunk carrying usage,
    // mirroring the existing test at line 595 but with usage assertions added.
    const provider = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      fetch: makeOpenAICompatibleStreamingFetch([
        openAICompatibleSseData({ choices: [{ delta: { content: "answer" } }] }),
        openAICompatibleSseData({
          choices: [{ delta: {} }],
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
        openAICompatibleSseData("[DONE]"),
      ]),
    });
    const ai = createAI({ providers: [provider], signer });

    const result = await ai.run({
      task: "x",
      outputs: { answer: "text" as const },
      policy: { stream: true },
    });

    expect(result.ok).toBe(true);
    expect(result.usage.promptTokens).toBeGreaterThan(0);
    expect(result.usage.completionTokens).toBeGreaterThan(0);

    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.usage.promptTokens).toBeGreaterThan(0);
      expect(verifyResult.body.usage.completionTokens).toBeGreaterThan(0);
    }
  });
});

describe("Phase 9 receipts integration", () => {
  async function makeSignerAndKeySet(
    kid = "phase-9-test",
  ): Promise<{
    signer: ReceiptSigner;
    keySet: ReturnType<typeof createMemoryKeySet>;
    publicKeyJwk: JsonWebKey;
  }> {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
    const keySet = createMemoryKeySet([
      { kid, publicKeyJwk, state: "active" },
    ]);
    return { signer, keySet, publicKeyJwk };
  }

  function localTemplateProvider(
    response?: FakeProviderOptions["response"],
  ): ReturnType<typeof createFakeProvider> {
    return createFakeProvider({
      id: "lm-studio",
      modelId: "local-template",
      ...(response !== undefined ? { response } : {}),
    });
  }

  it("T1: receipt is undefined when signer is not configured", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    expect(result.receipt).toBeUndefined();
  });

  it("T2: success receipt includes modelClass for a registry-known route", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const ai = createAI({ providers: [localTemplateProvider()], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    expect(result.receipt).toBeDefined();
    expect(result.receipt?.payloadType).toBe(
      "application/vnd.lattice.receipt+json",
    );
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.version).toBe("lattice-receipt/v1.3");
      expect(verifyResult.body.contractVerdict).toBe("success");
      expect(verifyResult.body.modelClass).toBe("local_quantized");
    }
  });

  it("T3: no-contract-match emits a receipt with verdict 'no-contract-match' and noRouteReasons", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:priced",
          pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.001 },
        },
      ],
    });
    const ai = createAI({ providers: [provider], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0.0000001 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.contractVerdict).toBe("no-contract-match");
      expect(verifyResult.body.noRouteReasons).toBeDefined();
      expect((verifyResult.body.noRouteReasons ?? []).length).toBeGreaterThan(0);
    }
  });

  it("T4: tripwire-violated emits a receipt with verdict 'tripwire-violated' and tripwireEvidence", async () => {
    inv.__resetCounterForTests();
    const { signer, keySet } = await makeSignerAndKeySet();
    const provider = localTemplateProvider({
      rawOutputs: { text: "Contact alice@example.com please" },
      normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    });
    const ai = createAI({ providers: [provider], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [inv.noPII("text")] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("tripwire-violated");
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (
      verifyResult.ok &&
      !result.ok &&
      result.error.kind === "tripwire-violated"
    ) {
      expect(verifyResult.body.contractVerdict).toBe("tripwire-violated");
      expect(verifyResult.body.modelClass).toBe("local_quantized");
      expect(verifyResult.body.tripwireEvidence).toBeDefined();
      expect(verifyResult.body.tripwireEvidence?.kind).toBe(
        result.error.evidence.kind,
      );
    }
  });

  it("T4b: tripwire-violated receipt lineageMerkleRoot includes packaged artifacts", async () => {
    inv.__resetCounterForTests();
    const { signer, keySet } = await makeSignerAndKeySet();
    const provider = localTemplateProvider({
      rawOutputs: { text: "Contact alice@example.com please" },
      normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    });
    const ai = createAI({ providers: [provider], signer });
    const source = artifact.text("source", {
      id: "artifact:text:trip-lineage-source",
    });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      artifacts: [source],
      contract: contract({ invariants: [inv.noPII("text")] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("tripwire-violated");
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      const inputOnlyRoot = await computeArtifactLineageMerkleRoot([source]);
      expect(verifyResult.body.lineageMerkleRoot).toMatch(/^sha256:[a-f0-9]{64}$/u);
      // This inequality is the regression guard: it fails if lineageArtifacts is
      // missing from the tripwire-violated maybeIssueReceipt call in create-ai.ts.
      expect(verifyResult.body.lineageMerkleRoot).not.toBe(inputOnlyRoot);
    }
  });

  it("T5: validation-failed emits a receipt with verdict 'validation-failed'", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const provider = localTemplateProvider({
      rawOutputs: { text: 42 as unknown as string },
      normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
    });
    const ai = createAI({ providers: [provider], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.contractVerdict).toBe("validation-failed");
      expect(verifyResult.body.modelClass).toBe("local_quantized");
    }
  });

  it("T6: execution-failed (no executable adapter) emits a receipt", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    // ProviderRef without execute → adapter lookup fails.
    const ai = createAI({ providers: ["fake"], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Either execution_unavailable or no_route depending on routing; both
      // are execution-failed verdict surfaces in receipts.
      expect(["execution_unavailable", "no_route"]).toContain(
        result.error.kind,
      );
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.contractVerdict).toBe("execution-failed");
      expect(verifyResult.body.modelClass).toBeUndefined();
    }
  });

  it("T7: synthetic no-route receipt omits modelClass", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const restrictedCapability: ModelCapability = {
      ...defaultCapabilityForProvider("fake"),
      modelId: "fake:text-only-unstructured",
      inputModalities: ["text"],
      outputModalities: ["text"],
      structuredOutput: false,
    };
    const provider = createFakeProvider({ capabilities: [restrictedCapability] });
    const ai = createAI({ providers: [provider], signer });
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        action: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (_v: unknown) => ({ value: _v }),
          },
        } as never,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no_route");
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.modelClass).toBeUndefined();
    }
  });

  it("T8: execution-failed (provider_execution) includes modelClass for a registry-known route", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const provider = localTemplateProvider(() => {
      throw new Error("simulated provider boom");
    });
    const ai = createAI({ providers: [provider], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("provider_execution");
    }
    expect(result.receipt).toBeDefined();
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.contractVerdict).toBe("execution-failed");
      expect(verifyResult.body.modelClass).toBe("local_quantized");
    }
  });

  it("T9: receipt body carries model.requested matching the route and omits unknown fake modelClass", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const ai = createAI({ providers: [createFakeProvider()], signer });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok && result.ok) {
      expect(verifyResult.body.model.observed).toBeNull();
      expect(verifyResult.body.modelClass).toBeUndefined();
      const selected = result.plan.kind === "execution-plan"
        ? result.plan.route.selected?.modelId ?? ""
        : "";
      expect(verifyResult.body.model.requested).toBe(selected);
    }
  });

  it("T10: receipt body carries inputHashes for each artifact", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const ai = createAI({ providers: [createFakeProvider()], signer });
    const a1 = artifact.text("first artifact");
    const a2 = artifact.text("second artifact");
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      artifacts: [a1, a2],
    });
    expect(result.ok).toBe(true);
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.inputHashes).toHaveLength(2);
      for (const hash of verifyResult.body.inputHashes) {
        expect(hash).toMatch(/^[a-f0-9]{64}$/u);
      }
    }
  });

  it("T10b: receipt body carries lineageMerkleRoot when artifacts have lineage", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const ai = createAI({ providers: [createFakeProvider()], signer });
    const source = artifact.text("source artifact", {
      id: "artifact:text:receipt-source",
    });
    const derived = artifact.derive({
      id: "artifact:text:receipt-derived",
      kind: "text",
      value: "derived artifact",
      parents: [source],
      transform: { kind: "extraction", name: "quote" },
    });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      artifacts: [source, derived],
    });
    expect(result.ok).toBe(true);
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.inputHashes).toHaveLength(2);
      // The runtime folds provider-packaged artifacts (provider-packaging lineage)
      // into the lineage root, so it must be a valid root AND must differ from the
      // root computed over the raw input/output artifacts alone. The inequality
      // guards the create-ai.ts wiring that includes attemptPackaging.packagedArtifacts
      // (Codex PR #12 P2-3): reverting that fix makes the root equal inputOnlyRoot.
      const inputOnlyRoot = await computeArtifactLineageMerkleRoot([source, derived]);
      expect(verifyResult.body.lineageMerkleRoot).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(verifyResult.body.lineageMerkleRoot).not.toBe(inputOnlyRoot);
    }
  });

  it("T11: receipt body carries outputHash on success but null on tripwire-violated", async () => {
    inv.__resetCounterForTests();
    const { signer, keySet } = await makeSignerAndKeySet();
    const aiSuccess = createAI({
      providers: [createFakeProvider()],
      signer,
    });
    const successResult = await aiSuccess.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(successResult.ok).toBe(true);
    const successVerify = await verifyReceipt(successResult.receipt!, keySet);
    expect(successVerify.ok).toBe(true);
    if (successVerify.ok) {
      expect(successVerify.body.outputHash).toMatch(/^[a-f0-9]{64}$/u);
    }

    const tripProvider = createFakeProvider({
      response: {
        rawOutputs: { text: "Contact bob@example.com please" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      },
    });
    const aiTrip = createAI({ providers: [tripProvider], signer });
    const tripResult = await aiTrip.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [inv.noPII("text")] }),
    });
    expect(tripResult.ok).toBe(false);
    const tripVerify = await verifyReceipt(tripResult.receipt!, keySet);
    expect(tripVerify.ok).toBe(true);
    if (tripVerify.ok) {
      expect(tripVerify.body.outputHash).toBeNull();
    }
  });

  it("streaming receipts hash assembled output independent of chunk boundaries", async () => {
    const { signer, keySet } = await makeSignerAndKeySet("phase-43-streaming");

    function providerForParts(parts: readonly string[]): ProviderAdapter {
      const providerId = "stream-receipt";
      const modelId = "stream-receipt:model";
      return {
        id: providerId,
        kind: "provider-adapter",
        capabilities: [
          {
            ...defaultCapabilityForProvider(providerId),
            modelId,
            outputModalities: ["text"],
            streaming: true,
          },
        ],
        executeStream: async function* (): ProviderStream {
          for (const part of parts) {
            yield { kind: "text-delta", output: "answer", text: part };
          }
        },
      };
    }

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 8 }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (parts) => {
          const finalText = parts.join("");
          const singleChunk = await createAI({
            providers: [providerForParts([finalText])],
            signer,
          }).run({
            task: "stream receipt hash",
            outputs: { answer: "text" as const },
            policy: { stream: true },
          });
          const splitChunks = await createAI({
            providers: [providerForParts(parts)],
            signer,
          }).run({
            task: "stream receipt hash",
            outputs: { answer: "text" as const },
            policy: { stream: true },
          });

          expect(singleChunk.ok).toBe(true);
          expect(splitChunks.ok).toBe(true);
          if (!singleChunk.ok || !splitChunks.ok) {
            throw new Error("Streaming receipt property run failed.");
          }

          expect(singleChunk.outputs.answer).toBe(finalText);
          expect(splitChunks.outputs.answer).toBe(finalText);
          expect(singleChunk.receipt).toBeDefined();
          expect(splitChunks.receipt).toBeDefined();

          const singleVerify = await verifyReceipt(singleChunk.receipt!, keySet);
          const splitVerify = await verifyReceipt(splitChunks.receipt!, keySet);
          expect(singleVerify.ok).toBe(true);
          expect(splitVerify.ok).toBe(true);
          if (!singleVerify.ok || !splitVerify.ok) {
            throw new Error("Streaming receipt verification failed.");
          }

          expect(singleVerify.body.contractVerdict).toBe("success");
          expect(splitVerify.body.contractVerdict).toBe("success");
          expect(singleVerify.body.outputHash).toMatch(/^[a-f0-9]{64}$/u);
          expect(splitVerify.body.outputHash).toMatch(/^[a-f0-9]{64}$/u);
          expect(singleVerify.body.outputHash).toBe(splitVerify.body.outputHash);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("streaming receipts include lineageMerkleRoot after stream collection", async () => {
    const { signer, keySet } = await makeSignerAndKeySet("phase-46-streaming");
    const source = artifact.text("stream source", {
      id: "artifact:text:stream-source",
    });
    const derived = artifact.derive({
      id: "artifact:text:stream-derived",
      kind: "text",
      value: "stream derived",
      parents: [source],
      transform: { kind: "model-output", name: "stream" },
    });
    const providerId = "stream-lineage";
    const modelId = "stream-lineage:model";
    const provider: ProviderAdapter = {
      id: providerId,
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider(providerId),
          modelId,
          outputModalities: ["text"],
          streaming: true,
        },
      ],
      executeStream: async function* (): ProviderStream {
        yield { kind: "text-delta", output: "answer", text: "ok" };
        yield {
          kind: "complete",
          artifactRefs: [derived],
        };
      },
    };

    const result = await createAI({ providers: [provider], signer }).run({
      task: "stream lineage",
      outputs: { answer: "text" as const },
      policy: { stream: true },
      artifacts: [source],
    });

    expect(result.ok).toBe(true);
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      // The runtime folds provider-packaged artifacts into the lineage root, so it
      // must differ from the root computed over the raw input/output artifacts alone.
      // This inequality guards the create-ai.ts packaged-artifact lineage wiring
      // (Codex PR #12 P2-3) on the streaming success path.
      const inputOnlyRoot = await computeArtifactLineageMerkleRoot([source, derived]);
      expect(verifyResult.body.lineageMerkleRoot).toMatch(/^sha256:[a-f0-9]{64}$/u);
      expect(verifyResult.body.lineageMerkleRoot).not.toBe(inputOnlyRoot);
    }
  });

  it("T12: receipt body carries contractHash matching canonicalize(contract)", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const ai = createAI({ providers: [createFakeProvider()], signer });
    const c = contract({ budget: { maxCostUsd: 1 } });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: c,
    });
    expect(result.ok).toBe(true);
    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      const canonical = canonicalize(c);
      expect(canonical).toBeDefined();
      const bytes = new TextEncoder().encode(canonical!);
      const ab = new Uint8Array(bytes.byteLength);
      ab.set(bytes);
      const digest = await crypto.subtle.digest(
        "SHA-256",
        ab.buffer as ArrayBuffer,
      );
      const expectedHex = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      expect(verifyResult.body.contractHash).toBe(expectedHex);
    }
  });

  it("T13: signer failure does not crash ai.run (receipt is undefined)", async () => {
    const failingSigner: ReceiptSigner = {
      kid: "boom",
      publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "" },
      async sign(): Promise<Uint8Array> {
        throw new Error("signer always throws");
      },
    };
    const ai = createAI({
      providers: [createFakeProvider()],
      signer: failingSigner,
    });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs).toBeDefined();
    }
    expect(result.receipt).toBeUndefined();
  });

  it("T14: 100 receipts issue in under 5 seconds total (property test)", async () => {
    const { signer } = await makeSignerAndKeySet();
    const ai = createAI({ providers: [createFakeProvider()], signer });
    const start = Date.now();
    for (let i = 0; i < 100; i += 1) {
      const result = await ai.run({
        task: "x",
        outputs: { text: "text" as const },
      });
      expect(result.receipt).toBeDefined();
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
  });

  it("OpenRouter fallback receipts carry requested and observed model", async () => {
    const { signer, keySet } = await makeSignerAndKeySet();
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "fallback ok" } }],
          model: "anthropic/claude-sonnet-4.5",
          usage: { prompt_tokens: 5, completion_tokens: 3 },
        }),
        {
          headers: { "content-type": "application/json" },
        },
      )) as unknown as typeof fetch;
    const provider = createOpenRouterProvider({
      model: "openai/gpt-oss-120b",
      fallbackModels: ["anthropic/claude-sonnet-4.5"],
      fetch: fakeFetch,
    });
    const ai = createAI({ providers: [provider], signer });

    const result = await ai.run({
      task: "fallback",
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.gateway?.requestedModel).toBe("openai/gpt-oss-120b");
    expect(result.gateway?.fallbackModels).toEqual(["anthropic/claude-sonnet-4.5"]);
    expect(result.gateway?.observedModel).toBe("anthropic/claude-sonnet-4.5");
    expect(result.plan.kind).toBe("execution-plan");
    if (result.plan.kind === "execution-plan") {
      expect(result.plan.route.selected?.modelId).toBe("openai/gpt-oss-120b");
    }
    const succeededAttemptEvent = result.events?.find(
      (event) =>
        event.kind === "provider.attempt" &&
        event.metadata?.status === "succeeded",
    );
    expect(succeededAttemptEvent?.metadata?.gateway).toMatchObject({
      requestedModel: "openai/gpt-oss-120b",
      fallbackModels: ["anthropic/claude-sonnet-4.5"],
      observedModel: "anthropic/claude-sonnet-4.5",
    });

    const verifyResult = await verifyReceipt(result.receipt!, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.model.requested).toBe("openai/gpt-oss-120b");
      expect(verifyResult.body.model.observed).toBe("anthropic/claude-sonnet-4.5");
      expect(verifyResult.body.route.capabilityId).toBe("openai/gpt-oss-120b");
      expect(verifyResult.body.modelClass).toBe("frontier_rlhf");
    }
  });
});
