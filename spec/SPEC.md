# Lattice Capability Receipt Protocol Specification

**Status:** Normative
**Spec version:** 1.1-draft (tied to receipt schema v1.4)
**Normative authority:** This specification and the versioned JSON Schemas in
`spec/schema/` define the public protocol. An implementation MUST NOT require access to the
Lattice TypeScript source to reproduce signing or verification. Where normative prose and a
schema differ, the schema governs receipt-body shape and this document governs algorithms and
policy. Reference implementations and `paper/main.tex` are non-normative.

**Normative references:** RFC 2119, RFC 8174, RFC 8785 (JCS), RFC 4648, RFC 7493 (I-JSON),
RFC 8037 (OKP JWK), RFC 8032 (Ed25519), DSSE v1.0 protocol.

---

## § 1  Terminology

The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED,
NOT RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in
BCP 14 [RFC 2119] [RFC 8174] when, and only when, they appear in all capitals, as shown
here.

**Receipt Body:** A JSON object conforming to one of the versioned schemas defined in § 3.
The receipt body contains the auditable record of a single AI capability invocation.

**DSSE Envelope:** A JSON object with fields `payloadType`, `payload`, and `signatures[]`
as defined by the DSSE v1.0 protocol. The `payload` field carries the base64-encoded
canonical receipt body bytes.

**CID (Content Identifier):** A content-addressed identifier in the format
`sha256:<lowercase-hex>`, computed as the SHA-256 hash of the decoded DSSE payload bytes.
The CID is stable and derivable from any valid envelope without key material.

**PAE (Pre-Authentication Encoding):** The DSSE v1.0 length-prefixed byte string over which
the Ed25519 signature is computed. Defined in § 4.5.

**KeySet:** An object with a `lookup(kid: string)` method returning a `KeyEntry` or
`undefined`. The `lookup` method is the sole key-discovery interface used during verification.

**kid (Key Identifier):** An opaque string that uniquely identifies an Ed25519 signing key
within a `KeySet`. The `kid` appears both in the receipt body and in the DSSE
`signatures[0].keyid` field.

**Canonical bytes:** The UTF-8 bytes produced by applying RFC 8785 JSON Canonicalization
Scheme (JCS) to a receipt body object. The canonical bytes are the signed commitment.

**Payload:** The standard base64 encoding (RFC 4648 § 4) of the canonical bytes. This is
the `payload` field of the DSSE envelope. It is transport encoding only; the decoded
canonical payload bytes, not this base64 text, are input to standard PAE construction.

**VerifyErrorKind:** A discriminated union of nine string literals identifying the reason a
receipt fails verification. Defined in § 5.2.

---

## § 2  Overview (non-normative)

A Lattice capability receipt records a single AI capability invocation as a signed,
replayable, redaction-aware JSON artifact. The signing pipeline proceeds as follows:
the minter assembles a receipt body, applies the redaction policy to produce a manifest of
redacted fields, canonicalizes the redacted body using RFC 8785 JCS, constructs DSSE PAE over
the canonical payload bytes, signs the PAE bytes with an Ed25519 key, base64-encodes the
canonical bytes for envelope transport, assembles the DSSE envelope, and optionally derives
a CID for receipt chaining. Verification follows a strict 12-step decision tree that
short-circuits at the first failure. The downgrade defense (step 4) fires before any
cryptographic operation, ensuring that receipts with deprecated version strings cannot be
accepted even when a valid-but-revoked key is presented.

---

## § 3  Receipt Body Schema

### § 3.1  Fields — All Versions

All four accepted receipt versions share the following required fields.
Implementations MUST reject receipt bodies that omit any required field.

