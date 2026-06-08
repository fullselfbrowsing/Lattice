// Phase 33 — CAPS-01 local barrel for the capabilities surface.
// Re-exported by ../../index.ts per PKG-01 / INDEX-01 v1.2 discipline.
// Plans 33-02 / 33-04 will append `getCapabilityProfile`,
// `findCapabilityProfile`, `stripOpenRouterVariant` to this barrel
// alongside the static + generated registries.

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
