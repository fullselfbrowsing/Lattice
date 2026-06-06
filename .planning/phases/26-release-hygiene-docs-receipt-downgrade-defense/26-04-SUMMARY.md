---
phase: 26-release-hygiene-docs-receipt-downgrade-defense
plan: 04
subsystem: receipts
tags: [security, crypto, verifier, downgrade-defense, crypto-01]
requires:
  - packages/lattice/src/receipts/types.ts (VerifyErrorKind union)
  - packages/lattice/src/receipts/verify.ts (verifyReceipt function)
  - packages/lattice/src/receipts/receipt.ts (createReceipt function)
provides:
  - VerifyErrorKind literal "schema-version-too-low"
  - Receipt-downgrade rejection branch at step 4 of verifyReceipt decision tree
  - createReceipt always emits lattice-receipt/v1.1 (collapsed version heuristic)
affects:
  - packages/lattice/src/receipts/verify.ts
  - packages/lattice/src/receipts/types.ts
  - packages/lattice/src/receipts/receipt.ts
  - packages/lattice/src/receipts/verify.test.ts
  - packages/lattice/src/receipts/receipt.test.ts
tech-stack:
  added: []
  patterns:
    - "Typed VerifyErrorKind union extension (additive, non-breaking for exhaustive switches with default)"
    - "Short-circuit rejection branch before any cryptographic work (defense-in-depth ordering)"
    - "Test pattern: hand-craft envelope with canonicalize + base64 + buildPae + signer.sign"
key-files:
  created: []
  modified:
    - packages/lattice/src/receipts/types.ts
    - packages/lattice/src/receipts/verify.ts
    - packages/lattice/src/receipts/receipt.ts
    - packages/lattice/src/receipts/verify.test.ts
    - packages/lattice/src/receipts/receipt.test.ts
decisions:
  - "Always-v1.1 createReceipt (collapsed the version-bump heuristic) because v1 receipts can no longer pass verifyReceipt"
  - "Downgrade branch placed AFTER asReceiptBody and BEFORE keyset lookup so the verdict short-circuits before any cryptographic work"
  - "Test A allows EITHER schema-version-too-low OR version-mismatch since asReceiptBody already gates the version-absent case structurally"
metrics:
  duration: "~12 minutes wall clock"
  completed: "2026-06-06"
  tasks_planned: 3
  tasks_executed: 3
  deviations_applied: 1
  tests_before: 733
  tests_after: 736
requirements: [CRYPTO-01]
---

# Phase 26 Plan 04: Receipt-Downgrade Defense (CRYPTO-01) Summary

One-liner: Harden verifyReceipt against the Radicle 2026-03 style receipt-downgrade attack by adding a schema-version-too-low rejection branch that short-circuits before any cryptographic work, and collapse createReceipt's version heuristic to always emit lattice-receipt/v1.1 so the codebase no longer mints unverifiable receipts.

## Objective

Cover CRYPTO-01 by landing the actual defense the SECURITY.md writeup (Plan 26-01) describes. The threat: an attacker holding a valid signing key mints a v1-shaped receipt body and submits it to a v1.1 verifier; without the defense, the signature verifies and the v1.1 step-marker integrity surface is bypassed. The defense: a typed rejection branch at step 4 of the decision tree that fires before keyset lookup, canonicalization re-check, or signature verification.

## Tasks Executed

### Task 1: Extend VerifyErrorKind union with "schema-version-too-low"

- Modified `packages/lattice/src/receipts/types.ts`.
- Added the seventh union member to `VerifyErrorKind` as a literal string.
- Purely additive change; existing six members unchanged.
- Verification: `grep -q '"schema-version-too-low"'` matches; typecheck passes.
- Commit: `b4d9a1b feat(26-04): extend VerifyErrorKind union with schema-version-too-low`.

### Task 2: Add the schema-version-too-low rejection branch to verifyReceipt

