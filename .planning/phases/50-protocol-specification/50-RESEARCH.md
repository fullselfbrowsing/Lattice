# Phase 50: Protocol Specification - Research

**Researched:** 2026-06-25
**Domain:** Versioned language-neutral normative specification authoring — SPEC.md, three JSON Schema files, CHANGELOG.md
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** SPEC.md uses a hybrid normative style — RFC-2119/BCP-14 (RFC 8174) keyword stanza; numbered MUST/SHOULD/MAY clauses; dedicated normative pipeline algorithm section (assemble → redact → JCS canonicalize → base64 payload → build PAE → Ed25519 sign → encode envelope → derive CID) with a worked hex example; the three JSON Schema files declared normative; a normative VerifyErrorKind taxonomy + verification algorithm; all examples and rationale tagged "(non-normative)". Mirrors DSSE v1.0, in-toto attestation, Sigstore bundle, C2PA spec structure — each numbered clause traces 1:1 to a Phase 51 conformance vector.
- **D-02:** The live TypeScript reference implementation is the normative tie-breaker. Where `paper/main.tex` and the implementation diverge, the implementation wins. The paper is expository scaffolding only. Concrete divergence: the paper caps at v1.2 and never documents v1.3 fields `parentReceiptCid` / `lineageMerkleRoot` — the spec MUST document v1.3.
- **D-03:** Worked byte-level examples (JCS canonical bytes, full PAE byte string, signature, CID) are generated from the reference implementation, never hand-authored.
- **D-04:** SPEC.md embeds one complete example receipt threaded inline through every pipeline step; the exhaustive byte set lives in a referenced fixtures file (not inline). The threaded example MUST exercise ≥1 redaction and ≥1 JCS edge case (non-ASCII escape and/or number serialization).
- **D-05:** That single threaded example becomes "vector #0" of the Phase 51 conformance set — the same flag-gated generator emits both the spec's worked example and the committed vectors. Planner must decide: throwaway script vs. pulled-forward Phase 51 generator.
- **D-06:** Schema files use JSON Schema draft 2020-12 with `additionalProperties: false`, as flat standalone files per version (no `$ref` composition). Fallback: draft-07 + `additionalProperties: false` (no 2020-12-only keywords used, so lossless).
- **D-07:** Encode I-JSON constraints in JSON Schema: safe integers with `maximum: 9007199254740991`; `costUsd` with decimal-string pattern; `sha256:` fields with hex pattern.
- **D-08:** Backstop in normative prose: integers MUST be encoded without fraction/exponent; `costUsd` MUST NOT be a JSON number; hex is lowercase. Mirror as non-normative `$comment` in schemas.
- **D-09:** Define `outputHash` as the full `fingerprintArtifactValue` type-dispatch (normative), reproduced exactly from `packages/lattice/src/storage/fingerprint.ts`: string → UTF-8 → SHA-256; Uint8Array/ArrayBuffer/Blob → raw bytes → SHA-256; otherwise → `JSON.stringify(value)` → UTF-8 → SHA-256; no outputs → `outputHash = null`; result is lowercase hex. The STATE.md `sha256(JSON.stringify(outputMap))` entry is incomplete — the spec MUST document the full dispatch.
- **D-10:** Add a precise non-normative caveat that object-output `outputHash` reproduction requires byte-identical JSON: key insertion order (not sorted, not JCS), ECMAScript `Number.prototype.toString` formatting (incl. the ≥10²¹/<10⁻⁶ exponent thresholds, `1e-7`→`1e-07` divergence, integral-float `100` vs `100.0`, and `-0` vs `-0.0`), and ECMAScript string escaping.
- **D-11:** Draw the conformance boundary: object-output `outputHash` is implementation-defined / out of scope for v1.5 conformance. Phase 54 Python-replay vectors assert only string/binary/null branches. Do NOT switch object outputs to JCS — that would diverge from the unchanged reference impl.

### Claude's Discretion

- Exact section numbering / heading scheme of SPEC.md, prose wording, the visual layout of the threaded example, and the CHANGELOG.md format (per-version delta sections). Standard, clean conventions are fine.

### Deferred Ideas (OUT OF SCOPE)

- Go/Rust/Java-Kotlin/C# /Ruby clients (GO-01, GO-02, LANG-01..04) — v1.6+.
- PyPI publishing (PUB-01) — v1.6+.
- Additional vector breadth — Unicode/lone-surrogate edge cases (VEC-F1), multi-signature envelopes (VEC-F2) — v1.6+.
- Mandating JCS for object-output `outputHash` — explicitly rejected for v1.5.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPEC-01 | Implementer can reproduce byte-identical JCS canonical bytes for a receipt body including UTF-16BE key ordering and I-JSON rules without reading TypeScript | §JCS Canonicalization section; `canonical.ts` audit; D-01 normative clause structure |
| SPEC-02 | Spec normatively requires every receipt-body numeric field to be a safe integer and `costUsd` to be an I-JSON string | `types.ts` field audit; `stringifyCostUsd` in `canonical.ts`; D-07/D-08 backstop prose |
| SPEC-03 | Spec defines DSSE PAE with a worked byte-level example and mandates standard base64 (RFC 4648 §4) for `payload` and `sig` fields | `envelope.ts` `buildPae`/`base64Encode` audit; D-04 threaded example requirement |
| SPEC-04 | Spec normatively defines the exact `outputHash` algorithm (serialization + hash function) | `fingerprint.ts` `fingerprintArtifactValue`/`valueToBytes` full audit; D-09/D-10/D-11 |
| SPEC-05 | Spec defines CID format (`sha256:<lowercase-hex>` over DSSE payload bytes) and `kid`/KeySet key model with JWK OKP (RFC 8037) key encoding | `cid.ts` audit; `types.ts` `KeySet`/`KeyEntry`/`KeyState` audit; `sign.ts` JWK usage |
| SPEC-06 | Spec enumerates accepted version set (v1.1, v1.2, v1.3), downgrade-defense rule (reject v1 and absent before any crypto), and verification algorithm with complete error-kind taxonomy | `verify.ts` 10-step decision tree full audit; all 7 `VerifyErrorKind` values from `types.ts` |
| SPEC-07 | Spec is versioned with CHANGELOG.md and machine-checkable JSON Schema files (v1.1.json, v1.2.json, v1.3.json) | Field-by-field version delta derivation; D-06 schema dialect; D-07 I-JSON constraint encoding |
</phase_requirements>

---

## Summary

Phase 50 authors `spec/SPEC.md`, `spec/schema/{v1.1,v1.2,v1.3}.json`, and `spec/CHANGELOG.md` — a normative, language-neutral protocol specification sufficient for any implementer to reproduce every byte of a Lattice capability receipt without reading TypeScript. The spec is a faithful transcription of the existing reference implementation, not a new design; the implementation wins on any divergence (D-02).

The primary authoring challenge is precision: six distinct algorithm stages (redact → canonicalize → base64 → PAE → sign → envelope → CID) each have byte-level decisions that break cross-language parity when wrong. Key decisions are already locked in CONTEXT.md (D-01 through D-11). The research task is to ground every normative clause in the exact implementation behaviour observed by auditing `packages/lattice/src/receipts/` and `packages/lattice/src/storage/fingerprint.ts`, and to identify the exact field-by-field per-version JSON Schema content.

