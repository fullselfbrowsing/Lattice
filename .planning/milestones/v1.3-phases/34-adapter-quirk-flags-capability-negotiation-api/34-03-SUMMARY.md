---
phase: 34
plan: "03"
subsystem: providers
tags:
  - quirks
  - negotiation
  - openai
  - openai-compat
  - xai
  - thin-adapters
  - registry-intersection
  - lenient-parse
dependency_graph:
  requires:
    - Phase 34 Plan 01 (AdapterQuirks types, NegotiatedCapabilities, NegotiationAuthError,
      synthesizeNegotiatedCapabilitiesFromRegistry, _mapProfileToNegotiatedCapabilities)
    - Phase 33 (registry.static.ts: xai:grok-4; registry.generated.ts: openrouter OpenAI rows)
  provides:
    - createOpenAIProvider narrowed return: quirks: OpenAIQuirks + negotiateCapabilities
    - createOpenAICompatibleProvider narrowed return: quirks: OpenAICompatQuirks + negotiateCapabilities (registry-only)
    - createXaiProvider narrowed return: quirks: XaiQuirks + negotiateCapabilities (lenient-parse)
    - 5 frozen test fixtures (3 OpenAI + 2 xAI)
  affects:
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/providers/xai.ts
tech_stack:
  added: []
  patterns:
    - "Per-instance TTL cache (Map<modelId, {result, expiresAt}>) in factory closure (D-05/D-06)"
    - "Single-flight inflight coalescing (Map<modelId, Promise<T>>) with .finally cleanup (Pitfall 4)"
    - "Retry loop with backoff [0, 200, 1000]ms (modelsRetryCount option, default 2)"
    - "NegotiationAuthError throw on 401/403 -- no retry, no fallback, no event (D-10)"
    - "synthesizeNegotiatedCapabilitiesFromRegistry for transient fallback (source: 'registry-fallback')"
    - "Registry-only negotiate() for OpenAI-compat (source: 'registry', no fetch, per D-04)"
    - "LENIENT-PARSE for xAI /v1/models (Array.isArray check + defensive optional chaining)"
key_files:
  created:
    - packages/lattice/test/__fixtures__/quirks/openai-models-ok.json
    - packages/lattice/test/__fixtures__/quirks/openai-models-401.json
    - packages/lattice/test/__fixtures__/quirks/openai-models-503.json
    - packages/lattice/test/__fixtures__/quirks/xai-models-ok.json
    - packages/lattice/test/__fixtures__/quirks/xai-models-401.json
  modified:
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/providers/adapters.test.ts
    - packages/lattice/src/providers/xai.ts
    - packages/lattice/src/providers/xai.test.ts
decisions:
  - "OpenAI negotiate() calls GET /v1/models (base URL + /v1/models); OpenAI baseUrl defaults to https://api.openai.com (no trailing /v1) so /v1/models path is correct"
  - "xAI negotiate() calls GET /v1/models (base URL = https://api.x.ai/v1, so appends /models not /v1/models)"
  - "OpenAI-compat negotiate() is registry-only with no cache/inflight/event per D-04; options modelsCacheTtlMs/modelsRetryCount/runEventSink accepted for option-bag uniformity but unused"
  - "mergeOpenAIModelsWithRegistry: source 'live' when model found in /models + registry has profile; 'registry-fallback' when not found (emit event) or profile absent"
  - "mergeXaiModelsWithRegistry: lenient Array.isArray check on body.data; non-array falls back immediately without crash per Pitfall 1 / RESEARCH §A1"
  - "InnerCompat spread avoided in xai.ts return type due to exactOptionalPropertyTypes; fields composed explicitly to satisfy ProviderAdapter intersection"
metrics:
  duration: "~35 minutes"
  completed: "2026-06-08T16:30:43Z"
  tasks: 3
  files: 9
---

# Phase 34 Plan 03: OpenAI + OpenAI-compat + xAI Thin Adapter Quirks + Capability Negotiation

