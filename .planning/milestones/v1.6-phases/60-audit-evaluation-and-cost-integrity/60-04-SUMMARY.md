---
phase: 60-audit-evaluation-and-cost-integrity
plan: 04
subsystem: cost-routing
tags: [pricing, routing, contracts, execution-plans, replay]

requires:
  - phase: 60-audit-evaluation-and-cost-integrity
    plan: 01
    provides: shared Phase 60 policy foundations
provides:
  - Versioned structured cost estimates with per-dimension provenance
  - Identical route-policy and contract-budget semantics
  - Cost evidence preserved through selected and fallback plan routes
affects: [provider-usage, agent-budgets, crew-budgets, diagnostics]

tech-stack:
  added: []
  patterns: [single-cost-kernel, fail-closed-hard-budget, additive-route-evidence]

key-files:
  created: [packages/lattice/src/routing/cost.ts, packages/lattice/src/routing/cost.test.ts]
  modified: [packages/lattice/src/routing/catalog.ts, packages/lattice/src/routing/router.ts, packages/lattice/src/contract/preflight.ts, packages/lattice/src/plan/plan.ts, packages/lattice/src/replay/replay.ts]

key-decisions:
  - "Preferred per-1k pricing wins independently per dimension; legacy per-1M values normalize through the same kernel."
  - "Missing pricing for any nonzero token dimension makes the total unknown, while explicit zero and zero-token missing dimensions remain known."
  - "Hard ceilings reject unknown estimates and known overages, but accept exact equality."
  - "Without a ceiling, known-cost routes sort ahead of otherwise equivalent unknown-cost routes."

patterns-established:
  - "Route and contract decisions consume one immutable CostEstimate rather than recalculating price units."
  - "The scalar costUsd compatibility field exists only when the structured total is known."

requirements-completed: [PRICE-01, PRICE-02, PRICE-03, PRICE-04]

duration: 18min
completed: 2026-07-16
---

# Phase 60 Plan 04: Shared Cost Integrity Summary

**Routing, contracts, plans, and replay now consume one versioned cost estimate with explicit known, free, partial, and unknown semantics**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-17T03:42:00Z
- **Completed:** 2026-07-17T03:59:23Z
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments

- Added `lattice-cost/v1`, a pure structured estimator for modern per-1k, legacy per-1M, mixed, conflicting, partial, free, missing, and invalid pricing.
- Preserved normalized rates, token counts, per-side status/cost/source, total status/cost, bounded unknown reasons, and estimator version.
- Delegated `effectivePer1kPricing` and the public `estimateRouteCost` compatibility helper to the shared kernel.
- Replaced the router's legacy-only arithmetic and zero fallback with the shared estimate and canonical 512-token output projection.
- Made route `maxCostUsd` and contract budgets reject unknown and over-ceiling estimates identically while allowing equality.
- Added structured estimates to selected, candidate, and fallback route evidence and retained them through runtime fallback reconstruction and replay redaction.
- Added table and generated parity coverage for unit normalization, budget decisions, deterministic ranking, and plan evidence.

## Task Commits

1. **Task 1: Implement the versioned structured cost kernel** - `5890d12` (feat)
2. **Task 2: Converge routing, plans, and contract budgets** - `331f348` (feat)

## Files Created/Modified

- `packages/lattice/src/routing/cost.ts` - Versioned structured cost kernel and canonical output projection.
- `packages/lattice/src/routing/catalog.ts` - Compatibility pricing normalization delegated to the kernel.
- `packages/lattice/src/routing/router.ts` - Shared route estimate, hard-budget rule, and unknown-aware scoring.
- `packages/lattice/src/contract/preflight.ts` - Scalar compatibility wrapper and matching contract budget rule.
- `packages/lattice/src/plan/plan.ts` - Additive structured route and fallback estimate evidence.
- `packages/lattice/src/runtime/create-ai.ts` - Fallback reconstruction uses the fallback's own estimate.
- `packages/lattice/src/replay/replay.ts` - Structured estimates survive safe replay-plan redaction.
- Modular/root public exports and focused cost, route, contract, plan, execution, and replay tests.

## Decisions Made

- Kept `CostEstimate` additive on `RouteEstimates` so older hand-built plan fixtures and consumers remain source compatible.
- Kept post-execution provider-reported cost authoritative; this plan changes pre-execution estimates only.
- Ranked known estimates before unknown estimates without rejecting unknown candidates when no hard ceiling exists.
- Preserved the old scalar estimator API as `number | null`; callers needing provenance use the exported structured estimator.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserved fallback estimates through runtime and replay reconstruction**
- **Found during:** Task 2 route-evidence tracing
- **Issue:** Adding estimates only to the fallback plan type would still let fallback reconstruction reuse the selected route's cost, and replay redaction would drop the new facts.
- **Fix:** Used the fallback estimate in the runtime reconstruction path and explicitly cloned it in replay redaction.
- **Files modified:** `packages/lattice/src/runtime/create-ai.ts`, `packages/lattice/src/replay/replay.ts`, `packages/lattice/src/replay/replay.test.ts`
- **Verification:** planning/execution and replay redaction suites passed.
- **Committed in:** `331f348`

---

**Total deviations:** 1 auto-fixed missing integration surface.
**Impact on plan:** Required to make the planned fallback and replay evidence guarantee true; no provider adapter method or serialized legacy field was removed.

## Issues Encountered

- The first property run revealed that the default test capability carries explicit zero pricing. The unknown-price generator was corrected to remove pricing rather than omit an override.
- The repository does not currently install a Prettier binary; formatting was checked through existing style, TypeScript, tests, and `git diff --check`.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- Cost kernel and catalog tests: 4 files, 31 tests passed before Task 2.
- Route, contract, plan, planning/execution, and replay suites: 5 files, 45 tests passed.
- Generated route-policy/contract matrix: 100 pricing, token, and budget cases passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- Targeted production search found no pricing-unit arithmetic in router, preflight, or plan modules outside score scaling.
- `git diff --check`: passed.

## Next Phase Readiness

- Plan 60-05 can reuse `estimateCost` for provider usage normalization and before-call agent/crew budget checks.
- The structured route estimate and canonical output projection are public and stable for cross-surface diagnostics.

## Self-Check: PASSED

- Commits `5890d12` and `331f348` contain both planned tasks and the required fallback/replay integration.
- Known zero, unknown, equality, overage, mixed units, and deterministic selection have direct regression coverage.
- User paper and graph work remain untouched.

---
*Phase: 60-audit-evaluation-and-cost-integrity*
*Completed: 2026-07-16*
