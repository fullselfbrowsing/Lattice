---
phase: 60-audit-evaluation-and-cost-integrity
plan: 03
subsystem: evaluation
tags: [eval, receipts, invalid-input, exit-codes, baselines]

requires:
  - phase: 59-authoritative-runtime-state
    provides: authoritative replay evidence and terminal run facts
provides:
  - Exhaustive bounded failure-stage diagnostics for every invalid receipt fixture
  - Row-derived invalid aggregate and exit-code precedence over regressions
  - Baseline initialization guard that forbids partial baseline writes
affects: [60-05, 60-06, cli, replay, ci]

tech-stack:
  added: []
  patterns: [row-derived-aggregate, bounded-failure-taxonomy, enumerate-before-fail]

key-files:
  created: []
  modified: [packages/lattice-cli/src/eval/types.ts, packages/lattice-cli/src/eval/runner.ts, packages/lattice-cli/src/commands/eval.ts, packages/lattice-cli/test/eval-runner.test.ts, packages/lattice-cli/test/eval.test.ts]

key-decisions:
  - "Fixture rows are authoritative for the invalid count even when an injected report summary is stale."
  - "Per-fixture invalidity emits the complete human and JSON report; FAIL remains reserved for session-wide failures that prevent enumeration."
  - "Invalid baseline initialization exits before baseline construction or writer invocation."

patterns-established:
  - "Invalid eval stages use bounded load, verification, materialization, replay, and unevaluable-output labels."
  - "Eval exit precedence is invalid input 2, regression 1, complete pass 0."

requirements-completed: [EVAL16-01, EVAL16-02]

duration: 6min
completed: 2026-07-16
---

# Phase 60 Plan 03: Evaluation Integrity Summary

**Receipt evaluation now preserves every invalid fixture, fails incomplete suites with exit 2, and never initializes a partial baseline**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-17T03:16:30Z
- **Completed:** 2026-07-17T03:20:22Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added a bounded failure-stage taxonomy spanning receipt and sidecar load, verification, materialization, replay, and unevaluable output.
- Preserved one ordered report row for each invalid fixture and counted those rows independently from passes and regressions.
- Reconciled `summary.loadFailed` from fixture rows at the command boundary so stale injected summaries cannot green an incomplete run.
- Applied exit precedence 2 over 1 while retaining all human rows, the aggregate summary, and the one JSON report for row-derived failures.
- Guarded baseline initialization before constructing entries or invoking the atomic writer, preserving existing baseline bytes on invalid input.

## Task Commits

1. **Task 1: Preserve every invalid evaluation stage in the report** - `c27d87a` (feat)
2. **Task 2: Enforce exit precedence and atomic baseline initialization** - `167887d` (fix)

## Files Created/Modified

- `packages/lattice-cli/src/eval/types.ts` - Additive failure-stage and invalid-count report contracts.
- `packages/lattice-cli/src/eval/runner.ts` - Exhaustive stage mapping and row aggregation.
- `packages/lattice-cli/src/commands/eval.ts` - Row reconciliation, exit precedence, complete diagnostics, and init guard.
- `packages/lattice-cli/test/eval-runner.test.ts` - Ordered mixed-stage invalid fixture matrix and content-safety assertions.
- `packages/lattice-cli/test/eval.test.ts` - Exit, report, stale-summary, and baseline atomicity coverage.

## Decisions Made

- Kept `loadFailed` additive within `lattice-eval/v1`; older readers may ignore it while the current command defensively repairs absent or stale values.
- Mapped `MaterializationError.kind` to verification or materialization instead of flattening both into one load failure.
- Kept session-wide typed loader failures on the existing no-report `FAIL` path because those failures prevent fixture enumeration.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- The workspace does not install a Prettier binary. Existing formatting conventions were followed manually and `git diff --check` passed.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `test/eval-runner.test.ts` and `test/eval.test.ts`: 2 files, 31 tests passed.
- `pnpm --filter @full-self-browsing/lattice-cli typecheck`: passed.
- Invalid-init coverage proves zero writer calls and unchanged preexisting baseline sentinel state.
- Serialized invalid-stage tests prove bounded diagnostics and absence of secret sentinels.
- `git diff --check`: passed.

## Next Phase Readiness

- Plan 60-05 can consume complete invalid-row facts for the integrated adversarial matrix.
- No blockers remain for checkpoint and crew receipt issuance in Plan 60-02.

## Self-Check: PASSED

- Commits `c27d87a` and `167887d` contain the two planned tasks.
- Invalid, mixed, empty, regression-only, valid-init, and invalid-init paths are covered.
- User paper and graph work remain untouched.

---
*Phase: 60-audit-evaluation-and-cost-integrity*
*Completed: 2026-07-16*
