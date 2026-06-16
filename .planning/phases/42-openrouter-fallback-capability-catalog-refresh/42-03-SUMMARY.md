---
phase: 42-openrouter-fallback-capability-catalog-refresh
plan: 03
subsystem: capability-registry
tags: [openrouter, capability-catalog, public-surface, packaging]

requires:
  - phase: 42-01
    provides: OpenRouter fallback option and gateway metadata foundation
provides:
  - Typed model profile pricing, modality, and supported-parameter metadata
  - Deterministic OpenRouter registry renderer for feed metadata
  - Refreshed generated OpenRouter registry with pricing and supported parameters
  - Public-surface and packaging guardrails for Phase 42 catalog changes
affects: [phase-42, capability-registry, openrouter, public-surface]

tech-stack:
  added: []
  patterns:
    - Feed metadata is additive and typed on ModelCapabilityProfile
    - Registry refresh remains build-time/manual and deterministic
    - Public runtime value exports remain inventory-checked separately from type-only exports

key-files:
  created:
    - .changeset/openrouter-fallback-catalog.md
    - .planning/phases/42-openrouter-fallback-capability-catalog-refresh/42-03-SUMMARY.md
  modified:
    - packages/lattice/src/capabilities/profile.ts
    - packages/lattice/src/capabilities/index.ts
    - packages/lattice/src/index.ts
    - packages/lattice/src/capabilities/registry.generated.ts
    - scripts/refresh-model-registry.mjs
    - packages/lattice/test/capabilities-classifier.test.ts
    - packages/lattice/test/capabilities-registry-integration.test.ts
    - packages/lattice/test/public-surface.test.ts
    - packages/lattice/test-d/capabilities.test-d.ts

key-decisions:
  - "Pricing is stored as raw strings on allowlisted keys to avoid precision loss."
  - "Supported parameters are normalized to sorted unique arrays for deterministic registry diffs."
  - "Optional OPENROUTER_API_KEY is script-only and not required for normal tests."

patterns-established:
  - "Renderer order for generated profiles is contextWindow, pricing, modalities, supportedParameters, knownFailureModes."
  - "Capability profile metadata type exports are asserted through package-root tsd tests."

requirements-completed: [ORCAT-01, ORCAT-03, ORCAT-04, ORCAT-05]

duration: 6 min
completed: 2026-06-16
---

# Phase 42 Plan 03: OpenRouter Catalog Refresh Summary

**OpenRouter registry refresh now emits typed pricing and supported-parameter metadata with deterministic package guardrails**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-16T04:17:00Z
- **Completed:** 2026-06-16T04:23:16Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added public `ModelCapabilityProfilePricingKey`, `ModelCapabilityProfilePricing`, and `ModelCapabilityProfileModality` types.
- Added optional `pricing`, `inputModalities`, `outputModalities`, and `supportedParameters` fields to `ModelCapabilityProfile`.
- Extended the registry refresh script with allowlisted pricing, modality normalization, sorted supported parameters, and optional script-only `OPENROUTER_API_KEY`.
- Refreshed `registry.generated.ts`; generated OpenRouter profiles now include pricing and supported-parameter metadata where the feed provides it.
- Added runtime public-surface, registry integration, type-level, package lint, core-boundary, and tarball-leak guardrails.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed OpenRouter feed metadata to capability profiles** - `ae37845` (feat)
2. **Task 2: Extend registry refresh transform and renderer deterministically** - `9065712` (feat)
3. **Task 3: Close public surface, release note, and package gates** - `5f77ec5` (test)

## Files Created/Modified

- `packages/lattice/src/capabilities/profile.ts` - Adds additive typed feed metadata fields.
- `packages/lattice/src/capabilities/index.ts` - Re-exports new capability profile metadata types.
- `packages/lattice/src/index.ts` - Re-exports new type-only profile metadata names from the package root.
- `scripts/refresh-model-registry.mjs` - Normalizes and renders pricing, modalities, supported parameters, and optional script auth.
- `packages/lattice/src/capabilities/registry.generated.ts` - Regenerated OpenRouter profiles with feed metadata.
- `packages/lattice/test/capabilities-classifier.test.ts` - Covers deterministic rendering and metadata normalization.
- `packages/lattice/test/capabilities-registry-integration.test.ts` - Asserts generated supported parameters and anchor profile resolution.
- `packages/lattice/test/public-surface.test.ts` - Guards Phase 42 OpenRouter runtime exports.
- `packages/lattice/test-d/capabilities.test-d.ts` - Proves new type-only profile metadata.
- `.changeset/openrouter-fallback-catalog.md` - Adds minor release note.

## Decisions Made

- Kept live OpenRouter fetching in the manual/scheduled refresh script; normal tests continue to use fixtures and committed generated output.
- Kept unknown provider prefix behavior permissive with warnings, matching the existing classifier policy.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported new type-only metadata names during Task 1**
- **Found during:** Task 1 type verification
- **Issue:** `tsd` imports the new profile metadata types from the package root, so updating only `profile.ts` and the focused test file left `dist/index.d.ts` without those names.
- **Fix:** Added the type-only re-exports in `capabilities/index.ts` and `src/index.ts` during Task 1 instead of waiting for Task 3.
- **Files modified:** `packages/lattice/src/capabilities/index.ts`, `packages/lattice/src/index.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice test:types`
- **Committed in:** `ae37845`

---

**Total deviations:** 1 auto-fixed (blocking verification order).
**Impact on plan:** No scope change; Task 3's public type export requirement was satisfied earlier to keep task-level verification meaningful.

## Issues Encountered

- `tsd` reads `packages/lattice/dist/index.d.ts`, so local declaration output had to be refreshed with `pnpm --filter @full-self-browsing/lattice build` before the new package-root types were visible to `test:types`.
- Manual registry refresh emitted expected unknown-prefix classifier warnings for new OpenRouter vendors under the existing permissive fallback policy.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- capabilities-classifier` - passed, 70 files / 927 tests.
- `node scripts/refresh-model-registry.mjs --check` - passed against the refreshed registry.
- `pnpm --filter @full-self-browsing/lattice test -- openrouter create-ai planning-execution capabilities-classifier capabilities-registry public-surface` - passed, 70 files / 930 tests.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 88 files / 1119 tests, no type errors.
- `pnpm --filter @full-self-browsing/lattice lint:packages` - passed.
- `node scripts/check-core-package-boundary.mjs` - passed.
- `node scripts/check-tarball-leak.mjs` - passed.

## User Setup Required

None - no external service configuration required. `OPENROUTER_API_KEY` is optional for the manual refresh script only.

## Next Phase Readiness

Wave 1 catalog work is complete. Plan 42-02 can now consume the OpenRouter gateway metadata from Plan 42-01 and the refreshed registry metadata from Plan 42-03.

## Self-Check: PASSED

- Acceptance criteria satisfied.
- Plan-level verification commands passed.
- Registry output remains deterministic for identical input.
- No `@openrouter/sdk` dependency introduced.

---
*Phase: 42-openrouter-fallback-capability-catalog-refresh*
*Completed: 2026-06-16*
