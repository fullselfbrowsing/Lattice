/**
 * Phase 33 — D-01 / D-03 / D-04 / D-12 / D-14 — Build-time training-class classifier.
 *
 * Hybrid strategy:
 *   1. Provider-prefix heuristic — default trainingClass + originFamily per id prefix.
 *   2. Family-substring overrides — ~20 entries for known special cases.
 *   3. Permissive fallback — open_weight_instruct with stderr WARN.
 *
 * Build-time only. Zero Lattice runtime imports. Pure Node ESM.
 *
 * CONTEXT.md decisions implemented:
 *   - D-01 hybrid strategy
 *   - D-03 family-substring override shape
 *   - D-04 unknown-policy: permissive default + visible WARN
 *   - D-12 KnownFailureMode 7-member vocabulary
 *   - D-14 class-derived defaults + per-family overrides
 *
 * RESEARCH.md pitfalls handled:
 *   - Pitfall 2 (top_provider.context_length ?? context_length — see refresh-model-registry.mjs)
 *   - Pitfall 3 (skip ~-prefixed *-latest aliases)
 *   - Pitfall 4 (variant suffix symmetry: classify base + :free with same result)
 */

/**
 * Per-trainingClass default failure-mode sets (D-14). Phase 36 sanitizer
 * dispatch will read these via `knownFailureModes`. Keep in sync with
 * `KnownFailureMode` in `packages/lattice/src/capabilities/profile.ts`.
 */
export const FAILURE_MODE_DEFAULTS = {
  frontier_rlhf: [],
  mid_tier_rlhf: ["system_prompt_echo"],
  open_weight_instruct: [
    "internal_envelope_leak",
    "system_prompt_echo",
    "malformed_tool_arguments",
  ],
  open_weight_base: [
    "internal_envelope_leak",
    "system_prompt_echo",
    "malformed_tool_arguments",
    "hallucinated_tool_name",
    "premature_termination",
  ],
  local_quantized: [
    "internal_envelope_leak",
    "system_prompt_echo",
    "template_artifact_leak",
    "malformed_tool_arguments",
    "premature_termination",
  ],
};

/**
 * Provider-prefix heuristic (D-01) covering the top OpenRouter prefixes
 * verified live as of 2026-06-08. New prefixes default to `FALLBACK` and
 * emit a stderr WARN per D-04 — add a row here once the WARN is observed.
 *
 * Note: OpenRouter uses `x-ai/` (NOT `xai/`) for Grok's vendor prefix.
 */
const PROVIDER_PREFIX_RULES = {
  openai:           { trainingClass: "frontier_rlhf", originFamily: "openai" },
  anthropic:        { trainingClass: "frontier_rlhf", originFamily: "anthropic" },
  google:           { trainingClass: "frontier_rlhf", originFamily: "google" },
  "x-ai":           { trainingClass: "frontier_rlhf", originFamily: "xai" },
  "meta-llama":     { trainingClass: "open_weight_instruct", originFamily: "meta" },
  mistralai:        { trainingClass: "open_weight_instruct", originFamily: "mistral" },
  qwen:             { trainingClass: "open_weight_instruct", originFamily: "qwen" },
  deepseek:         { trainingClass: "open_weight_instruct", originFamily: "deepseek" },
  nvidia:           { trainingClass: "open_weight_instruct", originFamily: "nvidia" },
  moonshotai:       { trainingClass: "open_weight_instruct", originFamily: "moonshot" },
  minimax:          { trainingClass: "open_weight_instruct", originFamily: "minimax" },
  "z-ai":           { trainingClass: "open_weight_instruct", originFamily: "zai" },
  "bytedance-seed": { trainingClass: "open_weight_instruct", originFamily: "bytedance" },
  amazon:           { trainingClass: "frontier_rlhf", originFamily: "amazon" },
  openrouter:       { trainingClass: "open_weight_instruct", originFamily: "openrouter" },
  cohere:           { trainingClass: "frontier_rlhf", originFamily: "cohere" },
  perplexity:       { trainingClass: "frontier_rlhf", originFamily: "perplexity" },
  ai21:             { trainingClass: "frontier_rlhf", originFamily: "ai21" },
  "01-ai":          { trainingClass: "open_weight_instruct", originFamily: "zero-one-ai" },
  thudm:            { trainingClass: "open_weight_instruct", originFamily: "thudm" },
};

