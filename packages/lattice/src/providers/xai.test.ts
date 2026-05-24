import { describe, expect, it } from "vitest";
import { createXaiProvider } from "./xai.js";

/**
 * Phase 4 xAI adapter -- vitest cases.
 * D-09 contract: 7 cases minimum; this file ships 8 (extra case for
 * D-09.4 reasoning_tokens quirk per CONTEXT.md).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4.
 */

interface FakeFetchCapture {
  url: string;
  init: RequestInit;
}

function makeFakeFetch(body: unknown, status = 200): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { url: "", init: {} };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

const HAPPY_BODY = {
  choices: [{ message: { content: "hello xai" } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

describe("Phase 4 xAI adapter", () => {
  it("Test 1 (D-09.1): factory identity -- kind, id, capabilities populated", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    expect(adapter.kind).toBe("provider-adapter");
    expect(adapter.id).toBe("xai");
    expect(adapter.capabilities).toBeDefined();
    expect(adapter.capabilities?.length).toBeGreaterThan(0);
    expect(adapter.capabilities?.[0]?.modelId).toBe("grok-4");
  });

  it("Test 2 (D-09.2): request shape -- OpenAI-compat messages[] (inherited from underlying factory)", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    await adapter.execute!({
      task: "task-text",
      artifacts: [],
      outputs: ["text"],
    });
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("grok-4");
    expect(Array.isArray(body.messages)).toBe(true);
    // URL should be xAI's base URL by default
    expect(capture.url).toMatch(/api\.x\.ai\/v1\/chat\/completions/);
  });

  it("Test 3 (D-09.3): response parsing -- extracts choices[0].message.content", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "extracted xai text" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.rawOutputs.text).toBe("extracted xai text");
  });

  it("Test 4 (D-09.4): usage extraction -- prompt_tokens/completion_tokens normalized", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    });
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage?.promptTokens).toBe(200);
    expect(response.normalizedUsage?.completionTokens).toBe(80);
    expect(response.normalizedUsage?.costUsd).toBeNull();
  });

  it("Test 4b (D-09.4 + D-07 carryforward): xAI reasoning_tokens quirk -- totalTokens INCLUDES reasoning_tokens", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        completion_tokens_details: { reasoning_tokens: 200 },
      },
    });
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // Phase 7 normalized Usage is unchanged (billable tokens only):
    expect(response.normalizedUsage?.promptTokens).toBe(100);
    expect(response.normalizedUsage?.completionTokens).toBe(50);
    // Legacy UsageRecord.totalTokens INCLUDES reasoning_tokens (FSB
    // production behavior preserved per D-07 + universal-provider.js:593):
    // 100 + 50 + 200 = 350
    expect(response.usage?.totalTokens).toBe(350);
    // Raw response preserves the reasoning_tokens path for future consumers
    const raw = response.rawResponse as {
      usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
    };
    expect(raw.usage?.completion_tokens_details?.reasoning_tokens).toBe(200);
  });

  it("Test 5 (D-09.5): error handling -- non-OK throws", async () => {
    const { fetch } = makeFakeFetch({ error: "boom" }, 500);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toThrow(/OpenAI-compatible provider failed with 500\./);
  });

  it("Test 6 (D-09.6): pricing applied -> costUsd computed; absent -> null", async () => {
    const { fetch: f1 } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    });
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch: f1,
      pricing: { inputPer1kTokens: 0.005, outputPer1kTokens: 0.015 },
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // (1000 * 0.005 + 500 * 0.015) / 1000 = (5 + 7.5) / 1000 = 0.0125
    expect(response.normalizedUsage?.costUsd).toBeCloseTo(0.0125, 6);
  });

  it("Test 7 (D-09.7): AbortSignal wiring -- propagates to fetch", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });
    const controller = new AbortController();
    await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
      signal: controller.signal,
    });
    expect(capture.init.signal).toBe(controller.signal);
  });

  it("Test 8: baseUrl override accepted (proxy support)", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      baseUrl: "https://proxy.example.com/xai/v1",
      fetch,
    });
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });
    expect(capture.url).toMatch(/proxy\.example\.com\/xai\/v1\/chat\/completions/);
  });
});
