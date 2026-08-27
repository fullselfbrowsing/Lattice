---
phase: 62-operational-interop-and-hygiene
plan: 01
subsystem: distribution
tags: [node24, node26, tarball, esm, ci]
requires:
  - phase: 58-conformance-and-client-migration
    provides: clean packed runtime/CLI protocol consumer
provides:
  - shared build, pack, clean-install, and installed-manifest helper
  - packed root, modular, runtime, receipt, version, and CLI smoke
  - Node 24 and Node 26 packed-consumer CI matrix
  - Node 24 pre-publish and conformance packed validation
affects: [provider-canary, release, documentation, module-compatibility]
tech-stack:
  added: []
  patterns: [tarball-only consumer, shared packed-package helper, bounded runtime matrix]
key-files:
  created:
    - scripts/lib/packed-packages.mjs
    - scripts/operational-interop.test.mjs
  modified:
    - scripts/check-protocol-package-consumer.mjs
    - packages/lattice/package.json
    - .github/workflows/ci.yml
    - .github/workflows/release.yml
key-decisions:
  - "Use the existing root entrypoint for runtime behavior and ./audit for receipt behavior; do not invent ./runtime or ./receipts exports."
  - "Share one side-effect-free package helper between the clean consumer and later provider canaries."
patterns-established:
  - "Packed authority: operational checks install only tarballs and reject workspace resolution."
  - "Runtime support: the bounded packed job runs on Node 24 and 26 while the full suite remains on Node 24."
requirements-completed: [OPSVAL-01]
duration: 9 min
completed: 2026-07-17
---

# Phase 62 Plan 01: Packed Consumer Interop Summary

**Real runtime and CLI tarballs now prove root, modular, receipt, runtime, version, and CLI behavior on the Node 24/26 support matrix.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-17T06:39:00Z
- **Completed:** 2026-07-17T06:47:58Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Extracted one reusable build/pack/install helper with realpath, manifest-name, and no-workspace assertions.
- Expanded the packed smoke to issue and strictly verify a standard runtime receipt, exercise existing modular facades, compare package versions, and test CLI malformed-input behavior.
- Replaced the obsolete Node 20 compatibility tier with `node24-plus` and removed its script.
- Added an isolated Node 24/26 CI matrix and the same Node 24 packed gate before publish and in conformance.

## Task Commits

1. **Task 1: Promote the real-tarball consumer and retire the Node 20 facade tier** - `953f8f3`
2. **Task 2: Exercise the packed contract on Node 24 and Node 26 in CI and release** - `26548e9`

## Files Created/Modified

- `scripts/lib/packed-packages.mjs` - Shared command, build, pack, clean install, and installed-package assertions.
- `scripts/check-protocol-package-consumer.mjs` - Expanded tarball-only runtime, receipt, modular, version, and CLI smoke.
- `scripts/operational-interop.test.mjs` - Static engine, compatibility, workflow matrix, and release-order regression tests.
- `packages/lattice/package.json` - Current `node24-plus` compatibility metadata.
- `.github/workflows/ci.yml` - Node 24/26 packed matrix without duplicating the full suite.
- `.github/workflows/conformance.yml` - Focused Node 24 shared packed command.
- `.github/workflows/release.yml` - Pre-publish Node 24 packed validation.

## Decisions Made

- Preserved the shipped entrypoint inventory. Root `createAI` is the runtime surface and `./audit` is the receipt facade.
- Centralized package lifecycle helpers so the provider canary can prove the same artifact path instead of copying pack logic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected nonexistent modular entrypoint names**
- **Found during:** Task 1 mandatory source read.
- **Issue:** The plan named `./runtime` and `./receipts`, but the shipped package exposes runtime behavior from root and receipt behavior from `./audit`.
- **Fix:** Exercised the existing public root and `./audit` surfaces and added no new export.
- **Files modified:** `scripts/check-protocol-package-consumer.mjs`
- **Verification:** The clean tarball consumer and module-boundary/type gates passed.
- **Committed in:** `953f8f3`

**Total deviations:** 1 auto-fixed blocking assumption. **Impact:** Preserved public compatibility and completed the intended runtime/receipt proof without scope expansion.

## Issues Encountered

None after correcting the stale entrypoint names.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- Packed runtime and CLI consumer passed twice from fresh temporary installs.
- Module-boundary gate passed.
- Modular Vitest suite passed 6 tests.
- Type testing passed 119 files and 1,610 tests with no type errors; tsd passed.
- Operational workflow suite passed 4 tests; workflow safety audited all workflow files.

## Next Phase Readiness

- The shared packed-package helper is ready for the bounded provider canary.
- No blocker remains for Plan 62-02.

---
*Phase: 62-operational-interop-and-hygiene*
*Completed: 2026-07-17*
