---
phase: 60-audit-evaluation-and-cost-integrity
plan: 05
subsystem: provider-agent-cost
tags: [pricing, providers, agents, crews, budgets, diagnostics]

requires:
  - phase: 60-audit-evaluation-and-cost-integrity
    plan: 04
    provides: versioned shared cost kernel and route/contract budget semantics
provides:
  - Provider usage normalization delegated to the shared cost kernel
  - Before-transport hard-budget checks for every agent and crew call
  - Shared cumulative crew accounting across active nested agent calls
affects: [agent-receipts, operational-validation, provider-adapters]

tech-stack:
  added: []
  patterns: [reported-cost-authority, before-call-cost-preflight, inherited-crew-budget]

key-files:
  created: []
  modified: [packages/lattice/src/providers/adapters.ts, packages/lattice/src/providers/anthropic.ts, packages/lattice/src/providers/gemini.ts, packages/lattice/src/agent/runtime.ts, packages/lattice/src/agent/crew/run-crew.ts, packages/lattice/src/agent/crew/dispatcher.ts, packages/lattice/src/agent/infra/cost-tracker.ts]

key-decisions:
  - "Provider-reported non-null cost is authoritative; static pricing fills only absent cost from actual token counts."
  - "A hard agent or crew ceiling requires a known next-call estimate and rejects projected overage before transport; equality passes."
  - "Nested crew dispatch callbacks subtract every active ancestor's local cost before deriving child budgets."
  - "Accumulated totals tolerate one ULP of floating-point noise while direct single-estimate comparisons remain strict."

patterns-established:
  - "Provider adapters, agent preflight, returned usage, and crew trackers consume the same cost kernel."
  - "Cost diagnostics contain bounded estimator facts and never task or provider payload content."

requirements-completed: [PRICE-01, PRICE-02, PRICE-03, PRICE-04]

duration: 22min
completed: 2026-07-16
---

# Phase 60 Plan 05: Provider and Agent Cost Integrity Summary

**Provider usage, agent calls, and nested crews now use one estimator with authoritative actual cost and before-transport hard-budget enforcement**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-17T04:12:07Z
- **Completed:** 2026-07-17T04:34:00Z
- **Tasks:** 2
- **Files modified:** 18

## Accomplishments

- Removed independent static price arithmetic from generic, Anthropic, and Gemini provider normalization while preserving modern/legacy compatibility, streaming usage, and reported-cost authority.
- Added a shared estimate before every agent transport call, including cumulative remaining-budget checks, exact-equality behavior, unknown-price fail-closed behavior, and bounded tracer diagnostics.
- Filled null returned usage from selected capability pricing through the same kernel and made `CostTracker` accept optional pricing or structured estimates without breaking zero-argument construction.
- Propagated the same pricing and live remaining pool through root, child, and nested crew execution so active ancestor cost cannot be bypassed.
- Added table-driven and generated coverage for free, known, partial, unknown, equality, overage, cumulative, nested, streaming, and provider-authoritative cases.

## Task Commits

1. **Task 1: Delegate provider usage normalization to the cost kernel** - `440d486` (feat)
2. **Task 2: Preflight agent and crew calls with shared cost diagnostics** - `a986e47` (feat)

## Files Created/Modified

- `packages/lattice/src/providers/adapters.ts` - Shared generic and AI SDK usage-cost resolution.
- `packages/lattice/src/providers/anthropic.ts` - Shared Anthropic usage-cost resolution.
- `packages/lattice/src/providers/gemini.ts` - Shared Gemini usage-cost resolution.
- `packages/lattice/src/agent/runtime.ts` - Per-call estimate diagnostics, hard-budget preflight, and actual-usage resolution.
- `packages/lattice/src/agent/infra/cost-tracker.ts` - Optional pricing and structured-estimate accumulation.
- `packages/lattice/src/agent/crew/run-crew.ts` - Provider pricing and shared budget propagation for crew roots and accounting.
- `packages/lattice/src/agent/crew/dispatcher.ts` - Active ancestor budget inheritance for nested children.
- `packages/lattice/src/routing/cost.ts` - Shared actual-usage helper and accumulated floating-point comparison.
- Root and modular exports plus focused provider, agent, tracker, crew, dispatcher, and kernel tests.

