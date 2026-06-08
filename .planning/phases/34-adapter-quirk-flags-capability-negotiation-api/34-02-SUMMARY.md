---
phase: 34
plan: "02"
subsystem: providers
tags:
  - quirks
  - negotiation
  - anthropic
  - thick-reference-impl
  - cache
  - retry
  - inflight-coalescing
dependency_graph:
  requires:
    - Phase 33 (capabilities/registry.static.ts, capabilities/lookup.ts)
    - Phase 34-01 (providers/quirks.ts::AnthropicQuirks, capabilities/negotiate.ts::NegotiationAuthError + synthesizeNegotiatedCapabilitiesFromRegistry, tracing/tracing.ts::RunEventSink + createRunEvent)
  provides:
    - Anthropic THICK reference implementation of negotiateCapabilities() (Plans 03-05 mirror this closure structure)
    - quirks: AnthropicQuirks block with 8 verified values
    - 3 frozen /v1/models fixture JSON files (anthropic-models-{ok,401,503}.json)
  affects:
    - packages/lattice/src/providers/anthropic.ts (extended factory)
    - packages/lattice/src/providers/anthropic.test.ts (extended test suite)
tech_stack:
  added: []
  patterns:
    - "Per-instance TTL Map cache with lazy expiry (D-05/D-06/D-07/D-08)"
    - "Inflight coalescing via Map<string, Promise<T>> + .finally cleanup (Pitfall 4 / Q7)"
    - "Retry-with-backoff [0ms, 200ms, 1000ms] on transient 5xx/network errors (D-11)"
    - "Auth-error-throw vs transient-fallback policy (D-09/D-10)"
    - "synthesizeNegotiatedCapabilitiesFromRegistry as fallback path (D-09)"
    - "capabilities.negotiation.fallback RunEvent emission via RunEventSink seam (D-12)"
    - "Lenient /v1/models parsing with optional chaining (Pitfall 1)"
    - "Factory return type narrowing: ProviderAdapter & { quirks: AnthropicQuirks; negotiateCapabilities }"
key_files:
  modified:
    - packages/lattice/src/providers/anthropic.ts
    - packages/lattice/src/providers/anthropic.test.ts
  created:
    - packages/lattice/test/__fixtures__/quirks/anthropic-models-ok.json
    - packages/lattice/test/__fixtures__/quirks/anthropic-models-401.json
    - packages/lattice/test/__fixtures__/quirks/anthropic-models-503.json
decisions:
  - "Tasks 1 and 2 committed atomically -- factory return type narrowing requires negotiate() to exist in the same commit (plan suggested this as preferred)"
  - "Test 7 (inflight cleanup) uses different modelIds per wave: first wave uses claude-opus-4 (static registry entry) to verify registry-fallback; 6th call uses claude-opus-4-6 (in MODELS_OK_BODY) to verify live source after fresh fetch"
  - "contextWindow policy: uses max_input_tokens when > 0; falls through to registry profile when 0 (Anthropic sets 0 for some models per RESEARCH §Q1)"
  - "modelId not-found in live /v1/models body returns source: 'registry-fallback' per planner advisory"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-08"
  tasks: 2
  files: 5
---

# Phase 34 Plan 02: Anthropic THICK Reference Implementation Summary

Wired Phase 34's contract surface onto the Anthropic provider adapter. The Anthropic adapter is now the THICK reference implementation: `negotiateCapabilities()` uses Anthropic's `/v1/models` capabilities block to populate `NegotiatedCapabilities.supports.*` DIRECTLY from upstream truth. Plans 03 and 04 will mirror the closure structure but with thinner /models intersection.

## One-Liner

Anthropic adapter ships full negotiate() gold standard: per-instance TTL cache + inflight coalescing + [0ms/200ms/1s] retry + 401-throw + 503-fallback + RunEvent emission, with quirks block of 8 verified booleans.

## Quirks Block Field-by-Field

