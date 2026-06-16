import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createXaiProvider } from "./xai.js";
import { collectStream } from "./streaming.js";
import { NegotiationAuthError } from "../capabilities/negotiate.js";
import type { SanitizerFn } from "../sanitizers/index.js";
import { defineTool } from "../tools/tools.js";

/**
 * Phase 4 xAI adapter -- vitest cases.
 * D-09 contract: 7 cases minimum; this file ships 8 (extra case for
 * D-09.4 reasoning_tokens quirk per CONTEXT.md).
 *
 * Phase 34 additions: xAI quirks + negotiateCapabilities() tests.
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

const encoder = new TextEncoder();

function sseData(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
}

function makeStreamingFetch(chunks: readonly string[]): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { url: "", init: {} };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

/**
 * Multi-response fetch for negotiate() retry/sequence tests.
 * Each call returns the next response in the array; last response repeats.
 */
function makeSequenceFetch(
  responses: Array<{ body: unknown; status?: number }>,
): {
  fetch: typeof fetch;
  callCount: () => number;
  urls: string[];
  inits: RequestInit[];
} {
  let idx = 0;
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    urls.push(url);
    inits.push(init ?? {});
    const r = responses[Math.min(idx, responses.length - 1)];
    idx += 1;
    const resp = r ?? { body: {}, status: 200 };
    return new Response(JSON.stringify(resp.body), {
      status: resp.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return {
    fetch: fakeFetch,
    callCount: () => idx,
    urls,
    inits,
  };
}

const HAPPY_BODY = {
  choices: [{ message: { content: "hello xai" } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

const searchTool = defineTool({
  name: "search",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "ok",
});

// xAI /v1/models fixtures
const xaiModelsOk = {
  object: "list",
  data: [
    { id: "grok-4-0709", object: "model", created: 1720000000, owned_by: "xai" },
    { id: "grok-4", object: "model", created: 1720000000, owned_by: "xai" },
  ],
};

const xaiModels401 = {
  error: {
    message: "Invalid API key. Please check your API key and try again.",
    type: "authentication_error",
  },
};

const xaiModels503 = {
  error: {
    message: "Service temporarily unavailable.",
    type: "server_error",
  },
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

describe("Phase 44: xAI streaming", () => {
  it("exposes executeStream and preserves reasoning_tokens in usage", async () => {
    const { fetch, capture } = makeStreamingFetch([
      sseData({ choices: [{ delta: { content: "hello" } }] }),
      sseData({
        choices: [{ delta: {} }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          completion_tokens_details: { reasoning_tokens: 4 },
        },
      }),
      sseData("[DONE]"),
    ]);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
    });

    const response = await collectStream(await adapter.executeStream!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    }));

    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(response.rawOutputs.text).toBe("hello");
    expect(response.usage?.totalTokens).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Phase 34: xAI quirks + negotiateCapabilities tests (Task 3)
// ---------------------------------------------------------------------------

describe("Phase 34: xAI quirks + negotiateCapabilities", () => {
  it("Test 1: factory return type narrows to expose quirks: XaiQuirks + negotiateCapabilities", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch,
    });
    expect(adapter.quirks).toBeDefined();
    expect(typeof adapter.negotiateCapabilities).toBe("function");
    // XaiQuirks has reasoningTokensReported + logprobsSupported
    expect("reasoningTokensReported" in adapter.quirks).toBe(true);
    expect("logprobsSupported" in adapter.quirks).toBe(true);
  });

  it("Test 2: quirks block populated per RESEARCH §Q6 xAI vocabulary", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch,
    });
    expect(adapter.quirks).toEqual({
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      reasoningTokensReported: true,
      logprobsSupported: false,
    });
  });

  it("Test 3 (happy path with lenient parse): negotiateCapabilities resolves for grok-4 (in registry)", async () => {
    const { fetch: negotiateFetch, urls, inits } = makeSequenceFetch([
      { body: xaiModelsOk, status: 200 },
    ]);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch: negotiateFetch,
    });
    const result = await adapter.negotiateCapabilities("grok-4");
    // grok-4 is in registry.static.ts (xai:grok-4) AND in xai-models-ok fixture
    // -> source: "live" with registry profile data
    expect(result.source).toBe("live");
    expect(result.modelId).toBe("grok-4");
    // contextWindow from registry profile (131072)
    expect(result.contextWindow).toBe(131072);
    // Verify fetch used the xAI base URL with Bearer auth
    // xAI baseUrl includes "/v1", so we append "/models" -> "/v1/models"
    expect(urls[0]).toMatch(/api\.x\.ai\/v1\/models$/);
    const authHeader = (inits[0]?.headers as Record<string, string>)?.["authorization"];
    expect(authHeader).toBe("Bearer xai-test");
  });

  it("Test 4 (lenient parse -- Pitfall 1): weird body shape falls back to registry without crash", async () => {
    // xAI may return unexpected shape in the future; lenient parse must handle gracefully
    const weirdBody = { weird: "shape", data: "not-an-array" };
    const { fetch: negotiateFetch } = makeSequenceFetch([
      { body: weirdBody, status: 200 },
    ]);
    const sinkCalls: unknown[] = [];
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch: negotiateFetch,
      runEventSink: (e) => { sinkCalls.push(e); },
    });
    // Should NOT throw; should gracefully fall back
    const result = await adapter.negotiateCapabilities("grok-4");
    expect(result.source).toBe("registry-fallback");
    // Fallback event should be emitted
    expect(sinkCalls.length).toBeGreaterThan(0);
  });

  it("Test 5 (401): rejects with NegotiationAuthError; adapter === 'xai', httpStatus === 401", async () => {
    const { fetch: negotiateFetch } = makeSequenceFetch([
      { body: xaiModels401, status: 401 },
    ]);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-bad-key",
      fetch: negotiateFetch,
    });
    await expect(adapter.negotiateCapabilities("grok-4")).rejects.toThrow(NegotiationAuthError);
    const { fetch: negotiateFetch2 } = makeSequenceFetch([
      { body: xaiModels401, status: 401 },
    ]);
    const adapter2 = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-bad-key",
      fetch: negotiateFetch2,
    });
    await expect(adapter2.negotiateCapabilities("grok-4")).rejects.toMatchObject({
      kind: "negotiation-auth-failed",
      adapter: "xai",
      httpStatus: 401,
    });
  });

  it("Test 6 (503 fallback): source: 'registry-fallback' after all retries exhausted", async () => {
    const { fetch: negotiateFetch, callCount } = makeSequenceFetch([
      { body: xaiModels503, status: 503 },
      { body: xaiModels503, status: 503 },
      { body: xaiModels503, status: 503 },
    ]);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch: negotiateFetch,
      modelsRetryCount: 2,
      modelsCacheTtlMs: 0,
    });
    const result = await adapter.negotiateCapabilities("grok-4");
    expect(result.source).toBe("registry-fallback");
    expect(callCount()).toBe(3);
  });

  it("Test 7 (cache + inflight + retry timing): mirrors Plan 34-02 pattern", async () => {
    // Cache: second call returns cached result
    const { fetch: cacheFetch, callCount: cacheCount } = makeSequenceFetch([
      { body: xaiModelsOk, status: 200 },
    ]);
    const cacheAdapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch: cacheFetch,
      modelsCacheTtlMs: 60_000,
    });
    await cacheAdapter.negotiateCapabilities("grok-4");
    await cacheAdapter.negotiateCapabilities("grok-4");
    expect(cacheCount()).toBe(1); // cached

    // Inflight coalescing: 3 concurrent calls trigger only 1 fetch
    const { fetch: inflightFetch, callCount: inflightCount } = makeSequenceFetch([
      { body: xaiModelsOk, status: 200 },
    ]);
    const inflightAdapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch: inflightFetch,
      modelsCacheTtlMs: 60_000,
    });
    await Promise.all([
      inflightAdapter.negotiateCapabilities("grok-4"),
      inflightAdapter.negotiateCapabilities("grok-4"),
      inflightAdapter.negotiateCapabilities("grok-4"),
    ]);
    expect(inflightCount()).toBe(1); // coalesced

    // Retry timing: 503 x2 then 200 on third attempt
    vi.useFakeTimers();
    const { fetch: retryFetch, callCount: retryCount } = makeSequenceFetch([
      { body: xaiModels503, status: 503 },
      { body: xaiModels503, status: 503 },
      { body: xaiModelsOk, status: 200 },
    ]);
    const retryAdapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test",
      fetch: retryFetch,
      modelsRetryCount: 2,
      modelsCacheTtlMs: 0,
    });
    const retryPromise = retryAdapter.negotiateCapabilities("grok-4");
    await vi.advanceTimersByTimeAsync(2000);
    const retryResult = await retryPromise;
    expect(retryCount()).toBe(3);
    expect(retryResult.source).toBe("live"); // grok-4 in registry + in fixture
    vi.useRealTimers();
  });
});