- Modified `packages/lattice/src/receipts/verify.ts`.
- Inserted a new branch AFTER the structural shape check (`asReceiptBody`) and BEFORE the keyset lookup. Condition: `body.version === undefined || body.version === "lattice-receipt/v1"`. Returns `fail("schema-version-too-low", ...)`.
- Renumbered downstream step comments to keep the decision tree honest: keyset lookup is now step 5, canonical re-check is step 6, signature verify is step 7, body.kid defense-in-depth is step 8, success is step 9.
- Updated the docstring decision-tree block to reflect the new ordering (step 4 carries the CRYPTO-01 disposition).
- Defense-in-depth: the `body.version === undefined` clause is statically unreachable today because `asReceiptBody` already rejects version-absent bodies at the structural gate, but it survives future schema-shape relaxations.
- Commit: `dd058e3 feat(26-04): add receipt-downgrade rejection branch to verifyReceipt (CRYPTO-01)`.

### Task 3: Add three tests to verify.test.ts

- Modified `packages/lattice/src/receipts/verify.test.ts`.
- Appended a new `describe("verify.ts — schema-version-too-low downgrade defense (CRYPTO-01)", ...)` block with three tests:
  - Test A: hand-crafts a body with the version field stripped (via `Omit + spread`), signs it under a real Ed25519 KeySet, asserts rejection. Accepts EITHER `schema-version-too-low` OR `version-mismatch` (the structural gate today returns the latter; both outcomes prove rejection).
  - Test B: hand-crafts a body with the legacy `"lattice-receipt/v1"` literal, signs under a real KeySet, strictly asserts `kind === "schema-version-too-low"`. Proves the branch short-circuits before signature verification.
  - Test C (positive control): mints a v1.1 receipt via `createReceipt` with `stepName + stepIndex`, asserts `ok === true` and body.version === "lattice-receipt/v1.1". Regression guard.
