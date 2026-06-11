import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { RunEvent } from "../tracing/tracing.js";
import { NegotiationAuthError } from "../capabilities/negotiate.js";
import { createAnthropicProvider } from "./anthropic.js";
import { unwrapInternalEnvelope } from "../sanitizers/index.js";
import { defineTool } from "../tools/tools.js";

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

/**
 * Multi-route fake fetch: maps URL patterns to { body, status } responses.
 * Used for negotiate() tests that need to distinguish /v1/models from /v1/messages.
 * Also supports a sequence of responses for retry testing.
 */
function makeRoutedFetch(routes: Record<string, { body: unknown; status?: number }>): {
  fetch: typeof fetch;
  capture: { urls: string[]; inits: RequestInit[] };
} {
  const capture = { urls: [] as string[], inits: [] as RequestInit[] };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.urls.push(url);
    capture.inits.push(init);
    // Find matching route by substring match
    const matchingKey = Object.keys(routes).find((key) => url.includes(key));
    if (matchingKey === undefined) {
      return new Response(JSON.stringify({ error: "no route" }), { status: 404 });
    }
    const route = routes[matchingKey]!;
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

/**
 * Sequence fetch: returns responses from a queue in order.
 * After the queue is exhausted, the last response is repeated.
 */
function makeSequenceFetch(
  responses: Array<{ body: unknown; status?: number }>,
): {
  fetch: typeof fetch;
  capture: { urls: string[]; callCount: number };
} {
  const capture = { urls: [] as string[], callCount: 0 };
  const fakeFetch = (async (url: string, _init: RequestInit) => {
    capture.urls.push(url);
    const idx = Math.min(capture.callCount, responses.length - 1);
    const response = responses[idx]!;
    capture.callCount += 1;
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
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

const searchTool = defineTool({
  name: "search",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "ok",
});

// Frozen fixture matching RESEARCH §Q1 verified shape (live 2026-06-08)
const MODELS_OK_BODY = {
  data: [
    {
      id: "claude-opus-4-6",
      type: "model",
      display_name: "Claude Opus 4.6",
      created_at: "2026-02-04T00:00:00Z",
      max_input_tokens: 200000,
      max_tokens: 16000,
      capabilities: {
        batch: { supported: true },
        citations: { supported: true },
        code_execution: { supported: true },
        context_management: { supported: true },
        effort: { supported: true, high: { supported: true } },
        image_input: { supported: true },
        pdf_input: { supported: true },
        structured_outputs: { supported: true },
        thinking: {
          supported: true,
          types: { adaptive: { supported: true }, enabled: { supported: true } },
        },
      },
    },
    {
      id: "claude-haiku-3-5",
      type: "model",
      display_name: "Claude Haiku 3.5",
      created_at: "2024-11-05T00:00:00Z",
      max_input_tokens: 200000,
      max_tokens: 8096,
      capabilities: {
        structured_outputs: { supported: true },
        thinking: { supported: false },
      },
    },
  ],
  first_id: "claude-opus-4-6",
  last_id: "claude-haiku-3-5",
  has_more: false,
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

describe("Phase 36: Anthropic output sanitizer", () => {
  it("unwraps internal envelope output and preserves rawResponse", async () => {
    const rawBody = {
      content: [{ type: "text", text: "{\"summary\":\"Greeted the user.\"}" }],
      usage: { input_tokens: 1, output_tokens: 2 },
    };
    const { fetch } = makeFakeFetch(rawBody);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
      sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
    });

    const response = await adapter.execute!({
      task: "hi",
      artifacts: [],
      outputs: ["text"],
    });

    expect(response.rawOutputs.text).toBe("Greeted the user.");
    expect(response.rawResponse).toEqual(rawBody);
  });
});

describe("Phase 37: Anthropic tool-call validation", () => {
  it("returns validated toolCalls and preserves raw Anthropic response data", async () => {
    const rawBody = {
      content: [
        {
          type: "text",
          text: `{"tool_calls":[{"id":"c1","name":"search","args":{"query":"ok"}}]}`,
        },
      ],
      usage: { input_tokens: 1, output_tokens: 2 },
    };
    const { fetch } = makeFakeFetch(rawBody);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
      validateToolCalls: { tools: [searchTool] },
    });

    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });

    expect(response.rawOutputs.text).toBe(rawBody.content[0]?.text);
    expect(response.rawResponse).toEqual(rawBody);
    expect(response.toolCalls).toEqual([
      { id: "c1", name: "search", args: { query: "ok" } },
    ]);
  });

  it("throws for hallucinated tool names before returning invalid calls", async () => {
    const { fetch } = makeFakeFetch({
      content: [
        {
          type: "text",
          text: `{"tool_calls":[{"id":"bad-1","name":"search_database","args":{"quer":"..."}}]}`,
        },
      ],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
      validateToolCalls: { tools: [searchTool], onFailure: "throw" },
    });

    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toMatchObject({
      reason: "unknown_tool",
      toolName: "search_database",
      requestId: "bad-1",
    });
  });
});

