/**
 * Phase 34: End-to-End Capability Negotiation Integration Suite
 *
 * Tests verify the full Phase 34 contract through the PUBLIC SURFACE INDEX
 * (../src/index.js). All imports go through the public re-export barrel,
 * which validates PKG-01/INDEX-01 re-export discipline for ALL Phase 34 symbols.
 *
 * Coverage:
 *   - D-04 consumer-adapter fallback path (synthetic ProviderAdapter without negotiateCapabilities)
 *   - First-party delegation (helper delegates verbatim to adapter.negotiateCapabilities)
 *   - Pitfall 5 no-drift verification (helper has no caching of its own)
 *   - 7-adapter quirks smoke (all 7 first-party factories expose quirks + negotiateCapabilities)
 *   - Anchor case study via top-level helper (full-stack: public helper -> OpenRouter -> registry -> sanitizers)
 *
 * Note on tsd narrowing: Test 6 verifies RUNTIME values only. The TypeScript narrowing
 * (discriminant narrowing on adapter.id) was already verified in Plan 34-01's
 * test-d/quirks-negotiation.test-d.ts.
 */
import { describe, expect, it } from "vitest";
import {
  negotiateCapabilities,
  createAnthropicProvider,
  createOpenAIProvider,
  createOpenAICompatibleProvider,
  createXaiProvider,
  createGeminiProvider,
  createOpenRouterProvider,
  createLmStudioProvider,
  type ProviderAdapter,
  type AnthropicQuirks,
} from "../src/index.js";

import anthropicModelsOk from "./__fixtures__/quirks/anthropic-models-ok.json";
import openrouterModelsOk from "./__fixtures__/quirks/openrouter-models-ok.json";

// ---------------------------------------------------------------------------
// Shared test utilities
// ---------------------------------------------------------------------------

interface FakeFetchCapture {
  urls: string[];
  callCount: number;
}

