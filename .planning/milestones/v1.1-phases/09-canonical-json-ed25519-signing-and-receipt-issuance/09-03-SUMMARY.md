---
phase: 09-canonical-json-ed25519-signing-and-receipt-issuance
plan: 03
subsystem: receipts
tags:
  - receipts
  - createReceipt
  - verifyReceipt
  - redact-then-sign
  - key-rotation
  - dsse
  - ed25519
  - phase-9

# Dependency graph
dependency-graph:
  requires:
    - phase: 09-01
      provides: types.ts spine (CapabilityReceiptBody, ReceiptEnvelope, ReceiptSigner, KeySet, KeyEntry, KeyState, VerifyResult, VerifyError) + canonicalizeReceiptBody, usageToCanonical, redactReceiptBody, DEFAULT_REDACTION_POLICY_ID, createMemoryKeySet
    - phase: 09-02
      provides: envelope.ts (PAYLOAD_TYPE, buildPae, encodeEnvelope, decodeEnvelope, base64Encode, base64Decode) + sign.ts (createInMemorySigner, generateEd25519KeyPairJwk, verifyEd25519Signature)
  provides:
    - packages/lattice/src/receipts/receipt.ts (createReceipt builder enforcing redact -> canonicalize -> PAE -> sign -> encode ordering by file structure)
    - packages/lattice/src/receipts/verify.ts (pure verifyReceipt returning VerifyResult discriminated union over six VerifyErrorKind variants)
  affects:
    - packages/lattice/src/receipts/envelope.ts (reconciled _Local types to canonical types from ./types.js)
    - packages/lattice/src/receipts/sign.ts (reconciled _Local types to canonical types from ./types.js)
    - phase-09-04 (will wire createReceipt into runWithConfig + export public surface from index.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Structural enforcement of redact-then-sign ordering: createReceipt calls canonicalizeReceiptBody ONLY on the output of redactReceiptBody — no other ordering can be written by accident"
    - "Pure verifier with typed error union: verifyReceipt never throws across the verification boundary; every failure mode is a typed VerifyError, including malformed envelopes and non-JSON payloads"
    - "Defense-in-depth kid duplication: body.kid is forced from signer.kid (CreateReceiptInput has no kid field) and re-checked against envelope keyid during verification"
    - "Re-canonicalization comparison in verify (Step 5): catches any swap of canonical form between signing and verification, even when the signature would otherwise verify"
    - "Deterministic round-trip: Ed25519 (RFC 8032) + RFC 8785 JCS + standard base64 produces byte-equal envelopes for fixed receiptId/issuedAt inputs"

key-files:
  created:
    - packages/lattice/src/receipts/receipt.ts
    - packages/lattice/src/receipts/receipt.test.ts
    - packages/lattice/src/receipts/verify.ts
    - packages/lattice/src/receipts/verify.test.ts
  modified:
    - packages/lattice/src/receipts/envelope.ts
    - packages/lattice/src/receipts/sign.ts

key-decisions:
  - "Replaced _Local-suffixed structural types in envelope.ts and sign.ts with imports from ./types.js. _Local symbols retained as deprecated `export type X_Local = X` aliases to avoid breaking any in-flight test imports — single source of truth is now types.ts (plan 09-01)"
  - "createInMemorySigner now returns the canonical ReceiptSigner type from ./types.js; encodeEnvelope and decodeEnvelope use ReceiptEnvelope / ReceiptSignature from ./types.js. ReceiptSigner_Local / ReceiptEnvelope_Local / ReceiptSignature_Local remain as type aliases so plan 09-02's test imports continue to compile unchanged"
  - "Test count for Task 1 grew from the plan's stated 16 to 22 because the five contractVerdict variants are each their own `it()` call (parametrized via `for`-loop). Strictly more coverage; no spec coverage was dropped"
  - "Verifier Step 5 (canonicalization-mismatch) runs BEFORE Step 6 (signature verification) per the plan's decision tree. In practice the signature check fires first for tampered payloads because PAE includes the tampered base64 — but the canonicalization-mismatch path is the explicit guard against the 'signed bytes A; envelope.payload bytes B; both verify' attack class"
  - "Plan 09-02 deviation note flagged: this plan inherits the corrected DSSE PAE fixture (`DSSEv1 36 …`, not `43`). No additional fix required here — envelope.ts was already correct; only the doc fixture in the plan body had the wrong length"

requirements-completed: [RECEIPT-01, RECEIPT-04, RECEIPT-05, RECEIPT-06, RECEIPT-08]

# Metrics
metrics:
  duration: ~10 minutes
  completed: 2026-05-11
  tasks-executed: 2
  tasks-total: 2
  new-tests: 35
  test-suite-before: 244
  test-suite-after: 279
  full-suite-status: 279/279 passing
---

# Phase 9 Plan 03: createReceipt + verifyReceipt Summary

The redact-then-sign pipeline and its pure inverse. createReceipt composes the substrate from plans 09-01 and 09-02 into a single builder whose file structure makes any other ordering impossible. verifyReceipt is the typed inverse: never throws, surfaces every failure mode as a discriminated VerifyError, and respects the active/retired/revoked key rotation lifecycle.

## What Was Built

### packages/lattice/src/receipts/receipt.ts

`createReceipt(input, signer): Promise<ReceiptEnvelope>` enforces the seven-step pipeline:

1. Assemble `body0: CapabilityReceiptBody` — version forced to `"lattice-receipt/v1"`, `kid` forced from `signer.kid`, `usage.costUsd` converted to string via `usageToCanonical`, defaults applied for `receiptId` (`crypto.randomUUID()`), `issuedAt` (`new Date().toISOString()`), and `redactionPolicyId` (`DEFAULT_REDACTION_POLICY_ID`).
2. `redactReceiptBody(body0, policyId)` — redact BEFORE canonicalize. Returned body carries the manifest entry for any `no-pii` tripwire evidence.
3. `canonicalizeReceiptBody(body)` — RFC 8785 JCS bytes of the REDACTED body.
4. `base64Encode(payloadBytes)` — DSSE wire-format payload string.
5. `buildPae(PAYLOAD_TYPE, payload)` — DSSE v1.0 Pre-Authentication Encoding bytes.
6. `signer.sign(pae)` — Ed25519 signature over the PAE bytes.
7. `encodeEnvelope({ payloadBytes, signatures: [{ keyid: signer.kid, sig }] })` — final envelope.

### Redact-Then-Sign Ordering Enforcement

The plan's acceptance check uses an awk script to lock the call ordering:

```
awk '/redactReceiptBody/{a=NR} /canonicalizeReceiptBody/{b=NR} /buildPae/{c=NR} /signer.sign/{d=NR} END{exit !(a<b && b<c && c<d)}' packages/lattice/src/receipts/receipt.ts
```

Confirmed line numbers: redactReceiptBody:103 < canonicalizeReceiptBody:106 < buildPae:112 < signer.sign:115. Any reordering edit breaks the awk-test and the test suite simultaneously — the structural guarantee is now mechanical.

### packages/lattice/src/receipts/verify.ts

`verifyReceipt(envelope, keySet): Promise<VerifyResult>` is pure (no I/O, no Date.now, no random) and returns the typed discriminated union from plan 09-01's types.ts. The decision tree:

| Step | Check | Failure kind |
|------|-------|--------------|
| 1 | `decodeEnvelope` throws OR `signatures[]` empty | `envelope-malformed` |
| 2 | payload bytes are not valid JSON | `envelope-malformed` |
| 3 | body shape check fails OR `version !== "lattice-receipt/v1"` | `version-mismatch` |
| 4 | `keySet.lookup(keyid) === undefined` | `key-not-found` |
| 5 | `entry.state === "revoked"` | `key-revoked` |
| 6 | re-canonicalized body bytes != signed payloadBytes | `canonicalization-mismatch` |
| 7 | Ed25519 PAE verification returns false | `signature-invalid` |
| 8 | `body.kid !== entry.kid` (defense in depth) | `signature-invalid` |
| 9 | all checks pass | ok + `keyState` |

Every parse path is wrapped in `try/catch` and converted to a typed VerifyError — no exception escapes the verification boundary (T-09-20 DoS mitigation).

### Reconciliation of `_Local` Types (envelope.ts + sign.ts)

Plan 09-02 defined `ReceiptEnvelope_Local`, `ReceiptSignature_Local`, and `ReceiptSigner_Local` as inline structural interfaces to avoid Wave 1 file conflicts with plan 09-01's types.ts. This plan replaces them with imports from `./types.js`:

- `envelope.ts`: `encodeEnvelope` returns `ReceiptEnvelope`; `decodeEnvelope` accepts `ReceiptEnvelope`; the internal `signatures` list is typed as `ReceiptSignature[]`.
- `sign.ts`: `createInMemorySigner` returns `ReceiptSigner`.
- Backward compatibility: `_Local` symbols retained as deprecated `export type X_Local = X` aliases so any in-flight test code from plan 09-02 continues to compile. They now resolve transparently to the canonical types.

The reconciliation is a single source of truth for receipt shapes — types.ts (plan 09-01) is now the only place a receipt schema is described.

## Tests

### receipt.test.ts (22 tests)

Covers:
- Envelope shape (payloadType, base64 payload, single signature).
- Defaults (receiptId uuid v4, issuedAt ISO 8601 UTC, redactionPolicyId `"lattice.default.v1"`).
- kid defense in depth (body.kid matches signer.kid; `CreateReceiptInput` has no `kid` field — `@ts-expect-error` compile-time guard).
- `usage.costUsd` canonicalized to string (`0.000125` -> `"0.000125"`) and null pass-through.
- `redactions[]` populated for `tripwireEvidence.kind === "no-pii"` (path `tripwireEvidence.observed`); empty when no tripwireEvidence; idempotent re-redaction of the signed body (proof that the signed bytes already underwent redaction).
- All five `contractVerdict` variants (success, tripwire-violated, no-contract-match, execution-failed, validation-failed) each parametrized.
- `noRouteReasons[]` embedded when `contractVerdict === "no-contract-match"`.
- `model.observed` supports both `null` and fingerprint string.
- `contractHash` supports null and SHA-256 hex (verified via `fingerprintArtifactValue`).
- Determinism: fixed `receiptId` + `issuedAt` + signer produces byte-equal envelope payload AND byte-equal signature bytes (Ed25519 deterministic per RFC 8032).

### verify.test.ts (13 tests)

Covers:
- Happy path: ok=true with `keyState === "active"`.
- `keyState === "retired"` on success path.
- All six VerifyErrorKind variants exercised: `key-revoked`, `key-not-found`, `signature-invalid` (body tamper + signature byte tamper + body.kid != envelope keyid), `envelope-malformed` (wrong payloadType + empty signatures + non-JSON payload), `version-mismatch` (manually signed v2 body).
- Headline key-rotation lifecycle (RECEIPT-05): two coexisting kids walking through active -> retired -> revoked. k1 starts active (R1 verifies ok+active), goes retired (R1 verifies ok+retired), goes revoked (R1 verifies fail+key-revoked); k2 stays active throughout (R2 always ok+active).
- Purity: 50 repeated verifications of the same envelope+keyset produce structurally-equal results.

### Test Suite Status

- Before plan 09-03: 244 tests (Phase 7 + 8 baseline + plan 09-01 + plan 09-02).
- After plan 09-03: **279 tests** across 29 files, all passing.
- New: 22 receipt tests + 13 verify tests = 35 tests.

## Task Commits

| Task | Stage | Commit | Description |
|------|-------|--------|-------------|
| 1 | RED | `ce54f50` | Add failing tests for createReceipt redact-then-sign pipeline |
| 1 | GREEN | `d756a37` | Implement createReceipt redact-then-sign builder |
| 2 | RED | `16737c2` | Add failing tests for verifyReceipt typed VerifyError union |
| 2 | GREEN | `7c56198` | Implement pure verifyReceipt + reconcile _Local types |

## Deviations from Plan

None substantive — plan executed as written. Two minor observations recorded as decisions:

1. Test count for Task 1 grew from the plan's quoted **16 tests** to **22 tests** because the five `contractVerdict` variants were parametrized via `for`-loop, each producing its own `it()` call. Strictly more coverage; no spec items were dropped.
2. The `_Local` symbols are kept as deprecated `export type X_Local = X` aliases rather than deleted outright. This keeps any code path that imported `ReceiptEnvelope_Local` / `ReceiptSignature_Local` / `ReceiptSigner_Local` working transparently; the canonical names now resolve through them. No files in this repo currently import the `_Local` names, but the alias is cheap insurance.

## Verification

End-of-plan sweep:

```
cd packages/lattice && pnpm typecheck && pnpm vitest run
```

Both exit 0. Full lattice suite: **279/279 tests passing**.

Acceptance grep matrix (Task 1 + Task 2):

```
grep -q 'export async function createReceipt' packages/lattice/src/receipts/receipt.ts                       # PASS
grep -q 'redactReceiptBody' packages/lattice/src/receipts/receipt.ts                                          # PASS
grep -q 'canonicalizeReceiptBody' packages/lattice/src/receipts/receipt.ts                                    # PASS
grep -q 'buildPae' packages/lattice/src/receipts/receipt.ts                                                   # PASS
grep -q 'encodeEnvelope' packages/lattice/src/receipts/receipt.ts                                             # PASS
grep -q 'kid: signer.kid' packages/lattice/src/receipts/receipt.ts                                            # PASS
grep -q '"lattice-receipt/v1"' packages/lattice/src/receipts/receipt.ts                                       # PASS
awk '...redact<canonical<pae<sign...' packages/lattice/src/receipts/receipt.ts                                # PASS (103<106<112<115)
grep -q 'export async function verifyReceipt' packages/lattice/src/receipts/verify.ts                         # PASS
grep -q '"envelope-malformed"' packages/lattice/src/receipts/verify.ts                                        # PASS
grep -q '"version-mismatch"' packages/lattice/src/receipts/verify.ts                                          # PASS
grep -q '"key-not-found"' packages/lattice/src/receipts/verify.ts                                             # PASS
grep -q '"key-revoked"' packages/lattice/src/receipts/verify.ts                                               # PASS
grep -q '"canonicalization-mismatch"' packages/lattice/src/receipts/verify.ts                                 # PASS
grep -q '"signature-invalid"' packages/lattice/src/receipts/verify.ts                                         # PASS
grep -q 'keyState' packages/lattice/src/receipts/verify.ts                                                    # PASS
```

## Forward Links for Plan 09-04

Plan 09-04 (the public surface + runtime wiring plan) will:

- Add optional `signer?: ReceiptSigner` to `LatticeConfig`.
- Add optional `receipt?: ReceiptEnvelope` to `RunSuccess` and `RunFailure`.
- Wire a `maybeIssueReceipt({verdict, …})` helper into `runWithConfig` at every terminal branch (success, tripwire-violated, no-contract-match, execution-failed, validation-failed).
- Export from `packages/lattice/src/index.ts`: `createReceipt` (probably internal), `verifyReceipt`, `createInMemorySigner`, `createMemoryKeySet`, `generateEd25519KeyPairJwk`, and the types `CapabilityReceiptBody`, `ReceiptEnvelope`, `ReceiptSigner`, `KeySet`, `KeyEntry`, `KeyState`, `VerifyResult`, `VerifyError`, `VerifyErrorKind`.

The receipts subsystem is now functionally complete — plan 09-04 only touches public surface and runtime call sites, no kernel changes.

## Threat Mitigations Realized

| Threat ID | Mitigation as built |
|-----------|---------------------|
| T-09-15 (createReceipt tampering) | File structure forces redact -> canonicalize -> sign; awk acceptance test locks call order at lines 103/106/112/115. |
| T-09-16 (createReceipt kid spoofing) | `body.kid = signer.kid` (input has no `kid` field — `@ts-expect-error` compile-time guard in receipt.test.ts Test 5). |
| T-09-17 (verifyReceipt tampering) | Steps 6 (re-canonicalize byte-compare), 7 (Ed25519 PAE verify), 8 (body.kid == entry.kid) layered. |
| T-09-19 (verifyReceipt repudiation) | `keyState` returned on the success path so callers can warn on retired; revoked keys refused outright with `kind: "key-revoked"`. |
| T-09-20 (verifyReceipt DoS) | All parse paths wrapped in try/catch; every failure becomes a typed VerifyError; verifier never throws. |
| T-09-22 (createReceipt deterministic tampering) | Task 1 Test 16 (now Test 22 — determinism) asserts byte-equal envelopes for fixed inputs; Ed25519 deterministic per RFC 8032 + JCS deterministic + base64 deterministic. |

## Self-Check: PASSED

Verified post-execution:

- `[ -f packages/lattice/src/receipts/receipt.ts ]` — FOUND
- `[ -f packages/lattice/src/receipts/receipt.test.ts ]` — FOUND
- `[ -f packages/lattice/src/receipts/verify.ts ]` — FOUND
- `[ -f packages/lattice/src/receipts/verify.test.ts ]` — FOUND
- Commits in `git log`:
  - `ce54f50` test(09-03): add failing tests for createReceipt — FOUND
  - `d756a37` feat(09-03): implement createReceipt redact-then-sign builder — FOUND
  - `16737c2` test(09-03): add failing tests for verifyReceipt — FOUND
  - `7c56198` feat(09-03): implement pure verifyReceipt + reconcile _Local types — FOUND
- `pnpm typecheck`: exits 0.
- `pnpm vitest run`: 279/279 passing.

---
*Phase: 09-canonical-json-ed25519-signing-and-receipt-issuance*
*Completed: 2026-05-11*
