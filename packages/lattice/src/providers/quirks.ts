// Phase 34 — D-03 — Adapter-level capability disclosure interfaces.
// QUIRK-01 surface.
//
// D-03 discriminant-narrowing contract:
//   TypeScript cannot automatically narrow `adapter.quirks` to `AnthropicQuirks`
//   after `if (adapter.id === "anthropic")` because the `quirks` field on the
//   base `ProviderAdapter` is typed as `AdapterQuirks`. Consumers have two options:
//     1. Use the typed factory return (e.g., `const a = createAnthropicProvider({...})`
//        gives `a.quirks: AnthropicQuirks` directly since factories narrow the return type).
//     2. Cast: `(adapter.quirks as AnthropicQuirks).promptCachingSupported`.
//   Plans 02-05 document this per-adapter in the factory return type.

/**
 * Universal 5-boolean shape every first-party adapter populates (SC-1 / D-03).
 *
 * - `supportsToolChoice`     — adapter supports tool_choice / forced-tool-call mode
 * - `parallelToolCalls`      — adapter supports parallel (multi-tool) calls in one turn
 * - `structuredOutputs`      — adapter honors response_format JSON schema binding
 * - `responseFormatHonored`  — adapter treats response_format as authoritative (false
 *                              for vanilla openai-compat servers; true for OpenAI/Anthropic/Gemini)
 * - `streamingDiverges`      — streamed output differs from buffered output (true for
 *                              some self-hosted servers; false for OpenAI/Anthropic/Gemini)
 */
export interface AdapterQuirks {
  readonly supportsToolChoice: boolean;
  readonly parallelToolCalls: boolean;
  readonly structuredOutputs: boolean;
  readonly responseFormatHonored: boolean;
  readonly streamingDiverges: boolean;
}

/**
 * Anthropic adapter quirks (extends AdapterQuirks with 3 Anthropic-specific flags).
 *
 * CITED: Anthropic prompt caching docs — https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
 *   - `promptCachingSupported`: cache_control on system and user turns is supported on
 *     all active Claude models (claude-3-* and claude-*-4 families).
 *
 * CITED: Anthropic extended thinking docs — https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 *   - `extendedThinkingSupported`: thinking blocks (claude-3-7-sonnet+ and claude-*-4) available
 *     via the "thinking" request parameter.
 *
 * CITED: Anthropic tool use docs — https://docs.anthropic.com/en/docs/build-with-claude/tool-use
 *   - `toolUseInputSchemaStrict`: Anthropic tool_use blocks require strict JSON Schema in
 *     the input_schema field; the adapter enforces this at call time.
 */
export interface AnthropicQuirks extends AdapterQuirks {
  readonly promptCachingSupported: boolean;
  readonly extendedThinkingSupported: boolean;
  readonly toolUseInputSchemaStrict: boolean;
}

/**
 * OpenAI adapter quirks (extends AdapterQuirks with 2 OpenAI-specific flags).
 *
 * CITED: OpenAI structured outputs docs — https://platform.openai.com/docs/guides/structured-outputs
 *   - `strictModeSupported`: function-calling strict:true mode available on
 *     gpt-4o-2024-08-06+ and o1+ series.
 *   - `structuredOutputsTier2`: json_schema response_format mode (tier-2 structured outputs)
 *     available on gpt-4o and gpt-4o-mini series.
 */
export interface OpenAIQuirks extends AdapterQuirks {
  readonly strictModeSupported: boolean;
  readonly structuredOutputsTier2: boolean;
}

/**
 * OpenAI-compatible adapter quirks (same 5 base booleans, no new fields).
 *
 * Conservative defaults: openai-compat servers (vLLM, TGI, Ollama, custom)
 * vary widely in which response_format and tool_choice features they implement.
 * The factory populates the base fields conservatively (responseFormatHonored:
 * false, structuredOutputs: false) because the endpoint could be anything.
 * Consumers pointing at a known-good server should verify quirk values manually.
 */
export interface OpenAICompatQuirks extends AdapterQuirks {
  // No new fields — conservative base values for self-hosted openai-compat endpoints
}

