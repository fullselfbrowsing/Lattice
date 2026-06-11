---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 06
subsystem: agent-crew
tags: [agent-runtime, crew, receipts, rate-limits, public-api]

requires:
  - phase: 39-02
    provides: createRateLimitGroup and withRateLimit transport coordination
  - phase: 39-05
    provides: CrewDispatcher, child declarations, cache-prefix composition, receipt chaining
provides:
  - runAgentCrew orchestrator with CrewResult accounting and receipt chain anchoring
  - createAI().runAgentCrew facade and public crew/rate-limit/receiptCid exports
  - Public integration tests for parent-child delegation, serial children, terminal child failures, and SAFETY-band child denial
affects: [agent-runtime, public-api, receipts, provider-quota, phase-39]

tech-stack:
  added: []
  patterns:
    - ProviderAdapter instance identity as the managed rate-limit bucket key
    - Crew-root receipt as parentReceiptCid anchor for per-agent completion receipts
    - Public facade lazy import mirroring createAI().runAgent

key-files:
  created:
    - packages/lattice/src/agent/crew/run-crew.ts
    - packages/lattice/src/agent/crew/run-crew.test.ts
    - packages/lattice/src/agent/crew/crew-integration.test.ts
  modified:
    - packages/lattice/src/agent/crew/dispatcher.ts
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/index.ts

key-decisions:
  - "runAgentCrew composes over runAgentInternal and CrewDispatcher instead of creating a separate crew runtime."
  - "Managed rate-limit buckets are keyed by ProviderAdapter instance identity; adapter.id only selects override values."
  - "The public surface exports crew specs/orchestrator/rate-limit/CID helpers, while dispatcher and dispatchToolUse remain internal."

patterns-established:
  - "CrewResult accounting records child usage through dispatcher telemetry and parent usage after the parent loop completes."
  - "Completion receipts, not per-iteration checkpoint receipts, are collected in CrewResult.receipts."
  - "Integration tests import only from src/index.ts to guard the public API."

requirements-completed: [DELEG-02, DELEG-03, DELEG-05]

duration: 47 min
completed: 2026-06-11
---

# Phase 39 Plan 06: runAgentCrew Orchestrator Summary

**Opt-in crew orchestration with shared accounting, managed provider quota, chained receipts, createAI facade, and public integration coverage**

## Performance

- **Duration:** 47 min
- **Started:** 2026-06-11T14:51:00Z
- **Completed:** 2026-06-11T15:38:50Z
- **Tasks:** 3 completed
- **Files modified:** 6

## Accomplishments

- Added `runAgentCrew` with policy validation, crew-root receipt minting, shared usage accounting, budget-pool checks, managed rate-limit wrapping, dispatcher composition, parent completion receipt minting, and frozen `CrewResult` assembly.
- Added `createAI().runAgentCrew` and package-root exports for `defineAgent`, `AgentSpec`, `CrewPolicy`, `runAgentCrew` types, `createRateLimitGroup`, `withRateLimit`, and `receiptCid`.
- Added public integration coverage for two-child delegation, adapter-validated child calls, terminal child failure propagation, strict serial child execution, and SAFETY-band child denial.

## Task Commits

1. **Task 1 RED: runAgentCrew orchestrator coverage** - `865df6f` (test)
2. **Task 1 GREEN: crew orchestrator implementation** - `22e2386` (feat)
3. **Task 2 RED: facade and managed rate-limit coverage** - `006ce6e` (test)
4. **Task 2 GREEN: createAI facade and public exports** - `425aa60` (feat)
5. **Task 3: public crew integration suite** - `6d64261` (test)

## Files Created/Modified

- `packages/lattice/src/agent/crew/run-crew.ts` - New crew orchestrator, result types, rate-limit host wrapping, accounting, and receipt-chain assembly.
- `packages/lattice/src/agent/crew/run-crew.test.ts` - Focused orchestrator/facade/rate-limit/receipt tests.
- `packages/lattice/src/agent/crew/crew-integration.test.ts` - Public API integration suite over `src/index.ts` exports.
- `packages/lattice/src/agent/crew/dispatcher.ts` - Additive child-result telemetry hook and tracer/pipeline threading for orchestrator accounting and hook composition.
- `packages/lattice/src/runtime/create-ai.ts` - Lazy `runAgentCrew` facade on the `AI` runtime.
- `packages/lattice/src/index.ts` - Public crew, rate-limit, and receipt CID exports; dispatcher/seam kept private.

## Decisions Made

- Used the existing `runAgentInternal` seam and `CrewDispatcher` chokepoint rather than creating a parallel crew-specific agent loop.
- Collected only crew-root and per-agent completion receipts in `CrewResult.receipts`; auto-checkpoint iteration receipts remain outside this aggregate.
- Kept parent-host configuration internal for v1.3; `hosts.childHost` remains the only public host option required by the plan, while parent transport wrapping is composed internally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added dispatcher result telemetry for child iteration counts**
- **Found during:** Task 1 (CrewResult per-agent accounting)
- **Issue:** The existing dispatcher only exposed `recordUsage(agentId, usage)`, which was enough for budget accounting but not enough to report per-child iteration counts in `CrewResult.perAgent`.
- **Fix:** Added optional `recordAgentResult(agentId, result)` to `CrewDispatchContext` and invoked it after each child run.
- **Files modified:** `packages/lattice/src/agent/crew/dispatcher.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice test -- src/agent/crew/run-crew.test.ts`; `pnpm --filter @full-self-browsing/lattice typecheck`
- **Committed in:** `22e2386`

---

**Total deviations:** 1 auto-fixed (Rule 2)
**Impact on plan:** Required to satisfy the planned `CrewResult.totalIterations` and per-agent iteration accounting without guessing from usage records. The change is additive and preserves existing dispatcher callers.

## Issues Encountered

- Initial RED test failed because `run-crew.ts` did not exist, as expected.
- First GREEN run hit a syntax error in a return type annotation; fixed before committing the implementation.
- Typecheck caught exact-optional and readonly-budget mutations; fixed with conditional spread and a mutable local budget builder.
- The child SAFETY integration test initially denied the parent because the root intent contained the deny marker; fixed the test so only the delegated child task matched.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- src/agent/crew/run-crew.test.ts` - passed
- `pnpm --filter @full-self-browsing/lattice test -- src/agent/crew/crew-integration.test.ts` - passed
- `pnpm --filter @full-self-browsing/lattice test -- src/agent/crew` - passed
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed
- `pnpm --filter @full-self-browsing/lattice exec publint` - passed
- `pnpm --filter @full-self-browsing/lattice test` - passed, 68 files / 904 tests

## Next Phase Readiness

Ready for `39-07`: the public `runAgentCrew` surface, receipt chain, and integration gate are available for the `examples/agent-crew/` showcase and crew eval regression.

---
*Phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda*
*Completed: 2026-06-11*