The phase produces pure documentation — no workspace package, no build wiring, no npm/pnpm changes. The `spec/` directory is new (does not yet exist). The "vector #0" threaded example must be generated from the reference implementation (D-03), which means the planner must schedule a generation step early; everything downstream (the inline hex in SPEC.md) depends on its output.

**Primary recommendation:** Decompose into three plan waves — (1) scaffold `spec/` and author SPEC.md core sections (pipeline algorithm + verification algorithm + field reference), (2) generate the vector #0 worked example and thread it into SPEC.md, (3) author the three JSON Schema files and CHANGELOG.md. Wave 2 must run after Wave 1 because the example exercises the algorithm described in Wave 1.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Normative spec prose (SPEC.md) | Documentation / repo root `spec/` | — | Language-neutral document; sits above the TS implementation |
| JSON Schema files (v1.1/v1.2/v1.3) | Documentation / `spec/schema/` | Phase 51 generator (validates vectors against them) | Machine-checkable complement to prose; used by Phase 51 for body validation |
| Vector #0 threaded example | `spec/SPEC.md` inline + fixtures | Phase 51 conformance set | D-05: same generator emits both; example IS vector #0 |
| CHANGELOG.md | Documentation / `spec/` | — | Per-version prose delta; not machine-checked |
| Reference implementation (unchanged) | `packages/lattice/src/receipts/` | — | Normative tie-breaker; read-only in Phase 50 |

---

## Standard Stack

Phase 50 produces documentation and JSON Schema files only. No new runtime dependencies. The only tooling decisions are for schema validation (used in the example-generation script) and the example generator itself.

### Core (authoring tools, already present in repo)

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|-------------|
| `canonicalize` (TS) | 3.0.0 [VERIFIED: codebase] | RFC 8785 JCS — used in the example generator | Already in `packages/lattice/` production deps |
| `@noble/ed25519` | 3.1.0 [VERIFIED: codebase] | Ed25519 — parity oracle for example generation | Already in dev deps |
| Node WebCrypto | Node 24 [VERIFIED: codebase] | Ed25519 sign for the generator script | Already required by the receipts module |
| `vitest` | Current in repo [VERIFIED: codebase] | Test runner for any spec-validation tests | Already used across the monorepo |

### Supporting (schema validation for example script)

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| `ajv` + `ajv-formats` | Already in repo dev deps [ASSUMED] | Validate vector #0 body against the authored JSON Schema file | In the vector #0 generation script to catch spec/impl drift at authoring time |

### New Files (deliverables)

| File | Format | Purpose |
|------|--------|---------|
| `spec/SPEC.md` | Markdown + normative prose | Language-neutral normative spec |
| `spec/schema/v1.1.json` | JSON Schema draft 2020-12 | Machine-checkable v1.1 body shape |
| `spec/schema/v1.2.json` | JSON Schema draft 2020-12 | Machine-checkable v1.2 body shape |
| `spec/schema/v1.3.json` | JSON Schema draft 2020-12 | Machine-checkable v1.3 body shape |
| `spec/CHANGELOG.md` | Markdown | Per-version deltas v1.1→v1.2→v1.3 |
| `spec/vector0-fixture.json` | JSON | Committed worked-example bytes (D-04: "exhaustive byte set lives in a referenced fixtures file") |

---

## Package Legitimacy Audit

Phase 50 installs no new packages. All tooling is already present in the repo. No legitimacy audit required.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## SPEC.md Section Layout and Content

This is the core planning artifact. The planner needs to know exactly what goes in each section.

### Recommended Section Structure (D-01 style)

```
spec/SPEC.md
├── Preamble
│   ├── Status (Normative)
│   ├── Version (1.0-draft / tied to v1.3 receipt schema)
│   └── Normative references list
├── § 1  Terminology (RFC-2119 / BCP-14 keyword stanza)
├── § 2  Overview (non-normative)
├── § 3  Receipt Body Schema
│   ├── § 3.1  Fields — all versions
│   ├── § 3.2  Version-specific fields
│   ├── § 3.3  Field types and I-JSON constraints (MUST clauses)
│   └── § 3.4  JSON Schema files (declared normative)
├── § 4  Signing Pipeline (normative algorithm)
│   ├── § 4.1  Step 1 — Assemble body
│   ├── § 4.2  Step 2 — Redact
│   ├── § 4.3  Step 3 — JCS Canonicalize (RFC 8785)
│   ├── § 4.4  Step 4 — Base64 encode payload (RFC 4648 §4)
│   ├── § 4.5  Step 5 — Build PAE (DSSE v1.0)
│   ├── § 4.6  Step 6 — Ed25519 sign PAE bytes
│   ├── § 4.7  Step 7 — Encode DSSE envelope
│   ├── § 4.8  Step 8 — Derive CID (optional, for chaining)
│   └── § 4.9  Worked example — vector #0 (non-normative label, but bytes are normative)
├── § 5  Verification Algorithm
│   ├── § 5.1  Decision tree (10 steps, first-match-wins)
│   ├── § 5.2  VerifyErrorKind taxonomy (7 kinds)
│   └── § 5.3  Downgrade Defense (CRYPTO-01)
├── § 6  outputHash Algorithm (SPEC-04)
│   ├── § 6.1  Normative type-dispatch
│   └── § 6.2  Non-normative caveat: object-output determinism (D-10)
├── § 7  Key Model
│   ├── § 7.1  KeySet / KeyEntry / KeyState
│   ├── § 7.2  JWK OKP encoding (RFC 8037)
│   └── § 7.3  kid cross-check invariant
├── § 8  Schema Versioning
│   ├── § 8.1  Accepted version set
│   ├── § 8.2  Version string format
│   └── § 8.3  Conformance boundary (D-11)
├── § 9  Normative References
└── Appendix A  Informative references (paper, prior art)
```

### Section 3: Field Reference — Version Matrix

The planner needs the exact per-version field inventory to author §3 and the three JSON Schema files.

**Fields present in ALL versions (v1.1, v1.2, v1.3) — REQUIRED:**

| Field | Type (JSON) | JSON Schema constraint |
|-------|-------------|------------------------|
| `version` | string | enum: ["lattice-receipt/v1.1", "lattice-receipt/v1.2", "lattice-receipt/v1.3"] |
| `receiptId` | string | format: uuid (or pattern `^[0-9a-f-]{36}$`) |
| `runId` | string | — |
| `issuedAt` | string | format: date-time |
| `kid` | string | — |
| `model` | object | required: ["requested", "observed"]; `requested`: string; `observed`: string or null |
| `route` | object | required: ["providerId", "capabilityId", "attemptNumber"]; `attemptNumber`: integer min 1 |
| `usage` | object | required: ["promptTokens", "completionTokens", "costUsd"]; see sub-constraints below |
| `usage.promptTokens` | integer | minimum: 0, maximum: 9007199254740991 |
| `usage.completionTokens` | integer | minimum: 0, maximum: 9007199254740991 |
| `usage.costUsd` | string or null | pattern: `^-?(0\|[1-9][0-9]*)(\.[0-9]+)?$` when string |
| `contractVerdict` | string | enum: ["success","tripwire-violated","no-contract-match","execution-failed","validation-failed"] |
| `contractHash` | string or null | pattern: `^sha256:[0-9a-f]{64}$` when string |
| `inputHashes` | array of string | items pattern: `^sha256:[0-9a-f]{64}$` |
| `outputHash` | string or null | pattern: `^sha256:[0-9a-f]{64}$` when string |
| `redactionPolicyId` | string | — |
| `redactions` | array of object | items: required ["path", "reason"]; both string |

