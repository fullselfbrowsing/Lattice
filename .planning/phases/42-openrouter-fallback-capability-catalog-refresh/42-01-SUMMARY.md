---
phase: 42-openrouter-fallback-capability-catalog-refresh
plan: 01
subsystem: providers
tags: [openrouter, gateway-fallback, openai-compatible]

requires: []
provides:
  - OpenRouter fallbackModels provider option
  - OpenRouter request-body models array injection
  - Provider gateway metadata for requested, fallback, and observed models
affects: [phase-42, openrouter, gateway-metadata]

tech-stack:
  added: []
  patterns:
    - OpenRouter-specific behavior stays in the OpenRouter wrapper around the OpenAI-compatible adapter
    - Gateway fallback candidates remain ProviderGatewayMetadata, not Lattice fallback routes

key-files:
  created:
    - .planning/phases/42-openrouter-fallback-capability-catalog-refresh/42-01-SUMMARY.md
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/providers/openrouter.ts
    - packages/lattice/src/providers/openrouter.test.ts
    - packages/lattice/test-d/index.test-d.ts

key-decisions:
  - "OpenRouter fallback candidates are exposed as fallbackModels on createOpenRouterProvider only."
  - "The primary route model remains the request model; fallback candidates serialize as OpenRouter's top-level models array."
  - "Observed served model metadata is captured additively in ProviderGatewayMetadata."

patterns-established:
  - "OpenRouter wrapper fetch can add provider-specific request fields without widening OpenAICompatibleProviderOptions."
  - "Gateway metadata names requestedModel, fallbackModels, and observedModel distinctly."

requirements-completed: [ORCAT-01, ORCAT-06]

duration: 15 min
completed: 2026-06-16
---

# Phase 42 Plan 01: OpenRouter Fallback Request Surface Summary

**OpenRouter fallbackModels serialize to provider-level models arrays while Lattice keeps the requested primary route stable**

## Performance

- **Duration:** 15 min
- **Started:** 2026-06-16T04:02:00Z
- **Completed:** 2026-06-16T04:17:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added `fallbackModels?: readonly string[]` to `OpenRouterProviderOptions` and `ProviderGatewayMetadata`.
- Wrapped the OpenRouter fetch path so fallback candidates serialize as OpenRouter's documented `models` field only when configured.
- Wrapped OpenRouter execution responses so gateway metadata includes requested, fallback, and observed served model information.
- Added focused adapter tests and package-root type coverage.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed fallback metadata and OpenRouter fallbackModels option** - `17afccb` (feat)
2. **Task 2: Inject OpenRouter models[] through the delegated fetch path** - `a2353d1` (feat)
3. **Task 3: Return OpenRouter gateway metadata and add adapter/type tests** - `380ea6f` (test)

## Files Created/Modified

- `packages/lattice/src/providers/provider.ts` - Adds `fallbackModels` to normalized gateway metadata.
- `packages/lattice/src/providers/openrouter.ts` - Adds fallback normalization, request injection, and gateway metadata wrapping.
- `packages/lattice/src/providers/openrouter.test.ts` - Covers fallback request shape and observed model metadata.
- `packages/lattice/test-d/index.test-d.ts` - Proves package-root OpenRouter fallback option typing.

## Decisions Made

- Followed the plan as specified: no `@openrouter/sdk`, no generic `extraBody`, and no OpenRouter fallback candidates in the Lattice route fallback chain.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope changes.

## Issues Encountered

- The spawned executor subagent disconnected after committing Tasks 1 and 2. The orchestrator inspected the partial state, preserved both commits, and completed Task 3 inline.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- openrouter` - passed, 70 files / 926 tests.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 88 files / 1111 tests, no type errors.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.
- `node scripts/check-core-package-boundary.mjs` - passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 42-03 can proceed in Wave 1. Plan 42-02 can build on this gateway metadata after Wave 1 is complete.

## Self-Check: PASSED

- Acceptance criteria satisfied.
- Plan-level verification commands passed.
- No `@openrouter/sdk` dependency introduced.

---
*Phase: 42-openrouter-fallback-capability-catalog-refresh*
*Completed: 2026-06-16*