| Field | Type (JSON) | Description |
|-------|-------------|-------------|
| `version` | string | Receipt schema version. MUST be one of the accepted version strings (§ 8.1). |
| `receiptId` | string | UUID v4 identifying this receipt. |
| `runId` | string | Opaque identifier linking receipts from the same run. |
| `issuedAt` | string | ISO 8601 / RFC 3339 date-time at which the receipt was issued. |
| `kid` | string | Key identifier of the signing key. MUST equal `signatures[0].keyid` in the envelope. |
| `model` | object | Required sub-object; see below. |
| `route` | object | Required sub-object; see below. |
| `usage` | object | Required sub-object; see below. |
| `contractVerdict` | string | Result of contract evaluation. One of the five `ContractVerdict` values. |
| `contractHash` | string or null | `sha256:<lowercase-hex>` hash of the evaluated contract, or null when no contract. |
| `inputHashes` | array | Array of bare 64-char lowercase hex strings (one per input artifact). MAY be empty. |
| `outputHash` | string or null | Bare 64-char lowercase hex SHA-256 of the output, or null. See § 6. |
| `redactionPolicyId` | string | Identifier of the redaction policy applied. Default is `"lattice.default.v1"`. |
| `redactions` | array | Array of redaction manifest entries; MAY be empty. |

**Sub-object `model`:** MUST contain `requested` (string) and `observed` (string or null).

**Sub-object `route`:** MUST contain `providerId` (string), `capabilityId` (string), and
`attemptNumber` (integer, minimum 1).

**Sub-object `usage`:** MUST contain `promptTokens` (integer), `completionTokens` (integer),
and `costUsd` (string or null). See § 3.3 for I-JSON constraints.

**`contractVerdict` values:** `"success"`, `"tripwire-violated"`, `"no-contract-match"`,
`"execution-failed"`, `"validation-failed"`.

### § 3.2  Version-Specific Fields

The accepted versions add fields beyond the common required set. Because all schema files
use `additionalProperties: false` (§ 3.4), v1.1 bodies MUST NOT carry `modelClass`,
`parentReceiptCid`, `lineageMerkleRoot`, or `signatureProfile`; v1.2 bodies MUST NOT carry
`parentReceiptCid`, `lineageMerkleRoot`, or `signatureProfile`; and v1.3 bodies MUST NOT
carry `signatureProfile`.

**Optional fields present in all versions (v1.1, v1.2, v1.3):**

| Field | Type (JSON) | Description |
|-------|-------------|-------------|
| `stepName` | string | Human-readable step label for multi-step execution traces. |
| `stepIndex` | integer | Zero-based position of this step in a sequence. Safe integer (§ 3.3). |
| `parentStepName` | string | Step label of the parent in a hierarchical execution. |
| `previousStepName` | string | Step label of the immediately preceding step in sequence. |
| `sessionId` | string | Session identifier linking receipts across turns. |
| `timestamp` | string | ISO 8601 / RFC 3339 timestamp (distinct from `issuedAt`). |
| `noRouteReasons` | array | Reasons why no provider route was found, when applicable. |
| `tripwireEvidence` | object | Evidence collected when a tripwire invariant fired. |

**Fields added in v1.2 (optional, carried forward into v1.3):**

| Field | Type (JSON) | Description |
|-------|-------------|-------------|
| `modelClass` | string | Model training-class audit tag. One of: `"frontier_rlhf"`, `"mid_tier_rlhf"`, `"open_weight_instruct"`, `"open_weight_base"`, `"local_quantized"`. |

**Fields added in v1.3 (optional):**

| Field | Type (JSON) | Description |
|-------|-------------|-------------|
| `parentReceiptCid` | string | CID of the parent receipt in a chained crew execution. Format: `sha256:<lowercase-hex>`. |
| `lineageMerkleRoot` | string | SHA-256 Merkle root of the artifact lineage graph. Format: `sha256:<lowercase-hex>`. |

**Field added in v1.4 (required):**

| Field | Type (JSON) | Description |
|-------|-------------|-------------|
| `signatureProfile` | string | Authenticated signature profile. MUST be the exact literal `"dsse-v1"`. |

New receipts MUST use version `"lattice-receipt/v1.4"` and MUST include
`"signatureProfile":"dsse-v1"`. Versions v1.1 through v1.3 are historical and MUST omit
`signatureProfile`.

### § 3.3  Field Types and I-JSON Constraints

Implementations MUST enforce the following constraints in addition to JSON Schema validation.
These constraints cannot be fully expressed in JSON Schema and are therefore stated here as
normative prose (D-08).