**Fields in v1.1+ only (OPTIONAL in v1.1, carry through v1.2/v1.3):**

| Field | Type (JSON) | Notes |
|-------|-------------|-------|
| `stepName` | string | optional step-marker |
| `stepIndex` | integer | minimum: 0, maximum: 9007199254740991 |
| `parentStepName` | string | optional |
| `previousStepName` | string | optional |
| `sessionId` | string | optional |
| `timestamp` | string | format: date-time; optional |
| `noRouteReasons` | array | optional; items: shape defined by RouteRejectReason |
| `tripwireEvidence` | object | optional; shape defined by TripwireEvidence |

**Fields added in v1.2 (OPTIONAL, forward-compatible into v1.3):**

| Field | Type (JSON) | Notes |
|-------|-------------|-------|
| `modelClass` | string | enum: the TrainingClass values (see types.ts via `capabilities/profile.ts`) |

**Fields added in v1.3 (OPTIONAL; these are the new v1.3 additions):**

| Field | Type (JSON) | JSON Schema constraint |
|-------|-------------|------------------------|
| `parentReceiptCid` | string | pattern: `^sha256:[0-9a-f]{64}$` |
| `lineageMerkleRoot` | string | pattern: `^sha256:[0-9a-f]{64}$` |

**Key schema insight for the planner:** The v1.1 schema is the base; v1.2 adds `modelClass?`; v1.3 adds `parentReceiptCid?` and `lineageMerkleRoot?`. Because D-06 mandates flat standalone files with `additionalProperties: false`, all three JSON Schema files must enumerate every allowed field explicitly. The v1.3 schema is the union of all fields.

**modelClass values** (from `packages/lattice/src/capabilities/profile.ts`): [ASSUMED — not directly audited but referenced via types.ts; planner must read `capabilities/profile.ts` to enumerate the TrainingClass union values for the JSON Schema enum].

