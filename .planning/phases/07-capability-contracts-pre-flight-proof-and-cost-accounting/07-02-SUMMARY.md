---
phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting
plan: 02
subsystem: routing
tags:
  - capability-contract
  - preflight
  - router
  - cost-estimation
  - reject-reasons
  - phase-7
dependency_graph:
  requires:
    - phase: 07-01
      provides: CapabilityContract types, contract() factory, ContractRejectReasonCode, effectivePer1kPricing, normalized Usage shape
  provides:
    - Pure evaluateContractAgainstRoute(contract, input) preflight evaluator
    - Pure estimateRouteCost(input) cost estimator (returns null when pricing unknown)
    - ContractPreflightResult, EstimateRouteCostInput, EvaluateContractInput interfaces
    - RouteRequest.contract? optional field on the deterministic router
    - Three contract-* reject codes flowing through noRouteReasons (contract-budget-exceeded, contract-modality-missing, contract-privacy-mismatch)
  affects:
    - Plan 07-03 (adapter cost normalization) — preflight cost shape lines up with adapter-reported Usage.costUsd
    - Plan 07-04 (runtime wiring) — runtime classification of no-contract-match vs no-route consumes contract-* codes in noRouteReasons
    - Phase 9 (receipts) — evaluateContractAgainstRoute will be reused for deterministic verdict reconstruction; router's estimates.outputTokens is the pinned input
    - Phase 12 (lattice eval) — owns contract-quality-floor emission; Phase 7 leaves the code reserved but never emits it
tech_stack:
  added: []
  patterns:
    - Pure functions for pre-flight evaluation so Phase 9 receipts can rebuild verdicts deterministically
    - One source of truth for estimated output tokens: router computes estimates.outputTokens once and passes the same value into preflight
    - Reject reasons surface ALL failures per candidate (not first-failing only); router-level dedup happens in the existing summarizeNoRouteReasons by code
    - Additive RouteRequest extension — optional field, no breaking changes to existing callers or tests
key_files:
  created:
    - packages/lattice/src/contract/preflight.ts
    - packages/lattice/src/contract/preflight.test.ts
    - packages/lattice/src/routing/router.test.ts
  modified:
    - packages/lattice/src/contract/index.ts
    - packages/lattice/src/routing/router.ts
key_decisions:
  - Router-owned token estimation stays single-source — preflight consumes estimates.outputTokens from estimateRoute() rather than introducing a second estimator, so Phase 9 receipts always see one number
  - estimateRouteCost returns number | null (matches Usage.costUsd shape from Plan 07-01) so the "free / zero vs unmeasured" distinction is preserved end-to-end
  - Budget invariant with unknown pricing rejects with contract-budget-exceeded and a "pricing unknown" message (CONTEXT.md "pre-flight budget invariants reject null-cost routes when a budget is declared")
  - contract-quality-floor stays reserved for Phase 12; Phase 7's evaluator never emits it (qualityFloor enforcement is fixture-suite-level, not capability-level)
  - Legacy policy budget-exceeded code path is preserved untouched — contract budget is a separate code (contract-budget-exceeded) so Plan 04 can classify by prefix
  - Contract preflight runs AFTER addPolicyRejectReasons in evaluateCapability so policy-side rejects appear first in the reasons array (deterministic ordering for Phase 9 receipts)
patterns_established:
  - "Pre-flight pattern: pure (contract, input) -> { ok, reasons } function reusable by router + future receipt builder"
  - "Additive router extension: extend RouteRequest with optional fields, forward into the per-candidate evaluator via spread-when-defined, no breaking changes"
  - "Test fixture pattern: unpriced capabilities built by destructuring `pricing` out of defaultCapabilityForProvider() to satisfy exactOptionalPropertyTypes (no { pricing: undefined } overrides)"
requirements_completed:
  - CONTRACT-04
  - CONTRACT-06
  - COST-03
metrics:
  duration: ~12 minutes
  completed_date: "2026-05-11"
---

# Phase 07 Plan 02: Pre-flight contract evaluator and router wiring Summary

Pure `evaluateContractAgainstRoute` evaluator plus router integration that flows contract-budget-exceeded, contract-modality-missing, and contract-privacy-mismatch through the deterministic router's existing `noRouteReasons` taxonomy without breaking any v1.0 caller.

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-11
- **Completed:** 2026-05-11
- **Tasks:** 2 (both TDD)
- **Files created:** 3
- **Files modified:** 2

