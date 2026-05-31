---
phase: 18-survivability-adapter
verified: 2026-05-31T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
verification_mode: retro-cherry-pick-equivalence
deferred_reqs:
  - TRACE-EXT-01 (recovery / eviction-resume markers — deferred to Track B)
---

# Phase 18: Survivability Adapter Contract Verification Report

**Phase Goal:** Lattice defines what "execution context can be evicted mid-flow" means for any runtime (MV3 SW, Cloudflare Worker, Lambda, equivalent) without coupling the contract to any one platform.
**Verified:** 2026-05-31
**Status:** passed via cherry-pick equivalence (3 originating SHAs replayed clean from FSB v0.10.0-attempt-2 Phase 5).

## TRACE-EXT-01 Deferral Note

The v1.2 ROADMAP draft bundled "recovery / eviction-resume markers in `RunEventKind`" (the one Important row from v1.1 audit) into Phase 18. That work is **DEFERRED to Track B** because Phase 18 is a pure retro and the FSB Phase 5 commits do not include those markers. Recovery markers naturally compose with the agent host's storage seam in Phase 20; they will be planned there.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `SurvivabilityAdapter<TState>` interface exports `serialize`, `deserialize`, `onEviction`, `resume` | VERIFIED | `runtime/survivability.ts` post-cherry-pick. |
| 2 | `SerializedSnapshot` JSON round-trips byte-equal | VERIFIED | `survivability.test.ts` round-trip cases. |
| 3 | `SerializedSnapshot.payload` survives DSSE + JCS round-trip when embedding a v1.1 ReceiptEnvelope with real Ed25519 | VERIFIED | `survivability.test.ts` Test 12 (real ephemeral keypair + `createReceipt` + `verifyReceipt`). |
| 4 | `ResumePolicy` literal-union exports all 4 variants | VERIFIED | `runtime/survivability.ts`: SAFE, RECOVERY_AMBIGUOUS, ON_ERROR_SW_EVICTION_MID_REQUEST, ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH. |
| 5 | `createNoopSurvivabilityAdapter()` exported as reference impl with public surface re-exports | VERIFIED | `runtime/survivability.ts` factory + `packages/lattice/src/index.ts` +9 lines. |

## File-Level Evidence

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/runtime/survivability.ts` | +244 (new module) | LANDED |
| `packages/lattice/src/runtime/survivability.test.ts` | +265 (new test file, 17 cases) | LANDED |
| `packages/lattice/src/index.ts` | +9 (re-exports) | LANDED |
| `docs/fsb-integration-gaps.md` | +2 -2 (audit Phase 5 close) | LANDED |

## Originating-Commit Provenance

All 3 cherry-picks clean. `git cherry-pick -x` provenance preserved.

## Conclusion

Phase 18 verified passed. SURV-01..04 + INDEX-05 closed (5 REQ-IDs). TRACE-EXT-01 deferred to Track B. Track A retro complete — ready to merge into `v1.2`.
