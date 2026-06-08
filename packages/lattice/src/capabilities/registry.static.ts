// Phase 33 — CAPS-05 — Static supplemental profiles.
//
// Hand-edited sibling to registry.generated.ts. Profiles for models that
// OpenRouter does not surface (direct Anthropic, direct Gemini, direct xAI,
// LM Studio local template). Lookup module merges static + generated at
// Map-build time.
//
// BOOTSTRAP STATE: empty array. Plan 33-04 populates with the 4 supplemental
// profiles (anthropic:claude-opus-4, gemini:gemini-2.5-pro, xai:grok-4,
// lm-studio:<local-template>) per CAPS-05.
import type { ModelCapabilityProfile } from "./profile.js";

export const STATIC_PROFILES = [] as const satisfies readonly ModelCapabilityProfile[];
