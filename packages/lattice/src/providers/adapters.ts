import type { UsageRecord } from "../plan/plan.js";
import type { ProviderAdapter, ProviderRunResponse, Usage } from "./provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import type { OpenAIQuirks, OpenAICompatQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import {
  NegotiationAuthError,
  synthesizeNegotiatedCapabilitiesFromRegistry,
  _mapProfileToNegotiatedCapabilities,
} from "../capabilities/negotiate.js";
import { getCapabilityProfile } from "../capabilities/lookup.js";
import type { CapabilityAdapter } from "../capabilities/profile.js";
import type { RunEventSink } from "../tracing/tracing.js";
import { createRunEvent } from "../tracing/tracing.js";

export interface OpenAICompatibleProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  /**
   * Phase 7 addition: caller-supplied per-1k pricing. When provided, the
   * adapter computes `normalizedUsage.costUsd` from the API-reported token
   * counts. When omitted, `normalizedUsage.costUsd` is `null` so downstream
   * consumers can distinguish "unmeasured" from "free" (per 07-CONTEXT.md).
   */
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
  /**
   * Phase 34 — D-05/D-06/D-08 — TTL for the per-instance models cache.
   * Default 300_000ms (5 minutes). Set to 0 to disable caching.
   * Set to Infinity for process-lifetime caching.
   *
   * NOTE: for createOpenAICompatibleProvider, this option is accepted for
   * option-bag uniformity but is NOT USED — openai-compat has no /models
   * endpoint (D-04). Document in JSDoc for consumers pointing at known servers.
   */
  readonly modelsCacheTtlMs?: number;
  /**
   * Phase 34 — D-11 — Number of retry attempts on transient /models errors
   * (5xx, network, timeout). Default 2. Set to 0 to disable retries.
   *
   * NOTE: for createOpenAICompatibleProvider, this option is accepted for
   * option-bag uniformity but is NOT USED — openai-compat has no /models
   * endpoint (D-04).
   */
  readonly modelsRetryCount?: number;
  /**
   * Phase 34 — D-12 — Optional RunEventSink for capability negotiation events.
   * When provided, emits the "capabilities.negotiation.fallback" event on
   * transient /models errors (5xx, network, timeout).
   *
   * NOTE: for createOpenAICompatibleProvider, this option is accepted for
   * option-bag uniformity but the event is NOT FIRED for source: "registry"
   * (the documented happy path for openai-compat). Emitting events for the
   * intentional no-endpoint path would produce noisy false-positives.
   */
  readonly runEventSink?: RunEventSink;
}

export interface SdkLikeProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly generate: (input: {
    readonly task: string;
    readonly outputNames: readonly string[];
  }) => Promise<ProviderRunResponse> | ProviderRunResponse;
}

/**
 * Phase 34 — D-04 / QUIRK-02 — OpenAI-compatible provider factory.
 *
 * This factory is the prototypical "intentional no remote /models endpoint"
 * adapter per D-04. The consumer points this adapter at any OpenAI-shaped
 * endpoint (vLLM, TGI, Ollama, custom), and the factory returns conservative
 * defaults for the quirks block because the server could be anything.
 *
 * The `negotiateCapabilities` method performs NO fetch; it returns
 * synthesizeNegotiatedCapabilitiesFromRegistry with source: "registry"
 * (the intentional-no-endpoint signal, as distinct from "registry-fallback"
 * which signals a transient failure). Plan 34-05 (LM Studio) reuses this
 * same pattern.
 *
 * D-04 citation: "consumer adapters without a /models endpoint skip the
 * fetch layer entirely and delegate to synthesizeNegotiatedCapabilitiesFromRegistry."
 */