| Field | Value | Citation |
|-------|-------|---------|
| `supportsToolChoice` | `true` | Anthropic tool_choice mode supported per [Anthropic tool use docs](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) |
| `parallelToolCalls` | `true` | Parallel tool calls verified in Anthropic tool_use spec |
| `structuredOutputs` | `true` | `capabilities.structured_outputs.supported` in /v1/models live response |
| `responseFormatHonored` | `true` | Anthropic honors JSON schema response_format strictly |
| `streamingDiverges` | `false` | Anthropic streaming output matches buffered output |
| `promptCachingSupported` | `true` | Cited: [Anthropic prompt caching docs](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) -- GA on all active Claude models |
| `extendedThinkingSupported` | `true` | Cited: [Anthropic extended thinking docs](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking) -- claude-3-7-sonnet+ and claude-*-4 families; verified via /v1/models capabilities.thinking.supported |
| `toolUseInputSchemaStrict` | `true` | Cited: [Anthropic tool use docs](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) -- strict JSON Schema required in input_schema field |

## negotiate() Implementation

### Files Touched
- `packages/lattice/src/providers/anthropic.ts` -- 468 LOC total (was 162 LOC; +306 lines)
- `packages/lattice/src/providers/anthropic.test.ts` -- 720 LOC total (was 218 LOC; +502 lines)
- 3 new fixture files in `packages/lattice/test/__fixtures__/quirks/`

### Key Patterns Used

**Closure structure (RESEARCH §Pattern 1):**
- Per-instance `cache: Map<string, CacheEntry>` and `inflight: Map<string, Promise<NegotiatedCapabilities>>` created inside the factory closure
- `negotiate(modelId)` is the public-facing entry point; chains: cache check -> inflight check -> new fetchPromise
- `fetchAndNegotiate(modelId)` is the inner loop: retry with backoff, auth-throw, fallback
- `mergeAnthropicModelsWithRegistry(modelId, body)` maps live response to NegotiatedCapabilities
- `emitFallbackEvent(payload)` emits RunEvent via optional sink
- `stringifyErr(err)` returns `err.message` only (T-34-02-01 security mitigation)

**Factory return type (RESEARCH §Pattern 1):**
```typescript
export function createAnthropicProvider(options): ProviderAdapter & {
  readonly quirks: AnthropicQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
}
```

**URL shape (RESEARCH §Q1):**
- `${baseUrl}/v1/models?limit=1000`
- Headers: `x-api-key`, `anthropic-version`, `accept: application/json`
- `AbortSignal.timeout(30_000)` per attempt

## Test Count Delta

| File | Before | After | Delta |
|------|--------|-------|-------|
| `anthropic.test.ts` | 9 tests (Phase 4) | 23 tests (Phase 4 + Phase 34) | +14 |
| Total lattice suite | 659 tests | 673 tests | +14 |

## Per-Test Decision Verification (D-05..D-12)

| Decision | Test | Verification |
|----------|------|-------------|
| D-05 (per-instance cache) | Test 4 | Two calls -> 1 fetch; cache Map created in closure |
| D-06 (per-instance scope) | Architecture | Each createAnthropicProvider() call creates fresh Maps; factory closure scoping |
| D-07 (lazy expiry) | Tests 4, 5 | `expiresAt > Date.now()` check on read; no background timer |
| D-08 (TTL configurability) | Tests 4, 5 | `modelsCacheTtlMs: 60_000` (cache) vs `modelsCacheTtlMs: 0` (no cache) |
| D-09 (registry-fallback source) | Tests 3, 7, 9 | `source: "registry-fallback"` on transient failures; `synthesizeNegotiatedCapabilitiesFromRegistry("anthropic", modelId, "registry-fallback")` |
| D-10 (auth-error throw) | Test 2 | 401 -> `NegotiationAuthError` thrown; `adapter: "anthropic"`, `httpStatus: 401`, no retry, no fallback |
| D-11 (retry policy) | Test 8 | `modelsRetryCount: 2` -> 3 total attempts; 503+503+200 -> `source: "live"` |
| D-12 (fallback event) | Test 3 | `runEventSink` receives event with `kind: "capabilities.negotiation.fallback"`, `metadata.fallbackSource: "registry-fallback"` |

## Inflight Coalescing Verification (Q7 + Pitfall 4)

- **Test 6**: 5 concurrent `negotiateCapabilities()` calls -> 1 fetch; all resolve to equivalent NegotiatedCapabilities
- **Test 7**: First wave (5 concurrent) hits 503 -> all get registry-fallback; `fetchCallCount === 1`. After first wave settles, 6th call triggers a FRESH fetch (`fetchCallCount === 2`) proving the `.finally` block cleared the inflight Map entry even on transient failure

