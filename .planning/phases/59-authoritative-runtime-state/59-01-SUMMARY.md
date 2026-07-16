---
phase: 59-authoritative-runtime-state
plan: 01
subsystem: runtime-contracts
tags: [policy, sessions, context-projection, typed-errors, compatibility]

requires:
  - phase: 58-conformance-and-client-migration
    provides: verified v1.4 protocol and stable public-package compatibility baseline
provides:
  - Additive tenant, retention, and missing-reference policy contracts
  - Scoped session records and turns with fail-closed branch/append conflict checks
  - Provider-visible context projection and per-attempt evidence types
  - Terminal context-materialization and persistence failure variants
affects: [59-02-artifact-lifecycle, 59-03-context-materialization, runtime, sessions, public-types]

tech-stack:
  added: []
  patterns: [exact-optional scope fields, immutable plan evidence replacement, bounded terminal errors]

key-files:
  created: [packages/lattice/src/sessions/session.test.ts]
  modified: [packages/lattice/src/policy/policy.ts, packages/lattice/src/artifacts/artifact.ts, packages/lattice/src/sessions/session.ts, packages/lattice/src/plan/plan.ts, packages/lattice/src/results/errors.ts]

key-decisions:
  - "Session branches inherit parent tenant/privacy/retention exactly and reject explicit scope changes, including promotion of legacy unscoped history."
  - "ExecutionPlan.artifactRefs remains declared source history while ContextProjectionPlan records ordered provider-visible refs and hashes."
  - "Context materialization and persistence failures are terminal public variants with safe bounded fields and no cause surface."

patterns-established:
  - "Session scope authority: read scope from the record, inherit it onto turns/branches, and reject conflicting explicit values."
  - "Plan evidence authority: replace route/context/projection/packaging immutably through withPlanStatus."

requirements-completed: [CTXAUTH-04, CTXAUTH-06, PERSIST-03, PERSIST-04]

duration: 12min
completed: 2026-07-16
---

# Phase 59 Plan 01: Authoritative State Contracts Summary

**Additive scope, projection, and terminal-failure contracts with fail-closed in-memory session inheritance**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T23:18:00Z
- **Completed:** 2026-07-16T23:29:50Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Added flat tenant, retention, and missing-reference policy fields while preserving run-over-default merge semantics.
- Extended artifact storage references and session records/turns with optional scope, including exact branch and append conflict rejection.
- Added immutable context projection evidence at plan and provider-attempt level without changing provider, artifact-store, or session-store required methods.
- Added bounded terminal errors for pre-provider materialization and persistence failures plus reusable privacy-order helpers.

## Task Commits

1. **Task 1: Add policy, scope, projection, and typed failure contracts** - `921f61b` (feat)

## Files Created/Modified

- `packages/lattice/src/policy/policy.ts` - Missing-reference, tenant, and retention policy types/fields.
- `packages/lattice/src/artifacts/artifact.ts` - Scoped storage refs and privacy ordering helpers.
- `packages/lattice/src/sessions/session.ts` - Scoped records/turns with inherited branch and append enforcement.
- `packages/lattice/src/sessions/session.test.ts` - Create/save/load/append/branch scope regression matrix.
- `packages/lattice/src/plan/plan.ts` - Route context window, context projection, and attempt evidence contracts.
- `packages/lattice/src/results/errors.ts` - Terminal materialization and persistence error variants.
- Existing plan, error, and runtime-config suites - Direct type/behavior coverage for the new contracts.

## Decisions Made

- Included `session` in the bounded persistence lifecycle error vocabulary so later post-provider append failures do not misuse an artifact lifecycle label.
- Required exact scope agreement for explicit branch overrides; a legacy unscoped parent cannot silently become tenant-scoped.
- Kept raw causes out of public errors and retained only stable operation, lifecycle, and identifier fields.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added direct plan/error/policy regression coverage**
- **Found during:** Task 1 acceptance verification
- **Issue:** The declared file list named the production contracts and new session suite, but existing plan, error, and policy tests did not assert the new immutable evidence, terminal variants, or merge precedence.
- **Fix:** Extended `plan.test.ts`, `errors.test.ts`, and `runtime-config.test.ts` with focused assertions.
- **Files modified:** `packages/lattice/src/plan/plan.test.ts`, `packages/lattice/src/results/errors.test.ts`, `packages/lattice/test/runtime-config.test.ts`
- **Verification:** Focused Vitest run passed 34/34 and strict package typecheck passed.
- **Committed in:** `921f61b`

---

**Total deviations:** 1 auto-fixed (missing critical test coverage).
**Impact on plan:** Verification strength increased without changing the planned production scope or public required methods.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run src/plan/plan.test.ts src/results/errors.test.ts src/sessions/session.test.ts test/runtime-config.test.ts`: 4 files, 34 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed under strict exact optional property checks.
- `git diff --check`: passed for all task files.

## Next Phase Readiness

- Plan 02 can implement the shared store-returned lifecycle using the new policy, scope, privacy, and failure contracts.
- No blocker remains; required provider/store/session method shapes are unchanged.

## Self-Check: PASSED

- Task commit `921f61b` exists and includes the new session test.
- All acceptance criteria and focused verification commands pass.
- The user paper work and `conductor-user-state-before-phase-59` stash remain untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
