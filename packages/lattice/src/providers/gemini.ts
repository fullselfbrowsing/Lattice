import type { UsageRecord } from "../plan/plan.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
  ProviderStream,
  Usage,
} from "./provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import type { GeminiQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import {
  NegotiationAuthError,
  synthesizeNegotiatedCapabilitiesFromRegistry,
} from "../capabilities/negotiate.js";
import { getCapabilityProfile } from "../capabilities/lookup.js";
import { getRecommendedSanitizers } from "../capabilities/sanitizer-recommendations.js";
import type { RunEventSink } from "../tracing/tracing.js";
import { createRunEvent } from "../tracing/tracing.js";
import type { ToolUseRequest } from "../agent/types.js";
import { parseToolUseEnvelope } from "../agent/format-tools.js";
import {
  validateToolCallRequests,
  type ValidateToolCallsOption,
} from "../tools/tool-call-validation.js";
import {
  applyOutputSanitizers,
  type SanitizeOutputOption,
} from "../sanitizers/index.js";
import {
  artifactBase64Data,
  artifactHttpUrl,
  geminiFileUri,
  mediaTypeForArtifact,
  packagedPlanForArtifact,
} from "./multimodal.js";
import { readSseEvents } from "./sse.js";

/**
 * Options for {@link createGeminiProvider}.
 *
 * Mirrors `OpenAICompatibleProviderOptions` ergonomics (Phase 7 pattern) but
 * for Google's Generative Language API at
 * `/v1beta/models/{model}:generateContent` -- which uses `contents[].parts[].text`
 * (NOT OpenAI's `messages[]`), `role: "model"` for assistant turns (NOT
 * `"assistant"`), authenticates via `?key=` query string for execute(), and applies a
 * 4-category `safetySettings` block at `BLOCK_NONE` thresholds (FSB convention
 * mirrored from `extension/ai/universal-provider.js:255-272`).
 *
 * SECURITY: `apiKey` is a runtime parameter -- do NOT hardcode or log it.
 *
 * STREAMING (Phase 44): supported through native `streamGenerateContent` SSE events.
 *
 * DEFERRED (Phase 4 carryforward notes):
 *   - multimodal (vision) -- deferred
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter contract)
 *
 * NOTE (Phase 34): negotiate() uses x-goog-api-key HEADER (preferred per RESEARCH §Q3).
 * The existing execute() path uses ?key= query string -- execute() migration is out-of-scope
 * for Phase 34 (additive only; T-34-04-01).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-02 + D-07: full custom adapter; preserve role:"model").
 */
export interface GeminiProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly apiKey: string;
  /** Defaults to `https://generativelanguage.googleapis.com`. */
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
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
  readonly sanitizeOutput?: SanitizeOutputOption;
  readonly validateToolCalls?: ValidateToolCallsOption;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 0.9;

/**
 * 4 HARM_CATEGORY entries at BLOCK_NONE (FSB convention mirrored from
 * `extension/ai/universal-provider.js:255-272`). If Google restricts
 * BLOCK_NONE in the future, that is a re-spec concern, not a Phase 4
 * design defect (CONTEXT.md Specific Ideas note).
 */
const SAFETY_SETTINGS = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
] as const;

/**
 * Phase 34 — D-03 — Gemini quirks block. Values verified against
 * Gemini API documentation and gemini.ts:50-55 (safety settings) behavior.
 *
 * CITED: https://ai.google.dev/api/generate-content#v1beta.GenerationConfig
 *   - responseSchemaSupported: gemini-1.5-pro+ and gemini-2.x
 *   - safetySettingsConfigurable: verified in gemini.ts:50-55
 *   - systemInstructionSupported: gemini-1.5+ systemInstruction field
 */
const GEMINI_QUIRKS: GeminiQuirks = {
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  responseSchemaSupported: true,       // CITED: Gemini API responseSchema/responseJsonSchema
  safetySettingsConfigurable: true,    // VERIFIED: gemini.ts:50-55 4-category BLOCK_NONE
  systemInstructionSupported: true,    // CITED: gemini-1.5+ supports system_instruction
};

