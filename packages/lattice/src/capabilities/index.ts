// Local barrel for capability profiles, lookup, negotiation, and sanitizer
// recommendations. The package root re-exports this public surface.

export type {
  CapabilityAdapter,
  KnownFailureMode,
  ModelCapabilityProfile,
  ModelCapabilityProfileModality,
  ModelCapabilityProfilePricing,
  ModelCapabilityProfilePricingKey,
  ReasoningSurface,
  RecommendedPromptStrategy,
  ToolCallSurface,
  TrainingClass,
} from "./profile.js";
export { ALL_KNOWN_FAILURE_MODES, ALL_TRAINING_CLASSES } from "./profile.js";
export {
  findCapabilityProfile,
  getCapabilityProfile,
  stripOpenRouterVariant,
} from "./lookup.js";
// Sanitizer dispatch keys and recommendation table.
export type { SanitizerKey } from "./sanitizer-recommendations.js";
export {
  SANITIZER_BY_FAILURE_MODE,
  getRecommendedSanitizers,
} from "./sanitizer-recommendations.js";
// Capability negotiation types and helpers.
export type { NegotiatedCapabilities } from "./negotiate.js";
export {
  NegotiationAuthError,
  negotiateCapabilities,
  synthesizeNegotiatedCapabilitiesFromRegistry,
} from "./negotiate.js";
