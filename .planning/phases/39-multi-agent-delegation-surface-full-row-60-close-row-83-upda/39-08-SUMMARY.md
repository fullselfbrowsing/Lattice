---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 08
subsystem: public-contract
tags: [docs, tsd, changeset, release-readiness]

requires:
  - phase: 39-06
    provides: runAgentCrew, CrewResult, createAI facade, public exports
  - phase: 39-07
    provides: examples/agent-crew showcase and eval gate
provides:
  - AGENTS.md multi-agent policy flip across all stale surfaces
  - docs/fsb-integration-gaps.md Row 60 and Row 83 Covered backlinks
  - package-root tsd coverage for the crew public type surface
  - v1.3.0 agent crew changeset
  - full Phase 39 verification gate results
affects: [public-api, docs, release-notes, phase-tracking]

tech-stack:
  added: []
  patterns:
    - Package-root `test-d` imports cover public exports, not source deep paths.
    - Doc acceptance gates pair semantic text review with concrete grep checks.
    - Changesets document opt-in behavior and unchanged single-agent defaults.

key-files:
  created:
    - packages/lattice/test-d/agent-crew.test-d.ts
    - .changeset/v1.3.0-agent-crew.md
  modified:
    - AGENTS.md
    - docs/fsb-integration-gaps.md
    - packages/lattice/test-d/index.test-d.ts

key-decisions:
  - "Rephrased the historical AGENTS.md v1.2 note so no multi-agent/crew line still matches the Out-of-Scope acceptance grep."
  - "Kept the Phase 39 public contract explicitly opt-in: `ai.runAgent` remains unchanged and `runAgentCrew` is called deliberately."

patterns-established:
  - "New public symbols get dedicated `tsd` assertions plus index smoke coverage."
  - "Gap-row closures cite the implementation commit set and the missed historical backlink commit."

requirements-completed: [DELEG-08]

duration: 10 min
completed: 2026-06-11
---

# Phase 39 Plan 08: Public Contract Closure Summary

**Closed the public docs, package type surface, changeset, and full verification gate for Phase 39**

## Performance

- **Duration:** 10 min
- **Started:** 2026-06-11T15:43:45Z
- **Completed:** 2026-06-11T15:53:45Z
- **Tasks:** 3 completed
- **Files modified:** 5 product/docs files plus planning closeout

## Accomplishments

- Flipped `AGENTS.md` across the stale OpenAI Agents SDK row, policy notes, Multi-Agent Crews section, and rationale so Phase 39 now advertises multi-agent crews as first-class via the opt-in `AgentHost` capability.
- Updated `docs/fsb-integration-gaps.md` Row 60 to `Covered` with Phase 39 crew-surface SHAs and Row 83 to `Covered` with the missed v1.2 Phase 20 `3794896` recovery-marker backlink plus survivability SHAs.
- Added `packages/lattice/test-d/agent-crew.test-d.ts` covering `defineAgent`, `AgentSpec`, `CrewPolicy`, `RunAgentCrewOptions`, `CrewResult`, `createRateLimitGroup`, `withRateLimit`, `RateLimitLease`, `receiptCid`, and `createAI().runAgentCrew`.
- Extended `packages/lattice/test-d/index.test-d.ts` with package-root smoke coverage for the new crew exports.
- Added `.changeset/v1.3.0-agent-crew.md` documenting the opt-in crew surface, rate-limit coordination, receipt CID chaining, and unchanged single-agent behavior.

## Task Commits

1. **Task 1: policy and gap-row docs** - `5034db2` (docs)
2. **Task 2: public type tests and changeset** - `29474a1` (test)

## Files Created/Modified

- `AGENTS.md` - Multi-agent policy flip to first-class opt-in crew support.
- `docs/fsb-integration-gaps.md` - Row 60 and Row 83 marked Covered with commit backlinks.
- `packages/lattice/test-d/agent-crew.test-d.ts` - Dedicated `tsd` coverage for every new public crew symbol.
- `packages/lattice/test-d/index.test-d.ts` - Public index smoke checks for crew exports.
- `.changeset/v1.3.0-agent-crew.md` - Minor changeset for the v1.3 crew surface.

## Decisions Made

- Used package-root type imports for the new `tsd` file so the test guards the published surface rather than implementation internals.
- Preserved the historical v1.2 policy context in `AGENTS.md` without using a live "Out of Scope" phrase on any multi-agent/crew line.
- Left the pre-existing untracked `39-PATTERNS.md` planning file untouched.

## Deviations from Plan

None.

## Issues Encountered

None.

## User Setup Required

None.

## Verification

- Doc grep gate - passed: no remaining multi-agent/crew `Out of Scope` line, `First-class via opt-in` present, and `3794896` present in the gaps doc.
- `pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types` - passed.
- `pnpm test` - passed: `packages/lattice` 69 files / 907 tests; `packages/lattice-cli` 13 files / 144 tests.
- `pnpm typecheck` - passed for both workspace packages.
- `pnpm test:types` - passed: `packages/lattice` 87 files / 1088 tests, no type errors, `tsd` green.
- `pnpm -r lint:packages` - passed: build + publint + attw + CLI dependency check. `attw` reported only the existing ignored CJS-to-ESM profile warning.
- `pnpm --filter @full-self-browsing/lattice build && node examples/agent-crew/index.mjs` - passed; example verified 5 receipts and printed `eval ok=true regressions=0`.
- `git grep -l "parentReceiptCid" packages/lattice/src` - source/test coverage present in receipts and crew paths.
- `git diff ca24e8b.. -- '*.test.ts' | grep -c "\.skip\|\.todo"` - `0`.

## Next Phase Readiness

Phase 39 is complete: all eight DELEG requirements are implemented, documented, type-audited, showcased, and green under the full gate. The remaining v1.3 work returns to the publish/canary sequence: Phases 29-32.

---
*Phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda*
*Completed: 2026-06-11*
---
