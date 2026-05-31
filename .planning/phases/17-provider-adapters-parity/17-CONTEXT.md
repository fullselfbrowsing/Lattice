# Phase 17: Provider Adapter Alignment + INV-03 Parity Smoke - Context

**Gathered:** 2026-05-31
**Status:** Retroactive backfill (code on disk via cherry-pick from FSB v0.10.0-attempt-2 Phase 4).
**Mode:** Retro. 8 originating SHAs: `cf31d82`, `7a32b00`, `09a495e`, `1cfc13c`, `40457ff`, `e5659a8`, `f9c7ef4`, `f1c943b`. Cherry-picked with `git cherry-pick -x` provenance.

<domain>
## Phase Boundary

Five new provider adapters ship as first-class factories on Lattice's public surface — two full custom adapters (Anthropic native messages API; Gemini native generateContent) and three thin wrappers around `createOpenAICompatibleProvider` (xAI, OpenRouter, LM Studio). An INV-03 parity smoke iterates all 7 logical provider factories (OpenAI + OpenAI-compat + the 5 new) against a fake fetch and asserts every adapter conforms to the same `ProviderAdapter` contract.

Out of scope: streaming for any new adapter (single-shot Promise only); Anthropic prompt caching / tool use; Gemini multimodal / streaming; xAI tool streaming; OpenRouter multi-model routing / fallback array; LM Studio latency-tail diagnostics module.

</domain>

<decisions>
## Implementation Decisions

### Anthropic (PROV-01)
- New module `packages/lattice/src/providers/anthropic.ts`. Endpoint `/v1/messages`.
- Top-level `system` field (not first user message). `content[0].text` for response parsing. `input_tokens` / `output_tokens` from `usage` block.
- Headers: `x-api-key` plus `anthropic-version: 2023-06-01`.
- Single-shot Promise. Streaming + prompt caching + tool use deferred.
- Mirrors FSB universal-provider.js:280-297 + 566-573 production shape.

### Gemini (PROV-02)
- New module `packages/lattice/src/providers/gemini.ts`. Endpoint `/v1beta/models/{model}:generateContent`.
- Request shape `contents[].parts[].text`. Response `candidates[0].content.parts[0].text`.
- Usage from `usageMetadata.promptTokenCount` / `candidatesTokenCount`.
- 4 `HARM_CATEGORY` safety settings at `BLOCK_NONE` (FSB convention).
- `?key=` query-string auth.
- Role mapping preserved: `user` / `model` (NOT `assistant`).

### xAI (PROV-03)
- New module `packages/lattice/src/providers/xai.ts`. Thin wrapper around `createOpenAICompatibleProvider` pinned to `https://api.x.ai/v1`.
- **Preserves xAI's `completion_tokens_details.reasoning_tokens` quirk:** legacy `UsageRecord.totalTokens` recomputed to INCLUDE reasoning tokens. Phase 7-normalized `Usage` (billable tokens only) unchanged.

### OpenRouter (PROV-04)
- New module `packages/lattice/src/providers/openrouter.ts`. Thin wrapper pinned to `https://openrouter.ai/api/v1`.
- First-class named adapter for ceremony parity. Multi-model routing / fallback array deferred.

### LM Studio (PROV-05)
- New module `packages/lattice/src/providers/lm-studio.ts`. Thin wrapper pinned to `http://localhost:1234/v1`.
- `apiKey` optional (LM Studio is no-auth by convention; no opt-out flag).
- Latency-tail diagnostics module deferred — LM Studio IS the named INV-03 latency canary, but diagnostics belongs in a follow-on observability phase.

### Public Surface (INDEX-04)
- `packages/lattice/src/index.ts` re-exports 5 new factories + 5 option-type aliases.

### Parity Smoke (PARITY-01)
- New `packages/lattice/src/providers/parity.test.ts` (+268 lines, 7 cases).
- Iterates all 7 logical provider factories under fake fetch.
- Asserts: ProviderAdapter shape; `rawOutputs` populated; normalized `Usage` shape; provider-name in error on non-OK; AbortSignal propagation; `rawResponse` preserved; distinct request ids.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- v1.1 `packages/lattice/src/providers/{provider,adapters,fake,packaging}.ts` — `createAISdkProvider`, `createOpenAICompatibleProvider`, `createOpenAIProvider`, `createFakeProvider`. Thin wrappers (xAI/OpenRouter/LM Studio) reuse `createOpenAICompatibleProvider`.
- Phase 14 `packages/lattice/src/index.ts` public surface — re-exports thread into the same module.

### Established Patterns
- Adapter files live alongside tests (`anthropic.ts` + `anthropic.test.ts`).
- All adapters return a Promise<ProviderAdapter>; no streaming.
- Custom adapters do their own `fetch` with explicit shape; thin wrappers delegate to `createOpenAICompatibleProvider`.

</code_context>

<specifics>
## Specific Ideas

- Test counts per adapter:
  - Anthropic: 9 cases
  - Gemini: 10 cases
  - xAI: 9 cases (one over the planner prediction; Test 4b codifies the reasoning_tokens quirk)
  - OpenRouter: 7 cases
  - LM Studio: 8 cases
- Parity smoke: 7 cases (one per logical provider).
- Total Phase 17 vitest gain: 43 + 7 = 50 new cases.

</specifics>

<deferred>
## Deferred Ideas

- Streaming for all new adapters.
- Anthropic prompt caching + tool use.
- Gemini multimodal request shaping.
- xAI tool streaming.
- OpenRouter multi-model routing + fallback array.
- LM Studio latency-tail diagnostics module.

</deferred>