Wired Phase 34's contract surface onto the 3 thin adapters: OpenAI (sparse /models), OpenAI-compat (no remote /models, registry-only), and xAI (undocumented sparse /models, lenient parse). All three are the "thin" foil to Plan 34-02's Anthropic thick reference implementation: they source `supports.*` from the Phase 33 registry rather than extracting capabilities directly from upstream /models responses.

## Per-Adapter Quirks Blocks

### OpenAI (createOpenAIProvider)

```typescript
quirks: {
  supportsToolChoice: true,       // OpenAI tool_choice fully supported
  parallelToolCalls: true,         // Parallel tool calls supported (disabled by default, A7)
  structuredOutputs: true,         // response_format json_schema supported
  responseFormatHonored: true,     // OpenAI treats response_format as authoritative
  streamingDiverges: false,        // Streaming output matches buffered
  strictModeSupported: true,       // CITED: strict:true on gpt-4o-2024-08-06+, o1+
  structuredOutputsTier2: true,    // CITED: json_schema mode on gpt-4o + gpt-4o-mini
} satisfies OpenAIQuirks
```

Citation: https://platform.openai.com/docs/guides/structured-outputs (RESEARCH §Q6)

### OpenAI-Compatible (createOpenAICompatibleProvider)

```typescript
quirks: {
  supportsToolChoice: false,       // Conservative -- server-dependent
  parallelToolCalls: false,        // Conservative -- server-dependent
  structuredOutputs: false,        // Conservative -- server-dependent
  responseFormatHonored: false,    // Conservative -- server may ignore response_format
  streamingDiverges: true,         // Self-hosted servers often have streaming differences
} satisfies OpenAICompatQuirks
```

D-04 citation: conservative defaults because the consumer may point at vLLM, TGI, Ollama, or any custom server.

### xAI (createXaiProvider)

```typescript
quirks: {
  supportsToolChoice: true,         // xAI grok-4 supports tool_choice
  parallelToolCalls: true,          // Parallel tool calls supported
  structuredOutputs: true,          // response_format supported
  responseFormatHonored: true,      // xAI treats response_format as authoritative
  streamingDiverges: false,         // Streaming matches buffered
  reasoningTokensReported: true,    // CITED: completion_tokens_details.reasoning_tokens (D-07 carryforward)
  logprobsSupported: false,         // CITED: grok-4.20 silently ignores logprobs per docs.x.ai
} satisfies XaiQuirks
```

Citation: https://docs.x.ai/api/endpoints + xai.ts D-07 carryforward from Phase 4 (RESEARCH §Q6/§Q4).

## Per-Adapter negotiate() Patterns

### OpenAI: Sparse /models -> Registry Intersection

- URL: `${baseUrl}/v1/models` (GET with `Authorization: Bearer ${apiKey}`, `accept: application/json`)
- Response: sparse `{ object: "list", data: [{ id, object, created, owned_by }] }` per RESEARCH §Q2
- Logic: `body.data.find(m => m.id === modelId)` — if found + registry profile exists: `source: "live"` from registry; if not found: `source: "registry-fallback"` + emit event
- Closure: TTL cache Map + inflight Map (`.finally` cleanup, Pitfall 4) + retry [0, 200, 1000]ms
- Auth error: NegotiationAuthError with `adapter: "openai"` (no retry, no fallback, no event)
- Transient: 5xx/network falls back to registry + emits `capabilities.negotiation.fallback` RunEvent

### OpenAI-compat: Registry-Only (D-04 Intentional No-Endpoint Pattern)

- No fetch, no cache, no inflight, no event emission
- Delegates directly to `synthesizeNegotiatedCapabilitiesFromRegistry(adapterId, modelId, "registry")`
- Source is always `"registry"` (intentional-no-endpoint signal, distinct from `"registry-fallback"`)
- `adapterId` = `options.id ?? "openai-compatible"` — may not match CapabilityAdapter enum for custom ids; `synthesizeNegotiatedCapabilitiesFromRegistry` handles unknown adapter gracefully (returns empty-stub)
- Options `modelsCacheTtlMs`, `modelsRetryCount`, `runEventSink` accepted for uniformity but unused (JSDoc documents this)
- This is the prototype pattern for Plan 34-05 (LM Studio) which reuses the same registry-only approach