1. `promptTokens` and `completionTokens` MUST be safe integers: integers in the range
   0 ≤ n ≤ 9007199254740991 (= 2^53 − 1, per RFC 7493). These fields MUST be encoded as
   bare JSON integers without fraction or exponent (e.g., `100`, not `100.0` or `1e2`).

2. `stepIndex` MUST be a safe integer in the range 0 ≤ n ≤ 9007199254740991 when present.
   It MUST be encoded as a bare JSON integer without fraction or exponent.

3. `costUsd` MUST be a finite decimal string matching the pattern
   `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`, or null. `costUsd` MUST NOT be a JSON number.
   Non-finite values (NaN, Infinity, −Infinity) MUST be represented as null.

4. `outputHash` is a bare 64-character lowercase hexadecimal string when non-null. The
   pattern is `^[0-9a-f]{64}$`. `outputHash` MUST NOT carry a `sha256:` prefix. When no
   output was produced, `outputHash` is null.

5. Each entry in `inputHashes[]` MUST be a bare 64-character lowercase hexadecimal string
   matching `^[0-9a-f]{64}$`. `inputHashes[]` entries MUST NOT carry a `sha256:` prefix.

6. `contractHash`, `parentReceiptCid`, and `lineageMerkleRoot` MUST use the
   `sha256:<lowercase-hex>` format when non-null, matching `^sha256:[0-9a-f]{64}$`.

7. All hex strings (whether prefixed or bare) MUST use lowercase letters (a–f).

### § 3.4  JSON Schema Files (Normative)

The files `spec/schema/v1.1.json`, `spec/schema/v1.2.json`, `spec/schema/v1.3.json`, and
`spec/schema/v1.4.json` are normative machine-checkable complements to this section. All
four files use JSON Schema
draft 2020-12, and the root receipt-body object and its structured sub-objects (`model`,
`route`, `usage`) use `additionalProperties: false` — this is the drift/forgery gate for the
receipt body's field set. The optional diagnostic payloads `tripwireEvidence` and the
entries of `noRouteReasons` carry implementation-defined fields whose internal shape is
outside the normative receipt-protocol surface; they are intentionally left open and are
NOT closed with `additionalProperties: false`. The schemas govern receipt-body shape.

---

## § 4  Signing Pipeline

Implementations MUST execute the following steps in order. The signed commitment is
`canonicalize(redact(body))` — the body MUST be redacted before canonicalization, and
canonicalization MUST precede signing. No step may be skipped or reordered.

### § 4.1  Step 1 — Assemble Body

The implementation MUST assemble the receipt body with all required fields populated. The
`kid` field MUST be set to `signer.kid` — the receipt body has no independent `kid` input;
it is always taken from the signer object. For every newly minted receipt, `version` MUST be
`"lattice-receipt/v1.4"` and `signatureProfile` MUST be `"dsse-v1"`. Historical receipts may
carry `"lattice-receipt/v1.1"`, `"lattice-receipt/v1.2"`, or `"lattice-receipt/v1.3"` and
remain eligible for verification under § 5. No conforming minter exposes a historical or
legacy signing path.

### § 4.2  Step 2 — Redact

The implementation MUST apply the redaction policy to the assembled body. The default
redaction policy identifier is `"lattice.default.v1"`. The redaction process populates the
`redactions[]` array with a manifest of redacted fields, where each entry has `path`
(string) and `reason` (string) fields. The entries in `redactions[]` MUST be sorted in
ascending lexicographic order by the `path` field before the body is passed to
canonicalization. The body delivered to canonicalization and signing is the redacted body
(with `redactions[]` populated) — the cleartext body MUST NOT be signed.

### § 4.3  Step 3 — JCS Canonicalize (RFC 8785)

The implementation MUST produce RFC 8785 canonical JSON bytes from the redacted body.

1. JSON keys MUST be sorted by UTF-16BE code-unit sequence per RFC 8785 § 3.2.3. This is
   NOT equivalent to UTF-8 byte order or Unicode codepoint order for keys containing
   characters outside the Basic Multilingual Plane (U+10000 and above, which are represented
   as surrogate pairs in UTF-16).

2. Non-ASCII string values MUST be preserved as raw Unicode codepoints in the canonical
   JSON. Characters above U+001F MUST NOT be `\uXXXX`-escaped unless they are structural
   JSON characters requiring escaping.

