---
phase: 34
plan: "01"
subsystem: capabilities
tags:
  - quirks
  - negotiation
  - type-foundation
  - sanitizer
dependency_graph:
  requires:
    - Phase 33 (capabilities/profile.ts, capabilities/lookup.ts, capabilities/registry.generated.ts, capabilities/registry.static.ts)
  provides:
    - AdapterQuirks base + 7 narrowed sub-interfaces (Plans 02-05 implement against)
    - NegotiatedCapabilities interface
    - NegotiationAuthError class
    - negotiateCapabilities top-level helper
    - synthesizeNegotiatedCapabilitiesFromRegistry helper
    - SanitizerKey + SANITIZER_BY_FAILURE_MODE + getRecommendedSanitizers
    - "capabilities.negotiation.fallback" RunEventKind literal
  affects:
    - packages/lattice/src/providers/provider.ts (ProviderAdapter gains optional quirks + negotiateCapabilities)
    - packages/lattice/src/tracing/tracing.ts (RunEventKind union extended)
    - packages/lattice/src/index.ts (13 new public exports + RunEvent/RunEventKind/RunEventSink previously missing)
tech_stack:
  added: []
  patterns:
    - "Class extends Error (mirrors AgentDeniedError precedent from agent/types.ts)"
    - "Record<KnownFailureMode, SanitizerKey | null> exhaustive table with as const"
    - "Set-based dedup for getRecommendedSanitizers filter-null output"
    - "Pitfall 5 zero-logic top-level helper (pure delegation + registry fallback)"
key_files:
  created:
    - packages/lattice/src/providers/quirks.ts
    - packages/lattice/src/capabilities/sanitizer-recommendations.ts
    - packages/lattice/src/capabilities/negotiate.ts
    - packages/lattice/test/capabilities-sanitizer-recommendations.test.ts
    - packages/lattice/test/capabilities-negotiate-helper.test.ts
    - packages/lattice/test-d/quirks-negotiation.test-d.ts
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/capabilities/index.ts
    - packages/lattice/src/tracing/tracing.ts
    - packages/lattice/src/index.ts
    - .planning/REQUIREMENTS.md
decisions:
  - "Committed Tasks 2 and 3 together (atomic) since negotiate.ts and provider.ts cross-reference via import type — avoids temporary stub requirement"
  - "Added RunEvent + RunEventKind + RunEventSink to src/index.ts public exports (were missing from the re-export list despite being in public-types.ts; Rule 2 auto-fix)"
  - "synthesizeNegotiatedCapabilitiesFromRegistry exported as named function (Plans 02-05 reuse the fallback synthesis logic from their adapt negotiate() implementations)"
  - "mapProfileToNegotiatedCapabilities also exported as _mapProfileToNegotiatedCapabilities for Plans 02-05 live-path intersection"
metrics:
  duration: "~30 minutes"
  completed: "2026-06-08"
  tasks: 3
  files: 11
---

# Phase 34 Plan 01: AdapterQuirks + Capability Negotiation Type Foundation Summary

Shipped the typed Wave 0 foundation for Phase 34: 5 new REQ-IDs in REQUIREMENTS.md, the `AdapterQuirks` base + 7 narrowed sub-interfaces, the `NegotiatedCapabilities` + `NegotiationAuthError` + `negotiateCapabilities` contract surface, the `SanitizerKey` + `SANITIZER_BY_FAILURE_MODE` + `getRecommendedSanitizers` module, and the `"capabilities.negotiation.fallback"` `RunEventKind` literal.

## REQ-IDs Authored

### QUIRK-01
`AdapterQuirks` base interface in `packages/lattice/src/providers/quirks.ts` exposing 5 universal readonly booleans (`supportsToolChoice`, `parallelToolCalls`, `structuredOutputs`, `responseFormatHonored`, `streamingDiverges`); 7 per-adapter narrowed sub-interfaces (`AnthropicQuirks`, `OpenAIQuirks`, `OpenAICompatQuirks`, `GeminiQuirks`, `XaiQuirks`, `OpenRouterQuirks`, `LmStudioQuirks`) each extending `AdapterQuirks` with provider-specific flags (D-03). `quirks?: AdapterQuirks` added as OPTIONAL field to `ProviderAdapter` (D-01 non-breaking). All 8 types re-exported from `packages/lattice/src/index.ts`. `SanitizerKey` + `SANITIZER_BY_FAILURE_MODE` + `getRecommendedSanitizers` in `sanitizer-recommendations.ts` (D-13/D-14/D-15/D-16) also re-exported.

### QUIRK-02
Each of the 7 first-party adapter factories populates a typed `quirks` block with values matching real provider behavior; per-adapter quirk-fixture vitest tests assert each value. (Implemented in Plans 02-05.)

### QUIRK-03
Per-adapter `quirks` narrowing accessible via discriminant check on `adapter.id`; tsd type-level test (`test-d/quirks-negotiation.test-d.ts`) asserts that `if (adapter.id === "anthropic")` the consumer can access `AnthropicQuirks`-specific fields (MUST cast via factory return type OR explicit cast per D-03 contract).

