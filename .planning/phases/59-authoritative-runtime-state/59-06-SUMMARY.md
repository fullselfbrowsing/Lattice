---
phase: 59-authoritative-runtime-state
plan: 06
subsystem: output-session-persistence
tags: [provider-outputs, artifact-lifecycle, sessions, partial-failure, tenant-scope, streaming]

requires:
  - phase: 59-authoritative-runtime-state-05
    provides: successful attempt projection refs, hashes, and route-local evidence
provides:
  - Policy-checked provider-output lifecycle before ordinary success
  - Exact store-returned output refs and safe partial evidence on post-provider failure
  - Non-retrying terminal output and session persistence failures
  - Scoped session turns containing only resolvable exact input/output refs
  - Task/plan-only continuity for unconfigured and retention-none storage
affects: [59-07-replay-observability, runtime-results, sessions, persistence]

tech-stack:
  added: []
  patterns: [post-provider-terminal-boundary, exact-store-ref-authority, resolvable-session-refs, validated-session-append]

key-files:
  created: []
  modified: [packages/lattice/src/runtime/create-ai.ts, packages/lattice/src/results/result.ts, packages/lattice/src/sessions/session.ts, packages/lattice/test/authoritative-runtime-state.test.ts, packages/lattice/test/context-provider-replay-tools.test.ts]

key-decisions:
  - "Provider output writes complete in stable order after validation/tripwires and before session append or ordinary success."
  - "A post-provider failure returns validated partial outputs, usage, the successful attempt, and only output refs completed before the fault."
  - "Session turns include only refs resolvable through the configured store; skipped storage retains task and plan continuity with empty ref arrays."
  - "Session append results are structurally validated against the requested task, plan, scope, and exact refs."

patterns-established:
  - "Billable-call boundary: persistence/session faults return directly from the success branch and never enter the provider catch/fallback path."
  - "Truthful persistence stage: explicit lifecycle reports distinguish stored, preserved, unconfigured skip, policy skip, and terminal failure."

requirements-completed: [CTXAUTH-04, CTXAUTH-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04]

duration: 18min
completed: 2026-07-16
---

# Phase 59 Plan 06: Provider Output and Session Persistence Summary

**Provider success now completes truthful output and session persistence before ordinary success, with terminal partial evidence and no duplicate provider work on failure**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-17T01:01:00Z
- **Completed:** 2026-07-17T01:19:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Normalized provider artifacts with model-output lineage to the successful projection and persisted them in stable order through the shared lifecycle.
- Surfaced exact custom store keys and fingerprints unchanged while rejecting payload-bearing, store-mismatched, tenant-mismatched, retention-mismatched, and privacy-downgraded refs.
- Added optional failure artifacts so a middle-write failure returns already completed output refs alongside safe validated partial outputs, usage, and successful attempt evidence.
- Replaced fictional persistence completion with explicit stored/preserved/unconfigured/policy/failure lifecycle reports.
- Appended sessions only after output writes, using exact resolvable projection/output refs and effective tenant/privacy/retention scope.
- Preserved task and plan continuity with empty refs when storage is absent or retention is none, preventing future turns from claiming unresolvable artifacts.
- Converted thrown or malformed session append results to terminal post-provider persistence failures without fallback.

## Task Commits

1. **Task 1: Persist provider outputs before returning success** - `94448bb` (feat)
2. **Task 2: Append only truthful scoped session continuity** - `89661b8` (feat)

## Files Created/Modified

- `packages/lattice/src/runtime/create-ai.ts` - Output lifecycle, truthful persistence stages, partial failure results, resolvable session refs, and no-retry exits.
- `packages/lattice/src/results/result.ts` - Optional completed artifact refs on run failure.
- `packages/lattice/src/sessions/session.ts` - Structural validation of append results against requested continuity.
- `packages/lattice/test/authoritative-runtime-state.test.ts` - Output/session fault matrix, exact refs, skip modes, sync/stream, scope, and call-count coverage.
- `packages/lattice/test/context-provider-replay-tools.test.ts` - Legacy unscoped-session fail-closed ordering proof.

## Decisions Made

- Used the existing `PersistenceError` shape unchanged because it already carries lifecycle, operation, artifact/session identifiers, post-provider, and terminal semantics.
- Kept validated provider outputs in `partialOutputs` and completed output refs in the new optional failure `artifacts` field; raw causes and incomplete refs remain absent.
- Treated a malformed successful `SessionStore.appendTurn` return the same as a thrown append failure because continuity cannot be proven.
- Counted session continuity as a real persistence report while retaining output-specific skip reports, so one stage can truthfully describe mixed lifecycle outcomes.

## Deviations from Plan

### Auto-fixed Issues

**1. Validated successful session append results**
- **Found during:** Task 2 integrity review
- **Issue:** Catching thrown append failures was insufficient; a custom store could resolve with a record that omitted or altered the requested turn.
- **Fix:** Added structural validation of session ID, task, plan ID, scope, and exact input/output refs.
- **Files modified:** `packages/lattice/src/sessions/session.ts`, `packages/lattice/src/runtime/create-ai.ts`
- **Verification:** malformed-return and thrown-append cases both return terminal session persistence failures after one provider call.

**2. Reused the existing persistence error contract without modification**
- **Found during:** Task 1 implementation
- **Issue:** The plan anticipated a possible `errors.ts` change, but the additive evidence requirement was fully represented by the existing error plus an optional result artifact list.
- **Fix:** Changed only `result.ts`; kept `PersistenceError` source-compatible and avoided redundant fields.
- **Files modified:** `packages/lattice/src/results/result.ts`
- **Verification:** strict typecheck and public error assertions pass.

---

**Total deviations:** 2 auto-resolved (1 integrity hardening, 1 unnecessary planned edit avoided)
**Impact on plan:** Stronger session proof with a smaller public API change. No store, session, or provider method changed.

## Issues Encountered

- A combined Vitest invocation stalled before spawning workers; terminating that zero-CPU runner and rerunning smaller deterministic groups completed normally.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts test/context-provider-replay-tools.test.ts src/runtime/create-ai.test.ts src/sessions/session.test.ts`: 4 files, 75 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- `git diff --check`: passed for both task commits.

## Next Phase Readiness

- Results, plans, sessions, and receipts now carry exact authoritative refs suitable for replay materialization and redaction audit in Plan 07.
- Persistence events are bounded; Plan 07 can verify replay envelopes and OTel behavior across success and partial-failure serialization.

## Self-Check: PASSED

- Task commits `94448bb` and `89661b8` exist and contain only Plan 06 implementation/test files.
- Fault tests prove provider and stream call counts remain one after output or session persistence failure.
- User paper work and the `conductor-user-state-before-phase-59` stash remain untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
