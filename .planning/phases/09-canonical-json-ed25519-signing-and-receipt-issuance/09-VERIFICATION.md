---
phase: 09-canonical-json-ed25519-signing-and-receipt-issuance
verified: 2026-05-11T17:15:00Z
status: passed
score: 12/12 must-haves verified
overrides_applied: 0
---

# Phase 9: Canonical JSON, Ed25519 Signing, and Receipt Issuance Verification Report

**Phase Goal:** Every `ai.run` (success or failure) issues a `CapabilityReceipt` that is RFC 8785-canonicalized, signed over the redacted form with Node 24 WebCrypto Ed25519 in a DSSE-shaped envelope, carries `kid` plus model.observed fingerprint, and can be verified by a pure `verifyReceipt` against a `KeySet`.
**Verified:** 2026-05-11T17:15:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `canonicalize@3.0.0` is a runtime dep, `@noble/ed25519@3.1.0` is a devDep only | VERIFIED | package.json:42-51 confirms `canonicalize` in `dependencies` and `@noble/ed25519` in `devDependencies`; pnpm-workspace.yaml pins `canonicalize: 3.0.0` and `@noble/ed25519: 3.1.0`; node_modules report exact versions 3.0.0 and 3.1.0 |
| 2 | RFC 8785 golden vectors guard against JCS drift | VERIFIED | canonical.test.ts ships 9 golden vector tests (per 09-01-SUMMARY); 17 total tests in file all pass |
| 3 | DSSE PAE built with payloadType `application/vnd.lattice.receipt+json` | VERIFIED | envelope.ts:31 defines `PAYLOAD_TYPE = "application/vnd.lattice.receipt+json"`; envelope.ts:57-71 implements DSSE v1.0 PAE format; envelope.test.ts:48 asserts byte-equality against `"DSSEv1 36 application/vnd.lattice.receipt+json 4 e30="` |
| 4 | Ed25519 via Node 24 WebCrypto `crypto.subtle` with algorithm `"Ed25519"` | VERIFIED | sign.ts:25 `const ALG = "Ed25519"`; uses `crypto.subtle.importKey`, `crypto.subtle.generateKey`, `crypto.subtle.sign`, `crypto.subtle.verify` |
| 5 | `@noble/ed25519` parity oracle test (sign with WebCrypto, sign with noble, assert byte-equal) | VERIFIED | sign.test.ts:1 imports `@noble/ed25519`; sign.test.ts:127-145 implements parity oracle test |
| 6 | Redact-then-sign ordering enforced: signed digest commits to `canonicalize(redact(body))` | VERIFIED | receipt.ts line ordering verified: redactReceiptBody:103 < canonicalizeReceiptBody:106 < buildPae:112 < signer.sign:115 (awk check passes) |
| 7 | `kid` duplicated in signed body AND envelope; `KeySet` supports active/retired/revoked | VERIFIED | types.ts:43-58 (CapabilityReceiptBody.kid); types.ts:78 (KeyState = active/retired/revoked); receipt.ts:83,121 (body.kid and envelope.keyid both from signer.kid); keyset.ts implements createMemoryKeySet |
| 8 | Pure `verifyReceipt` with VerifyError union of 6 kinds | VERIFIED | verify.ts is async/pure (no Date.now, no random, no I/O); types.ts:90-96 defines exactly 6 VerifyErrorKind variants (key-not-found, key-revoked, canonicalization-mismatch, signature-invalid, envelope-malformed, version-mismatch); all 6 used in verify.ts |
| 9 | `LatticeConfig.signer?` optional and `RunSuccess.receipt?`/`RunFailure.receipt?` optional | VERIFIED | config.ts:24 (LatticeConfig.signer?: ReceiptSigner), config.ts:36 (NormalizedLatticeConfig.signer?); result.ts:21 (RunSuccess.receipt?: ReceiptEnvelope), result.ts:36 (RunFailure.receipt?: ReceiptEnvelope) |
| 10 | Receipts emitted on BOTH success AND failure when signer configured | VERIFIED | create-ai.ts has 6 `await maybeIssueReceipt` calls at lines 166, 335, 411, 497, 537, 575 covering: no-contract-match/no-route, validation-failed, tripwire-violated, success, no executable adapter, provider_execution all-failed |
| 11 | `createReceipt` is internal (NOT exported); `verifyReceipt` IS exported | VERIFIED | index.ts:11-16 exports `createMemoryKeySet`, `createInMemorySigner`, `generateEd25519KeyPairJwk`, `verifyReceipt`; `grep -c createReceipt dist/index.d.ts` returns 0; public-surface.test.ts:223-226 asserts `"createReceipt" in mod === false` |
| 12 | All checks pass: typecheck, full vitest suite, build | VERIFIED | `pnpm tsc --noEmit` exits 0; `pnpm vitest run` reports 298/298 tests passing across 29 test files; `pnpm build` produces dist/index.{js,d.ts} with 47.83 kB of type defs containing all Phase 9 type names |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| packages/lattice/src/receipts/types.ts | Type spine (CapabilityReceiptBody, ReceiptEnvelope, ReceiptSigner, KeySet, KeyEntry, KeyState, VerifyResult, VerifyError) | VERIFIED | 115 lines, all required types present with literal-typed wire constants |
| packages/lattice/src/receipts/canonical.ts | canonicalizeReceiptBody, usageToCanonical, stringifyCostUsd | VERIFIED | 60 lines; imports `canonicalize` from "canonicalize" |
| packages/lattice/src/receipts/redact.ts | redactReceiptBody, DEFAULT_REDACTION_POLICY_ID | VERIFIED | 73 lines; default policy id "lattice.default.v1" |
| packages/lattice/src/receipts/keyset.ts | createMemoryKeySet | VERIFIED | 29 lines; KeySet with lookup-only surface |
| packages/lattice/src/receipts/envelope.ts | PAYLOAD_TYPE, buildPae, encodeEnvelope, decodeEnvelope, base64 helpers | VERIFIED | 122 lines; PAYLOAD_TYPE constant matches; DSSE v1.0 PAE |
| packages/lattice/src/receipts/sign.ts | createInMemorySigner, verifyEd25519Signature, generateEd25519KeyPairJwk, JWK importers | VERIFIED | 115 lines; uses crypto.subtle with "Ed25519" |
| packages/lattice/src/receipts/receipt.ts | createReceipt (redact-then-sign pipeline) | VERIFIED | 124 lines; ordering verified by line numbers 103<106<112<115 |
| packages/lattice/src/receipts/verify.ts | verifyReceipt (pure, typed VerifyError union) | VERIFIED | 153 lines; all 6 error kinds discriminated; never throws |
| packages/lattice/src/runtime/config.ts | LatticeConfig.signer? + NormalizedLatticeConfig.signer? | VERIFIED | line 24 + line 36 + normalizeConfig line 66 |
| packages/lattice/src/results/result.ts | RunSuccess.receipt? + RunFailure.receipt? | VERIFIED | lines 21, 36 |
| packages/lattice/src/runtime/create-ai.ts | maybeIssueReceipt + 6 terminal-branch insertions | VERIFIED | helper at line 956; 6 await sites at lines 166, 335, 411, 497, 537, 575 |
| packages/lattice/src/index.ts | Phase 9 public surface exports | VERIFIED | lines 11-16 (4 value exports); type-export block includes all 17 Phase 9 type names |
| packages/lattice/test/public-surface.test.ts | Phase 9 public surface test block | VERIFIED | "Phase 9 public surface" describe block at line 191 with 6 tests |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| package.json#dependencies | canonicalize@3.0.0 | catalog: protocol | WIRED | Verified at exact version 3.0.0 in node_modules |
| package.json#devDependencies | @noble/ed25519@3.1.0 | catalog: protocol | WIRED | Verified at exact version 3.1.0 in node_modules |
| receipt.ts | redact.ts -> canonical.ts -> envelope.ts -> sign.ts | structural ordering | WIRED | Imports + call order locked at lines 103-115 |
| verify.ts | sign.ts (verifyEd25519Signature) + envelope.ts (decodeEnvelope, buildPae) + keyset.ts (KeySet.lookup) | imports + calls | WIRED | All imports present; verify.ts uses each |
| create-ai.ts | receipt.ts (createReceipt) | import + 6 call sites via maybeIssueReceipt | WIRED | Line 32 import; line 968 createReceipt call inside maybeIssueReceipt |
| index.ts | receipts/{sign,keyset,verify}.js | value re-exports | WIRED | Lines 11-16 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles strict | `pnpm tsc --noEmit` | exit 0, no output | PASS |
| Full test suite green | `pnpm vitest run` | 298/298 passed across 29 files in 668ms | PASS |
| Build produces valid dist | `pnpm build` | dist/index.{js,d.ts,d.ts.map,js.map} produced in 578ms | PASS |
| createReceipt NOT in public d.ts | `grep -c createReceipt dist/index.d.ts` | 0 | PASS |
| Phase 9 type names in public d.ts | grep CapabilityReceiptBody/ReceiptEnvelope/KeySet/VerifyResult | All present + verifyReceipt, createInMemorySigner, createMemoryKeySet, generateEd25519KeyPairJwk declared | PASS |
| Redact-then-sign ordering | awk pattern check on receipt.ts | redact=103 canonical=106 pae=112 sign=115 (ascending) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| RECEIPT-01 | 09-01, 09-03 | CapabilityReceipt schema (full field set) | SATISFIED | types.ts:42-59 declares all required fields with literal types |
| RECEIPT-02 | 09-01 | Canonical JSON via RFC 8785 with canonicalize@3.0.0; I-JSON no raw floats | SATISFIED | canonical.ts uses canonicalize; ReceiptUsageCanonical.costUsd is string-or-null |
| RECEIPT-03 | 09-02 | Ed25519 via Node 24 WebCrypto; DSSE-shaped envelope with PAE | SATISFIED | sign.ts uses crypto.subtle "Ed25519"; envelope.ts implements DSSE v1.0 PAE |
| RECEIPT-04 | 09-01, 09-03 | Redact-then-sign ordering | SATISFIED | receipt.ts file structure locks redact before canonicalize before sign |
| RECEIPT-05 | 09-01, 09-03 | kid field + KeySet with active/retired/revoked | SATISFIED | types.ts:78 KeyState union; verify.ts handles all 3 states; rotation lifecycle test in verify.test.ts |
| RECEIPT-06 | 09-03 | Pure verifyReceipt with typed VerifyError union | SATISFIED | verify.ts pure; 6 VerifyErrorKind variants discriminated |
| RECEIPT-07 | 09-04 | Receipts emitted on success AND failure | SATISFIED | create-ai.ts has 6 maybeIssueReceipt calls covering all terminal branches |
| RECEIPT-08 | 09-01, 09-03, 09-04 | model.requested + model.observed | SATISFIED | types.ts:26-29 ReceiptModel; receipt body carries both fields |
| RECEIPT-10 | 09-02, 09-04 | LatticeConfig.signer? optional; runtime never sees raw keys | SATISFIED | config.ts:24 signer?: ReceiptSigner; sign.ts createInMemorySigner caches CryptoKey internally |

RECEIPT-09 (ReplayEnvelope embedding) is deferred to Phase 10 per REQUIREMENTS.md mapping (line 135).

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments in Phase 9 receipts code. No empty implementations. No hardcoded empty data flowing to user-visible output. All terminal branches in create-ai.ts emit receipts via maybeIssueReceipt with the correct contractVerdict.

### Human Verification Required

None. All goal-bearing claims verified programmatically via file inspection, line-number ordering checks, type structure inspection, dependency version inspection, and successful execution of typecheck/vitest/build.

### Gaps Summary

No gaps. Phase 9 achieves the stated goal: every ai.run terminal branch issues a signed CapabilityReceipt when LatticeConfig.signer is configured. Receipts are RFC 8785-canonicalized, signed with Node 24 WebCrypto Ed25519, DSSE-shaped with PAE, carry kid, and are verifiable by the pure verifyReceipt against a KeySet supporting active/retired/revoked states. createReceipt remains internal; verifyReceipt + signer/keyset factories are publicly exported. Full lattice suite (298/298 tests) passes; typecheck and build exit 0.

---

*Verified: 2026-05-11T17:15:00Z*
*Verifier: Claude (gsd-verifier)*
