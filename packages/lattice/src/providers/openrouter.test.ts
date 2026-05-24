import { describe, expect, it } from "vitest";
import { createOpenRouterProvider } from "./openrouter.js";

/**
 * Phase 4 OpenRouter adapter -- vitest cases (D-09 contract: 7 minimum; ships 7).
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
  choices: [{ message: { content: "hello openrouter" } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

describe("Phase 4 OpenRouter adapter", () => {
  it("Test 1 (D-09.1): factory identity -- kind, id, capabilities populated", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createOpenRouterProvider({
      model: "anthropic/claude-3.5-sonnet",
      apiKey: "sk-or-test",
      fetch,
    });
    expect(adapter.kind).toBe("provider-adapter");
    expect(adapter.id).toBe("openrouter");
    expect(adapter.capabilities).toBeDefined();
    expect(adapter.capabilities?.length).toBeGreaterThan(0);
    expect(adapter.capabilities?.[0]?.modelId).toBe("anthropic/claude-3.5-sonnet");
  });

  it("Test 2 (D-09.2): request shape -- default base URL is openrouter.ai/api/v1", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-4o",
      apiKey: "sk-or-test",
      fetch,
    });
    await adapter.execute!({
      task: "task-text",
      artifacts: [],
      outputs: ["text"],
    });
    expect(capture.url).toMatch(/openrouter\.ai\/api\/v1\/chat\/completions/);
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("openai/gpt-4o");
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("Test 3 (D-09.3): response parsing -- extracts choices[0].message.content", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "extracted openrouter text" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-or-test",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.rawOutputs.text).toBe("extracted openrouter text");
  });

  it("Test 4 (D-09.4): usage extraction -- standard OpenAI-compat prompt_tokens/completion_tokens", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    });
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-or-test",
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

  it("Test 5 (D-09.5): error handling -- non-OK throws", async () => {
    const { fetch } = makeFakeFetch({ error: "boom" }, 500);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-or-test",
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
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-or-test",
      fetch: f1,
      pricing: { inputPer1kTokens: 0.0015, outputPer1kTokens: 0.006 },
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // (1000 * 0.0015 + 500 * 0.006) / 1000 = (1.5 + 3) / 1000 = 0.0045
    expect(response.normalizedUsage?.costUsd).toBeCloseTo(0.0045, 6);
  });

  it("Test 7 (D-09.7): AbortSignal wiring -- propagates to fetch", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-4o-mini",
      apiKey: "sk-or-test",
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
});