3. Integer fields (`promptTokens`, `completionTokens`, `attemptNumber`, `stepIndex`)
   MUST serialize as bare integers without decimal point or exponent.

4. Negative zero MUST serialize as `0` (not `-0`).

5. The result MUST be encoded as UTF-8 bytes. These bytes are the canonical bytes.

### § 4.4  Step 4 — Base64 Encode Payload (RFC 4648 § 4)

The canonical bytes from step 3 MUST be encoded using standard base64 as defined in
RFC 4648 § 4. The base64 alphabet is `A-Za-z0-9+/` with `=` padding characters. The
implementation MUST NOT use base64url (RFC 4648 § 5), which substitutes `+` with `-` and
`/` with `_`. The resulting base64 string is the DSSE `payload` field.

### § 4.5  Step 5 — Build PAE (DSSE v1.0)

The implementation MUST construct standard DSSE v1.0 Pre-Authentication Encoding (PAE) by
concatenating the following byte sequences:

```
PAE = UTF8("DSSEv1") || SP || UTF8(DECIMAL(LEN(UTF8(payloadType))))
      || SP || UTF8(payloadType)
      || SP || UTF8(DECIMAL(LEN(canonicalPayloadBytes)))
      || SP || canonicalPayloadBytes
```

Where:
- `SP` is the single byte `0x20`.
- `payloadType` is the literal string `"application/vnd.lattice.receipt+json"`; its UTF-8
  encoding is 36 bytes.
- `canonicalPayloadBytes` are the exact bytes produced in step 3 and decoded from the
  envelope `payload` during verification.
- `LEN(bytes)` is the number of bytes, and `DECIMAL(n)` is the non-negative ASCII decimal
  representation of that number with no sign or leading zeroes (except `0` itself).

The DSSE PAE structure uses length-prefixed fields to prevent ambiguity attacks. The
Ed25519 signature MUST be computed over these PAE bytes. Envelope base64 text MUST NOT be
substituted for `canonicalPayloadBytes`.

### § 4.6  Step 6 — Ed25519 Sign PAE Bytes

The implementation MUST sign the PAE bytes using Ed25519 (RFC 8032). The algorithm
identifier is the literal string `"Ed25519"`. The output is a 64-byte raw Ed25519 signature.
Ed25519 is a deterministic signature scheme: the same private key and the same PAE bytes
always produce the same 64-byte signature (RFC 8032 § 5.1.6).

Ed25519 private keys MUST be represented as JWK with `kty: "OKP"`, `crv: "Ed25519"`, and
`d` (private key bytes, base64url, no padding per RFC 8037). The `d` and `x` fields use
base64url (RFC 4648 § 5, alphabet `A-Za-z0-9-_`, no `=` padding) — this is distinct from
the standard base64 used for the envelope `payload` and `sig` fields.

### § 4.7  Step 7 — Encode DSSE Envelope

The implementation MUST produce a DSSE envelope with the following fields:

- `payloadType`: MUST be the literal string `"application/vnd.lattice.receipt+json"`.
- `payload`: the base64 string from step 4 (standard base64, RFC 4648 § 4).
- `signatures`: an array with exactly one entry:
  - `keyid`: the signer's `kid` string.
  - `sig`: the standard base64 encoding of the 64-byte raw Ed25519 signature from step 6.
    MUST use standard base64 (RFC 4648 § 4), NOT base64url.

The structural invariant `body.kid === signatures[0].keyid` MUST hold. This is enforced by
the minter (kid is taken from the signer) and verified in step 12 of the verification
algorithm (§ 5.1).

### § 4.8  Step 8 — Derive CID (for chaining)

The CID is derived from the DSSE envelope as follows:

1. Decode the `payload` field from standard base64 to recover the canonical body bytes.
2. Compute the SHA-256 digest over those bytes.
3. Format as `"sha256:" + <lowercase 64-char hex>`.

The CID is stable: it can be derived from any valid DSSE envelope without key material. The
CID of a receipt is used as `parentReceiptCid` in downstream chained receipts.

### § 4.9  v1.4 Signing Walk-Through (non-normative)

A minimal current body includes the authenticated signature profile:

