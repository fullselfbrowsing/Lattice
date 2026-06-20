# Phase 51: Provider Execution Parity - Context

## Milestone

v1.5.0 Modular Adoption + Execution Parity.

## Goal

Make provider-only use strong enough for GitFly-style execution flows without forcing callers through `ai.run()` or `ai.runAgent()`.

## Requirements

- PROV-01: Provider adapters can be called directly with native tool definitions and provider-native `toolChoice`.
- PROV-02: Provider adapters can request native structured outputs and return typed object values without treating JSON schema objects as raw strings.
- PROV-03: Provider-specific model IDs, including xAI/GitFly `grok-4-1-fast-*`, remain inspectable and are not silently degraded by negotiation.
- PROV-04: Streaming provider-only paths expose step/tool finish metadata that host apps can translate into their own SSE surfaces.
- PROV-05: Existing `ai.run()` and `ai.runAgent()` behavior stays backward compatible unless a caller opts into the new provider-only execution fields.

## Current Shape

- `ProviderRunRequest` is already the common adapter request. It has task, artifacts, outputs, output contracts, policy, context pack, packaging, and cache prefix.
- `ProviderRunResponse` already has `rawOutputs`, `toolCalls`, `gateway`, and `rawResponse`.
- `ProviderStreamChunk` already supports text deltas, output chunks, usage, gateway, tool-call chunks, and a final complete chunk.
- Phase 50 moved generic prompt tool-use parsing to `src/tools/tool-use.ts`, so provider modules no longer need to import agent internals.
- OpenAI-compatible streaming already parses native streamed `delta.tool_calls`, but buffered OpenAI-compatible execution still only parses prompt-reencoded envelopes.
- Anthropic and Gemini streaming parse native tool calls from streamed blocks/parts, but buffered execution still reads only text.
- Request builders do not yet emit native tools, `tool_choice`, OpenAI `response_format`, Anthropic `tools`, Anthropic `tool_choice`, Gemini `tools`, or Gemini `toolConfig`.

## Decisions

- Additive contract only: all new request/response/stream fields are optional so existing adapter literals and `ai.run()` call paths remain valid.
- Provider-only native execution lives on `ProviderRunRequest`, not in agent code. Agent orchestration can keep using its existing prompt/formatting surface.
- Native tool definitions should reuse the existing `ToolDefinition` shape where possible, but request fields should accept a provider-level tool array to avoid coupling consumers to the agent loop.
- JSON Schema conversion belongs in a neutral tools/schema helper, not in `agent/format-tools.ts`, so provider adapters can build native bodies without violating Phase 50 boundaries.
- Structured object materialization should be best-effort and inspectable: parse provider-native object payloads first, then JSON text when necessary, and expose parsed values in `rawOutputs`.
- Stream finish metadata should be surfaced on complete chunks and survive `collectStream()`.

## Implementation Risks

- Standard Schema objects may not always expose a reliable JSON Schema converter. The helper needs a conservative fallback that is valid enough for native tool declarations but does not pretend to preserve all constraints.
- Provider response shapes differ sharply. The implementation should keep provider-specific body builders local and share only neutral conversion/normalization helpers.
- xAI and other OpenAI-compatible gateways vary in how much of OpenAI's native tool/response-format surface they honor. This phase should put requested fields on the wire and record requested/observed model metadata, not claim universal gateway support.
- Backward compatibility risk is highest in `collectStream()` and adapter request builders. Existing tests should continue passing with no request-native fields.

## Validation Targets

- Unit tests prove native request bodies for OpenAI-compatible/OpenAI/xAI, Anthropic, and Gemini include tools, tool choice, and structured output hints when supplied.
- Unit tests prove buffered provider responses return native tool calls and parsed structured output objects where provider bodies include them.
- Streaming tests prove finish metadata and native tool calls survive collection.
- Existing lattice package tests, typecheck, and type tests pass.
