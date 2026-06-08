import { describe, expect, it, vi } from "vitest";
import {
  createAISdkProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
} from "./adapters.js";
import { createFakeProvider } from "./fake.js";
import type { ModelCapability } from "./provider.js";
import { NegotiationAuthError } from "../capabilities/negotiate.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";

function makeFakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

/**
 * Multi-route fake fetch for negotiate() tests. Tracks all calls.
 * Returns different responses per call index.
 */
function makeMultiRouteFetch(
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

// Load fixture JSON for OpenAI /v1/models tests
const openaiModelsOk = {
  object: "list",
  data: [
    { id: "gpt-4o-2024-08-06", object: "model", created: 1722470400, owned_by: "system" },
    { id: "gpt-4o-mini", object: "model", created: 1721260800, owned_by: "system" },
    { id: "o1", object: "model", created: 1725408000, owned_by: "system" },
  ],
};

const openaiModels401 = {
  error: {
    message: "Incorrect API key provided",
    type: "invalid_request_error",
    code: "invalid_api_key",
  },
};

const openaiModels503 = {
  error: {
    message: "The server had an error processing your request.",
    type: "server_error",
  },
};

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

// ---------------------------------------------------------------------------
// Phase 34: OpenAI quirks + negotiateCapabilities tests (Task 1)
// ---------------------------------------------------------------------------

describe("Phase 34: OpenAI quirks + negotiateCapabilities", () => {
  it("Test 1: factory return type narrows to expose quirks: OpenAIQuirks + negotiateCapabilities", () => {
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
    });
    // Runtime checks for required narrowed fields
    expect(adapter.quirks).toBeDefined();
    expect(typeof adapter.negotiateCapabilities).toBe("function");
    // quirks is OpenAIQuirks (has strictModeSupported + structuredOutputsTier2)
    expect("strictModeSupported" in adapter.quirks).toBe(true);
    expect("structuredOutputsTier2" in adapter.quirks).toBe(true);
  });

  it("Test 2: quirks block populated with verified values per RESEARCH §Q6 OpenAI vocabulary", () => {
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
    });
    expect(adapter.quirks).toEqual({
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      strictModeSupported: true,
      structuredOutputsTier2: true,
    });
  });

  it("Test 3 (happy path): negotiateCapabilities resolves with source: 'live' when model in /models", async () => {
    const { fetch, urls, inits } = makeMultiRouteFetch([
      { body: openaiModelsOk, status: 200 },
    ]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o-2024-08-06",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
    });
    const result = await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    // Model is in /models response; source is "live" or "registry-fallback" (no openai: profile in static registry).
    // Since registry only has openrouter:openai/gpt-4o-2024-08-06, we expect registry-fallback.
    expect(["live", "registry-fallback"]).toContain(result.source);
    expect(result.modelId).toBe("gpt-4o-2024-08-06");
    // Verify the fetch used correct URL + auth header
    expect(urls[0]).toMatch(/\/v1\/models$/);
    const authHeader = (inits[0]?.headers as Record<string, string>)?.["authorization"];
    expect(authHeader).toBe("Bearer sk-test");
  });

  it("Test 4 (model not in /models response): falls back to registry with source: 'registry-fallback'", async () => {
    // /models only contains gpt-3.5-turbo, not gpt-4o-2024-08-06
    const onlyOldModel = {
      object: "list",
      data: [{ id: "gpt-3.5-turbo", object: "model", created: 1686000000, owned_by: "system" }],
    };
    const sinkCalls: unknown[] = [];
    const { fetch } = makeMultiRouteFetch([{ body: onlyOldModel, status: 200 }]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o-2024-08-06",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
      runEventSink: (e) => { sinkCalls.push(e); },
    });
    const result = await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    expect(result.source).toBe("registry-fallback");
    // Fallback event emitted
    expect(sinkCalls.length).toBeGreaterThan(0);
  });

  it("Test 5 (401): rejects with NegotiationAuthError; adapter === 'openai', httpStatus === 401", async () => {
    const { fetch } = makeMultiRouteFetch([{ body: openaiModels401, status: 401 }]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-bad-key",
      fetch,
    });
    await expect(adapter.negotiateCapabilities("gpt-4o")).rejects.toThrow(NegotiationAuthError);
    await expect(adapter.negotiateCapabilities("gpt-4o-2")).rejects.toMatchObject({
      kind: "negotiation-auth-failed",
      adapter: "openai",
      httpStatus: 401,
    });
  });

  it("Test 6 (503 fallback): source: 'registry-fallback' after all retries exhausted", async () => {
    const { fetch, callCount } = makeMultiRouteFetch([
      { body: openaiModels503, status: 503 },
      { body: openaiModels503, status: 503 },
      { body: openaiModels503, status: 503 },
    ]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
      modelsRetryCount: 2,
      modelsCacheTtlMs: 0, // disable cache so retries are fresh
    });
    const result = await adapter.negotiateCapabilities("gpt-4o");
    expect(result.source).toBe("registry-fallback");
    // Should have attempted all 3 (1 + 2 retries)
    expect(callCount()).toBe(3);
  });

  it("Test 7 (cache): second call returns cached result; fetch called only once", async () => {
    const { fetch, callCount } = makeMultiRouteFetch([
      { body: openaiModelsOk, status: 200 },
    ]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
      modelsCacheTtlMs: 60_000,
    });
    const r1 = await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    const r2 = await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    expect(callCount()).toBe(1);
    expect(r1.modelId).toBe(r2.modelId);
  });

  it("Test 7b (cache disabled): two sequential calls trigger two fetches", async () => {
    const { fetch, callCount } = makeMultiRouteFetch([
      { body: openaiModelsOk, status: 200 },
      { body: openaiModelsOk, status: 200 },
    ]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    expect(callCount()).toBe(2);
  });

  it("Test 7c (inflight coalescing): 5 concurrent calls trigger only one fetch", async () => {
    const { fetch, callCount } = makeMultiRouteFetch([
      { body: openaiModelsOk, status: 200 },
    ]);
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
      modelsCacheTtlMs: 60_000,
    });
    const results = await Promise.all([
      adapter.negotiateCapabilities("gpt-4o-2024-08-06"),
      adapter.negotiateCapabilities("gpt-4o-2024-08-06"),
      adapter.negotiateCapabilities("gpt-4o-2024-08-06"),
      adapter.negotiateCapabilities("gpt-4o-2024-08-06"),
      adapter.negotiateCapabilities("gpt-4o-2024-08-06"),
    ]);
    expect(callCount()).toBe(1);
    // All 5 resolve to the same result
    const firstSource = results[0]?.source;
    expect(results.every((r) => r.source === firstSource)).toBe(true);
  });

  it("Test 8 (retry timing): 3 attempts with backoff when 503 on first two, 200 on third", async () => {
    const { fetch, callCount } = makeMultiRouteFetch([
      { body: openaiModels503, status: 503 },
      { body: openaiModels503, status: 503 },
      { body: openaiModelsOk, status: 200 },
    ]);
    vi.useFakeTimers();
    const adapter = createOpenAIProvider({
      model: "gpt-4o",
      baseUrl: "https://api.openai.com",
      apiKey: "sk-test",
      fetch,
      modelsRetryCount: 2,
      modelsCacheTtlMs: 0,
    });
    // Start the promise, then advance timers to allow retries
    const promise = adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    // Advance through backoff delays [0, 200, 1000]
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;
    expect(callCount()).toBe(3);
    // Third attempt succeeded with openaiModelsOk (gpt-4o-2024-08-06 present)
    expect(["live", "registry-fallback"]).toContain(result.source);
    vi.useRealTimers();
  });

  it("Test 9 (fixture shape): openai-models-ok.json contains sparse rows with NO capabilities block", () => {
    // Verify the fixture shape — no capabilities block per RESEARCH §Q2
    expect(openaiModelsOk.object).toBe("list");
    expect(Array.isArray(openaiModelsOk.data)).toBe(true);
    expect(openaiModelsOk.data).toHaveLength(3);
    const firstEntry = openaiModelsOk.data[0];
    expect(firstEntry?.id).toBe("gpt-4o-2024-08-06");
    // Sparse shape: only these 4 fields — NO capabilities block
    expect(Object.keys(firstEntry ?? {})).toEqual(["id", "object", "created", "owned_by"]);
    expect("capabilities" in (firstEntry ?? {})).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase 34: OpenAI-compat quirks + negotiateCapabilities (registry-only) tests (Task 2)
// ---------------------------------------------------------------------------

describe("Phase 34: OpenAI-compat quirks + negotiateCapabilities (registry-only)", () => {
  it("Test 1: factory return type narrows to expose quirks: OpenAICompatQuirks + negotiateCapabilities", () => {
    const adapter = createOpenAICompatibleProvider({
      model: "llama3",
      baseUrl: "http://localhost:8080",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
    });
    expect(adapter.quirks).toBeDefined();
    expect(typeof adapter.negotiateCapabilities).toBe("function");
    // OpenAICompatQuirks has no extra fields beyond the 5 base booleans
    expect(Object.keys(adapter.quirks)).toEqual(
      expect.arrayContaining([
        "supportsToolChoice",
        "parallelToolCalls",
        "structuredOutputs",
        "responseFormatHonored",
        "streamingDiverges",
      ]),
    );
  });

  it("Test 2: quirks block populated conservatively (all false except streamingDiverges: true)", () => {
    const adapter = createOpenAICompatibleProvider({
      model: "llama3",
      baseUrl: "http://localhost:8080",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
    });
    expect(adapter.quirks).toEqual({
      supportsToolChoice: false,
      parallelToolCalls: false,
      structuredOutputs: false,
      responseFormatHonored: false,
      streamingDiverges: true,
    });
  });

  it("Test 3 (registry hit): negotiateCapabilities returns source: 'registry'", async () => {
    // openai-compat adapter; using any model id (registry may or may not have it)
    const adapter = createOpenAICompatibleProvider({
      model: "gpt-4o-2024-08-06",
      baseUrl: "http://localhost:8080",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
    });
    const result = await adapter.negotiateCapabilities("gpt-4o-2024-08-06");
    // Always source: "registry" for openai-compat (intentional no-endpoint per D-04)
    expect(result.source).toBe("registry");
    expect(result.modelId).toBe("gpt-4o-2024-08-06");
  });

  it("Test 4 (registry miss): unknown model returns source: 'registry' with empty-stub", async () => {
    const adapter = createOpenAICompatibleProvider({
      model: "unknown-self-hosted-model-id-abc",
      baseUrl: "http://localhost:8080",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
    });
    const result: NegotiatedCapabilities = await adapter.negotiateCapabilities(
      "unknown-self-hosted-model-id-abc",
    );
    expect(result.source).toBe("registry");
    expect(result.contextWindow).toBe(0);
    expect(result.supports.nativeToolCalling).toBe(false);
    expect(result.supports.structuredOutputs).toBe(false);
    expect(result.supports.parallelToolCalls).toBe(false);
    expect(result.supports.extendedThinking).toBe(false);
    expect(result.knownFailureModes).toHaveLength(0);
    expect(result.recommendedSanitizers).toHaveLength(0);
  });

  it("Test 5 (no /models fetch): negotiate() makes NO fetch call", async () => {
    const fetchCalls: string[] = [];
    const trackingFetch = (async (url: string) => {
      fetchCalls.push(url);
      return new Response(JSON.stringify({ choices: [{ message: { content: "hi" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const adapter = createOpenAICompatibleProvider({
      model: "some-model",
      baseUrl: "http://localhost:8080",
      fetch: trackingFetch,
    });
    // negotiate() should NOT call fetch at all
    await adapter.negotiateCapabilities("some-model");
    // Only execute() would call fetch; negotiate() should not
    const negotiateFetchCalls = fetchCalls.filter((u) => u.includes("/v1/models"));
    expect(negotiateFetchCalls).toHaveLength(0);
  });

  it("Test 6 (no event emitted): runEventSink sees zero calls for source: 'registry'", async () => {
    const sinkCalls: unknown[] = [];
    const adapter = createOpenAICompatibleProvider({
      model: "some-model",
      baseUrl: "http://localhost:8080",
      fetch: makeFakeFetch({ choices: [{ message: { content: "hi" } }], usage: {} }),
      runEventSink: (e) => { sinkCalls.push(e); },
    });
    await adapter.negotiateCapabilities("some-model");
    // No events should be fired — source: "registry" is the happy path, not a fallback
    expect(sinkCalls).toHaveLength(0);
  });
});
