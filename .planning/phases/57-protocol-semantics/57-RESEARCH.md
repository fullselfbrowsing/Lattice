# Phase 57: Protocol Semantics - Research

**Researched:** 2026-07-16
**Domain:** DSSE receipt issuance and bounded historical verification in TypeScript and Python
**Confidence:** HIGH

## RESEARCH COMPLETE

Phase 57 is a correction at the receipt cryptographic boundary. The repository already
has all required runtime dependencies and stable issuance/verifier seams. The work should
replace the payload input to standard PAE, authenticate the new profile in a v1.4 body,
and isolate the old base64-text algorithm inside verification-only compatibility code.

This phase should add no production dependency. Phase 58 owns normative spec, schema,
vector, CLI, independent-oracle, and CI migration; Phase 57 must nevertheless leave both
language unit suites green with focused standard and legacy-policy coverage.

## Protocol Facts

DSSE v1 PAE is the byte concatenation:

`DSSEv1 SP LEN(payloadTypeBytes) SP payloadTypeBytes SP LEN(payloadBytes) SP payloadBytes`

Lengths are decimal byte lengths. The envelope's `payload` member remains standard base64
transport and is decoded before standard PAE construction. The current implementation in
both languages incorrectly builds PAE from that base64 text.

The new signed body must pair `version: "lattice-receipt/v1.4"` with required
`signatureProfile: "dsse-v1"`. Historical v1.1-v1.3 bodies have no authenticated profile,
so their verifier path is deterministic: common decode/schema/canonical/key checks,
standard PAE first, then the exact historical base64-text PAE only under compatibility
policy. A v1.4 receipt is never eligible for the historical algorithm.

## Current Code Findings

### TypeScript

- `packages/lattice/src/receipts/envelope.ts` exposes internal `buildPae(payloadType, payloadBase64)` and currently encodes one string. It should become the standard raw-byte helper.
- `packages/lattice/src/receipts/receipt.ts` forces v1.3 and signs the base64 envelope string. It is the only production issuer and can force v1.4 plus `signatureProfile` without adding caller configuration.
- `packages/lattice/src/receipts/verify.ts` is a non-throwing, first-match verifier. It should keep common checks ordered before profile-dependent signature work and add a third optional policy argument to preserve two-argument callers.
- `packages/lattice/src/receipts/types.ts` owns the public body, verifier, key, and error types; root and modular export barrels mirror selected types through `runtime/public-types.ts`, `index.ts`, and `audit.ts`.
- Receipt, runtime, replay, checkpoint, survivability, audit, and crew tests call the two-argument verifier. Default `allow` is therefore the compatibility bridge; strict callers pass `legacyPolicy: "reject"`.
- `receiptCid` already hashes decoded canonical payload bytes. It must not change when signature construction changes.

### Python

- `clients/python/src/lattice_receipt/_core.py` mirrors the same incorrect PAE in `build_pae`, `verify`, and `mint`.
- `build_pae` is exported publicly from `__init__.py`; changing it to accept raw bytes makes the supported helper standards-compliant. The legacy builder must be private and verifier-only.
- `mint` currently accepts v1.1-v1.3 bodies. Corrected issuance must instead require v1.4 plus `signatureProfile == "dsse-v1"`.
- Python base64 decoding already uses `validate=True`, which should remain the strict transport behavior.
- Existing Python mint and PAE tests are tied to historical vectors. They should become verifier-only legacy assertions or use focused v1.4 bodies; Phase 58 will reorganize the committed corpora.

## Recommended Contract

### Shared literals

- Signed profile: `dsse-v1`
- Historical verified profile: `lattice-legacy-base64-pae`
- Legacy policy: `allow | reject`
- Corrected body version: `lattice-receipt/v1.4`

### TypeScript surface

- `buildPae(payloadType: string, payloadBytes: Uint8Array): Uint8Array`
- `verifyReceipt(envelope, keySet, options?: VerifyReceiptOptions)`
- `VerifyReceiptOptions.legacyPolicy?: LegacyReceiptPolicy`, default `allow`
- `VerifyOk.verificationProfile` plus typed deprecation state
- A stable policy-specific failure for a valid historical signature rejected by strict policy

