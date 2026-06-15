import type { ProviderAdapter } from "./provider.js";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from "./adapters.js";
import type { OpenRouterQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import {
  NegotiationAuthError,
  synthesizeNegotiatedCapabilitiesFromRegistry,
} from "../capabilities/negotiate.js";
import { getCapabilityProfile, stripOpenRouterVariant } from "../capabilities/lookup.js";
import { getRecommendedSanitizers } from "../capabilities/sanitizer-recommendations.js";
import type { RunEventSink } from "../tracing/tracing.js";
import { createRunEvent } from "../tracing/tracing.js";

/**
 * Options for {@link createOpenRouterProvider}.
 *
 * Thin wrapper around {@link createOpenAICompatibleProvider} pinned to
 * OpenRouter's base URL `https://openrouter.ai/api/v1`. Wire shape is
 * OpenAI Chat Completions; no provider-specific quirks at the
 * single-shot Promise contract level.
 *
 * SECURITY: `apiKey` is a runtime parameter -- do NOT hardcode or log it.
 *
 * DEFERRED (D-17 carryforward; Phase 4 ships the named adapter as a
 * first-class OpenAI-compat wrapper):
 *   - model-routing array  -- caller supplies `model` (single id); OpenRouter's
 *                             `models: [primary, fallback, ...]` array
 *                             feature is deferred to a follow-on phase.
 *   - fallback-array       -- deferred (same phase as model-routing).
 *   - per-message routing  -- deferred.
 *   - streaming            -- deferred (single-shot per CONTEXT.md D-06).
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-03: thin wrapper; D-17: model-routing deferred).
 */
export interface OpenRouterProviderOptions
  extends Omit<OpenAICompatibleProviderOptions, "id" | "baseUrl"> {
  readonly id?: string;
  /** Defaults to `https://openrouter.ai/api/v1`. Override for proxies. */
  readonly baseUrl?: string;
  /**
   * D-08: TTL for per-instance /models response cache, in milliseconds.
   * Default: 300_000ms (5 minutes). 0 = always refetch (tests). Infinity = process-lifetime.
   */
  readonly modelsCacheTtlMs?: number;
  /**
   * D-11: Number of retries on transient /models fetch errors. Default: 2.
   * Retry schedule: immediate + 200ms + 1000ms (3 total attempts at retryCount=2).
   * 0 = no retries (1 attempt total).
   */
  readonly modelsRetryCount?: number;
  /**
   * D-12: Optional event sink for observability. When provided, the adapter
   * emits a "capabilities.negotiation.fallback" RunEvent on transient /models failure.
   * If absent, no event is emitted (silent fallback).
   */
  readonly runEventSink?: RunEventSink;
  /**
   * Ordered OpenRouter model fallback candidates. The primary `model` remains
   * the Lattice-selected route; these candidates serialize as OpenRouter's
   * top-level `models` request field when non-empty.
   */
  readonly fallbackModels?: readonly string[];
}

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function normalizeFallbackModels(models: readonly string[] | undefined): readonly string[] | undefined {
  if (models === undefined) return undefined;
  const normalized = models.map((model) => model.trim()).filter((model) => model.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function observedModelFromRawResponse(rawResponse: unknown): string | undefined {
  if (typeof rawResponse !== "object" || rawResponse === null || Array.isArray(rawResponse)) {
    return undefined;
  }
  const model = (rawResponse as Record<string, unknown>).model;
  return typeof model === "string" ? model : undefined;
}

/**
 * Phase 34 — D-03 — OpenRouter quirks block. Values verified against
 * OpenRouter API documentation and observed behavior.
 *
 * CITED: https://openrouter.ai/docs/provider-routing
 *   - providerRoutingArraySupported: provider.order/only/ignore arrays for explicit routing
 * CITED: https://openrouter.ai/docs pricing / sort options
 *   - floorPricingHints: max_price, sort: "throughput" | "price" hints for cost-aware routing
 * CITED: https://openrouter.ai/docs allow_fallbacks
 *   - allowFallbacks: provider.allow_fallbacks boolean controls upstream-provider fallback behavior
 */
const OPENROUTER_QUIRKS: OpenRouterQuirks = {
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  providerRoutingArraySupported: true,  // CITED: openrouter.ai/docs provider routing order/only/ignore
  floorPricingHints: true,              // CITED: openrouter.ai/docs max_price / sort: "throughput" | "price"
  allowFallbacks: true,                 // CITED: openrouter.ai/docs allow_fallbacks boolean
};

/**
 * Phase 34 — D-03 / D-05..D-12 — Extended OpenRouter provider factory.
 *
 * Returns a `ProviderAdapter` narrowed to expose:
 *   - `quirks: OpenRouterQuirks` — static adapter capability flags (8 booleans)
 *   - `negotiateCapabilities(modelId)` — live /api/v1/models fetch with rich /models
 *     intersection (supported_parameters -> nativeToolCalling + structuredOutputs,
 *     top_provider.context_length -> contextWindow) intersected with Phase 33 registry
 *     for knownFailureModes + recommendedSanitizers.
 *
 * CRITICAL for ANCHOR CASE STUDY (session_1780792387779):
 *   negotiate("openai/gpt-oss-120b:free") MUST resolve to:
 *     - result.knownFailureModes.includes("internal_envelope_leak") -> TRUE
 *     - result.recommendedSanitizers.includes("unwrapInternalEnvelope") -> TRUE
 *     - result.source === "live" -> TRUE
 *   This proves: live-fetch -> id suffix-strip via stripOpenRouterVariant
 *   -> registry intersection -> getRecommendedSanitizers derivation.
 *
 * Anti-pattern (RESEARCH §Anti-pattern, lines 534-535):
 *   The /api/v1/models endpoint is UNAUTHENTICATED (public discovery surface verified
 *   Phase 33). Do NOT send Authorization Bearer to this endpoint -- it is NOT required
 *   and would add unnecessary API key exposure surface in transit logs.
 */
export function createOpenRouterProvider(
  options: OpenRouterProviderOptions,
): ProviderAdapter & {
  readonly quirks: OpenRouterQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const baseUrl = (options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL).replace(/\/$/u, "");
  const fetchImpl = options.fetch ?? fetch;
  const fallbackModels = normalizeFallbackModels(options.fallbackModels);

  // D-05/D-06: per-instance cache and inflight Maps. Live inside the closure so
  // each createOpenRouterProvider({}) call gets its own Map (no cross-contamination).
  const ttlMs = options.modelsCacheTtlMs ?? 300_000;
  const retryCount = options.modelsRetryCount ?? 2;
  const cache = new Map<string, { result: NegotiatedCapabilities; expiresAt: number }>();
  const inflight = new Map<string, Promise<NegotiatedCapabilities>>();

  /**
   * D-07 lazy expiry + Q7 inflight coalescing + Pitfall 4 .finally cleanup.
   * Public surface: `adapter.negotiateCapabilities(modelId)`.
   */
  async function negotiate(modelId: string): Promise<NegotiatedCapabilities> {
    // 1. Cache check (D-07 lazy expiry)
    const cached = cache.get(modelId);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.result;

    // 2. Inflight coalesce (Q7)
    const existing = inflight.get(modelId);
    if (existing !== undefined) return existing;

    // 3. New fetch promise; clear inflight in .finally (Pitfall 4)
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) {
          cache.set(modelId, { result, expiresAt: Date.now() + ttlMs });
        }
        return result;
      } finally {
        inflight.delete(modelId);
      }
    })();

    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }

  /**
   * Phase 34 — D-09..D-11 — Fetches /api/v1/models and merges with registry.
   *
   * URL: ${baseUrl}/api/v1/models (NOTE: /api/v1/models -- different prefix from
   *   OpenAI's /v1/models; OpenRouter's discovery endpoint is under /api/v1/)
   * Auth: NONE -- OpenRouter /api/v1/models is a public unauthenticated endpoint.
   *   Per RESEARCH §Anti-pattern (lines 534-535): do NOT send Authorization Bearer
   *   to this endpoint. This is a known anti-pattern; do not "fix" it.
   * Retry: [0ms, 200ms, 1000ms] backoff on transient errors (D-11).
   * Auth error (401/403): throws NegotiationAuthError (D-10, no fallback) -- defensive,
   *   even though the endpoint is unauthenticated today, OpenRouter may add auth later.
   * Transient error (5xx/network): falls back to registry with "registry-fallback" (D-09).
   */
  async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
    // NOTE: URL is /api/v1/models (NOT /v1/models -- OpenRouter uses /api/v1/ prefix)
    const url = `${baseUrl}/api/v1/models`;
    // Anti-pattern guard: NO Authorization header on this call.
    // RESEARCH §Anti-pattern (lines 534-535): OpenRouter /api/v1/models is unauthenticated.
    // Sending Bearer here would expose the API key unnecessarily.
    const headers: Record<string, string> = {
      "accept": "application/json",
    };

    const attempts = retryCount + 1;
    const backoffSchedule = [0, 200, 1000];
    let lastErr: unknown;

    for (let i = 0; i < attempts; i += 1) {
      const delay = backoffSchedule[i] ?? 1000;
      if (delay > 0) {
        await new Promise<void>((r) => setTimeout(r, delay));
      }
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(30_000),
        });

        if (resp.status === 401 || resp.status === 403) {
          // Defensive: even though the endpoint is unauthenticated today, treat
          // auth errors as fatal per D-10 (same as other adapters)
          throw new NegotiationAuthError(
            "openrouter",
            modelId,
            resp.status as 401 | 403,
            `OpenRouter /api/v1/models returned ${resp.status}.`,
          );
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const body: unknown = await resp.json();
        return mergeOpenRouterModelsWithRegistry(modelId, body);
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err; // D-10: auth never falls back
        lastErr = err;
      }
    }

    // All retries exhausted -- fallback + event (D-09/D-12)
    emitFallbackEvent({
      adapter: "openrouter",
      modelId,
      errorReason: stringifyErr(lastErr),
      fallbackSource: "registry-fallback",
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("openrouter", modelId, "registry-fallback");
  }

  /**
   * RICH /models intersection: consumes OpenRouter's /api/v1/models structured data
   * to populate NegotiatedCapabilities.supports.* from upstream (THICK derivation where
   * available), then intersects with Phase 33 registry for knownFailureModes +
   * recommendedSanitizers.
   *
   * ANCHOR CASE STUDY (session_1780792387779) flow:
   *   1. Find "openai/gpt-oss-120b:free" (or strip suffix -> "openai/gpt-oss-120b")
   *   2. Build canonical key: "openrouter:openai/gpt-oss-120b" (via stripOpenRouterVariant)
   *   3. getCapabilityProfile("openrouter:openai/gpt-oss-120b") -> Phase 33 profile with
   *      knownFailureModes: ["internal_envelope_leak", "system_prompt_echo", "malformed_tool_arguments"]
   *   4. getRecommendedSanitizers(knownFailureModes) -> ["unwrapInternalEnvelope"]
   *   5. result.recommendedSanitizers.includes("unwrapInternalEnvelope") -> TRUE
   *
   * Pitfall 3 / A1 precedence chain (RESEARCH §Q5):
   *   contextWindow = top_provider.context_length ?? context_length ?? registryProfile.contextWindow
   *
   * Lenient parsing per Pitfall 1: all field accesses use optional chaining.
   */
  function mergeOpenRouterModelsWithRegistry(
    modelId: string,
    body: unknown,
  ): NegotiatedCapabilities {
    const rows = (body as Record<string, unknown>)?.data;

    // Lenient model search: match by exact id OR by suffix-stripped id.
    // Also matches entries in /models whose id, when stripped, matches the canonical id.
    // Examples:
    //   "openai/gpt-oss-120b:free" -> matches row with id "openai/gpt-oss-120b:free" (exact)
    //   "openai/gpt-oss-120b"      -> matches row with id "openai/gpt-oss-120b" (exact) OR
    //                                 "openai/gpt-oss-120b:free" (strip then compare)
    const found = Array.isArray(rows)
      ? (rows as unknown[]).find((m: unknown) => {
          const rec = m as Record<string, unknown>;
          if (typeof rec?.id !== "string") return false;
          const rowId = rec.id;
          // Direct match or suffix-stripped modelId matches row id
          if (rowId === modelId || rowId === stripOpenRouterVariant(modelId)) return true;
          // Row's suffix-stripped id matches the stripped query id (handles base-form queries
          // against :free/:thinking variant rows in the /models response)
          const strippedModelId = stripOpenRouterVariant(modelId);
          const strippedRowId = stripOpenRouterVariant(rowId);
          return strippedRowId === strippedModelId;
        })
      : undefined;

    // Build canonical registry key using suffix-strip (D-11 via stripOpenRouterVariant from Phase 33)
    // "openai/gpt-oss-120b:free" -> "openai/gpt-oss-120b" -> "openrouter:openai/gpt-oss-120b"
    const stripped = stripOpenRouterVariant(modelId);
    const canonicalKey = `openrouter:${stripped}`;
    const registryProfile = getCapabilityProfile(canonicalKey);

    if (found === undefined) {
      // Model not found in /api/v1/models response -- treat as registry-fallback
      emitFallbackEvent({
        adapter: "openrouter",
        modelId,
        errorReason: "model not found in /api/v1/models response",
        fallbackSource: "registry-fallback",
      });
      // Still use registry intersection -- the registry may have the profile even
      // when /models didn't return it (Test 6 fallback case)
      return {
        ...synthesizeNegotiatedCapabilitiesFromRegistry("openrouter", stripped, "registry-fallback"),
        // Preserve the input modelId verbatim (per Test 4 acceptance criterion)
        modelId,
      };
    }

    const foundRec = found as Record<string, unknown>;
    const topProvider = foundRec.top_provider as Record<string, unknown> | undefined;

    // Pitfall 3 / A1 precedence chain: prefer top_provider.context_length, then context_length,
    // then registry (RESEARCH §Q5 verified against live OpenRouter data)
    const contextWindow =
      typeof topProvider?.context_length === "number" && topProvider.context_length > 0
        ? topProvider.context_length
        : typeof foundRec.context_length === "number" && foundRec.context_length > 0
          ? foundRec.context_length
          : (registryProfile?.contextWindow ?? 0);

    // THICK derivation from supported_parameters (RESEARCH §Q5)
    const supportedParams = Array.isArray(foundRec.supported_parameters)
      ? (foundRec.supported_parameters as unknown[]).map(String)
      : [];

    const nativeToolCalling = supportedParams.includes("tools");
    const structuredOutputs = supportedParams.includes("response_format");
    // parallelToolCalls: heuristic -- tool_choice implies parallel tool support
    const parallelToolCalls = supportedParams.includes("tool_choice");
    // extendedThinking: some OpenRouter rows expose reasoning or thinking parameter
    const extendedThinking =
      supportedParams.includes("reasoning") || supportedParams.includes("thinking");
    // streaming: OpenRouter supports streaming on virtually all models
    const streaming = true;

    // Registry intersection for failure modes + sanitizers (the ANCHOR CASE STUDY path)
    const knownFailureModes = registryProfile?.knownFailureModes ?? [];
    // getRecommendedSanitizers is the ONLY derivation path for recommendedSanitizers
    const recommendedSanitizers = getRecommendedSanitizers(knownFailureModes);

    return {
      // PRESERVE the input modelId verbatim (per Test 4 / anchor case study acceptance criteria)
      modelId,
      contextWindow,
      supports: {
        nativeToolCalling,
        structuredOutputs,
        parallelToolCalls,
        extendedThinking,
        streaming,
      },
      knownFailureModes,
      recommendedSanitizers,
      source: "live",
    };
  }

  /**
   * D-12: Emit capabilities.negotiation.fallback RunEvent via the optional sink.
   * SECURITY (T-34-04-02): stringifyErr extracts err.message only -- NOT err.stack
   * or JSON.stringify(headers), so the apiKey cannot leak into the event payload.
   * Synthetic runId pattern: negotiate happens outside a run; documented here.
   */
  function emitFallbackEvent(payload: {
    adapter: string;
    modelId: string;
    errorReason: string;
    fallbackSource: string;
  }): void {
    if (options.runEventSink === undefined) return;
    const event = createRunEvent("capabilities.negotiation.fallback", {
      runId: `negotiate-openrouter-${payload.modelId}`,
      providerId: options.id ?? "openrouter",
      modelId: payload.modelId,
      metadata: {
        adapter: payload.adapter,
        modelId: payload.modelId,
        errorReason: payload.errorReason,
        fallbackSource: payload.fallbackSource,
      },
    });
    void options.runEventSink(event);
  }

  // Create the underlying OpenAI-compat execute() adapter for chat completions
  const baseAdapter = createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "openrouter",
    baseUrl,
  });

  return {
    ...baseAdapter,
    quirks: OPENROUTER_QUIRKS,
    negotiateCapabilities: negotiate,
  };
}

/**
 * T-34-04-02: Returns err.message only -- NOT err.stack (which could include
 * headers or the apiKey via a fetch rejection), NOT JSON.stringify(err).
 */
function stringifyErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
