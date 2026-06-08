// Phase 33 — CAPS-05 — Static supplemental profiles.
//
// Hand-edited sibling to registry.generated.ts. Profiles for models that
// OpenRouter does not surface (or that consumers reach through Lattice's
// direct adapters rather than through OpenRouter routing). The lookup
// module merges STATIC_PROFILES + GENERATED_PROFILES at Map-build time;
// direct adapters (anthropic, gemini, xai, lm-studio) win over the
// openrouter routing equivalent per D-10 ADAPTER_ORDER.
//
// Source-file order is alphabetical by canonical key for human review
// ease. The runtime lookup order is governed by ADAPTER_ORDER in
// lookup.ts and is INDEPENDENT of source-file order.
//
// Rationale (cited in CONTEXT.md <specifics> and PLAN.md):
//   - anthropic:claude-opus-4   — direct Anthropic, frontier_rlhf;
//                                 contextWindow 200000 matches Anthropic's
//                                 published max for Opus-class.
//   - gemini:gemini-2.5-pro     — direct Gemini, frontier_rlhf;
//                                 contextWindow 2097152 (2M) matches
//                                 Google's published 2M-token max for 2.5 Pro.
//   - lm-studio:local-template  — generic local-quantized template (A7);
//                                 contextWindow 8192 is a sensible default;
//                                 consumers parameterize via their LM Studio
//                                 configuration if they need a different value.
//                                 Carries the full FAILURE_MODE_DEFAULTS.local_quantized
//                                 set per D-14: internal_envelope_leak,
//                                 system_prompt_echo, template_artifact_leak,
//                                 malformed_tool_arguments, premature_termination.
//   - xai:grok-4                — direct xAI, frontier_rlhf;
//                                 contextWindow 131072 matches xAI's
//                                 published 128K-token max.
//
// All 3 frontier profiles have empty knownFailureModes (matches
// FAILURE_MODE_DEFAULTS.frontier_rlhf which is []).
import type { ModelCapabilityProfile } from "./profile.js";

export const STATIC_PROFILES = [
  {
    id: "claude-opus-4",
    adapter: "anthropic",
    originFamily: "anthropic",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 200000,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier",
  },
  {
    id: "gemini-2.5-pro",
    adapter: "gemini",
    originFamily: "google",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_strict",
    contextWindow: 2097152,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier",
  },
  {
    id: "local-template",
    adapter: "lm-studio",
    originFamily: "unknown",
    trainingClass: "local_quantized",
    reasoningSurface: "none",
    toolCallSurface: "none",
    contextWindow: 8192,
    knownFailureModes: [
      "internal_envelope_leak",
      "system_prompt_echo",
      "template_artifact_leak",
      "malformed_tool_arguments",
      "premature_termination",
    ],
    recommendedPromptStrategy: "local",
  },
  {
    id: "grok-4",
    adapter: "xai",
    originFamily: "xai",
    trainingClass: "frontier_rlhf",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: [],
    recommendedPromptStrategy: "frontier",
  },
] as const satisfies readonly ModelCapabilityProfile[];
