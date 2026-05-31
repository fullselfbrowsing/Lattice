import type { ProviderAdapter } from "./provider.js";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from "./adapters.js";

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
}

const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function createOpenRouterProvider(options: OpenRouterProviderOptions): ProviderAdapter {
  return createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "openrouter",
    baseUrl: options.baseUrl ?? DEFAULT_OPENROUTER_BASE_URL,
  });
}