### xAI: Lenient-Parse Sparse /models

- URL: `${resolvedBaseUrl}/models` (xAI baseUrl = `https://api.x.ai/v1`, GET with `Authorization: Bearer ${apiKey}`)
- Response: INFERRED OpenAI-compatible sparse shape per RESEARCH §A1 (undocumented endpoint)
- LENIENT-PARSE per Pitfall 1: `Array.isArray(body?.data)` check first; if not array: immediate registry-fallback without crash. Only if array: `.find(m => m.id === modelId)`
- Same closure/retry/fallback/event pattern as OpenAI
- Auth error: NegotiationAuthError with `adapter: "xai"`
- Test 4 (weird body): `{ weird: "shape", data: "not-an-array" }` → graceful fallback confirmed

## Test Count Delta

| File | Before | After | Delta |
|------|--------|-------|-------|
| `adapters.test.ts` | 7 tests | 24 tests | +17 (9 OpenAI negotiate + 6 OpenAI-compat + 2 extra) |
| `xai.test.ts` | 8 tests | 16 tests | +8 (7 Phase 34 + 1 grouped) |
| **Total suite** | 659 tests | 683 tests | **+24** |

Note: adapters.test.ts has 24 total (7 pre-existing Phase 7 tests + 9 OpenAI negotiate + 6 OpenAI-compat + 2 extra variant tests).

## Fixtures

| File | Shape | Purpose |
|------|-------|---------|
| `openai-models-ok.json` | `{ object: "list", data: [{ id, object, created, owned_by }] }` | 3 sparse rows (gpt-4o-2024-08-06, gpt-4o-mini, o1) — NO capabilities block per RESEARCH §Q2 |
| `openai-models-401.json` | `{ error: { message, type, code } }` | Realistic OpenAI 401 envelope |
| `openai-models-503.json` | `{ error: { message, type } }` | Realistic OpenAI 503 envelope |
| `xai-models-ok.json` | `{ object: "list", data: [{ id, object, created, owned_by }] }` | 2 rows (grok-4-0709, grok-4) — inferred OpenAI-compat shape per RESEARCH §Q4 |
| `xai-models-401.json` | `{ error: { message, type } }` | xAI 401 envelope (realistic OpenAI-compat shape) |

## D-05..D-12 Decision Verification

| Decision | OpenAI | OpenAI-compat | xAI |
|----------|--------|---------------|-----|
| D-05 (per-instance cache Map) | TTL Map in closure | N/A (no /models) | TTL Map in closure |
| D-06 (one Map per factory call) | Confirmed (closure) | N/A | Confirmed (closure) |
| D-07 (lazy expiry) | `cached.expiresAt > Date.now()` | N/A | Same |
| D-08 (modelsCacheTtlMs option) | Yes, default 300_000ms | Accepted (unused) | Yes, default 300_000ms |
| D-09 (registry-fallback source) | Test 4, 6 verified | Source always "registry" | Test 4, 6 verified |
| D-10 (NegotiationAuthError) | Test 5: adapter="openai" | N/A (no fetch) | Test 5: adapter="xai" |
| D-11 (retry policy) | Test 8: 3 attempts | N/A (no fetch) | Test 7: 3 attempts |
| D-12 (fallback event) | Test 4 (not-found), Test 6 (503) | NOT fired (source="registry" is happy path) | Test 4 (weird shape), Test 6 (503) |

## Threat Mitigation Verification

| Threat | Mitigation | Evidence |
|--------|------------|----------|
| T-34-03-01 (apiKey leak in event payload) | `stringifyErr` returns `err.message` only (not stack) | grep `err.stack` returns empty in adapters.ts and xai.ts |
| T-34-03-05 (unknown adapterId in openai-compat) | `synthesizeNegotiatedCapabilitiesFromRegistry` returns empty-stub gracefully | Test 4 (openai-compat): `contextWindow: 0`, all supports false |
| T-34-03-07 (inflight Map leak) | `.finally(() => inflight.delete(modelId))` in both adapters | grep confirms: adapters.ts:493, xai.ts:266 |