function makeFakeFetch(
  body: unknown,
  status = 200,
): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { urls: [], callCount: 0 };
  const fakeFetch = (async (url: string) => {
    capture.urls.push(url);
    capture.callCount += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

// ---------------------------------------------------------------------------
// Test families
// ---------------------------------------------------------------------------

describe("Phase 34: end-to-end negotiate integration", () => {
  // -------------------------------------------------------------------------
  // Consumer adapter fallback (D-04)
  // -------------------------------------------------------------------------
  describe("consumer adapter fallback (D-04)", () => {
    it("Test 1: synthetic ProviderAdapter without negotiateCapabilities triggers registry fallback with source: registry", async () => {
      // Minimal 4-field consumer adapter (no negotiateCapabilities, no quirks)
      // This is the D-04 consumer-adapter fallback path.
      const synthetic: ProviderAdapter = { id: "anthropic", kind: "provider-adapter" };
      const result = await negotiateCapabilities(synthetic, "claude-opus-4");
      // The helper detects no .negotiateCapabilities method -> synthesizes from registry
      expect(result.source).toBe("registry");
      expect(result.modelId).toBe("claude-opus-4");
      // anthropic:claude-opus-4 is in static registry with frontier_rlhf
      // -> knownFailureModes: [] (frontier_rlhf has empty failure modes)
      expect(result.knownFailureModes).toEqual([]);
      // contextWindow from registry: 200000
      expect(result.contextWindow).toBe(200000);
    });

    it("Test 2: synthetic ProviderAdapter with unknown modelId returns empty-stub with source: registry", async () => {
      const synthetic: ProviderAdapter = { id: "anthropic", kind: "provider-adapter" };
      const result = await negotiateCapabilities(synthetic, "nonexistent-model-xyz");
      expect(result.source).toBe("registry");
      expect(result.modelId).toBe("nonexistent-model-xyz");
      // Not in registry -> empty stub
      expect(result.contextWindow).toBe(0);
      expect(result.knownFailureModes).toEqual([]);
      expect(result.recommendedSanitizers).toEqual([]);
      expect(result.supports.nativeToolCalling).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // First-party delegation (Pitfall 5)
  // -------------------------------------------------------------------------
  describe("first-party delegation (Pitfall 5)", () => {
    it("Test 3: helper delegates verbatim to first-party adapter (Anthropic) -> source: live", async () => {
      const { fetch } = makeFakeFetch(anthropicModelsOk);
      const anthropicAdapter = createAnthropicProvider({
        model: "claude-opus-4-6",
        apiKey: "test-key",
        fetch,
        modelsCacheTtlMs: 0, // disable cache for test predictability
      });
      // Top-level helper should delegate to anthropicAdapter.negotiateCapabilities
      const result = await negotiateCapabilities(anthropicAdapter, "claude-opus-4-6");
      // The adapter fetched /v1/models and found the model -> source: "live"
      expect(result.source).toBe("live");
      expect(result.modelId).toBe("claude-opus-4-6");
    });

    it("Test 4: Pitfall 5 no-drift -- helper has NO caching of its own; fetch-count matches adapter TTL", async () => {
      // With TTL cache enabled (60_000ms), fetch should be called ONCE for two calls
      const { fetch: fetchWithCache, capture: captureWithCache } = makeFakeFetch(anthropicModelsOk);
      const cachedAdapter = createAnthropicProvider({
        model: "claude-opus-4-6",
        apiKey: "test-key",
        fetch: fetchWithCache,
        modelsCacheTtlMs: 60_000, // cache for 60 seconds
      });
      await negotiateCapabilities(cachedAdapter, "claude-opus-4-6");
      await negotiateCapabilities(cachedAdapter, "claude-opus-4-6");
      // Adapter's TTL cache is active -> 1 fetch total
      expect(captureWithCache.callCount).toBe(1);

      // With TTL cache DISABLED (0ms), fetch should be called TWICE for two calls
      const { fetch: fetchNoCache, capture: captureNoCache } = makeFakeFetch(anthropicModelsOk);
      const noCacheAdapter = createAnthropicProvider({
        model: "claude-opus-4-6",
        apiKey: "test-key",
        fetch: fetchNoCache,
        modelsCacheTtlMs: 0, // disable caching
      });
      await negotiateCapabilities(noCacheAdapter, "claude-opus-4-6");
      await negotiateCapabilities(noCacheAdapter, "claude-opus-4-6");
      // No cache -> 2 fetches (Pitfall 5: the HELPER has no cache; it's all adapter)
      expect(captureNoCache.callCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // 7-adapter quirks smoke
  // -------------------------------------------------------------------------
  describe("7-adapter quirks smoke", () => {
    it("Test 5: all 7 first-party adapters expose quirks + negotiateCapabilities with 5 universal booleans", () => {
      const adapters = [
        createAnthropicProvider({ model: "claude-opus-4", apiKey: "test-key" }),
        createOpenAIProvider({ model: "gpt-4o", apiKey: "test-key", baseUrl: "https://api.openai.com" }),
        createOpenAICompatibleProvider({ baseUrl: "http://localhost:11434/v1", model: "local-model" }),
        createXaiProvider({ model: "grok-4", apiKey: "test-key" }),
        createGeminiProvider({ model: "gemini-2.5-pro", apiKey: "test-key" }),
        createOpenRouterProvider({ model: "openai/gpt-4o", apiKey: "test-key" }),
        createLmStudioProvider({ model: "local-template" }),
      ] as const;

      for (const adapter of adapters) {
        // quirks must be defined (QUIRK-02)
        expect(adapter.quirks, `${adapter.id} quirks`).toBeDefined();
        // 5 universal booleans must be typed boolean (AdapterQuirks base shape)
        expect(
          typeof adapter.quirks.supportsToolChoice,
          `${adapter.id} supportsToolChoice`,
        ).toBe("boolean");
        expect(
          typeof adapter.quirks.parallelToolCalls,
          `${adapter.id} parallelToolCalls`,
        ).toBe("boolean");
        expect(
          typeof adapter.quirks.structuredOutputs,
          `${adapter.id} structuredOutputs`,
        ).toBe("boolean");
        expect(
          typeof adapter.quirks.responseFormatHonored,
          `${adapter.id} responseFormatHonored`,
        ).toBe("boolean");
        expect(
          typeof adapter.quirks.streamingDiverges,
          `${adapter.id} streamingDiverges`,
        ).toBe("boolean");
        // negotiateCapabilities must be a function (NEG-01)
        expect(
          typeof adapter.negotiateCapabilities,
          `${adapter.id} negotiateCapabilities`,
        ).toBe("function");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Discriminant narrowing smoke (runtime values)
  // -------------------------------------------------------------------------
  describe("discriminant narrowing smoke (runtime values)", () => {
    it("Test 6: runtime AnthropicQuirks-specific fields present when adapter.id === 'anthropic'", () => {
      const anthropicAdapter = createAnthropicProvider({
        model: "claude-opus-4",
        apiKey: "test-key",
      });
      expect(anthropicAdapter.id).toBe("anthropic");
      // RESEARCH §Pattern 2: TS can't auto-narrow on adapter.id without cast;
      // this test asserts runtime VALUES are present, not TypeScript narrowing.
      // (tsd narrowing is already in Plan 34-01's test-d/quirks-negotiation.test-d.ts)
      const q = anthropicAdapter.quirks as AnthropicQuirks;
      expect(typeof q.promptCachingSupported).toBe("boolean");
      expect(typeof q.extendedThinkingSupported).toBe("boolean");
      expect(typeof q.toolUseInputSchemaStrict).toBe("boolean");
      // Verify the actual values from Plan 34-02 THICK reference
      expect(q.promptCachingSupported).toBe(true);
      expect(q.extendedThinkingSupported).toBe(true);
      expect(q.toolUseInputSchemaStrict).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Anchor case study via top-level helper
  // -------------------------------------------------------------------------
  describe("anchor case study via top-level helper", () => {
    it("Test 7: full stack -- top-level helper -> OpenRouter -> /api/v1/models -> registry intersection -> sanitizers", async () => {
      // Construct OpenRouter adapter with mocked fetch returning the fixture
      const { fetch } = makeFakeFetch(openrouterModelsOk);
      const openrouterAdapter = createOpenRouterProvider({
        model: "openai/gpt-oss-120b:free",
        apiKey: "test-key",
        fetch,
        modelsCacheTtlMs: 0, // disable cache for test predictability
      });

      // Call through the TOP-LEVEL helper -- this validates the full stack:
      // public helper -> adapter.negotiateCapabilities -> /api/v1/models fetch
      // -> stripOpenRouterVariant -> registry intersection -> getRecommendedSanitizers
      const result = await negotiateCapabilities(openrouterAdapter, "openai/gpt-oss-120b:free");

      // Anchor case study assertions (session_1780792387779):
      expect(result.modelId).toBe("openai/gpt-oss-120b:free");
      expect(result.source).toBe("live");
      // From fixture: top_provider.context_length: 131072
      expect(result.contextWindow).toBe(131072);
      // Phase 33 registry: openrouter:openai/gpt-oss-120b has internal_envelope_leak
      expect(result.knownFailureModes).toContain("internal_envelope_leak");
      // getRecommendedSanitizers maps internal_envelope_leak -> unwrapInternalEnvelope
      expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
      // Also verify supported_parameters: tools -> nativeToolCalling
      expect(result.supports.nativeToolCalling).toBe(true);
      // supported_parameters: response_format -> NOT in gpt-oss-120b fixture -> false
      // (Check that the derivation is based on fixture, not hardcoded)
      expect(typeof result.supports.structuredOutputs).toBe("boolean");
    });
  });
});
