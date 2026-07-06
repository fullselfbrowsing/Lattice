# Phase 50: Protocol Specification - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 7 (5 new documentation files + 1 new script + 1 new fixture)
**Analogs found:** 1 / 7 (strong code analog for the generator script; documentation files have no in-repo analog — source-of-truth derivation paths documented instead)

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `spec/SPEC.md` | documentation/normative-spec | derived-from-impl | NO ANALOG — derived from `packages/lattice/src/receipts/*.ts` + `storage/fingerprint.ts` | source-derivation |
| `spec/CHANGELOG.md` | documentation/changelog | derived-from-impl | NO ANALOG (structural ref: `packages/lattice/CHANGELOG.md`) | format-only |
| `spec/schema/v1.1.json` | schema/machine-checkable | CRUD-validation | NO ANALOG — derived from `packages/lattice/src/receipts/types.ts` `CapabilityReceiptBody` | source-derivation |
| `spec/schema/v1.2.json` | schema/machine-checkable | CRUD-validation | NO ANALOG — derived from `packages/lattice/src/receipts/types.ts` `CapabilityReceiptBody` | source-derivation |
| `spec/schema/v1.3.json` | schema/machine-checkable | CRUD-validation | NO ANALOG — derived from `packages/lattice/src/receipts/types.ts` `CapabilityReceiptBody` | source-derivation |
| `spec/generate-vector0.ts` | utility/generator-script | transform (sign + encode) | `packages/lattice/src/receipts/receipt.ts` `createReceipt` + `sign.ts` + `cid.ts` | exact role-match |
| `spec/vector0-fixture.json` | fixture/committed-artifact | static | `packages/lattice/src/receipts/canonical.test.ts` `makeBody()` fixture shape | partial |

---

## Pattern Assignments

### `spec/SPEC.md` (normative documentation)

**No direct in-repo analog.** This is a new top-level document. Its content is a faithful transcription of the reference implementation. See "Source-of-Truth Derivation" below for the files each section is derived from.

**Section-to-implementation mapping:**

| SPEC.md Section | Derived From | File | Key Lines |
|----------------|--------------|------|-----------|
| § 3 Receipt Body Schema — all fields | `CapabilityReceiptBody` interface | `packages/lattice/src/receipts/types.ts` | 43–88 |
| § 3 `ContractVerdict` enum | `ContractVerdict` type | `packages/lattice/src/receipts/types.ts` | 14–19 |
| § 3 `ReceiptEnvelope` shape + `payloadType` literal | `ReceiptEnvelope` interface | `packages/lattice/src/receipts/types.ts` | 95–99 |
| § 3 `KeySet`/`KeyEntry`/`KeyState` | Three interfaces | `packages/lattice/src/receipts/types.ts` | 107–117 |
| § 4.1 Assemble body (ordering invariant) | `createReceipt` steps 1–7 comment + body assembly | `packages/lattice/src/receipts/receipt.ts` | 66–154 |
| § 4.2 Redact | `redactReceiptBody` + sort invariant | `packages/lattice/src/receipts/redact.ts` | 38–72 |
| § 4.3 JCS Canonicalize | `canonicalizeReceiptBody` + `stringifyCostUsd` | `packages/lattice/src/receipts/canonical.ts` | 1–59 |
| § 4.4 Base64 encode payload | `base64Encode` | `packages/lattice/src/receipts/envelope.ts` | 35–37 |
| § 4.5 Build PAE | `buildPae` + `PAYLOAD_TYPE` | `packages/lattice/src/receipts/envelope.ts` | 31, 57–71 |
| § 4.6 Ed25519 sign | `sign()` in `createInMemorySigner` | `packages/lattice/src/receipts/sign.ts` | 25, 108–113 |
| § 4.7 Encode DSSE envelope | `encodeEnvelope` | `packages/lattice/src/receipts/envelope.ts` | 81–94 |
| § 4.8 Derive CID | `receiptCid` | `packages/lattice/src/receipts/cid.ts` | 25–41 |
| § 5 Verification algorithm (10 steps) | `verifyReceipt` decision tree + comments | `packages/lattice/src/receipts/verify.ts` | 75–179 |
| § 5.2 `VerifyErrorKind` taxonomy (7 kinds) | `VerifyErrorKind` union | `packages/lattice/src/receipts/types.ts` | 119–126 |
| § 6 `outputHash` type-dispatch | `fingerprintArtifactValue` / `valueToBytes` | `packages/lattice/src/storage/fingerprint.ts` | 5–42 |
| § 7 Key Model / JWK OKP | `importEd25519PrivateKey`, `generateEd25519KeyPairJwk`, `createInMemorySigner` | `packages/lattice/src/receipts/sign.ts` | 39–66, 92–114 |
| § 8 Version enum + accepted set | `asReceiptBody` version-gate + `fail(schema-version-too-low)` | `packages/lattice/src/receipts/verify.ts` | 43–51, 127–132 |

