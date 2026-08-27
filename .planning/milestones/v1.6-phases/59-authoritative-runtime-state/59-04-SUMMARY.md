---
phase: 59-authoritative-runtime-state
plan: 04
subsystem: runtime-preparation
tags: [context-projection, persistence, packaging, planning, provider-requests, replay-redaction]

requires:
  - phase: 59-authoritative-runtime-state-03
    provides: route-specific context classification and authoritative materialization
provides:
  - Shared policy, session, persistence, routing, materialization, and packaging preparation for plan and run
  - Exact primary-attempt provider artifacts derived only from the materialized projection
  - Bounded preparation and projection telemetry with replay-safe redaction
  - Sync and stream sentinel coverage proving omitted state cannot reach adapters
affects: [59-05-fallback-evidence, 59-06-output-persistence, runtime, replay, observability]

tech-stack:
  added: []
  patterns: [single-preparation-authority, discriminated-pre-provider-failure, projection-only-provider-input, bounded-non-content-events]

key-files:
  created: [packages/lattice/src/runtime/prepare-run.ts, packages/lattice/src/runtime/prepare-run.test.ts, packages/lattice/test/authoritative-runtime-state.test.ts]
  modified: [packages/lattice/src/runtime/create-ai.ts, packages/lattice/src/context/materialize.ts, packages/lattice/src/replay/replay.ts, packages/lattice/src/test-support/fast-check.ts]

key-decisions:
  - "Planning and execution call one preparation function that resolves effective policy and scoped session before any persistence, rehydration, or packaging."
  - "Provider requests receive only MaterializedContext.artifacts; declared inputs remain inspectable history and never serve as an execution fallback."
  - "Preparation failures are bounded terminal results with sanitized plans rather than raw storage or context causes."
  - "Replay redaction covers both top-level and per-attempt context projections so signed storage URLs cannot escape through new evidence fields."

patterns-established:
  - "Prepared-run authority: downstream primary execution consumes the route, projection, packaging, policy, and session returned by prepareRun."
  - "Sentinel projection proof: compare plan evidence and adapter-visible values across sync and stream paths while asserting excluded values are absent."

requirements-completed: [CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04]

duration: 30min
completed: 2026-07-16
---

# Phase 59 Plan 04: Shared Runtime Preparation Summary

**One authoritative preparation path now drives planning and the primary provider attempt from policy resolution through exact provider-visible packaging**

## Performance

- **Duration:** 30 min
- **Started:** 2026-07-16T23:59:00Z
- **Completed:** 2026-07-17T00:29:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added `prepareRun` as the shared pre-provider authority for effective policy, scoped session resolution, transforms, tool artifacts, lifecycle persistence, routing, context materialization, and packaging.
- Rewired `ai.plan` and the primary `ai.run` path to consume the same prepared route and projection instead of maintaining parallel declared-input arrays.
- Passed only materialized artifacts into provider packaging and sync/stream requests, with exact projection refs and input hashes carried into plans, receipts, and session evidence.
- Added bounded typed handling for lifecycle, context-load, summary, no-route, and packaging failures without exposing underlying content or endpoints.
- Proved with sentinel integration tests that omitted, archived, raw summarized, and unselected-session values do not reach sync or stream adapters.

## Task Commits

1. **Task 1: Build the shared pre-provider preparation pipeline** - `59fdd48` (feat)
2. **Task 2: Make planning and the primary attempt consume the exact projection** - `9805190` (test)

## Files Created/Modified

- `packages/lattice/src/runtime/prepare-run.ts` - Shared preparation pipeline and sanitized pre-provider failure mapping.
- `packages/lattice/src/runtime/prepare-run.test.ts` - Policy ordering, lifecycle, context, telemetry, and failure-boundary coverage.
- `packages/lattice/src/runtime/create-ai.ts` - Plan/run delegation and projection-only primary provider requests.
- `packages/lattice/test/authoritative-runtime-state.test.ts` - Sync/stream adapter sentinel proof of projection authority.
- `packages/lattice/src/context/materialize.ts` - Exported scope validation and corrected artifact-ref narrowing.
- `packages/lattice/src/replay/replay.ts` - Redaction for top-level and attempt-scoped projection refs and warnings.
- `packages/lattice/src/test-support/fast-check.ts` - Typed property-test primitives required by Phase 59 generators.

## Decisions Made

- Established the effective policy and validated session scope before transforms, persistence, route selection, or stored-ref access.
- Retained declared `ExecutionPlan.artifactRefs` as compatibility history while making `contextProjection` the provider-visible authority.
- Kept all emitted preparation data content-free: identifiers, counts, hashes, statuses, lifecycle classes, and bounded warnings only.
- Left fallback rematerialization and final per-attempt evidence to Plan 05, while removing the primary attempt's full-input escape path here.

## Deviations from Plan

### Auto-fixed Issues

**1. Extended replay redaction for the new projection evidence**
- **Found during:** Task 1 integration verification
- **Issue:** Existing replay sanitization did not know about `contextProjection`, allowing store-returned signed URLs in refs to survive serialization.
- **Fix:** Redacted projection refs and bounded warnings at both plan and attempt levels.
- **Files modified:** `packages/lattice/src/replay/replay.ts`
- **Verification:** `test/context-provider-replay-tools.test.ts` passes with signed-URL sentinel coverage.

**2. Extended the repository's local fast-check typing shim**
- **Found during:** Task 2 strict typecheck
- **Issue:** Phase 59 property tests used supported fast-check runtime primitives that were absent from the intentionally narrow local declaration shim.
- **Fix:** Added typed integer, record, constant, unique-array, and two-arbitrary async property signatures without importing incompatible upstream declarations.
- **Files modified:** `packages/lattice/src/test-support/fast-check.ts`
- **Verification:** strict package typecheck passes.

---

**Total deviations:** 2 auto-fixed (1 security, 1 missing test infrastructure)
**Impact on plan:** Both fixes were required to preserve the plan's non-content evidence guarantee and verification gate. No public runtime surface or provider method changed.

## Issues Encountered

- The TypeScript 6-compatible fast-check wrapper lagged the property generators introduced in Plan 03; its narrow runtime surface was expanded rather than weakening strict typecheck.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/prepare-run.test.ts test/context-provider-replay-tools.test.ts test/authoritative-runtime-state.test.ts src/runtime/create-ai.test.ts`: 4 files, 63 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- `git diff --check`: passed for all Task 2 files.

## Next Phase Readiness

- Plan 05 can rematerialize and repackage each fallback route through the same preparation-owned policy, session, lifecycle, and context primitives.
- Primary attempts already carry authoritative projection and packaging evidence; fallback attempts still need independent projections and terminal route-local failure evidence.

## Self-Check: PASSED

- Task commits `59fdd48` and `9805190` exist and contain only Plan 04 runtime/test files.
- Sync and stream provider sentinels observe exactly the prepared projection while excluded sentinels remain absent.
- User paper work and the `conductor-user-state-before-phase-59` stash remain untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
