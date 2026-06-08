---
phase: 34
plan: "04"
subsystem: providers
tags:
  - quirks
  - negotiation
  - gemini
  - openrouter
  - anchor-case-study
  - medium-thick-derivation
dependency_graph:
  requires:
    - Phase 34-01 (AdapterQuirks + GeminiQuirks + OpenRouterQuirks + NegotiatedCapabilities +
      NegotiationAuthError + synthesizeNegotiatedCapabilitiesFromRegistry + getRecommendedSanitizers)
    - Phase 33 (registry.generated.ts containing openrouter:openai/gpt-oss-120b with
      internal_envelope_leak; lookup.ts with stripOpenRouterVariant + getCapabilityProfile)
  provides:
    - createGeminiProvider extended with quirks: GeminiQuirks + negotiateCapabilities
    - createOpenRouterProvider extended with quirks: OpenRouterQuirks + negotiateCapabilities
    - 5 frozen fixtures (3 Gemini + 2 OpenRouter)
    - ANCHOR CASE STUDY session_1780792387779 verified end-to-end
  affects:
    - packages/lattice/src/providers/gemini.ts (additive only; execute() unchanged)
    - packages/lattice/src/providers/openrouter.ts (additive + refactored from thin wrapper)
tech_stack:
  added: []
  patterns:
    - "Per-instance TTL Map<string, {result, expiresAt}> in factory closure (D-05/D-06)"
    - "Inflight coalescing Map<string, Promise<T>> with .finally cleanup (Pitfall 4)"
    - "Retry backoff [0ms, 200ms, 1000ms] on transient errors (D-11)"
    - "NegotiationAuthError throw on 401/403 (D-10, no fallback)"
    - "synthesizeNegotiatedCapabilitiesFromRegistry on 5xx/network (D-09)"
    - "createRunEvent('capabilities.negotiation.fallback') emission via RunEventSink (D-12)"
    - "stripOpenRouterVariant for canonical key normalization (Phase 33 D-11)"
    - "getRecommendedSanitizers as the ONLY recommendedSanitizers derivation path"
key_files:
  created:
    - packages/lattice/test/__fixtures__/quirks/gemini-models-ok.json
    - packages/lattice/test/__fixtures__/quirks/gemini-models-401.json
    - packages/lattice/test/__fixtures__/quirks/gemini-models-503.json
    - packages/lattice/test/__fixtures__/quirks/openrouter-models-ok.json
    - packages/lattice/test/__fixtures__/quirks/openrouter-models-503.json
  modified:
    - packages/lattice/src/providers/gemini.ts
    - packages/lattice/src/providers/gemini.test.ts
    - packages/lattice/src/providers/openrouter.ts
    - packages/lattice/src/providers/openrouter.test.ts
decisions:
  - "OpenRouter thin-wrapper refactored to own closure with negotiate() + quirks while preserving
    full execute() delegation to createOpenAICompatibleProvider via spread (...baseAdapter)"
  - "Gemini /v1beta/models uses x-goog-api-key HEADER (not ?key= query-string per RESEARCH §Q3);
    existing execute() path retains ?key= query-string (migration out-of-scope per T-34-04-01)"
  - "OpenRouter /api/v1/models sends NO Authorization header (Anti-pattern per RESEARCH §534-535;
    endpoint is public/unauthenticated per Phase 33 verified behavior)"
  - "Model matching in OpenRouter: also matches rows whose stripped id equals stripped query id
    (allows base-form 'openai/gpt-oss-120b' to match ':free' variant row in /models response)"
metrics:
  duration: "~60 minutes"
  completed: "2026-06-08"
  tasks: 2
  files: 9
---

# Phase 34 Plan 04: Gemini + OpenRouter Quirks + Capability Negotiation Summary

Extended `createGeminiProvider` and `createOpenRouterProvider` with typed `quirks` blocks and
`negotiateCapabilities()` methods. Gemini uses medium-thick derivation (inputTokenLimit + thinking
+ supportedGenerationMethods from upstream /v1beta/models). OpenRouter uses rich /models
intersection (supported_parameters + top_provider.context_length) with Phase 33 registry for
failure modes. The ANCHOR CASE STUDY assertion (session_1780792387779) passes end-to-end.

## Per-Adapter Quirks Blocks

### Gemini Quirks (8 booleans: 5 universal + 3 Gemini-specific)