describe("Phase 34: Anthropic quirks block", () => {
  it("Test 1: quirks block has the 8 expected values (5 universal + 3 Anthropic-narrowed)", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
    });
    expect(adapter.quirks).toEqual({
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      promptCachingSupported: true,
      extendedThinkingSupported: true,
      toolUseInputSchemaStrict: true,
    });
  });

  it("Test 2: negotiateCapabilities is a function on the adapter", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
    });
    expect(typeof adapter.negotiateCapabilities).toBe("function");
  });

  it("Test 3 (backward-compat): pre-existing execute() path still works after Phase 34 changes", async () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
    });
    const result = await adapter.execute!({ task: "test backward compat", artifacts: [], outputs: ["text"] });
    expect(result.rawOutputs.text).toBe("hello anthropic");
  });
});

describe("Phase 34: Anthropic negotiateCapabilities", () => {
  it("Test 1: happy path -- 200 response resolves with source: 'live' and correct supports fields", async () => {
    const { fetch, capture } = makeRoutedFetch({
      "/v1/models": { body: MODELS_OK_BODY, status: 200 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 0,  // disable cache for this test
    });
    const result = await adapter.negotiateCapabilities("claude-opus-4-6");

    expect(result.source).toBe("live");
    expect(result.modelId).toBe("claude-opus-4-6");
    expect(result.supports.structuredOutputs).toBe(true);
    expect(result.supports.extendedThinking).toBe(true);
    expect(result.supports.nativeToolCalling).toBe(true);
    expect(result.supports.streaming).toBe(true);
    expect(result.supports.parallelToolCalls).toBe(true);
    // contextWindow: fixture has max_input_tokens: 200000
    expect(result.contextWindow).toBe(200000);
    // knownFailureModes: frontier_rlhf models have empty failure modes
    expect(result.knownFailureModes).toEqual([]);
    expect(result.recommendedSanitizers).toEqual([]);
    // Verify URL has correct shape per RESEARCH §Q1 + plan verification criteria
    expect(capture.urls[0]).toContain("/v1/models");
    expect(capture.urls[0]).toContain("limit=1000");
  });

  it("Test 1b: happy path -- URL, headers, and accept header match RESEARCH §Q1", async () => {
    const { fetch, capture } = makeRoutedFetch({
      "/v1/models": { body: MODELS_OK_BODY, status: 200 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-real-key",
      fetch,
      modelsCacheTtlMs: 0,
    });
    await adapter.negotiateCapabilities("claude-opus-4-6");

    const init = capture.inits[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("sk-ant-real-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(headers["accept"]).toBe("application/json");
  });

  it("Test 2: 401 auth error -- throws NegotiationAuthError, NO fallback, NO retry", async () => {
    let callCount = 0;
    const fakeFetch = (async (url: string, _init: RequestInit) => {
      if (url.includes("/v1/models")) {
        callCount += 1;
        return new Response(JSON.stringify({ error: { type: "authentication_error", message: "invalid x-api-key" } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("", { status: 200 });
    }) as unknown as typeof fetch;

    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-bad-key",
      fetch: fakeFetch,
      modelsRetryCount: 2,  // even with retries configured, 401 should not retry
    });

    await expect(adapter.negotiateCapabilities("claude-opus-4-6")).rejects.toThrow(NegotiationAuthError);

    // Verify NegotiationAuthError shape
    let caught: NegotiationAuthError | undefined;
    try {
      await adapter.negotiateCapabilities("claude-opus-4-6");
    } catch (err) {
      if (err instanceof NegotiationAuthError) caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught?.adapter).toBe("anthropic");
    expect(caught?.modelId).toBe("claude-opus-4-6");
    expect(caught?.httpStatus).toBe(401);
    expect(caught?.kind).toBe("negotiation-auth-failed");
    // T-34-02-04: message must NOT include the actual apiKey
    expect(caught?.message).not.toContain("sk-ant-bad-key");

    // D-10: 401 should NOT retry -- should have been called exactly once per attempt
    // (two calls above + one failed call before catching = 3 total, but each NegotiationAuthError
    // call is a fresh adapter call. Two negotiateCapabilities calls = 2 fetch calls max)
    expect(callCount).toBeLessThanOrEqual(2);
  });

  it("Test 3: 503 transient with retry -- falls back to registry, emits RunEvent", async () => {
    const capturedEvents: RunEvent[] = [];
    const runEventSink = (event: RunEvent) => {
      capturedEvents.push(event);
    };

    // All attempts return 503
    const fakeFetch = (async (_url: string, _init: RequestInit) => {
      return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "service overloaded" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch: fakeFetch,
      modelsRetryCount: 0,  // 1 attempt total for speed
      modelsCacheTtlMs: 0,
      runEventSink,
    });

    // Use claude-opus-4 (present in registry.static.ts as anthropic:claude-opus-4)
    const result = await adapter.negotiateCapabilities("claude-opus-4");

    expect(result.source).toBe("registry-fallback");
    expect(result.modelId).toBe("claude-opus-4");
    // The registry has anthropic:claude-opus-4 with contextWindow: 200000
    expect(result.contextWindow).toBe(200000);

    // D-12: RunEvent emitted with fallback kind
    expect(capturedEvents.length).toBeGreaterThanOrEqual(1);
    const fallbackEvent = capturedEvents.find((e) => e.kind === "capabilities.negotiation.fallback");
    expect(fallbackEvent).toBeDefined();
    expect(fallbackEvent?.metadata?.["adapter"]).toBe("anthropic");
    expect(fallbackEvent?.metadata?.["fallbackSource"]).toBe("registry-fallback");

    // T-34-02-01: errorReason must NOT include any api key value
    const errorReason = fallbackEvent?.metadata?.["errorReason"] as string;
    expect(errorReason).not.toContain("sk-ant-");
  });

  it("Test 4: cache hit -- two sequential calls trigger only one fetch", async () => {
    const { fetch, capture } = makeRoutedFetch({
      "/v1/models": { body: MODELS_OK_BODY, status: 200 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 60_000,  // 1 minute TTL
    });

    const result1 = await adapter.negotiateCapabilities("claude-opus-4-6");
    const result2 = await adapter.negotiateCapabilities("claude-opus-4-6");

    // Cache hit: fetch called only once
    const modelFetchCount = capture.urls.filter((u) => u.includes("/v1/models")).length;
    expect(modelFetchCount).toBe(1);
    // Both results are equivalent
    expect(result2.source).toBe("live");
    expect(result2.modelId).toBe(result1.modelId);
    expect(result2.contextWindow).toBe(result1.contextWindow);
  });

  it("Test 5: cache disabled -- two sequential calls trigger two fetches", async () => {
    const { fetch, capture } = makeRoutedFetch({
      "/v1/models": { body: MODELS_OK_BODY, status: 200 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 0,  // disabled
    });

    await adapter.negotiateCapabilities("claude-opus-4-6");
    await adapter.negotiateCapabilities("claude-opus-4-6");

    const modelFetchCount = capture.urls.filter((u) => u.includes("/v1/models")).length;
    expect(modelFetchCount).toBe(2);
  });

  it("Test 6: inflight coalescing -- 5 concurrent calls trigger only one fetch", async () => {
    const { fetch, capture } = makeRoutedFetch({
      "/v1/models": { body: MODELS_OK_BODY, status: 200 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 60_000,
    });

    // 5 concurrent calls -- no await between
    const results = await Promise.all([
      adapter.negotiateCapabilities("claude-opus-4-6"),
      adapter.negotiateCapabilities("claude-opus-4-6"),
      adapter.negotiateCapabilities("claude-opus-4-6"),
      adapter.negotiateCapabilities("claude-opus-4-6"),
      adapter.negotiateCapabilities("claude-opus-4-6"),
    ]);

    // Inflight coalescing: only 1 fetch call
    const modelFetchCount = capture.urls.filter((u) => u.includes("/v1/models")).length;
    expect(modelFetchCount).toBe(1);

    // All 5 results are equivalent
    for (const result of results) {
      expect(result.source).toBe("live");
      expect(result.modelId).toBe("claude-opus-4-6");
    }
  });

  it("Test 7: inflight cleanup on rejection -- Map cleared; subsequent call triggers fresh fetch", async () => {
    // First wave: all 5 concurrent calls for the SAME modelId get a 503 (transient -> fallback).
    // After they settle, the 6th call FOR THE SAME modelId must trigger a fresh fetch.
    // This tests Pitfall 4: the inflight Map must be cleared by .finally even on failure,
    // so the 6th call makes a NEW fetch instead of re-using the old (now-settled) promise.
    //
    // WR-05 (Phase 34 review): the prior version of this test used a different modelId
    // for the 6th call. Because the inflight Map is keyed by modelId, a different modelId
    // would have triggered a fresh fetch REGARDLESS of whether inflight cleanup ran --
    // so the test passed even without the .finally cleanup. Using the SAME modelId
    // throughout makes the inflight Map state the only path to a second fetch.
    let fetchCallCount = 0;
    const fakeFetch = (async (_url: string, _init: RequestInit) => {
      fetchCallCount += 1;
      const currentCall = fetchCallCount;
      if (currentCall === 1) {
        // First real fetch (coalesced for all 5 concurrent calls) -- returns 503
        return new Response(JSON.stringify({ error: { type: "overloaded_error", message: "overloaded" } }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      // Second fetch (6th negotiateCapabilities call after first wave settles) -- returns 200.
      // MODELS_OK_BODY does NOT contain "claude-opus-4" (only claude-opus-4-6 and claude-haiku-3-5),
      // so the merge yields source: "registry-fallback" via the not-found branch -- but the
      // assertion target is fetchCallCount === 2, which proves the inflight Map was cleared.
      return new Response(JSON.stringify(MODELS_OK_BODY), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const adapter = createAnthropicProvider({
      model: "claude-opus-4",
      apiKey: "sk-ant-test",
      fetch: fakeFetch,
      modelsRetryCount: 0,  // 1 attempt total; keeps test simple
      modelsCacheTtlMs: 0,  // disable cache so 6th call hits the wire (not the TTL cache)
    });

    // 5 concurrent calls for "claude-opus-4" -- all will get registry-fallback from the 503.
    // claude-opus-4 IS in the static registry (anthropic:claude-opus-4, contextWindow 200000),
    // so registry-fallback returns a populated profile (not the empty stub).
    const firstWave = await Promise.all([
      adapter.negotiateCapabilities("claude-opus-4"),
      adapter.negotiateCapabilities("claude-opus-4"),
      adapter.negotiateCapabilities("claude-opus-4"),
      adapter.negotiateCapabilities("claude-opus-4"),
      adapter.negotiateCapabilities("claude-opus-4"),
    ]);

    // All 5 should have fallen back to registry (503 -> fallback)
    for (const result of firstWave) {
      expect(result.source).toBe("registry-fallback");
    }

    // First wave = exactly 1 real fetch (coalesced by inflight Map)
    expect(fetchCallCount).toBe(1);

    // Pitfall 4: After all settle, inflight Map MUST be cleared.
    // The 6th call (SAME modelId) should trigger a FRESH fetch -> fetchCallCount becomes 2.
    // If the .finally cleanup were missing, the 6th call would re-use the cached settled
    // Promise from the inflight Map (keyed by modelId) and fetchCallCount would stay at 1.
    const sixthResult = await adapter.negotiateCapabilities("claude-opus-4");
    expect(fetchCallCount).toBe(2);  // fresh fetch was attempted -- proves inflight cleanup ran
    // 6th call hit a 200 response, but MODELS_OK_BODY doesn't contain claude-opus-4,
    // so the merge yields source: "registry-fallback" via the not-found branch.
    expect(sixthResult.source).toBe("registry-fallback");
  });

  it("Test 8: retry timing -- 503 on attempts 1+2, 200 on attempt 3; total 3 fetch calls", async () => {
    const { fetch, capture } = makeSequenceFetch([
      { body: { error: { type: "overloaded_error", message: "overloaded" } }, status: 503 },
      { body: { error: { type: "overloaded_error", message: "overloaded" } }, status: 503 },
      { body: MODELS_OK_BODY, status: 200 },
    ]);

    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsRetryCount: 2,  // 3 total attempts
      modelsCacheTtlMs: 0,
    });

    // Use fake timers to skip backoff delays
    vi.useFakeTimers();
    const negotiatePromise = adapter.negotiateCapabilities("claude-opus-4-6");
    // Advance timers to skip the 200ms and 1000ms backoff
    await vi.runAllTimersAsync();
    const result = await negotiatePromise;
    vi.useRealTimers();

    // 3 total attempts (1 + 2 retries)
    expect(capture.callCount).toBe(3);
    // 3rd attempt succeeded -- source is "live"
    expect(result.source).toBe("live");
    expect(result.modelId).toBe("claude-opus-4-6");
  });

  it("Test 9: registry-fallback when registry has the profile", async () => {
    // 503 forever; modelId is "claude-opus-4" which IS in registry.static.ts
    const fakeFetch = (async () => {
      return new Response(JSON.stringify({ error: { type: "overloaded_error" } }), {
        status: 503,
      });
    }) as unknown as typeof fetch;

    const adapter = createAnthropicProvider({
      model: "claude-opus-4",
      apiKey: "sk-ant-test",
      fetch: fakeFetch,
      modelsRetryCount: 0,
      modelsCacheTtlMs: 0,
    });

    const result = await adapter.negotiateCapabilities("claude-opus-4");

    expect(result.source).toBe("registry-fallback");
    expect(result.modelId).toBe("claude-opus-4");
    // Registry profile for anthropic:claude-opus-4 has contextWindow: 200000
    expect(result.contextWindow).toBe(200000);
    // frontier_rlhf -> nativeToolCalling: true (native_strict in registry)
    expect(result.supports.nativeToolCalling).toBe(true);
    // frontier_rlhf -> empty failure modes
    expect(result.knownFailureModes).toEqual([]);
    expect(result.recommendedSanitizers).toEqual([]);
  });

  it("Test 10: lenient parsing -- missing 'thinking' field does not crash; defaults to false", async () => {
    // Response is missing the `thinking` capability entirely
    const bodyMissingThinking = {
      data: [
        {
          id: "claude-opus-4-6",
          type: "model",
          max_input_tokens: 200000,
          capabilities: {
            structured_outputs: { supported: true },
            // thinking field intentionally absent (Pitfall 1 test)
          },
        },
      ],
      first_id: "claude-opus-4-6",
      last_id: "claude-opus-4-6",
      has_more: false,
    };

    const { fetch } = makeRoutedFetch({
      "/v1/models": { body: bodyMissingThinking, status: 200 },
    });

    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 0,
    });

    // Must NOT throw -- lenient parsing
    const result = await adapter.negotiateCapabilities("claude-opus-4-6");
    expect(result.source).toBe("live");
    // missing thinking field -> defaults to false
    expect(result.supports.extendedThinking).toBe(false);
    // structured_outputs is present -> true
    expect(result.supports.structuredOutputs).toBe(true);
  });
});

describe("cacheSystemPrefix (Phase 39)", () => {
  // NOTE: Live cache-hit verification (real Anthropic API, observing
  // cache_read_input_tokens > 0 on a 2nd same-prefix call) is nightly/manual-only
  // per repo policy (A4) -- real-provider tests never run at PR time. These
  // mocked-fetch shape tests are the PR-time proof (Pitfall 1): the request
  // body shape is what makes cache hits structurally possible.

  it("Test 1: presence -- system is an array with one cache_control ephemeral block; prefix NOT duplicated into messages", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
    });
    await adapter.execute!({
      task: "child task body",
      artifacts: [],
      outputs: ["text"],
      cacheSystemPrefix: "CREW PREFIX",
    });
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    // system must be an ARRAY (block-granular caching), not a string
    expect(Array.isArray(body.system)).toBe(true);
    const system = body.system as readonly {
      type: string;
      text: string;
      cache_control: { type: string };
    }[];
    expect(system).toHaveLength(1);
    expect(system[0]).toEqual({
      type: "text",
      text: "CREW PREFIX",
      cache_control: { type: "ephemeral" },
    });
    // Exact literal assertion required by acceptance criteria
    expect(system[0]?.cache_control.type).toBe("ephemeral");
    // messages unchanged: content equals request.task -- prefix NOT duplicated
    const messages = body.messages as readonly { role: string; content: string }[];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("child task body");
  });

  it("Test 2: absence -- request body byte-identical to the pre-change golden body (system stays a string)", async () => {
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
    // Pre-change golden body for these exact inputs (T-39-11: no silent body
    // drift for existing consumers). Key order matches the adapter's object
    // literal: model, system, messages, max_tokens.
    const golden = JSON.stringify({
      model: "claude-3-haiku",
      system: "",
      messages: [{ role: "user", content: "task-text-here" }],
      max_tokens: 2000,
    });
    // Byte-identical serialized body
    expect(String(capture.init.body)).toBe(golden);
    // And deep-equal as a parsed object (system is the empty STRING, not an array)
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(body).toEqual(JSON.parse(golden));
    expect(body.system).toBe("");
  });

  it("Test 3: cache counters readable from rawResponse; normalizedUsage shape NOT widened", async () => {
    // Fixture 1: cache WRITE -- built from the existing success fixture plus
    // the two Anthropic cache counter fields (RESEARCH Pattern 3 field names).
    const creationBody = {
      ...HAPPY_BODY,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 0,
      },
    };
    const { fetch: f1 } = makeFakeFetch(creationBody);
    const adapter1 = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch: f1,
    });
    const response1 = await adapter1.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // Counters readable from rawResponse (anthropic.ts preserves the full body);
    // cast as the test file already does for raw bodies.
    const raw1 = response1.rawResponse as {
      usage: { cache_creation_input_tokens: number; cache_read_input_tokens: number };
    };
    expect(raw1.usage.cache_creation_input_tokens).toBe(1200);
    expect(raw1.usage.cache_read_input_tokens).toBe(0);

    // Fixture 2: cache READ -- second call hits the cache
    const readBody = {
      ...HAPPY_BODY,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 1200,
      },
    };
    const { fetch: f2 } = makeFakeFetch(readBody);
    const adapter2 = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch: f2,
    });
    const response2 = await adapter2.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    const raw2 = response2.rawResponse as {
      usage: { cache_creation_input_tokens: number; cache_read_input_tokens: number };
    };
    expect(raw2.usage.cache_read_input_tokens).toBe(1200);
    expect(raw2.usage.cache_creation_input_tokens).toBe(0);

    // normalizedUsage shape unchanged: EXACTLY the existing 3 fields -- no
    // cache counters leaked into the normalized Usage shape.
    expect(response1.normalizedUsage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      costUsd: null,
    });
    expect(Object.keys(response1.normalizedUsage!).sort()).toEqual([
      "completionTokens",
      "costUsd",
      "promptTokens",
    ]);
    expect(response2.normalizedUsage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      costUsd: null,
    });
  });
});
