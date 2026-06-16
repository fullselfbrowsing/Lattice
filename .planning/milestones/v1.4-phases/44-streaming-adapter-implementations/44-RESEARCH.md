# Phase 44 Research: Streaming Adapter Implementations

**Date:** 2026-06-16
**Status:** Complete

## Sources Checked

- Anthropic Messages streaming docs: https://docs.anthropic.com/en/api/messages-streaming
- Anthropic fine-grained tool streaming docs: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/fine-grained-tool-streaming
- Gemini API reference and `generateContent` docs: https://ai.google.dev/api and https://ai.google.dev/api/generate-content
- xAI streaming docs: https://docs.x.ai/developers/model-capabilities/text/streaming
- xAI function calling docs: https://docs.x.ai/developers/tools/function-calling
- OpenRouter streaming docs: https://openrouter.ai/docs/api/reference/streaming and API overview: https://openrouter.ai/docs/api/reference/overview
- LM Studio OpenAI-compatible chat-completions docs: https://lmstudio.ai/docs/developer/openai-compat/chat-completions
- LM Studio tool streaming docs: https://lmstudio.ai/docs/developer/openai-compat/tools
- LM Studio REST/API comparison: https://lmstudio.ai/docs/developer/rest

## Findings

### Anthropic

- Messages streaming uses SSE when `stream: true` is set on `/v1/messages`.
- Text arrives through `content_block_delta` events with `delta.type: "text_delta"`.
- Tool input streaming accumulates `input_json_delta.partial_json` strings for a `tool_use` block and parses them after `content_block_stop`.
- Anthropic docs explicitly warn that new event types may be added, so parsers must ignore unknown events.

### Gemini

- Gemini supports streaming through `streamGenerateContent`; docs list standard, streaming, and realtime APIs separately.
- Existing Lattice `execute()` uses `generateContent`; streaming should use the sibling `:streamGenerateContent` endpoint with the same request body and `alt=sse`.
- Streamed `GenerateContentResponse` chunks carry candidate content parts. Text parts contain `text`; function-call parts contain `functionCall`.
- Usage appears as `usageMetadata` on responses where available.

### OpenAI-Compatible Family

- OpenRouter and xAI both document SSE streaming via `stream: true`; OpenRouter notes comment payloads may appear and should be ignored.
- xAI function calling docs state that with streaming, the function call is returned whole in a single chunk rather than streamed across chunks.
- LM Studio's OpenAI-compatible `/v1/chat/completions` supports `stream`; its tool docs show streamed tool calls in `chunk.choices[0].delta.tool_calls[*].function.name` and `.arguments`, which must be accumulated.
- LM Studio changelog notes `stream_options.include_usage` support in newer versions, but Phase 44 should avoid relying on that being available everywhere. Missing usage is acceptable; runtime normalizes absent usage to unmeasured.

## Implementation Implications

- One shared OpenAI-compatible streaming parser should cover OpenAI, openai-compatible, xAI, OpenRouter, LM Studio, and LiteLLM.
- The SSE reader must handle:
  - multiple `data:` lines in one event,
  - comments and keep-alive lines,
  - `[DONE]`,
  - network chunks splitting an SSE frame,
  - malformed JSON as a provider execution error.
- Streaming adapters should still accumulate final text locally so output sanitizers and prompt-reencoded tool-call parsing can run on the assembled text.
- Native tool-call deltas should be converted to `ValidatedToolCall` only after `validateToolCallRequests` succeeds.
- Avoid new runtime dependencies; built-in `TextDecoder`, `ReadableStream`, and `fetch` are enough on Node 24.

## Risks

| Risk | Mitigation |
|---|---|
| Provider SSE shapes drift | Keep parsers lenient, ignore unknown events, and test only documented stable fields. |
| Tool-call fragments produce invalid JSON mid-stream | Accumulate fragments and parse only at completion. |
| Streaming bypasses sanitizers | Accumulate final text and yield `complete.rawOutputs` after `applyOutputSanitizers`. |
| `stream_options.include_usage` unsupported by some OpenAI-compatible servers | Do not require it in v1.4 Phase 44; parse usage if present. |
| Wrapper adapters accidentally lose inherited `executeStream?` | Add parity test across provider rows. |

## RESEARCH COMPLETE
