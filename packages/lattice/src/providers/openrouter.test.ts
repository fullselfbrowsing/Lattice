import { describe, expect, it } from "vitest";
import { createOpenRouterProvider } from "./openrouter.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import { NegotiationAuthError } from "../capabilities/negotiate.js";
import type { RunEvent } from "../tracing/tracing.js";

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

/**
 * Multi-URL fake fetch for negotiate tests that receive multiple requests
 * (e.g., retry sequences, cache tests).
 */
interface MultiCapture {
  urls: string[];
  inits: RequestInit[];
}

function makeMultiFetch(responses: Array<{ body: unknown; status?: number }>): {
  fetch: typeof fetch;
  capture: MultiCapture;
} {
  const capture: MultiCapture = { urls: [], inits: [] };
  let callCount = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.urls.push(url);
    capture.inits.push(init);
    const resp = responses[callCount] ?? responses[responses.length - 1]!;
    callCount += 1;
    return new Response(JSON.stringify(resp.body), {
      status: resp.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

const HAPPY_BODY = {
  choices: [{ message: { content: "hello openrouter" } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

// Load fixtures
import openrouterModelsOk from "../../test/__fixtures__/quirks/openrouter-models-ok.json";
import openrouterModels503 from "../../test/__fixtures__/quirks/openrouter-models-503.json";

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

describe("Phase 34: OpenRouter quirks + negotiateCapabilities", () => {
  it("Test 1: factory return narrows to expose quirks: OpenRouterQuirks + negotiateCapabilities", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    // quirks must be an object (not undefined)
    expect(adapter.quirks).toBeDefined();
    expect(typeof adapter.quirks).toBe("object");
    // negotiateCapabilities must be a function
    expect(typeof adapter.negotiateCapabilities).toBe("function");
  });

  it("Test 2: quirks block populated with 8 verified values per RESEARCH §Q6 OpenRouter vocabulary", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    expect(adapter.quirks.supportsToolChoice).toBe(true);
    expect(adapter.quirks.parallelToolCalls).toBe(true);
    expect(adapter.quirks.structuredOutputs).toBe(true);
    expect(adapter.quirks.responseFormatHonored).toBe(true);
    expect(adapter.quirks.streamingDiverges).toBe(false);
    expect(adapter.quirks.providerRoutingArraySupported).toBe(true);
    expect(adapter.quirks.floorPricingHints).toBe(true);
    expect(adapter.quirks.allowFallbacks).toBe(true);
  });

  it("Test 3: NO auth header sent -- Anti-pattern check (RESEARCH §Anti-pattern lines 534-535)", async () => {
    // CRITICAL: OpenRouter /api/v1/models is unauthenticated. Do NOT send Authorization header.
    const { fetch: fakeFetch, capture } = makeMultiFetch([
      { body: openrouterModelsOk, status: 200 },
    ]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-should-not-appear-in-models-call",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });
    await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");

    // Headers must NOT contain Authorization (neither capitalized nor lowercase)
    const headers = capture.inits[0]?.headers as Record<string, string> | undefined;
    expect(headers).toBeDefined();
    if (headers !== undefined) {
      // Case-sensitive check (RESEARCH §Anti-pattern)
      expect(Object.keys(headers)).not.toContain("Authorization");
      expect(Object.keys(headers)).not.toContain("authorization");
    }
  });

  it("Test 4 (ANCHOR CASE STUDY session_1780792387779): openai/gpt-oss-120b:free yields recommendedSanitizers: ['unwrapInternalEnvelope']", async () => {
    const { fetch: fakeFetch } = makeMultiFetch([{ body: openrouterModelsOk, status: 200 }]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });

    const result = await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");

    // Anchor case study assertions (session_1780792387779)
    expect(result.modelId).toBe("openai/gpt-oss-120b:free"); // verbatim input modelId preserved
    expect(result.source).toBe("live");
    expect(result.contextWindow).toBe(131072); // from top_provider.context_length in fixture
    expect(result.knownFailureModes).toContain("internal_envelope_leak");
    expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
  });

  it("Test 5: variant suffix-strip -- openai/gpt-oss-120b (no :free) also resolves via same registry profile", async () => {
    const { fetch: fakeFetch } = makeMultiFetch([{ body: openrouterModelsOk, status: 200 }]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });

    // The fixture has "openai/gpt-oss-120b:free" and stripOpenRouterVariant maps
    // "openai/gpt-oss-120b" -> "openai/gpt-oss-120b" (no suffix to strip); BUT both
    // use canonicalKey "openrouter:openai/gpt-oss-120b" for registry lookup.
    const result = await adapter.negotiateCapabilities("openai/gpt-oss-120b");
    expect(result.modelId).toBe("openai/gpt-oss-120b"); // verbatim (no suffix)
    expect(result.source).toBe("live");
    // Same registry profile -- same failure modes
    expect(result.knownFailureModes).toContain("internal_envelope_leak");
    expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
  });

  it("Test 6: id NOT in /models response -- registry-fallback; still resolves failure modes from registry", async () => {
    // Fixture contains only: gpt-oss-120b:free, anthropic/claude-3.5-sonnet, openai/gpt-4o
    // A model NOT in the fixture falls back to registry
    const { fetch: fakeFetch } = makeMultiFetch([{ body: openrouterModelsOk, status: 200 }]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });

    // Ask for a model NOT in the fixture
    const result = await adapter.negotiateCapabilities("openai/gpt-oss-20b");
    // Not found in /models -> registry-fallback
    expect(result.source).toBe("registry-fallback");
    // Registry has openrouter:openai/gpt-oss-20b with same failure modes
    expect(result.knownFailureModes).toContain("internal_envelope_leak");
    expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
  });

  it("Test 7: cache hit -- two sequential calls; fetch called once", async () => {
    const { fetch: fakeFetch, capture } = makeMultiFetch([
      { body: openrouterModelsOk, status: 200 },
      { body: openrouterModelsOk, status: 200 },
    ]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 60_000, // 1 minute cache
    });
    const r1 = await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");
    const r2 = await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");
    // Second call should use cache -- fetch only called once
    expect(capture.urls.length).toBe(1);
    expect(r1.contextWindow).toBe(r2.contextWindow);
  });

  it("Test 7 (inflight coalescing): 5 concurrent calls; fetch called once", async () => {
    const { fetch: fakeFetch, capture } = makeMultiFetch([
      { body: openrouterModelsOk, status: 200 },
    ]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 60_000,
    });
    const results = await Promise.all([
      adapter.negotiateCapabilities("openai/gpt-oss-120b:free"),
      adapter.negotiateCapabilities("openai/gpt-oss-120b:free"),
      adapter.negotiateCapabilities("openai/gpt-oss-120b:free"),
      adapter.negotiateCapabilities("openai/gpt-oss-120b:free"),
      adapter.negotiateCapabilities("openai/gpt-oss-120b:free"),
    ]);
    // Inflight coalescing: only 1 fetch despite 5 concurrent calls
    expect(capture.urls.length).toBe(1);
    // All 5 resolve to same contextWindow
    const ctxs = results.map((r) => r.contextWindow);
    expect(new Set(ctxs).size).toBe(1);
  });

  it("Test 8: 503 fallback -- returns registry-fallback + emits event", async () => {
    const events: RunEvent[] = [];
    const { fetch: fakeFetch } = makeMultiFetch([
      { body: openrouterModels503, status: 503 },
    ]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
      modelsRetryCount: 0,
      runEventSink: (ev) => { events.push(ev); },
    });
    const result = await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");
    expect(result.source).toBe("registry-fallback");
    // RunEvent emitted (1 fallback event)
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.kind).toBe("capabilities.negotiation.fallback");
    expect(events[0]?.metadata?.adapter).toBe("openrouter");
    // Even on fallback, registry profile provides failure modes
    expect(result.knownFailureModes).toContain("internal_envelope_leak");
    expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
  });

  it("Test 9: lenient parse -- missing top_provider.context_length falls through to context_length", async () => {
    // Create a fixture variant without top_provider.context_length
    const fixtureWithoutTopProviderContextLength = {
      data: [
        {
          id: "openai/gpt-oss-120b:free",
          context_length: 99999,
          // top_provider has no context_length
          top_provider: {
            max_completion_tokens: 4096,
          },
          supported_parameters: ["tools", "tool_choice"],
        },
      ],
    };

    const { fetch: fakeFetch } = makeMultiFetch([
      { body: fixtureWithoutTopProviderContextLength, status: 200 },
    ]);
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b:free",
      apiKey: "sk-or-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });
    const result = await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");
    // Falls through to context_length (Pitfall 3 / A1 precedence chain)
    expect(result.contextWindow).toBe(99999);
    expect(result.source).toBe("live");
  });
});