**Fixed constants to pin verbatim in SPEC.md** (extracted from source):

```typescript
// packages/lattice/src/receipts/envelope.ts line 31
export const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;

// packages/lattice/src/receipts/redact.ts line 10
export const DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1";

// packages/lattice/src/receipts/sign.ts line 25
const ALG = "Ed25519" as const;

// packages/lattice/src/receipts/receipt.ts line 95
const version: CapabilityReceiptBody["version"] = "lattice-receipt/v1.3";
```

**Accepted version set** (from `verify.ts` `asReceiptBody`, lines 43–51 — exact string equality, not prefix match):
- `"lattice-receipt/v1.1"`
- `"lattice-receipt/v1.2"`
- `"lattice-receipt/v1.3"`
- (v1 and absent: pass shape-check, rejected at step 4 — `schema-version-too-low`)

---

### `spec/CHANGELOG.md` (per-version changelog)

**No direct content analog.** Format reference: `packages/lattice/CHANGELOG.md` (uses `## <version>` sections with bullet lists). The spec CHANGELOG uses protocol version strings as headings (not npm semver), three sections in descending order (v1.3, v1.2, v1.1), and documents field additions only — not signing/verification behavior changes unless they affected the wire format.

**Per-version delta content source:**

| Version | Fields Added | Derived From |
|---------|-------------|--------------|
| `lattice-receipt/v1.3` | `parentReceiptCid`, `lineageMerkleRoot` (both optional `sha256:<hex>`) | `packages/lattice/src/receipts/types.ts` lines 63–68; `packages/lattice/src/receipts/receipt.ts` lines 108–109 |
| `lattice-receipt/v1.2` | `modelClass` (optional `TrainingClass` enum) | `packages/lattice/src/receipts/types.ts` line 58; `packages/lattice/src/capabilities/profile.ts` (5 values: `frontier_rlhf`, `mid_tier_rlhf`, `open_weight_instruct`, `open_weight_base`, `local_quantized`) |
| `lattice-receipt/v1.1` | Step-marker fields: `stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp`; formalized `redactionPolicyId` + `redactions[]` | `packages/lattice/src/receipts/types.ts` lines 79–88 |

---

### `spec/schema/v1.1.json`, `spec/schema/v1.2.json`, `spec/schema/v1.3.json` (JSON Schema draft 2020-12)

**No existing JSON Schema files in the repo.** All three schemas are derived from `packages/lattice/src/receipts/types.ts` (`CapabilityReceiptBody`) using the constraints in D-06/D-07/D-08.

