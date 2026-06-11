# Phase 37: Tool-Call Validation Layer (opt-in) - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Each of the 7 real first-party provider adapters accepts an opt-in
`validateToolCalls` option that validates model-returned tool calls against the
consumer's declared tool registry. Absent the option, adapter behavior is
unchanged. This phase validates the existing prompt-reencoded tool-call envelope
and creates a normalized validation surface; it does not implement provider-native
tool-use request formats.

</domain>

<decisions>
## Implementation Decisions

### Public API Shape

- **D-01:** Add a small tool-call validation module with public exports for
  `ToolCallValidationError`, `ValidateToolCallsOption`, `ValidatedToolCall`, and
  the minimal helper(s) needed by adapters and the agent loop. Keep the surface
  narrow and package-root exported.
- **D-02:** Adapter factory options accept
  `validateToolCalls?: ValidateToolCallsOption`. The option is adapter-local,
  mirroring Phase 36's `sanitizeOutput`; do not add a global
  `createAI({ validateToolCalls })` option in this phase.
- **D-03:** `ValidateToolCallsOption.tools` reuses the existing
  `readonly ToolDefinition[]` registry. Zod is the documented default schema
  library, but the public type should stay compatible with the existing
  Standard Schema tool surface.
- **D-04:** `onFailure` defaults to `"throw"` when validation is enabled. The
  feature is opt-in, so the safe default is fail-closed rather than silently
  accepting malformed model tool calls.
- **D-05:** Callback mode requires a callback option, named clearly
  (`onValidationFailure` or equivalent). If `onFailure: "callback"` is provided
  without a callback, treat that as a configuration error rather than silently
  falling back.

### Normalized Return Surface

- **D-06:** Add an optional `toolCalls?: readonly ValidatedToolCall[]` field to
  `ProviderRunResponse`. This is the "returned list" referenced by the roadmap.
  Keep `rawOutputs` and `rawResponse` unchanged so inspection/replay can still
  see exactly what the provider returned.
- **D-07:** `ValidatedToolCall` should preserve at least `id`, `name`, and
  validated `args`. The `id` is the provider/model-supplied tool call id when
  present; if absent, generate a deterministic per-response fallback id based on
  response order.
- **D-08:** Adapters with `validateToolCalls` parse the provider text response
  using the same prompt-reencoded envelope rules as the agent loop, validate the
  parsed calls, and populate `response.toolCalls`. They should not rewrite the
  user-visible text in `rawOutputs`.
- **D-09:** The agent runtime should prefer `response.toolCalls` when present.
  If absent, it may continue using the existing `formatToolsForProvider(...).
  parseToolUse(...)` fallback so consumer adapters remain backward-compatible.

### Failure Handling

- **D-10:** `ToolCallValidationError` carries
  `reason: "unknown_tool" | "invalid_args" | "extra_fields"`, `toolName`,
  `attemptedArgs`, `validationIssues`, and `requestId`. `requestId` is the tool
  call id/fallback id from D-07; do not change the receipt schema in Phase 37.
- **D-11:** `"throw"` throws the first `ToolCallValidationError` in response
  order. This keeps the adapter failure easy to understand and test.
- **D-12:** `"drop"` removes invalid calls from `response.toolCalls` and
  preserves valid calls. It does not execute invalid calls and does not mutate
  `rawOutputs` or `rawResponse`.
- **D-13:** `"callback"` invokes the consumer callback once per invalid call and
  then proceeds with the same returned list semantics as `"drop"`: valid calls
  remain, invalid calls are omitted. Callback mode must never allow a malformed
  call to execute by default.
- **D-14:** Unknown tool names are validation failures with reason
  `"unknown_tool"`. They should not be routed into `runTool` as ordinary
  "tool not found" execution results when validation is enabled.

### Schema Strictness

- **D-15:** Extra fields are rejected by default when Phase 37 can identify them.
  Consumers may opt in to allowing extra fields with an explicit option such as
  `allowExtraFields: true`.
- **D-16:** Exact `extra_fields` detection is required for Zod object schemas
  because the roadmap explicitly calls out Zod-backed validation. For generic
  Standard Schema tools where object shape introspection is unavailable, planners
  may fall back to schema validation issues and classify the failure as
  `"invalid_args"` rather than guessing.
- **D-17:** Reuse the existing `validateSchemaOutput` issue-normalization path
  where practical so validation issue paths match existing output/tool tests.

### Provider Integration

- **D-18:** Wire the option through all 7 real adapters:
  `createOpenAIProvider`, `createOpenAICompatibleProvider`,
  `createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`,
  `createOpenRouterProvider`, and `createLmStudioProvider`.
- **D-19:** OpenRouter, xAI, and LM Studio already delegate through the
  OpenAI-compatible adapter family. Planning should avoid double validation in
  those wrappers, following the Phase 36 sanitizer pass-through pattern.
- **D-20:** This phase does not add provider-native tool request formatting.
  Native tool-use can reuse the validator later, but Phase 37 validates the
  normalized/prompt-reencoded response shape Lattice already uses.

### Requirements and Tests

- **D-21:** Planning must author `VALID-01` through `VALID-03` in
  `.planning/REQUIREMENTS.md` before implementation so roadmap coverage moves
  from 72 authored REQ-IDs to 75 authored REQ-IDs.
