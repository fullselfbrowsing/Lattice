# Phase 51 Summary: Provider Execution Parity

## Status

Complete.

## What Shipped

- Added explicit provider-only native execution fields on `ProviderRunRequest`:
  - `nativeTools`
  - `nativeToolChoice`
  - `nativeStructuredOutput`
- Added `ProviderFinishMetadata` and surfaced it on buffered responses and stream complete chunks.
- Added `standardSchemaToJsonSchema` / `toolSchemaToJsonSchema` in the neutral tools module, then rewired the agent formatter to reuse it without owning schema conversion.
- Implemented native tool declaration, tool-choice, structured-output, buffered native tool-call parsing, and finish metadata for OpenAI-compatible providers.
- Implemented xAI unknown-live model preservation for new model IDs such as `grok-4-1-fast-*` when `/models` confirms the ID but the static registry has not caught up.
- Implemented Anthropic native tools and structured output through a deterministic forced synthetic `tool_use`.
- Implemented Gemini native function declarations, tool config, response schema hints, native function-call parsing, and structured JSON materialization.
- Preserved prompt-reencoded tool-call behavior, including `onFailure: "drop"` returning `toolCalls: []`.

## Files Changed

- `packages/lattice/src/providers/provider.ts`
- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/gemini.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/providers/streaming.ts`
- `packages/lattice/src/tools/schema.ts`
- `packages/lattice/src/tools.ts`
- `packages/lattice/src/providers.ts`
- `packages/lattice/src/agent/format-tools.ts`
- Provider tests for OpenAI-compatible, Anthropic, Gemini, and xAI.

## Requirement Closure

- PROV-01: Complete. Direct provider calls can pass native tool definitions and provider-native tool-choice hints.
- PROV-02: Complete. Direct provider calls can opt into native structured output materialization as object values in `rawOutputs`.
- PROV-03: Complete. xAI unknown-live `grok-4-1-fast-*` IDs remain live and inspectable instead of collapsing to an unusable registry fallback.
- PROV-04: Complete. Streaming complete chunks and collected responses preserve finish metadata.
- PROV-05: Complete. Existing `ai.run()` and `ai.runAgent()` paths keep their current behavior unless callers opt into the new provider request fields.

## Commits

- `af6a77f feat(51): add native provider execution parity`
- `6a6aa97 test(51): cover native provider execution parity`
