// Phase 33 — CAPS-01 / CAPS-02 local barrel for the capabilities surface.
// Re-exported by ../../index.ts per PKG-01 / INDEX-01 v1.2 discipline.
// Plan 33-04 will populate the static + generated registries; the lookup
// surface (CAPS-02) is wired below.

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
