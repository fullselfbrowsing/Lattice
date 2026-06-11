---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 07
subsystem: agent-crew
tags: [examples, eval, receipts, agent-runtime]

requires:
  - phase: 39-06
    provides: runAgentCrew, CrewResult, createAI facade, public exports
provides:
  - examples/agent-crew built-dist showcase with parent summarizer and 3 serial child researchers
  - Ed25519 receipt write/verify/parentReceiptCid chain assertion in the example
  - crew evalAgentRun regression gate against committed inline baseline
affects: [agent-crew, examples, evals, release-readiness]

tech-stack:
  added: []
  patterns:
    - Built-dist example imports from packages/lattice/dist/index.js
    - Crew eval snapshots derive from CrewResult.totalIterations and CrewResult.usage
    - Example receipts are verified under an ephemeral Ed25519 keyset

key-files:
  created:
    - examples/agent-crew/package.json
    - examples/agent-crew/setup.mjs
    - examples/agent-crew/index.mjs
    - packages/lattice/src/agent/crew/crew-eval.test.ts
  modified: []

key-decisions:
  - "Live provider cache proof remains deferred to env-keyed nightly/manual paths; the example is deterministic fake-provider-only."
  - "The eval baseline is inline and commented so changes require deliberate review."

patterns-established:
  - "Examples import only from built dist, never source deep paths."
  - "Receipt-chain examples assert every non-root envelope's parentReceiptCid against CrewResult.crewRootCid."
  - "Crew regression gates can reuse evalAgentRun without API changes."

requirements-completed: [DELEG-07]

duration: 21 min
completed: 2026-06-11
---

# Phase 39 Plan 07: Agent Crew Showcase Summary

**Built-dist 4-agent crew showcase with verified Ed25519 receipt chain and evalAgentRun regression gate**

## Performance

- **Duration:** 21 min
- **Started:** 2026-06-11T15:22:45Z
- **Completed:** 2026-06-11T15:43:45Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments

- Added `examples/agent-crew/` with a parent `summarizer`, three serial `researcher-*` child agents, deterministic fake-provider responses, real Ed25519 signer/keyset setup, receipt writing, receipt verification, parentReceiptCid chain assertions, and an eval gate line.
- Added `packages/lattice/src/agent/crew/crew-eval.test.ts`, deriving `AgentRunSnapshot` directly from `CrewResult.totalIterations` and `CrewResult.usage`.
- Proved the eval gate fails on an inflated iteration budget and passes the committed 4-agent crew baseline.

## Task Commits

1. **Task 1: examples/agent-crew showcase** - `aaa94b5` (docs)
2. **Task 2: evalAgentRun crew regression gate** - `8da1d6b` (test)

## Files Created/Modified

- `examples/agent-crew/package.json` - Workspace example package metadata.
- `examples/agent-crew/setup.mjs` - Built-dist imports, signer/keyset, fake provider, parent/child agent specs, large shared tool prefix, and receipt writer.
- `examples/agent-crew/index.mjs` - Runs the crew, verifies receipts, asserts chain links, prints usage/eval output, and exits nonzero on failure.
- `packages/lattice/src/agent/crew/crew-eval.test.ts` - Crew regression gate over `evalAgentRun`.

## Decisions Made

- Kept real-provider cache verification out of the example runtime; the file documents the env-keyed/nightly posture while preserving deterministic PR-time behavior.
- Used a large deterministic child tool description to make future live cache verification possible without reshaping the example.
- Kept `evalAgentRun` unchanged and derived the baseline snapshot externally from `CrewResult`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- src/agent/crew/crew-eval.test.ts` - passed
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed
- `pnpm --filter @full-self-browsing/lattice test` - passed, 69 files / 907 tests
- `pnpm --filter @full-self-browsing/lattice build && node examples/agent-crew/index.mjs` - passed; example verified 5 receipts and printed `eval ok=true regressions=0`
- `grep -c 'parentReceiptCid' examples/agent-crew/index.mjs` - 4
- `grep -c 'packages/lattice/src' examples/agent-crew/*.mjs` - 0 for both example files
- `git diff packages/lattice/src/agent/eval.ts` - empty

## Next Phase Readiness

Ready for `39-08`: the crew surface, example, eval gate, and receipt-chain proof are in place; remaining work is public-contract docs, tsd coverage, changeset, and final phase gates.

---
*Phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda*
*Completed: 2026-06-11*