## Accomplishments

- Pure `evaluateContractAgainstRoute(contract, input)` evaluator with 10 behavior-driven tests covering budget pass/fail/unpriced, qualityFloor reservation, modality miss, privacy mismatch, multi-reason aggregation, no-contract early return, and the pure cost estimator.
- Pure `estimateRouteCost(input)` returning `number | null` — `null` when pricing is unknown so downstream gates can distinguish "free / zero" from "unmeasured" (matches `Usage.costUsd` shape from Plan 07-01).
- `RouteRequest.contract?` optional field on `routeDeterministically` — additive, all 66 pre-existing tests pass unchanged.
- Three contract reject codes (`contract-budget-exceeded`, `contract-modality-missing`, `contract-privacy-mismatch`) now flow through `summarizeNoRouteReasons`' existing dedupe-by-code path.
- `contract-quality-floor` reserved but **never emitted** by Phase 7's evaluator (Phase 12 will emit it from `lattice eval`).
- Test suite: 14 files / 82 tests (was 12 / 66 before Plan 02; +2 new test files / +16 new tests, zero regressions).

## Task Commits

Each task was executed TDD (failing test commit, then implementation commit):

1. **Task 1 RED: failing preflight evaluator coverage** — `2752615` (test)
2. **Task 1 GREEN: implement pure preflight contract evaluator** — `e691daf` (feat)
3. **Task 2 RED: failing router contract preflight coverage** — `085386b` (test)
4. **Task 2 GREEN: thread contract through RouteRequest and wire preflight reasons** — `870f133` (feat)

All commits used `--no-verify` per the worktree directive.

## Files Created/Modified

### Created

- `packages/lattice/src/contract/preflight.ts` (138 lines) — pure `evaluateContractAgainstRoute` + `estimateRouteCost` plus the three interface exports.
- `packages/lattice/src/contract/preflight.test.ts` (162 lines) — 10 behavior tests.
- `packages/lattice/src/routing/router.test.ts` (149 lines) — 6 router integration tests covering Phase 7 contract preflight behaviors.

### Modified

- `packages/lattice/src/contract/index.ts` — additive: re-exports `evaluateContractAgainstRoute`, `estimateRouteCost`, and the three preflight interfaces (no Plan 01 exports removed).
- `packages/lattice/src/routing/router.ts` — additive (+18 lines, **zero lines removed**):
  - 2 imports (`CapabilityContract` type + `evaluateContractAgainstRoute` value)
  - 1 new field on `RouteRequest` (`readonly contract?: CapabilityContract`)
  - 1 new field on the internal `evaluateCapability` input
  - 1 spread-when-defined forwarder at the call site
  - 1 preflight invocation block (after `addPolicyRejectReasons`, before `scoreCapability`) that pushes contract reasons into the existing `reasons` array
  - Pre-existing `summarizeNoRouteReasons` already dedupes by `code` — no changes needed for contract-* codes to flow through

## Function Signatures (preflight.ts)

```typescript
export interface ContractPreflightResult {
  readonly ok: boolean;
  readonly reasons: readonly RouteRejectReason[];
}

export interface EstimateRouteCostInput {
  readonly capability: ModelCapability;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}

export function estimateRouteCost(input: EstimateRouteCostInput): number | null;

export interface EvaluateContractInput {
  readonly capability: ModelCapability;
  readonly estimatedInputTokens: number;
  readonly estimatedOutputTokens: number;
}

export function evaluateContractAgainstRoute(
  contract: CapabilityContract | undefined,
  input: EvaluateContractInput,
): ContractPreflightResult;
```

## Test Counts

| File                                             | Tests | Notes                                                            |
| ------------------------------------------------ | ----- | ---------------------------------------------------------------- |
| `packages/lattice/src/contract/preflight.test.ts` | 10    | Budget pass/fail/unpriced, qualityFloor reserved, modality, privacy, multi-reason, no-contract early return, estimator |
| `packages/lattice/src/routing/router.test.ts`     | 6     | Backward compat, budget reject, modality reject, mixed catalog selection, privacy reject, multi-candidate dedup        |
| **New tests this plan**                          | **+16** |                                                                  |
| **Full suite after plan**                        | 82    | (was 66 before; 12 -> 14 files)                                  |

