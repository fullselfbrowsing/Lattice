// Phase 33 — D-05 / D-06 / D-12 / D-13 / D-14 — Public capability profile types.
// CAPS-01 surface.
//
// `ModelCapabilityProfile` is a sibling to `ModelCapability` (in
// `../providers/provider.ts`), not a replacement. `ModelCapability` tracks
// modality + cost + tool-use + streaming on the router-facing capability
// catalog. `ModelCapabilityProfile` tracks training lineage, reasoning
// surface, tool-call surface, known failure modes, and recommended prompt
// strategy on the consumer-facing capability registry. Both surfaces are
// queried at run construction time but answer orthogonal questions.

/**
 * Closed enum of the 7 Lattice transport adapters (D-06). Adding a new
 * adapter is a typed breaking change. Phase 34 quirk dispatch reads this
 * field.
 */
export type CapabilityAdapter =
  | "openrouter"
  | "anthropic"
  | "openai"
  | "openai-compat"
  | "xai"
  | "gemini"
  | "lm-studio";

/**
 * Closed enum of the 5 training-lineage buckets (D-14). Receipt v1.2
 * (Phase 38) carries this value verbatim via the `modelClass` field.
 * Stable across model patches — gpt-4o-2024-05-13 and gpt-4o-2024-08-06
 * share a trainingClass so receipts remain comparable across rebuilds.
 */
export type TrainingClass =
  | "frontier_rlhf"
  | "mid_tier_rlhf"
  | "open_weight_instruct"
  | "open_weight_base"
  | "local_quantized";

/**
 * Closed enum of the 5 recommended prompt-tuning buckets (research open
 * question 2). DISTINCT from `TrainingClass`: `reasoning` is orthogonal
 * to lineage (a frontier RLHF model with hidden_cot routes to the
 * `reasoning` strategy bucket); `local` is the granularity boundary
 * for the deployed-locally strategy bucket (vs the `local_quantized`
 * lineage signal). Phase 35 prompt-scaffold dispatch reads this field.
 */
export type RecommendedPromptStrategy =
  | "frontier"
  | "mid_tier"
  | "open_weight"
  | "reasoning"
  | "local";

/**
 * Closed enum of the 7 known model-class output-shape failure modes at
 * v1.3.0 (D-12). Adding a member in v1.4+ is an intentional typed
 * breaking change — Phase 36 sanitizer dispatch enforces exhaustiveness
 * via a `_exhaustive: never` switch (see test-d/capabilities.test-d.ts).
 */
export type KnownFailureMode =
  | "internal_envelope_leak"
  | "reasoning_tag_leak"
  | "system_prompt_echo"
  | "template_artifact_leak"
  | "hallucinated_tool_name"
  | "malformed_tool_arguments"
  | "premature_termination";

/**
 * Closed enum of the 5 reasoning-surface shapes a model exposes. Drives
 * the Phase 36 sanitizer's choice of leak-cleanup pass (e.g., `<think>`
 * tag stripping for `inlined_tags`).
 */
export type ReasoningSurface =
  | "none"
  | "hidden_cot"
  | "inlined_tags"
  | "interleaved_thinking"
  | "streamed_reasoning";

/**
 * Closed enum of the 5 tool-call surface shapes a model exposes. Drives
 * the Phase 37 tool-call validator's choice of arguments parser.
 */
export type ToolCallSurface =
  | "none"
  | "native_strict"
  | "native_lenient"
  | "json_only"
  | "text_only";

/**
 * Phase 33 — D-05 / D-08 — Capability profile for one (adapter, model)
 * pair. Sibling to `ModelCapability`, not a replacement. Built-time baked
 * via the OpenRouter snapshot generator (Phase 33-03) plus hand-edited
 * supplemental static profiles (Phase 33-04).
 *
 * Canonical key: `${adapter}:${modelId}` — one profile per (adapter,
 * model) pair. `openrouter:openai/gpt-oss-120b` and `openai:gpt-oss-120b`
 * are two distinct entries with the same `originFamily: "openai"`.
 */
export interface ModelCapabilityProfile {
  /**
   * The model identifier as the adapter sees it. For OpenRouter this is
   * the `vendor/model` shape (e.g., `openai/gpt-oss-120b`); for direct
   * adapters this is the provider's native id (e.g., `claude-opus-4`).
   * Combined with `adapter` to form the canonical lookup key `${adapter}:${id}` (D-08).
   */
  readonly id: string;
  /**
   * The Lattice transport adapter that ships this profile (D-05 /
   * D-06). Phase 34 adapter-quirk dispatch reads this field. Closed
   * union of 7 values.
   */
  readonly adapter: CapabilityAdapter;
  /**
   * The model creator (D-07). Open extensible string — new orgs emerge
   * frequently and should not break the type. Examples: `openai`,
   * `anthropic`, `meta`, `mistral`, `google`, `xai`, `deepseek`, `qwen`.
   * Phase 35 prompt-scaffold dispatch falls back to
   * `recommendedPromptStrategy` for unknown originFamily values.
   */
  readonly originFamily: string;
  /**
   * Training-lineage classification (D-14). Receipt v1.2 `modelClass`
   * (Phase 38) carries this value verbatim. Drives the failure-mode
   * default set in the classifier.
   */
  readonly trainingClass: TrainingClass;
  /**
   * Shape of the model's reasoning output. Drives the Phase 36
   * sanitizer's reasoning-leak cleanup pass.
   */
  readonly reasoningSurface: ReasoningSurface;
  /**
   * Shape of the model's tool-call output. Drives the Phase 37
   * tool-call validator's arguments parser.
   */
  readonly toolCallSurface: ToolCallSurface;
  /**
   * The actual context window the adapter will accept on a request, in
   * tokens. For OpenRouter this is `top_provider.context_length ?? context_length`
   * (Phase 33 Pitfall 2) — what OpenRouter routing actually offers, not
   * the model card's aspirational maximum.
   */
  readonly contextWindow: number;
  /**
   * Failure modes this model class is known to exhibit (D-14). Class-
   * derived defaults plus per-family overrides. Phase 36 sanitizer
   * dispatch exhaustively switches on each entry.
   */
  readonly knownFailureModes: readonly KnownFailureMode[];
  /**
   * Recommended prompt-tuning bucket (research open question 2). Phase
   * 35 prompt-scaffold dispatch reads this field. Distinct from
   * `trainingClass` — see `RecommendedPromptStrategy` JSDoc.
   */
  readonly recommendedPromptStrategy: RecommendedPromptStrategy;
}

/**
 * Frozen list of every `KnownFailureMode` member. Useful for exhaustive
 * iteration in downstream tests and Phase 36 sanitizer registration.
 * Adding a new mode requires updating this array AND the
 * `KnownFailureMode` union AND the Phase 36 exhaustive switch — the
 * `satisfies` clause enforces array-vs-union parity at compile time.
 */
export const ALL_KNOWN_FAILURE_MODES = [
  "internal_envelope_leak",
  "reasoning_tag_leak",
  "system_prompt_echo",
  "template_artifact_leak",
  "hallucinated_tool_name",
  "malformed_tool_arguments",
  "premature_termination",
] as const satisfies readonly KnownFailureMode[];

/**
 * Frozen list of every `TrainingClass` member. Useful for exhaustive
 * iteration when constructing the failure-mode defaults table (D-14)
 * and for Phase 38 receipt-class enumeration.
 */
export const ALL_TRAINING_CLASSES = [
  "frontier_rlhf",
  "mid_tier_rlhf",
  "open_weight_instruct",
  "open_weight_base",
  "local_quantized",
] as const satisfies readonly TrainingClass[];
