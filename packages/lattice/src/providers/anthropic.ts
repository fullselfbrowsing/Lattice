import type { UsageRecord } from "../plan/plan.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
  ProviderStream,
  Usage,
} from "./provider.js";
import type { AnthropicQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import type { RunEventSink } from "../tracing/tracing.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import { NegotiationAuthError, synthesizeNegotiatedCapabilitiesFromRegistry } from "../capabilities/negotiate.js";
import { getCapabilityProfile } from "../capabilities/lookup.js";
import { getRecommendedSanitizers } from "../capabilities/sanitizer-recommendations.js";
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
  anthropicFileId,
  artifactBase64Data,
  artifactHttpUrl,
  mediaTypeForArtifact,
  packagedPlanForArtifact,
} from "./multimodal.js";
import { readSseEvents } from "./sse.js";
import { assertNoPublicUrlEgress } from "./no-public-url.js";

/**
 * Options for {@link createAnthropicProvider}.
 *
 * Mirrors `OpenAICompatibleProviderOptions` ergonomics (Phase 7 pattern) but
 * for the Anthropic Messages API at `/v1/messages` -- which uses a top-level
 * `system` field and a `content[0].text` response shape that diverges from
 * the OpenAI Chat Completions schema (see FSB v0.9.x `extension/ai/universal-provider.js`
 * lines 280-297 + 566-573 for the production reference).
 *
 * SECURITY: `apiKey` is a runtime parameter -- do NOT hardcode or log it.
 *
 * STREAMING (Phase 44): supported through native Anthropic Messages SSE events.
 *
 * DEFERRED (Phase 4 carryforward notes):
 *   - prompt caching   (Phase 39: opt-in via `ProviderRunRequest.cacheSystemPrefix` —
 *                       emitted as a cache_control-marked system block when present)
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter contract)
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-02 + D-07: full custom adapter; preserve top-level `system`).
 */
export interface AnthropicProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly apiKey: string;
  /** Defaults to `https://api.anthropic.com`. Override for proxies. */
  readonly baseUrl?: string;
  /** Defaults to `2023-06-01`. Override only if the consumer has tested a newer pinned version. */
  readonly anthropicVersion?: string;
  readonly fetch?: typeof fetch;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
  /**
   * D-08: Per-instance TTL for the /v1/models response cache (milliseconds).
   * Default 300_000 (5 minutes). `0` disables caching (always re-fetch -- for testing).
   * `Infinity` disables expiry (process-lifetime for the instance).
   */
  readonly modelsCacheTtlMs?: number;
  /**
   * D-11: Number of retries for transient /v1/models fetch failures (5xx, network,
   * timeout). Default 2 (3 total attempts). `0` disables retries.
   * Backoff schedule: [0ms, 200ms, 1000ms].
   */
  readonly modelsRetryCount?: number;
  /**
   * D-12: Optional RunEventSink for emitting `capabilities.negotiation.fallback`
   * events when the /v1/models fetch falls back to the Phase 33 static registry.
   * If absent, fallback emits no event (no-op). Auth errors (401/403) never emit
   * the fallback event -- they throw `NegotiationAuthError` instead.
   */
  readonly runEventSink?: RunEventSink;
  readonly sanitizeOutput?: SanitizeOutputOption;
  readonly validateToolCalls?: ValidateToolCallsOption;
}

/** Internal TTL cache entry shape (D-07 lazy-expiry). */
interface CacheEntry {
  readonly result: NegotiatedCapabilities;
  /** Date.now() + ttlMs; Infinity when ttlMs === Infinity */
  readonly expiresAt: number;
}

const DEFAULT_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MODELS_CACHE_TTL_MS = 300_000;
const DEFAULT_MODELS_RETRY_COUNT = 2;
/** D-11: Backoff schedule for transient /v1/models failures -- immediate, 200ms, 1s. */
const MODELS_BACKOFF_MS = [0, 200, 1000] as const;

interface AnthropicMessagesBodyResult {
  readonly body: Record<string, unknown>;
  readonly usesFilesApi: boolean;
}

