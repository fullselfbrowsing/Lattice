---
phase: 10-receipts-inside-the-replay-envelope
verified: 2026-05-11T17:26:30Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 10: Receipts inside the Replay Envelope - Verification Report

**Phase Goal:** A `ReplayEnvelope` carries optional `receipt` and `contract` fields so that a single receipt is sufficient to materialize an offline replay session deterministically.
**Verified:** 2026-05-11T17:26:30Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                              | Status     | Evidence                                                                                                                                                                                                                          |
| -- | ------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | ReplayEnvelope accepts optional `receipt?` and `contract?` fields without breaking the v1.0 envelope shape         | VERIFIED | `packages/lattice/src/replay/replay.ts:32` `readonly receipt?: ReceiptEnvelope;` and `:37` `readonly contract?: CapabilityContract;`. Both type-only imports lines 2 and 7. All 307 prior tests still green.                       |
| 2  | materializeReplayEnvelope verifies the receipt BEFORE doing any other work and rejects tampered receipts          | VERIFIED | `materialize.ts:120` calls `verifyReceipt(...)` at step 1; `:146` invokes `artifactLoader(hash)` only after verify resolves ok. Test `materialize.test.ts:126-151` asserts `loaderCalls === 0` on tampered receipt.                |
| 3  | Given a valid receipt + in-memory artifact loader, materializeReplayEnvelope produces a ReplayEnvelope that replayOffline can consume | VERIFIED | `materialize.test.ts:153-178` builds fixture, materializes envelope, then calls `replayOffline(envelope)` and asserts `replayResult.ok === true` with matching outputHash.                                                          |
| 4  | Round-trip: createReceipt -> materializeReplayEnvelope -> replayOffline yields outputHash matching the receipt    | VERIFIED | `materialize.test.ts:172-177` recomputes `fingerprintArtifactValue(JSON.stringify(replayResult.outputs))` and asserts equality with the original `outputHash` baked into the receipt body.                                          |
| 5  | MaterializationError is a typed discriminated union with kinds `verify-failed` \| `artifact-load-failed` \| `envelope-malformed` | VERIFIED | `materialize.ts:58-61` declares the interface with the three locked kinds. `materialize.test.ts:105-122` and `public-surface.test.ts:276-294` both exercise all three discriminator values.                                          |
| 6  | Public surface exports materializeReplayEnvelope (value) and MaterializationError (type) from lattice package root | VERIFIED | `index.ts:24` exports `materializeReplayEnvelope` as value; `:74` exports `MaterializationError` as type via the public-types barrel. `public-surface.test.ts:272-274` asserts `typeof materializeReplayEnvelope === "function"`. |
| 7  | Verify-FIRST ordering: artifact loader not called on verify failure                                                | VERIFIED | Source order in `materialize.ts:118-156`: verifyReceipt at line 120, throws on `!verifyResult.ok` at line 121-128 before the loader loop at line 137. Test asserts `loaderCalls === 0` on tampered input.                          |
| 8  | `pnpm tsc --noEmit && pnpm vitest run` exit 0                                                                       | VERIFIED | `cd packages/lattice && pnpm typecheck` exits 0 (no error output). Full workspace `pnpm vitest run` reports `Test Files 30 passed (30) / Tests 307 passed (307)`.                                                                  |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                                            | Expected                                                                   | Exists | Substantive | Wired | Status   | Details                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------ | ----------- | ----- | -------- | -------------------------------------------------------------------------------------------------- |
| `packages/lattice/src/replay/replay.ts`                              | ReplayEnvelope augmented with optional receipt?/contract? type-only imports | yes    | yes (223 lines) | yes   | VERIFIED | Lines 7 (`import type ReceiptEnvelope`), 2 (`import type CapabilityContract`), 32, 37 add fields. |
| `packages/lattice/src/replay/materialize.ts`                         | materializeReplayEnvelope function and MaterializationError type            | yes    | yes (229 lines) | yes   | VERIFIED | Exports materializeReplayEnvelope and MaterializationError; imported by index.ts and tests.       |
| `packages/lattice/src/replay/materialize.test.ts`                    | Unit + round-trip tests >=120 lines                                        | yes    | yes (221 lines) | n/a   | VERIFIED | Five behavioral tests + discriminator type test all pass.                                          |
| `packages/lattice/src/index.ts`                                     | Public exports for materializeReplayEnvelope + MaterializationError         | yes    | yes (116 lines) | yes   | VERIFIED | Line 24 value export; line 74 type export.                                                         |
| `packages/lattice/src/runtime/public-types.ts`                       | Re-export of MaterializationError type                                     | yes    | yes (140 lines) | yes   | VERIFIED | Lines 74-78 re-export ArtifactLoader, MaterializationError, MaterializeReplayEnvelopeOptions.      |
| `packages/lattice/test/public-surface.test.ts`                       | Assertion that materializeReplayEnvelope is exported and MaterializationError is reachable | yes    | yes (302 lines) | n/a   | VERIFIED | "Phase 10 public surface" block at lines 271-301 exercises both exports.                            |

