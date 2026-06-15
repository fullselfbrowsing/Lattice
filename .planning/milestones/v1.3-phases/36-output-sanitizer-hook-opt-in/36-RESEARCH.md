# Phase 36 Research: Output Sanitizer Hook (opt-in)

## Research Complete

Phase 36 adds an opt-in output sanitizer pipeline to first-party provider adapters. The sanitizer runs after provider response text is extracted into `rawOutputs` and before `ProviderRunResponse` leaves the adapter, so downstream validation, tripwires, receipts, and caller-visible values see sanitized text. `rawResponse` remains the original provider response for replay and debugging.

## Current Code Shape

`ProviderAdapter.execute()` returns `ProviderRunResponse` from `packages/lattice/src/providers/provider.ts`. The response includes `rawOutputs`, `artifactRefs`, `normalizedUsage`, deprecated `usage`, and `rawResponse`.

The runtime in `packages/lattice/src/runtime/create-ai.ts` calls the provider adapter, runs `afterProviderCall`, and immediately validates `response.rawOutputs`. Sanitization therefore belongs inside adapter execution before returning the response.

Seven real adapters are in scope:

- OpenAI-compatible: `packages/lattice/src/providers/adapters.ts`
- OpenAI: `packages/lattice/src/providers/adapters.ts`
- Anthropic: `packages/lattice/src/providers/anthropic.ts`
- Gemini: `packages/lattice/src/providers/gemini.ts`
- xAI: `packages/lattice/src/providers/xai.ts`
- OpenRouter: `packages/lattice/src/providers/openrouter.ts`
- LM Studio: `packages/lattice/src/providers/lm-studio.ts`

`createOpenAIProvider`, `createOpenRouterProvider`, `createXaiProvider`, and `createLmStudioProvider` all delegate through `createOpenAICompatibleProvider`. That shared adapter is the correct single application point for those wrapper providers; adding a second sanitizer pass in wrappers would risk double application.

`createAISdkProvider` is not counted as one of the seven real adapters for this phase. It remains out of scope unless execution discovers a public-type dependency that requires a lightweight pass-through type update.

## Existing Sanitizer Vocabulary

`packages/lattice/src/capabilities/sanitizer-recommendations.ts` already defines the Phase 34 sanitizer keys:

- `stripReasoningTags`
- `stripChatTemplateArtifacts`
- `unwrapInternalEnvelope`

Phase 36 should reuse these exact names for built-in function exports. It should not add a parallel registry vocabulary.

## Proposed Public Shape

Create `packages/lattice/src/sanitizers/` with:

- `SanitizerContext`
- `SanitizerFn`
- `SanitizeOutputOption`
- `stripReasoningTags()`
- `stripChatTemplateArtifacts()`
- `unwrapInternalEnvelope(...)`
- an internal/shared pipeline helper for adapters

Recommended types:

```ts
export interface SanitizerContext {
  readonly providerId: string;
  readonly modelId?: string;
  readonly outputName: string;
}

export type SanitizerFn = (
  text: string,
  context: SanitizerContext,
) => string | Promise<string>;

export type SanitizeOutputOption = SanitizerFn | readonly SanitizerFn[];
```

Adapter options should add:

```ts
sanitizeOutput?: SanitizeOutputOption;
```

The helper should only transform string-valued `rawOutputs`. Non-string outputs return unchanged. If `sanitizeOutput` is absent, the exact current adapter behavior should be preserved as closely as possible, including avoiding unnecessary output object cloning.

## Built-in Behavior

`stripReasoningTags()` should conservatively remove clearly delimited reasoning blocks:

- `<think>...</think>`
- `<reasoning>...</reasoning>`
- `<scratchpad>...</scratchpad>`
- common leading DeepSeek/Qwen-style reasoning sections when unambiguous

The no-match path returns the original text.

`stripChatTemplateArtifacts()` should remove clearly exposed chat-template wrappers:

- `<|im_start|>` and `<|im_end|>`
- `[INST]` and `[/INST]`
- `<<SYS>>` and `<</SYS>>`
- adjacent role wrappers only when they are clearly artifacts

The no-match path returns the original text.

`unwrapInternalEnvelope(...)` should support explicit extraction first:

- `unwrapInternalEnvelope("summary")`
- `unwrapInternalEnvelope({ field: "summary" })`
- `unwrapInternalEnvelope({ path: "data.summary" })`

Schema input can act as a guard and ergonomic overload. The safest schema-only behavior is deterministic extraction only when the parsed object has exactly one string field. Ambiguous schema-only objects should no-op. Missing paths, invalid JSON, non-object JSON, and non-string extracted values should return the original text unchanged.

The anchor reproduction is:

```json
{"summary":"Greeted the user."}
```

with OpenRouter configured as:

```ts
sanitizeOutput: unwrapInternalEnvelope({ field: "summary" })
```

and visible output:

```text
Greeted the user.
```

## Test Strategy

Direct sanitizer tests should cover:

- each built-in strips expected artifacts
- each built-in is fail-safe when no pattern exists
- `unwrapInternalEnvelope` handles field, dotted path, schema guard, invalid JSON, missing path, non-string extracted value
- custom sanitizer arrays run in order
- custom sanitizer exceptions propagate

Adapter tests should cover:

- absent sanitizer preserves current outputs
- sanitizer applies to every requested string output name
- non-string output protection is exercised through the helper
- `rawResponse` remains original
- wrapper providers do not double-sanitize
- all seven real adapters accept `sanitizeOutput`
- the OpenRouter `session_1780792387779` envelope shape unwraps to `Greeted the user.`

Public surface tests should cover root exports and package type behavior.

## Risks And Mitigations

Sanitizer overreach could remove legitimate user-visible text. Mitigate with conservative regexes, no-op tests, and narrow artifact matching.

Wrapper adapters could accidentally double-sanitize through both wrapper and base adapter. Mitigate by applying the pipeline only in `createOpenAICompatibleProvider` for OpenAI-compatible descendants and adding a wrapper test that detects double application.

Sanitizers could leak sensitive provider metadata through context. Mitigate by passing only provider id, model id when known, and output name. Do not pass API keys, request headers, full request payloads, or raw provider response.

Envelope parsing could become a hidden schema system. Mitigate by keeping extraction deterministic: explicit field/path wins, schema-only extraction no-ops unless exactly one string field is available.