async function createAnthropicMessagesBody(input: {
  readonly model: string;
  readonly request: ProviderRunRequest;
  readonly stream?: boolean;
}): Promise<AnthropicMessagesBodyResult> {
  // Phase 39 (DELEG-04): opt-in prompt-cache prefix. When present, hoist
  // it to a `cache_control`-marked system content block. Conditional VALUE,
  // not conditional spread: the `system` key is always present per the
  // Messages API contract and prior golden-body tests.
  const system =
    input.request.cacheSystemPrefix !== undefined
      ? [
          {
            type: "text",
            text: input.request.cacheSystemPrefix,
            cache_control: { type: "ephemeral" },
          },
        ]
      : "";

  const content = await createAnthropicUserContent(input.request);

  return {
    body: {
      model: input.model,
      system,
      messages: [
        {
          role: "user",
          content: content.blocks.length === 0
            ? input.request.task
            : [...content.blocks, { type: "text", text: input.request.task }],
        },
      ],
      max_tokens: DEFAULT_MAX_TOKENS,
      ...(input.stream === true ? { stream: true } : {}),
    },
    usesFilesApi: content.usesFilesApi,
  };
}

async function createAnthropicUserContent(request: ProviderRunRequest): Promise<{
  readonly blocks: readonly Record<string, unknown>[];
  readonly usesFilesApi: boolean;
}> {
  const blocks: Record<string, unknown>[] = [];
  let usesFilesApi = false;

  for (const inputArtifact of request.artifacts) {
    if (inputArtifact.kind !== "image") {
      continue;
    }

    const packaged = packagedPlanForArtifact(request, inputArtifact.id);
    if (packaged === undefined) {
      continue;
    }

    if (packaged.transport === "file-id") {
      const fileId = anthropicFileId(inputArtifact);
      if (fileId === undefined) {
        continue;
      }
      blocks.push({
        type: "image",
        source: {
          type: "file",
          file_id: fileId,
        },
      });
      usesFilesApi = true;
      continue;
    }

    if (packaged.transport === "url") {
      const url = artifactHttpUrl(inputArtifact);
      if (url === undefined) {
        continue;
      }
      blocks.push({
        type: "image",
        source: {
          type: "url",
          url,
        },
      });
      continue;
    }

    if (packaged.transport === "base64" || packaged.transport === "inline") {
      const data = await artifactBase64Data(inputArtifact);
      if (data === undefined) {
        continue;
      }
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaTypeForArtifact(inputArtifact, "image/jpeg"),
          data,
        },
      });
    }
  }

  return { blocks, usesFilesApi };
}

