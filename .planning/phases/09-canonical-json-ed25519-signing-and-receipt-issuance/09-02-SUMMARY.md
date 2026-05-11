---
phase: 09-canonical-json-ed25519-signing-and-receipt-issuance
plan: 02
subsystem: cryptography
tags: [receipts, ed25519, webcrypto, dsse, envelope, pae, jwk, phase-9]

# Dependency graph
requires:
  - phase: 09-01
    provides: types.ts (ReceiptSigner / ReceiptEnvelope / ReceiptSignature) for type-level consolidation in Wave 2
provides:
  - DSSE-shaped envelope encoder/decoder with PAE pre-auth encoding (envelope.ts)
  - WebCrypto Ed25519 signer with in-memory factory and JWK helpers (sign.ts)
  - @noble/ed25519 parity oracle test guarding against silent WebCrypto regressions
  - Base64 (standard, not base64url) encode/decode helpers
affects:
  - 09-03 (createReceipt + verifyReceipt will import buildPae, encodeEnvelope, decodeEnvelope, createInMemorySigner, verifyEd25519Signature)
  - 09-04 (package surface; createInMemorySigner + verifyEd25519Signature exported from public index.ts)

# Tech tracking
tech-stack:
  added:
    - WebCrypto crypto.subtle Ed25519 (built into Node 24, zero runtime deps)
    - "@noble/ed25519@3.1.0 (devDep parity oracle; pinned by plan 09-01)"
  patterns:
    - "DSSE v1.0 PAE as single source of truth (signing and verification route through buildPae)"
    - "Lazy CryptoKey caching inside in-memory signer to keep factory synchronous"
    - "_Local-suffixed structural types during Wave 1 parallel execution; Wave 2 reconciles to types.ts"
    - "toArrayBuffer copy helper to satisfy strict TS BufferSource (mirrors storage/fingerprint.ts)"

key-files:
  created:
    - packages/lattice/src/receipts/envelope.ts
    - packages/lattice/src/receipts/envelope.test.ts
    - packages/lattice/src/receipts/sign.ts
    - packages/lattice/src/receipts/sign.test.ts
  modified: []

key-decisions:
  - "PAE built over BASE64 payload string per DSSE v1.0 spec (NOT raw canonical bytes)"
  - "verifyEd25519Signature swallows subtle.verify exceptions and returns false on malformed input (e.g. wrong-length signature) so callers receive a clean boolean"
  - "createInMemorySigner imports CryptoKey lazily on first sign() and caches it; keeps the factory synchronous and avoids touching crypto.subtle at module load"
  - "Defined ReceiptEnvelope_Local / ReceiptSignature_Local / ReceiptSigner_Local inline to avoid Wave 1 file conflicts with plan 09-01's types.ts (Wave 2 plan 09-03 will reconcile)"

patterns-established:
  - "DSSE PAE single source of truth: signing/verification both route through buildPae(payloadType, payloadBase64)"
  - "Lazy + cached CryptoKey import in signer factories"
  - "Boolean verification surface: verify functions return false on any failure mode (wrong key, wrong length, malformed input), only throw on truly exceptional cases handled internally"

requirements-completed: [RECEIPT-03, RECEIPT-10]

# Metrics
duration: 6 min
completed: 2026-05-11
---

# Phase 9 Plan 02: Canonical JSON, Ed25519 Signing, and Receipt Issuance — Wave 1 Crypto Primitives Summary

**WebCrypto Ed25519 signer with in-memory factory + DSSE v1.0 envelope encoder/decoder + @noble/ed25519 parity oracle defending against silent Node WebCrypto regressions.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-05-11T16:47Z
- **Completed:** 2026-05-11T16:51Z
- **Tasks:** 2 (both TDD)
- **Files created:** 4 (2 source, 2 test)
- **Test count:** 22 (11 envelope + 11 sign)

## Accomplishments

