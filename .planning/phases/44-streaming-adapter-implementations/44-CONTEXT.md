# Phase 44: Streaming Adapter Implementations - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 44 implements provider-specific `executeStream?` methods behind the Phase 43 normalized streaming contract. In scope: Anthropic native Messages streaming, Gemini native `streamGenerateContent`, and the OpenAI-compatible streaming path used by OpenAI, generic OpenAI-compatible, xAI, OpenRouter, LM Studio, and LiteLLM wrappers. The public contract stays unchanged: adapters emit `ProviderStreamChunk` values and runtime collection/receipts remain owned by Phase 43. Out of scope: realtime/WebSocket session APIs, multimodal request shaping beyond existing text request bodies, OpenTelemetry export, new receipt schema fields, and adding provider SDK dependencies.

</domain>

<decisions>
## Implementation Decisions

### Shared OpenAI-Compatible Path
- Implement a single SSE reader and OpenAI-compatible stream parser in the OpenAI-compatible adapter module so `createOpenAIProvider`, `createOpenAICompatibleProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider`, and `createLiteLLMProvider` inherit the same `executeStream?` behavior.
- Streaming requests should preserve the existing non-streaming request shape and add `stream: true`; provider/gateway metadata behavior from Phases 41 and 42 must remain additive.
- Text deltas should be yielded as normalized `text-delta` chunks for every requested output name, matching existing non-streaming behavior where one provider text value populates all requested outputs.
- The parser should also accumulate final text and yield a final `complete` chunk with sanitized `rawOutputs` so Phase 36 output sanitizers still apply before validation and receipts.
- OpenAI-compatible native tool-call deltas should be accumulated by tool-call index. Emit normalized tool-call chunks only after validation, and only when `validateToolCalls` is configured.

### Anthropic Path
- Use Anthropic Messages streaming over SSE by sending the same `/v1/messages` request body as `execute()` plus `stream: true`.
- Map `content_block_delta` `text_delta` values to `text-delta` chunks.
- Accumulate `tool_use` blocks from `content_block_start` and `input_json_delta` partial JSON. Emit validated tool calls at block stop or message end when validation is configured.
- Map `message_delta.usage` or final message usage to Lattice usage records where present.
- Handle unknown Anthropic event types gracefully, per Anthropic versioning guidance.

### Gemini Path
- Use `:streamGenerateContent` with `alt=sse`, preserving the existing request body shape and safety/generation config from `execute()`.
- Map streamed `candidates[].content.parts[].text` values to `text-delta` chunks.
- Map streamed `functionCall` parts to validated `tool-call` chunks when validation is configured. Gemini function calls may arrive as complete parts rather than fine-grained argument deltas.
- Map `usageMetadata` on streamed chunks or final chunks to Lattice usage records where present.

### Failure and Fallback Semantics
- If a provider stream HTTP response is non-OK, `executeStream?` throws the same provider-identifying error family used by `execute()`.
- If `policy.stream === true` and an adapter lacks `executeStream?`, Phase 43 runtime failure accounting already records that as a provider execution failure/fallback path. Phase 44 should minimize that case for the seven logical providers.
- Streaming parsers should tolerate comments, keep-alive events, `[DONE]`, unknown event names, empty data, and split chunks across network reads.

### the agent's Discretion
- The planner may choose helper module boundaries for SSE parsing and stream chunk normalization.
- The planner may decide exact test fixtures, but tests must use fake `fetch`/`ReadableStream` responses only and no live provider calls.
- The planner may decide whether LiteLLM receives explicit tests; inherited OpenAI-compatible behavior is acceptable, but parity coverage should explain it.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/providers/provider.ts` now owns `ProviderStream`, `ProviderStreamChunk`, and `ProviderAdapter.executeStream?`.
- `packages/lattice/src/providers/streaming.ts` owns `collectStream()` and final response assembly.
- `packages/lattice/src/providers/adapters.ts` is the shared OpenAI-compatible factory and is reused by OpenAI, generic OpenAI-compatible, xAI, OpenRouter, LM Studio, and LiteLLM.
- `packages/lattice/src/providers/anthropic.ts` and `packages/lattice/src/providers/gemini.ts` are custom request/response implementations and need native streaming logic.
- `packages/lattice/src/providers/parity.test.ts` already enumerates eight first-party provider rows, including LiteLLM; the seven v1.2 logical providers are all present.

### Established Patterns
- Provider adapter tests use fake `fetch` implementations and structured fake `Response` bodies; Phase 44 should add fake text/event-stream responses.
- Sanitizers are applied inside adapters before returning `ProviderRunResponse`; streaming must preserve that by overriding collected text with final sanitized `complete.rawOutputs`.
- Tool-call validation is optional and configured through `validateToolCalls`; adapters should not expose unvalidated native tool calls as `ValidatedToolCall`.
- Gateway metadata is response metadata and must not alter `ExecutionPlan.route.selected`.
- Public package surface does not need new exports in Phase 44; `executeStream?` was exported in Phase 43.

### Integration Points
- Shared SSE parsing belongs close to provider adapters, not runtime, because provider wire events are adapter-private.
- Runtime stream event bracketing and receipt issuance are already implemented in Phase 43 and should be tested through `ai.run({ policy: { stream: true } })`.
- Parity coverage should assert `executeStream` is present for the seven logical providers and produces normalized chunks under fake streams.

</code_context>

<specifics>
## Specific Ideas

Use `ReadableStream` + `TextEncoder` fixtures in tests so SSE chunk splitting is realistic. For OpenAI-compatible stream fixtures, include `data: {"choices":[{"delta":{"content":"hel"}}]}` and `data: [DONE]`. For tool-call fixtures, include `delta.tool_calls[0].function.name` and later `delta.tool_calls[0].function.arguments` chunks. For Anthropic, include `event: content_block_delta` with `delta.type: "text_delta"`. For Gemini, include SSE `data:` objects shaped like streamed `GenerateContentResponse`.

</specifics>

<deferred>
## Deferred Ideas

Realtime Responses/WebSocket event loops belong to Phase 45 or later. Native multimodal streaming inputs belong to Phase 45. OTel span/export mapping for stream events belongs to Phase 47. Live-provider contract tests remain deferred; Phase 44 should rely on official docs and fake fixtures.

</deferred>
