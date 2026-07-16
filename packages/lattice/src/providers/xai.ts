import type { ProviderAdapter, ProviderStream } from "./provider.js";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from "./adapters.js";
import type { XaiQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import {
  NegotiationAuthError,
  synthesizeNegotiatedCapabilitiesFromRegistry,
  _mapProfileToNegotiatedCapabilities,
} from "../capabilities/negotiate.js";
import { getCapabilityProfile } from "../capabilities/lookup.js";
import type { RunEventSink } from "../tracing/tracing.js";
import { createRunEvent } from "../tracing/tracing.js";

/**
 * Options for {@link createXaiProvider}.
 *
 * Thin wrapper around {@link createOpenAICompatibleProvider} pinned to
 * xAI's base URL `https://api.x.ai/v1`. The wire shape is identical to
 * OpenAI Chat Completions, with one provider-specific quirk preserved:
 * `response.usage.completion_tokens_details.reasoning_tokens` (xAI's
 * separate reasoning-token accounting; see FSB
 * `extension/ai/universal-provider.js:585-594` for the production reference).
 *
 * SECURITY: `apiKey` is a runtime parameter -- do NOT hardcode or log it.
 *
 * STREAMING (Phase 44): supported through the OpenAI-compatible stream path.
 *
 * DEFERRED (Phase 4 carryforward notes):
 *   - tool-streaming -- deferred
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter contract)
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-03 + D-07: thin wrapper; reasoning_tokens quirk preserved).
 *
 * Phase 34 additions:
 *   - `modelsCacheTtlMs?` — D-05/D-06/D-08; default 300_000ms; 0 disables; Infinity = process-lifetime
 *   - `modelsRetryCount?` — D-11; default 2; 0 disables retry
 *   - `runEventSink?`     — D-12; fires "capabilities.negotiation.fallback" on transient errors
 */
export interface XaiProviderOptions extends Omit<OpenAICompatibleProviderOptions, "id" | "baseUrl"> {
  readonly id?: string;
  /** Defaults to `https://api.x.ai/v1`. Override for proxies. */
  readonly baseUrl?: string;
}

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";

// ---------------------------------------------------------------------------
// Internal helpers (mirroring Plan 34-02 Anthropic reference implementation)
// ---------------------------------------------------------------------------

/**
 * Phase 34 — D-12 — Emit a "capabilities.negotiation.fallback" RunEvent if
 * a sink is provided. Uses a synthetic runId (negotiation is outside a run).
 *
 * T-34-03-01: errorReason uses stringifyErr (message only, not stack) to
 * prevent apiKey leaking via fetch error strings that may embed request headers.
 */
function emitFallbackEvent(
  sink: RunEventSink | undefined,
  payload: {
    readonly adapter: string;
    readonly modelId: string;
    readonly errorReason: string;
    readonly fallbackSource: "registry-fallback";
  },
): void {
  if (sink === undefined) return;
  const event = createRunEvent("capabilities.negotiation.fallback", {
    // Synthetic runId: negotiation happens outside a run context.
    // Pattern documented in Plan 34-02 (Anthropic reference impl).
    runId: `negotiate-${payload.adapter}-${payload.modelId}`,
    providerId: payload.adapter,
    modelId: payload.modelId,
    metadata: {
      adapter: payload.adapter,
      modelId: payload.modelId,
      errorReason: payload.errorReason,
      fallbackSource: payload.fallbackSource,
    },
  });
  void sink(event);
}

/**
 * Stringify an error for event metadata. Returns only the message (NOT the
 * stack) to prevent apiKey or sensitive header values from leaking into event
 * payloads via fetch errors that may embed the request init.
 * T-34-03-01 mitigation.
 */
function stringifyErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Phase 34 — QUIRK-02 / NEG-01 / NEG-02 — Merge an xAI /v1/models sparse
 * OpenAI-shaped response with the Phase 33 registry.
 *
 * RESEARCH §A1 (INFERRED): xAI's /v1/models shape is undocumented; the
 * endpoint is assumed to return an OpenAI-compatible sparse list based on
 * the shared OpenAI-compat wire format used for chat completions.
 * LENIENT-PARSE is mandatory per Pitfall 1 (RESEARCH §Q4): if xAI changes
 * their response shape, the adapter must not crash.
 *
 * CITED: Pitfall 1 — "When integrating with less-documented endpoints like
 * xAI's /v1/models, lenient parsing prevents runtime crashes when the
 * endpoint returns an unexpected shape."
 *
 * Source semantics per D-09:
 *   - "live" when the model id is found in the response AND body.data is an array
 *   - "registry-fallback" when body.data is not an array (unexpected shape)
 *     OR when the model id is not in the response
 */
function mergeXaiModelsWithRegistry(
  modelId: string,
  body: unknown,
  emitFallback: () => void,
): NegotiatedCapabilities {
  // LENIENT-PARSE: body may be malformed or have an unexpected shape (Pitfall 1 + RESEARCH §A1).
  // If body.data is not an array, fall back to registry immediately without crashing.
  const rawData = (body as { data?: unknown } | null | undefined)?.data;
  if (!Array.isArray(rawData)) {
    // xAI body shape unexpected — emit fallback and use registry
    emitFallback();
    return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
  }

  const found = (rawData as Array<unknown>).find(
    (m): m is { id: string } =>
      typeof m === "object" && m !== null && (m as { id?: unknown }).id === modelId,
  );

  if (found === undefined) {
    // Model not in /models response — emit fallback and use registry.
    emitFallback();
    return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
  }

  // Model found in /models response — source supports.* from registry profile.
  // xAI /models is sparse (OpenAI-shaped: id, object, created, owned_by only);
  // no capabilities block. Source supports.* from the Phase 33 registry instead.
  const registryProfile = getCapabilityProfile(`xai:${modelId}`);
  if (registryProfile !== undefined) {
    return _mapProfileToNegotiatedCapabilities(registryProfile, "live");
  }

  // Model exists in org per /models but Phase 33 registry doesn't have it.
  // Preserve the live model id instead of collapsing to a registry fallback.
  // This keeps new xAI/GitFly ids like grok-4-1-fast-* inspectable while
  // remaining conservative about capabilities we cannot prove from /models.
  return {
    modelId,
    contextWindow: 0,
    supports: {
      nativeToolCalling: true,
      structuredOutputs: true,
      parallelToolCalls: true,
      extendedThinking: false,
      streaming: true,
    },
    knownFailureModes: [],
    recommendedSanitizers: [],
    source: "live",
  };
}

/**
 * Phase 34 — QUIRK-02 / NEG-01 / NEG-02 — xAI provider factory.
 *
 * Extends the base OpenAI-compat execution wrapper with:
 *   1. `quirks: XaiQuirks` — verified per RESEARCH §Q6 xAI vocabulary.
 *   2. `negotiateCapabilities(modelId)` — queries xAI /v1/models GET with
 *      Authorization: Bearer header; LENIENT-PARSE sparse OpenAI-shaped
 *      response; intersects with Phase 33 registry for supports.*.
 *
 * CITED: RESEARCH §Q4 (INFERRED) — xAI /v1/models shape is undocumented;
 * assumed OpenAI-compatible based on the chat completions wire format.
 *
 * CITED: RESEARCH §A1 — Pitfall 1 lenient parse: if xAI publishes a
 * different /models shape, only the parsing logic updates; the contract
 * (source values, NegotiatedCapabilities shape) holds.
 *
 * The negotiate() pattern mirrors Plan 34-02 (Anthropic thick reference):
 *   - Per-instance TTL cache (modelsCacheTtlMs, default 300_000ms)
 *   - Single-flight inflight coalescing with .finally cleanup (Pitfall 4)
 *   - Retry with [0, 200, 1000]ms backoff (modelsRetryCount, default 2)
 *   - 401/403 throws NegotiationAuthError with adapter: "xai" (D-10)
 *   - 5xx/network/timeout falls back to registry + emits fallback event
 *
 * SECURITY (T-34-03-07): inflight Map MUST use .finally cleanup to prevent
 * leak on rejection. Verifiable: grep `.finally` in this file.
 */
export function createXaiProvider(
  options: XaiProviderOptions,
): ProviderAdapter & {
  readonly quirks: XaiQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const resolvedBaseUrl = (options.baseUrl ?? DEFAULT_XAI_BASE_URL).replace(/\/$/u, "");
  const ttlMs = options.modelsCacheTtlMs ?? 300_000;
  const retryCount = options.modelsRetryCount ?? 2;
  const fetchImpl = options.fetch ?? fetch;

  // Per-instance TTL cache (D-05/D-06/D-07/D-08). One Map per factory call.
  const cache = new Map<string, { result: NegotiatedCapabilities; expiresAt: number }>();
  // Per-instance inflight coalescing Map (Q7). .finally cleanup is mandatory (Pitfall 4).
  const inflight = new Map<string, Promise<NegotiatedCapabilities>>();

  async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
    // For xAI, the baseUrl already includes "/v1" (default: https://api.x.ai/v1),
    // so we append "/models" not "/v1/models". This produces: https://api.x.ai/v1/models.
    const url = `${resolvedBaseUrl}/models`;
    // IN-02: omit Authorization entirely when apiKey is undefined; sending
    // "Bearer " literal would trigger noisy 401s and intrusion-detection flags.
    // Mirrors the OpenAI-compat execute path (adapters.ts:137).
    const headers: Record<string, string> = {
      "accept": "application/json",
      ...(options.apiKey !== undefined ? { authorization: `Bearer ${options.apiKey}` } : {}),
    };
    const attempts = retryCount + 1;
    const backoffMs = [0, 200, 1000];
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      if (i > 0) {
        const delay = backoffMs[Math.min(i, backoffMs.length - 1)] ?? 1000;
        await new Promise<void>((r) => setTimeout(r, delay));
      }
      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(30_000),
        });
        if (resp.status === 401 || resp.status === 403) {
          throw new NegotiationAuthError(
            "xai",
            modelId,
            resp.status as 401 | 403,
            `xAI /v1/models returned ${resp.status}: check apiKey config.`,
          );
        }
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const body = await resp.json() as unknown;
        return mergeXaiModelsWithRegistry(modelId, body, () => {
          emitFallbackEvent(options.runEventSink, {
            adapter: "xai",
            modelId,
            errorReason: "model not found in /v1/models response or unexpected body shape",
            fallbackSource: "registry-fallback",
          });
        });
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err; // D-10: auth never retries
        lastErr = err;
      }
    }
    // All retries exhausted — transient fallback + event.
    emitFallbackEvent(options.runEventSink, {
      adapter: "xai",
      modelId,
      errorReason: stringifyErr(lastErr),
      fallbackSource: "registry-fallback",
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("xai", modelId, "registry-fallback");
  }

  async function negotiate(modelId: string): Promise<NegotiatedCapabilities> {
    // 1. Cache check (D-07 lazy expiry).
    const cached = cache.get(modelId);
    if (cached !== undefined && cached.expiresAt > Date.now()) return cached.result;

    // 2. Inflight coalesce (Q7).
    const existing = inflight.get(modelId);
    if (existing !== undefined) return existing;

    // 3. New fetch promise; clear inflight in .finally (Pitfall 4).
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

  const inner = createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "xai",
    baseUrl: resolvedBaseUrl,
  });
  const innerExecute = inner.execute;
  const innerExecuteStream = inner.executeStream;

  // Wrap the execute function to add xAI reasoning_tokens quirk preservation (D-07).
  const wrappedExecute =
    innerExecute === undefined
      ? undefined
      : async (request: Parameters<typeof innerExecute>[0]) => {
          const response = await innerExecute(request);
          // D-07: PRESERVE xAI's `completion_tokens_details.reasoning_tokens`
          // quirk. The default OpenAI-compat usage extractor does not surface
          // reasoning_tokens; we inspect rawResponse and augment the legacy
          // UsageRecord when the field is present. The Phase 7 normalized
          // `Usage` (promptTokens/completionTokens/costUsd) is unchanged by
          // design -- normalized usage represents billable tokens; reasoning_tokens
          // is xAI-extra-counts that consumers access via rawResponse for now.
          const reasoningTokens = reasoningTokensFromRawResponse(response.rawResponse);
          if (typeof reasoningTokens === "number" && response.usage !== undefined) {
            const inputTokens = response.usage.inputTokens ?? 0;
            const outputTokens = response.usage.outputTokens ?? 0;
            return {
              ...response,
              usage: {
                ...response.usage,
                // Recompute totalTokens INCLUDING reasoning tokens (matches
                // FSB universal-provider.js:593 production behavior).
                totalTokens: inputTokens + outputTokens + reasoningTokens,
              },
            };
          }
          return response;
        };

  const wrappedExecuteStream =
    innerExecuteStream === undefined
      ? undefined
      : async function* (request: Parameters<typeof innerExecuteStream>[0]): ProviderStream {
          const stream = await innerExecuteStream(request);
          for await (const chunk of stream) {
            if (chunk.kind !== "complete") {
              yield chunk;
              continue;
            }

            const reasoningTokens = reasoningTokensFromRawResponse(chunk.rawResponse);
            if (typeof reasoningTokens === "number" && chunk.usage !== undefined) {
              const inputTokens = chunk.usage.inputTokens ?? 0;
              const outputTokens = chunk.usage.outputTokens ?? 0;
              yield {
                ...chunk,
                usage: {
                  ...chunk.usage,
                  totalTokens: inputTokens + outputTokens + reasoningTokens,
                },
              };
              continue;
            }

            yield chunk;
          }
        };

  // Build the returned object without spreading the inner compat adapter (which has
  // execute?: optional and could introduce exactOptionalPropertyTypes issues). Instead
  // we compose the fields explicitly.
  const result: ProviderAdapter & {
    readonly quirks: XaiQuirks;
    readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
  } = {
    id: inner.id,
    kind: inner.kind,
    // Phase 34 — QUIRK-02 / XaiQuirks — verified per RESEARCH §Q6 xAI vocabulary.
    // CITED: xAI API docs — https://docs.x.ai/api/endpoints
    //   - reasoningTokensReported: completion_tokens_details.reasoning_tokens reported
    //     in xAI API responses — verified in xai.ts (D-07 carryforward from Phase 4)
    //   - logprobsSupported: grok-4.20 silently ignores logprobs param per observed behavior
    //     (docs.x.ai citation); flag set to false since logprobs fields are not populated
    //     for current grok-4 models despite the parameter being accepted
    quirks: {
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      reasoningTokensReported: true,
      logprobsSupported: false,
    } satisfies XaiQuirks,
    negotiateCapabilities: negotiate,
    ...(inner.capabilities !== undefined ? { capabilities: inner.capabilities } : {}),
    ...(wrappedExecute !== undefined ? { execute: wrappedExecute } : {}),
    ...(wrappedExecuteStream !== undefined ? { executeStream: wrappedExecuteStream } : {}),
  };
  return result;
}

function reasoningTokensFromRawResponse(rawResponse: unknown): number | undefined {
  const direct = reasoningTokensFromUsage((rawResponse as { usage?: unknown } | undefined)?.usage);
  if (direct !== undefined) {
    return direct;
  }

  if (!isRecord(rawResponse) || !Array.isArray(rawResponse.chunks)) {
    return undefined;
  }

  for (let index = rawResponse.chunks.length - 1; index >= 0; index -= 1) {
    const chunk = rawResponse.chunks[index];
    const fromChunk = reasoningTokensFromUsage((chunk as { usage?: unknown } | undefined)?.usage);
    if (fromChunk !== undefined) {
      return fromChunk;
    }
  }

  return undefined;
}

function reasoningTokensFromUsage(usage: unknown): number | undefined {
  if (!isRecord(usage) || !isRecord(usage.completion_tokens_details)) {
    return undefined;
  }

  const value = usage.completion_tokens_details.reasoning_tokens;
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