- `packages/lattice/src/receipts/envelope.ts` ships `PAYLOAD_TYPE`, `base64Encode`, `base64Decode`, `buildPae`, `encodeEnvelope`, `decodeEnvelope` with DSSE v1.0 byte-for-byte PAE construction.
- `packages/lattice/src/receipts/sign.ts` ships `importEd25519PrivateKey`, `importEd25519PublicKey`, `generateEd25519KeyPairJwk`, `verifyEd25519Signature`, `createInMemorySigner` using only `crypto.subtle` with algorithm string `"Ed25519"`.
- `@noble/ed25519@3.1.0` parity oracle test passes: signatures produced by WebCrypto byte-equal signatures produced by noble for the same key+message — silent-regression detector armed for every CI run.
- `createInMemorySigner` returns a `ReceiptSigner` whose surface exposes only `kid`, `publicKeyJwk`, and `sign(bytes) → Promise<Uint8Array(64)>`. No raw private key escapes the closure.
- All 22 tests pass; `pnpm typecheck` exits 0.

## Task Commits

1. **Task 1 RED — failing envelope test** — `a38c828` (test)
2. **Task 1 GREEN — implement envelope + PAE** — `acc058c` (feat)
3. **Task 2 RED — failing sign + parity oracle test** — `dbbb39e` (test)
4. **Task 2 GREEN — implement WebCrypto Ed25519 signer** — `27b45a6` (feat)

## Files Created/Modified

- `packages/lattice/src/receipts/envelope.ts` — DSSE PAE construction, base64 helpers, encode/decode functions, `PAYLOAD_TYPE` constant, local `ReceiptEnvelope_Local` / `ReceiptSignature_Local` types.
- `packages/lattice/src/receipts/envelope.test.ts` — 11 tests: PAYLOAD_TYPE constant, base64 round-trip (incl. empty + high bytes), DSSE v1.0 PAE byte-equality fixture, ASCII length serialization (1 and 1000), encodeEnvelope shape, encode→decode round-trip preservation, payloadType mismatch error, encode determinism over 50 iterations.
- `packages/lattice/src/receipts/sign.ts` — WebCrypto Ed25519 wrappers, `generateEd25519KeyPairJwk`, `verifyEd25519Signature` boolean-returning verify, `createInMemorySigner` with lazy key caching, local `ReceiptSigner_Local` interface, `toArrayBuffer` helper for TS-strict BufferSource compatibility.
- `packages/lattice/src/receipts/sign.test.ts` — 11 tests: JWK shape, import sign/verify usages, round-trip + tamper rejection, 64-byte signature length, signer identity, determinism, @noble/ed25519 parity oracle (the headline silent-regression detector), wrong-key returns false, wrong-length signature returns false.

## DSSE PAE Fixture Details

Concrete byte-equality vector locked into the test suite:

- `payloadType` = `"application/vnd.lattice.receipt+json"` (length 36 — see Deviations)
- `payloadBase64` = `"e30="` (length 4 — base64 of `{}`)
- Expected PAE bytes = UTF-8 of `"DSSEv1 36 application/vnd.lattice.receipt+json 4 e30="`

ASCII length serialization tests cover:
- Length 1 → `"1"`
- Length 1000 → `"1000"` (no zero-padding)

## @noble/ed25519 Parity Oracle Outcome

Test 7 in `sign.test.ts` (titled `WebCrypto Ed25519 signature byte-equals @noble/ed25519 signature for the same key+message`) generates a WebCrypto Ed25519 keypair, extracts the 32-byte raw seed by base64url-decoding `privateKeyJwk.d`, signs a deterministic 64-byte input (`msg[i] = i & 0xff`) with both `crypto.subtle.sign("Ed25519", ...)` and `ed.signAsync(msg, seed)`, then asserts byte-identical 64-byte signatures. PASS on Node 25.9 / Vitest 4.1.5 / `@noble/ed25519@3.1.0`. This test is the canary for any future Node update that silently regresses WebCrypto Ed25519.

## Decisions Made

