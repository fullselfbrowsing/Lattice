---
phase: 59-authoritative-runtime-state
plan: 08
subsystem: public-api
tags: [public-api, modular-entrypoints, compatibility, declarations, materialization]

requires:
  - phase: 59-authoritative-runtime-state-07
    provides: redacted replay evidence and bounded persistence telemetry
provides:
  - Supported root types for authoritative projection, materialization, lifecycle, persistence, and session evidence
  - Public materializeContext values through the context and core modular entrypoints
  - Compile-time compatibility fixtures for legacy providers, artifact stores, and session stores
  - Exact value-export inventories that keep orchestration and lifecycle internals private
affects: [59-09-closure, package-consumers, context-entrypoint, core-entrypoint, declarations]

tech-stack:
  added: []
  patterns: [type-only-root-contracts, modular-value-entrypoints, legacy-shape-tsd-fixtures, exact-export-inventories]

key-files:
  created: [packages/lattice/test-d/public-api.test-d.ts]
  modified: [packages/lattice/src/runtime/public-types.ts, packages/lattice/src/index.ts, packages/lattice/src/context.ts, packages/lattice/src/core.ts, packages/lattice/test/public-surface.test.ts, packages/lattice/test/modular-entrypoints.test.ts, packages/lattice/test-d/modular-entrypoints.test-d.ts, packages/lattice/test/runtime.test.ts]

key-decisions:
  - "Authoritative materialization is a modular value and a root type contract so the beginner root remains small while advanced consumers avoid deep imports."
  - "Lifecycle evidence is public, but lifecycle failures, raw causes, persistence orchestration, and projection helpers remain internal."
  - "Legacy attempt evidence stays exact-optional so existing providers can omit projection and input-hash fields without source changes."

patterns-established:
  - "Public surface layering: stable evidence types at the root, advanced operations on focused modular entrypoints, implementation helpers private."
  - "Compatibility proof: compile historical structural implementations with tsd and lock runtime value exports with exact inventories."

requirements-completed: [CTXAUTH-01, CTXAUTH-04, CTXAUTH-06, PERSIST-02, PERSIST-03, PERSIST-04]

duration: 20min
completed: 2026-07-16
---

# Phase 59 Plan 08: Authoritative Public Contracts Summary

**Stable projection, materialization, lifecycle, persistence, and session contracts now resolve from supported entrypoints without expanding the beginner root value API or breaking legacy implementations**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-17T01:40:00Z
- **Completed:** 2026-07-17T02:00:00Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Exported `materializeContext` and its stable input/result contracts from the `context` and `core` modular entrypoints while keeping it out of the root value surface.
- Exposed additive projection, policy, lifecycle-report, persistence-error, and session contracts through supported root and modular type barrels.
- Added exact root/context/core value inventories that reject lifecycle failures, persistence helpers, route preparation, and projection-construction internals.
- Added tsd fixtures proving the pre-v1.6 four-field provider adapter plus current artifact-store and session-store required methods still compile unchanged.
- Locked exact-optional attempt evidence and public discriminated failures without making raw causes or internal failure classes public.
- Strengthened the existing runtime fixture to assert authoritative SHA-256 fingerprints and model-output lineage while preserving exact artifact-envelope equality.

## Task Commits

1. **Task 1: Finalize root and modular authoritative-state contracts** - `2a1263a` (feat)

## Files Created/Modified

- `packages/lattice/src/runtime/public-types.ts` - Central stable Phase 59 public type inventory.
- `packages/lattice/src/index.ts` - Additive root type exports with no new root runtime value.
- `packages/lattice/src/context.ts` - Focused materialization value and context authority contracts.
- `packages/lattice/src/core.ts` - Standalone core materialization value plus policy, plan, lifecycle, persistence, and session types.
- `packages/lattice/test/public-surface.test.ts` - Root type reachability and internal-value exclusion.
- `packages/lattice/test/modular-entrypoints.test.ts` - Exact context/core value inventories and internal-value exclusion.
- `packages/lattice/test-d/public-api.test-d.ts` - Legacy provider/store/session compatibility and exact-optional contract fixtures.
- `packages/lattice/test-d/modular-entrypoints.test-d.ts` - Modular materialization, policy, projection, lifecycle, and error type fixtures.
- `packages/lattice/test/runtime.test.ts` - Exact fingerprint and model-output-lineage regression assertions.

## Decisions Made

- Kept the root API capability-first by exporting the authoritative operation only from `./context` and `./core`; root consumers receive the stable types needed to inspect results.
- Published lifecycle reports because they are embedded in `MaterializedContext`, but kept lifecycle failure classes and persistence functions private implementation details.
- Preserved optional projection and input-hash fields on `ProviderAttemptRecord`; v1.6 produces them authoritatively without requiring historical adapters to do so.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated a stale runtime compatibility fixture for authoritative evidence**
- **Found during:** full `test:types` acceptance run
- **Issue:** The fixture expected pre-Phase 59 artifacts exactly, so newly authoritative fingerprints and model-output lineage caused a false regression even though all prior artifact fields remained unchanged.
- **Fix:** Kept exact equality and added bounded SHA-256 plus lineage assertions for input and provider-output artifacts.
- **Files modified:** `packages/lattice/test/runtime.test.ts`
- **Verification:** isolated runtime test and the complete 1,427-test package suite pass.
- **Committed in:** `2a1263a`

---

**Total deviations:** 1 auto-fixed (1 stale regression fixture).
**Impact on plan:** Test-only scope expansion; it strengthens compatibility evidence and changes no production behavior.

## Issues Encountered

- Initial tsd assertions treated optional attempt evidence as required. The fixtures now assert the intended `T | undefined` contract explicitly.
- An early full-suite run hit one transient capability-import timeout under suite contention; the isolated test and both complete acceptance reruns passed without code or timeout changes.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run test/public-surface.test.ts test/modular-entrypoints.test.ts`: 2 files, 49 tests passed.
- `pnpm --filter @full-self-browsing/lattice test:types`: 112 files, 1,427 tests passed; zero type errors; tsd passed.
- `pnpm --filter @full-self-browsing/lattice build`: 110 package files built with declarations.
- Declaration inspection confirmed `materializeContext` only on `context`/`core`, stable Phase 59 types at the root, and no public lifecycle/preparation helper values.
- `git diff --check`: passed.

## Next Phase Readiness

- Public and modular compatibility is locked for the authoritative runtime-state surface.
- Plan 09 can run the cross-feature property matrix and full Phase 59 closure gate without unresolved API or declaration work.

## Self-Check: PASSED

- Task commit `2a1263a` contains only Plan 08 implementation and test files.
- Exact root/context/core value inventories pass and internal orchestration values remain private.
- Legacy provider, artifact-store, and session-store fixtures compile under exact optional property semantics.
- The exact Plan 08 acceptance command passes end to end.
- User paper work remains untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