**noRouteReasons / tripwireEvidence shapes**: These appear as optional fields in `types.ts` referencing other type files. For the JSON Schema the planner has two options: (a) inline the minimal structural shape, or (b) use `type: "array"` / `type: "object"` without further constraint. Since `additionalProperties: false` applies to the top-level receipt body, these nested objects may be left as `type: "object"` with no further constraint in the schema (the spec prose normatively defers their structure to the runtime). This is the simpler approach and avoids pulling in complex nested type hierarchies.

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────┐
│         Reference Implementation            │
│  packages/lattice/src/receipts/*.ts         │
│  packages/lattice/src/storage/fingerprint.ts│
└──────────────────┬──────────────────────────┘
                   │ audit → normative text
                   ▼
┌─────────────────────────────────────────────┐
│              spec/SPEC.md                   │
│  § 3 field reference                        │
│  § 4 signing pipeline + worked example      │
│  § 5 verification algorithm (10 steps)      │
│  § 6 outputHash dispatch                    │
│  § 7 key model                              │
│  § 8 schema versioning                      │
└────────────┬──────────────┬─────────────────┘
             │              │
             ▼              ▼
┌────────────────┐  ┌────────────────────────┐
│ spec/schema/   │  │  spec/vector0-          │
│ v1.1.json      │  │  fixture.json           │
│ v1.2.json      │  │  (generated bytes,      │
│ v1.3.json      │  │   committed to repo)    │
└────────────────┘  └────────────────────────┘
             │              │
             └──────┬───────┘
                    ▼
         Phase 51 conformance generator
         validates bodies against schemas,
         vector #0 = same bytes as fixture
```

### Recommended Project Structure

```
spec/
├── SPEC.md                    # normative spec (new)
├── CHANGELOG.md               # per-version deltas (new)
├── vector0-fixture.json       # committed worked-example bytes (new)
└── schema/
    ├── v1.1.json              # JSON Schema draft 2020-12 (new)
    ├── v1.2.json              # JSON Schema draft 2020-12 (new)
    └── v1.3.json              # JSON Schema draft 2020-12 (new)
```

All files are at repo root `spec/` — no package.json, no pnpm involvement. The `spec/` directory is peer to `packages/`, `conformance/`, and `clients/`.

### Pattern 1: Normative Algorithm Sections with Worked Example Threading

**What:** Each pipeline step in §4 is a self-contained normative sub-section with a MUST clause, then immediately followed by a "(non-normative) Example:" block showing the concrete bytes from vector #0 at that step. The reader can trace a single receipt from raw body object (step 1) to DSSE envelope (step 7) to CID (step 8) without switching documents.

**When to use:** D-04 mandates this; it is the key structural invariant that makes the spec independently verifiable.

**Implementation notes:**
- The threaded bytes are embedded as hex/base64 inline in SPEC.md
- The "exhaustive byte set" (full hex dump of every intermediate buffer) lives in `spec/vector0-fixture.json`, referenced from §4.9
- Vector #0 must exercise ≥1 redaction entry (so `redactions[]` is non-empty in the canonical body) and ≥1 JCS edge case. The non-ASCII requirement from D-04 means the body should include a field with a non-ASCII character — `stepName: "分析-step"` is the natural candidate (a CJK string in an optional step-marker field).

### Pattern 2: JSON Schema Three-File Flat Structure

**What:** Three separate JSON files, one per accepted version. Each file is a complete standalone schema with `$schema`, `$id`, `title`, `type: object`, `required: [...]`, `properties: {...}`, `additionalProperties: false`. No `$ref` between them (D-06). Each property definition includes a normative `description` and optionally a `$comment` for the I-JSON backstop prose (D-08).

**Example for `usage.costUsd` in all three schemas:**

```json
"costUsd": {
  "oneOf": [
    {
      "type": "string",
      "pattern": "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$",
      "description": "MUST be a finite decimal string. MUST NOT be a JSON number."
    },
    { "type": "null" }
  ],
  "$comment": "I-JSON: NaN and Infinity are represented as null (canonical.ts stringifyCostUsd)."
}
```

**When to use:** D-06 mandates flat files. The repetition across three files is intentional — forward compatibility is declared by the file set, not by schema inheritance.

### Anti-Patterns to Avoid

- **Hand-authoring the vector #0 bytes:** A single nibble error in the hex example would mis-train every downstream implementer. The bytes MUST come from the reference implementation (D-03).
- **Using `$ref` cross-file schemas:** D-06 explicitly prohibits `$ref` composition between versions. Each schema file is self-contained.
- **Omitting the downgrade defense ordering in §5:** The verification algorithm MUST show that the version check (step 4 in `verify.ts`) occurs BEFORE keyset lookup, BEFORE signature verification. Reversing the order in the spec would enable a conformance-passing implementation that is vulnerable to the CRYPTO-01 attack.
- **Documenting `paper/main.tex` as authoritative:** The paper caps at v1.2. The spec documents v1.3 (D-02). Any clause derived from the paper must be verified against the implementation.
- **Marking object-output `outputHash` as conformance-required:** D-11 explicitly excludes this from v1.5 conformance scope. The spec must state this boundary explicitly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Vector #0 canonical bytes | Hand-authored hex | Script that calls `canonicalizeReceiptBody` from `canonical.ts` | A single wrong nibble in a hand-authored hex sequence would corrupt every downstream client implementation |
| JSON Schema validation of vector #0 | Ad-hoc field checking | `ajv` with the authored v1.3 schema file | Catches spec/impl drift during authoring; the schema files themselves are the deliverable |
| PAE byte example | Hand-computed length fields | Script that calls `buildPae` from `envelope.ts` | Length fields are in bytes, not characters; getting them wrong is a silent error |
| Ed25519 signature in example | Hand-generated | Script that calls `signer.sign` with a fixed committed keypair | Ed25519 is deterministic — same key + same PAE = same 64-byte signature every time |

**Key insight:** For a spec that must be byte-precise, every concrete value in worked examples must be derived from the implementation. The spec is a description, not a design.

---

## Normative Content: Precise Algorithms for Each Spec Section

This section provides the exact content the author needs for each normative algorithm, derived from the reference implementation.

### § 4 Signing Pipeline — Exact Normative Content

**Step 2: Redact**
- `DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1"` [VERIFIED: codebase `redact.ts` line 10]
- Redaction policy populates `redactions[]` manifest; the body with `redactions` populated is what gets canonicalized
- Redactions MUST be sorted by `path` field (ascending lexicographic) before canonicalization [VERIFIED: codebase `redact.ts` lines 57-60]
- The signing commitment is over `canonicalize(redact(body))` — never over the cleartext body

**Step 3: JCS Canonicalize (RFC 8785)**
- Implementation: `canonicalize@3.0.0` library, then `TextEncoder.encode(json)` [VERIFIED: codebase `canonical.ts`]
- Keys sorted by UTF-16BE code unit sequence (RFC 8785 §3.2.3) — NOT by UTF-8 bytes or codepoints
- Result is UTF-8 bytes
- `costUsd` is always a `string | null` in the canonical body (never a raw float) [VERIFIED: codebase `canonical.ts` `stringifyCostUsd`]
- Integer fields (`promptTokens`, `completionTokens`, `attemptNumber`, `stepIndex`) serialize as bare integers without decimal point or exponent [VERIFIED: canonical.test.ts vector 5]
- Negative zero serializes as `0` (not `-0`) [VERIFIED: canonical.test.ts vector 6]
- Non-ASCII strings: RFC 8785 preserves raw Unicode codepoints rather than `\uXXXX` escapes for characters above U+001F [VERIFIED: canonical.test.ts vector 7 — `é` → `é`]

**Step 4: Base64 encode (RFC 4648 §4)**
- `Buffer.from(bytes).toString("base64")` — standard base64 alphabet `A-Za-z0-9+/` with `=` padding [VERIFIED: codebase `envelope.ts` line 36]
- MUST use standard base64 — NOT base64url (no `-` or `_` characters)
- MUST include `=` padding

**Step 5: DSSE v1.0 PAE**
- `PAYLOAD_TYPE = "application/vnd.lattice.receipt+json"` [VERIFIED: codebase `envelope.ts` line 31]
- PAE formula [VERIFIED: codebase `envelope.ts` `buildPae`]:
  ```
  PAE = UTF-8("DSSEv1 " + len(payloadType) + " " + payloadType
                        + " " + len(payloadBase64) + " " + payloadBase64)
  ```
  where `len(s)` is the ASCII decimal encoding of the **byte length** of `s` (both strings are pure ASCII so byte length equals character count in this case)
- The DSSE spec uses length-prefixed fields to prevent ambiguity attacks; the prefix is the string representation of the decimal length

**Step 6: Ed25519 sign**
- Algorithm string: `"Ed25519"` (the literal string, not an AlgorithmIdentifier object) [VERIFIED: codebase `sign.ts` line 25]
- WebCrypto: `crypto.subtle.sign("Ed25519", privateKey, paeBytes)` [VERIFIED: codebase `sign.ts` line 110]
- Output: 64-byte raw Ed25519 signature (RFC 8032)
- Deterministic: same key + same PAE bytes always produce the same signature (RFC 8032 §5.1.6)
- Key format: JWK with `kty: "OKP"`, `crv: "Ed25519"`, `d` (private, base64url no-padding), `x` (public, base64url no-padding) per RFC 8037

**Step 7: Encode DSSE envelope**
- `payloadType`: literal `"application/vnd.lattice.receipt+json"` [VERIFIED: codebase `types.ts` line 97]
- `payload`: base64-encoded canonical bytes (same string used in PAE step 5)
- `signatures[0].keyid`: taken from `signer.kid` [VERIFIED: codebase `receipt.ts` line 152]
- `signatures[0].sig`: base64-encoded 64-byte raw signature (standard base64, NOT base64url)
- Structural invariant: `body.kid === signatures[0].keyid` [VERIFIED: codebase `receipt.ts` and `verify.ts` step 9]

**Step 8: Derive CID (for chaining)**
- Input: the DSSE `payload` field (already base64-encoded)
- Algorithm: `atob(envelope.payload)` → 32-byte SHA-256 digest → lowercase hex [VERIFIED: codebase `cid.ts`]
- Result format: `"sha256:" + 64-char lowercase hex` [VERIFIED: codebase `cid.ts` + `cid.test.ts`]
- No key material required; derivable from any verified envelope

### § 5 Verification Algorithm — Exact 10-Step Decision Tree

Derived directly from `verify.ts`. Each numbered clause in the spec maps 1:1 to a Phase 51 conformance vector (D-01).

| Step | Condition | Error Kind | Source in verify.ts |
|------|-----------|-----------|---------------------|
| 1 | `decodeEnvelope` throws OR `signatures[]` is empty | `envelope-malformed` | lines 90-98 |
| 2 | payload bytes are not valid JSON | `envelope-malformed` | lines 101-108 |
| 3 | body shape check fails OR unknown version literal | `version-mismatch` | lines 111-117 |
| 4 | `body.version === undefined` OR `body.version === "lattice-receipt/v1"` | `schema-version-too-low` | lines 127-132 |
| 5 | `keySet.lookup(keyid) === undefined` | `key-not-found` | lines 135-140 |
| 6 | `entry.state === "revoked"` | `key-revoked` | lines 141-144 |
| 7 | re-canonicalized body bytes ≠ decoded payload bytes | `canonicalization-mismatch` | lines 150-156 |
| 8 | Ed25519 verify(PAE, sig, publicKey) fails | `signature-invalid` | lines 158-165 |
| 9 | `body.kid !== entry.kid` | `signature-invalid` | lines 168-172 |
| 10 | — | ok + keyState | lines 174-179 |

**Critical ordering note (D-01 + CONTEXT.md):** Step 4 (downgrade defense) occurs BEFORE steps 5-8 (keyset lookup and crypto). The spec MUST state this ordering explicitly, because a conformance implementation that reverses steps 4 and 5 would appear to work (valid receipts still pass) but would accept CRYPTO-01 downgrade attacks.

**Step 3 shape-check:** `asReceiptBody` accepts `version: undefined | v1 | v1.1 | v1.2 | v1.3` (all reach step 4) but rejects any other non-undefined literal (e.g. `v2`) with `version-mismatch`. This two-stage gate is intentional: unknown-future-version → version-mismatch; known-too-low-version → schema-version-too-low.

**Step 7 re-canonicalization:** The verifier re-canonicalizes the parsed body and byte-compares to the signed payload bytes. This is a normative requirement — it catches any modification to the canonical bytes that still parses as valid JSON but is not the canonical form (e.g. whitespace injection, alternate float representation).

### § 6 outputHash Algorithm (SPEC-04)

Derived directly from `packages/lattice/src/storage/fingerprint.ts` [VERIFIED: codebase].

**Normative type-dispatch (D-09):**

```
outputHash = null                                     when outputs === undefined or null
outputHash = sha256hex(UTF-8(outputs))               when typeof outputs === "string"
outputHash = sha256hex(outputs)                       when outputs instanceof Uint8Array
outputHash = sha256hex(new Uint8Array(outputs))       when outputs instanceof ArrayBuffer
outputHash = sha256hex(new Uint8Array(await outputs.arrayBuffer()))  when isBlobLike(outputs)
outputHash = sha256hex(UTF-8(JSON.stringify(outputs))) when otherwise (object/array/number/boolean)
```

where `sha256hex(bytes)` = lowercase hexadecimal SHA-256 digest of `bytes`, and `outputHash` is the `sha256:` prefixed form (i.e., `"sha256:" + sha256hex(...)`).

Wait — correction: `fingerprintArtifactValue` returns `{ algorithm: "sha256", value: hex }`, and the call site at `create-ai.ts` line 1241 takes `.value` (the raw hex without prefix). Then the production call site stores `outputHash = fingerprint?.value ?? null` — so `outputHash` in the receipt body is the **bare lowercase hex** (64 chars), NOT the `sha256:<hex>` prefixed form. [VERIFIED: codebase `create-ai.ts` lines 1238-1241 + `fingerprint.ts` `toHex` function]

Verify: `cid.ts` uses `sha256:<hex>` prefix, but `outputHash` in `types.ts` is `string | null` — the string value comes from `fingerprintArtifactValue(...).value` which is the bare hex from `toHex()`. The `sha256:` prefix pattern in D-07 JSON Schema constraint is for `contractHash`, `inputHashes`, `parentReceiptCid`, `lineageMerkleRoot` — all of which use the content-addressed `sha256:<hex>` form. The `outputHash` field in the schema may use the same `^sha256:[0-9a-f]{64}$` pattern IF the call site prepends the prefix. The research audit shows `fingerprintArtifactValue` returns `{ value: hex }` (bare hex, no prefix) — but the call site takes `.value` and passes it directly as `outputHash`. Therefore `outputHash` stores bare hex. [VERIFIED: codebase audit]

**Action for planner:** Before authoring §6, verify whether `outputHash` in a real minted receipt contains the `sha256:` prefix or bare hex by running the existing tests or inspecting `receipt.test.ts`. The JSON Schema pattern for `outputHash` should match the actual value stored. If it is bare hex, the pattern is `^[0-9a-f]{64}$` not `^sha256:[0-9a-f]{64}$`. This is a critical spec-precision point.

**Non-normative caveat (D-10):** Object-output `outputHash` requires byte-identical ECMAScript `JSON.stringify`. Known cross-language divergences to document:
- `1e-7` in Python `json.dumps` produces `1e-07` (extra zero in exponent)
- `100.0` in Python produces `100.0` but JS produces `100`
- Values ≥ 10²¹ switch to exponent form in JS but may not in Python
- Values < 10⁻⁶ switch to exponent form in JS but Python uses fixed decimal
- `-0` in JS JSON.stringify produces `0`; Python produces `0`
- Key insertion order in JS objects is creation order (not sorted); Python dicts (3.7+) preserve insertion order but order may differ depending on how the object was constructed

**Conformance boundary (D-11):** Object-output `outputHash` is implementation-defined for v1.5. Phase 54 Python-replay conformance vectors use only string/binary/null branches.

---

## Common Pitfalls

### Pitfall 1: JCS Key Sort Order — UTF-16BE vs UTF-8/Codepoint

**What goes wrong:** Non-ASCII keys are sorted in a different order by UTF-16BE code units (RFC 8785) vs UTF-8 bytes (Python `sort_keys=True`) or Unicode codepoints. Characters in the U+10000+ range (surrogate pairs in UTF-16) sort differently.

**Why it happens:** RFC 8785 §3.2.3 mandates UTF-16 code unit comparison. Receipt body keys are all ASCII (no divergence for this specific body), but the spec must still state the rule normatively so implementers who add non-ASCII keys to future body shapes don't silently break.

**How to avoid:** §4.3 MUST include the UTF-16BE key sorting rule verbatim. The vector #0 threaded example should include a non-ASCII string VALUE (e.g. `stepName: "分析-step"`) even if all keys remain ASCII, to exercise Unicode string handling in JCS.

**Warning signs:** Python client produces different canonical bytes only for receipts with non-ASCII string values.

### Pitfall 2: Standard vs URL-Safe Base64 (Payload and Sig)

**What goes wrong:** Python's `base64.urlsafe_b64encode` (produces `-` and `_`) is used instead of `base64.b64encode`. The PAE string contains different characters, producing a different signature. [VERIFIED: codebase `envelope.ts` — `Buffer.from(bytes).toString("base64")` = standard base64]

**How to avoid:** §4.4 and §4.7 MUST state: `payload` and `sig` fields MUST use standard base64 (RFC 4648 §4, alphabet `A-Za-z0-9+/`, with `=` padding). Base64url is used ONLY for JWK `d` and `x` fields (RFC 8037).

### Pitfall 3: PAE Signs Over Base64 String, Not Raw Bytes

**What goes wrong:** Implementer signs `canonicalize(body)` directly instead of `PAE(payloadType, base64(canonicalize(body)))`. The signature is valid Ed25519 but never verifies against a TS receipt.

**How to avoid:** §4.5 MUST include the full PAE formula with a concrete worked example. The spec should state: "The Ed25519 signature is computed over the PAE bytes, NOT over the canonical body bytes."

### Pitfall 4: Downgrade Defense Ordering

**What goes wrong:** Spec describes verification with keyset lookup (step 5) before version check (step 4), or omits the version check entirely. A conformance-passing implementation would still verify all positive vectors but would accept CRYPTO-01 downgrade attacks.

**How to avoid:** §5 MUST explicitly state that step 4 (schema-version-too-low check) MUST precede keyset lookup and all cryptographic operations.

### Pitfall 5: body.kid === envelope keyid Invariant

**What goes wrong:** Spec omits to document step 9 (defense in depth: `body.kid !== entry.kid` → `signature-invalid`). An implementation that skips this check can be tricked by a receipt where the body commits to one kid but the envelope routes verification to a different key.

**How to avoid:** §5.1 step 9 MUST be explicitly included and must map to a Phase 51 negative vector.

### Pitfall 6: outputHash Bare Hex vs sha256-Prefixed

**What goes wrong:** The spec says `outputHash` uses `sha256:<hex>` format (consistent with other hash fields) but the actual value stored by the reference impl is bare hex (64 chars, no prefix). Or vice versa.

**How to avoid:** Verify by inspecting actual minted receipt body (run `receipt.test.ts` and print the body), not just reading `types.ts` (which says `string | null`). The JSON Schema pattern for `outputHash` must match the actual value. [NEEDS VERIFICATION — see Action above]

### Pitfall 7: Redact Ordering (Sign commits to redacted body)

**What goes wrong:** Spec implies signing happens before redaction, or omits the redact step entirely. An implementer builds a signing pipeline without redaction and produces receipts where cleartext data appears in the signed body.

**How to avoid:** §4.2 MUST state the ordering invariant: `canonicalize(redact(body))` is the signed commitment. The code comment in `receipt.ts` ("INVARIANT: callers MUST pass an already-redacted body") makes this explicit [VERIFIED: codebase].

### Pitfall 8: Version String Enum (Accepted Set)

**What goes wrong:** Spec says "v1.1, v1.2, v1.3 are accepted" but doesn't specify the exact version strings, so an implementer tests `if version.startswith("lattice-receipt/v1")` which would accept a hypothetical `lattice-receipt/v1-evil`.

**How to avoid:** §8.1 MUST enumerate the EXACT accepted version strings:
- `"lattice-receipt/v1.1"`
- `"lattice-receipt/v1.2"`
- `"lattice-receipt/v1.3"`

And MUST state these are checked by exact string equality, not prefix match.

---

## Code Examples

Verified patterns from direct codebase audit:

### JCS Canonicalization Produces UTF-8 Bytes with Sorted Keys

```typescript
// Source: packages/lattice/src/receipts/canonical.ts
import canonicalize from "canonicalize";
const encoder = new TextEncoder();

export function canonicalizeReceiptBody(body: CapabilityReceiptBody): Uint8Array {
  const json = canonicalize(body);  // RFC 8785 JCS
  if (json === undefined) throw new Error("...");
  return encoder.encode(json);  // UTF-8 bytes
}

// Test: { receiptId: ..., version: ..., runId: ... }
// JCS sorts → first key alphabetically is "contractHash" not "version" or "receiptId"
// Source: packages/lattice/src/receipts/canonical.test.ts
```

### PAE Construction

```typescript
// Source: packages/lattice/src/receipts/envelope.ts
export const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json";

export function buildPae(payloadType: string, payloadBase64: string): Uint8Array {
  const ascii =
    "DSSEv1 " +
    payloadType.length.toString() +
    " " +
    payloadType +
    " " +
    payloadBase64.length.toString() +
    " " +
    payloadBase64;
  return textEncoder.encode(ascii);
}
// PAYLOAD_TYPE length = 38 characters
// PAE prefix = "DSSEv1 38 application/vnd.lattice.receipt+json <len> <payloadBase64>"
```

### CID Derivation

```typescript
// Source: packages/lattice/src/receipts/cid.ts
export async function receiptCid(envelope: ReceiptEnvelope): Promise<string> {
  const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}
// Hashes the DECODED payload bytes (canonical body bytes), not the base64 string
```

### outputHash Type Dispatch

```typescript
// Source: packages/lattice/src/storage/fingerprint.ts
async function valueToBytes(value: unknown): Promise<Uint8Array | undefined> {
  if (typeof value === "string") return textEncoder.encode(value);      // UTF-8
  if (value instanceof Uint8Array) return value;                        // raw bytes
  if (value instanceof ArrayBuffer) return new Uint8Array(value);       // raw bytes
  if (isBlobLike(value)) return new Uint8Array(await value.arrayBuffer()); // raw bytes
  const serialized = JSON.stringify(value);                             // object branch
  return serialized === undefined ? undefined : textEncoder.encode(serialized);
}
// fingerprintArtifactValue returns { algorithm: "sha256", value: toLowerHex(sha256(bytes)) }
// or undefined when valueToBytes returns undefined (e.g. value is a function/symbol/undefined)
```

### Verification Decision Tree (Downgrade First)

```typescript
// Source: packages/lattice/src/receipts/verify.ts — step 4 (abridged)
// Step 4 fires BEFORE keyset lookup (step 5) and signature verify (step 8)
if (body.version === undefined || body.version === "lattice-receipt/v1") {
  return fail("schema-version-too-low", "...");
}
// Step 5: keyset lookup
// Step 6: revoked check
// Step 7: re-canonicalize byte-compare
// Step 8: Ed25519 verify over PAE
// Step 9: body.kid === entry.kid
```

### costUsd I-JSON Rule

```typescript
// Source: packages/lattice/src/receipts/canonical.ts
export function stringifyCostUsd(costUsd: number | null): string | null {
  if (costUsd === null) return null;
  if (!Number.isFinite(costUsd)) return null;  // NaN/Infinity → null
  return costUsd.toString();  // finite float → JS Number.prototype.toString()
}
// 0.000125 → "0.000125"; 1.5 → "1.5"; 0 → "0"
// Note: JS Number.prototype.toString() uses Grisu3/Dragonbox for shortest round-trip
```

---

## JSON Schema File Content Strategy

The planner must author three JSON Schema files. Here is the exact strategy:

### `$schema` and `$id`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://lattice-protocol.dev/spec/schema/v1.3.json",
  "title": "Lattice Capability Receipt Body v1.3",
  "type": "object",
  "additionalProperties": false,
  "required": [...]
}
```

### Required fields array (all three versions share the same base required set)

```json
"required": [
  "version", "receiptId", "runId", "issuedAt", "kid",
  "model", "route", "usage",
  "contractVerdict", "contractHash",
  "inputHashes", "outputHash",
  "redactionPolicyId", "redactions"
]
```

### version enum per file

- v1.1: `"enum": ["lattice-receipt/v1.1"]`
- v1.2: `"enum": ["lattice-receipt/v1.2"]`
- v1.3: `"enum": ["lattice-receipt/v1.3"]`

### Key I-JSON constraints to encode (D-07)

```json
"promptTokens": {
  "type": "integer", "minimum": 0, "maximum": 9007199254740991,
  "$comment": "I-JSON safe integer bound (2^53-1). MUST be encoded as a bare integer, not 5.0 or 5e0."
},
"costUsd": {
  "oneOf": [
    {
      "type": "string",
      "pattern": "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$",
      "$comment": "Finite decimal string from Number.prototype.toString(). NaN/Infinity are represented as null."
    },
    { "type": "null" }
  ]
},
"outputHash": {
  "oneOf": [
    { "type": "string", "minLength": 64, "maxLength": 64, "pattern": "^[0-9a-f]{64}$" },
    { "type": "null" }
  ],
  "$comment": "Lowercase hex SHA-256. Pattern TBC — verify bare hex vs sha256:<hex> prefix in production receipts."
},
"contractHash": {
  "oneOf": [
    { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" },
    { "type": "null" }
  ]
},
"parentReceiptCid": {
  "type": "string",
  "pattern": "^sha256:[0-9a-f]{64}$"
},
"lineageMerkleRoot": {
  "type": "string",
  "pattern": "^sha256:[0-9a-f]{64}$"
}
```

### Differences across the three files

| Field | v1.1.json | v1.2.json | v1.3.json |
|-------|-----------|-----------|-----------|
| `version` enum | `["lattice-receipt/v1.1"]` | `["lattice-receipt/v1.2"]` | `["lattice-receipt/v1.3"]` |
| `modelClass` | absent (additionalProperties:false excludes it) | present, optional | present, optional |
| `parentReceiptCid` | absent | absent | present, optional |
| `lineageMerkleRoot` | absent | absent | present, optional |
| All other fields | identical | identical | identical |

---

## CHANGELOG.md Content Strategy

Three sections, one per version delta:

```markdown
# Lattice Receipt Protocol Changelog

## lattice-receipt/v1.3 (Phase 39 + Phase 46)

Added:
- `parentReceiptCid` (optional): sha256:<hex> CID of the parent envelope for receipt chaining.
- `lineageMerkleRoot` (optional): sha256:<hex> provenance root for artifact lineage.

Signing/verification behavior: unchanged. These are additive optional fields; v1.3 receipts
are accepted by the same verifier as v1.1 and v1.2 receipts (single accepted version set).

## lattice-receipt/v1.2 (Phase 38)

Added:
- `modelClass` (optional): model training-class audit tag (e.g. "frontier_rlhf", "local_quantized").

## lattice-receipt/v1.1 (Phase 2)

Initial versioned schema. Introduced:
- Step-marker fields (all optional): `stepName`, `stepIndex`, `parentStepName`,
  `previousStepName`, `sessionId`, `timestamp`.
- Formalized `redactionPolicyId` and `redactions[]` manifest.

Note: `lattice-receipt/v1` (unversioned) is permanently rejected by the verifier
(downgrade defense CRYPTO-01). It predates the step-marker and modelClass audit surface.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `v1` receipts accepted by verifier | Rejected at step 4 before any crypto (CRYPTO-01) | Phase 26 | Security invariant; `v1` literal and absent `version` are both rejected |
| New receipts minted at v1.1 | Always minted at v1.3 (Phase 46 `createReceipt` forces version string) | Phase 46 | All new receipts carry the v1.3 optional fields; v1.1/v1.2 remain verifier-compatible |
| `outputHash` described as `sha256(JSON.stringify(outputMap))` in STATE.md | Full `fingerprintArtifactValue` type-dispatch | D-09 (this phase) | The STATE.md entry is incorrect and must be corrected as a note in SPEC.md |
| Paper (main.tex) as spec | Implementation is the normative tie-breaker | D-02 (this phase) | Paper caps at v1.2 and is expository only |

**Deprecated/outdated:**
- `paper/main.tex` §431 ("Three versions exist: v1, v1.1, v1.2"): does not document v1.3. Use implementation as authority (D-02).
- `STATE.md` outputHash entry (`sha256(JSON.stringify(outputMap))`): is incomplete; documents only the object branch. Must be corrected.

---

## Vector #0 Example Generation

The planner must schedule a generation task. Here is what it needs to produce:

**Fixed inputs (must be committed, never random):**
- A fixed Ed25519 keypair (committed to `spec/vector0-fixture.json`, private key hex + public JWK)
- A fixed `kid` string (e.g. `"spec-example-key-v0"`)
- A fixed receipt body with: `version: "lattice-receipt/v1.3"`, fixed UUID `receiptId`, fixed `issuedAt` ISO timestamp, at least one entry in `redactions[]` (so redaction is exercised), `stepName: "分析-step"` (non-ASCII for JCS edge case), integer token counts
- The body should have `outputHash: null` (avoids the `outputHash` bare-hex vs `sha256:` prefix ambiguity in the example; the outputHash algorithm is documented in §6 separately)

**Expected outputs to commit to `spec/vector0-fixture.json`:**
- `body`: the full receipt body JSON object
- `canonicalBytesHex`: hex of `canonicalizeReceiptBody(body)` output
- `payloadBase64`: base64 encoding of canonical bytes
- `paeHex`: hex of `buildPae(PAYLOAD_TYPE, payloadBase64)` output
- `signatureHex`: hex of 64-byte Ed25519 signature over PAE bytes
- `envelope`: the complete ReceiptEnvelope JSON object
- `cid`: the `sha256:<hex>` CID string
- `publicKeyJwk`: the Ed25519 public key in JWK format

**Generation script:** A one-time TypeScript script (NOT a vitest test) that imports from `packages/lattice/src/receipts/` and `packages/lattice/src/storage/`, uses the fixed keypair, and writes `spec/vector0-fixture.json`. The script is kept in `spec/generate-vector0.ts` (or similar) and committed so the generation is reproducible. Phase 51 decides whether this becomes the real generator or is replaced.

**Planner decision required (D-05):** Whether Phase 50 generates a throwaway script or the actual pulled-forward Phase 51 generator. The research recommendation is a throwaway script: keep it simple (50 lines), commit it, and let Phase 51 create the production generator. The throwaway script can be deleted in Phase 51 or left as documentation. The key constraint is: the fixture bytes must be byte-identical to what Phase 51's generator will produce for "vector #0", so both must use the same fixed keypair and same input body.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `modelClass` enum values (the TrainingClass union from `capabilities/profile.ts`) are stable and can be enumerated in the JSON Schema | § 3 (v1.2/v1.3 schema) | If TrainingClass has additional values not in the schema, conformance validators reject valid receipts |
| A2 | `outputHash` stores bare hex (no `sha256:` prefix) | § 6, JSON Schema `outputHash` pattern | If wrong, the JSON Schema pattern and §6 normative text will contradict real receipts |
| A3 | `ajv` is already present in the repo's dev dependencies | Standard Stack | If missing, the generation script needs an additional install step |
| A4 | The `noRouteReasons` and `tripwireEvidence` nested types can be left as unconstrained `object` in JSON Schema without breaking SPEC-07 | § 3 JSON Schema | If conformance requires full structural validation of these nested types, the JSON Schema files are incomplete |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

---

## Open Questions

1. **outputHash: bare hex or `sha256:<hex>`?**
   - What we know: `fingerprintArtifactValue` returns `{ algorithm: "sha256", value: toHex(...) }` where `toHex` returns bare lowercase hex (64 chars). The call site at `create-ai.ts` line 1241 takes `.value` (bare hex). But D-07 lists `sha256:` fields as `parentReceiptCid`, `lineageMerkleRoot` — not `outputHash`.
   - What's unclear: whether there is any wrapper that prepends `sha256:` before storing in the receipt body.
   - Recommendation: Run `pnpm test` for `receipt.test.ts` or `canonical.test.ts` and print an actual minted receipt body to observe `outputHash` value. The JSON Schema `outputHash` pattern must match observation. The spec author must resolve this before writing §6 and `spec/schema/v1.3.json`.

2. **modelClass enum values**
   - What we know: `CapabilityReceiptBody.modelClass?: TrainingClass` — the type is from `capabilities/profile.ts`.
   - What's unclear: the exact string values of `TrainingClass` (e.g. `"frontier_rlhf"`, `"local_quantized"`, etc.).
   - Recommendation: Read `packages/lattice/src/capabilities/profile.ts` at plan time and enumerate all values for the JSON Schema `enum`.

3. **Phase 50 generator vs Phase 51 generator (D-05)**
   - What we know: D-05 says the Phase 50 example becomes vector #0 of Phase 51. The planner must decide: throwaway or pulled-forward.
   - Recommendation: Throwaway script in `spec/generate-vector0.ts` with the same fixed keypair and body that Phase 51's generator will use for vector #0. Document the fixed keypair in a separate file (`spec/vector0-keypair.json`) committed to the repo (this is test/example key material, NOT production key material). Phase 51 imports this keypair as its vector #0 fixture.

---

## Environment Availability

Phase 50 is documentation + JSON files only. No external service dependencies.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | vector #0 generation script | ✓ | Node 24 (repo standard) | — |
| pnpm | run generation script via monorepo | ✓ | Current repo standard | — |
| `canonicalize@3.0.0` | generation script | ✓ | Already in `packages/lattice/` | — |
| WebCrypto (Node 24) | Ed25519 signing in generation script | ✓ | Node 24 built-in | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` — include this section.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (existing across monorepo) |
| Config file | `packages/lattice/vitest.config.ts` |
| Quick run command | `pnpm --filter @full-self-browsing/lattice test` |
| Full suite command | `pnpm --filter @full-self-browsing/lattice test` |

Phase 50 is documentation authoring. There are no new `.test.ts` files to write for the spec prose itself. Validation is structural:

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPEC-01 | JCS canonical bytes are reproducible from SPEC.md description | manual (vector #0 generation) | `node spec/generate-vector0.ts` | ❌ Wave 0 (new script) |
| SPEC-02 | I-JSON constraints documented | document-review | — | n/a |
| SPEC-03 | PAE worked example matches buildPae output | manual (generation script) | `node spec/generate-vector0.ts` | ❌ Wave 0 (new script) |
| SPEC-04 | outputHash algorithm documented | document-review + verification | — | n/a |
| SPEC-05 | CID example matches receiptCid output | manual (generation script) | `node spec/generate-vector0.ts` | ❌ Wave 0 (new script) |
| SPEC-06 | Verification algorithm documented | existing tests confirm behaviour | `pnpm --filter @full-self-browsing/lattice test` | ✅ `verify.test.ts` |
| SPEC-07 | JSON Schema files validate actual minted receipt bodies | manual (ajv validation of vector #0 against schema) | inline in generation script | ❌ Wave 0 (generation script validates) |

### Sampling Rate

- **Per task commit:** `pnpm --filter @full-self-browsing/lattice test` (existing suite; confirms reference impl behaviour is unchanged)
- **Per wave merge:** Same (no new test files in this phase)
- **Phase gate:** Generation script exits 0 + all three schema files validate vector #0 body + `pnpm test` green

### Wave 0 Gaps

- [ ] `spec/generate-vector0.ts` — script that generates and validates vector #0 bytes; covers SPEC-01, SPEC-03, SPEC-05, SPEC-07
- [ ] `spec/vector0-fixture.json` — output of above script, committed

*(Existing test infrastructure covers SPEC-06 via `verify.test.ts`)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | JSON Schema `additionalProperties: false` + pattern constraints |
| V6 Cryptography | yes (documented, not implemented) | Ed25519 per RFC 8032; DSSE v1.0 PAE; the spec defines these normatively so implementations have no design discretion |

### Known Threat Patterns for This Phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Downgrade attack: submitting `v1` body with valid signature | Tampering | Step 4 short-circuit before crypto (verified in verify.ts, MUST appear in spec §5) |
| Version confusion: `version-mismatch` vs `schema-version-too-low` conflation | Tampering | Two-stage gate documented; step 3 (unknown literal → version-mismatch) before step 4 (known-too-low → schema-version-too-low) |
| Base64 variant smuggling: URL-safe chars in `payload`/`sig` altering PAE | Spoofing | Spec mandates standard base64 (RFC 4648 §4) for payload/sig; validators must reject `-` and `_` |
| kid mismatch: `body.kid` ≠ `signatures[0].keyid` | Tampering | Step 9 defense-in-depth check; documented as normative in §5 |

---

## Sources

### Primary (HIGH confidence — verified from codebase)

- `packages/lattice/src/receipts/types.ts` — complete field inventory for `CapabilityReceiptBody`, `ReceiptEnvelope`, `KeySet`/`KeyEntry`/`KeyState`, all 7 `VerifyErrorKind` values
- `packages/lattice/src/receipts/canonical.ts` — `canonicalizeReceiptBody`, `stringifyCostUsd`, `usageToCanonical`
- `packages/lattice/src/receipts/envelope.ts` — `PAYLOAD_TYPE`, `buildPae`, `base64Encode`/`base64Decode`, `encodeEnvelope`
- `packages/lattice/src/receipts/cid.ts` — `receiptCid` exact algorithm
- `packages/lattice/src/receipts/verify.ts` — full 10-step `verifyReceipt` decision tree
- `packages/lattice/src/receipts/sign.ts` — `ALG = "Ed25519"`, `createInMemorySigner`, JWK import/export
- `packages/lattice/src/receipts/receipt.ts` — `createReceipt` ordering invariant, forced `version = "lattice-receipt/v1.3"`
- `packages/lattice/src/receipts/redact.ts` — `DEFAULT_REDACTION_POLICY_ID`, redaction sort invariant
- `packages/lattice/src/storage/fingerprint.ts` — `fingerprintArtifactValue`/`valueToBytes` full type-dispatch
- `packages/lattice/src/runtime/create-ai.ts` lines 1238-1241 — production outputHash call site
- `packages/lattice/src/receipts/canonical.test.ts` — RFC 8785 golden vectors (key sort, negative zero, unicode)
- `packages/lattice/src/receipts/verify.test.ts` — all 7 error kinds + downgrade vectors confirmed
- `packages/lattice/src/receipts/cid.test.ts` — CID format regex `^sha256:[0-9a-f]{64}$` confirmed
- `.planning/phases/50-protocol-specification/50-CONTEXT.md` — locked decisions D-01 through D-11

### Secondary (HIGH confidence — existing milestone research)

- `.planning/research/ARCHITECTURE.md` — `spec/` directory structure, component boundaries, anti-patterns
- `.planning/research/PITFALLS.md` — cross-language divergence pitfalls; JCS UTF-16BE, base64, PAE, CID, downgrade defense
- `.planning/research/STACK.md` — Python stack decisions (relevant to Phase 51+, not Phase 50)
- `packages/lattice/src/receipts/canonical.test.ts` RFC 8785 vectors — key ordering confirmed

### Tertiary (LOW confidence — needs verification before authoring)

- outputHash exact value format (bare hex vs `sha256:` prefix) — not yet resolved; see Open Questions #1
- `TrainingClass` enum values from `capabilities/profile.ts` — not audited in this research session

---

## Metadata

**Confidence breakdown:**
- SPEC.md section structure: HIGH — directly derived from locked CONTEXT.md decisions
- Algorithm content (JCS, PAE, CID, verification): HIGH — all verified from codebase with line-level citations
- JSON Schema field inventory: HIGH (base fields) / ASSUMED (modelClass enum, nested type schemas)
- outputHash exact format: MEDIUM — type-dispatch algorithm is HIGH, but exact stored value format (bare hex vs prefix) needs one additional verification step
- Pitfalls: HIGH — all derived from codebase audit and existing PITFALLS.md research

**Research date:** 2026-06-25
**Valid until:** 2026-07-25 (spec is stable; reference implementation not changing in Phase 50)
