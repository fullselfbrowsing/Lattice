// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: scripts/refresh-model-registry.mjs
// Upstream: https://openrouter.ai/api/v1/models
// Regenerate with: node scripts/refresh-model-registry.mjs
// CI drift gate: .github/workflows/registry-drift.yml (weekly cron)
//
// BOOTSTRAP STATE: empty array — committed in Plan 33-02 to unblock lookup.ts
// compilation. Plan 33-04 runs scripts/refresh-model-registry.mjs against the
// live OpenRouter feed and overwrites this file with ~337 real profiles.
import type { ModelCapabilityProfile } from "./profile.js";

export const GENERATED_PROFILES = [] as const satisfies readonly ModelCapabilityProfile[];
