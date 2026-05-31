import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic.js";

/**
 * Phase 4 Anthropic adapter -- vitest cases (D-09 contract: 7 cases minimum).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4. Real-runtime tests: each case calls
 * adapter.execute() against a fake fetch returning a structured Response.
 * No static-text greps; no live API calls (D-10 + D-11).
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
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "hello anthropic" }],
  usage: { input_tokens: 100, output_tokens: 50 },
};

describe("Phase 4 Anthropic adapter", () => {
  it("Test 1 (D-09.1): factory identity -- kind, id, capabilities populated", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus-20240229",
      apiKey: "sk-ant-test",
      fetch,
    });
    expect(adapter.kind).toBe("provider-adapter");
    expect(adapter.id).toBe("anthropic");
    expect(adapter.capabilities).toBeDefined();
    expect(adapter.capabilities?.length).toBeGreaterThan(0);
    expect(adapter.capabilities?.[0]?.modelId).toBe("claude-3-opus-20240229");
  });

  it("Test 2 (D-09.2): request shape -- top-level system + messages array (D-07 preserved)", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-3-haiku",
      apiKey: "sk-ant-test",
      fetch,
    });
    await adapter.execute!({
      task: "task-text-here",
      artifacts: [],
      outputs: ["text"],
    });
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("claude-3-haiku");
    expect(Object.prototype.hasOwnProperty.call(body, "system")).toBe(true);
    expect(Array.isArray(body.messages)).toBe(true);
    const messages = body.messages as readonly { role: string; content: string }[];
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("task-text-here");
    expect(typeof body.max_tokens).toBe("number");
  });

  it("Test 3 (D-09.3): response parsing -- extracts content[0].text", async () => {
    const { fetch } = makeFakeFetch({
      content: [{ type: "text", text: "extracted text" }],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.rawOutputs.text).toBe("extracted text");
  });

  it("Test 4 (D-09.4): usage extraction -- input_tokens / output_tokens (NOT prompt_tokens)", async () => {
    const { fetch } = makeFakeFetch({
      content: [{ text: "hi" }],
      usage: { input_tokens: 200, output_tokens: 80 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage).toBeDefined();
    expect(response.normalizedUsage?.promptTokens).toBe(200);
    expect(response.normalizedUsage?.completionTokens).toBe(80);
    expect(response.normalizedUsage?.costUsd).toBeNull();
    // Legacy UsageRecord shape preserves Anthropic field names
    expect(response.usage?.inputTokens).toBe(200);
    expect(response.usage?.outputTokens).toBe(80);
    expect(response.usage?.totalTokens).toBe(280);
  });

  it("Test 5 (D-09.5): error handling -- non-OK throws with provider name + status", async () => {
    const { fetch } = makeFakeFetch({ error: "boom" }, 500);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
    });
    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toThrow(/Anthropic provider failed with 500\./);
  });

  it("Test 6 (D-09.6): pricing applied -- supplied -> costUsd computed; absent -> null", async () => {
    const { fetch: f1 } = makeFakeFetch({
      content: [{ text: "hi" }],
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch: f1,
      pricing: { inputPer1kTokens: 0.015, outputPer1kTokens: 0.075 },
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // (1000 * 0.015 + 500 * 0.075) / 1000 = (15 + 37.5) / 1000 = 0.0525
    expect(response.normalizedUsage?.costUsd).toBeCloseTo(0.0525, 6);

    const { fetch: f2 } = makeFakeFetch({
      content: [{ text: "hi" }],
      usage: { input_tokens: 1000, output_tokens: 500 },
    });
    const adapter2 = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch: f2,
    });
    const response2 = await adapter2.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response2.normalizedUsage?.costUsd).toBeNull();
  });

  it("Test 7 (D-09.7): AbortSignal wiring -- request.signal propagates to fetch", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
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

  it("Test 8 (D-07): top-level `system` field is present on request body", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
    });
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    // D-07: `system` is a TOP-LEVEL field, NOT a system message folded into messages[].
    expect(Object.prototype.hasOwnProperty.call(body, "system")).toBe(true);
    const messages = body.messages as readonly { role: string }[];
    for (const m of messages) {
      expect(m.role).not.toBe("system");
    }
  });

  it("Test 9: anthropic-version + x-api-key headers wired correctly", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-secret-runtime-key",
      fetch,
    });
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });
    const headers = capture.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-secret-runtime-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["content-type"]).toBe("application/json");
    // No Bearer prefix on x-api-key (mirrors universal-provider.js PROVIDER_CONFIGS.anthropic at line 22).
    expect(headers["x-api-key"]).not.toMatch(/^Bearer /);
  });
});
