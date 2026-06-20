# Phase 51 Research: Provider Execution Parity

## Findings

### Provider contract can be extended safely

`ProviderRunRequest`, `ProviderRunResponse`, and `ProviderStreamCompleteChunk` are structural TypeScript interfaces. Optional fields can be added without breaking existing adapter literals or runtime call sites.

Existing `ai.run()` already passes `outputContracts` into provider requests, but PROV-05 requires old behavior to remain unchanged unless opted in. Therefore native provider execution must use new explicit opt-in fields instead of automatically switching behavior whenever `outputContracts` is present.

### Native tool declarations need a neutral schema helper

`ToolDefinition` lives in `src/tools/tools.ts` and already uses Standard Schema. `agent/format-tools.ts` currently owns `toolSchemaToJsonSchema`, but Phase 50 forbids providers depending on `src/agent/**`. The converter should move to `src/tools/schema.ts`; `agent/format-tools.ts` can re-export it for compatibility.

Runtime package dependencies do not include Zod. The converter cannot import Zod helpers directly. It should use `schema.toJSONSchema()` when present and otherwise return a conservative object schema with a comment identifying the Standard Schema vendor.

### Provider request shapes

- OpenAI-compatible and xAI/OpenRouter/LM Studio wrappers share Chat Completions-compatible `tools`, `tool_choice`, and `response_format`.
- Anthropic Messages supports top-level `tools` and `tool_choice`. It can materialize structured output by forcing a synthetic structured-output tool and reading the returned `tool_use.input`.
- Gemini `generateContent` supports `tools[].functionDeclarations`, `toolConfig.functionCallingConfig`, and `generationConfig.responseMimeType/responseSchema`.

The implementation should keep body builders provider-local because each provider has different field names and mode vocabulary.

### Provider response parsing

- OpenAI-compatible buffered responses can include `choices[0].message.tool_calls` and `choices[0].finish_reason`.
- Anthropic buffered responses can include `content[]` text blocks and `tool_use` blocks.
- Gemini buffered responses can include text parts and `functionCall` parts.
- Streaming paths already accumulate native tool calls for OpenAI-compatible, Anthropic, and Gemini; they need finish metadata in the final complete chunk and collection result.

### Model ID inspectability

xAI wraps the OpenAI-compatible execution path and has its own `/models` negotiation. Unknown live xAI models currently fall back to registry stubs, which can hide successful model identity discovery when a new model ID is not yet in the static registry. For GitFly-style `grok-4-1-fast-*` IDs, the safer behavior is to preserve the exact requested model ID and mark the source as live with conservative support flags if `/models` confirms the ID.

## Constraints

- No provider adapter may import `src/agent/**`.
- Existing prompt-reencoded tool-call validation must continue to work.
- Existing `ai.run()` structured output validation still happens in `outputs/validate.ts`.
- Native structured output should not sanitize object outputs through string sanitizers.
- Package source cannot depend on dev-only Zod helpers.
