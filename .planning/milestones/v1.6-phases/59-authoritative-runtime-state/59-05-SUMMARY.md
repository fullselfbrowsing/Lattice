---
phase: 59-authoritative-runtime-state
plan: 05
subsystem: fallback-execution-evidence
tags: [fallback, context-materialization, packaging, receipts, tracing, opentelemetry]

requires:
  - phase: 59-authoritative-runtime-state-04
    provides: shared primary-route preparation and projection-only provider requests
provides:
  - Route-local context classification, materialization, summary generation, and packaging for every fallback
  - Immutable per-attempt context, projection, packaging, hash, and warning evidence
  - Receipt and lineage binding to the successful or failing called attempt
  - Bounded projection telemetry with tenant, storage, URL, payload, and raw-error exclusion
affects: [59-06-output-persistence, 59-07-replay-observability, runtime, receipts, observability]

tech-stack:
  added: []
  patterns: [route-local-preparation, immutable-attempt-snapshot, attempt-bound-receipts, explicit-telemetry-allowlist]

key-files:
  created: []
  modified: [packages/lattice/src/runtime/prepare-run.ts, packages/lattice/src/runtime/create-ai.ts, packages/lattice/src/plan/plan.ts, packages/lattice/test/planning-execution.test.ts, packages/lattice/test/authoritative-runtime-state.test.ts, packages/lattice/src/receipts/receipt.test.ts, packages/lattice/src/observability/otel.ts, packages/lattice/src/observability/otel.test.ts]

key-decisions:
  - "Transforms, tools, and input persistence remain single-run effects; every candidate rebuilds its context pack, summaries, projection, and packaging from those prepared inputs."
  - "The top-level plan replaces stale primary evidence with the current route while each completed attempt retains an independent immutable snapshot."
  - "Receipt input hashes are supplied directly from the called attempt projection instead of being recomputed from declared or earlier-route artifacts."
  - "Runtime telemetry reports projection IDs, counts, statuses, and bounded failure classes, never raw adapter or validation messages."

patterns-established:
  - "Fallback authority: prepareRouteAttempt is the only fallback path from prepared inputs to provider-visible artifacts."
  - "Attempt evidence replacement: withPlanAttemptEvidence atomically changes route, context, projection, packaging, attempts, and warnings while clearing absent stale fields."

requirements-completed: [CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-04, CTXAUTH-05, CTXAUTH-06]

duration: 29min
completed: 2026-07-16
---

# Phase 59 Plan 05: Route-Local Fallback Evidence Summary

**Every fallback now rebuilds the provider-visible projection under its own limits and freezes matching request, plan, receipt, and telemetry evidence**

## Performance

- **Duration:** 29 min
- **Started:** 2026-07-17T00:30:00Z
- **Completed:** 2026-07-17T00:59:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Extracted `prepareRouteAttempt` so fallback routes rebuild context membership, selected-only loads, summaries, projection hashes, and transport packaging without repeating transforms, tools, or input writes.
- Propagated candidate context windows into fallback routes and made sync and stream adapters receive independently materialized artifact arrays.
- Added immutable plan replacement that keeps top-level evidence on the executing or successful route and freezes exact context, projection, packaging, warnings, and ordered hashes in every called attempt.
- Made validation, tripwire, lineage, session input continuity, terminal failure receipts, and success receipts consume the current attempt projection.
- Added explicit OTel projection attributes and removed raw provider, stream, validation, gateway-policy, tenant, storage, URL, and payload values from runtime telemetry.
- Proved different-budget summary replacement, different-transport packaging, sync/stream fallback, terminal fallback materialization failure, and successful fallback receipt binding with adapter sentinels.

## Task Commits

1. **Task 1: Rematerialize and repackage every fallback route** - `a7cb346` (feat)
2. **Task 2: Bind hashes, receipts, traces, and events to attempt identity** - `e4fa30d` (feat)