- Verification: `verify.test.ts` now runs 18 tests (was 15, +3 new); all pass.
- Commit: `81b0de6 test(26-04): cover schema-version-too-low downgrade defense (CRYPTO-01)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cascading regression: every existing test that minted a v1 receipt and verified it broke once the downgrade branch landed.**

- Found during: Task 2 verification.
- Issue: After adding the downgrade rejection branch, running the lattice test suite showed 25 failing tests across 5 files (verify.test.ts, receipt.test.ts, checkpoint.test.ts, survivability.test.ts, create-ai.test.ts) plus the entire lattice-cli verify/repro fixture surface. Root cause: `createReceipt` had a version-bump heuristic that emitted `"lattice-receipt/v1"` when no step-marker fields were set, which was the default path for `createAI` in `create-ai.ts` and for `minimalInput()` test fixtures. After the defense lands, these receipts are unverifiable by their own runtime.
- Fix: Modified `packages/lattice/src/receipts/receipt.ts` to ALWAYS emit `"lattice-receipt/v1.1"`. The heuristic was collapsed; the version constant became a literal. Justification: v1 receipts can no longer pass `verifyReceipt`, so minting them is a guaranteed footgun. v1.1 receipts accept absent step-marker fields, so the schema is backward-compatible at the body shape level.
- Cascade: updated two tests to match the new always-v1.1 behavior:
  - `receipt.test.ts` line 358: "mints v1 receipt (backward compat) when no step-marker fields are set" renamed and updated to "mints v1.1 receipt by default even when no step-marker fields are set (Phase 26 CRYPTO-01)". Assertion changed from `v1` to `v1.1`.
  - `verify.test.ts` line 71: happy-path assertion changed from `v1` to `v1.1` with a comment citing Phase 26.
  - `verify.test.ts` line 265: the body.kid mismatch test (defense-in-depth) hand-crafts a body with `version: "lattice-receipt/v1"`. Updated to `v1.1` so the test still reaches the body.kid check at step 8 instead of being rejected at step 4. Added a comment explaining the change.
- Files modified: `receipt.ts`, `receipt.test.ts`, `verify.test.ts`.
- Commit: `09c8321 fix(26-04): collapse createReceipt version heuristic to always v1.1 (CRYPTO-01)`.
- Result: 733 baseline tests preserved; 3 new tests added; 736 total pass.

## Verification

- `grep -q '"schema-version-too-low"' packages/lattice/src/receipts/types.ts` matches (1 occurrence).
- `grep -q 'fail(' packages/lattice/src/receipts/verify.ts` includes the `"schema-version-too-low"` call.
- `grep -q 'body.version === undefined' packages/lattice/src/receipts/verify.ts` matches.
- `grep -q 'body.version === "lattice-receipt/v1"' packages/lattice/src/receipts/verify.ts` matches.
- `pnpm --filter @fullselfbrowsing/lattice typecheck` passes.
- `pnpm --filter @fullselfbrowsing/lattice-cli typecheck` passes.
- `pnpm -r test` passes: 592 lattice + 144 lattice-cli = 736 tests across 64 test files (up from 733/64; +3 from the new describe block).

## Test Count Delta

| Package | Before | After | Delta |
|---------|--------|-------|-------|
| @fullselfbrowsing/lattice | 589 | 592 | +3 |
| @fullselfbrowsing/lattice-cli | 144 | 144 | 0 |
| Total | 733 | 736 | +3 |

The new tests live in `packages/lattice/src/receipts/verify.test.ts` under the new describe block `"verify.ts — schema-version-too-low downgrade defense (CRYPTO-01)"`.

## Security Disposition

| Threat ID | Category | Disposition | Mitigation Status |
|-----------|----------|-------------|-------------------|
| T-26-01 | Spoofing (attacker-minted v1 body with valid key) | mitigate | LANDED. Step 4 rejection branch fires before keyset lookup; signature never verifies. |
| T-26-02 | Tampering (version field stripped to suppress invariants) | mitigate | LANDED. asReceiptBody catches structurally; downgrade branch is belt-and-suspenders for future schema relaxations. |
| T-26-03 | Information Disclosure (error message reveals logic) | accept | Error message names the required literal `lattice-receipt/v1.1` and the CRYPTO-01 reference; no keys or signatures leak. |
| T-26-04 | DoS (crafted receipt crashes verifier) | accept | Verifier remains throw-free across the verification boundary; the new branch is a pure conditional + fail. |

## Key Decisions Made

1. Always-v1.1 createReceipt: collapsed the version-bump heuristic in `receipt.ts` because v1 receipts can no longer pass verification; minting them would produce instantly-broken artifacts. Justified by CRYPTO-01 framing and the requirement that existing tests continue to pass.

2. Downgrade branch insertion point: between `asReceiptBody` (step 3) and keyset lookup (step 5). This satisfies D-15's "short-circuit before any cryptographic work" requirement (keyset.lookup is a pure map read; the actual crypto begins at verifyEd25519Signature at step 7).

3. Test A allows either verdict: `schema-version-too-low` OR `version-mismatch`. The structural gate (`asReceiptBody`) catches version-absent bodies first today, but the defense-in-depth clause in step 4 is the contract surface per D-15. Test honesty: assert what the runtime actually returns while proving the codebase rejects the input.

## Known Stubs

None.

## Threat Flags

None. The change reduces the threat surface; it does not introduce new network endpoints, auth paths, or schema-shape changes at trust boundaries.

## Self-Check: PASSED

Verified:

- FOUND: packages/lattice/src/receipts/types.ts (modified, contains schema-version-too-low literal).
- FOUND: packages/lattice/src/receipts/verify.ts (modified, contains the rejection branch).
- FOUND: packages/lattice/src/receipts/receipt.ts (modified, always emits v1.1).
- FOUND: packages/lattice/src/receipts/verify.test.ts (modified, contains the new CRYPTO-01 describe block with 3 tests).
- FOUND: packages/lattice/src/receipts/receipt.test.ts (modified, updated v1 -> v1.1 assertion).
- FOUND commit b4d9a1b in git log.
- FOUND commit dd058e3 in git log.
- FOUND commit 09c8321 in git log.
- FOUND commit 81b0de6 in git log.
- Test counts confirmed: 592 lattice + 144 lattice-cli = 736 (baseline 733 preserved + 3 new).
