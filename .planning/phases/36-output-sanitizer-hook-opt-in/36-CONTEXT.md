# Phase 36: Output Sanitizer Hook (opt-in) - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 36 delivers opt-in output sanitization for the 7 first-party provider
adapters. It adds adapter factory options for composing sanitizers, ships three
built-in sanitizer implementations under the Phase 34 `SanitizerKey` ids, and
proves the `session_1780792387779` internal-envelope leak is cleaned before the
consumer sees the output. Tool-call validation, hallucinated tool names, and
malformed tool argument validation remain Phase 37 scope.

</domain>

<decisions>
## Implementation Decisions

### Public API Shape

- **D-01:** Add a small `packages/lattice/src/sanitizers/` module and root exports
  for `stripReasoningTags`, `stripChatTemplateArtifacts`,
  `unwrapInternalEnvelope`, and the minimal supporting types.
- **D-02:** Built-ins should be factory functions returning a sanitizer function:
  `stripReasoningTags()`, `stripChatTemplateArtifacts()`, and
  `unwrapInternalEnvelope(...)`. This matches the roadmap wording and lets future
  phases add options without changing the call shape.
- **D-03:** Adapter factory options accept
  `sanitizeOutput?: SanitizerFn | readonly SanitizerFn[]`. No global
  `createAI({ sanitizeOutput })` runtime option in this phase; the roadmap
  explicitly scopes the option to each adapter.
- **D-04:** Reuse the exact Phase 34 `SanitizerKey` ids. Do not introduce a
  parallel sanitizer registry or new key vocabulary in Phase 36.
- **D-05:** `SanitizerFn` operates on text and returns text, synchronously or
  asynchronously. It receives lightweight context such as provider id, model id
  when known, and output name. Avoid passing API keys, request headers, or full
  raw provider responses to sanitizer functions.

### Sanitizer Behavior

- **D-06:** Sanitizers apply only to string-valued `rawOutputs`. Non-string
  values pass through unchanged so structured JSON outputs, citation arrays, and
  artifact refs are not accidentally rewritten.
- **D-07:** Built-in sanitizers are fail-safe no-ops when the expected pattern is
  absent. A response that does not contain reasoning tags, chat-template
  artifacts, or an unwrap-ready JSON envelope must remain byte-identical except
  for deliberate trimming around removed artifacts.
- **D-08:** Custom sanitizer exceptions should propagate through the existing
  adapter `execute()` failure path. Do not add a new public `SanitizerError`
  type in this phase unless planning discovers an existing local error pattern
  that makes it essentially free.
- **D-09:** `stripReasoningTags()` removes model reasoning wrapper content such as
  `<think>...</think>`, `<reasoning>...</reasoning>`, and
  `<scratchpad>...</scratchpad>`, including common DeepSeek/Qwen-style leading
  reasoning blocks. It should be conservative around ordinary user-visible text.
- **D-10:** `stripChatTemplateArtifacts()` removes leaked chat template tokens
  such as `<|im_start|>`, `<|im_end|>`, `[INST]`, `[/INST]`, `<<SYS>>`, and
  `<</SYS>>`, plus adjacent role wrappers when they are clearly template
  artifacts.
- **D-11:** `unwrapInternalEnvelope(...)` primarily supports explicit extraction
  by dotted path or `{ field: "summary" }`, because the anchor case is
  `{"summary":"Greeted the user."}`. Schema-based usage can be supported as a
  validation guard, but extraction must still be deterministic. If the field/path
  is missing, non-string, the parsed value is not an object, or JSON parsing
  fails, the sanitizer returns the original text unchanged.
- **D-12:** `unwrapInternalEnvelope({ field: "summary" })` is the required anchor
  path for `session_1780792387779`.

### Provider Integration

- **D-13:** Sanitization runs inside each adapter after provider response text is
  extracted into `rawOutputs` and before the adapter returns `ProviderRunResponse`.
  This means runtime validation, tripwires, receipts, and consumer `outputs` see
  the sanitized value.
- **D-14:** `rawResponse` remains the original provider response. Lattice should
  preserve the raw provider envelope for inspection/replay while surfacing
  sanitized `rawOutputs` to validation and consumers.
- **D-15:** `sanitizeOutput` absent means exact current behavior. Existing v1.2
  and v1.3 consumers must not see behavior changes unless they opt in.
- **D-16:** OpenRouter, xAI, and LM Studio wrap or delegate to the
  OpenAI-compatible adapter today. Planning should avoid double-sanitizing these
  wrappers: either pass the option down to the inner adapter once or wrap the
  returned response once, not both.
- **D-17:** Apply the sanitizer pipeline to every requested string output name in
  `response.rawOutputs`. The current adapters commonly map one provider text to
  all requested output names, so the helper should preserve output-key shape.

### Observability and Tests

- **D-18:** Do not add a new `RunEventKind` for each sanitizer application in this
  phase. Sanitizer traces risk leaking sensitive output text and are not required
  by the roadmap. Existing `afterProviderCall` hooks will observe sanitized
  `rawOutputs`; `rawResponse` stays available for inspection.
- **D-19:** Tests must cover the three built-ins directly, no-op behavior, custom
  sanitizer composition order, adapter option wiring across all 7 first-party
  adapters, root public exports, package type tests, and a changeset.