### Python surface

- `build_pae(payload_type: str, payload_bytes: bytes) -> bytes`
- `verify(envelope, keyset, *, legacy_policy: LegacyPolicy = "allow")`
- `VerifyOk.verification_profile` plus the same deprecation meaning
- `mint` accepts only the v1.4/dsse-v1 matrix

Exact deprecation representation is discretionary, but both languages must expose a
structured value rather than requiring warning-text parsing.

## Verification Algorithm

1. Validate envelope shape, payload type, base64 transport, and non-empty signatures.
2. Parse payload JSON and validate supported body shape.
3. Apply the existing v1/absent-version downgrade rejection before key lookup.
4. Validate the version/profile matrix independently: v1.4 requires `dsse-v1`; old versions cannot be reinterpreted as corrected issuance.
5. Resolve the first signature's `keyid` as an unauthenticated hint; reject missing or revoked keys.
6. Re-canonicalize and require byte equality with decoded payload bytes.
7. Verify standard raw-byte PAE first.
8. If standard succeeds, cross-check signed `body.kid` and return `verificationProfile: "dsse-v1"`.
9. If standard fails on an eligible historical body, evaluate the policy-gated legacy path using the exact original envelope payload text.
10. A valid historical signature under `allow` returns legacy profile plus deprecation; strict policy returns a stable rejection. Invalid cryptography remains distinguishable from policy rejection.
11. A corrected v1.4 receipt never executes step 9.

## Security and Failure Modes

| Threat | Required mitigation |
|--------|---------------------|
| Silent downgrade after corrected signature failure | Branch eligibility is derived from the validated version/profile matrix; v1.4 exits with `signature-invalid` |
| Schema version conflated with signature algorithm | Validate version/profile separately and return the algorithm that actually verified |
| Legacy verification signs normalized transport | Preserve exact validated `envelope.payload` text for historical PAE |
| Envelope `keyid` treated as authenticated identity | Use it only for lookup, then compare signed `body.kid` after cryptographic success |
| Legacy mint path survives behind a helper | Standardize public PAE helpers and keep historical construction private to verifier code |
| CID changes during migration | Retain payload-byte SHA-256 identity and test standard/legacy envelopes over equal bodies |

## Validation Architecture

Existing Vitest and pytest infrastructure is sufficient; no Wave 0 setup is needed.

Fast TypeScript feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/envelope.test.ts src/receipts/receipt.test.ts src/receipts/verify.test.ts src/receipts/cid.test.ts`

TypeScript phase gate:

`pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test`

Python feedback and gate:

`.context/python-venv/bin/python -m pytest clients/python/tests`

Final Phase 57 gate:

`pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && .context/python-venv/bin/python -m pytest clients/python/tests`

Required matrix coverage includes standard v1.4 success, historical standard-first success,
legacy allow success, legacy strict rejection, invalid legacy signature, missing/unknown/mismatched
profile, v1 and absent-version downgrade, wrong key, revoked key, body/envelope kid mismatch,
canonicalization mismatch, unchanged CID derivation, and proof that neither issuer exposes a
legacy selection.

## Planning Implications

Use two plans. Plan 57-01 establishes the normative TypeScript contract, public types,
issuer, verifier, export surfaces, and security matrix. Plan 57-02 depends on 57-01 and
ports the exact contract to Python while converting legacy vector coupling into read-only
compatibility tests. This ordering prevents language drift without moving Phase 58 corpus
and CI work forward prematurely.

## Sources

- `.planning/research/SUMMARY.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- DSSE v1.0.2 protocol: https://github.com/secure-systems-lab/dsse/blob/v1.0.2/protocol.md
- DSSE v1.0.2 envelope: https://github.com/secure-systems-lab/dsse/blob/v1.0.2/envelope.md
