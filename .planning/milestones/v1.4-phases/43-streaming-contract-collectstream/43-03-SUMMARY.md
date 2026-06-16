---
phase: 43-streaming-contract-collectstream
plan: 03
subsystem: testing
tags: [streaming, receipts, property-tests, changesets]

requires:
  - phase: 43-01
    provides: collectStream and provider stream chunks
  - phase: 43-02
    provides: policy.stream runtime execution path and stream lifecycle events
provides:
  - fast-check property-test infrastructure as a dev-only dependency
  - collector chunk-boundary invariant coverage
  - receipt outputHash chunk-boundary invariant coverage
  - release changeset for the additive streaming contract
affects: [receipts, provider-runtime, package-validation]

tech-stack:
  added:
    - fast-check@4.7.0
  patterns:
    - property tests with bounded numRuns for CI stability
    - runtime-loaded fast-check shim for TS 6 strict package typecheck

key-files:
  created:
    - packages/lattice/src/test-support/fast-check.ts
    - .changeset/streaming-contract.md
  modified:
    - pnpm-workspace.yaml
    - packages/lattice/package.json
    - pnpm-lock.yaml
    - packages/lattice/src/providers/streaming.test.ts
    - packages/lattice/src/runtime/create-ai.test.ts

key-decisions:
  - "fast-check is a lattice package devDependency, not a runtime dependency."
  - "Receipt property tests compare verified receipt bodies so the invariant covers signed outputHash, not only runtime outputs."
  - "fast-check is loaded through a test-local shim because its TS 6 declaration path fails under skipLibCheck:false."

patterns-established:
  - "Property tests use small bounded numRuns values: 50 for collector-only checks and 25 for receipt signing/verifying checks."
  - "When a dev-only test library declaration fails full tsc, tests may use a typed runtime shim instead of weakening skipLibCheck."

requirements-completed: [STRM-03, STRM-05, STRM-01, STRM-02, STRM-04]

duration: 5min
completed: 2026-06-16
---

# Phase 43 Plan 03 Summary

**Property coverage proving stream chunk boundaries do not affect collected outputs or signed receipt output hashes**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-16T06:10:55Z
- **Completed:** 2026-06-16T06:15:49Z
- **Tasks:** 4
- **Files modified:** 7

## Accomplishments

- Added `fast-check` as dev-only property-test infrastructure and refreshed `pnpm-lock.yaml`.
- Proved `collectStream()` output assembly is invariant to text chunk boundaries.
- Proved streaming receipt `outputHash` is computed after collection by comparing verified receipts for single-chunk and split-chunk streams.
- Added a changeset documenting `executeStream?`, normalized stream chunks, and `collectStream()`.

## Task Commits

1. **Task 1: Add fast-check test infrastructure** - `9b9b1a5` (test)
2. **Task 2: Prove collector chunk invariance** - `cd536da` (test)
3. **Task 3: Prove streaming receipt hash invariance** - `02d01a1` (test)
4. **Task 4 auto-fix: Isolate fast-check declarations from tsc** - `44e6217` (fix)
5. **Task 4: Add streaming contract changeset** - `25ef841` (docs)

**Plan metadata:** this summary commit.

## Files Created/Modified

- `pnpm-workspace.yaml` - adds `fast-check` to the catalog.
- `packages/lattice/package.json` - adds `fast-check` under `devDependencies`.
- `pnpm-lock.yaml` - records `fast-check` and `pure-rand`.
- `packages/lattice/src/providers/streaming.test.ts` - adds collector chunk-boundary property coverage.
- `packages/lattice/src/runtime/create-ai.test.ts` - adds streaming receipt `outputHash` property coverage.
- `packages/lattice/src/test-support/fast-check.ts` - provides a typed runtime loader for the subset of fast-check used by tests.
- `.changeset/streaming-contract.md` - release note for the additive streaming contract.

## Decisions Made

- Kept property runs bounded: `numRuns: 50` for collector tests and `numRuns: 25` for receipt tests.
- Compared verified receipt bodies rather than unsigned runtime internals for the receipt hash invariant.
- Avoided `skipLibCheck` changes; the repo keeps strict checking of dependency declarations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Direct fast-check import broke full tsc**
- **Found during:** Task 4 package closure gate
- **Issue:** `fast-check@4.7.0` exposes a TS 5.7+ declaration path containing `readonly value!: T`, which TS 6 rejects with `skipLibCheck:false`.
- **Fix:** Replaced direct `import fc from "fast-check"` in tests with a test-local `createRequire` shim exposing only `assert`, `asyncProperty`, `array`, and `string`.
- **Files modified:** `packages/lattice/src/test-support/fast-check.ts`, `packages/lattice/src/providers/streaming.test.ts`, `packages/lattice/src/runtime/create-ai.test.ts`
- **Verification:** full closure gate passed.
- **Committed in:** `44e6217`

---

**Total deviations:** 1 auto-fixed dependency declaration issue
**Impact on plan:** Property tests still use `fast-check@4.7.0`; the only change is how tests load it so package typecheck remains strict.

## Issues Encountered

The final gate initially failed at `pnpm --filter @full-self-browsing/lattice typecheck` because TypeScript checked `fast-check` declarations. The runtime shim resolved it without changing production code or package compiler settings.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- streaming`
- `pnpm --filter @full-self-browsing/lattice test -- create-ai`
- `pnpm --filter @full-self-browsing/lattice test -- streaming create-ai provider public-surface`
- `pnpm --filter @full-self-browsing/lattice test:types`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `node scripts/check-core-package-boundary.mjs`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 43 now has the streaming contract, runtime opt-in, bounded lifecycle events, receipt hash invariants, and release note needed before provider-specific streaming adapter work.

---
*Phase: 43-streaming-contract-collectstream*
*Completed: 2026-06-16*
