# Plan 15-01: Receipt v1.1 schema extension — SUMMARY

**Completed:** 2026-05-31 (retro; original landed 2026-05-24)
**Status:** Complete via cherry-pick of `5c48134`
**REQ-IDs covered:** RECEIPT-EXT-01, RECEIPT-EXT-02, RECEIPT-EXT-03

## What Was Done

- `packages/lattice/src/receipts/types.ts` widened: `version` is now `"lattice-receipt/v1" | "lattice-receipt/v1.1"`. Six optional fields added: `stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp`.
- `packages/lattice/src/receipts/receipt.ts` got the `hasStepMarker` heuristic. When any step-marker field is populated on input, the emitted body's `version` is `v1.1`; otherwise `v1`.
- `packages/lattice/src/receipts/verify.ts` accepts both version literals.
- Tests: `receipt.test.ts` (+119 lines) covers v1.1 mint, partial step-marker bump, no-step-marker stay-on-v1. `verify.test.ts` (+67 lines) covers cross-version verify.

## Outcome

8 new tests landed. RECEIPT-EXT-01..03 closed.