- PAE input contract follows DSSE v1.0 strictly: `payload` argument to `buildPae` is the base64-encoded string, NOT raw canonical bytes. This is the SINGLE source of truth that 09-03's `createReceipt` and `verifyReceipt` will both route through.
- `verifyEd25519Signature` returns `boolean` — never throws on signature mismatch, never throws on wrong-length signature, never throws on bad public JWK. Plan 09-03's typed `VerifyError` discriminator is downstream of this primitive.
- `createInMemorySigner` accepts `publicKeyJwk` as an option (not derived from the private JWK) because the JWK shape already includes `x` on the private side, but explicit passing keeps the receipt builder's expectation (signer carries kid + public) symmetric with KMS-backed signers in v1.2.
- Defined `_Local`-suffixed structural types inline in both files instead of importing from `./types.js` (owned by plan 09-01). This is the Wave 1 parallel coordination strategy from the plan body; plan 09-03 (Wave 2) will reconcile.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's PAE fixture used incorrect ASCII length for PAYLOAD_TYPE**
- **Found during:** Task 1 RED (writing the byte-equality test)
- **Issue:** The plan body states the fixture should equal `"DSSEv1 43 application/vnd.lattice.receipt+json 4 e30="`, but the correct length of `"application/vnd.lattice.receipt+json"` is 36, not 43 (verified via `node -e 'console.log("application/vnd.lattice.receipt+json".length)'`). Per DSSE v1.0 PAE, the length field is the actual decimal length of the payloadType string. The acceptance_criteria grep for the `43` literal is also incorrect.
- **Fix:** Used the correct fixture `"DSSEv1 36 application/vnd.lattice.receipt+json 4 e30="`. The PAE implementation is unchanged — the bug was purely in the plan's documented fixture.
- **Files modified:** `packages/lattice/src/receipts/envelope.test.ts`
- **Verification:** Test passes; `buildPae(PAYLOAD_TYPE, "e30=")` produces UTF-8 bytes of the corrected fixture string.
- **Committed in:** `a38c828` (Task 1 RED)
- **Impact on plan:** The acceptance-criteria grep `grep -q 'DSSEv1 43 application/vnd.lattice.receipt+json 4 e30=' packages/lattice/src/receipts/envelope.test.ts` will FAIL because the literal `43` does not appear. The criterion that *actually matters* (DSSE PAE byte-equality) PASSES. Plan 09-03 should rely on the implemented behavior, not the doc fixture.

**2. [Rule 1 - Bug] Strict TS rejected `Uint8Array<ArrayBufferLike>` as `BufferSource`**
- **Found during:** Task 2 GREEN (initial typecheck after sign.ts implementation)
- **Issue:** Under `exactOptionalPropertyTypes` + strict TS (Phase 1 tsconfig), passing a `Uint8Array` directly to `crypto.subtle.sign` / `crypto.subtle.verify` fails with `TS2345`: the inferred `Uint8Array<ArrayBufferLike>` could be backed by `SharedArrayBuffer`, which is missing properties from `ArrayBuffer`.
- **Fix:** Added a `toArrayBuffer(bytes)` helper that copies into a fresh `Uint8Array` and returns its `.buffer` as `ArrayBuffer`. Mirrors the existing pattern in `packages/lattice/src/storage/fingerprint.ts`. Applied to both `crypto.subtle.sign` and `crypto.subtle.verify` call sites.
- **Files modified:** `packages/lattice/src/receipts/sign.ts`
- **Verification:** `cd packages/lattice && pnpm typecheck` exits 0 after the fix.
- **Committed in:** `27b45a6` (Task 2 GREEN)

