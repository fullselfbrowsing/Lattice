---
phase: 41-gateway-delegation-litellm-gateway-policy
plan: 02
subsystem: runtime
tags: [gateway-policy, route-accounting, run-events, replayability]
requires:
  - phase: 41-gateway-delegation-litellm-gateway-policy
    provides: typed GatewayPolicy and LiteLLM provider helper
provides:
  - ProviderRunResponse gateway metadata
  - provider attempt metadata records
  - runtime plan and event gateway accounting
  - route-preservation tests for LiteLLM gateway runs
affects: [runtime, execution-plan, provider-adapters, replay]
tech-stack:
  added: []
  patterns:
    - additive gateway accounting metadata
    - route fields remain deterministic while gateway observations are metadata
key-files:
  created: []
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/plan/plan.ts
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/test/runtime.test.ts
    - packages/lattice/test/planning-execution.test.ts
key-decisions:
  - "Gateway observed model is recorded as metadata and does not replace route.selected.modelId."
  - "Provider attempt success events are additive provider.attempt events with status metadata."
  - "Receipts continue to use the Lattice-selected route.modelId and capabilityId."
patterns-established:
  - "Runtime gateway metadata is sanitized through sanitizeGatewayPolicyForEvents before plan/event emission."
  - "ProviderAttemptRecord.metadata carries gateway observations without adding top-level route fields."
requirements-completed: [GATE-02, GATE-03]
duration: 5 min
completed: 2026-06-15
---

# Phase 41 Plan 02: Runtime Gateway Accounting Summary

**Gateway hints and observed gateway models are recorded as metadata while Lattice route fields stay deterministic**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-15T13:44:13Z
- **Completed:** 2026-06-15T13:48:39Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `ProviderGatewayMetadata` and `ProviderRunResponse.gateway`.
- Added additive `ProviderAttemptRecord.metadata`.
- Returned LiteLLM/OpenAI-compatible gateway metadata with requested model, observed response model, and sanitized policy.
- Added sanitized gateway metadata to execution plans, `router.candidates`, provider attempt start events, provider attempt success events, and successful attempt records.
- Added runtime and planning tests proving gateway metadata does not mutate selected route or fallback chain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add additive gateway response and attempt metadata types** - `6bb9707` (feat)
2. **Task 2: Record gateway hints and observed model in plan/events** - `9ad7e9a` (feat)
3. **Task 3: Add runtime tests for deterministic route preservation** - `fa9f333` (test)

**Plan metadata:** pending

## Files Created/Modified

- `packages/lattice/src/providers/provider.ts` - Additive gateway metadata on provider responses.
- `packages/lattice/src/plan/plan.ts` - Additive attempt metadata for gateway observations.
- `packages/lattice/src/providers/adapters.ts` - Gateway response metadata for LiteLLM/OpenAI-compatible runs.
- `packages/lattice/src/runtime/create-ai.ts` - Sanitized gateway metadata in plans and run events.
- `packages/lattice/test/runtime.test.ts` - End-to-end LiteLLM run test with observed gateway model metadata.
- `packages/lattice/test/planning-execution.test.ts` - Planning test proving gateway fallback hints do not alter Lattice fallback chain.

## Decisions Made

- The response model from the gateway is `gateway.observedModel`; it does not replace `route.selected.modelId`.
- Gateway fallback hints are recorded separately from Lattice fallback routes.
- The receipt path was intentionally left unchanged: `model.requested` and `capabilityId` still use `route.modelId`.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope creep.

## Issues Encountered

- `gsd-sdk query verify.key-links` could not resolve abstract symbol names and reported "Source file not found." Manual verification and tests cover the links: `PolicySpec.gateway` reaches `ExecutionPlan.metadata.gateway`, and `ProviderRunResponse.gateway.observedModel` reaches provider attempt/event metadata.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- runtime planning-execution` - passed, 922 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## Next Phase Readiness

The runtime accounting contract is ready for Plan 41-03 public API export, provider parity coverage, type tests, changeset, and full package hygiene gates.

---
*Phase: 41-gateway-delegation-litellm-gateway-policy*
*Completed: 2026-06-15*