**Shared schema skeleton** (all three files; version enum differs):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lattice-protocol.dev/spec/schema/v1.X.json",
  "title": "Lattice Capability Receipt Body v1.X",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "version", "receiptId", "runId", "issuedAt", "kid",
    "model", "route", "usage",
    "contractVerdict", "contractHash",
    "inputHashes", "outputHash",
    "redactionPolicyId", "redactions"
  ],
  "properties": { ... }
}
```

**Key I-JSON constraint patterns** (apply identically in all three files; derived from `types.ts` + `canonical.ts`):

```json
"promptTokens": {
  "type": "integer",
  "minimum": 0,
  "maximum": 9007199254740991,
  "$comment": "I-JSON safe integer (2^53-1). MUST be encoded as bare integer without fraction or exponent."
},
"completionTokens": {
  "type": "integer",
  "minimum": 0,
  "maximum": 9007199254740991,
  "$comment": "I-JSON safe integer (2^53-1). MUST be encoded as bare integer without fraction or exponent."
},
"costUsd": {
  "oneOf": [
    {
      "type": "string",
      "pattern": "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$",
      "description": "Finite decimal string. MUST NOT be a JSON number.",
      "$comment": "NaN and Infinity -> null (canonical.ts stringifyCostUsd). Number.prototype.toString() output."
    },
    { "type": "null" }
  ]
},
"outputHash": {
  "oneOf": [
    {
      "type": "string",
      "minLength": 64,
      "maxLength": 64,
      "pattern": "^[0-9a-f]{64}$",
      "description": "Bare lowercase hex SHA-256 (64 chars, NO sha256: prefix). See fingerprint.ts."
    },
    { "type": "null" }
  ]
},
"contractHash": {
  "oneOf": [
    { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
    { "type": "null" }
  ]
},
"inputHashes": {
  "type": "array",
  "items": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
  "$comment": "Each entry is bare lowercase hex SHA-256 (no sha256: prefix). See RESEARCH.md Open Question #1 resolution."
},
"contractVerdict": {
  "type": "string",
  "enum": ["success", "tripwire-violated", "no-contract-match", "execution-failed", "validation-failed"]
}
```

Source for `ContractVerdict` enum: `packages/lattice/src/receipts/types.ts` lines 14–19.

**`outputHash` and `inputHashes` bare-hex vs prefix:** RESOLVED in RESEARCH.md Open Question #1: `fingerprintArtifactValue` returns `{ value: toHex(...) }` (bare hex, no prefix). `create-ai.ts:1241` stores `.value` directly. Pattern is `^[0-9a-f]{64}$`, NOT `^sha256:[0-9a-f]{64}$`. Only `parentReceiptCid`, `lineageMerkleRoot`, `contractHash`, and CID strings use the `sha256:` prefix.

**v1.3-only fields** (absent from v1.1.json and v1.2.json; derived from `types.ts` lines 63–68):

```json
"parentReceiptCid": {
  "type": "string",
  "pattern": "^sha256:[0-9a-f]{64}$",
  "description": "sha256:<hex> CID of the parent envelope for receipt chaining."
},
"lineageMerkleRoot": {
  "type": "string",
  "pattern": "^sha256:[0-9a-f]{64}$",
  "description": "sha256:<hex> provenance root for artifact lineage."
}
```

**v1.2-only field** (absent from v1.1.json; present and optional in v1.2.json and v1.3.json):

```json
"modelClass": {
  "type": "string",
  "enum": ["frontier_rlhf", "mid_tier_rlhf", "open_weight_instruct", "open_weight_base", "local_quantized"],
  "description": "Model training-class audit tag. TrainingClass from capabilities/profile.ts."
}
```

Source: `packages/lattice/src/capabilities/profile.ts` lines 61–66 (5 values, verified via RESEARCH.md Open Question #2 resolution).

**`additionalProperties: false` enforcement** (D-06): Because each schema is flat and standalone with `additionalProperties: false`, every allowed field (including all optional ones) MUST appear in the `properties` object even though they are not in `required`. Omitting an optional field from `properties` would cause `additionalProperties: false` to reject any receipt that carries that field.

---

### `spec/generate-vector0.ts` (generator script — strongest code analog)

**Analog:** `packages/lattice/src/receipts/receipt.ts` `createReceipt` (exact role-match: assembles, redacts, canonicalizes, signs, encodes, derives CID)

This is the one file with a strong code analog. The generator script calls the same pipeline functions that `createReceipt` orchestrates, but with fixed (committed) inputs instead of runtime-generated values, and writes the intermediate byte values to `spec/vector0-fixture.json`.

**Imports pattern** — copy from `receipt.ts` lines 1–21 but scoped to the generator's needs:

```typescript
// spec/generate-vector0.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { canonicalizeReceiptBody } from "../packages/lattice/src/receipts/canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
  encodeEnvelope,
} from "../packages/lattice/src/receipts/envelope.js";
import { DEFAULT_REDACTION_POLICY_ID, redactReceiptBody } from "../packages/lattice/src/receipts/redact.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../packages/lattice/src/receipts/sign.js";
import { receiptCid } from "../packages/lattice/src/receipts/cid.js";
import type { CapabilityReceiptBody } from "../packages/lattice/src/receipts/types.js";
```

**Core pipeline pattern** — mirrors `receipt.ts` lines 89–153 (ordering INVARIANT: redact → canonicalize → base64 → PAE → sign → encode):

```typescript
// receipt.ts lines 134–153 — the exact same steps, used verbatim in the generator
// Step 2: redact BEFORE canonicalize
const { body } = redactReceiptBody(body0, policyId);