describe("Phase 36: xAI output sanitizer", () => {
  it("applies inherited sanitizer exactly once while preserving rawResponse", async () => {
    const rawBody = {
      choices: [{ message: { content: "Greeted the user." } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    };
    const marker: SanitizerFn = (text) => `${text} [sanitized]`;
    const { fetch } = makeFakeFetch(rawBody);
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
      sanitizeOutput: marker,
    });

    const response = await adapter.execute!({
      task: "hi",
      artifacts: [],
      outputs: ["text"],
    });

    expect(response.rawOutputs.text).toBe("Greeted the user. [sanitized]");
    expect(String(response.rawOutputs.text).match(/\[sanitized\]/gu)).toHaveLength(1);
    expect(response.rawResponse).toEqual(rawBody);
  });
});

describe("Phase 37: xAI tool-call validation", () => {
  it("accepts validateToolCalls once through wrapper options", async () => {
    const callback = vi.fn();
    const { fetch } = makeFakeFetch({
      choices: [
        {
          message: {
            content: `{"tool_calls":[{"id":"xai-1","name":"search","args":{"quer":"..."}}]}`,
          },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const adapter = createXaiProvider({
      model: "grok-4",
      apiKey: "xai-test-key",
      fetch,
      validateToolCalls: {
        tools: [searchTool],
        onFailure: "callback",
        onValidationFailure: callback,
      },
    });

    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(response.toolCalls).toEqual([]);
  });
});
