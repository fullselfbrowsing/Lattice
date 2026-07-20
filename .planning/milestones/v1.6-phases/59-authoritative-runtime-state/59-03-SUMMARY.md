---
phase: 59-authoritative-runtime-state
plan: 03
subsystem: context-materialization
tags: [context-packing, session-rehydration, summaries, projection-hashes, policy]

requires:
  - phase: 59-authoritative-runtime-state-02
    provides: scoped artifact lifecycle and store-returned reference authority
provides:
  - Route-window-bounded pure context classification with exact session membership
  - Effectful selected-only materialization with fail-closed scoped rehydration
  - Forced summary privacy, lineage, trust, and lifecycle persistence
  - Deterministic provider-visible projection refs, hashes, omissions, and ID
affects: [59-04-runtime-preparation, 59-05-fallback-evidence, runtime, replay, observability]

tech-stack:
  added: []
  patterns: [pure-plan-effectful-materialization, stable-first membership, atomic omit rewrite, content-free projection identity]

key-files:
  created: [packages/lattice/src/context/context-pack.test.ts, packages/lattice/src/context/materialize.ts, packages/lattice/src/context/materialize.test.ts]
  modified: [packages/lattice/src/context/context-pack.ts, packages/lattice/src/routing/router.ts, packages/lattice/src/routing/router.test.ts]

key-decisions:
  - "The live context budget is route context window minus a bounded output reserve, capped at 16k; explicit overrides can only make it smaller."
  - "Artifact and session membership is stable-first across categories so summarized or archived refs cannot re-enter through later turns."
  - "Materialization loads only IDs named by included items and rewrites missing items atomically under explicit omit policy."
  - "Projection identity hashes route identity plus ordered artifact ID/hash pairs and never includes raw artifact values."

patterns-established:
  - "Selected-only access: validate session/ref scope before load and never index session-wide refs as a materialization shortcut."
  - "Summary replacement: selected concrete sources leave the projection and normalized persisted summaries take their place."

requirements-completed: [CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-04, CTXAUTH-05, CTXAUTH-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04]

duration: 17min
completed: 2026-07-16
---

# Phase 59 Plan 03: Authoritative Context Materialization Summary

**Route-specific context projection with selected-only session loads, normalized summaries, atomic omission, and deterministic evidence hashes**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-16T23:41:00Z
- **Completed:** 2026-07-16T23:57:37Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Replaced route input-estimate pseudo-windows with actual capability context windows and bounded output reserve accounting.
- Classified session summaries before covered raw turns and named the exact stable-deduplicated refs each included turn may load.
- Added a scoped materializer that returns only concrete included/session/summary artifacts and rewrites unavailable items under explicit omit policy.
- Forced generated summaries to exact source parents, model-summary trust, maximum source privacy, and the shared persistence lifecycle.
- Produced deterministic projection refs, input hashes, summary refs, omissions, and IDs without logging content.

## Task Commits

1. **Task 1: Make context classification name exact route and session membership** - `1e82992` (feat)
2. **Task 2: Materialize selected inputs, summaries, and scoped session history** - `de952ab` (feat)

## Files Created/Modified

- `packages/lattice/src/context/context-pack.ts` - Pure route-budget and exact artifact/session membership classification.
- `packages/lattice/src/context/context-pack.test.ts` - Route clamp, ordering, deduplication, coverage, and membership properties.
- `packages/lattice/src/context/materialize.ts` - Scoped load, summary normalization/persistence, deduplication, pack rewrite, and projection evidence.
- `packages/lattice/src/context/materialize.test.ts` - Sentinel, fault, scope, summary, lifecycle, session, and determinism matrix.
- `packages/lattice/src/routing/router.ts` - Copies capability context windows into selected route evidence.
- `packages/lattice/src/routing/router.test.ts` - Selected-route context-window regression coverage.

## Decisions Made

- Reserved 256 to 4096 output tokens from a selected route window and retained the existing 16k live-context ceiling.
- Kept duplicate classification stable-first while rejecting conflicting concrete, session-summary, or session-turn evidence during materialization.
- Treated missing/thrown loads as terminal by default; explicit `missingArtifactRef: "omit"` removes the whole selected item and emits only a stable non-content warning.
- Kept summary persistence failures as typed artifact lifecycle failures so the runtime can map them to the persistence lifecycle rather than a provider retry.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/context-pack.test.ts src/context/materialize.test.ts src/routing/router.test.ts test/context-provider-replay-tools.test.ts`: 4 files, 41 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- `git diff --check`: passed for all task files.

## Next Phase Readiness

- Plan 04 can make planning and the primary provider attempt consume `MaterializedContext.artifacts` as their only provider-facing array.
- The materializer exposes a direct `ContextProjectionPlan` conversion and stable summary lifecycle reports; no storage or provider method shape changed.

## Self-Check: PASSED

- Task commits `1e82992` and `de952ab` exist and contain the six planned files.
- Omitted, archived, raw summarized, and unselected-session sentinels are absent from materialized artifacts in focused tests.
- User paper work and the `conductor-user-state-before-phase-59` stash remain untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
