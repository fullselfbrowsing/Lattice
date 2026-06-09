---
phase: 38-receipt-v1-2-schema-modelclass-tag
plan: 02
subsystem: runtime
tags: [runtime, receipts, capability-registry, modelClass]

requires:
  - phase: 38-receipt-v1-2-schema-modelclass-tag
    provides: v1.2 receipt schema and CreateReceiptInput.modelClass
  - phase: 33-model-capability-registry-200-via-openrouter-feed
    provides: strict getCapabilityProfile lookup and lm-studio:local-template profile
provides:
  - Runtime terminal receipt modelClass derivation through strict providerId:modelId lookup
  - ai.run include/omit tests for known, fake, and synthetic receipt paths
  - Checkpoint, agent, and survivability receipt expectations updated to v1.2 omit behavior
affects: [runtime, receipts, agent, checkpoint, survivability]

tech-stack:
  added: []
  patterns:
    - Runtime receipt enrichment happens in maybeIssueReceipt, not provider adapters
    - Unknown or synthetic receipt routes omit modelClass instead of guessing

key-files:
  created:
    - .planning/phases/38-receipt-v1-2-schema-modelclass-tag/38-02-SUMMARY.md
  modified:
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/runtime/create-ai.test.ts
    - packages/lattice/src/contract/checkpoint.ts
    - packages/lattice/src/contract/checkpoint.test.ts
    - packages/lattice/src/agent/integration.test.ts
    - packages/lattice/src/runtime/survivability.test.ts

key-decisions:
  - "modelClass is derived only with getCapabilityProfile(`${providerId}:${modelId}`); findCapabilityProfile is not used."
  - "ProviderRunResponse and adapter APIs remain unchanged."
  - "Checkpoint and agent receipts omit modelClass by default because their route/model context is synthetic."

patterns-established:
  - "Runtime terminal receipt tests should verify signed bodies through verifyReceipt before asserting receipt metadata."
  - "Synthetic receipt paths should assert modelClass is undefined, preserving audit honesty."

requirements-completed: [RECEIPT12-03, RECEIPT12-04]

duration: 24min
completed: 2026-06-09
---

# Phase 38-02: Runtime Receipt Issuance Summary

**ai.run terminal receipts now attach registry-derived modelClass for known selected models without changing provider APIs.**

## Performance

- **Duration:** 24 min
- **Started:** 2026-06-09T18:13:30-05:00
- **Completed:** 2026-06-09T18:37:38-05:00
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Added `resolveReceiptModelClass` in `create-ai.ts`, using strict `getCapabilityProfile("${providerId}:${modelId}")`.
- Passed `modelClass` into `createReceipt` only when a strict profile match exists.
- Covered known `lm-studio:local-template` receipts for success, validation failure, tripwire violation, and provider execution failure.
- Covered omit behavior for default fake, provider-ref execution failure, synthetic no-route, checkpoint, and agent iteration receipts.
- Updated stale v1.1 receipt comments in affected checkpoint/agent/survivability paths to v1.2.

## Task Commits

1. **Task 1: Runtime resolver** - `5ac4e79` (feat)
2. **Task 2: Runtime branch tests** - `f0c8301` (test)
3. **Task 3: Checkpoint/agent/survivability expectations** - `a3ec2d3` (test)

## Files Created/Modified
- `packages/lattice/src/runtime/create-ai.ts` - strict model-class resolver and createReceipt propagation.
- `packages/lattice/src/runtime/create-ai.test.ts` - terminal receipt include/omit coverage.
- `packages/lattice/src/contract/checkpoint.ts` - v1.2 checkpoint receipt comment.
- `packages/lattice/src/contract/checkpoint.test.ts` - v1.2 and `modelClass === undefined` checkpoint assertion.
- `packages/lattice/src/agent/integration.test.ts` - checkpoint receipt omit assertion in agent loop.
- `packages/lattice/src/runtime/survivability.test.ts` - v1.2 ReceiptEnvelope test title.

## Decisions Made
None - followed plan as specified, with stale source comments updated alongside affected tests.

## Deviations from Plan
Updated two adjacent source comments (`create-ai.ts`, `checkpoint.ts`) that still documented v1.1 receipt minting. This was documentation cleanup only; no behavior changed outside the planned resolver.

## Issues Encountered
None.

## Verification
- `pnpm --filter @full-self-browsing/lattice test runtime/create-ai` - passed, 1 file / 34 tests.
- `pnpm --filter @full-self-browsing/lattice test contract/checkpoint agent/integration runtime/survivability` - passed, 3 files / 35 tests.
- `pnpm --filter @full-self-browsing/lattice test runtime/create-ai contract/checkpoint agent/integration runtime/survivability` - passed, 4 files / 69 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Plan 38-03 can now expose the public type surface, add a changeset, and complete roadmap/requirement bookkeeping.

---
*Phase: 38-receipt-v1-2-schema-modelclass-tag*
*Completed: 2026-06-09*