## Phase 7 emits 3 of 4 contract reject codes

| Code                          | Emitted in Phase 7?                | Owner                                  |
| ----------------------------- | ---------------------------------- | -------------------------------------- |
| `contract-budget-exceeded`    | Yes                                | preflight.ts (this plan)               |
| `contract-modality-missing`   | Yes                                | preflight.ts (this plan)               |
| `contract-privacy-mismatch`   | Yes                                | preflight.ts (this plan)               |
| `contract-quality-floor`      | **No — reserved**                  | Phase 12 (`lattice eval`)              |

Confirmed by `grep` on `preflight.ts`: only two `contract-quality-floor` matches, both in comments (one in the doc block, one explaining the deferred decision). Zero matches in active code.

## Decisions Made

- **Output-token estimate single-source:** Phase 7 does NOT add a separate token estimator. The router's existing `estimateRoute()` produces `estimates.outputTokens` (currently hard-coded 512). That same value is passed into the preflight evaluator, so preflight and the router agree on the projected output size. Phase 9 receipts will pin this number as the deterministic input.
- **Unpriced-capability handling:** When `pricing` is undefined AND a contract budget is declared, preflight rejects with `contract-budget-exceeded` and includes "pricing unknown" in the message (per CONTEXT.md "pre-flight budget invariants reject null-cost routes when a budget is declared"). When pricing is undefined AND no budget is declared, preflight returns ok.
- **Legacy policy `budget-exceeded` preserved:** The router's `addPolicyRejectReasons` still emits the original `budget-exceeded` code for `PolicySpec.maxCostUsd`. Contract budget gets its own code (`contract-budget-exceeded`) so Plan 04 can classify by prefix without ambiguity.
- **Test fixture pattern for unpriced capabilities:** `tsconfig.json` enables `exactOptionalPropertyTypes`, which rejects `{ pricing: undefined }` overrides on `Partial<ModelCapability>`. Tests build unpriced capabilities by destructuring `pricing` out of `defaultCapabilityForProvider()` (helper `unpricedCapability()` in `preflight.test.ts`). Pattern reusable for any other optional-field-absent fixture.
- **Preflight runs after policy:** In `evaluateCapability`, contract preflight is invoked AFTER `addPolicyRejectReasons` so policy-side rejects always appear first in the `reasons` array (deterministic ordering for Phase 9 receipts).

## Deviations from Plan

None — plan executed exactly as written. The plan was already tightly locked after the post-checker revision (commit `347ddc6`); the action block was followable verbatim.

The only minor adjustment was a test-side fixture helper (`unpricedCapability()`) to satisfy `exactOptionalPropertyTypes` cleanly — the plan's action block suggested `pricing: undefined` overrides which the project's tsconfig forbids. This is a fixture-construction detail (not a behavior change) and is documented under "Decisions Made" as a reusable pattern.

No bugs found, no architectural changes needed, no authentication gates encountered.

## Issues Encountered

None.

## User Setup Required

None — pure type/runtime work, no external service configuration.

## Verification Evidence

```
$ cd packages/lattice && pnpm typecheck
(exit 0, no output)

$ cd packages/lattice && pnpm vitest run src/contract/preflight.test.ts
 Test Files  1 passed (1)
      Tests  10 passed (10)

$ cd packages/lattice && pnpm vitest run src/routing/router.test.ts src/contract
 Test Files  3 passed (3)
      Tests  22 passed (22)

$ cd packages/lattice && pnpm vitest run
 Test Files  14 passed (14)
      Tests  82 passed (82)
```

End-to-end driver from the plan's `<verification>` block:

```typescript
import { contract } from "lattice/contract/contract";
import { createCapabilityCatalog, defaultCapabilityForProvider } from "lattice/routing/catalog";
import { routeDeterministically } from "lattice/routing/router";

const cap = { ...defaultCapabilityForProvider("a"), pricing: { inputPer1kTokens: 0.005, outputPer1kTokens: 0.01 } };
const catalog = createCapabilityCatalog([{ id: "a", kind: "provider-adapter", capabilities: [cap] }]);
const decision = routeDeterministically(catalog, {
  task: "t",
  artifacts: [],
  outputs: { text: "text" },
  contract: contract({ budget: { maxCostUsd: 0 } }),
});
// decision.selected === undefined
// decision.noRouteReasons contains a contract-budget-exceeded entry
```