Code pattern (Pitfall 4 hard requirement):
```typescript
const fetchPromise = (async () => {
  try {
    const result = await fetchAndNegotiate(modelId);
    if (ttlMs > 0) cache.set(modelId, { result, expiresAt: Date.now() + ttlMs });
    return result;
  } finally {
    inflight.delete(modelId);  // ALWAYS clear -- even on rejection
  }
})();
```

## Threat Surface Scan

The following threats were mitigated per the plan's threat register:

| Threat | Mitigation | Verified |
|--------|-----------|---------|
| T-34-02-01: apiKey leak into errorReason | `stringifyErr` returns `err.message` only; grep confirms no `err.stack` or `JSON.stringify(headers)` in emitFallbackEvent | Test 3 asserts errorReason does not contain "sk-ant-" |
| T-34-02-02: inflight Map DoS via wrong cleanup | `.finally` block is the only cleanup site; Test 7 verifies Map cleared after rejection | grep `inflight.delete` in finally block confirmed |
| T-34-02-03: __proto__ cache key | Map (not plain object) used for both cache and inflight | Inherited from Phase 33 D-09 pattern; Map uses SameValueZero |
| T-34-02-04: apiKey in NegotiationAuthError message | Message is `"Anthropic /v1/models returned ${status}: check apiKey config."` -- no key value | Test 2 asserts `caught.message` does not contain key value |
| T-34-02-05: stale fallback cache | Accepted (TTL-bounded; documented tradeoff per Pitfall 3) | -- |

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced in this plan. The emitFallbackEvent payload strictly follows T-34-02-01 mitigation.

## Anchor Reference for Plans 03/04/05

**Anthropic is the THICK reference implementation.** Plans 03 and 04 should mirror the closure structure (TTL cache Map + inflight Map + retry loop + auth-throw + transient-fallback) but the /models intersection will be thinner:

- **Plan 03 (OpenAI)**: OpenAI `/v1/models` returns a sparse capabilities object (mostly just `id`, `owned_by`, `permissions`). The intersection with the registry will rely more on static profile data. The same closure pattern applies.
- **Plan 04 (Gemini)**: Gemini's models endpoint has a medium-density capabilities block (safety settings, supported generation methods). Same closure; partial intersection with registry.
- **Plan 05 (LM Studio)**: No /models endpoint; factory returns `source: "registry"` directly without any HTTP fetch. The inflight/cache Maps are still created (for interface consistency) but never populated. `runEventSink` is never called.

The shared pattern every adapter should use (copy from Anthropic):
1. `const cache = new Map<string, CacheEntry>()`
2. `const inflight = new Map<string, Promise<NegotiatedCapabilities>>()`
3. `negotiate(modelId)` entry point with cache check + inflight check + fetchPromise with `.finally`
4. `fetchAndNegotiate(modelId)` retry loop with auth-throw
5. `emitFallbackEvent` via `options.runEventSink`
6. `synthesizeNegotiatedCapabilitiesFromRegistry("${adapter}", modelId, "registry-fallback")` as the fallback path

## Known Stubs

None. All functions are implemented. The `mergeAnthropicModelsWithRegistry` function uses the static registry profile for `contextWindow` fallback when `max_input_tokens` is 0 -- this is intentional behavior documented in JSDoc, not a stub.

## Self-Check: PASSED

Checking created/modified files:
- [x] `packages/lattice/src/providers/anthropic.ts` -- exists, 468 LOC, factory return type narrowed
- [x] `packages/lattice/src/providers/anthropic.test.ts` -- exists, 720 LOC, 23 tests
- [x] `packages/lattice/test/__fixtures__/quirks/anthropic-models-ok.json` -- exists, 3 models, thinking.supported: true for claude-opus-4-6
- [x] `packages/lattice/test/__fixtures__/quirks/anthropic-models-401.json` -- exists, authentication_error shape
- [x] `packages/lattice/test/__fixtures__/quirks/anthropic-models-503.json` -- exists, overloaded_error shape

Checking commits:
- [x] `a8f2233` -- feat(34-02): Anthropic THICK reference implementation -- quirks + negotiateCapabilities

Test counts:
- [x] `pnpm --filter @full-self-browsing/lattice test` -- 673/673 tests passing (56 test files)
- [x] `pnpm --filter @full-self-browsing/lattice typecheck` -- exits 0