export function createOpenAICompatibleProvider(
  options: OpenAICompatibleProviderOptions,
): ProviderAdapter & {
  readonly quirks: OpenAICompatQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const id = options.id ?? "openai-compatible";
  const fetchImpl = options.fetch ?? fetch;

  // Phase 34 — D-04 — OpenAI-compat negotiate() is registry-only (no fetch,
  // no cache, no inflight). Source: "registry" signals intentional no-endpoint.
  const negotiate = async (modelId: string): Promise<NegotiatedCapabilities> => {
    const adapterId = (id) as CapabilityAdapter;
    // No fetch; no cache; no inflight coalescing. Direct synthesis from registry per D-04.
    // Source: "registry" signals intentional no-endpoint (vs "registry-fallback"
    // which signals a transient failure we couldn't recover from).
    return synthesizeNegotiatedCapabilitiesFromRegistry(adapterId, modelId, "registry");
  };

  return {
    id,
    kind: "provider-adapter",
    // Phase 34 — QUIRK-02 / OpenAICompatQuirks — conservative defaults.
    // openai-compat servers (vLLM, TGI, Ollama, custom) vary widely in which
    // response_format and tool_choice features they implement. Defaults are
    // conservatively false except streamingDiverges which is true because
    // self-hosted servers often have subtle streaming differences.
    quirks: {
      supportsToolChoice: false,
      parallelToolCalls: false,
      structuredOutputs: false,
      responseFormatHonored: false,
      streamingDiverges: true,
    } satisfies OpenAICompatQuirks,
    negotiateCapabilities: negotiate,
    capabilities: [
      {
        ...defaultCapabilityForProvider(id),
        modelId: options.model,
        fileTransport: ["inline", "json", "url", "base64", "extracted-text", "transcript"],
      },
    ],
    async execute(request) {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(options.apiKey !== undefined ? { authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: request.task,
                },
                {
                  type: "text",
                  text: JSON.stringify({
                    contextPack: request.contextPack === undefined
                      ? undefined
                      : {
                          id: request.contextPack.id,
                          tokenBudget: request.contextPack.tokenBudget,
                          estimatedTokens: request.contextPack.estimatedTokens,
                          included: request.contextPack.included,
                          summarized: request.contextPack.summarized,
                          archived: request.contextPack.archived,
                          omitted: request.contextPack.omitted,
                          warnings: request.contextPack.warnings,
                        },
                  }),
                },
                ...request.artifacts.map((inputArtifact) => ({
                  type: "text",
                  text: JSON.stringify({
                    artifactId: inputArtifact.id,
                    kind: inputArtifact.kind,
                    mediaType: inputArtifact.mediaType,
                    privacy: inputArtifact.privacy,
                    transport: request.providerPackaging?.artifacts.find(
                      (item) => item.artifactId === inputArtifact.id,
                    )?.transport ?? request.plan?.providerPackaging?.artifacts.find(
                      (item) => item.artifactId === inputArtifact.id,
                    )?.transport,
                    value:
                      typeof inputArtifact.value === "string" && inputArtifact.kind !== "url"
                        ? inputArtifact.value
                        : undefined,
                    url:
                      inputArtifact.kind === "url" && typeof inputArtifact.value === "string"
                        ? inputArtifact.value
                        : undefined,
                  }),
                })),
              ],
            },
          ],
        }),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };
      const response = await fetchImpl(`${options.baseUrl.replace(/\/$/u, "")}/chat/completions`, init);

      if (!response.ok) {
        throw new Error(`OpenAI-compatible provider failed with ${response.status}.`);
      }

      const body = await response.json() as {
        choices?: readonly { message?: { content?: unknown } }[];
        usage?: unknown;
      };
      const text = String(body.choices?.[0]?.message?.content ?? "");
      const usage = normalizeUsage(body.usage);
      const normalizedUsage = normalizeUsageToRunUsage(body.usage, options.pricing);

      return {
        rawOutputs: Object.fromEntries(request.outputs.map((name) => [name, text])),
        ...(usage !== undefined ? { usage } : {}),
        normalizedUsage,
        rawResponse: body,
      };
    },
  };
}

/**
 * Phase 7 normalization: maps raw provider usage payloads (OpenAI's
 * `prompt_tokens`/`completion_tokens`, the Responses API's
 * `input_tokens`/`output_tokens`, or camelCase variants) to the shared
 * `Usage` shape. When `pricing` is supplied, `costUsd` is computed from
 * the normalized token counts. Otherwise `costUsd` is `null` so consumers
 * can distinguish "unmeasured" from "zero".
 */
function normalizeUsageToRunUsage(
  rawUsage: unknown,
  pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  },
): Usage {
  let promptTokens = 0;
  let completionTokens = 0;
  if (typeof rawUsage === "object" && rawUsage !== null) {
    const record = rawUsage as Record<string, unknown>;
    promptTokens =
      numberField(record, "prompt_tokens") ??
      numberField(record, "input_tokens") ??
      numberField(record, "inputTokens") ??
      0;
    completionTokens =
      numberField(record, "completion_tokens") ??
      numberField(record, "output_tokens") ??
      numberField(record, "outputTokens") ??
      0;
  }
  let costUsd: number | null = null;
  if (
    pricing !== undefined &&
    (pricing.inputPer1kTokens !== undefined || pricing.outputPer1kTokens !== undefined)
  ) {
    const inputCost = ((pricing.inputPer1kTokens ?? 0) * promptTokens) / 1000;
    const outputCost = ((pricing.outputPer1kTokens ?? 0) * completionTokens) / 1000;
    costUsd = inputCost + outputCost;
  }
  return { promptTokens, completionTokens, costUsd };
}