This exact behavior is asserted by Test 2 of `router.test.ts` (`maxCostUsd: 0.0000001`, same shape).

## Open Questions for Plan 04 (runtime integration)

1. **Classification rule:** Plan 04 will scan `decision.noRouteReasons` for any code starting with `contract-` and surface `no-contract-match` instead of generic `no-route`. Confirm whether the runtime should also expose the per-candidate detail through the typed `LatticeRunError` variant or only the top-level summary array.
2. **Usage shape on `no-contract-match`:** CONTEXT.md says `usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }` for `no-contract-match` results. Confirm whether `costUsd` should be `0` (free) or `null` (unmeasured) when the run never executed — the plan picks `0` per CONTEXT.md but `null` would be more consistent with the unpriced-rejection message we now emit. Recommend `0` for the no-route case (matches CONTEXT) and `null` only when an actual run was attempted on an unpriced provider.
3. **Determinism of multi-reason ordering:** preflight pushes reasons in source order (budget, modality, privacy). If Phase 9 receipts hash the reasons array, this order needs to stay stable. The current implementation is stable, but documenting it as a contract may be worth doing in Plan 04 docs.

## Requirements Coverage

| ID           | Coverage                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------ |
| CONTRACT-04 | `evaluateContractAgainstRoute` refuses execution when no candidate can satisfy the contract; router emits `noRouteReasons`. |
| CONTRACT-06 | `contract-budget-exceeded`, `contract-modality-missing`, `contract-privacy-mismatch` flow through `noRouteReasons`; `contract-quality-floor` reserved for Phase 12. |
| COST-03     | `estimateRouteCost` uses static catalog metadata only via `effectivePer1kPricing` — no probes, no external pricing APIs. |

## Next Phase Readiness

- Plan 07-03 can consume `evaluateContractAgainstRoute` and `estimateRouteCost` from `lattice/contract` directly — the index re-exports them as values.
- Plan 07-04 can wire the runtime classification by scanning `decision.noRouteReasons` for `code.startsWith("contract-")` and switching `LatticeRunError` to `no-contract-match`.
- Phase 9 (receipts) can rebuild the verdict deterministically by re-running `evaluateContractAgainstRoute` with the persisted `estimatedInputTokens` and `estimatedOutputTokens` (the router's hard-coded `512` is the pinned output estimate as of Phase 7).
- No blockers identified.

## Self-Check: PASSED

- `packages/lattice/src/contract/preflight.ts` — FOUND
- `packages/lattice/src/contract/preflight.test.ts` — FOUND
- `packages/lattice/src/routing/router.test.ts` — FOUND
- `packages/lattice/src/contract/index.ts` — modified, preflight exports added (grep verified)
- `packages/lattice/src/routing/router.ts` — modified, `RouteRequest.contract` and `evaluateContractAgainstRoute` call present (grep verified)
- Commit `2752615` (test RED Task 1) — FOUND in `git log`
- Commit `e691daf` (feat GREEN Task 1) — FOUND in `git log`
- Commit `085386b` (test RED Task 2) — FOUND in `git log`
- Commit `870f133` (feat GREEN Task 2) — FOUND in `git log`
- `pnpm typecheck` from `packages/lattice` — exits 0
- `pnpm vitest run` from `packages/lattice` — 82/82 passing
- `grep -n "export function evaluateContractAgainstRoute" packages/lattice/src/contract/preflight.ts` — match found
- `grep -n "export function estimateRouteCost" packages/lattice/src/contract/preflight.ts` — match found
- `grep -n "readonly contract\\?: CapabilityContract" packages/lattice/src/routing/router.ts` — 2 matches (RouteRequest + internal evaluator input)
- `grep -n "evaluateContractAgainstRoute" packages/lattice/src/routing/router.ts` — 2 matches (import + call site)
- `grep -n "budget-exceeded" packages/lattice/src/routing/router.ts` — legacy policy match preserved (regression check)
- `contract-quality-floor` appears in preflight.ts only inside comments (0 in active code)

---
*Phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting*
*Plan: 02*
*Completed: 2026-05-11*