**3. [Rule 3 - Blocking] @noble/ed25519 devDep not yet in package.json**
- **Found during:** Task 2 RED → GREEN (parity oracle test needed runtime resolution)
- **Issue:** Per parallel_execution scope, `packages/lattice/package.json` is owned by plan 09-01 (Wave 1 sibling). The parity oracle test in `sign.test.ts` imports `@noble/ed25519` which has not yet been declared as a devDep.
- **Fix:** Installed `@noble/ed25519@3.1.0` in this worktree only to validate my tests (it lands in node_modules but I did NOT commit `packages/lattice/package.json` or `pnpm-lock.yaml` — both reverted to baseline before the per-task commits). Plan 09-01 owns the actual package.json change; my commits only touch files inside my scope.
- **Files modified (NOT committed):** `packages/lattice/package.json`, `pnpm-lock.yaml` (reverted with `git checkout HEAD -- ...` before any commit)
- **Verification:** `git status` post-commit shows only my four committed files; package.json and pnpm-lock.yaml match baseline.
- **Committed in:** N/A (transient local install for test verification only)
- **Impact on plan:** Until plan 09-01 lands `@noble/ed25519@3.1.0` as a devDep and `canonicalize@3.0.0` as a runtime dep, `pnpm install` from a fresh clone will not resolve the noble import in `sign.test.ts`. Both plans must merge together for CI to pass.

---

**Total deviations:** 3 auto-fixed (2 bugs in the plan's documented fixtures, 1 cross-plan dependency handled via the parallel-execution coordination protocol).
**Impact on plan:** All auto-fixes preserve the plan's correctness guarantees. The DSSE PAE byte-equality test is RFC-correct (Deviation 1 fixed the doc, not the spec). The TypeScript fix preserves runtime behavior — Ed25519 sign/verify still operate on the same byte sequences. The devDep coordination is the expected Wave 1 parallel-execution handshake.

## Issues Encountered

None during planned work. The deviations above were all anticipated coordination overhead between Wave 1 parallel plans.

## User Setup Required

None — no external service configuration required.

## Forward Links for Plan 09-03

Plan 09-03 (`createReceipt` + `verifyReceipt`) will import from this plan:

- `envelope.ts`: `PAYLOAD_TYPE`, `buildPae`, `encodeEnvelope`, `decodeEnvelope`, `base64Encode`, `base64Decode`
- `sign.ts`: `verifyEd25519Signature`, `createInMemorySigner` (re-exported from public surface in plan 09-04)
- `_Local` type names will be removed by 09-03 in favor of `./types.js` (plan 09-01)

The PAE construction in `buildPae` is the canonical contract: 09-03's `createReceipt` MUST compute `buildPae(PAYLOAD_TYPE, base64Encode(canonicalBytes))` and pass the result to `signer.sign(...)`. `verifyReceipt` MUST reconstruct the same PAE bytes from the envelope's `payloadType` + `payload` (the base64 string on the wire) and feed it to `verifyEd25519Signature`.

## Test Counts (Before / After)

- **Before plan 09-02:** `src/receipts/` directory did not exist; 0 tests in that namespace.
- **After plan 09-02:** 22 tests in `src/receipts/` (11 envelope + 11 sign), all passing.

## Next Phase Readiness

- Wave 1 crypto primitives complete. Plan 09-03 can wire `createReceipt` and `verifyReceipt` once plan 09-01 lands `types.ts` and the package.json deps.
- DSSE PAE source of truth established — divergence at canonical/PAE boundary is now structurally prevented by routing both sign and verify through this module.
- @noble/ed25519 parity oracle armed for the lifetime of the Lattice repo.

## Self-Check: PASSED

Verified post-execution:
- `[ -f packages/lattice/src/receipts/envelope.ts ]` — FOUND
- `[ -f packages/lattice/src/receipts/envelope.test.ts ]` — FOUND
- `[ -f packages/lattice/src/receipts/sign.ts ]` — FOUND
- `[ -f packages/lattice/src/receipts/sign.test.ts ]` — FOUND
- Commits in `git log`:
  - `a38c828` test(09-02): add failing test for DSSE envelope and PAE — FOUND
  - `acc058c` feat(09-02): implement DSSE envelope + PAE pre-auth encoding — FOUND
  - `dbbb39e` test(09-02): add failing test for WebCrypto Ed25519 signer + parity oracle — FOUND
  - `27b45a6` feat(09-02): implement WebCrypto Ed25519 signer + in-memory factory — FOUND

---
*Phase: 09-canonical-json-ed25519-signing-and-receipt-issuance*
*Completed: 2026-05-11*
