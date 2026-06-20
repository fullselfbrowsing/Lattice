export {
  createAISdkProvider,
  createOpenAICompatibleProvider,
  createOpenAIProvider,
} from "./providers/adapters.js";
export type {
  OpenAICompatibleProviderOptions,
  SdkLikeProviderOptions,
} from "./providers/adapters.js";
export { createAnthropicProvider } from "./providers/anthropic.js";
export type { AnthropicProviderOptions } from "./providers/anthropic.js";
export { createFakeProvider } from "./providers/fake.js";
export type { FakeProviderOptions } from "./providers/fake.js";
export { createGeminiProvider } from "./providers/gemini.js";
export type { GeminiProviderOptions } from "./providers/gemini.js";
export { createLiteLLMProvider } from "./providers/litellm.js";
export type { LiteLLMProviderOptions } from "./providers/litellm.js";
export { createLmStudioProvider } from "./providers/lm-studio.js";
export type { LmStudioProviderOptions } from "./providers/lm-studio.js";
export { createOpenRouterProvider } from "./providers/openrouter.js";
export type { OpenRouterProviderOptions } from "./providers/openrouter.js";
export { createXaiProvider } from "./providers/xai.js";
export type { XaiProviderOptions } from "./providers/xai.js";
export { collectStream } from "./providers/streaming.js";
export type { CollectStreamOptions } from "./providers/streaming.js";
export { parseToolUseEnvelope } from "./tools/tool-use.js";
export type { ToolUseRequest } from "./tools/tool-use.js";
export type {
  CapabilityModality,
  ModelCapability,
  ProviderAdapter,
  ProviderDataPolicyHints,
  ProviderGatewayMetadata,
  ProviderLatencyClass,
  ProviderPricingHint,
  ProviderRef,
  ProviderRegistryInput,
  ProviderRunRequest,
  ProviderRunResponse,
  ProviderStream,
  ProviderStreamChunk,
  ProviderStreamCompleteChunk,
  ProviderStreamGatewayChunk,
  ProviderStreamOutputChunk,
  ProviderStreamTextDeltaChunk,
  ProviderStreamToolCallChunk,
  ProviderStreamUsageChunk,
  ProviderTransportMode,
  Usage,
} from "./providers/provider.js";
export type {
  AdapterQuirks,
  AnthropicQuirks,
  GeminiQuirks,
  LiteLLMQuirks,
  LmStudioQuirks,
  OpenAICompatQuirks,
  OpenAIQuirks,
  OpenRouterQuirks,
  XaiQuirks,
} from "./providers/quirks.js";
export {
  NegotiationAuthError,
  negotiateCapabilities,
  synthesizeNegotiatedCapabilitiesFromRegistry,
} from "./capabilities/index.js";
export type { NegotiatedCapabilities } from "./capabilities/index.js";
export {
  ALL_KNOWN_FAILURE_MODES,
  ALL_TRAINING_CLASSES,
  findCapabilityProfile,
  getCapabilityProfile,
  getRecommendedSanitizers,
  stripOpenRouterVariant,
} from "./capabilities/index.js";
export type {
  CapabilityAdapter,
  KnownFailureMode,
  ModelCapabilityProfile,
  ModelCapabilityProfileModality,
  ModelCapabilityProfilePricing,
  ModelCapabilityProfilePricingKey,
  ReasoningSurface,
  RecommendedPromptStrategy,
  SanitizerKey,
  ToolCallSurface,
  TrainingClass,
} from "./capabilities/index.js";
export {
  PROMPT_SCAFFOLD_VERSION,
  PROMPT_STRATEGIES,
  getStructuredOutputContract,
  getToolUseContract,
} from "./prompts/index.js";
