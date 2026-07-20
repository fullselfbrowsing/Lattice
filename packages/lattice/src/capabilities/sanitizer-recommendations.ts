// Sanitizer dispatch keys and failure-mode recommendation table.
//
// Implementations register under the SanitizerKey ids
// defined here. This module is purely the dispatch key type + recommendation
// derivation table + helper.

import type { KnownFailureMode } from "./profile.js";

/**
 * Sanitizer registration keys. Closed string-literal union;
 * adding a 4th sanitizer in v1.4 is an intentional typed breaking change
 * that mirrors the `KnownFailureMode` discipline.
 *
 * Implementations register under EXACTLY these 3 ids:
 *   - "stripReasoningTags"          — strips <think>/</think> (and model-specific) reasoning tags
 *   - "stripChatTemplateArtifacts"  — removes chat-template artifact leaks from output
 *   - "unwrapInternalEnvelope"      — extracts the user-visible payload from internal wrapper
 */
export type SanitizerKey =
  | "stripReasoningTags"
  | "stripChatTemplateArtifacts"
  | "unwrapInternalEnvelope";

/**
 * Exhaustive mapping from KnownFailureMode to SanitizerKey
 * (or null when the failure mode is not a sanitizer concern). The
 * `Record<KnownFailureMode, ...>` annotation enforces compile-time
 * exhaustiveness — adding a new mode to KnownFailureMode in v1.4+ will
 * cause a type-check failure here until it has a mapping.
 *
 * Null semantics:
 *   - system_prompt_echo     -> null (consumer-side prompt engineering, not a sanitizer)
 *   - hallucinated_tool_name -> null (tool-call validator territory)
 *   - malformed_tool_arguments -> null (tool-call validator territory)
 *   - premature_termination  -> null (consumer-side max_tokens config)
 */
export const SANITIZER_BY_FAILURE_MODE: Record<KnownFailureMode, SanitizerKey | null> = {
  internal_envelope_leak: "unwrapInternalEnvelope",
  reasoning_tag_leak: "stripReasoningTags",
  template_artifact_leak: "stripChatTemplateArtifacts",
  system_prompt_echo: null,        // consumer-side prompt engineering, not a sanitizer
  hallucinated_tool_name: null,    // tool-call validator territory
  malformed_tool_arguments: null,  // tool-call validator territory
  premature_termination: null,     // consumer-side max_tokens config
} as const;

/**
 * Maps a list of known failure modes through the recommendation
 * table and filters nulls. `recommendedSanitizers` always contains real keys.
 *
 * Implementation:
 *   - Iterates modes in input order (Set insertion order)
 *   - Skips null entries
 *   - Deduplicates via Set (so repeated modes yield one key)
 *   - Returns a readonly array (frozen via spread)
 *
 * Consumers use this to populate `NegotiatedCapabilities.recommendedSanitizers`.
 * Implementations register under the same key ids.
 */
export function getRecommendedSanitizers(
  modes: readonly KnownFailureMode[],
): readonly SanitizerKey[] {
  const seen = new Set<SanitizerKey>();
  for (const mode of modes) {
    const key = SANITIZER_BY_FAILURE_MODE[mode];
    if (key !== null) seen.add(key);
  }
  return [...seen];
}