### Key Link Verification

| From                                              | To                                            | Via                                                  | Status | Details                                                                                          |
| ------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| `packages/lattice/src/replay/materialize.ts`      | `packages/lattice/src/receipts/verify.ts`     | `verifyReceipt(envelope, keySet)` called BEFORE loader | WIRED  | `materialize.ts:41` imports `verifyReceipt`; `:120` invokes before any loader access.            |
| `packages/lattice/src/replay/materialize.ts`      | `packages/lattice/src/replay/replay.ts`       | Returns ReplayEnvelope shape consumed by replayOffline | WIRED  | `materialize.ts:44` `import type { ReplayEnvelope }`; return type at line 118 is `ReplayEnvelope<TOutputs>`. |
| `packages/lattice/src/replay/replay.ts`            | `packages/lattice/src/receipts/types.ts`      | `import type { ReceiptEnvelope }`                    | WIRED  | `replay.ts:7` `import type { ReceiptEnvelope } from "../receipts/types.js";`                     |
| `packages/lattice/src/replay/replay.ts`            | `packages/lattice/src/contract/contract.ts`   | `import type { CapabilityContract }`                 | WIRED  | `replay.ts:2` `import type { CapabilityContract } from "../contract/contract.js";`               |
| `packages/lattice/src/index.ts`                   | `packages/lattice/src/replay/materialize.ts`  | Public value + type export                           | WIRED  | `index.ts:24` value export; `runtime/public-types.ts:74-78` provides type re-exports.            |

### Data-Flow Trace (Level 4)

| Artifact                                                | Data Variable / Output       | Source                                                                                                | Produces Real Data | Status   |
| ------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| `materialize.ts: materializeReplayEnvelope`              | returned `envelope` value     | Real `verifyReceipt` call + real `artifactLoader` invocation + real `createExecutionPlan` constructor | yes                | FLOWING  |
| `materialize.ts: envelope.receipt` field                 | `receipt` input argument      | Passed-through from caller after verification                                                          | yes                | FLOWING  |
| `materialize.ts: envelope.artifacts` array               | `artifactRefs`                | Built from loader outputs via `toArtifactRef`                                                          | yes                | FLOWING  |
| `materialize.ts: envelope.plan.task`                     | `options.task ?? ""`         | Caller-supplied per documented v1.1 limitation                                                         | yes (intentional default behavior) | FLOWING  |

### Behavioral Spot-Checks

