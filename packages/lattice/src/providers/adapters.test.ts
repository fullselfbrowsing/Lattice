import { describe, expect, it } from "vitest";
import {
  createAISdkProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
} from "./adapters.js";
import { createFakeProvider } from "./fake.js";
import type { ModelCapability } from "./provider.js";

function makeFakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("Phase 7 adapter usage normalization", () => {
  it("openai adapter with pricing computes costUsd from prompt/completion tokens", async () => {
    const adapter = createOpenAIProvider({
      model: "test",
      baseUrl: "http://fake",
      fetch: makeFakeFetch({
        choices: [{ message: { content: "hi" } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
      pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 },
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toBeDefined();
    expect(response.normalizedUsage?.promptTokens).toBe(100);
    expect(response.normalizedUsage?.completionTokens).toBe(50);
    // (100 * 0.001 + 50 * 0.002) / 1000 = 0.0002
    expect(response.normalizedUsage?.costUsd).toBeCloseTo(0.0002, 10);
  });

  it("openai-compat adapter without pricing yields costUsd: null", async () => {
    const adapter = createOpenAICompatibleProvider({
      model: "test",
      baseUrl: "http://fake",
      fetch: makeFakeFetch({
        choices: [{ message: { content: "hi" } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      costUsd: null,
    });
  });

  it("openai-compat adapter handles input_tokens/output_tokens variant", async () => {
    const adapter = createOpenAICompatibleProvider({
      model: "test",
      baseUrl: "http://fake",
      fetch: makeFakeFetch({
        choices: [{ message: { content: "hi" } }],
        usage: { input_tokens: 80, output_tokens: 40 },
      }),
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toEqual({
      promptTokens: 80,
      completionTokens: 40,
      costUsd: null,
    });
  });

  it("openai-compat adapter handles missing/empty usage with zeros", async () => {
    const adapter = createOpenAICompatibleProvider({
      model: "test",
      baseUrl: "http://fake",
      fetch: makeFakeFetch({
        choices: [{ message: { content: "hi" } }],
        usage: {},
      }),
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null,
    });
  });

  it("ai-sdk adapter maps legacy UsageRecord to normalized Usage", async () => {
    const adapter = createAISdkProvider({
      model: "x",
      generate: async () => ({
        rawOutputs: { text: "hi" },
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      costUsd: null,
    });
  });

  it("fake provider emits a deterministic normalized usage", async () => {
    const adapter = createFakeProvider({});
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null,
    });
  });

  it("fake provider accepts a capabilities override option", () => {
    const customCapability: ModelCapability = {
      providerId: "fake-custom",
      modelId: "fake-custom:tiny",
      inputModalities: ["text"],
      outputModalities: ["text"],
      fileTransport: ["inline"],
      contextWindow: 1024,
      structuredOutput: false,
      toolUse: false,
      streaming: false,
      latency: "interactive",
      dataPolicy: { privacy: ["sensitive"] },
    };
    const adapter = createFakeProvider({ capabilities: [customCapability] });
    expect(adapter.capabilities).toEqual([customCapability]);
  });
});
