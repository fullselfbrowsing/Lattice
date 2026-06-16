---
phase: 42-openrouter-fallback-capability-catalog-refresh
plan: 02
subsystem: runtime
tags: [resolved-model, receipts, gateway-metadata, openrouter]

requires:
  - phase: 42-01
    provides: OpenRouter gateway metadata with requested, fallback, and observed models
provides:
  - Terminal run result gateway metadata
  - Receipt model.observed propagation from provider gateway metadata
  - Receipt modelClass lookup using observed model first
  - Runtime and planning regression coverage for OpenRouter fallback accounting
affects: [phase-42, receipts, run-results, openrouter]

tech-stack:
  added: []
  patterns:
    - Response-backed terminal branches can expose sanitized ProviderGatewayMetadata
    - Receipt classification prefers observed served model while route capabilityId remains requested

key-files:
  created:
    - .planning/phases/42-openrouter-fallback-capability-catalog-refresh/42-02-SUMMARY.md
  modified:
    - packages/lattice/src/results/result.ts
    - packages/lattice/src/runtime/public-types.ts
    - packages/lattice/src/index.ts
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/runtime/create-ai.test.ts
    - packages/lattice/test/planning-execution.test.ts
    - packages/lattice/test-d/index.test-d.ts

key-decisions:
  - "RunSuccess and RunFailure expose optional ProviderGatewayMetadata only, not raw provider payloads."
  - "Receipt model.requested and route.capabilityId remain the Lattice-selected primary model."
  - "Receipt model.observed and modelClass use the served model when a provider reports it."

patterns-established:
  - "observedModelForReceipt(response) is the single runtime helper for response-backed receipt observed model values."
  - "Provider gateway metadata is copied to terminal results only when a provider response exists."

requirements-completed: [ORCAT-02, ORCAT-06]

duration: 5 min
completed: 2026-06-16
---

# Phase 42 Plan 02: Resolved Model Accounting Summary

**OpenRouter served-model metadata now reaches run results and signed receipts without changing the requested route**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-16T04:23:16Z
- **Completed:** 2026-06-16T04:28:28Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added optional `gateway?: ProviderGatewayMetadata` to terminal success and failure results.
- Exported `ProviderGatewayMetadata` through runtime public types and the package root.
- Propagated provider `gateway.observedModel` into response-backed terminal receipts.
- Updated receipt `modelClass` resolution to prefer observed served model, then fall back to requested model.
- Added runtime receipt coverage proving requested, fallback, observed, event metadata, route capability id, and observed model class behavior.
- Added planning coverage proving OpenRouter fallback models do not enter the Lattice fallback chain.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add optional gateway metadata to terminal run results** - `9a171ac` (feat)
2. **Task 2: Populate result gateway metadata and receipt observed model** - `2731581` (feat)
3. **Task 3: Add resolved-model runtime and receipt tests** - `dd57eb2` (test)

## Files Created/Modified

- `packages/lattice/src/results/result.ts` - Adds optional gateway metadata to terminal result types.
- `packages/lattice/src/runtime/public-types.ts` - Re-exports ProviderGatewayMetadata from the public runtime type barrel.
- `packages/lattice/src/index.ts` - Re-exports ProviderGatewayMetadata from the package root.
- `packages/lattice/src/runtime/create-ai.ts` - Propagates observed models to receipts and gateway metadata to terminal results.
- `packages/lattice/src/runtime/create-ai.test.ts` - Covers OpenRouter requested/observed receipt accounting and event metadata.
- `packages/lattice/test/planning-execution.test.ts` - Covers OpenRouter fallback candidates staying out of Lattice fallback routes.
- `packages/lattice/test-d/index.test-d.ts` - Proves package-root ProviderGatewayMetadata typing.

## Decisions Made

- No raw OpenRouter response data is exposed on results; the public surface uses sanitized gateway metadata only.
- No-route and no-executable-adapter branches do not receive gateway metadata because there is no provider response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added package-root ProviderGatewayMetadata export**
- **Found during:** Task 1 type verification
- **Issue:** `runtime/public-types.ts` exported `ProviderGatewayMetadata`, but `src/index.ts` has an explicit package-root type export list and `tsd` imports from the root.
- **Fix:** Added `ProviderGatewayMetadata` to the root type export list.
- **Files modified:** `packages/lattice/src/index.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice test:types`
- **Committed in:** `9a171ac`

**2. [Rule 2 - Missing Critical] Matched route identity without discarding SelectedRoute fields**
- **Found during:** Task 3 focused tests
- **Issue:** The planned test used exact equality for `plan.route.selected`, but `SelectedRoute` correctly includes score, estimates, modalities, and file transport fields.
- **Fix:** Asserted route identity with `toMatchObject` and kept the strict `fallbackChain === []` assertion.
- **Files modified:** `packages/lattice/test/planning-execution.test.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice test -- create-ai planning-execution`
- **Committed in:** `dd57eb2`

---

**Total deviations:** 2 auto-fixed (blocking/type surface, test assertion shape).
**Impact on plan:** No behavior or scope change; both fixes preserve the planned contracts.

## Issues Encountered

- `tsd` required a local `pnpm --filter @full-self-browsing/lattice build` after the new public type export so `dist/index.d.ts` reflected source changes.

## Verification

- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.
- `pnpm --filter @full-self-browsing/lattice test -- create-ai planning-execution` - passed, 70 files / 932 tests.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 88 files / 1122 tests, no type errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All Phase 42 implementation plans are complete. The phase is ready for phase-level verification, security review, and UAT.

## Self-Check: PASSED

- Acceptance criteria satisfied.
- Plan-level verification commands passed.
- Receipt route capability id remains the requested primary model.
- Gateway fallback candidates do not create Lattice fallback routes.

---
*Phase: 42-openrouter-fallback-capability-catalog-refresh*
*Completed: 2026-06-16*