- **D-20:** The anchor reproduction test must use the `session_1780792387779`
  shape and assert OpenRouter with `sanitizeOutput: unwrapInternalEnvelope({
  field: "summary" })` returns `Greeted the user.` rather than the JSON envelope.
- **D-21:** Phase 36 should author and complete `SANITIZE-01` through
  `SANITIZE-04` in `.planning/REQUIREMENTS.md` before or during planning so the
  roadmap coverage count moves from 68 authored REQ-IDs to 72.

### the agent's Discretion

The planner may decide exact helper names for internal plumbing, test file split,
and whether sanitizer pipeline utilities are public or internal. Keep the public
surface small and aligned with the existing package-root export discipline.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope

- `.planning/ROADMAP.md` — Phase 36 goal, success criteria, and stable publish
  dependency.
- `.planning/REQUIREMENTS.md` — Existing v1.3 requirements file; Phase 36 must add
  detailed `SANITIZE-*` requirements before claiming coverage.
- `.planning/STATE.md` — Current milestone state: Phase 36 is ready to plan after
  Phase 35 completion.

### Prior Decisions

- `.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-CONTEXT.md`
  — `KnownFailureMode` vocabulary and `session_1780792387779` anchor case.
- `.planning/phases/34-adapter-quirk-flags-capability-negotiation-api/34-CONTEXT.md`
  — `SanitizerKey` ids, failure-mode-to-sanitizer mapping, and
  `recommendedSanitizers` coupling.
- `.planning/phases/35-prompt-scaffolding-helpers/35-CONTEXT.md` — Prompt scaffold
  guard decisions for the same open-weight leak class.

### Code Surfaces

- `packages/lattice/src/capabilities/sanitizer-recommendations.ts` — Existing
  `SanitizerKey`, `SANITIZER_BY_FAILURE_MODE`, and `getRecommendedSanitizers`.
- `packages/lattice/src/providers/provider.ts` — `ProviderAdapter`,
  `ProviderRunRequest`, and `ProviderRunResponse` contracts.
- `packages/lattice/src/runtime/create-ai.ts` — Runtime calls `adapter.execute()`
  then `validateOutputMap`; sanitizer output must be visible before validation.
- `packages/lattice/src/providers/adapters.ts` — OpenAI/OpenAI-compatible adapter
  implementation and the likely shared sanitizer plumbing point.
- `packages/lattice/src/providers/anthropic.ts`, `packages/lattice/src/providers/gemini.ts`,
  `packages/lattice/src/providers/xai.ts`, `packages/lattice/src/providers/openrouter.ts`,
  `packages/lattice/src/providers/lm-studio.ts` — First-party adapter factories that
  must accept the opt-in option.
- `packages/lattice/src/providers/fake.ts` — Test adapter pattern for deterministic
  provider responses.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `SanitizerKey` already exists in `packages/lattice/src/capabilities/sanitizer-recommendations.ts`.
  Phase 36 should implement the functions registered under those exact ids.
- `getRecommendedSanitizers` already maps `internal_envelope_leak` to
  `unwrapInternalEnvelope`, `reasoning_tag_leak` to `stripReasoningTags`, and
  `template_artifact_leak` to `stripChatTemplateArtifacts`.
- All current first-party adapters return provider text through
  `ProviderRunResponse.rawOutputs`, usually mapping the same extracted text to
  each requested output name.

### Established Patterns

- Public API additions are re-exported from `packages/lattice/src/index.ts` with a
  phase-labeled block.
- Adapter options are per-factory option-bag additions and are optional for
  backward compatibility.
- OpenRouter, xAI, and LM Studio compose the OpenAI-compatible adapter rather than
  duplicating execute logic. Phase 36 should preserve that composition.
- Runtime validation currently consumes `response.rawOutputs` directly after
  `adapter.execute()`, making adapter-local sanitization the narrowest integration
  point.

### Integration Points

- New sanitizer module: `packages/lattice/src/sanitizers/`.
- Provider interface option types: likely in each adapter option interface, with a
  shared `SanitizeOutputOption` type to avoid repeated unions.
- Adapter execute return path: apply sanitizer pipeline before returning
  `ProviderRunResponse`.
- Tests: direct sanitizer tests under `packages/lattice/test/` or
  `packages/lattice/src/sanitizers/*.test.ts`; adapter wiring tests in existing
  provider test files; tsd test under `packages/lattice/test-d/`.

</code_context>

<specifics>
## Specific Ideas

- Required anchor: `session_1780792387779`, `openai/gpt-oss-120b`, OpenRouter
  `:free` variant, prior leak output `{"summary":"Greeted the user."}`.
- Required consumer-visible sanitized output for the anchor: `Greeted the user.`
- Keep raw inspection intact: `rawResponse` should still contain the original
  provider response while `rawOutputs.text` is sanitized.
- Built-ins should be boring string transforms with strong no-op behavior. Avoid
  creating a policy engine, registry DSL, or runtime-level sanitizer orchestrator
  in this phase.

</specifics>

<deferred>
## Deferred Ideas

- Tool-call name and argument validation belongs to Phase 37.
- New sanitizer recommendation keys beyond the Phase 34 three-key union are v1.4+
  unless a Phase 36 implementation blocker proves otherwise.
- Sanitizer observability events can be revisited after OpenTelemetry/exporter
  work; avoid event payloads that could leak sensitive model output in v1.3.

</deferred>

---

*Phase: 36-output-sanitizer-hook-opt-in*
*Context gathered: 2026-06-09*
