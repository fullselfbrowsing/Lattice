# Phase 44: Streaming Adapter Implementations - Pattern Map

**Date:** 2026-06-16
**Status:** Complete

## Files and Roles

| File | Role | Pattern |
|---|---|---|
| `packages/lattice/src/providers/adapters.ts` | OpenAI-compatible execution and wrapper base | Add shared SSE parser and `executeStream?` alongside `execute()` |
| `packages/lattice/src/providers/anthropic.ts` | Anthropic custom Messages adapter | Add native Messages SSE parser |
| `packages/lattice/src/providers/gemini.ts` | Gemini custom generateContent adapter | Add `streamGenerateContent` SSE parser |
| `packages/lattice/src/providers/parity.test.ts` | Cross-provider INV-03 matrix | Add streaming parity row/test |
| `packages/lattice/src/providers/*test.ts` | Provider-specific fake fetch tests | Add stream response fixtures |
| `packages/lattice/src/runtime/create-ai.test.ts` | Runtime streaming behavior | Reuse Phase 43 runtime assertions for provider adapters where needed |

## Reusable Patterns

### Adapter Return Shape

Existing adapters return the same response structure:

```typescript
return {
  rawOutputs: sanitizedOutputs,
  ...(usage !== undefined ? { usage } : {}),
  normalizedUsage,
  ...(toolCalls !== undefined ? { toolCalls } : {}),
  rawResponse: body,
};
```

Streaming should yield equivalent final values through `complete` chunks:

```typescript
yield {
  kind: "complete",
  rawOutputs: sanitizedOutputs,
  ...(usage !== undefined ? { usage } : {}),
  normalizedUsage,
  ...(toolCalls !== undefined ? { toolCalls } : {}),
  rawResponse: { kind: "provider-stream", chunks },
};
```

### Text Deltas Plus Sanitized Final Output

Adapters should yield live `text-delta` chunks as content arrives, but also accumulate the text and yield final sanitized `rawOutputs` in a complete chunk. `collectStream()` lets complete raw outputs win, so sanitizers remain authoritative.

### OpenAI-Compatible Tool Accumulation

Use a map keyed by `delta.tool_calls[*].index`. Accumulate:

- `id`
- `function.name`
- `function.arguments`

At stream completion, parse accumulated argument JSON and validate through `validateToolCallRequests` if configured.

### Anthropic Tool Accumulation

Use `content_block_start` to create block state for `tool_use` blocks. Append `input_json_delta.partial_json` for matching indexes. On `content_block_stop`, parse JSON and validate if configured.

### Gemini Function Calls

Gemini function calls may arrive as complete `functionCall` parts. Convert `{ name, args }` to Lattice tool-use requests and validate if configured.

## Verification Patterns

- OpenAI-compatible test: fake SSE text chunks produce `ProviderStream` chunks that `collectStream()` assembles into final sanitized output.
- Wrapper test: xAI, OpenRouter, LM Studio, and LiteLLM expose inherited `executeStream?`.
- Anthropic test: `content_block_delta` text events and usage events collect correctly.
- Gemini test: streamed text parts and function-call parts collect correctly.
- Runtime parity test: `ai.run({ policy: { stream: true } })` succeeds for a streaming adapter row and issues normal outputs.

## Landmines

- Do not emit raw provider SSE events as public chunks.
- Do not emit unvalidated native tool calls as `ValidatedToolCall`.
- Do not put API keys in query strings beyond Gemini's existing execute path unless a separate auth migration phase is planned.
- Do not require `stream_options.include_usage` for all OpenAI-compatible servers.
- Do not add OpenAI/Anthropic/Gemini SDK packages.
- Do not change `ProviderRunResponse` or `RunResult` shapes.

## PATTERN MAPPING COMPLETE