### NEG-01
`negotiateCapabilities?(modelId: string): Promise<NegotiatedCapabilities>` OPTIONAL method on `ProviderAdapter` (D-02). Top-level helper `negotiateCapabilities(adapter, modelId)` in `capabilities/negotiate.ts` delegates verbatim (Pitfall 5) to `adapter.negotiateCapabilities` when present; otherwise synthesizes from Phase 33 registry with `source: "registry"` (D-04). `NegotiatedCapabilities` interface (8 fields) + `NegotiationAuthError extends Error` (`kind = "negotiation-auth-failed"`, `httpStatus: 401 | 403`) all exported from `src/index.ts`.

### NEG-02
Fetch-failure policy and retry for per-adapter implementations (Plans 02-04). New `RunEventKind` literal `"capabilities.negotiation.fallback"` (D-12) added to `tracing.ts` as the last union member with JSDoc comment.

## File-by-File Delta

### New Files

| File | LOC | Purpose |
|------|-----|---------|
| `packages/lattice/src/providers/quirks.ts` | ~130 | AdapterQuirks base + 7 narrowed sub-interfaces (D-03) |
| `packages/lattice/src/capabilities/sanitizer-recommendations.ts` | ~65 | SanitizerKey + SANITIZER_BY_FAILURE_MODE + getRecommendedSanitizers (D-13..D-16) |
| `packages/lattice/src/capabilities/negotiate.ts` | ~175 | NegotiatedCapabilities + NegotiationAuthError + top-level helper + synthesize helper (D-02/D-04/D-10) |
| `packages/lattice/test/capabilities-sanitizer-recommendations.test.ts` | ~75 | 8 vitest tests: table exhaustiveness, dedup, null filter, D-14 spot checks |
| `packages/lattice/test/capabilities-negotiate-helper.test.ts` | ~100 | 6 vitest tests: delegation, registry fallback, empty-stub, NegotiationAuthError shape |
| `packages/lattice/test-d/quirks-negotiation.test-d.ts` | ~130 | tsd type assertions: SanitizerKey exhaustive, AdapterQuirks, NegotiatedCapabilities.source, RunEventKind |

### Modified Files

| File | Change |
|------|--------|
| `packages/lattice/src/providers/provider.ts` | Added `import type { AdapterQuirks }` + `import type { NegotiatedCapabilities }`; extended `ProviderAdapter` with optional `quirks?` + `negotiateCapabilities?` (D-01/D-02) |
| `packages/lattice/src/capabilities/index.ts` | Added barrel re-exports for SanitizerKey, SANITIZER_BY_FAILURE_MODE, getRecommendedSanitizers, NegotiatedCapabilities, NegotiationAuthError, negotiateCapabilities, synthesizeNegotiatedCapabilitiesFromRegistry |
| `packages/lattice/src/tracing/tracing.ts` | Added `"capabilities.negotiation.fallback"` as last RunEventKind union member (D-12) |
| `packages/lattice/src/index.ts` | Added 13 new Phase 34 public exports; also added RunEvent + RunEventKind + RunEventSink (were missing from public index) |
| `.planning/REQUIREMENTS.md` | Added QUIRK-01..03 + NEG-01..02 REQ-IDs + traceability rows; Coverage table updated 59 -> 64 |

## Test Count Delta

| Before | After | Delta |
|--------|-------|-------|
| 589 vitest tests (before Phase 34 worktree base) | 659 vitest tests | +14 (8 sanitizer + 6 negotiate) |
| 789 tsd tests (task 1 snapshot) | 801 tsd tests | +12 (new quirks-negotiation.test-d.ts assertions) |
| 69 test files | 71 test files | +2 |

## Decision Verification: D-01..D-16 Implemented

