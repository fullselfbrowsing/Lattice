---
phase: 53-standalone-core-modules
plan: 01
subsystem: core
tags: [standalone-core, context, artifacts, routing, storage, public-api]
requires:
  - phase: 50-module-boundary-contract
    provides: modular package subpath facades and boundary checks
  - phase: 52-external-execution-audit-layer
    provides: external audit records that can consume prepared hashes and plans
provides:
  - prepareCoreRun helper for non-executing core preparation
  - PreparedCoreRun and PreparedCoreArtifact public types
  - focused tests and core subpath type coverage
affects: [core, context, artifacts, routing, storage, audit, dogfood]
tech-stack:
  added: []
  patterns:
    - additive facade helper over existing pure kernels
    - advisory no-provider execution records
key-files:
  created:
    - packages/lattice/src/core/standalone.ts
    - packages/lattice/src/core/standalone.test.ts
  modified:
    - packages/lattice/src/core.ts
    - packages/lattice/test-d/modular-entrypoints.test-d.ts
    - docs/modular-entrypoints.md
key-decisions:
  - "prepareCoreRun is exported from the core subpath, not the root package, to keep the beginner API small."
  - "Missing catalog defaults to a no-route advisory catalog instead of blocking artifact/context preparation."
  - "Input hashes are reported only when available; ref-only artifacts do not receive fabricated hashes."
patterns-established:
  - "Standalone preparation composes existing artifact, storage, context, routing, and plan kernels without provider or agent imports."
requirements-completed: [CORE-01, CORE-02, CORE-03, CORE-04, CORE-05]
duration: 12min
completed: 2026-06-20
---

# Phase 53 Plan 01: Standalone Core Preparation Record Summary

**Non-executing core preparation helper for artifact refs, optional storage, context packs, advisory routes, hashes, and inspectable execution plans**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-20T03:05:08Z
- **Completed:** 2026-06-20T03:17:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `prepareCoreRun(input)` in `packages/lattice/src/core/standalone.ts`.
- Exposed `PreparedCoreRun`, `PreparedCoreArtifact`, and `PrepareCoreRunInput` through `@full-self-browsing/lattice/core`.
- Added tests proving standalone context/session packing, optional storage persistence, advisory routing, no-route fallback, and no provider execution.
- Updated modular entrypoint docs with a core-only `prepareCoreRun` example.

## Task Commits

1. **Task 53-01: Standalone core helper, tests, and docs** - `ed5f668` (feat)
2. **Review fix: custom storage hash fallback** - `5ba40b0` (fix)

## Files Created/Modified

- `packages/lattice/src/core/standalone.ts` - Composes artifact preparation, optional storage, context packing, routing, and plan creation into `PreparedCoreRun`.
- `packages/lattice/src/core/standalone.test.ts` - Covers selected routes, no-route fallback, storage refs, session turns, and provider non-execution.
- `packages/lattice/src/core.ts` - Re-exports the helper and public types from the core facade.
- `packages/lattice/test-d/modular-entrypoints.test-d.ts` - Type-checks `prepareCoreRun` from the built core subpath.
- `docs/modular-entrypoints.md` - Documents core-only prepared core records for external runtimes.

## Decisions Made

- Keep the helper in the `core` subpath only; root exports remain unchanged.
- Use an empty catalog `{ version: "standalone-empty", models: [] }` when no catalog is supplied so artifact/context preparation still succeeds with a no-route plan.
- Return available input hashes only and keep per-artifact `inputHash` optional.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- `pnpm --filter @full-self-browsing/lattice test:types` initially failed because `dist/core.d.ts` was stale. Running `pnpm --filter @full-self-browsing/lattice build` refreshed declarations, and the rerun passed.
- Inline code review found that a custom `ArtifactStore.put` could return a ref without a fingerprint. `prepareCoreRun` now preserves or computes the available input hash in that storage path.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- standalone` - passed, 80 files / 1,042 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.
- `node scripts/check-lattice-module-boundaries.mjs` - passed.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 99 files / 1,239 tests, no type errors.
- `pnpm --filter @full-self-browsing/lattice lint:packages` - passed.

## Next Phase Readiness

Phase 54 can build tool/MCP optionality on top of the same module-boundary approach. Phase 55 can use `prepareCoreRun` in dogfood examples for external runtimes that own execution.

---
*Phase: 53-standalone-core-modules*
*Completed: 2026-06-20*