```typescript
{
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  responseSchemaSupported: true,      // CITED: Gemini API responseSchema/responseJsonSchema (gemini-1.5-pro+)
  safetySettingsConfigurable: true,   // VERIFIED: gemini.ts:50-55 4-category BLOCK_NONE
  systemInstructionSupported: true,   // CITED: gemini-1.5+ systemInstruction field
}
```

### OpenRouter Quirks (8 booleans: 5 universal + 3 OpenRouter-specific)

```typescript
{
  supportsToolChoice: true,
  parallelToolCalls: true,
  structuredOutputs: true,
  responseFormatHonored: true,
  streamingDiverges: false,
  providerRoutingArraySupported: true, // CITED: openrouter.ai/docs provider routing order/only/ignore
  floorPricingHints: true,             // CITED: openrouter.ai/docs max_price / sort: "throughput" | "price"
  allowFallbacks: true,                // CITED: openrouter.ai/docs allow_fallbacks boolean
}
```

## Per-Adapter negotiate() Derivation Depth

### Gemini: MEDIUM-THICK

| Field | Derivation | Source |
|-------|------------|--------|
| contextWindow | `found.inputTokenLimit` | THICK: upstream truth |
| supports.extendedThinking | `!!found.thinking` | THICK: upstream truth |
| supports.streaming | `supportedGenerationMethods.includes("streamGenerateContent")` | THICK: upstream truth |
| supports.nativeToolCalling | `supportedGenerationMethods.includes("generateContent")` | THICK: upstream truth |
| supports.structuredOutputs | true (adapter posture; responseSchemaSupported) | Quirks-block |
| supports.parallelToolCalls | true (Gemini supports parallel) | Quirks-block |
| knownFailureModes | `registryProfile.knownFailureModes` | Registry intersection |
| recommendedSanitizers | `getRecommendedSanitizers(knownFailureModes)` | Registry-derived |

Auth: `x-goog-api-key: ${apiKey}` HEADER (not `?key=` query-string per RESEARCH §Q3).
URL: `/v1beta/models` (not `/v1/models` -- Gemini-specific prefix).

### OpenRouter: RICH /models intersection

| Field | Derivation | Source |
|-------|------------|--------|
| contextWindow | `top_provider.context_length ?? context_length ?? registry` | THICK: Pitfall 3 / A1 precedence |
| supports.nativeToolCalling | `supported_parameters.includes("tools")` | THICK: upstream truth |
| supports.structuredOutputs | `supported_parameters.includes("response_format")` | THICK: upstream truth |
| supports.parallelToolCalls | `supported_parameters.includes("tool_choice")` | THICK: heuristic |
| supports.extendedThinking | `supported_parameters.includes("reasoning" \| "thinking")` | THICK: upstream truth |
| supports.streaming | true (OpenRouter supports on all models) | Posture |
| knownFailureModes | `registryProfile.knownFailureModes` (via `openrouter:${stripped}`) | Registry intersection |
| recommendedSanitizers | `getRecommendedSanitizers(knownFailureModes)` | Registry-derived |

Auth: NO Authorization header. OpenRouter /api/v1/models is unauthenticated (Anti-pattern guard).
URL: `/api/v1/models` (not `/v1/models` -- OpenRouter uses `/api/v1/` prefix).

## Test Count Delta

| File | Before | After | Delta |
|------|--------|-------|-------|
| gemini.test.ts | 10 tests | 20 tests | +10 |
| openrouter.test.ts | 7 tests | 17 tests | +10 |
| Total suite | 659 tests (Plan 34-01 base) | 679 tests | +20 |
| Test files | 56 | 56 | +0 (extended existing) |

## ANCHOR CASE STUDY Verification Output

Test: `"Test 4 (ANCHOR CASE STUDY session_1780792387779): openai/gpt-oss-120b:free yields recommendedSanitizers: ['unwrapInternalEnvelope']"`

```
Tests  17 passed (17)
Start at  11:28:47
Duration  184ms
```

Assertions verified:
- `result.modelId === "openai/gpt-oss-120b:free"` -> PASS (input modelId preserved verbatim)
- `result.source === "live"` -> PASS (fetch succeeded, registry intersected)
- `result.contextWindow === 131072` -> PASS (from `top_provider.context_length` in fixture)
- `result.knownFailureModes.includes("internal_envelope_leak")` -> PASS (from Phase 33 registry)
- `result.recommendedSanitizers.includes("unwrapInternalEnvelope")` -> PASS (from getRecommendedSanitizers)

