# Phase 36 Pattern Map: Output Sanitizer Hook (opt-in)

## Pattern Mapping Complete

Phase 36 should follow existing provider adapter patterns and keep sanitizer behavior adapter-local.

## Provider Adapter Pattern

Reference files:

- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/gemini.ts`
- `packages/lattice/src/providers/openrouter.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/providers/lm-studio.ts`

Existing pattern:

1. Adapter factory options define provider id, model, API credentials, fetch override, pricing, model cache settings, retry count, and optional `runEventSink`.
2. `execute(request)` performs provider-specific request construction.
3. Provider response text is extracted into one string.
4. `rawOutputs` is created with `Object.fromEntries(request.outputs.map((name) => [name, text]))`.
5. `rawResponse` keeps the original response body.

Phase 36 should preserve this shape. The sanitizer pipeline should run after step 4 and before returning the response object.

## Wrapper Provider Pattern

Reference files:

- `packages/lattice/src/providers/openrouter.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/providers/lm-studio.ts`

Existing pattern:

- wrappers delegate to `createOpenAICompatibleProvider`
- wrappers override id/baseUrl
- wrappers add provider quirks and capability negotiation
- xAI wraps `execute` only to normalize reasoning token usage

Phase 36 should not duplicate sanitizer application in wrappers. The option should flow through the existing options spread into `createOpenAICompatibleProvider`. xAI can preserve its wrapped execute behavior by receiving already-sanitized `rawOutputs` from the inner adapter and only altering usage fields.

## Public Export Pattern

Reference files:

- `packages/lattice/src/index.ts`
- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/*.test-d.ts`

Existing pattern:

- root exports expose supported public API explicitly
- public-surface tests import from `../src/index.js`
- type tests live under `packages/lattice/test-d`

Phase 36 should export the built-in sanitizer factories and minimal sanitizer types from the root package. Internal helper exports may live under `src/sanitizers/index.ts`, but the beginner-facing path should be root import.

## Capability Recommendation Pattern

Reference file:

- `packages/lattice/src/capabilities/sanitizer-recommendations.ts`

Existing sanitizer keys already match the required built-ins. Phase 36 should align function names with this vocabulary and avoid introducing new key names or registry indirection.

## Test Pattern

Reference files:

- `packages/lattice/src/providers/adapters.test.ts`
- `packages/lattice/src/providers/anthropic.test.ts`
- `packages/lattice/src/providers/gemini.test.ts`
- `packages/lattice/src/providers/openrouter.test.ts`
- `packages/lattice/src/providers/xai.test.ts`
- `packages/lattice/src/providers/lm-studio.test.ts`
- `packages/lattice/src/providers/parity.test.ts`

Existing tests use fake fetch implementations and assert `rawOutputs`, `normalizedUsage`, request shape, provider ids, and `rawResponse`.

Phase 36 should add focused tests near the adapter behavior being changed and one parity-style test that proves all seven real adapters apply the same sanitizer option. Avoid provider-network tests.

## Files To Create

- `packages/lattice/src/sanitizers/sanitizers.ts`
- `packages/lattice/src/sanitizers/index.ts`
- `packages/lattice/test/sanitizers.test.ts` or `packages/lattice/src/sanitizers/sanitizers.test.ts`
- `packages/lattice/test-d/sanitizers.test-d.ts`
- `.changeset/*output-sanitizers*.md`

## Files To Modify

- `packages/lattice/src/index.ts`
- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/gemini.ts`
- provider tests for the seven adapters
- `packages/lattice/test/public-surface.test.ts`

## Integration Guidance

Implement the sanitizer module first. Then wire `createOpenAICompatibleProvider`, because four in-scope adapters inherit that path. Then wire Anthropic and Gemini. Final verification should run the sanitizer tests, provider tests, public-surface test, package type tests, and package typecheck.
