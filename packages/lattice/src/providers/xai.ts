import type { ProviderAdapter } from "./provider.js";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from "./adapters.js";

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
 * DEFERRED (Phase 4 carryforward notes):
 *   - tool-streaming -- deferred
 *   - streaming      -- deferred (single-shot Promise per CONTEXT.md D-06)
 *   - resume-from-eviction -- see Phase 5 (MV3-survivability adapter contract)
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-03 + D-07: thin wrapper; reasoning_tokens quirk preserved).
 */
export interface XaiProviderOptions extends Omit<OpenAICompatibleProviderOptions, "id" | "baseUrl"> {
  readonly id?: string;
  /** Defaults to `https://api.x.ai/v1`. Override for proxies. */
  readonly baseUrl?: string;
}

const DEFAULT_XAI_BASE_URL = "https://api.x.ai/v1";

export function createXaiProvider(options: XaiProviderOptions): ProviderAdapter {
  const inner = createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "xai",
    baseUrl: options.baseUrl ?? DEFAULT_XAI_BASE_URL,
  });
  const innerExecute = inner.execute;
  if (innerExecute === undefined) {
    return inner;
  }
  return {
    ...inner,
    async execute(request) {
      const response = await innerExecute(request);
      // D-07: PRESERVE xAI's `completion_tokens_details.reasoning_tokens`
      // quirk. The default OpenAI-compat usage extractor does not surface
      // reasoning_tokens; we inspect rawResponse and augment the legacy
      // UsageRecord when the field is present. The Phase 7 normalized
      // `Usage` (promptTokens/completionTokens/costUsd) is unchanged by
      // design -- normalized usage represents billable tokens; reasoning_tokens
      // is xAI-extra-counts that consumers access via rawResponse for now.
      const raw = response.rawResponse as
        | {
            usage?: {
              completion_tokens_details?: { reasoning_tokens?: unknown };
            };
          }
        | undefined;
      const reasoningTokens = raw?.usage?.completion_tokens_details?.reasoning_tokens;
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
    },
  };
}
