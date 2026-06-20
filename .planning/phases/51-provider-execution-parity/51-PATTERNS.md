# Phase 51 Patterns: Provider Execution Parity

## Additive Provider Request Fields

Add optional fields to `ProviderRunRequest`:

- `nativeTools?: readonly ProviderToolDefinition[]`
- `nativeToolChoice?: ProviderToolChoice`
- `nativeStructuredOutput?: ProviderStructuredOutputRequest`

These fields are provider-only opt-ins. The runtime may continue passing `outputContracts` without changing execution behavior.

## Structured Output Mapping

`ProviderStructuredOutputRequest` names exactly one output slot. Providers that can return a native JSON object map the parsed object to that slot in `rawOutputs`.

Text outputs remain text. If a caller asks for other output names in the same request, adapters keep returning the text content for those names unless the structured output slot replaces that name.

## Tool Call Normalization

Provider-native buffered and streamed tool calls are normalized into the existing `ValidatedToolCall` shape through `validateToolCallRequests`.

Prompt-reencoded envelopes remain supported and are combined with native tool calls. This preserves old agent behavior while allowing direct provider callers to use native tools.

## Synthetic Structured Tool

Anthropic can represent structured output as a forced native tool call. The synthetic tool name should be deterministic and reserved to the structured output request. When parsing responses, that synthetic tool materializes `rawOutputs[output]`; it is not returned as an application tool call.

## Finish Metadata

Add optional `finish` metadata to `ProviderRunResponse` and `ProviderStreamCompleteChunk`. `collectStream()` copies the latest complete-chunk finish metadata into the returned response.

The metadata should include:

- provider finish reason where available
- native tool call IDs where available
- provider-specific details only under a generic metadata object if needed later

## Compatibility Rule

Do not infer native execution from `outputContracts`. Native provider execution must require the explicit new request fields.