async function createGeminiGenerateContentBody(
  request: ProviderRunRequest,
): Promise<Record<string, unknown>> {
  const parts = await createGeminiUserParts(request);

  return {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      temperature: DEFAULT_TEMPERATURE,
      topP: DEFAULT_TOP_P,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    },
    safetySettings: SAFETY_SETTINGS,
  };
}

async function createGeminiUserParts(
  request: ProviderRunRequest,
): Promise<readonly Record<string, unknown>[]> {
  const parts: Record<string, unknown>[] = [{ text: request.task }];

  for (const inputArtifact of request.artifacts) {
    if (!isGeminiMediaArtifact(inputArtifact.kind)) {
      continue;
    }

    const packaged = packagedPlanForArtifact(request, inputArtifact.id);
    if (packaged === undefined) {
      continue;
    }

    if (packaged.transport === "file-id") {
      const fileUri = geminiFileUri(inputArtifact);
      if (fileUri === undefined) {
        continue;
      }
      parts.push({
        fileData: {
          mimeType: mediaTypeForArtifact(inputArtifact, fallbackGeminiMimeType(inputArtifact.kind)),
          fileUri,
        },
      });
      continue;
    }

    if (packaged.transport === "url") {
      const fileUri = artifactHttpUrl(inputArtifact);
      if (fileUri === undefined) {
        continue;
      }
      parts.push({
        fileData: {
          mimeType: mediaTypeForArtifact(inputArtifact, fallbackGeminiMimeType(inputArtifact.kind)),
          fileUri,
        },
      });
      continue;
    }

    if (packaged.transport === "base64" || packaged.transport === "inline") {
      const data = await artifactBase64Data(inputArtifact);
      if (data === undefined) {
        continue;
      }
      parts.push({
        inlineData: {
          mimeType: mediaTypeForArtifact(inputArtifact, fallbackGeminiMimeType(inputArtifact.kind)),
          data,
        },
      });
    }
  }

  return parts;
}

function isGeminiMediaArtifact(kind: string): kind is "image" | "audio" | "video" {
  return kind === "image" || kind === "audio" || kind === "video";
}

function fallbackGeminiMimeType(kind: "image" | "audio" | "video"): string {
  switch (kind) {
    case "image":
      return "image/jpeg";
    case "audio":
      return "audio/mpeg";
    case "video":
      return "video/mp4";
  }
}

function geminiGenerateContentUrl(input: {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly stream?: boolean;
}): string {
  const method = input.stream === true ? "streamGenerateContent" : "generateContent";
  const params = new URLSearchParams({ key: input.apiKey });
  if (input.stream === true) {
    params.set("alt", "sse");
  }

  const encodedModel = encodeURIComponent(input.model);
  return `${input.baseUrl}/v1beta/models/${encodedModel}:${method}?${params.toString()}`;
}

/**
 * Phase 34 — D-03 / D-05..D-12 — Extended Gemini provider factory.
 *
 * Returns a `ProviderAdapter` narrowed to expose:
 *   - `quirks: GeminiQuirks` — static adapter capability flags
 *   - `negotiateCapabilities(modelId)` — live /v1beta/models fetch with medium-thick
 *     derivation (inputTokenLimit + thinking + supportedGenerationMethods from upstream)
 *     intersected with Phase 33 registry; TTL cache + inflight coalescing + retry +
 *     auth-throw + transient-fallback + event.
 *
 * NOTE on auth strategy (T-34-04-01): negotiate() uses x-goog-api-key HEADER
 * (preferred per RESEARCH §Q3 -- avoids leaking the key in server-side logs that
 * capture URL query strings). The existing execute() path uses ?key= query string
 * and is NOT changed by Phase 34 (out-of-scope migration).
 */
