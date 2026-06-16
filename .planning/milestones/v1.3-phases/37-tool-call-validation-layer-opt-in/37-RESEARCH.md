# Phase 37 Research: Tool-Call Validation Layer (opt-in)

## Research Complete

Phase 37 adds an opt-in validation layer for model-returned tool calls. The
current Lattice agent loop does not use provider-native tool APIs; it uses a
prompt-reencoded JSON envelope parsed by `formatToolsForProvider`. Planning
should therefore validate that existing normalized envelope first and avoid
expanding provider-native request formats in this phase.

## Current Code Shape

The relevant response contract is `ProviderRunResponse` in
`packages/lattice/src/providers/provider.ts`. It currently carries
`rawOutputs`, optional artifact refs, usage, normalized usage, and `rawResponse`.
There is no normalized returned tool-call list yet.

The existing prompt-reencoded parser is in
`packages/lattice/src/agent/format-tools.ts`. It extracts
`{"tool_calls":[{"id":"...","name":"...","args":{...}}]}` from bare JSON,
markdown fenced JSON, and prose-wrapped JSON. Parsed calls are shaped as
`ToolUseRequest` from `packages/lattice/src/agent/types.ts`.

The agent runtime in `packages/lattice/src/agent/runtime.ts` currently calls
`handle.parseToolUse(responseText)`, then looks up `intent.tools.find((t) =>
t.name === req.name)`. Unknown tools become ordinary tool-result error JSON
today. Phase 37 should change that only when validation is enabled by making the
agent prefer adapter-supplied validated calls.

The local tool registry is already modeled by `ToolDefinition` in
`packages/lattice/src/tools/tools.ts`. `runTool` validates inputs through
`validateSchemaOutput` in `packages/lattice/src/outputs/validate.ts`, which
normalizes Standard Schema issues to Lattice's `ValidationIssue` shape. Phase 37
should reuse this path rather than invent a parallel schema abstraction.

## Public API Direction

Add a focused validator module, recommended path:

- `packages/lattice/src/tools/tool-call-validation.ts`

Public exports should include:

- `ToolCallValidationError`
- `ToolCallValidationFailureReason`
- `ValidateToolCallsOption`
- `ValidatedToolCall`
- a shared helper such as `validateToolCallRequests(...)`

`ValidateToolCallsOption` should accept:

```ts
{
  tools: readonly ToolDefinition[];
  onFailure?: "throw" | "drop" | "callback";
  onValidationFailure?: (error: ToolCallValidationError) => void | Promise<void>;
  allowExtraFields?: boolean;
}
```

Default `onFailure` is `"throw"` because the feature is opt-in. Callback mode
must require the callback and then behave like drop for the returned list: invalid
calls are reported, not executed.

Add optional `toolCalls?: readonly ValidatedToolCall[]` to
`ProviderRunResponse`. `rawOutputs` and `rawResponse` must remain unchanged for
inspection/replay.

## Validation Semantics

Validation distinguishes three failure reasons:

- `unknown_tool`: tool name is not present in the provided registry.
- `invalid_args`: the tool exists, but schema validation fails.
- `extra_fields`: the raw argument object includes fields outside the Zod object
  shape and `allowExtraFields` is not true.

`ToolCallValidationError` should carry:

- `kind: "tool-call-validation"`
- `reason`
- `toolName`
- `attemptedArgs`
- `validationIssues`
- `requestId`

`requestId` is the model/provider tool call id when present. If a future parser
path lacks an id, generate a deterministic per-response fallback based on order.
Do not modify receipt schema in Phase 37.

Exact `extra_fields` detection is required for Zod object schemas. For generic
Standard Schema validators where shape introspection is not available, fall back
to normal schema validation and classify failures as `invalid_args` rather than
guessing.

## Adapter Wiring

Seven real adapters are in scope:

- OpenAI-compatible: `packages/lattice/src/providers/adapters.ts`
- OpenAI: `packages/lattice/src/providers/adapters.ts`
- Anthropic: `packages/lattice/src/providers/anthropic.ts`
- Gemini: `packages/lattice/src/providers/gemini.ts`
- xAI: `packages/lattice/src/providers/xai.ts`
- OpenRouter: `packages/lattice/src/providers/openrouter.ts`
- LM Studio: `packages/lattice/src/providers/lm-studio.ts`

OpenAI, OpenRouter, xAI, and LM Studio delegate through the OpenAI-compatible
adapter family. Validation should run once in `createOpenAICompatibleProvider`
for those descendants. Do not add wrapper-local validation passes.

Anthropic and Gemini should mirror the Phase 36 sanitizer pattern: parse text
after response extraction, validate when the option is present, populate
`toolCalls`, and preserve raw provider bodies.

## Agent Runtime Integration

`runAgent` should prefer `response.toolCalls` when present. If absent, it should
keep using the existing parser path so third-party adapters and absent-option
behavior remain compatible.

When validation is enabled and an invalid call would have been returned, the
agent must not execute it. Throw mode aborts before dispatch. Drop/callback mode
dispatches only validated calls. Unknown tools under validation should not fall
through to the old "Unknown tool" tool-result JSON path.

## Test Strategy

Core tests should cover:

- unknown tool -> `ToolCallValidationError` reason `unknown_tool`
- invalid args -> reason `invalid_args` with path `["query"]`
- extra fields -> reason `extra_fields` when detectable
- `onFailure: "throw"` throws first failure in response order
- `onFailure: "drop"` omits invalid calls and returns valid ones
- `onFailure: "callback"` calls the callback once per invalid call and omits the
  invalid calls
- callback mode without callback is a configuration error
- `allowExtraFields: true` suppresses extra-field failures

Adapter tests should cover:

- absent `validateToolCalls` preserves current output behavior
- `rawOutputs` and `rawResponse` remain unchanged
- `toolCalls` is populated only when a valid tool-call envelope is returned
- wrapper providers do not double-validate
- all seven real adapters accept the option
- the roadmap typo scenario:
  `{ name: "search_database", arguments: { quer: "..." } }`

Public surface tests should cover root exports and package type imports.

## Risks And Mitigations

Native-tool scope creep is the largest risk. Mitigate by reusing the existing
prompt-reencoded parser and explicitly deferring native provider request formats.

Double validation in wrapper providers can cause duplicate callback events or
unexpected drops. Mitigate by validating only in the shared OpenAI-compatible
execution path for wrappers.

Generic Standard Schema values may not expose object keys. Mitigate by requiring
exact extra-field detection for Zod object schemas and falling back to
`invalid_args` for opaque schemas.

Hidden mutation of provider output would hurt replay and debugging. Mitigate by
preserving `rawOutputs` text and `rawResponse`, and surfacing normalized calls in
`ProviderRunResponse.toolCalls`.
