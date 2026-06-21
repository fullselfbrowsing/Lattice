# Phase 51 Review: Provider Execution Parity

## Status

Clean.

## Findings

No blocking issues found in the implemented scope.

## Review Notes

- The new provider execution surface is additive and explicit. Existing runtime callers only pass `outputContracts`; adapters do not infer native structured output from those contracts.
- Provider modules import neutral tool/schema helpers, not agent modules, so the Phase 50 boundary remains intact.
- The OpenAI-compatible path preserves old prompt-reencoded returned tool-call semantics. A regression found during provider tests (`toolCalls: []` omitted for dropped invalid calls) was fixed before commit.
- Anthropic's structured output path uses a forced synthetic native tool and filters that synthetic call out of application `toolCalls`.
- Gemini's structured output path uses response schema hints and parses JSON text into the requested output slot.
- xAI unknown-live negotiation is intentionally conservative: it preserves the exact live model ID and marks core tool/structured/streaming support true, while leaving context window unknown until registry/live metadata improves.

## Residual Risk

- Standard Schema to JSON Schema conversion remains best-effort unless the schema object exposes `toJSONSchema()`. This matches the existing agent formatter behavior and avoids adding a runtime Zod dependency.
- OpenAI-compatible gateways may ignore `tools`, `tool_choice`, or `response_format`; Lattice now serializes them and records inspectable responses but does not claim every gateway honors them.