```json
{
  "version": "lattice-receipt/v1.4",
  "signatureProfile": "dsse-v1",
  "receiptId": "00000000-0000-4000-a000-000000000001",
  "runId": "example-run",
  "issuedAt": "2026-07-16T00:00:00.000Z",
  "kid": "example-key",
  "model": { "requested": "example-model", "observed": null },
  "route": { "providerId": "example", "capabilityId": "chat", "attemptNumber": 1 },
  "usage": { "promptTokens": 0, "completionTokens": 0, "costUsd": null },
  "contractVerdict": "success",
  "contractHash": null,
  "inputHashes": [],
  "outputHash": null,
  "redactionPolicyId": "lattice.default.v1",
  "redactions": []
}
```

Let `B = UTF8(JCS(body))`. Standard issuance performs these byte operations:

```
payload = BASE64_STANDARD(B)
PAE     = UTF8("DSSEv1 36 application/vnd.lattice.receipt+json ")
          || UTF8(DECIMAL(LEN(B))) || SP || B
sig     = BASE64_STANDARD(ED25519_SIGN(privateKey, PAE))
cid     = "sha256:" || LOWER_HEX(SHA256(B))
```

The envelope stores `payload` and `sig` as canonical RFC 4648 standard base64. The PAE
contains `B` itself after its decimal byte length; it does not contain `payload`. This
walk-through illustrates the construction without naming a committed conformance vector.

---

## § 5  Verification Algorithm

Verification is non-throwing at the protocol boundary: malformed or invalid input produces a
typed failure. Implementations MUST process the following steps in order. The first terminal
condition determines the result, and no later check may replace it.

### § 5.1  First-Match Decision Tree (12 Steps)

| Step | Condition or action | Result / next step |
|------|---------------------|--------------------|
| 1 | Require the exact payload type, at least one signature, and canonical RFC 4648 standard base64 for `payload` and every `sig`; decode them to bytes. | Any failure: `envelope-malformed`. |
| 2 | Decode payload bytes as UTF-8 JSON. | Parse failure: `envelope-malformed`. |
| 3 | Validate the common receipt shape and require `version` to be absent or exactly one of `lattice-receipt/v1`, v1.1, v1.2, v1.3, or v1.4. | Shape failure or any other non-empty version: `version-mismatch`. |
| 4 | Reject an absent version or exact `lattice-receipt/v1`. | `schema-version-too-low`. |
| 5 | Require v1.4 to carry `signatureProfile: "dsse-v1"`; require v1.1-v1.3 to omit `signatureProfile`. | Any other version/profile pairing: `signature-profile-mismatch`. |
| 6 | Use `signatures[0].keyid` to look up a `KeyEntry`. | Missing entry: `key-not-found`. |
| 7 | Inspect the located key's lifecycle state. | `revoked`: `key-revoked`; `active` or `retired`: continue. |
| 8 | RFC 8785-canonicalize the parsed body and byte-compare it with the decoded payload bytes. | Difference: `canonicalization-mismatch`. |
| 9 | Verify `signatures[0].sig` over standard PAE from § 4.5 using the decoded payload bytes. | Success: select `dsse-v1` and continue at step 12; failure: continue. |
| 10 | If the body is v1.4, stop. Corrected-profile signature failures are never eligible for historical fallback. | `signature-invalid`. Historical v1.1-v1.3: continue. |
| 11 | If legacy policy is `reject`, stop. Otherwise verify the signature over historical base64-text PAE (§ 5.4). | Reject policy: `legacy-profile-rejected`; failed legacy signature: `signature-invalid`; success: select `lattice-legacy-base64-pae` and continue. |
| 12 | Require the signed `body.kid` to equal the located `KeyEntry.kid` (and therefore the envelope lookup identifier). | Mismatch: `signature-invalid`; match: return success with the selected profile, deprecation flag, body, and key state. |

Step 3 deliberately admits the two too-low forms so they reach the unambiguous downgrade
chokepoint at step 4. JSON Schema validation for a declared version MAY be performed as part
of the step-3 body check, but it MUST preserve the result ordering above.

