# Phase 57: Protocol Semantics - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) - recommended compatibility defaults approved

<domain>
## Phase Boundary

Correct the TypeScript and Python receipt signing boundary so every new receipt uses
standard DSSE PAE over canonical payload bytes, while retaining historical receipt
verification through an explicit, observable, read-only compatibility policy. This
phase owns production protocol semantics and focused regression tests; specification,
vector, CLI, and CI migration belongs to Phase 58.

</domain>

<decisions>
## Implementation Decisions

### Authenticated Profile Boundary
- Every corrected write uses signed body version `lattice-receipt/v1.4` with required signed field `signatureProfile: "dsse-v1"`.
- Keep envelope `payloadType` as `application/vnd.lattice.receipt+json`; the authenticated body field, not a media-type fork, identifies the corrected profile.
- Standard PAE is built from UTF-8 payload-type bytes and the decoded canonical payload bytes, using byte lengths rather than JavaScript or Python character counts.
- Receipt CID remains the SHA-256 identity of decoded canonical payload bytes. The verified signature profile is carried separately and CID equality is never treated as proof of signature-profile equality.

### Legacy Verification Policy
- TypeScript `verifyReceipt` and Python `verify` gain an additive explicit legacy policy with `allow` and `reject` modes; direct compatibility entrypoints default to `allow` during the v1.6 bridge so existing callers continue to read historical evidence.
- Supported pre-v1.4 bodies are checked with standard DSSE first. Only a standard signature mismatch may enter the historical base64-PAE branch, and only when policy is `allow`.
- A v1.4 body or any body declaring `signatureProfile: "dsse-v1"` is standard-only. Standard signature failure returns `signature-invalid` and can never fall back to the legacy algorithm.
- Legacy verification reconstructs the historical input from the exact validated envelope payload text. It does not canonicalize or re-encode that transport text before checking the legacy signature.

### Verification Results and Security Axes
- A successful verification reports `verificationProfile` as either `dsse-v1` or `lattice-legacy-base64-pae`, plus an explicit deprecation state; legacy success is never represented as an indistinguishable boolean success.
- Strict legacy rejection has a stable typed verdict distinct from malformed envelopes and invalid signatures, while existing error kinds remain stable where their meaning has not changed.
- Body schema version, required signature-profile marker, canonical payload bytes, key lookup and key state, envelope key hint versus signed `body.kid`, signature validity, CID behavior, and downgrade policy remain independently testable checks.
- The envelope `keyid` remains an unauthenticated lookup hint. Verification still cross-checks the authenticated body `kid` after signature verification and does not conflate key selection with profile acceptance.

### Issuance and Language Parity
- TypeScript `createReceipt` and Python `mint` expose only corrected v1.4 issuance; neither accepts an option, helper, version override, or alternate path that can produce a legacy base64-PAE signature.
- Historical PAE construction is quarantined inside verifier-only code and is not exported as a general signing helper from either language client.
- TypeScript and Python use the same literals, policy behavior, verification-profile names, deprecation meaning, and downgrade rules.
- Phase 57 adds focused unit and cross-language-shape coverage for protocol behavior; Phase 58 owns normative schemas, frozen legacy and standard corpora, independent oracle coverage, public migration docs, CLI output, and conformance CI.

### the agent's Discretion
- Exact internal module layout and helper names are at the agent's discretion as long as legacy PAE cannot be reached from issuance code and the public compatibility contract above remains stable.
- The concrete representation of the deprecation state may be a boolean or a small typed object, provided callers can inspect it without parsing warning text.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/receipts/envelope.ts` already owns payload-type, base64, envelope encode/decode, and the current PAE helper.
- `packages/lattice/src/receipts/receipt.ts` centralizes redact, canonicalize, sign, and envelope issuance ordering.
- `packages/lattice/src/receipts/verify.ts` provides the non-throwing first-match verifier and typed error taxonomy.
- `clients/python/src/lattice_receipt/_core.py` mirrors mint, verify, PAE, key-set, and result behavior in one small client module.
- Existing receipt, verifier, CID, runtime, replay, checkpoint, and agent tests exercise the public verifier across all issuance paths.

### Established Patterns
- Receipt bodies are RFC 8785 canonicalized before signing, envelope payloads use standard base64, and `receiptCid` hashes decoded canonical payload bytes.
- New issuance forces the current schema version internally rather than accepting a caller-selected version.
- Verifiers return typed success/failure unions and do not throw on malformed untrusted input.
- Signed `body.kid` and envelope signature `keyid` are cross-checked as defense in depth; only the first signature is currently supported.

### Integration Points
- Public receipt types and exports under `packages/lattice/src/receipts/` need additive v1.4/profile/policy/result types.
- Runtime, replay, audit, checkpoint, survivability, and crew callers rely on `verifyReceipt(envelope, keySet)` and require source compatibility through the default bridge policy.
- Python exports in `clients/python/src/lattice_receipt/__init__.py` must mirror any public policy and result types.
- Specification, schemas, vectors, CLI consumers, and conformance workflows consume these semantics in Phase 58.

</code_context>

<specifics>
## Specific Ideas

The v1.6 bridge is compatibility-first for historical reads but downgrade-resistant for
corrected writes. The user approved reconciling `origin/main`, completing full research,
and applying the recommended signed-profile and bounded-legacy defaults.

</specifics>

<deferred>
## Deferred Ideas

- Removal or opt-in-only defaulting of legacy verification requires measured usage and a separately announced deprecation deadline after v1.6.
- Normative specification, schema, vector, CLI, independent oracle, and CI migration is Phase 58 scope.

</deferred>