End-to-end flow verified: `/api/v1/models` live-fetch -> `id="openai/gpt-oss-120b:free"` found
-> `stripOpenRouterVariant("openai/gpt-oss-120b:free")` -> `"openai/gpt-oss-120b"` ->
canonical key `"openrouter:openai/gpt-oss-120b"` -> `getCapabilityProfile()` -> Phase 33 registry
profile with `knownFailureModes: ["internal_envelope_leak", ...]` -> `getRecommendedSanitizers()`
-> `["unwrapInternalEnvelope"]`.

## Decision Verification

| Decision | Status | Evidence |
|----------|--------|---------|
| D-05 (per-instance cache) | Implemented | `new Map<string, {result, expiresAt}>` in factory closure for both adapters |
| D-06 (per-instance scope) | Implemented | Maps declared inside `createGeminiProvider` / `createOpenRouterProvider` closures |
| D-07 (lazy expiry) | Implemented | `cache.get(modelId); if (cached && cached.expiresAt > Date.now())` check |
| D-08 (modelsCacheTtlMs) | Implemented | Factory option with default 300_000ms; 0 disables (tests pass 0) |
| D-09 (registry-fallback) | Implemented | `synthesizeNegotiatedCapabilitiesFromRegistry("gemini"/"openrouter", modelId, "registry-fallback")` |
| D-10 (auth-throw) | Implemented | 401/403 throws `new NegotiationAuthError("gemini"/"openrouter", ...)` |
| D-11 (retry) | Implemented | 3 attempts (retryCount+1) with backoff [0, 200, 1000]ms; modelsRetryCount option |
| D-12 (fallback event) | Implemented | `createRunEvent("capabilities.negotiation.fallback", {...})` via runEventSink |

## Deferred Items / Known Issues

- **T-34-04-01 (Gemini execute() ?key= migration):** The existing execute() path still uses `?key=` query-string. Phase 34 negotiate() uses header auth. Migration of execute() is explicitly out-of-scope per T-34-04-01 (additive-only plan). Tracked as future cleanup.
- **tsd (test:types):** The `tsd` portion of `test:types` fails due to missing `dist/index.d.ts` (no build step). This is a pre-existing issue in the dev environment, not introduced by Plan 34-04 (verified via git stash test).

## Note for Plan 34-05

Plan 34-04 closed the 4 /models-capable adapters (Anthropic + OpenAI + Gemini + OpenRouter).
Plan 34-05 ships LM Studio (no remote /models -- registry-only pattern like OpenAI-compat) +
integration suite + changeset.

## Threat Surface Scan

No new network endpoints beyond the two documented in the plan (Gemini /v1beta/models with header
auth, OpenRouter /api/v1/models with no auth). Both are GET-only discovery endpoints. The security
properties documented in the threat model (T-34-04-01 through T-34-04-08) are all implemented or
accepted as documented.

- `stringifyErr` returns `err.message` only (T-34-04-02 apiKey leak mitigation verified)
- `inflight.delete(modelId)` is in `finally` block (T-34-04-07 inflight Map leak mitigation verified)
- No Authorization header in OpenRouter /api/v1/models call (T-34-04-03 MITM/anti-pattern guard)
- `NegotiationAuthError.message` does not include apiKey value (T-34-04-05 mitigation verified)

## Self-Check: PASSED

Checking key created/modified files:
- [x] `packages/lattice/src/providers/gemini.ts` -- quirks + negotiateCapabilities added
- [x] `packages/lattice/src/providers/gemini.test.ts` -- 20 tests (10 original + 10 Phase 34)
- [x] `packages/lattice/src/providers/openrouter.ts` -- quirks + negotiateCapabilities added
- [x] `packages/lattice/src/providers/openrouter.test.ts` -- 17 tests (7 original + 10 Phase 34)
- [x] `packages/lattice/test/__fixtures__/quirks/gemini-models-ok.json` -- 3 models fixture
- [x] `packages/lattice/test/__fixtures__/quirks/gemini-models-401.json` -- Gemini 401 fixture
- [x] `packages/lattice/test/__fixtures__/quirks/gemini-models-503.json` -- Gemini 503 fixture
- [x] `packages/lattice/test/__fixtures__/quirks/openrouter-models-ok.json` -- 3 models fixture incl gpt-oss-120b:free
- [x] `packages/lattice/test/__fixtures__/quirks/openrouter-models-503.json` -- OpenRouter 503 fixture

Checking commits:
- [x] `b85244d` -- feat(34-04): Gemini quirks + medium-thick negotiate() + 3 fixtures + 9 tests
- [x] `1ff07b8` -- feat(34-04): OpenRouter quirks + negotiate() + ANCHOR CASE STUDY + 2 fixtures + 9 tests
