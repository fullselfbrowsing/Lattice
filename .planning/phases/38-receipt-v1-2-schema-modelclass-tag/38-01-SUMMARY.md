---
phase: 38-receipt-v1-2-schema-modelclass-tag
plan: 01
subsystem: receipts
tags: [receipts, crypto, schema-version, modelClass]

requires:
  - phase: 26-release-hygiene-docs-receipt-downgrade-defense
    provides: CRYPTO-01 downgrade floor for v1 receipts
  - phase: 33-model-capability-registry-200-via-openrouter-feed
    provides: TrainingClass type carried by v1.2 receipts
provides:
  - Receipt body type widened to v1.2 with optional modelClass
  - createReceipt minting rule moved to lattice-receipt/v1.2
  - verifyReceipt compatibility for v1.1 and v1.2 with v1 downgrade rejection intact
affects: [receipts, runtime-receipt-issuance, public-types]

tech-stack:
  added: []
  patterns:
    - Signed receipt fields are assembled before redactReceiptBody and canonicalization
    - Verifier schema recognition stays pure and registry-free

key-files:
  created:
    - .planning/phases/38-receipt-v1-2-schema-modelclass-tag/38-01-SUMMARY.md
  modified:
    - packages/lattice/src/receipts/types.ts
    - packages/lattice/src/receipts/receipt.ts
    - packages/lattice/src/receipts/verify.ts
    - packages/lattice/src/receipts/receipt.test.ts
    - packages/lattice/src/receipts/verify.test.ts
    - packages/lattice/src/receipts/canonical.test.ts

key-decisions:
  - "Newly minted receipts always use lattice-receipt/v1.2; callers still cannot select schema version."
  - "modelClass is optional and signed only when provided."
  - "verifyReceipt accepts v1.1 and v1.2 but still rejects absent/v1 versions with schema-version-too-low."

patterns-established:
  - "Optional receipt fields use conditional spreads to preserve exactOptionalPropertyTypes."
  - "Legacy receipt compatibility tests use hand-crafted signed bodies instead of createReceipt after minting moves forward."

requirements-completed: [RECEIPT12-01, RECEIPT12-02, RECEIPT12-04]

duration: 25min
completed: 2026-06-09
---

# Phase 38-01: Core Receipt Schema Summary

**Capability Receipts now mint as v1.2, can carry signed modelClass, and retain the CRYPTO-01 downgrade floor.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-09T18:08:00-05:00
- **Completed:** 2026-06-09T18:33:08-05:00
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments
- Added `CapabilityReceiptBody.modelClass?: TrainingClass` and the `lattice-receipt/v1.2` schema literal.
- Updated `createReceipt` to always mint v1.2 and include `modelClass` before redaction/canonicalization/signing.
- Updated `verifyReceipt` to recognize v1.2 while keeping v1.1 compatibility, absent/v1 rejection, and future-version mismatch behavior.
- Added focused tests for v1.2 minting, `modelClass` preservation, v1.1 signed legacy receipts, v1+modelClass downgrade rejection, and canonical stability.

## Task Commits

1. **Task 1: Receipt body type** - `86aa2ca` (feat)
2. **Task 2: Receipt minting** - `757138e` (feat)
3. **Task 3: Verifier compatibility** - `cbb650e` (fix)
4. **Task 4: Receipt tests** - `b659704` (test)

## Files Created/Modified
- `packages/lattice/src/receipts/types.ts` - v1.2 version literal and optional signed `modelClass` type.
- `packages/lattice/src/receipts/receipt.ts` - v1.2 minting rule and `CreateReceiptInput.modelClass`.
- `packages/lattice/src/receipts/verify.ts` - v1.2 structural recognition with unchanged downgrade floor.
- `packages/lattice/src/receipts/receipt.test.ts` - default v1.2, `modelClass`, determinism, and step-marker coverage.
- `packages/lattice/src/receipts/verify.test.ts` - v1.1/v1.2 compatibility and downgrade matrix.
- `packages/lattice/src/receipts/canonical.test.ts` - v1.2 canonical fixtures with `modelClass`.

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## Verification
- `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical` - passed, 3 files / 63 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Plan 38-02 can now derive `modelClass` at runtime and pass it into `createReceipt`; the core schema, verifier, and receipt test matrix are in place.

---
*Phase: 38-receipt-v1-2-schema-modelclass-tag*
*Completed: 2026-06-09*
