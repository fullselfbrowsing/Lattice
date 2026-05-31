# Plan 15-03: Public surface re-exports + test flip — SUMMARY

**Completed:** 2026-05-31 (retro; originals landed 2026-05-24)
**Status:** Complete via cherry-pick of `2110e19` and `00fcfac`
**REQ-IDs covered:** INDEX-02

## What Was Done

- `packages/lattice/src/index.ts` re-exports `createHookPipeline`, `HookPipeline`, `HookLifecycleEvent`.
- `packages/lattice/test/public-surface.test.ts` stale assertion flipped (the one Phase 14 left as expected-FAIL); now asserts `createReceipt IS exported`.

## Outcome

INDEX-02 closed. Vitest suite returns to 0 FAIL at this branch's HEAD.