export function createAnthropicProvider(options: AnthropicProviderOptions): ProviderAdapter & {
  readonly quirks: AnthropicQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const id = options.id ?? "anthropic";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/u, "");
  const anthropicVersion = options.anthropicVersion ?? DEFAULT_ANTHROPIC_VERSION;

  // D-08: TTL cache configuration
  const ttlMs = options.modelsCacheTtlMs ?? DEFAULT_MODELS_CACHE_TTL_MS;
  // D-11: Retry count (0 = no retries, so attempts = 1)
  const retryCount = options.modelsRetryCount ?? DEFAULT_MODELS_RETRY_COUNT;

  // D-05 / D-06: Per-instance Maps; each createAnthropicProvider() call gets its own.
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<NegotiatedCapabilities>>();

  /**
   * D-12: Emits the `capabilities.negotiation.fallback` RunEvent via the
   * consumer-supplied sink. If no sink is provided, this is a no-op.
   *
   * SECURITY (T-34-02-01): errorReason is derived from `err.message` ONLY --
   * not `err.stack`, `err.toString()`, or any serialization that could include
   * request headers (which carry the apiKey). `stringifyErr` enforces this.
   *
   * JSDoc synthetic runId: negotiate() runs outside of a Lattice run context
   * (no ai.run() in scope). The runId `"negotiate-${id}-${modelId}"` is a
   * synthetic value that scopes the event to this adapter instance + modelId.
   * Consumers filtering on runId should treat "negotiate-" prefix as a signal
   * that this event originated from capability negotiation, not a user-facing run.
   */
  function emitFallbackEvent(payload: {
    adapter: string;
    modelId: string;
    errorReason: string;
    fallbackSource: "registry-fallback";
  }): void {
    if (options.runEventSink === undefined) return;
    const event = createRunEvent("capabilities.negotiation.fallback", {
      runId: `negotiate-${id}-${payload.modelId}`,
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

  /**
   * Pure error message extractor. Returns `err.message` for Error instances,
   * `String(err)` for everything else. Deliberately does NOT include stack,
   * headers, or other fields (T-34-02-01 mitigation).
   */
  function stringifyErr(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  /**
   * Merges a live /v1/models response body with the Phase 33 static registry
   * profile for the given modelId. Called on HTTP 200 responses only.
   *
   * LENIENT PARSING (Pitfall 1): every field access uses optional chaining.
   * Missing `capabilities.thinking` or other sub-fields default to false rather
   * than throwing. This ensures forward-compatibility with future API shape changes.
   *
   * contextWindow policy: Anthropic's max_input_tokens is set to 0 in the fixture
   * for models where it is unreliable. When 0, falls through to the registry profile's
   * contextWindow (if present) or 0 as a final default (RESEARCH §Q1).
   */
  function mergeAnthropicModelsWithRegistry(
    modelId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: any,
  ): NegotiatedCapabilities {
    // Pitfall 1: lenient parse -- never crash on unexpected shapes
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const found = body?.data?.find?.((m: unknown) => {
      if (typeof m !== "object" || m === null) return false;
      return (m as Record<string, unknown>)["id"] === modelId;
    }) as Record<string, unknown> | undefined;

    if (found === undefined) {
      // Model not found in live response -- treat as registry-fallback
      // (200 received but this modelId isn't listed; signal to consumer that
      // something is off, per planner advisory in task spec).
      //
      // WR-04 (Phase 34 review): emit the fallback event here so consumers
      // observing the event stream can detect that an Anthropic model was
      // missing from a successful /v1/models response. Matches the OpenAI
      // (adapters.ts:362-366), Gemini, and OpenRouter behavior.
      emitFallbackEvent({
        adapter: "anthropic",
        modelId,
        errorReason: "model not found in /v1/models response",
        fallbackSource: "registry-fallback",
      });
      return synthesizeNegotiatedCapabilitiesFromRegistry("anthropic", modelId, "registry-fallback");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const caps = (found["capabilities"] as Record<string, unknown> | undefined) ?? {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const structuredOutputsSupported = (caps["structured_outputs"] as Record<string, unknown> | undefined)?.["supported"] === true;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const thinkingSupported = (caps["thinking"] as Record<string, unknown> | undefined)?.["supported"] === true;

    // contextWindow: use max_input_tokens when > 0; fall through to registry profile
    const maxInputTokensRaw = found["max_input_tokens"];
    const maxInputTokens = typeof maxInputTokensRaw === "number" && maxInputTokensRaw > 0
      ? maxInputTokensRaw
      : undefined;

    // Registry profile for contextWindow fallback + knownFailureModes
    const registryProfile = getCapabilityProfile(`anthropic:${modelId}`);
    const contextWindow = maxInputTokens ?? registryProfile?.contextWindow ?? 0;

    const knownFailureModes = registryProfile?.knownFailureModes ?? ([] as const);

    return {
      modelId,
      contextWindow,
      supports: {
        nativeToolCalling: true,         // Anthropic tool_use is the reference implementation
        structuredOutputs: structuredOutputsSupported,
        parallelToolCalls: true,         // Anthropic supports parallel tool calls per registry
        extendedThinking: thinkingSupported,
        streaming: true,                 // Anthropic native streaming
      },
      knownFailureModes,
      recommendedSanitizers: getRecommendedSanitizers(knownFailureModes),
      source: "live",
    };
  }

  /**
   * D-09 / D-10 / D-11: Core /v1/models fetch with retry-backoff, auth-error-throw,
   * and transient-fallback. Called only once per modelId (inflight coalescing prevents
   * concurrent duplicate fetches).
   *
   * URL shape: `${baseUrl}/v1/models?limit=1000` to page all models in one request.
   * Headers per RESEARCH §Q1: x-api-key, anthropic-version, accept.
   */
  async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
    const url = `${baseUrl}/v1/models?limit=1000`;
    const headers = {
      "x-api-key": options.apiKey,
      "anthropic-version": anthropicVersion,
      "accept": "application/json",
    };

    const attempts = retryCount + 1;
    let lastErr: unknown;

    for (let i = 0; i < attempts; i += 1) {
      const delayMs = MODELS_BACKOFF_MS[i] ?? MODELS_BACKOFF_MS[MODELS_BACKOFF_MS.length - 1]!;
      if (delayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
      }

      try {
        const resp = await fetchImpl(url, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(30_000),
        });

        // D-10: auth errors throw immediately, never fall back, never retry
        // T-34-02-04: message does NOT include the actual apiKey value
        if (resp.status === 401 || resp.status === 403) {
          throw new NegotiationAuthError(
            "anthropic",
            modelId,
            resp.status as 401 | 403,
            `Anthropic /v1/models returned ${resp.status}: check apiKey config.`,
          );
        }

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const body = await resp.json();
        return mergeAnthropicModelsWithRegistry(modelId, body);
      } catch (err) {
        // D-10: auth errors always propagate -- never retry, never fall back
        if (err instanceof NegotiationAuthError) throw err;
        lastErr = err;
        // Continue loop for transient errors (5xx, network, timeout)
      }
    }

    // D-09 + D-12: all retries exhausted -- fall back to Phase 33 registry + emit event
    emitFallbackEvent({
      adapter: "anthropic",
      modelId,
      errorReason: stringifyErr(lastErr),
      fallbackSource: "registry-fallback",
    });
    return synthesizeNegotiatedCapabilitiesFromRegistry("anthropic", modelId, "registry-fallback");
  }

  /**
   * D-07: Lazy expiry cache check + D-Q7: inflight coalescing.
   *
   * Cache check: stale entries are evicted lazily on read (no background setInterval
   * -- library must not pin the Node event loop).
   *
   * Inflight coalescing: concurrent calls for the same modelId share one fetch
   * Promise. Pitfall 4 mitigation: `.finally` block ALWAYS clears the inflight
   * Map entry, even on rejection. This ensures that a rejected Promise doesn't
   * "poison" the Map -- the next caller after all concurrent calls settle will
   * trigger a fresh fetch attempt.
   */
  async function negotiateCapabilities(modelId: string): Promise<NegotiatedCapabilities> {
    // 1. D-07: lazy TTL expiry check
    const cached = cache.get(modelId);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // 2. Q7: inflight coalescing -- return existing Promise if one is in-flight
    const existing = inflight.get(modelId);
    if (existing !== undefined) return existing;

    // 3. Start a new fetch Promise; .finally cleanup guarantees Map clearing (Pitfall 4)
    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        // D-08: cache result when TTL > 0; Infinity disables expiry
        if (ttlMs > 0) {
          cache.set(modelId, {
            result,
            expiresAt: ttlMs === Infinity ? Infinity : Date.now() + ttlMs,
          });
        }
        return result;
      } finally {
        // Pitfall 4: ALWAYS remove from inflight Map -- even on rejection.
        // This prevents a failed fetch from permanently blocking future calls.
        inflight.delete(modelId);
      }
    })();

    inflight.set(modelId, fetchPromise);
    return fetchPromise;
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
    /**
     * QUIRK-02: Anthropic adapter quirks block -- values verified against
     * Anthropic documentation and /v1/models capabilities field (RESEARCH §Q6/§Q1).
     *
     * Universal 5-boolean base (AdapterQuirks):
     *   - supportsToolChoice: true -- tool_choice is supported per Anthropic tool use docs
     *   - parallelToolCalls: true -- parallel tool calls verified in Anthropic tool_use spec
     *   - structuredOutputs: true -- structured_outputs.supported in /v1/models capabilities block
     *   - responseFormatHonored: true -- Anthropic honors response_format JSON schema strictly
     *   - streamingDiverges: false -- Anthropic streaming output matches buffered output
     *
     * Anthropic-narrowed 3 fields (AnthropicQuirks):
     *   - promptCachingSupported: true
     *     CITED: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
     *     Cache_control on system and user turns GA on all active Claude models.
     *   - extendedThinkingSupported: true
     *     CITED: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
     *     Thinking blocks available via the "thinking" request parameter (claude-3-7-sonnet+,
     *     claude-*-4 families). Verified via /v1/models capabilities.thinking.supported.
     *   - toolUseInputSchemaStrict: true
     *     CITED: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
     *     Anthropic tool_use blocks require strict JSON Schema in the input_schema field.
     */
    quirks: {
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      promptCachingSupported: true,
      extendedThinkingSupported: true,
      toolUseInputSchemaStrict: true,
    } satisfies AnthropicQuirks,
    negotiateCapabilities,
    async execute(request) {
      const messagesBody = await createAnthropicMessagesBody({
        model: options.model,
        request,
      });
      const bodyStr = JSON.stringify(messagesBody.body);
      assertNoPublicUrlEgress(request, id, bodyStr);
      const init: RequestInit = {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": anthropicVersion,
          ...(messagesBody.usesFilesApi
            ? { "anthropic-beta": "files-api-2025-04-14" }
            : {}),
        },
        body: bodyStr,
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };

      const response = await fetchImpl(`${baseUrl}/v1/messages`, init);

      if (!response.ok) {
        throw new Error(`Anthropic provider failed with ${response.status}.`);
      }

      const body = (await response.json()) as {
        content?: readonly { text?: unknown }[];
        usage?: unknown;
      };

      const text = String(body.content?.[0]?.text ?? "");
      const rawOutputs = Object.fromEntries(request.outputs.map((name) => [name, text]));
      const sanitizedOutputs = await applyOutputSanitizers(rawOutputs, options.sanitizeOutput, {
        providerId: id,
        modelId: options.model,
      });
      const parsedToolCalls = parseToolUseEnvelope(text);
      const toolCalls = parsedToolCalls === null
        ? undefined
        : await validateToolCallRequests(parsedToolCalls, options.validateToolCalls);
      const usage = normalizeAnthropicUsage(body.usage);
      const normalizedUsage = normalizeAnthropicUsageToRunUsage(body.usage, options.pricing);

      return {
        rawOutputs: sanitizedOutputs,
        ...(usage !== undefined ? { usage } : {}),
        normalizedUsage,
        ...(toolCalls !== undefined ? { toolCalls } : {}),
        rawResponse: body,
      };
    },
    executeStream(request) {
      return streamAnthropicResponse({
        id,
        model: options.model,
        baseUrl,
        apiKey: options.apiKey,
        anthropicVersion,
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

async function* streamAnthropicResponse(input: {
  readonly id: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly anthropicVersion: string;
  readonly fetchImpl: typeof fetch;
  readonly request: ProviderRunRequest;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
  readonly sanitizeOutput?: SanitizeOutputOption;
  readonly validateToolCalls?: ValidateToolCallsOption;
}): ProviderStream {
  const messagesBody = await createAnthropicMessagesBody({
    model: input.model,
    request: input.request,
    stream: true,
  });
  const streamBodyStr = JSON.stringify(messagesBody.body);
  assertNoPublicUrlEgress(input.request, input.id, streamBodyStr);
  const response = await input.fetchImpl(`${input.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": input.apiKey,
      "anthropic-version": input.anthropicVersion,
      ...(messagesBody.usesFilesApi
        ? { "anthropic-beta": "files-api-2025-04-14" }
        : {}),
    },
    body: streamBodyStr,
    ...(input.request.signal !== undefined ? { signal: input.request.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`Anthropic provider failed with ${response.status}.`);
  }

  const textParts: string[] = [];
  const rawChunks: unknown[] = [];
  const toolBlocks = new Map<number, AnthropicToolBlock>();
  const nativeToolRequests: ToolUseRequest[] = [];
  let usagePayload: Record<string, unknown> | undefined;

  for await (const event of readSseEvents(response)) {
    const data = event.data.trim();
    if (data.length === 0) {
      continue;
    }
    if (data === "[DONE]") {
      break;
    }

    const chunk = parseJsonObject(data, "Anthropic");
    rawChunks.push(event.event === undefined ? chunk : { event: event.event, data: chunk });
    usagePayload = mergeAnthropicUsage(usagePayload, usageFromAnthropicChunk(chunk));

    const eventType = eventTypeFromAnthropicChunk(chunk) ?? event.event;
    if (eventType === "content_block_start") {
      startAnthropicToolBlock(toolBlocks, chunk);
      continue;
    }
    if (eventType === "content_block_delta") {
      const text = anthropicTextDelta(chunk);
      if (text !== undefined && text.length > 0) {
        textParts.push(text);
        for (const output of input.request.outputs) {
          yield { kind: "text-delta", output, text };
        }
      }
      appendAnthropicToolInput(toolBlocks, chunk);
      continue;
    }
    if (eventType === "content_block_stop") {
      const request = completeAnthropicToolBlock(toolBlocks, chunk);
      if (request !== undefined) {
        nativeToolRequests.push(request);
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
  const usage = normalizeAnthropicUsage(usagePayload);
  const normalizedUsage = normalizeAnthropicUsageToRunUsage(usagePayload, input.pricing);

  yield {
    kind: "complete",
    rawOutputs: sanitizedOutputs,
    ...(usage !== undefined ? { usage } : {}),
    normalizedUsage,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    rawResponse: {
      kind: "anthropic-stream",
      chunks: rawChunks,
    },
  };
}

interface AnthropicToolBlock {
  readonly id: string;
  readonly name: string;
  readonly jsonParts: string[];
}

function parseJsonObject(data: string, providerName: string): unknown {
  try {
    return JSON.parse(data) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`${providerName} stream returned invalid JSON: ${message}`);
  }
}

function eventTypeFromAnthropicChunk(chunk: unknown): string | undefined {
  return isRecord(chunk) && typeof chunk.type === "string" ? chunk.type : undefined;
}

function usageFromAnthropicChunk(chunk: unknown): unknown {
  if (!isRecord(chunk)) {
    return undefined;
  }
  if (isRecord(chunk.usage)) {
    return chunk.usage;
  }
  if (isRecord(chunk.message) && isRecord(chunk.message.usage)) {
    return chunk.message.usage;
  }
  return undefined;
}

function mergeAnthropicUsage(
  current: Record<string, unknown> | undefined,
  next: unknown,
): Record<string, unknown> | undefined {
  if (!isRecord(next)) {
    return current;
  }

  return {
    ...(current ?? {}),
    ...next,
  };
}

function anthropicIndex(chunk: unknown): number | undefined {
  return isRecord(chunk) && typeof chunk.index === "number" ? chunk.index : undefined;
}

function startAnthropicToolBlock(
  blocks: Map<number, AnthropicToolBlock>,
  chunk: unknown,
): void {
  const index = anthropicIndex(chunk);
  const contentBlock = isRecord(chunk) && isRecord(chunk.content_block)
    ? chunk.content_block
    : undefined;
  if (
    index === undefined ||
    contentBlock === undefined ||
    contentBlock.type !== "tool_use" ||
    typeof contentBlock.id !== "string" ||
    typeof contentBlock.name !== "string"
  ) {
    return;
  }

  blocks.set(index, {
    id: contentBlock.id,
    name: contentBlock.name,
    jsonParts: [],
  });
}

function anthropicTextDelta(chunk: unknown): string | undefined {
  if (!isRecord(chunk) || !isRecord(chunk.delta)) {
    return undefined;
  }

  return chunk.delta.type === "text_delta" && typeof chunk.delta.text === "string"
    ? chunk.delta.text
    : undefined;
}

function appendAnthropicToolInput(
  blocks: Map<number, AnthropicToolBlock>,
  chunk: unknown,
): void {
  const index = anthropicIndex(chunk);
  if (index === undefined || !isRecord(chunk) || !isRecord(chunk.delta)) {
    return;
  }
  if (
    chunk.delta.type !== "input_json_delta" ||
    typeof chunk.delta.partial_json !== "string"
  ) {
    return;
  }

  blocks.get(index)?.jsonParts.push(chunk.delta.partial_json);
}

function completeAnthropicToolBlock(
  blocks: Map<number, AnthropicToolBlock>,
  chunk: unknown,
): ToolUseRequest | undefined {
  const index = anthropicIndex(chunk);
  if (index === undefined) {
    return undefined;
  }

  const block = blocks.get(index);
  if (block === undefined) {
    return undefined;
  }
  blocks.delete(index);

  return {
    id: block.id,
    name: block.name,
    args: parseAnthropicToolInput(block),
  };
}

function parseAnthropicToolInput(block: AnthropicToolBlock): unknown {
  const value = block.jsonParts.join("").trim();
  if (value.length === 0) {
    return {};
  }

  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON.";
    throw new Error(`Anthropic stream returned invalid tool input JSON: ${message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Anthropic uses `input_tokens` / `output_tokens` (not OpenAI's
 * `prompt_tokens` / `completion_tokens`). This helper maps to Lattice's
 * `Usage` shape and applies pricing when supplied (Phase 7 pattern).
 */
function normalizeAnthropicUsageToRunUsage(
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
    promptTokens = numberField(record, "input_tokens") ?? numberField(record, "inputTokens") ?? 0;
    completionTokens =
      numberField(record, "output_tokens") ?? numberField(record, "outputTokens") ?? 0;
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

function normalizeAnthropicUsage(usage: unknown): UsageRecord | undefined {
  if (typeof usage !== "object" || usage === null) {
    return undefined;
  }
  const record = usage as Record<string, unknown>;
  const inputTokens = numberField(record, "input_tokens");
  const outputTokens = numberField(record, "output_tokens");
  const totalTokens =
    inputTokens !== undefined && outputTokens !== undefined
      ? inputTokens + outputTokens
      : undefined;
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