At step 6, envelope `keyid` is an unauthenticated routing hint until signature verification
and the step-12 signed-body cross-check both pass. Implementations MUST NOT treat successful
key lookup alone as proof of key identity.

### § 5.2  VerifyErrorKind Taxonomy

The following nine error kinds are the complete protocol set.

| Error Kind | Step(s) | Description |
|------------|---------|-------------|
| `envelope-malformed` | 1-2 | The envelope, canonical base64, signature list, payload type, or payload JSON is malformed. |
| `version-mismatch` | 3 | The body shape is unsupported or the version is an unrecognized literal. |
| `schema-version-too-low` | 4 | Version is absent or exactly `lattice-receipt/v1`; rejection occurs before key or crypto work. |
| `signature-profile-mismatch` | 5 | v1.4 is missing exact `dsse-v1`, or a historical version declares a signature profile. |
| `key-not-found` | 6 | No key entry exists for the first envelope signature's `keyid`. |
| `key-revoked` | 7 | The located key is revoked. |
| `canonicalization-mismatch` | 8 | Re-canonicalized body bytes differ from decoded payload bytes. |
| `signature-invalid` | 9-12 | Neither eligible signature path verifies, v1.4 standard verification fails, or signed `kid` differs. |
| `legacy-profile-rejected` | 11 | A historical receipt needs the deprecated verification path while policy is `reject`. |

### § 5.3  Successful Result and Legacy Policy

A successful result MUST expose:

- `verificationProfile: "dsse-v1"` and `deprecated: false` when standard PAE verifies.
- `verificationProfile: "lattice-legacy-base64-pae"` and `deprecated: true` when the
  bounded historical path verifies.
- The parsed body and located key state.

The direct-library default legacy policy is `allow` for the v1.6 bridge. A strict consumer
sets `reject`. Policy `reject` disables only the deprecated fallback: a v1.1-v1.3 receipt
whose standard DSSE signature verifies still succeeds as `dsse-v1` and is not deprecated.
Compatibility acceptance MUST NOT be collapsed into a bare boolean because callers need to
distinguish current conformance from historical acceptance.

### § 5.4  Bounded Historical Verification

Historical v1.1-v1.3 receipts created by earlier Lattice releases may have signed the
envelope's base64 payload text rather than the decoded canonical bytes. Their verification-only
PAE is:

```
legacyPAE = UTF8("DSSEv1 " + LEN(UTF8(payloadType)) + " " + payloadType
                 + " " + LEN(UTF8(payloadBase64)) + " " + payloadBase64)
```

For Lattice's fixed payload type and canonical standard-base64 payload, both inputs are ASCII.
This path MUST run only after standard verification fails, only for v1.1-v1.3, and only when
legacy policy is `allow`. It MUST NOT be used to mint receipts. A v1.4 standard signature
failure terminates at step 10 and MUST NOT fall back.

### § 5.5  Downgrade Defense (CRYPTO-01)

Implementations MUST reject an absent `body.version` or exact
`body.version === "lattice-receipt/v1"` at step 4, before key lookup, key-state checks,
canonicalization, or signature verification. This ordering prevents a too-low body from
bypassing commitments added by versioned schemas and makes `schema-version-too-low` the
stable first-match verdict regardless of key state.

---

## § 6  outputHash Algorithm (SPEC-04)

### § 6.1  Normative Type-Dispatch

`outputHash` is computed by the `fingerprintArtifactValue` type-dispatch function
(`packages/lattice/src/storage/fingerprint.ts`). The type-dispatch is:

1. **null branch:** If `outputs` is `undefined` or `null`, then `outputHash = null`.

2. **string branch:** If `typeof outputs === "string"`, then
   `outputHash = sha256hex(UTF-8(outputs))`.

3. **Uint8Array branch:** If `outputs instanceof Uint8Array`, then
   `outputHash = sha256hex(outputs)`.

4. **ArrayBuffer branch:** If `outputs instanceof ArrayBuffer`, then
   `outputHash = sha256hex(new Uint8Array(outputs))`.

5. **Blob-like branch:** If `outputs` has an `.arrayBuffer()` method (is Blob-like), then
   `outputHash = sha256hex(new Uint8Array(await outputs.arrayBuffer()))`.

