# Phase 42: OpenRouter Fallback + Capability Catalog Refresh - Research

**Date:** 2026-06-15
**Status:** Complete

## Research Complete

Phase 42 should be planned as three tightly connected workstreams: OpenRouter fallback request support, runtime/receipt resolved-model accounting, and deterministic catalog refresh expansion.

## External Findings

### OpenRouter fallback shape

- OpenRouter chat completions accepts a top-level `models` list for ordered model fallback. Official examples for the OpenAI SDK place this under `extra_body`, which maps to the same request body field for Lattice's direct fetch path.
- The fallback response is billed and identified by the model actually used, exposed in the response body `model` field.
- Anthropic Messages uses a separate `fallbacks` parameter with its own limitations; that is out of scope because Lattice's OpenRouter adapter currently targets chat completions.

### OpenRouter provider routing

- OpenRouter's `provider` request object includes `order`, `allow_fallbacks`, `require_parameters`, `data_collection`, `zdr`, `only`, `ignore`, `quantizations`, and other routing controls.
- `allow_fallbacks` defaults to true in OpenRouter provider routing. Lattice should keep gateway fallback explicit and separately recorded so the Lattice route remains replayable.

### OpenRouter models feed

- The current API reference documents bearer auth for `GET /api/v1/models`, but a live unauthenticated check on 2026-06-15 returned HTTP 200. Plan defensively: preserve unauthenticated default while allowing optional script-only auth through `OPENROUTER_API_KEY`.
- The live feed exposes fields Phase 42 needs: string pricing values, `context_length`, `top_provider.context_length`, `supported_parameters`, and nullable `input_modalities` / `output_modalities`.
- Pricing values are decimal strings and may include sentinel-like strings such as `"-1"` for router rows. Preserve strings in generated profiles to avoid precision loss and to make review diffs faithful to the feed.

## Codebase Findings

### OpenRouter adapter

- `packages/lattice/src/providers/openrouter.ts` already delegates execution to `createOpenAICompatibleProvider`, exposes `OpenRouterQuirks`, and performs live `/api/v1/models` negotiation.
- The OpenRouter adapter can inject `models` without changing the public OpenAI-compatible provider API by wrapping the fetch function passed to `createOpenAICompatibleProvider` and editing only chat-completions request bodies when fallback models are configured.
- `packages/lattice/src/providers/openrouter.test.ts` already has fake-fetch helpers and fixture-based negotiation tests, so fallback request-shape tests fit naturally there.

### Gateway/resolved-model metadata

- `packages/lattice/src/providers/adapters.ts` already has `observedModelFromResponse(body)` and returns `ProviderRunResponse.gateway` for LiteLLM or explicit gateway policies.
- `packages/lattice/src/providers/provider.ts` already defines `ProviderGatewayMetadata` with `requestedModel`, `observedModel`, and sanitized policy fields.
- `packages/lattice/src/runtime/create-ai.ts` already includes response gateway metadata in `provider.attempt` success events and plan attempt metadata, but terminal `RunSuccess` / `RunFailure` results do not expose it directly.
- Receipt types already have `ReceiptModel.observed`, but current runtime receipt issuance passes `observed: null` in success, validation-failed, and tripwire-failed branches.
- `resolveReceiptModelClass` currently looks up the requested model only. For OpenRouter fallback, it should prefer `model.observed` when present and fall back to `model.requested`.

### Catalog refresh

- `scripts/refresh-model-registry.mjs` already implements the correct generator spine: native Node fetch, retry, stable row sorting, no timestamps, bit-exact `--check`, and skip-on-fetch-failure in check mode.
- `scripts/capabilities/classifier.mjs` already derives failure modes, prompt strategy, reasoning surface, and tool-call surface from OpenRouter rows.
- `packages/lattice/src/capabilities/profile.ts` is the right public type surface to extend with optional feed-derived fields. Keep additions optional and readonly so existing hand-authored profiles remain source-compatible.
- `.github/workflows/registry-drift.yml` already keeps OpenRouter network calls out of PR-time CI and opens scheduled/manual refresh PRs.

## Recommended Plan Split

1. **42-01 OpenRouter fallback request surface** - add `fallbackModels`, inject `models` into OpenRouter chat-completions bodies, return fallback candidate metadata, and test fake-fetch request shapes.
2. **42-02 Resolved-model accounting** - propagate observed model to terminal result metadata and receipts while preserving Lattice route fields.
3. **42-03 Catalog refresh and public surface** - extend generated profiles with feed metadata, handle optional auth, update tests/snapshots/types, and run package boundary gates.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Gateway fallback makes Lattice route appear non-deterministic | Keep `route.selected.modelId` and `ReceiptRoute.capabilityId` as the requested primary model; record observed model additively |
| OpenRouter docs/auth behavior drifts | Support optional `OPENROUTER_API_KEY` in scripts only, never runtime user keys, and keep scheduled failures visible but non-flaky |
| Public profile type expansion breaks static profiles | Add optional readonly fields and update type-level samples, not required fields |
| Raw pricing decimals lose precision | Preserve feed pricing as strings in generated profile metadata |
| `@openrouter/sdk` sneaks into core | Keep direct fetch path and run `scripts/check-core-package-boundary.mjs` |

## Validation Architecture

Use existing Vitest, tsd, package lint, and generator fixture infrastructure.

| Dimension | Coverage |
|-----------|----------|
| Adapter request shape | `packages/lattice/src/providers/openrouter.test.ts` fake-fetch tests for `model`, `models`, no fallback omission, auth preservation, and no SDK dependency |
| Runtime accounting | `packages/lattice/src/runtime/create-ai.test.ts` and `packages/lattice/test/planning-execution.test.ts` for result gateway metadata, plan/event metadata, receipt `model.observed`, and unchanged `route.selected` |
| Catalog refresh | `packages/lattice/test/capabilities-classifier.test.ts` fixture transform/render tests for pricing, modalities, supported parameters, context precedence, and deterministic output |
| Public type surface | `packages/lattice/test-d/index.test-d.ts` and `packages/lattice/test-d/capabilities.test-d.ts` for `OpenRouterProviderOptions`, `ProviderGatewayMetadata`, and profile metadata fields |
| Package hygiene | `pnpm --filter @full-self-browsing/lattice test:types`, `pnpm --filter @full-self-browsing/lattice lint:packages`, `node scripts/check-core-package-boundary.mjs`, and `node scripts/check-tarball-leak.mjs` |

## Sources

- OpenRouter model fallback docs: https://openrouter.ai/docs/guides/routing/model-fallbacks
- OpenRouter provider routing docs: https://openrouter.ai/docs/guides/routing/provider-selection
- OpenRouter models API docs: https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter chat completions API docs: https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request
- Live spot-check: unauthenticated `GET https://openrouter.ai/api/v1/models` returned HTTP 200 on 2026-06-15.

---

*Phase: 42-openrouter-fallback-capability-catalog-refresh*
