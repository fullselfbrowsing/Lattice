# Phase 37 Pattern Map: Tool-Call Validation Layer (opt-in)

## Pattern Mapping Complete

Phase 37 should follow the existing adapter-local option pattern from Phase 36
and the provider-agnostic prompt-reencoded tool-call parser from Phase 19.

## Prompt-Reencoded Tool Parser Pattern

Reference files:

- `packages/lattice/src/agent/format-tools.ts`
- `packages/lattice/src/agent/format-tools.test.ts`
- `packages/lattice/src/agent/types.ts`

Existing pattern:

1. `formatToolsForProvider(providerName, tools)` returns a handle.
2. `handle.buildTask(conversation)` embeds available tools and the tool-call
   envelope instruction in a single provider task string.
3. `handle.parseToolUse(responseText)` extracts a `tool_calls` JSON envelope.
4. Parsed calls use `{ id, name, args }` from `ToolUseRequest`.

Phase 37 should reuse or extract this parser. It should not introduce a second
JSON-envelope grammar.

## Tool Registry Validation Pattern

Reference files:

- `packages/lattice/src/tools/tools.ts`
- `packages/lattice/src/outputs/validate.ts`
- `packages/lattice/test/context-provider-replay-tools.test.ts`

Existing pattern:

1. `ToolDefinition` carries `name`, optional `description`, `inputSchema`, and
   `execute`.
2. `runTool` calls `validateSchemaOutput(tool.name, tool.inputSchema, input)`.
3. `validateSchemaOutput` normalizes Standard Schema issues into
   `ValidationIssue`.

Phase 37 should use `ToolDefinition[]` as the registry and reuse
`validateSchemaOutput` where practical.

## Adapter Option Pattern

Reference files:

- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/gemini.ts`
- `packages/lattice/src/providers/openrouter.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/providers/lm-studio.ts`
- `.planning/phases/36-output-sanitizer-hook-opt-in/36-PATTERNS.md`

Existing pattern:

1. Factory option interfaces are provider-specific.
2. Shared options are added to the relevant factory option interface.
3. Wrapper providers spread `...options` into `createOpenAICompatibleProvider`.
4. xAI wraps `execute` only to augment usage; it should not duplicate shared
   response transforms.

Phase 37 should add `validateToolCalls` to option interfaces and run validation
once per response.

## Public Export Pattern

Reference files:

- `packages/lattice/src/index.ts`
- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/*.test-d.ts`

Existing pattern:

1. Runtime values are explicitly exported from the root index.
2. Types are explicitly exported in a grouped type block.
3. Runtime public surface tests import from `../src/index.js`.
4. Package type tests import from `@full-self-browsing/lattice`.

Phase 37 should add root exports for the error class, option type, validated call
type, and reason union.

## Provider Test Pattern

Reference files:

- `packages/lattice/src/providers/adapters.test.ts`
- `packages/lattice/src/providers/anthropic.test.ts`
- `packages/lattice/src/providers/gemini.test.ts`
- `packages/lattice/src/providers/openrouter.test.ts`
- `packages/lattice/src/providers/xai.test.ts`
- `packages/lattice/src/providers/lm-studio.test.ts`
- `packages/lattice/src/providers/parity.test.ts`

Existing pattern:

1. Adapter tests use fake `fetch` functions.
2. Tests assert `rawOutputs`, usage, request shape, and `rawResponse`.
3. Parity tests iterate all seven logical providers.

Phase 37 should add focused adapter tests plus one all-seven parity pass proving
valid tool calls surface in `response.toolCalls` and invalid calls obey
`onFailure`.

## Files To Create

- `packages/lattice/src/tools/tool-call-validation.ts`
- `packages/lattice/src/tools/tool-call-validation.test.ts`
- `packages/lattice/test-d/tool-call-validation.test-d.ts`
- `.changeset/v1.3.0-tool-call-validation.md`

## Files To Modify

- `.planning/REQUIREMENTS.md`
- `packages/lattice/src/index.ts`
- `packages/lattice/src/providers/provider.ts`
- `packages/lattice/src/agent/format-tools.ts`
- `packages/lattice/src/agent/format-tools.test.ts`
- `packages/lattice/src/agent/runtime.ts`
- `packages/lattice/src/agent/runtime.test.ts`
- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/gemini.ts`
- provider tests for all seven adapters
- `packages/lattice/test/public-surface.test.ts`

## Integration Guidance

Implement the shared validator first. Then wire OpenAI-compatible and the agent
runtime so four provider factories inherit behavior. Then wire Anthropic and
Gemini and close with all-seven parity tests plus package type tests.