function normalizeUsage(usage: unknown): UsageRecord | undefined {
  if (typeof usage !== "object" || usage === null) {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const inputTokens = numberField(record, "prompt_tokens") ?? numberField(record, "input_tokens");
  const outputTokens =
    numberField(record, "completion_tokens") ?? numberField(record, "output_tokens");
  const totalTokens = numberField(record, "total_tokens");

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
  };
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  return typeof value === "number" ? value : undefined;
}

/**
 * Phase 34 — D-12 — Emits a "capabilities.negotiation.fallback" RunEvent if
 * a sink is provided. The runId uses a synthetic value since negotiation
 * happens outside a run context.
 *
 * T-34-03-01: errorReason is produced by stringifyErr (message only, NOT
 * stack) to prevent apiKey leaking in error strings that include request headers.
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
    // Synthetic runId: negotiation happens outside a run context (no run.id available).
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
 * stack) to prevent apiKey or sensitive header values from leaking into
 * event payloads via fetch errors that may embed the request init.
 * T-34-03-01 mitigation.
 */
function stringifyErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Phase 34 — QUIRK-02 / NEG-01 / NEG-02 — Merge an OpenAI /v1/models
 * sparse response with the Phase 33 registry.
 *
 * OpenAI's /models response is famously SPARSE per RESEARCH §Q2:
 * `{ id, object, created, owned_by }` only. No capabilities block.
 * The /models call confirms the model EXISTS in the user's org, but
 * tells us nothing about its capabilities. We source supports.* from
 * the Phase 33 registry instead.
 *
 * Source semantics per D-09:
 *   - "live" when the model id is found in the /models response
 *     (the id was verified to exist — useful signal for org membership)
 *   - "registry-fallback" when the model is NOT in the /models response
 *     (model not in org, or stale; emit fallback event)
 *
 * Anti-pattern warning (RESEARCH §Anti-patterns): DO NOT assume OpenAI
 * /v1/models returns capability flags. It doesn't. Only id/object/created/
 * owned_by are returned. Source supports.* ONLY from the registry.
 */
function mergeOpenAIModelsWithRegistry(
  modelId: string,
  body: unknown,
  emitFallback: () => void,
): NegotiatedCapabilities {
  // LENIENT-PARSE: body may be malformed; defensive chaining throughout (Pitfall 1).
  const data = (body as { data?: unknown })?.data;
  const found = Array.isArray(data)
    ? (data as Array<unknown>).find(
        (m): m is { id: string } =>
          typeof m === "object" && m !== null && (m as { id?: unknown }).id === modelId,
      )
    : undefined;

  if (found === undefined) {
    // Model not in /models response — emit fallback event and fall back to registry.
    emitFallback();
    return synthesizeNegotiatedCapabilitiesFromRegistry("openai", modelId, "registry-fallback");
  }

  // Model found in /models response — source supports.* from registry profile.
  // The /models call confirmed the model EXISTS in the org (useful signal), but
  // sparse /models tells us nothing about capabilities. Per RESEARCH §Q2 planning
  // note 2: use source: "live" since the model id was verified to exist.
  const registryProfile = getCapabilityProfile(`openai:${modelId}`);
  if (registryProfile !== undefined) {
    return _mapProfileToNegotiatedCapabilities(registryProfile, "live");
  }

  // Model exists in org (/models confirmed) but Phase 33 registry doesn't have it.
  // Use source: "live" per planning_context note 2 (the model id was verified).
  // Supports.* are unknown — return empty-stub shape with source: "live".
  return synthesizeNegotiatedCapabilitiesFromRegistry("openai", modelId, "registry-fallback");
}

