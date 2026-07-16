# Phase 57: Protocol Semantics - Pattern Map

## Protocol Spine

| Role | Target | Existing pattern to preserve |
|------|--------|------------------------------|
| Standard PAE | `packages/lattice/src/receipts/envelope.ts` | Pure `Uint8Array` helper beside envelope base64 codecs |
| Type contract | `packages/lattice/src/receipts/types.ts` | Closed literal unions and non-throwing `VerifyResult` discriminant |
| Issuance | `packages/lattice/src/receipts/receipt.ts` | Forced current version; redact, canonicalize, PAE, sign, envelope ordering |
| Verification | `packages/lattice/src/receipts/verify.ts` | First-match security checks and typed failures, never throw |
| Content identity | `packages/lattice/src/receipts/cid.ts` | SHA-256 of decoded canonical payload bytes, independent of envelope signature |
| Python mirror | `clients/python/src/lattice_receipt/_core.py` | Dataclass result unions, strict base64, RFC 8785, Ed25519 primitives |

## Concrete Reuse

### Standard PAE bytes

Follow the byte-oriented concatenation patterns used throughout receipt hashing and signing:
encode ASCII length prefixes separately, append raw `payloadType` UTF-8 bytes and raw payload
bytes, and return one `Uint8Array`. Do not interpolate payload bytes into a JavaScript string.

### Forced issuance schema

`createReceipt` currently prevents caller-selected `version` and `kid`. Preserve that shape:
set `version: "lattice-receipt/v1.4"`, set `signatureProfile: "dsse-v1"`, canonicalize the
complete redacted body, and pass those exact bytes to standard PAE. Python `mint` validates
the same fixed version/profile matrix before signing.

### Additive verifier policy

Preserve every existing `verifyReceipt(envelope, keySet)` call by using a third optional
options object. Follow existing closed-union public type patterns for `LegacyReceiptPolicy`
and `VerificationProfile`. Python uses a keyword-only `legacy_policy` defaulting to `allow`.

### Quarantined compatibility

The historical base64-text PAE helper belongs in verifier implementation scope only.
Issuance code imports only the standard helper. Tests that construct historical envelopes
use a test-local helper so production code exposes no legacy signing utility.

### Public exports

When receipt types become public, mirror the existing export route:

1. Define in `receipts/types.ts`.
2. Re-export through `runtime/public-types.ts`.
3. Add to the root `index.ts` type inventory.
4. Add receipt/audit-relevant types to `audit.ts` where that module already exports verifier types.
5. Extend public-surface and type-only tests instead of adding a new barrel.

## Test Placement

- `envelope.test.ts`: byte-length and non-ASCII/binary standard PAE cases.
- `receipt.test.ts`: forced v1.4/profile issuance and raw-byte signing proof.
- `verify.test.ts`: version/profile/policy/signature matrix and typed diagnostics.
- `cid.test.ts`: content identity stays payload-based across signature profiles.
- Python `test_mint.py`: v1.4-only minting and standard PAE intermediates.
- Python verification/conformance tests: legacy fixtures are read-only and profile-aware.

## Boundaries

- Do not edit `spec/`, `conformance/vectors/`, CLI output, or workflows in Phase 57.
- Do not add `securesystemslib`; that test-only oracle belongs to Phase 58.
- Do not mutate historical receipts or re-sign existing vectors.
- Do not change receipt payload type or CID derivation.

