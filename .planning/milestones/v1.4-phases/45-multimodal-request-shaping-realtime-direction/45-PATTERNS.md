# Phase 45: Multimodal Request Shaping + Realtime Direction - Patterns

## Established Patterns

- Prefer additive public types and optional fields; existing adapter and plan interfaces are used by downstream consumers.
- Use conditional object spreads to satisfy `exactOptionalPropertyTypes`.
- Keep provider-specific wire parsing inside provider modules or small provider-adjacent helpers.
- Tests use fake `fetch` implementations and `Response` objects; no live network calls.
- Adapter factories keep public options small and avoid new provider SDK dependencies.
- Public type exports flow through `runtime/public-types.ts` and package root `index.ts`.
- Type-surface regressions are covered by `packages/lattice/test-d/*.test-d.ts` and `runtime/public-types.test.ts`.

## Phase 45 Patterns To Follow

- Add shared packaging metadata in `plan.ts` and `packaging.ts` first, then consume it from provider request builders.
- Keep native request shaping derived from both artifact metadata and `providerPackaging`, so plan-time and attempt-time metadata match provider body behavior.
- When converting a string artifact to base64, only do so if the value is a `data:` URL or the artifact metadata explicitly marks it as base64; do not guess that an arbitrary path string is inline bytes.
- Preserve old request bodies for no-artifact text calls to avoid changing existing golden tests.
- Name realtime step markers with deterministic prefixes such as `realtime.openai.session.start`, not user prompts or free-form labels.

## Pitfalls

- Do not implement provider uploads in the request builder; uploaded file IDs/URIs must already exist in metadata.
- Do not include secrets in execution plans. File references can identify provider resources, but API keys and auth headers must not be recorded.
- Do not make realtime sessions a `ProviderStream`; realtime sessions are bidirectional and stateful while `ProviderStream` is a one-shot async iterable.
- Do not assume all media strings are URLs or base64. Local file path ingestion belongs to optional media adapters.
- Do not use Anthropic Files API beta header globally; add it only when file references are present.