6. **Object branch:** Otherwise (object, array, number, boolean, etc.),
   `outputHash = sha256hex(UTF-8(JSON.stringify(outputs)))`.

In all cases, `sha256hex(bytes)` denotes the lowercase hexadecimal SHA-256 digest of
`bytes`. The result MUST be stored as bare 64-character lowercase hex with NO `sha256:`
prefix. The pattern `^[0-9a-f]{64}$` matches the non-null form.

These six branches are evaluated in the order listed above; earlier branches take priority.

### § 6.2  Non-Normative Caveat — Object-Output Determinism (D-10) (non-normative)

Branch 6 (object/array/number/boolean output) requires byte-identical ECMAScript
`JSON.stringify` behavior to reproduce the `outputHash` across language implementations.
The following cross-language divergences are empirically confirmed between TypeScript
(`JSON.stringify`) and Python (`json.dumps`):

1. **Exponent zero-padding:** `1e-7` → JS produces `"1e-7"`, Python produces `"1e-07"`.
2. **Integral float:** `100.0` → JS produces `"100"`, Python produces `"100.0"`.
3. **Large values:** Values ≥ 10²¹ → JS switches to exponent form; Python may not.
4. **Small values:** Values < 10⁻⁶ → JS switches to exponent form; Python uses fixed decimal.
5. **Negative zero:** `-0` → JS `JSON.stringify` produces `"0"`; Python `json.dumps` produces `"0"`.
6. **Key insertion order:** JS objects preserve property insertion order; Python 3.7+ dicts
   preserve insertion order, but the order may differ depending on how the object was
   constructed.

These divergences mean that object-output `outputHash` is NOT reliably reproducible across
language boundaries without byte-identical `JSON.stringify` semantics.

### § 6.3  Conformance Boundary (D-11)

For v1.5 conformance purposes, implementations MUST reproduce `outputHash` only for the
following branches:

- Branch 1 (null)
- Branch 2 (string)
- Branches 3–5 (Uint8Array, ArrayBuffer, Blob-like)

Object-output `outputHash` (branch 6) is implementation-defined and outside v1.5
conformance scope. Conformance vectors (Phase 51) do not include object-output cases.
An implementation is NOT required to reproduce branch-6 `outputHash` values to be
considered conformant with v1.5 of this specification.

---

## § 7  Key Model

### § 7.1  KeySet / KeyEntry / KeyState

**KeySet:** An object with a single method `lookup(kid: string): KeyEntry | undefined`.
The `lookup` method is the sole interface for locating a key during verification. The
internal data structure of a `KeySet` is implementation-defined.

**KeyEntry:** An object with the following fields:
- `kid` (string): the key identifier.
- `publicKeyJwk` (JsonWebKey): the Ed25519 public key in JWK OKP format.
- `state` (KeyState): the current key lifecycle state.

**KeyState:** One of three string literals:
- `"active"`: the key is in use for signing and verification.
- `"retired"`: the key MAY be used for verification of historical receipts but MUST NOT be
  used for signing new receipts.
- `"revoked"`: the key MUST NOT be used for signing or verification. Step 7 of the
  verification algorithm (§ 5.1) returns `key-revoked` for any receipt whose signing key
  has state `"revoked"`.

### § 7.2  JWK OKP Encoding (RFC 8037)

Ed25519 keys MUST be represented as JSON Web Keys (JWK) with the following fields:
- `kty`: MUST be `"OKP"`.
- `crv`: MUST be `"Ed25519"`.
- `x`: the 32-byte public key, encoded using base64url (RFC 4648 § 5) with no `=` padding.
- `d`: the 32-byte private key, encoded using base64url (RFC 4648 § 5) with no `=` padding.
  Present only in private-key JWK representations.

The `x` and `d` fields MUST use base64url (alphabet `A-Za-z0-9-_`, no `=` padding). This
is distinct from the standard base64 (RFC 4648 § 4, alphabet `A-Za-z0-9+/`, with `=`
padding) used for the envelope `payload` and `sig` fields.

### § 7.3  kid Cross-Check Invariant

