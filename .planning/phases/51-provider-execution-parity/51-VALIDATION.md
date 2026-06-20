# Phase 51 Validation Plan

## Unit Tests

- OpenAI-compatible provider serializes `nativeTools`, `nativeToolChoice`, and `nativeStructuredOutput` into Chat Completions-compatible request bodies.
- OpenAI-compatible provider parses buffered native `message.tool_calls`, structured JSON content, and finish reason metadata.
- xAI preserves a new `grok-4-1-fast-*` model ID in request bodies and returns a live conservative negotiation result when `/models` confirms an unknown model.
- Anthropic provider serializes native tools/tool choice, emits a synthetic forced structured-output tool when requested, and materializes buffered `tool_use.input` as object output.
- Gemini provider serializes native function declarations/tool config, emits `responseMimeType`/`responseSchema`, and materializes JSON text as object output.
- Streaming collection preserves complete-chunk finish metadata.
- Existing prompt-reencoded tool-call validation tests continue to pass.

## Package Verification

- `node scripts/check-lattice-module-boundaries.mjs`
- `pnpm --filter @full-self-browsing/lattice test -- providers`
- `pnpm --filter @full-self-browsing/lattice test -- agent runtime create-ai`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice test:types`

## Acceptance

Phase 51 is complete when the provider-only opt-in fields are implemented across the first-party OpenAI-compatible, Anthropic, Gemini, and xAI paths, all validation commands pass, and GSD state advances to the next phase.