## Decisions Made

- Used the first executable provider's first available capability for agent and crew estimates, matching deterministic provider selection rather than introducing another routing decision.
- Kept unbounded calls eligible when pricing is unknown; fail-closed behavior applies only when a hard `maxCostUsd` exists.
- Applied floating tolerance only after additive accumulation. Router and contract comparisons of one structured estimate retain strict greater-than semantics.
- Emitted estimator version, status, token estimates, and known total only; unknown reasons and task content stay out of tracer attributes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed inherited free pricing from real adapter capabilities**
- **Found during:** Task 1 provider-authority testing
- **Issue:** Real adapters without configured pricing inherited catalog defaults intended for fake capabilities, turning unknown cost into known zero.
- **Fix:** Copied configured pricing onto adapter capabilities only when explicitly supplied.
- **Files modified:** provider adapters and their tests.
- **Verification:** Unknown, free, partial, modern, legacy, conflict, reported, and streaming cases passed.
- **Committed in:** `440d486`

**2. [Rule 2 - Missing Critical] Threaded active ancestor cost through nested dispatchers**
- **Found during:** Task 2 crew budget review
- **Issue:** A grandchild received the raw shared-pool callback and could omit an active root's unrecorded local spend.
- **Fix:** Wrapped the remaining-budget callback at each dispatch level so every descendant inherits active ancestor cost.
- **Files modified:** `packages/lattice/src/agent/crew/dispatcher.ts`, `packages/lattice/src/agent/crew/run-crew.test.ts`.
- **Verification:** The nested regression stops after root and child calls; grandchild transport is never invoked.
- **Committed in:** `a986e47`

**3. [Rule 1 - Bug] Preserved exact aggregate equality across floating-point addition**
- **Found during:** Task 2 exact crew-budget testing
- **Issue:** `0.1 + 0.05` could compare slightly above `0.15` and reject a valid equality boundary.
- **Fix:** Added a one-ULP tolerance for accumulated totals only.
- **Files modified:** `packages/lattice/src/routing/cost.ts`, agent and crew consumers, and tests.
- **Verification:** Equality passes while a material `0.151 > 0.15` overage rejects.
- **Committed in:** `a986e47`

**4. [Rule 3 - Blocking] Exported the additive CostTracker option contract**
- **Found during:** Task 2 package typecheck
- **Issue:** The new public function parameter type was not reachable through supported root and modular entrypoints.
- **Fix:** Exported `CostTrackerOptions` from both entrypoints.
- **Files modified:** `packages/lattice/src/index.ts`, `packages/lattice/src/agents.ts`.
- **Verification:** Package typecheck passed.
- **Committed in:** `a986e47`

---

**Total deviations:** 4 auto-fixed (2 missing critical integrations, 1 bug, 1 blocking export).
**Impact on plan:** All fixes were required for the planned cost truth and public compatibility; no unrelated provider or agent behavior changed.

## Issues Encountered

- The fake provider intentionally publishes explicit zero pricing, so unknown-price tests construct a capability with pricing removed rather than relying on omitted test configuration.
- Exact decimal equality required separating accumulated-cost tolerance from strict single-estimate policy comparisons.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- Provider normalization and parity suites: 4 files, 161 tests passed.
- Focused agent, tracker, and crew suites: 4 files, 73 tests passed.
- Full agent tree: 20 files, 282 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- Production search found price multiplication only in `routing/cost.ts`.
- `git diff --check`: passed.

## Next Phase Readiness

- Plan 60-06 can verify the entire phase across receipt policy, evaluation, routing, provider, agent, crew, plan, replay, and package surfaces.
- Phase 61 can build receipt closure on agent calls whose budget and usage evidence now have one deterministic authority.

## Self-Check: PASSED

- Commits `440d486` and `a986e47` contain both plan tasks and all required integration fixes.
- Hard ceilings stop transport on unknown or overage estimates; free and equality cases execute.
- Provider-reported cost remains authoritative, and diagnostics contain no task content.
- User paper and journal files remain untouched.

---
*Phase: 60-audit-evaluation-and-cost-integrity*
*Completed: 2026-07-16*