/**
 * Gemini adapter quirks (extends AdapterQuirks with 3 Gemini-specific flags).
 *
 * CITED: Gemini API docs — https://ai.google.dev/api/generate-content#v1beta.GenerationConfig
 *   - `responseSchemaSupported`: responseSchema / responseJsonSchema on generateContent
 *     is available on gemini-1.5-pro+ and gemini-2.x models.
 *   - `safetySettingsConfigurable`: all 4 harm categories (HARASSMENT, HATE_SPEECH,
 *     SEXUALLY_EXPLICIT, DANGEROUS_CONTENT) can be set to BLOCK_NONE — verified in
 *     gemini.ts:50-55.
 *
 * CITED: Gemini API system instruction docs — https://ai.google.dev/api/generate-content#v1beta.GenerateContentRequest
 *   - `systemInstructionSupported`: systemInstruction field on GenerateContentRequest
 *     available on gemini-1.5+ series and later.
 */
export interface GeminiQuirks extends AdapterQuirks {
  readonly responseSchemaSupported: boolean;
  readonly safetySettingsConfigurable: boolean;
  readonly systemInstructionSupported: boolean;
}

/**
 * xAI adapter quirks (extends AdapterQuirks with 2 xAI-specific flags).
 *
 * CITED: xAI API docs — https://docs.x.ai/api/endpoints
 *   - `reasoningTokensReported`: completion_tokens_details.reasoning_tokens reported
 *     in xAI API responses — verified in xai.ts:46-72.
 *   - `logprobsSupported`: grok-4.20 silently ignores logprobs param per observed
 *     behavior; flag indicates whether logprobs fields will be populated.
 */
export interface XaiQuirks extends AdapterQuirks {
  readonly reasoningTokensReported: boolean;
  readonly logprobsSupported: boolean;
}

/**
 * OpenRouter adapter quirks (extends AdapterQuirks with 3 OpenRouter-specific flags).
 *
 * CITED: OpenRouter provider routing docs — https://openrouter.ai/docs/provider-routing
 *   - `providerRoutingArraySupported`: the `provider.order` / `provider.only` /
 *     `provider.ignore` arrays are supported for explicit routing control.
 *   - `floorPricingHints`: `max_price`, `sort: "throughput" | "price"` hints on
 *     GenerationConfig for cost-aware routing.
 *   - `allowFallbacks`: `provider.allow_fallbacks: boolean` controls whether OpenRouter
 *     retries with a different upstream provider on failure.
 */
export interface OpenRouterQuirks extends AdapterQuirks {
  readonly providerRoutingArraySupported: boolean;
  readonly floorPricingHints: boolean;
  readonly allowFallbacks: boolean;
}

/**
 * LM Studio adapter quirks (extends AdapterQuirks with 2 LM Studio-specific flags).
 *
 * CITED: lmstudio-bug-tracker — Jinja template mismatches between model training and
 * LM Studio server defaults cause output format corruption.
 *   - `customChatTemplateRiskFlag`: LM Studio servers can ship with broken chat templates
 *     that don't match the model's training template; flag signals this risk.
 *
 * VERIFIED: lm-studio.ts:35-37 — apiKey is optional for LM Studio local servers.
 *   - `noAuthRequired`: apiKey is NOT required for local LM Studio instances (no
 *     authentication by default on localhost:1234).
 */
export interface LmStudioQuirks extends AdapterQuirks {
  readonly customChatTemplateRiskFlag: boolean;
  readonly noAuthRequired: boolean;
}

/**
 * LiteLLM adapter quirks (extends AdapterQuirks with gateway-specific flags).
 *
 * LiteLLM is consumed as an OpenAI-compatible gateway. Lattice does not start,
 * embed, or depend on a LiteLLM gateway process; these flags describe the
 * helper's supported gateway metadata contract over HTTP.
 */
export interface LiteLLMQuirks extends AdapterQuirks {
  readonly gatewayMetadataSupported: boolean;
  readonly gatewayFallbacksSupported: boolean;
  readonly openAIErrorMapping: boolean;
}