const FALLBACK = { trainingClass: "open_weight_instruct", originFamily: "unknown" };

/**
 * Family-substring overrides (D-03). Match against the id AFTER stripping
 * the provider prefix AND the OpenRouter variant suffix. First hit wins.
 *
 * Each entry MAY set any of:
 *   - `trainingClass` — overrides the prefix rule's class
 *   - `reasoningSurface` — defaults to "none" otherwise
 *   - `knownFailureModesAdd` — extra modes appended after class defaults
 *
 * Roughly 20 entries; spec target per D-03 = ~20 to cover ~90% of
 * misclassifications.
 */
const FAMILY_OVERRIDES = [
  // Anthropic mid-tier (claude-haiku family) — multiple spellings observed.
  { match: "claude-haiku",      trainingClass: "mid_tier_rlhf" },
  { match: "claude-3-haiku",    trainingClass: "mid_tier_rlhf" },
  { match: "claude-3.5-haiku",  trainingClass: "mid_tier_rlhf" },
  { match: "claude-3-5-haiku",  trainingClass: "mid_tier_rlhf" },
  // OpenAI reasoning models — hidden chain-of-thought surface.
  { match: "o1",                trainingClass: "frontier_rlhf", reasoningSurface: "hidden_cot" },
  { match: "o3",                trainingClass: "frontier_rlhf", reasoningSurface: "hidden_cot" },
  // OpenAI open-weight family — anchor case study (session_1780792387779).
  { match: "gpt-oss",           trainingClass: "open_weight_instruct" },
  // Gemini Flash mid-tier vs 2.0+ frontier.
  { match: "gemini-1.5-flash",  trainingClass: "mid_tier_rlhf" },
  { match: "gemini-2.0-flash",  trainingClass: "frontier_rlhf" },
  { match: "gemini-flash",      trainingClass: "mid_tier_rlhf" },
  // Grok mini tier (`grok-mini`, `grok-3-mini`, etc.) — mid_tier_rlhf.
  { match: "grok-mini",         trainingClass: "mid_tier_rlhf" },
  // Reasoning open-weight families — reasoning_tag_leak risk (D-14).
  { match: "deepseek-r1",       reasoningSurface: "inlined_tags", knownFailureModesAdd: ["reasoning_tag_leak"] },
  { match: "qwen-qwq",          reasoningSurface: "inlined_tags", knownFailureModesAdd: ["reasoning_tag_leak"] },
  { match: "qwq",               reasoningSurface: "inlined_tags", knownFailureModesAdd: ["reasoning_tag_leak"] },
  // Llama Guard (safety) — keep as open_weight_instruct (explicit).
  { match: "llama-guard",       trainingClass: "open_weight_instruct" },
  // Mistral small mid-tier.
  { match: "mistral-small",     trainingClass: "mid_tier_rlhf" },
  // Qwen frontier (qwen-max-* family).
  { match: "qwen-max",          trainingClass: "frontier_rlhf" },
  // Nemotron — Nvidia open weight.
  { match: "nemotron",          trainingClass: "open_weight_instruct" },
  // Amazon Nova family mid-tier RLHF.
  { match: "nova-lite",         trainingClass: "mid_tier_rlhf" },
  { match: "nova-micro",        trainingClass: "mid_tier_rlhf" },
];

/**
 * Recommended-prompt-strategy bucket per trainingClass. Phase 35 scaffold
 * dispatch reads this via the emitted `recommendedPromptStrategy` field.
 * Stays in sync with the `RecommendedPromptStrategy` union in profile.ts.
 */
const PROMPT_STRATEGY_BY_CLASS = {
  frontier_rlhf:        "frontier",
  mid_tier_rlhf:        "mid_tier",
  open_weight_instruct: "open_weight",
  open_weight_base:     "open_weight",
  local_quantized:      "local",
};

/**
 * OpenRouter variant-suffix matcher (Pitfall 4). Symmetric copy of the
 * runtime helper that ships in `packages/lattice/src/capabilities/lookup.ts`
 * (Plan 33-02). Strips `:free` and `:thinking` only; other suffixes pass
 * through verbatim.
 */