| Decision | Status | Evidence |
|----------|--------|---------|
| D-01 (quirks location, optional) | Implemented | `ProviderAdapter.quirks?: AdapterQuirks` — 4-field consumer literal still satisfies ProviderAdapter |
| D-02 (negotiateCapabilities location, optional) | Implemented | `ProviderAdapter.negotiateCapabilities?: (modelId) => Promise<NegotiatedCapabilities>` |
| D-03 (quirks shape: base + 7 narrowed) | Implemented | `quirks.ts` exports 8 interfaces; tsd asserts AnthropicQuirks extends AdapterQuirks |
| D-04 (consumer-adapter fallback via registry) | Implemented | `negotiateCapabilities()` calls `synthesizeNegotiatedCapabilitiesFromRegistry` with `source: "registry"` when adapter lacks the method |
| D-05..D-08 (caching policy) | Typed surface only — Plans 02-05 own TTL Map in factory closure | Factory option shapes (`modelsCacheTtlMs`, `modelsRetryCount`) defined in RESEARCH §Pattern 1 |
| D-09 (registry-fallback source value) | Implemented | `synthesizeNegotiatedCapabilitiesFromRegistry` accepts `"registry-fallback"` as source param; Plans 02-04 pass this on transient failure |
| D-10 (NegotiationAuthError) | Implemented | Class mirrors AgentDeniedError; carries `kind`, `adapter`, `modelId`, `httpStatus: 401 \| 403` |
| D-11 (retry policy) | Plans 02-04 implement | Pattern defined in RESEARCH §Pattern 4 |
| D-12 (capabilities.negotiation.fallback event) | Implemented | tracing.ts union extended; tsd asserts `expectAssignable<RunEventKind>("capabilities.negotiation.fallback")` |
| D-13 (SanitizerKey closed union) | Implemented | `type SanitizerKey = "stripReasoningTags" \| "stripChatTemplateArtifacts" \| "unwrapInternalEnvelope"` |
| D-14 (SANITIZER_BY_FAILURE_MODE table) | Implemented | Record exhaustive over all 7 KnownFailureMode values; 8 vitest tests pass |
| D-15 (mapping location) | Implemented | `packages/lattice/src/capabilities/sanitizer-recommendations.ts` |
| D-16 (null encoding + exhaustive Record) | Implemented | `Record<KnownFailureMode, SanitizerKey \| null>` with `as const`; compile-time exhaustiveness enforced |

## Pitfall 5 Mitigation Verification

The top-level `negotiateCapabilities` helper has ZERO live-path logic:

```typescript
export async function negotiateCapabilities(
  adapter: ProviderAdapter,
  modelId: string,
): Promise<NegotiatedCapabilities> {
  if (adapter.negotiateCapabilities !== undefined) {
    return adapter.negotiateCapabilities(modelId);  // pure delegation
  }
  return synthesizeNegotiatedCapabilitiesFromRegistry(...);
}
```

No `new Map<` in the public function body. Verifiable via `grep -n "new Map<" packages/lattice/src/capabilities/negotiate.ts` (returns empty).

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries introduced in this plan. `NegotiationAuthError` carries `adapter`, `modelId`, and `httpStatus` only (T-34-01-02: apiKey never included per acceptance criteria for Plans 02-04). `synthesizeNegotiatedCapabilitiesFromRegistry` uses Map-based lookup (T-34-01-01: prototype-pollution safe, inherited from Phase 33). New `RunEventKind` literal may be a typed breaking change for exhaustive-switch consumers (T-34-01-04: documented in SECURITY.md precedent from Phase 17).

## Hand-off to Plans 02-05

`AdapterQuirks` + `NegotiatedCapabilities` + `NegotiationAuthError` + `synthesizeNegotiatedCapabilitiesFromRegistry` are now importable from `@full-self-browsing/lattice`. Plans 02-05 implement per-adapter `negotiate()` against this contract:

- Plans 02-05 import `NegotiatedCapabilities`, `NegotiationAuthError`, `synthesizeNegotiatedCapabilitiesFromRegistry` from `@full-self-browsing/lattice` (or the barrel path)
- Each adapter factory narrows its return type to include `quirks: AdapterQuirks` (or the specific sub-interface like `AnthropicQuirks`)
- Each adapter factory closes over a per-instance TTL Map (D-05/D-06) and implements the retry loop (D-11) per RESEARCH §Pattern 4
- Plans 02-04 emit `"capabilities.negotiation.fallback"` via the `RunEventSink` seam when falling back from /models to registry (D-12)

## Known Stubs

None in this plan. All exported functions are implemented. `synthesizeNegotiatedCapabilitiesFromRegistry` uses heuristic boolean derivation (documented in JSDoc as intentionally minimal — Plans 02-05 override with live /models data). This is not a stub; it is the specified graceful-degradation behavior.

## Self-Check: PASSED

Checking key created files:
- [x] `packages/lattice/src/providers/quirks.ts` — exists, 8 interfaces exported
- [x] `packages/lattice/src/capabilities/sanitizer-recommendations.ts` — exists, SanitizerKey + SANITIZER_BY_FAILURE_MODE + getRecommendedSanitizers exported
- [x] `packages/lattice/src/capabilities/negotiate.ts` — exists, NegotiatedCapabilities + NegotiationAuthError + negotiateCapabilities + synthesizeNegotiatedCapabilitiesFromRegistry exported
- [x] `packages/lattice/test/capabilities-sanitizer-recommendations.test.ts` — 8 tests pass
- [x] `packages/lattice/test/capabilities-negotiate-helper.test.ts` — 6 tests pass
- [x] `packages/lattice/test-d/quirks-negotiation.test-d.ts` — tsd passes
- [x] `.planning/REQUIREMENTS.md` — QUIRK-01..03 + NEG-01..02 authored; Coverage 59 -> 64

Checking commits:
- [x] `33ccd95` — feat(34-01): SanitizerKey + SANITIZER_BY_FAILURE_MODE + getRecommendedSanitizers
- [x] `d24a2c6` — feat(34-01): AdapterQuirks + NegotiatedCapabilities + NegotiationAuthError + RunEventKind
