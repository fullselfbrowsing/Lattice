// Phase 33 — CAPS-01 / CAPS-02 local barrel for the capabilities surface.
// Re-exported by ../../index.ts per PKG-01 / INDEX-01 v1.2 discipline.
// Plan 33-04 will populate the static + generated registries; the lookup
// surface (CAPS-02) is wired below.
// Phase 34 — adds SanitizerKey + SANITIZER_BY_FAILURE_MODE + getRecommendedSanitizers
// (D-13/D-14/D-15/D-16) and NegotiatedCapabilities + NegotiationAuthError +
// negotiateCapabilities + synthesizeNegotiatedCapabilitiesFromRegistry (D-02/D-04).

export type {
  CapabilityAdapter,
  KnownFailureMode,
  ModelCapabilityProfile,
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
// Phase 34 — sanitizer dispatch keys + recommendation table (D-13/D-14/D-15/D-16)
export type { SanitizerKey } from "./sanitizer-recommendations.js";
export {
  SANITIZER_BY_FAILURE_MODE,
  getRecommendedSanitizers,
} from "./sanitizer-recommendations.js";