const OPENROUTER_VARIANT_RE = /^([^/]+\/[^/]+):(?:free|thinking)$/;

function stripVariant(id) {
  const m = id.match(OPENROUTER_VARIANT_RE);
  return m ? m[1] : id;
}

/**
 * Infer the tool-call surface from OpenRouter's `supported_parameters`
 * array. Exposed because the generator may want to re-use it standalone.
 *
 *   - lacks "tools"                       -> "none"
 *   - has "tools" + "structured_outputs"  -> "native_strict"
 *   - has "tools" only                    -> "native_lenient"
 */
export function inferToolCallSurface(rawEntry) {
  const params = rawEntry.supported_parameters ?? [];
  if (!params.includes("tools")) return "none";
  if (params.includes("structured_outputs")) return "native_strict";
  return "native_lenient";
}

/**
 * Main classifier entrypoint. Takes a raw OpenRouter model entry; returns
 * a plain object shaped to fit `ModelCapabilityProfile` minus the fields
 * the generator fills in (`id`, `adapter`, `contextWindow`). Returns
 * `null` for `~`-prefixed `*-latest` aliases (Pitfall 3) so the generator
 * can skip them.
 *
 * Order of operations:
 *   (1) Tilde-alias short-circuit — `null` for Pitfall 3.
 *   (2) Provider-prefix rule sets default trainingClass + originFamily.
 *   (3) Family-substring overrides apply on top (first hit wins per D-03).
 *   (4) Unknown prefix policy — `open_weight_instruct` default + stderr WARN.
 *   (5) Compute failure-mode union (class defaults + extras, de-duplicated).
 *   (6) Derive recommendedPromptStrategy from the final trainingClass.
 */
export function classify(rawEntry) {
  const id = rawEntry.id;
  // (1) Pitfall 3 — skip ~latest aliases.
  if (typeof id === "string" && id.startsWith("~")) return null;

  const prefix = typeof id === "string" && id.includes("/") ? id.split("/")[0] : "";
  const stripped = typeof id === "string" ? stripVariant(id) : "";
  const afterPrefix = stripped.includes("/")
    ? stripped.split("/").slice(1).join("/")
    : stripped;

  const prefixRule = PROVIDER_PREFIX_RULES[prefix];
  // (2) prefix rule provides defaults; FALLBACK takes over on miss.
  let trainingClass = prefixRule ? prefixRule.trainingClass : FALLBACK.trainingClass;
  let originFamily = prefixRule ? prefixRule.originFamily : FALLBACK.originFamily;
  let reasoningSurface = "none";
  let extraFailureModes = [];

  // (3) family-substring overrides — first hit wins (D-03).
  for (const override of FAMILY_OVERRIDES) {
    if (afterPrefix.includes(override.match)) {
      if (override.trainingClass) trainingClass = override.trainingClass;
      if (override.reasoningSurface) reasoningSurface = override.reasoningSurface;
      if (override.knownFailureModesAdd) extraFailureModes = override.knownFailureModesAdd;
      break;
    }
  }

  // (4) D-04 unknown-prefix policy — permissive default + visible signal.
  if (!prefixRule) {
    console.warn(
      `[classifier] WARN — unknown prefix '${prefix}' for id '${id}'. Defaulting to ${FALLBACK.trainingClass}. Consider adding to PROVIDER_PREFIX_RULES.`,
    );
  }

  // (5) class defaults union with override extras (de-duplicated, order-stable).
  const baseFailureModes = FAILURE_MODE_DEFAULTS[trainingClass] ?? [];
  const seen = new Set(baseFailureModes);
  const knownFailureModes = [...baseFailureModes];
  for (const mode of extraFailureModes) {
    if (!seen.has(mode)) {
      seen.add(mode);
      knownFailureModes.push(mode);
    }
  }

  // (6) recommendedPromptStrategy derived from final trainingClass.
  return {
    originFamily,
    trainingClass,
    reasoningSurface,
    toolCallSurface: inferToolCallSurface(rawEntry),
    knownFailureModes,
    recommendedPromptStrategy: PROMPT_STRATEGY_BY_CLASS[trainingClass],
  };
}