export function createGeminiProvider(
  options: GeminiProviderOptions,
): ProviderAdapter & {
  readonly quirks: GeminiQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const id = options.id ?? "gemini";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");

  // D-05/D-06: per-instance cache and inflight Maps. Live inside the closure so
  // each createGeminiProvider({}) call gets its own Map (no cross-contamination).
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
   * Phase 34 — D-09..D-11 — Fetches /v1beta/models and merges with registry.
   *
   * URL: ${baseUrl}/v1beta/models (NOT /v1/models -- Gemini uses /v1beta/ prefix)
   * Auth: x-goog-api-key HEADER (preferred per RESEARCH §Q3 -- NOT ?key= query-string;
   *   avoids leaking the key in server-side log captures of request URLs).
   * Retry: [0ms, 200ms, 1000ms] backoff on transient errors (D-11).
   * Auth error (401/403): throws NegotiationAuthError (D-10, no fallback).
   * Transient error (5xx/network): falls back to registry with "registry-fallback" (D-09).
   */
  async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
    // NOTE: URL is /v1beta/models (not /v1/models -- Gemini API prefix differs from OpenAI)
    const url = `${baseUrl}/v1beta/models`;
    const headers: Record<string, string> = {
      // SECURITY: key sent as HEADER (x-goog-api-key), NOT as ?key= query-string.
      // RESEARCH §Q3: header form is preferred to avoid leaking the key in upstream logs.
      "x-goog-api-key": options.apiKey,
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
          throw new NegotiationAuthError(
            "gemini",
            modelId,
            resp.status as 401 | 403,
            `Gemini /v1beta/models returned ${resp.status}: check apiKey config.`,
          );
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const body: unknown = await resp.json();
        return mergeGeminiModelsWithRegistry(modelId, body);
      } catch (err) {
        if (err instanceof NegotiationAuthError) throw err; // D-10: auth never falls back
        lastErr = err;
      }
    }

    // All retries exhausted -- fallback + event (D-09/D-12)
    emitFallbackEvent({
      adapter: "gemini",
      modelId,
      errorReason: stringifyErr(lastErr),
      fallbackSource: "registry-fallback",
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("gemini", modelId, "registry-fallback");
  }

  /**
   * MEDIUM-THICK derivation: consumes upstream truth from Gemini /v1beta/models
   * where available (inputTokenLimit -> contextWindow, thinking -> extendedThinking,
   * supportedGenerationMethods -> streaming + nativeToolCalling) and falls back
   * to registry for the rest (knownFailureModes, recommendedSanitizers).
   *
   * Lenient parsing per Pitfall 1: all field accesses use optional chaining.
   * Missing `thinking` field does not crash -- defaults to false.
   */
  function mergeGeminiModelsWithRegistry(
    modelId: string,
    body: unknown,
  ): NegotiatedCapabilities {
    const models = (body as Record<string, unknown>)?.models;

    // Lenient model search: Gemini names are "models/${id}", base id, or exact name
    const found = Array.isArray(models)
      ? (models as unknown[]).find((m: unknown) => {
          const rec = m as Record<string, unknown>;
          return (
            rec?.name === `models/${modelId}` ||
            rec?.baseModelId === modelId ||
            rec?.name === modelId
          );
        })
      : undefined;

    if (found === undefined) {
      // Model not found in /models response -- treat as registry-fallback
      emitFallbackEvent({
        adapter: "gemini",
        modelId,
        errorReason: "model not found in /v1beta/models response",
        fallbackSource: "registry-fallback",
      });
      return synthesizeNegotiatedCapabilitiesFromRegistry("gemini", modelId, "registry-fallback");
    }

    const foundRec = found as Record<string, unknown>;
    const registryProfile = getCapabilityProfile(`gemini:${modelId}`);

    // THICK derivation from upstream
    const contextWindow =
      typeof foundRec.inputTokenLimit === "number" && foundRec.inputTokenLimit > 0
        ? foundRec.inputTokenLimit
        : (registryProfile?.contextWindow ?? 0);

    // thinking field: THICK from upstream; missing field -> false (lenient parse)
    const extendedThinking =
      foundRec.thinking === true;

    // supportedGenerationMethods: THICK from upstream
    const methods = Array.isArray(foundRec.supportedGenerationMethods)
      ? (foundRec.supportedGenerationMethods as unknown[]).map(String)
      : [];
    const streaming = methods.includes("streamGenerateContent");
    // nativeToolCalling: generateContent method indicates tools surface
    const nativeToolCalling = methods.includes("generateContent") || methods.length > 0;

    // structuredOutputs and parallelToolCalls: from quirks-block-style adapter posture
    // (Gemini 1.5+ supports responseSchema; per-model truth lives in registry)
    const structuredOutputs = true; // quirks.responseSchemaSupported (adapter posture)
    const parallelToolCalls = true; // Gemini supports parallel tool calls

    const knownFailureModes = registryProfile?.knownFailureModes ?? [];
    const recommendedSanitizers = getRecommendedSanitizers(knownFailureModes);

    return {
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
      runId: `negotiate-gemini-${payload.modelId}`,
      providerId: id,
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

  return {
    id,
    kind: "provider-adapter",
    capabilities: [
      {
        ...defaultCapabilityForProvider(id),
        modelId: options.model,
        fileTransport: ["inline", "json", "url", "base64", "file-id", "extracted-text", "transcript"],
        streaming: true,
      },
    ],
    quirks: GEMINI_QUIRKS,
    negotiateCapabilities: negotiate,
    async execute(request) {
      const requestBody = await createGeminiGenerateContentBody(request);
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };

      const url = geminiGenerateContentUrl({
        baseUrl,
        model: options.model,
        apiKey: options.apiKey,
      });
      const response = await fetchImpl(url, init);

      if (!response.ok) {
        throw new Error(`Gemini provider failed with ${response.status}.`);
      }

      const body = (await response.json()) as {
        candidates?: readonly {
          content?: { parts?: readonly { text?: unknown }[] };
        }[];
        usageMetadata?: unknown;
      };

      if (!Array.isArray(body.candidates) || body.candidates.length === 0) {
        throw new Error("Gemini provider returned no candidates.");
      }

      const text = String(body.candidates[0]?.content?.parts?.[0]?.text ?? "");
      const rawOutputs = Object.fromEntries(request.outputs.map((name) => [name, text]));
      const sanitizedOutputs = await applyOutputSanitizers(rawOutputs, options.sanitizeOutput, {
        providerId: id,
        modelId: options.model,
      });
      const parsedToolCalls = parseToolUseEnvelope(text);
      const toolCalls = parsedToolCalls === null
        ? undefined
        : await validateToolCallRequests(parsedToolCalls, options.validateToolCalls);
      const usage = normalizeGeminiUsage(body.usageMetadata);
      const normalizedUsage = normalizeGeminiUsageToRunUsage(body.usageMetadata, options.pricing);

      return {
        rawOutputs: sanitizedOutputs,
        ...(usage !== undefined ? { usage } : {}),
        normalizedUsage,
        ...(toolCalls !== undefined ? { toolCalls } : {}),
        rawResponse: body,
      };
    },
    executeStream(request) {
      return streamGeminiResponse({
        id,
        model: options.model,
        baseUrl,
        apiKey: options.apiKey,
        fetchImpl,
        request,
        ...(options.pricing !== undefined ? { pricing: options.pricing } : {}),
        ...(options.sanitizeOutput !== undefined ? { sanitizeOutput: options.sanitizeOutput } : {}),
        ...(options.validateToolCalls !== undefined
          ? { validateToolCalls: options.validateToolCalls }
          : {}),
      });
    },
  };
}

async function* streamGeminiResponse(input: {
  readonly id: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetchImpl: typeof fetch;
  readonly request: ProviderRunRequest;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
  readonly sanitizeOutput?: SanitizeOutputOption;
  readonly validateToolCalls?: ValidateToolCallsOption;
}): ProviderStream {
  const requestBody = await createGeminiGenerateContentBody(input.request);
  const response = await input.fetchImpl(
    geminiGenerateContentUrl({
      baseUrl: input.baseUrl,
      model: input.model,
      apiKey: input.apiKey,
      stream: true,
    }),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      ...(input.request.signal !== undefined ? { signal: input.request.signal } : {}),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini provider failed with ${response.status}.`);
  }

  const textParts: string[] = [];
  const rawChunks: unknown[] = [];
  const nativeToolRequests: ToolUseRequest[] = [];
  let usagePayload: unknown;

  for await (const event of readSseEvents(response)) {
    const data = event.data.trim();
    if (data.length === 0) {
      continue;
    }
    if (data === "[DONE]") {
      break;
    }

    const chunk = parseJsonObject(data, "Gemini");
    rawChunks.push(chunk);
    const usage = geminiUsageMetadata(chunk);
    if (usage !== undefined) {
      usagePayload = usage;
    }

    for (const { part, candidateIndex, partIndex } of geminiParts(chunk)) {
      if (typeof part.text === "string" && part.text.length > 0) {
        textParts.push(part.text);
        for (const output of input.request.outputs) {
          yield { kind: "text-delta", output, text: part.text };
        }
      }

      const toolRequest = geminiFunctionCallRequest(part, candidateIndex, partIndex);
      if (toolRequest !== undefined) {
        nativeToolRequests.push(toolRequest);
      }
    }
  }

  const text = textParts.join("");
  const rawOutputs = Object.fromEntries(input.request.outputs.map((name) => [name, text]));
  const sanitizedOutputs = await applyOutputSanitizers(rawOutputs, input.sanitizeOutput, {
    providerId: input.id,
    modelId: input.model,
  });
  const parsedToolCalls = parseToolUseEnvelope(text);
  const promptToolCalls = parsedToolCalls === null
    ? undefined
    : await validateToolCallRequests(parsedToolCalls, input.validateToolCalls);
  const nativeToolCalls = nativeToolRequests.length === 0
    ? undefined
    : await validateToolCallRequests(nativeToolRequests, input.validateToolCalls);
  const toolCalls = [
    ...(promptToolCalls ?? []),
    ...(nativeToolCalls ?? []),
  ];
  const usage = normalizeGeminiUsage(usagePayload);
  const normalizedUsage = normalizeGeminiUsageToRunUsage(usagePayload, input.pricing);

  yield {
    kind: "complete",
    rawOutputs: sanitizedOutputs,
    ...(usage !== undefined ? { usage } : {}),
    normalizedUsage,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    rawResponse: {
      kind: "gemini-stream",
      chunks: rawChunks,
    },
  };
}

function parseJsonObject(data: string, providerName: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`${providerName} stream returned invalid JSON: ${message}`);
  }
}

function geminiUsageMetadata(chunk: unknown): unknown {
  return isRecord(chunk) ? chunk.usageMetadata : undefined;
}

function geminiParts(chunk: unknown): Array<{
  readonly part: Record<string, unknown>;
  readonly candidateIndex: number;
  readonly partIndex: number;
}> {
  if (!isRecord(chunk) || !Array.isArray(chunk.candidates)) {
    return [];
  }

  return chunk.candidates.flatMap((candidate, candidateIndex) => {
    if (!isRecord(candidate) || !isRecord(candidate.content)) {
      return [];
    }
    const parts = candidate.content.parts;
    if (!Array.isArray(parts)) {
      return [];
    }

    return parts.flatMap((part, partIndex) =>
      isRecord(part) ? [{ part, candidateIndex, partIndex }] : [],
    );
  });
}

function geminiFunctionCallRequest(
  part: Record<string, unknown>,
  candidateIndex: number,
  partIndex: number,
): ToolUseRequest | undefined {
  if (!isRecord(part.functionCall)) {
    return undefined;
  }

  const name = part.functionCall.name;
  if (typeof name !== "string") {
    return undefined;
  }

  return {
    id: `gemini-function-call-${candidateIndex}-${partIndex}`,
    name,
    args: part.functionCall.args ?? {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Gemini uses `usageMetadata.promptTokenCount` / `candidatesTokenCount` /
 * `totalTokenCount` (NOT OpenAI's `prompt_tokens` / `completion_tokens`).
 * This helper maps to Lattice's `Usage` shape and applies pricing when supplied.
 */
function normalizeGeminiUsageToRunUsage(
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
    promptTokens = numberField(record, "promptTokenCount") ?? 0;
    completionTokens = numberField(record, "candidatesTokenCount") ?? 0;
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

function normalizeGeminiUsage(usage: unknown): UsageRecord | undefined {
  if (typeof usage !== "object" || usage === null) {
    return undefined;
  }
  const record = usage as Record<string, unknown>;
  const inputTokens = numberField(record, "promptTokenCount");
  const outputTokens = numberField(record, "candidatesTokenCount");
  const totalTokens = numberField(record, "totalTokenCount");
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
 * T-34-04-02: Returns err.message only -- NOT err.stack (which could include
 * headers or the apiKey via a fetch rejection), NOT JSON.stringify(err).
 */
function stringifyErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