/**
 * Phase 34 — QUIRK-02 / NEG-01 / NEG-02 — OpenAI provider factory.
 *
 * Extends the base OpenAI-compat factory with:
 *   1. `quirks: OpenAIQuirks` — verified per RESEARCH §Q6 OpenAI vocabulary.
 *   2. `negotiateCapabilities(modelId)` — queries OpenAI /v1/models GET with
 *      Authorization: Bearer header; SPARSE response; intersects with Phase 33
 *      registry for supports.* (per RESEARCH §Anti-patterns — don't assume
 *      OpenAI /v1/models returns capability flags, it doesn't).
 *
 * The negotiate() pattern mirrors Plan 34-02 (Anthropic thick reference):
 *   - Per-instance TTL cache (modelsCacheTtlMs, default 300_000ms)
 *   - Single-flight inflight coalescing with .finally cleanup (Pitfall 4)
 *   - Retry with [0, 200, 1000]ms backoff (modelsRetryCount, default 2)
 *   - 401/403 throws NegotiationAuthError (D-10: no retry, no fallback, no event)
 *   - 5xx/network/timeout falls back to registry with source: "registry-fallback"
 *   - emitFallbackEvent fires the "capabilities.negotiation.fallback" RunEvent
 *
 * SECURITY (T-34-03-07): inflight Map MUST use .finally cleanup to prevent
 * leak on rejection. Verifiable: grep `.finally` in this file.
 */
export function createOpenAIProvider(
  options: OpenAICompatibleProviderOptions,
): ProviderAdapter & {
  readonly quirks: OpenAIQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const id = options.id ?? "openai";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.openai.com").replace(/\/$/u, "");
  const ttlMs = options.modelsCacheTtlMs ?? 300_000;
  const retryCount = options.modelsRetryCount ?? 2;

  // Per-instance TTL cache (D-05/D-06/D-07/D-08). One Map per factory call.
  const cache = new Map<string, { result: NegotiatedCapabilities; expiresAt: number }>();
  // Per-instance inflight coalescing Map (Q7). .finally cleanup is mandatory (Pitfall 4).
  const inflight = new Map<string, Promise<NegotiatedCapabilities>>();

  async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
    const url = `${baseUrl}/v1/models`;
    const headers: Record<string, string> = {
      "authorization": `Bearer ${options.apiKey ?? ""}`,
      "accept": "application/json",
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
        });
        if (resp.status === 401 || resp.status === 403) {
          throw new NegotiationAuthError(
            "openai",
            modelId,
            resp.status as 401 | 403,
            `OpenAI /v1/models returned ${resp.status}: check apiKey config.`,
          );
        }
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const body = await resp.json() as unknown;
        return mergeOpenAIModelsWithRegistry(modelId, body, () => {
          emitFallbackEvent(options.runEventSink, {
            adapter: "openai",
            modelId,
            errorReason: "model not found in /v1/models response",
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
      adapter: "openai",
      modelId,
      errorReason: stringifyErr(lastErr),
      fallbackSource: "registry-fallback",
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("openai", modelId, "registry-fallback");
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

  const innerCompat = createOpenAICompatibleProvider({
    ...options,
    id,
    baseUrl,
  });

  return {
    ...innerCompat,
    // Phase 34 — QUIRK-02 / OpenAIQuirks — verified per RESEARCH §Q6 OpenAI vocabulary.
    // CITED: https://platform.openai.com/docs/guides/structured-outputs
    //   - strictModeSupported: function-calling strict:true available on gpt-4o-2024-08-06+, o1+
    //   - structuredOutputsTier2: json_schema response_format on gpt-4o and gpt-4o-mini series
    // CITED: RESEARCH §Q6 — supportsToolChoice, parallelToolCalls, structuredOutputs,
    //   responseFormatHonored all true for OpenAI. streamingDiverges false (OpenAI streaming
    //   output matches buffered per RESEARCH §A7 caveat: parallel_tool_calls is supported but
    //   disabled by default; the quirk flag reflects that the feature exists).
    quirks: {
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      strictModeSupported: true,
      structuredOutputsTier2: true,
    } satisfies OpenAIQuirks,
    negotiateCapabilities: negotiate,
  };
}

export function createAISdkProvider(options: SdkLikeProviderOptions): ProviderAdapter {
  const id = options.id ?? "ai-sdk";

  return {
    id,
    kind: "provider-adapter",
    capabilities: [
      {
        ...defaultCapabilityForProvider(id),
        modelId: options.model,
        toolUse: true,
        streaming: true,
      },
    ],
    execute: async (request) => {
      const response = await options.generate({
        task: request.task,
        outputNames: request.outputs,
      });
      const normalizedUsage: Usage = {
        promptTokens: response.usage?.inputTokens ?? 0,
        completionTokens: response.usage?.outputTokens ?? 0,
        costUsd: null,
      };
      return { ...response, normalizedUsage };
    },
  };
}