| Behavior                                              | Command                                                              | Result                                                  | Status |
| ----------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | ------ |
| TypeScript compiles cleanly                           | `cd packages/lattice && pnpm typecheck`                              | exit 0, no output                                       | PASS   |
| Full vitest suite passes                              | `pnpm vitest run` (workspace root)                                   | `Test Files 30 passed (30) / Tests 307 passed (307)`    | PASS   |
| dist build emits public exports                       | `pnpm build`                                                         | build succeeds; dist/index.d.ts contains both names     | PASS   |
| materializeReplayEnvelope is reachable as a function  | `expect(typeof materializeReplayEnvelope).toBe("function")` (test)   | passes (asserted in public-surface.test.ts:273)         | PASS   |
| Verify-first ordering enforced                        | Tampered receipt + spy loader test                                   | `loaderCalls === 0`; rejection with `kind: "verify-failed"` | PASS   |
| Round-trip outputHash equality                        | createReceipt -> materialize -> replayOffline -> SHA-256 compare     | hashes match in test materialize.test.ts:172-177        | PASS   |

### Requirements Coverage

| Requirement | Source Plan   | Description                                                                                                                                  | Status   | Evidence                                                                                                                                       |
| ----------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| RECEIPT-09  | 10-01-PLAN.md | Receipts embed inside the existing ReplayEnvelope via optional `receipt?` and `contract?` fields, so a receipt is sufficient to materialize an offline replay | SATISFIED | ReplayEnvelope augmented with both optional fields, materializeReplayEnvelope produces a runnable envelope, round-trip outputHash equality holds. |

### Success Criteria Coverage (ROADMAP.md)

| #  | Success Criterion                                                                                                                                                                                          | Status   | Evidence                                                                                                                                                                       |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | `ReplayEnvelope` accepts optional `receipt?` and `contract?` fields and round-trips through `createReplayEnvelope` / `replayOffline` without losing receipt verifiability                                  | VERIFIED | Type fields added in replay.ts:32,37. createReplayEnvelope still compiles and all 307 prior tests pass (additive optional change preserves verifiability path).                |
| 2  | Given only a `CapabilityReceipt` and content-addressed artifact bodies, the runtime can materialize a `ReplayEnvelope` and run `replayOffline(envelope)` to a deterministic result whose output hashes match the receipt | VERIFIED | materialize.test.ts round-trip test (lines 153-178) drives exactly this flow and asserts `replayedOutputHash === outputHash`.                                                  |

### Anti-Patterns Found

| File                                              | Line  | Pattern                                                       | Severity | Impact                                                                          |
| ------------------------------------------------- | ----- | ------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `packages/lattice/src/replay/materialize.ts`      | 159   | Comment "This is intentionally lossy and matches the v1.1 limitation" | Info     | Documented v1.1 limitation per CONTEXT.md; receipt body cannot reconstruct full plan. Not a stub. |
| `packages/lattice/src/replay/materialize.ts`      | 137-143 | Skips empty-hash slots in `body.inputHashes`                  | Info     | Documented as Phase 9 contract (unfingerprintable values emit ""). Captured in SUMMARY decisions. |

No blockers. No console.log stubs. No placeholder returns. No hardcoded empty data flowing to user-visible output. All "empty defaults" are tied to caller-supplied options per documented v1.1 limitation.

### Plan vs Implementation Deviation (Documented)

| Aspect                              | Plan Specification                                                              | Implementation                                                                                            | Disposition                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `MaterializationError` shape         | `class MaterializationError extends Error` with `cause` field                  | Plain discriminated union object `{ kind, message }` thrown via `fail(...)` helper                        | SUMMARY documents this as a Key Decision: matches existing codebase pattern (VerifyResult, LatticeRunError). All goal-level behaviors still hold: typed kind discriminator, callers pattern-match on `kind`, no untyped throws. |

### Human Verification Required

None. All assertions in this phase are programmatically verifiable through the vitest suite, typecheck, and build commands. No UI/visual/real-time/external-service surface area exists.

### Gaps Summary

No gaps. The phase delivers all eight stated must-haves and both ROADMAP success criteria. The single deviation from the PLAN (MaterializationError as plain object vs Error subclass) is explicitly documented in 10-01-SUMMARY.md "Key Decisions Made" and does not weaken any locked behavior: kind discriminator works, three locked kinds are exposed, callers can pattern-match, and tests assert all three error paths.

---

_Verified: 2026-05-11T17:26:30Z_
_Verifier: Claude (gsd-verifier)_