The `kid` field in the receipt body MUST equal the `keyid` field in `signatures[0]` of the
DSSE envelope. Envelope `keyid` is an unauthenticated lookup hint; it becomes trustworthy
only after signature verification and step 12. That step compares the signed `body.kid` to
the located entry's `kid` and returns `signature-invalid` on mismatch. This prevents an
attacker from routing verification to a different key while retaining a conflicting signed
identifier.

---

## § 8  Schema Versioning

### § 8.1  Accepted Version Set

The following are the ONLY accepted version strings. Implementations MUST reject all other
version strings at step 3 or step 4 of the verification algorithm (§ 5.1). Acceptance is
checked by EXACT STRING EQUALITY — prefix matching is explicitly prohibited.

```
"lattice-receipt/v1.1"
"lattice-receipt/v1.2"
"lattice-receipt/v1.3"
"lattice-receipt/v1.4"
```

The string `"lattice-receipt/v1"` (no minor version component) is permanently rejected at
step 4 (CRYPTO-01). A receipt body with an absent or undefined `version` field is also
rejected at step 4.

### § 8.2  Version String Format

Version strings follow the pattern `"lattice-receipt/v{major}.{minor}"`. The current issuance
version is v1.4. Every conforming minter forces `version = "lattice-receipt/v1.4"` and
`signatureProfile = "dsse-v1"`. Historical v1.1-v1.3 bodies remain verifiable under the
ordered policy in § 5, but no conforming minter emits them. Future versions require an
explicit schema and version/profile rule; prefix or optimistic version matching is forbidden.

### § 8.3  Conformance Boundary (D-11 cross-reference)

See § 6.3 for the `outputHash` conformance boundary. The JSON Schema files in
`spec/schema/` define the complete field inventory for each version. An implementation is
conformant for a given version if:

(a) it accepts all positive conformance vectors for that version,
(b) it rejects all negative conformance vectors with the correct `VerifyErrorKind`, and
(c) it reproduces `outputHash` for string, binary (Uint8Array/ArrayBuffer/Blob), and null
    output types.

Object-output `outputHash` (branch 6 of § 6.1) is implementation-defined and outside v1.5
conformance scope.

---

## § 9  Normative References

- **[RFC 2119]** Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels,"
  BCP 14, RFC 2119, March 1997. https://www.rfc-editor.org/rfc/rfc2119

- **[RFC 8174]** Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words,"
  BCP 14, RFC 8174, May 2017. https://www.rfc-editor.org/rfc/rfc8174

- **[RFC 8785]** Rundgren, A., Jordan, B., Erdtman, S., "JSON Canonicalization Scheme
  (JCS)," RFC 8785, June 2020. https://www.rfc-editor.org/rfc/rfc8785

- **[RFC 4648]** Josefsson, S., "The Base16, Base32, and Base64 Data Encodings," RFC 4648,
  October 2006. https://www.rfc-editor.org/rfc/rfc4648

- **[RFC 7493]** Bray, T., "The I-JSON Message Format," RFC 7493, March 2015.
  https://www.rfc-editor.org/rfc/rfc7493

- **[RFC 8037]** Liusvaara, I., "CFRG Elliptic Curves for JOSE," RFC 8037, January 2017.
  https://www.rfc-editor.org/rfc/rfc8037

- **[RFC 8032]** Josefsson, S., Liusvaara, I., "Edwards-Curve Digital Signature Algorithm
  (EdDSA)," RFC 8032, January 2017. https://www.rfc-editor.org/rfc/rfc8032

- **[DSSE]** secure-systems-lab, "Dead Simple Signing Envelope v1.0,"
  https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md

---

## Appendix A — Informative References (non-normative)

- **Lattice paper** (`paper/main.tex`): Expository description of the Lattice capability
  receipt protocol. Normative authority rests with the reference implementation, not the
  paper (D-02). The paper is a useful introduction to the protocol concepts but must not
  be used as a source of normative behavior.

- **canonicalize npm package v3.0.0**: The RFC 8785 JCS implementation used by the
  reference implementation. Imported as `"canonicalize"` in `packages/lattice/src/receipts/canonical.ts`.
  This package is the canonical RFC 8785 implementation for the TypeScript reference;
  other implementations MUST comply with RFC 8785 directly rather than replicating this
  package's behavior.