// Step 3: canonicalize the redacted body (RFC 8785 JCS)
const payloadBytes = canonicalizeReceiptBody(body);

// Step 4: base64-encode for the envelope (DSSE wire format)
const payload = base64Encode(payloadBytes);

// Step 5: build PAE — Pre-Authentication Encoding per DSSE v1.0
const pae = buildPae(PAYLOAD_TYPE, payload);

// Step 6: sign the PAE bytes
const sig = await signer.sign(pae);

// Step 7: assemble the envelope
const envelope = encodeEnvelope({
  payloadBytes,
  signatures: [{ keyid: signer.kid, sig }],
});

// Step 8: derive CID (cid.ts)
const cid = await receiptCid(envelope);
```

**Ed25519 signer pattern** — from `sign.ts` lines 92–114:

```typescript
// sign.ts lines 92–114 — createInMemorySigner usage pattern
const signer = createInMemorySigner(privateKeyJwk, {
  kid: "spec-example-key-v0",
  publicKeyJwk,
});
// signer.sign(paeBytes) → Promise<Uint8Array> (64 bytes raw Ed25519)
// crypto.subtle.sign("Ed25519", key, toArrayBuffer(bytes)) — sign.ts line 110
```

**CID derivation pattern** — from `cid.ts` lines 25–41:

```typescript
// cid.ts lines 25–41
export async function receiptCid(envelope: ReceiptEnvelope): Promise<string> {
  const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
  // NOTE: CID uses sha256: prefix; outputHash does NOT
}
```

**Hex serialization pattern** (for emitting intermediate bytes to fixture — from `fingerprint.ts` lines 48–50 and `cid.ts`):

```typescript
// fingerprint.ts lines 48–50 — toHex helper pattern used throughout
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
```

**Fixed body shape for vector #0** — modeled on `canonical.test.ts` `makeBody()` (lines 11–39) but with:
- `version: "lattice-receipt/v1.3"` (forced by `receipt.ts` line 95)
- Fixed UUID `receiptId` (never `crypto.randomUUID()`)
- Fixed `issuedAt` ISO timestamp
- `stepName: "分析-step"` (non-ASCII for JCS edge case, per D-04)
- At least one entry in `redactions[]` (exercised via a `tripwireEvidence.kind === "no-pii"` trigger per `redact.ts` lines 46–56, or manually pushed)
- `outputHash: null` (avoids bare-hex vs prefix ambiguity in the example)

```typescript
// Modeled on canonical.test.ts makeBody() lines 11–39
const body0: CapabilityReceiptBody = {
  version: "lattice-receipt/v1.3",
  receiptId: "00000000-0000-4000-a000-000000000001",  // fixed, never random
  runId: "spec-vector-0",
  issuedAt: "2026-06-25T00:00:00.000Z",              // fixed timestamp
  kid: "spec-example-key-v0",
  stepName: "分析-step",                               // non-ASCII JCS edge case (D-04)
  model: { requested: "claude-3-5-sonnet", observed: "claude-3-5-sonnet-20241022" },
  route: { providerId: "anthropic", capabilityId: "chat", attemptNumber: 1 },
  usage: { promptTokens: 100, completionTokens: 42, costUsd: "0.001250" },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: null,
  redactionPolicyId: DEFAULT_REDACTION_POLICY_ID,
  redactions: [],  // populated by redactReceiptBody
};
```

**Fixture output shape** — what to write to `spec/vector0-fixture.json`:

```json
{
  "body": { ... },
  "canonicalBytesHex": "...",
  "payloadBase64": "...",
  "paeHex": "...",
  "signatureHex": "...",
  "envelope": { "payloadType": "...", "payload": "...", "signatures": [...] },
  "cid": "sha256:...",
  "publicKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "..." }
}
```

---

### `spec/vector0-fixture.json` (committed artifact)

**Partial analog:** `packages/lattice/src/receipts/canonical.test.ts` `makeBody()` fixture (lines 11–39) provides the body shape pattern. The fixture JSON is the generator script's output — not hand-authored. Its schema is defined by the "Fixture output shape" above.

---

## Shared Patterns

### Ordering Invariant: redact → canonicalize → PAE → sign → encode
**Source:** `packages/lattice/src/receipts/receipt.ts` lines 66–154 (function comment + step-numbered body)
**Apply to:** `spec/SPEC.md` § 4 signing pipeline; `spec/generate-vector0.ts`

```typescript
// receipt.ts lines 66–70 — ordering invariant comment (copy verbatim into SPEC.md § 4 intro)
// Ordering INVARIANT (09-CONTEXT.md, PITFALLS.md Pitfall #1):
//   redact -> canonicalize -> PAE -> sign -> encode
//
// The signed digest commits to canonicalize(redact(body)).
```

### Downgrade Defense Short-Circuits Before Crypto
**Source:** `packages/lattice/src/receipts/verify.ts` lines 119–132 (step 4 comment + guard)
**Apply to:** `spec/SPEC.md` § 5 verification algorithm — step 4 MUST appear before steps 5–8

```typescript
// verify.ts lines 119–132
// Step 4: receipt-downgrade defense (CRYPTO-01).
// Short-circuits before any cryptographic work (keyset lookup, canonical
// re-check, signature verify) so the downgrade verdict is unambiguous.
if (body.version === undefined || body.version === "lattice-receipt/v1") {
  return fail(
    "schema-version-too-low",
    "Receipt body.version must be 'lattice-receipt/v1.1', 'lattice-receipt/v1.2', or 'lattice-receipt/v1.3' — v1 receipts are not accepted (CRYPTO-01).",
  );
}
```

### Standard Base64 (NOT base64url) for payload and sig
**Source:** `packages/lattice/src/receipts/envelope.ts` lines 35–41
**Apply to:** `spec/SPEC.md` § 4.4 and § 4.7; `spec/generate-vector0.ts`

```typescript
// envelope.ts lines 35–41
export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");  // standard alphabet A-Za-z0-9+/ with = padding
}
export function base64Decode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}
// MUST NOT use base64url (no - or _ characters). base64url ONLY for JWK d and x fields (RFC 8037).
```

### Re-Canonicalization Byte-Compare in Verifier
**Source:** `packages/lattice/src/receipts/verify.ts` lines 147–156 (step 7)
**Apply to:** `spec/SPEC.md` § 5 step 7 (canonicalization-mismatch)

```typescript
// verify.ts lines 147–156
// Step 6: re-canonicalize body and compare byte-for-byte against decoded.payloadBytes.
const reCanonical = canonicalizeReceiptBody(body);
if (!bytesEqual(reCanonical, decoded.payloadBytes)) {
  return fail(
    "canonicalization-mismatch",
    "re-canonicalized body does not match signed payload bytes",
  );
}
```

### body.kid === envelope keyid Defense-in-Depth (Step 9)
**Source:** `packages/lattice/src/receipts/verify.ts` lines 170–176
**Apply to:** `spec/SPEC.md` § 5 step 9

```typescript
// verify.ts lines 170–176
// Step 8: defense-in-depth — body.kid MUST equal envelope keyid.
if (body.kid !== entry.kid) {
  return fail(
    "signature-invalid",
    `body.kid "${body.kid}" does not match envelope keyid "${entry.kid}"`,
  );
}
```

### costUsd I-JSON Conversion (Never a Raw Float)
**Source:** `packages/lattice/src/receipts/canonical.ts` lines 19–23
**Apply to:** `spec/SPEC.md` § 3.3 and § 4.1; all three JSON Schema `costUsd` properties

```typescript
// canonical.ts lines 19–23
export function stringifyCostUsd(costUsd: number | null): string | null {
  if (costUsd === null) return null;
  if (!Number.isFinite(costUsd)) return null;  // NaN/Infinity -> null
  return costUsd.toString();
}
```

### outputHash Type-Dispatch (normative, SPEC-04)
**Source:** `packages/lattice/src/storage/fingerprint.ts` lines 22–42
**Apply to:** `spec/SPEC.md` § 6.1 normative type-dispatch

```typescript
// fingerprint.ts lines 22–42
async function valueToBytes(value: unknown): Promise<Uint8Array | undefined> {
  if (typeof value === "string") return textEncoder.encode(value);         // UTF-8 encode
  if (value instanceof Uint8Array) return value;                           // raw bytes
  if (value instanceof ArrayBuffer) return new Uint8Array(value);          // raw bytes
  if (isBlobLike(value)) return new Uint8Array(await value.arrayBuffer()); // raw bytes
  const serialized = JSON.stringify(value);                                 // object branch
  return serialized === undefined ? undefined : textEncoder.encode(serialized);
}
// fingerprintArtifactValue returns { algorithm: "sha256", value: toHex(sha256(bytes)) }
// CRITICAL: .value is BARE lowercase hex (64 chars). No "sha256:" prefix.
// Only receiptCid / parentReceiptCid / lineageMerkleRoot carry the "sha256:" prefix.
```

### Redact Sort Invariant
**Source:** `packages/lattice/src/receipts/redact.ts` lines 57–61
**Apply to:** `spec/SPEC.md` § 4.2

```typescript
// redact.ts lines 57–61
// Sort redactions by path for canonical-form stability
const sorted = [...redactions].sort((a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
);
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `spec/SPEC.md` | normative-spec | derived-from-impl | No normative spec documents exist in the repo; paper/main.tex is expository and caps at v1.2 |
| `spec/CHANGELOG.md` | changelog | derived-from-impl | No protocol-version changelog exists; `packages/lattice/CHANGELOG.md` is npm semver format, not protocol-version delta format |
| `spec/schema/v1.1.json` | JSON Schema | CRUD-validation | No JSON Schema files exist in the repo; field definitions derived directly from `types.ts` |
| `spec/schema/v1.2.json` | JSON Schema | CRUD-validation | Same — no JSON Schema analog |
| `spec/schema/v1.3.json` | JSON Schema | CRUD-validation | Same — no JSON Schema analog |

For all documentation files and JSON Schemas with no analog: the planner MUST use the RESEARCH.md pattern tables (§ "JSON Schema File Content Strategy" and § "SPEC.md Section Layout") plus the source-of-truth derivation table above as the authoring guide.

---

## Critical Precision Notes for Planner

These are byte-level decisions that break cross-language parity when wrong. Each maps to a normative MUST clause in SPEC.md.

1. **outputHash prefix:** bare 64-char lowercase hex, NO `sha256:` prefix (resolved). Pattern: `^[0-9a-f]{64}$`. Source: `fingerprint.ts` `toHex()` + `create-ai.ts:1241` stores `.value` directly.

2. **inputHashes prefix:** same — bare hex, NO `sha256:` prefix. `types.ts` line 74: `readonly inputHashes: readonly string[]`.

3. **PAE signs base64 string, not raw bytes:** `envelope.ts` `buildPae` receives `payloadBase64` (a string), not `payloadBytes`. The signature is over `UTF-8(PAE_string)`, not over canonical bytes.

4. **JCS key sort is UTF-16BE code-unit order** (RFC 8785 §3.2.3), not UTF-8 bytes or Unicode codepoints. Receipt body keys are all ASCII (no divergence in practice), but the spec must state the rule.

5. **Downgrade step order:** step 4 (version check) fires BEFORE step 5 (keyset lookup) and BEFORE steps 7–8 (crypto). `verify.ts` lines 119–132 precede lines 135–165 — copy this ordering exactly into SPEC.md § 5.

6. **`body.kid` assignment:** `receipt.ts` forces `kid: signer.kid` (line 104) — caller cannot supply a different kid. This is enforced by `CreateReceiptInput` having no `kid` field. SPEC.md § 4.1 MUST state this as a normative invariant.

7. **Standard base64 vs base64url:** `payload` and `sig` fields use standard base64 (`+`, `/`, `=`). JWK `d` and `x` use base64url (no `=`, uses `-` and `_`). Spec must call both out explicitly.

8. **modelClass in schemas:** 5 exact enum values from `capabilities/profile.ts` (resolved): `"frontier_rlhf"`, `"mid_tier_rlhf"`, `"open_weight_instruct"`, `"open_weight_base"`, `"local_quantized"`. Optional (not in `required`) in v1.2 and v1.3 schemas; absent entirely from v1.1 schema.

---

## Metadata

**Analog search scope:** `packages/lattice/src/receipts/`, `packages/lattice/src/storage/`, `scripts/`, repo root docs
**Files read:** `receipt.ts`, `canonical.ts`, `envelope.ts`, `cid.ts`, `sign.ts`, `verify.ts`, `redact.ts`, `fingerprint.ts`, `types.ts`, `canonical.test.ts`, `packages/lattice/CHANGELOG.md`
**Pattern extraction date:** 2026-06-25