- **D-22:** Regression coverage should include the shared validator directly,
  all three failure modes, all three `onFailure` modes, extra-field reject/allow
  behavior, public-surface and tsd tests, all-seven adapter parity, wrapper
  no-double-validation checks, and the roadmap typo scenario:
  `{ name: "search_database", arguments: { quer: "..." } }`.

### the agent's Discretion

The planner may decide the exact file split, callback property name, and helper
function names. Keep the public contract additive and small. Prefer existing
validation and parser utilities over introducing a parallel schema or tool-call
DSL.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope

- `.planning/ROADMAP.md` -- Phase 37 goal, success criteria, and dependency notes.
- `.planning/REQUIREMENTS.md` -- v1.3 requirement ledger; Phase 37 must author
  `VALID-01` through `VALID-03` before implementation.
- `.planning/STATE.md` -- Current milestone state and Phase 37 next-action note.

### Prior Decisions

- `.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-CONTEXT.md`
  -- `KnownFailureMode` includes `hallucinated_tool_name` and
  `malformed_tool_arguments`; `ToolCallSurface` drives the validator parser.
- `.planning/phases/34-adapter-quirk-flags-capability-negotiation-api/34-CONTEXT.md`
  -- Maps tool-call failures to Phase 37 validator territory rather than
  sanitizer territory.
- `.planning/phases/36-output-sanitizer-hook-opt-in/36-CONTEXT.md` -- Adapter
  option pattern and wrapper pass-through/no-double-processing pattern.

### Code Surfaces

- `packages/lattice/src/tools/tools.ts` -- Existing `ToolDefinition`,
  `defineTool`, `runTool`, and Standard Schema validation entrypoint.
- `packages/lattice/src/outputs/validate.ts` -- Existing `validateSchemaOutput`
  and validation issue normalization.
- `packages/lattice/src/agent/format-tools.ts` -- Existing prompt-reencoded
  `tool_calls` envelope parser and all-provider formatting mode.
- `packages/lattice/src/agent/runtime.ts` -- Agent loop dispatch path that should
  prefer validated `response.toolCalls` when present.
- `packages/lattice/src/providers/provider.ts` -- `ProviderRunResponse` and
  `ProviderAdapter` contracts where the optional `toolCalls` field and
  non-breaking adapter option integration will connect.
- `packages/lattice/src/providers/adapters.ts` -- OpenAI/OpenAI-compatible shared
  adapter implementation and wrapper integration point.
- `packages/lattice/src/providers/anthropic.ts`, `packages/lattice/src/providers/gemini.ts`,
  `packages/lattice/src/providers/xai.ts`, `packages/lattice/src/providers/openrouter.ts`,
  `packages/lattice/src/providers/lm-studio.ts` -- First-party adapter factories
  that must accept `validateToolCalls`.
- `packages/lattice/src/providers/parity.test.ts` -- All-seven provider parity
  pattern to extend for validation.
- `packages/lattice/src/agent/format-tools.test.ts` -- Existing parser scenario
  tests, including malformed and embedded `tool_calls` envelopes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ToolDefinition` in `packages/lattice/src/tools/tools.ts` already carries
  `name`, `inputSchema`, and `execute`, which is exactly the registry Phase 37
  should validate against.
- `validateSchemaOutput` in `packages/lattice/src/outputs/validate.ts` already
  normalizes Standard Schema issues into Lattice's `ValidationIssue` shape.
- `formatToolsForProvider` in `packages/lattice/src/agent/format-tools.ts`
  already extracts `{"tool_calls":[...]}` envelopes from bare JSON, fenced JSON,
  and prose-wrapped JSON across all seven providers.
- Phase 36's sanitizer helper and adapter wiring provide the closest pattern for
  opt-in adapter-local transformation without changing absent-option behavior.

### Established Patterns

- Public adapter interface changes are additive/optional on the base
  `ProviderAdapter`, with first-party factories narrowing their return types when
  they expose richer behavior.
- Root exports are explicitly managed in `packages/lattice/src/index.ts` and
  guarded by public-surface + tsd tests.
- Wrapper adapters such as OpenRouter/xAI/LM Studio generally delegate to the
  OpenAI-compatible adapter and should pass options through once.

### Integration Points

- Provider adapters parse text and return `ProviderRunResponse`; Phase 37 can add
  optional normalized `toolCalls` there without changing `rawOutputs`.
- The agent runtime currently parses tool calls after receiving raw text. It can
  prefer adapter-validated calls when available and keep the existing parse path
  for consumer adapters.

</code_context>

<specifics>
## Specific Ideas

- Roadmap anchor scenario: a fake provider/model returns
  `{ name: "search_database", arguments: { quer: "..." } }`; validation should
  flag missing `query` at path `["query"]`.
- User-visible defaults selected by workflow fallback: validate all key decision
  areas with recommended safe defaults because the interactive picker was
  unavailable in this session.

</specifics>

<deferred>
## Deferred Ideas

- Provider-native tool-use request formatting remains outside Phase 37. This
  phase should validate the existing normalized/prompt-reencoded tool-call
  surface and leave native provider APIs for a future phase.

</deferred>

---

*Phase: 37-tool-call-validation-layer-opt-in*
*Context gathered: 2026-06-09*