## Note for Plan 34-04

Plan 34-03 completed OpenAI + xAI's sparse /models -> registry intersection pattern. The inflight/cache/retry/fallback closure pattern is now validated across 2 implementations (Plan 34-02 Anthropic + Plan 34-03 OpenAI/xAI). Plan 34-04 handles Gemini's medium-thick `supportedGenerationMethods` AND OpenRouter's rich /models with the ANCHOR CASE STUDY verification. Plan 34-05 (LM Studio) follows the OpenAI-compat no-remote-/models pattern established here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] xAI URL construction: avoid double /v1/v1/models**
- **Found during:** Task 3
- **Issue:** xAI's DEFAULT_XAI_BASE_URL is `https://api.x.ai/v1`; appending `/v1/models` would produce `https://api.x.ai/v1/v1/models`. The correct append is `/models`.
- **Fix:** Changed `${resolvedBaseUrl}/v1/models` to `${resolvedBaseUrl}/models` in xai.ts. Updated test URL assertion accordingly.
- **Files modified:** `packages/lattice/src/providers/xai.ts`, `packages/lattice/src/providers/xai.test.ts`
- **Commit:** c94ff8a

**2. [Rule 1 - Bug] xai.ts return type incompatible with exactOptionalPropertyTypes**
- **Found during:** Task 3 typecheck
- **Issue:** Spreading `inner` (from createOpenAICompatibleProvider) gives an object with `execute?: ...` (optional). TypeScript's `exactOptionalPropertyTypes` rejects returning `execute: functionOrUndefined` when the intersection requires `execute` to be a function. Conditional spread `...(execute !== undefined ? { execute } : {})` with explicit field composition resolves this.
- **Fix:** Built the return object explicitly rather than spreading `inner` wholesale; used `...(wrappedExecute !== undefined ? { execute: wrappedExecute } : {})` conditional spread.
- **Files modified:** `packages/lattice/src/providers/xai.ts`
- **Commit:** c94ff8a (included in same commit)

## Known Stubs

None. All three adapters have fully wired `negotiateCapabilities` implementations. The registry intersection path uses `synthesizeNegotiatedCapabilitiesFromRegistry` which is documented as intentional graceful-degradation behavior (not a stub), consistent with Plan 34-01.

## Threat Flags

None. No new network endpoints, auth paths, or schema changes beyond what is documented in the plan's threat model (T-34-03-01 through T-34-03-07). The `negotiateCapabilities` path introduced two new /models HTTP endpoints (OpenAI and xAI) but these are documented as the intended surface in the plan.

## Self-Check: PASSED

Checking created files:
- [x] `packages/lattice/src/providers/adapters.ts` — OpenAI + OpenAI-compat factories extended with quirks + negotiateCapabilities
- [x] `packages/lattice/src/providers/adapters.test.ts` — 24 tests (7 + 17 new)
- [x] `packages/lattice/src/providers/xai.ts` — xAI factory extended with quirks + negotiateCapabilities
- [x] `packages/lattice/src/providers/xai.test.ts` — 16 tests (8 + 8 new)
- [x] `packages/lattice/test/__fixtures__/quirks/openai-models-ok.json` — 3 sparse rows
- [x] `packages/lattice/test/__fixtures__/quirks/openai-models-401.json` — 401 envelope
- [x] `packages/lattice/test/__fixtures__/quirks/openai-models-503.json` — 503 envelope
- [x] `packages/lattice/test/__fixtures__/quirks/xai-models-ok.json` — 2 sparse rows
- [x] `packages/lattice/test/__fixtures__/quirks/xai-models-401.json` — 401 envelope

Checking commits:
- [x] `cd9b9c3` — feat(34-03): OpenAI quirks + negotiate() + OpenAI-compat registry-only + fixtures
- [x] `c94ff8a` — feat(34-03): xAI quirks + negotiate() with lenient-parse + fixtures

Checking test results:
- [x] 683/683 tests pass (full suite)
- [x] typecheck: exit 0