## Files Created/Modified

- `packages/lattice/src/runtime/prepare-run.ts` - Reusable route-local preparation over already persisted inputs.
- `packages/lattice/src/runtime/create-ai.ts` - Fallback rematerialization, attempt snapshots, attempt-bound receipts, and bounded events.
- `packages/lattice/src/plan/plan.ts` - Immutable replacement of top-level and per-attempt route evidence.
- `packages/lattice/test/planning-execution.test.ts` - Different-budget, different-transport, and terminal preparation fallback coverage.
- `packages/lattice/test/authoritative-runtime-state.test.ts` - Streaming fallback projection, sentinel exclusion, and signed receipt hash parity.
- `packages/lattice/src/receipts/receipt.test.ts` - Ordered input-hash preservation in signed receipt bodies.
- `packages/lattice/src/observability/otel.ts` - Explicit projection/failure attributes and broader secret/content key exclusion.
- `packages/lattice/src/observability/otel.test.ts` - Projection mapping and tenant/storage/hash/URL non-disclosure coverage.

## Decisions Made

- Re-materialize summaries on each fallback unless a future exact route/source/budget cache proves reuse valid; no approximate summary reuse was introduced.
- Record a terminal fallback materialization failure with its route-specific context pack but no fabricated projection, packaging, or receipt input hashes.
- Keep provider failure retry and fallback eligibility unchanged while making the final failure receipt identify the last adapter actually called.
- Preserve raw failure messages in typed result/plan compatibility surfaces but convert all default events and OTel attributes to bounded failure classes.

## Deviations from Plan

### Auto-fixed Issues

**1. Extended the shared preparation module for route-local reuse**
- **Found during:** Task 1 implementation
- **Issue:** The planned file list omitted `prepare-run.ts`, but the runtime could not rematerialize fallbacks without either rerunning route-independent effects or duplicating preparation logic.
- **Fix:** Exported `prepareRouteAttempt` and exposed prepared artifacts only on successful internal preparation results.
- **Files modified:** `packages/lattice/src/runtime/prepare-run.ts`
- **Verification:** transform/tool/input persistence tests remain green while fallback summary spies run only for the fallback route.

**2. Sanitized gateway response metadata alongside projection events**
- **Found during:** Task 2 event audit
- **Issue:** Provider gateway responses could carry policy internals even after raw failure messages were removed.
- **Fix:** Event and attempt metadata now select only used/requested/observed/fallback model fields; public result gateway compatibility remains unchanged.
- **Files modified:** `packages/lattice/src/runtime/create-ai.ts`
- **Verification:** OTel and serialized-event sentinel tests exclude authorization and policy internals.

---

**Total deviations:** 2 auto-fixed (1 required integration seam, 1 security hardening)
**Impact on plan:** Both changes directly enforce route-local effects and non-content evidence. No provider, store, or session method contract changed.

## Issues Encountered

- Exact optional typing required fallback emergency routes to omit an unavailable context window rather than assign `undefined`; the candidate-derived route always carries the real window.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run test/planning-execution.test.ts test/authoritative-runtime-state.test.ts src/runtime/create-ai.test.ts src/runtime/prepare-run.test.ts src/receipts/receipt.test.ts src/observability/otel.test.ts`: 6 files, 122 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- `git diff --check`: passed for both task commits.

## Next Phase Readiness

- The successful attempt now exposes the exact projection refs required for provider-output persistence and scoped session append in Plan 06.
- Provider output refs are still accepted directly and persistence is marked complete without executing the configured lifecycle; Plan 06 owns that remaining integrity boundary.

## Self-Check: PASSED

- Task commits `a7cb346` and `e4fa30d` exist and contain the eight scoped implementation/test files.
- Sync and stream fallback requests, attempt records, receipts, and events agree on route-local projection identity.
- User paper work and the `conductor-user-state-before-phase-59` stash remain untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
