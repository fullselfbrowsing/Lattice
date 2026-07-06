# Phase 51: Conformance Vector Generator + Committed Vectors — Research

**Researched:** 2026-06-25
**Domain:** TypeScript generator for cryptographic conformance vectors; RFC 8785 JCS; DSSE; SHA-256 manifest; pnpm private workspace package
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Generator lives in a NEW private pnpm workspace package `conformance/generate/` (NOT under `packages/`, NOT under `spec/`).
- Invocation gated by `--regen-vectors` flag; no-op without flag. CI never regenerates.
- Reuse Phase 50's committed fixed Ed25519 keypair + fixed ISO timestamps (EXAMPLE/TEST-ONLY in `spec/generate-vector0.ts`).
- `spec/vector0-fixture.json` is canonical v1.3 positive vector #0; generator must reproduce it byte-identically.
- Directory layout: `conformance/vectors/` with `positive/` and `negative/` subdirectories.
- Positive vectors: at least one per accepted version — v1.1, v1.2, v1.3.
- Negative vectors: one per `VerifyErrorKind` (7 kinds total).
- Vector field set: `body`, `canonicalBytesHex`, `payloadBase64`, `paeHex`, `signatureHex`, `publicKeyJwk`, `kid`, `expectedResult`.
- `conformance/vectors/MANIFEST.sha256` integrity manifest; `sha256sum --check` must pass.
- RFC 8785 cross-check: at least 2 positive vectors' canonical bytes cross-checked against authoritative reference data.
- Schema validation at generation time against `spec/schema/vX.json`.

### Claude's Discretion

- Exact generator CLI ergonomics, internal module layout, per-vector filenames, manifest generation mechanics.

### Deferred Ideas (OUT OF SCOPE)

- Unicode / lone-surrogate edge-case vectors (VEC-F1), multi-signature envelope vectors (VEC-F2).
- CI `conformance` job wiring (Phase 56).
- TS self-verification harness (Phase 52), Python client (Phases 53–55).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VEC-01 | Committed vector JSON schema defines each vector's fields | Field set confirmed from `vector0-fixture.json` + CONTEXT.md; exact shape documented below |
| VEC-02 | TypeScript generator produces golden vectors via flag-gated action, never at CI time | `--regen-vectors` flag pattern; private package prevents accidental `pnpm -r` invocation |
| VEC-03 | Positive vectors cover every accepted schema version (v1.1, v1.2, v1.3) | Version-specific fields identified from `spec/schema/` files; body diff between versions documented below |
| VEC-04 | Negative / adversarial vectors cover every `VerifyErrorKind` | 7-kind taxonomy confirmed from `types.ts`; exact single-mutation constructions per kind documented below |
| VEC-05 | At least 2 positive vectors cross-checked against RFC 8785 reference data | Authoritative sources identified: RFC 8785 §3.2.4 hex bytes + cyberphone/json-canonicalization testdata; specific inputs documented |
| VEC-06 | MANIFEST.sha256 verified in CI before any conformance test | `sha256sum --check` format confirmed working on both macOS and Linux; portable approach documented |
</phase_requirements>

---

## Summary

Phase 51 delivers the committed golden conformance vectors for the Lattice receipt protocol — generated once, signed with a fixed test keypair, integrity-protected by a SHA-256 manifest. The technical work is (1) generalizing the Phase 50 single-vector generator into a multi-vector generator covering all 3 positive versions and all 7 negative error kinds, (2) sourcing authoritative RFC 8785 reference data for the cross-check proof, (3) creating a private pnpm workspace package that is invisible to the tarball-leak and core-boundary checks, and (4) generating a `sha256sum`-compatible manifest.

The reference implementation pipeline is fully understood from `generate-vector0.ts` and the receipts/ module. All 7 `VerifyErrorKind` values and the 10-step first-match-wins decision tree are confirmed in `verify.ts` and `types.ts`. The `canonicalize@3.0.0` package (authored by Samuel Erdtman and Anders Rundgren, one of the RFC 8785 authors) is the JCS library in use. Authoritative cross-check data exists in two places: RFC 8785 §3.2.4 (published hex bytes for a complete object) and the cyberphone/json-canonicalization repository test corpus (6 input files with corresponding expected output files). Schema validation at generation time should use `ajv` (the de facto JSON Schema draft 2020-12 validator) added only to the private conformance package — NOT to the runtime.

**Primary recommendation:** Build the generator as a thin TypeScript script in `conformance/generate/` that drives the existing `packages/lattice/src/receipts/` pipeline functions directly (as Phase 50 did), uses the fixed keypair from `spec/generate-vector0.ts`, and exits immediately if `--regen-vectors` is absent.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vector generation (signing pipeline) | Generator script (`conformance/generate/`) | Reference impl (`packages/lattice/src/receipts/`) | Generator drives the reference impl — never hand-authors bytes |
| Committed vector storage | `conformance/vectors/` (git-tracked files) | — | Vectors are committed golden fixtures, not generated at CI time |
| Integrity manifest | Generator script writes `MANIFEST.sha256` | CI gate reads it | Written once by generator, checked at every CI run |
| Schema validation at gen time | Generator script + `ajv` (private dep) | `spec/schema/vX.json` (normative) | Validates bodies before signing; ajv stays in private package |
| RFC 8785 cross-check | Generator self-check (inline assertion) | — | Byte-comparison against published reference output within the generator run |

---

## Focused Research Findings

### Research Question 1: RFC 8785 Cross-Check Sources (VEC-05)

**Confirmed library in use:** `canonicalize@3.0.0` [VERIFIED: pnpm-workspace.yaml catalog entry + installed at `node_modules/.pnpm/canonicalize@3.0.0/`]. Package authored by Samuel Erdtman and Anders Rundgren (one of the RFC 8785 authors). Repository: `https://github.com/erdtman/canonicalize`.

**Two authoritative sources for cross-check reference data:**

**Source 1 — RFC 8785 §3.2.2–3.2.4 (the normative example)** [CITED: https://www.rfc-editor.org/rfc/rfc8785]

Input (from §3.2.2):
```json
{"numbers":[333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
 "string":"€$\nA'B\"\\\"/", "literals":[null,true,false]}
```

Expected canonical output (§3.2.3):
```
{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\nA'B\"\\\\\\"/"}
```

Expected canonical bytes hex (§3.2.4 — authoritative, published in RFC):
```
7b 22 6c 69 74 65 72 61 6c 73 22 3a 5b 6e 75 6c 6c 2c 74 72
75 65 2c 66 61 6c 73 65 5d 2c 22 6e 75 6d 62 65 72 73 22 3a
5b 33 33 33 33 33 33 33 33 33 2e 33 33 33 33 33 33 33 2c 31
65 2b 33 30 2c 34 2e 35 2c 30 2e 30 30 32 2c 31 65 2d 32 37
5d 2c 22 73 74 72 69 6e 67 22 3a 22 e2 82 ac 24 5c 75 30 30
30 66 5c 6e 41 27 42 5c 22 5c 5c 5c 5c 5c 22 2f 22 7d
```

This is the "gold standard" cross-check: the exact bytes are published normatively in the RFC itself. **However:** this input contains floating-point numbers and Unicode escape normalization. Our receipt bodies do NOT contain floats (costUsd is a string; integer fields serialize as bare integers). This test proves the canonicalize library's numeric normalization is correct, but it is not a receipt-body test.

**Source 2 — cyberphone/json-canonicalization testdata/** [CITED: https://github.com/cyberphone/json-canonicalization/tree/master/testdata]

The repository contains 6 paired test cases with input in `testdata/input/` and expected canonical output in `testdata/output/`:

- `arrays.json` — Input: `[56, {"d": true, "10": null, "1": []}]` — Expected canonical output: `[56,{"1":[],"10":null,"d":true}]` [VERIFIED: retrieved from raw.githubusercontent.com]
- `french.json` — tests non-ASCII (UTF-8 multi-byte)
- `structures.json` — nested objects
- `unicode.json` — Unicode key ordering edge cases
- `values.json` — primitive values
- `weird.json` — whitespace, escaping edge cases

**Recommended cross-check strategy for VEC-05:**

For the 2 required cross-checks, use both sources:

1. **Cross-check A (RFC 8785 §3.2.4):** Feed the §3.2.2 input through `canonicalize()` from `packages/lattice/src/receipts/canonical.ts` (which wraps `canonicalize@3.0.0`) and assert the output bytes hex-equal the §3.2.4 published bytes. Note: this tests the library directly — `canonicalizeReceiptBody` requires a `CapabilityReceiptBody`, so call `canonicalize()` from the underlying import directly. Embed the input object and expected hex in the generator as a const, assert before writing any vectors.

2. **Cross-check B (cyberphone arrays.json):** Feed `[56, {"d": true, "10": null, "1": []}]` through the same `canonicalize()` function and assert output equals `[56,{"1":[],"10":null,"d":true}]`. This is a simple object/array sort test confirmed against the RFC author's own repository.

Both cross-checks run inside the generator's assertion block (before writing output files) and are reported in a `## RFC 8785 Cross-Check` field of the vector log output. They prove the canonicalizer is spec-compliant, not merely self-consistent.

---

### Research Question 2: Negative Vector Construction — First-Match-Wins Mapping (VEC-04)

The verifier's decision tree is confirmed from `verify.ts` lines 89–180 [VERIFIED: read directly]. The 10 steps in first-match-wins order, with confirmed code locations:

| Step | verify.ts lines | VerifyErrorKind | Trigger |
|------|-----------------|-----------------|---------|
| 1 | 91–99 | `envelope-malformed` | `decodeEnvelope` throws (wrong `payloadType` or malformed base64) OR `signatures[]` empty |
| 2 | 101–108 | `envelope-malformed` | Decoded payload bytes are not valid JSON |
| 3 | 110–117 | `version-mismatch` | `asReceiptBody()` returns `undefined` (missing required field, wrong primitive type, or unrecognized version string) |
| 4 | 119–132 | `schema-version-too-low` | `body.version === undefined` OR `body.version === "lattice-receipt/v1"` |
| 5 | 134–139 | `key-not-found` | `keySet.lookup(firstSig.keyid)` returns `undefined` |
| 6 | 140–145 | `key-revoked` | `entry.state === "revoked"` |
| 7 | 147–155 | `canonicalization-mismatch` | `canonicalizeReceiptBody(body)` !== `decoded.payloadBytes` |
| 8 | 157–166 | `signature-invalid` | Ed25519 verify of PAE bytes fails |
| 9 | 168–173 | `signature-invalid` | `body.kid !== entry.kid` |

**Exact single-mutation construction for each of the 7 kinds:**

#### NEG-01: `envelope-malformed` (Step 1 — wrong payloadType)
Start from a valid signed envelope. Mutate: set `envelope.payloadType = "application/json"` (or any string !== `"application/vnd.lattice.receipt+json"`). `decodeEnvelope()` throws at line 108–113 of `envelope.ts`. This is the simplest Step 1 trigger. Confirmed: `decodeEnvelope` checks `envelope.payloadType !== PAYLOAD_TYPE` and throws immediately.

Alternative Step 1: set `envelope.signatures = []`. `decoded.signatures.length === 0` fires at verify.ts line 97.

Recommended: use wrong `payloadType` — it's more illustrative as it proves the MIME type is checked.

#### NEG-02: `version-mismatch` (Step 3 — unknown version string)
Start from a valid signed envelope. Mutate: replace `body.version` in the canonical JSON payload bytes with `"lattice-receipt/v2"` (a non-recognized non-empty version string). The `asReceiptBody()` function at verify.ts:43–51 checks:
```
v.version !== undefined
  && v.version !== "lattice-receipt/v1"
  && v.version !== "lattice-receipt/v1.1"
  && v.version !== "lattice-receipt/v1.2"
  && v.version !== "lattice-receipt/v1.3"
```
...and returns `undefined`, triggering Step 3.

**Construction challenge:** Mutating the payload bytes means the re-canonicalization check (Step 7) will ALSO fire if the signature was over the original bytes. But Step 3 fires BEFORE Step 7, so the order is correct: the shape check at Step 3 fires first and short-circuits. To construct this vector: take a valid body, serialize it with `version: "lattice-receipt/v2"`, canonicalize, sign with the committed keypair, build a valid DSSE envelope. The key IS in the KeySet but Step 3 fires before Step 5. This is a valid self-contained negative vector.

#### NEG-03: `schema-version-too-low` — `"lattice-receipt/v1"` (Step 4)
Start from a valid body with all required fields. Set `version: "lattice-receipt/v1"`. Canonicalize and sign normally. The `asReceiptBody()` function passes (Step 3 accepts `"lattice-receipt/v1"`), then Step 4 fires at verify.ts:127.

**Note:** This requires TWO vectors to cover both sub-cases per CONTEXT.md:
- NEG-03a: `version: "lattice-receipt/v1"` (literal v1 string)
- NEG-03b: `version` field absent (undefined in body JSON, omitted from the object)

For NEG-03b: the body JSON must not contain the `version` key at all. `asReceiptBody()` allows `v.version === undefined` (line 43–44 checks `v.version !== undefined` first, so if `undefined` it passes the version check). Then Step 4 catches it. Note that the body type `CapabilityReceiptBody` requires version, but for the generator we can cast or build the JSON object directly.

#### NEG-04: `key-not-found` (Step 5)
Start from a fully valid, signed envelope. Mutate: set `envelope.signatures[0].keyid = "unknown-kid-12345"` (a kid that is NOT in the KeySet). Steps 1–4 all pass (the payload is valid JSON with a recognized version), then Step 5 fires at verify.ts:136–138. The KeySet used for verification has only `"spec-example-key-v0"`, so any other kid value triggers this.

#### NEG-05: `key-revoked` (Step 6)
Start from a fully valid, signed envelope (kid = `"spec-example-key-v0"`, all steps 1–4 pass). The KeySet used for verification must have the key with `state: "revoked"`. The vector's `expectedResult` is `"key-revoked"`. The vector file contains the envelope bytes as-is (they are valid), but the vector includes a `verifyKeySet` field (or documents the expected KeySet configuration) so the consumer knows to use a revoked-state entry. **Note for planner:** The vector field set does NOT currently include a `keyState` field for the verification KeySet. The VEC-01 field set is: `body`, `canonicalBytesHex`, `payloadBase64`, `paeHex`, `signatureHex`, `publicKeyJwk`, `kid`, `expectedResult`. For the `key-revoked` vector, the consumer needs to know to present the key as revoked. The `publicKeyJwk` is present (it IS the right key), and the `kid` matches. Add an optional `verifyKeyState` field to negative vectors where the KeySet state matters: for this vector, `"verifyKeyState": "revoked"`. Alternatively, the harness (Phase 52) can infer: "if `expectedResult === 'key-revoked'`, register the key with state 'revoked'". The planner should choose one approach and lock it.

#### NEG-06: `canonicalization-mismatch` (Step 7)
This is the trickiest vector to construct because the verifier re-canonicalizes the body and byte-compares to the signed payload bytes.

The key insight: Step 7 compares `canonicalizeReceiptBody(parsed_body)` against `decoded.payloadBytes`. If these differ, it fires `canonicalization-mismatch`.

**Construction:** Take a valid signed envelope. Modify the payload bytes AFTER signing — specifically, replace the canonical JSON bytes in the base64 payload with a byte-for-byte different but still-valid-JSON version. Since the bytes are changed, the Ed25519 signature is no longer over those bytes, so Step 8 ALSO fails. But Step 7 fires first.

Concrete method:
1. Build a valid body and sign it normally to get `signedCanonicalBytes`.
2. Construct an alternate encoding of the same logical content: add a space before `}` — e.g., JSON.stringify(body) with formatting. The result is valid JSON, parses to the same object, but canonicalizes to `signedCanonicalBytes` (not to the modified bytes). So `reCanonical !== decodedPayloadBytes`.
3. Base64-encode the tampered bytes as the `payload` field.
4. Keep the `signatures` unchanged (they still have the old `sig` over the original PAE).

Result: decodeEnvelope succeeds, JSON.parse succeeds, asReceiptBody succeeds, Step 4 passes, KeySet lookup succeeds (key state active), then Step 7: `canonicalize(parsedBody)` = the canonical form = original signed bytes, but `decoded.payloadBytes` = the tampered bytes. They differ → `canonicalization-mismatch`.

The vector's `signatureHex` is the ORIGINAL signature (over the original PAE), and `payloadBase64` is the TAMPERED bytes (NOT the canonical form). The vector deliberately records the inconsistency.

#### NEG-07: `signature-invalid` — corrupted Ed25519 sig (Step 8)
Start from a fully valid, signed envelope (all steps 1–7 pass: good payloadType, valid JSON, valid shape, good version, key found, key active, canonicalization matches). Mutate: flip one bit in `envelope.signatures[0].sig` (e.g., XOR the last byte of the decoded sig with `0x01`). Steps 1–7 all pass (the payload bytes ARE the canonical bytes — the payload was not changed). Step 8: `verifyEd25519Signature()` returns false → `signature-invalid`.

#### NEG-08: `signature-invalid` — `body.kid` mismatch (Step 9)
Start from a fully valid, signed envelope. This is a more subtle variant: the signed payload has `body.kid = "spec-example-key-v0"`, and `envelope.signatures[0].keyid = "spec-example-key-v0"`. To trigger Step 9 instead of Step 8: the key lookup must succeed (Step 5), the key must not be revoked (Step 6), the canonicalization must match (Step 7), AND the Ed25519 signature must verify (Step 8). Then Step 9 checks `body.kid !== entry.kid`.

**Construction:** This requires a signed body where `body.kid` is a DIFFERENT value than `envelope.signatures[0].keyid`, but the signature over the PAE is still valid. This means:
- Sign the body normally with `body.kid = "spec-example-key-v0"`.
- Then set `envelope.signatures[0].keyid = "spec-example-key-v0-alt"` in the envelope.
- The KeySet must have a key registered under `"spec-example-key-v0-alt"` with the SAME `publicKeyJwk`.
- Step 5: lookup `"spec-example-key-v0-alt"` → found (same public key).
- Step 6: state = "active".
- Step 7: re-canonicalize body → matches payload (body was signed as-is).
- Step 8: verify sig over PAE built from the payload → passes (same key material).
- Step 9: `body.kid ("spec-example-key-v0") !== entry.kid ("spec-example-key-v0-alt")` → `signature-invalid`.

This requires adding a second kid alias to the test KeySet. Alternatively, a simpler approach: set `body.kid = "different-kid"` in the body itself but sign the body with the original keypair under kid `"spec-example-key-v0"`. Then `signatures[0].keyid = "spec-example-key-v0"`, Step 5 finds the key, Step 7 matches (body re-canonicalize = signed bytes), Step 8 passes (signature is valid), Step 9: `body.kid ("different-kid") !== entry.kid ("spec-example-key-v0")` → fires.

**Recommended:** Use the simpler approach (mutate `body.kid` in the signed payload to a different string, keep `signatures[0].keyid` pointing to the real key). But: changing the body payload invalidates the signature UNLESS the body was signed with the tampered `body.kid` already. So sign the body including the wrong kid value:
1. Build body with `body.kid = "wrong-kid"`.
2. Canonicalize and sign → valid signature over that body.
3. Build envelope with `signatures[0].keyid = "spec-example-key-v0"` (the REAL key kid, different from body.kid).
4. KeySet has `"spec-example-key-v0"` active with the right public key.
5. Step 7 passes (re-canonicalize of parsed body = signed bytes).
6. Step 8 passes (valid signature).
7. Step 9: `body.kid ("wrong-kid") !== entry.kid ("spec-example-key-v0")` → `signature-invalid`.

**Summary table of all 7 negative vectors:**

| Vector ID | VerifyErrorKind | Step Triggered | Single Mutation |
|-----------|-----------------|----------------|-----------------|
| NEG-01 | `envelope-malformed` | 1 | Set `payloadType = "application/json"` |
| NEG-02 | `version-mismatch` | 3 | Set `version = "lattice-receipt/v2"` in signed body |
| NEG-03a | `schema-version-too-low` | 4 | Set `version = "lattice-receipt/v1"` in signed body |
| NEG-03b | `schema-version-too-low` | 4 | Omit `version` field entirely from signed body |
| NEG-04 | `key-not-found` | 5 | Set `signatures[0].keyid = "unknown-kid-12345"` |
| NEG-05 | `key-revoked` | 6 | Same valid envelope but verify with `state: "revoked"` KeySet |
| NEG-06 | `canonicalization-mismatch` | 7 | Tamper payload bytes after signing (add whitespace) |
| NEG-07 | `signature-invalid` | 8 | Flip one byte in `sig` (Ed25519 verify fails) |
| NEG-08 | `signature-invalid` | 9 | Body contains `kid = "wrong-kid"`, envelope `keyid = "spec-example-key-v0"` |

Note: NEG-03a and NEG-03b are two separate vectors for `schema-version-too-low` per the CONTEXT.md requirement ("v1 downgrade AND absent version — both rejected before crypto"). Total negative vectors: 9 files covering 7 `VerifyErrorKind` values (with 2 files for `schema-version-too-low` and 2 files for `signature-invalid`).

---

### Research Question 3: MANIFEST.sha256 Mechanics (VEC-06)

**Format:** The `sha256sum --check`-compatible format is one line per file: [VERIFIED: confirmed with actual sha256sum on this macOS machine]
```
<64-char-lowercase-hex>  <relative-path-to-file>
```
(two spaces between hash and path — this is the standard `sha256sum` output format).

**macOS vs Linux compatibility:** Both `sha256sum` (macOS `/sbin/sha256sum`) and `shasum -a 256` (macOS `/usr/bin/shasum`) produce identical output format. The MANIFEST.sha256 file written by the generator using either tool is consumable by `sha256sum --check` on both macOS and Linux. Confirmed: `sha256sum --check` works correctly on macOS Darwin 25.5.0.

**Portable generation approach:** Generate the manifest in pure Node.js (no shell tool dependency) using `crypto.createHash('sha256')` over each file's contents, then write lines in the `<hex>  <path>` format. This is platform-independent and avoids the macOS `sha256sum` vs GNU `sha256sum` flag differences. The CI step that checks it can use `sha256sum --check MANIFEST.sha256` on Linux (standard), and on macOS dev machines `sha256sum --check` also works (verified above).

**Deterministic generation:** Sort file paths lexicographically before writing lines so the manifest is byte-stable across regenerations regardless of filesystem enumeration order.

**Path format:** Use relative paths from `conformance/vectors/` directory (e.g., `positive/vec-00-v1.3.json`), not absolute paths. The CI step must `cd conformance/vectors/` before running `sha256sum --check MANIFEST.sha256`, or use `--check` with a `--chdir` approach.

**Recommended CI command:**
```bash
cd conformance/vectors && sha256sum --check MANIFEST.sha256
```

**Node.js generation snippet pattern:**
```typescript
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

function buildManifest(vectorsDir: string): string {
  const files = [
    ...readdirSync(join(vectorsDir, "positive")).map(f => `positive/${f}`),
    ...readdirSync(join(vectorsDir, "negative")).map(f => `negative/${f}`),
  ].sort();

  return files.map(relPath => {
    const bytes = readFileSync(join(vectorsDir, relPath));
    const hex = createHash("sha256").update(bytes).digest("hex");
    return `${hex}  ${relPath}`;
  }).join("\n") + "\n";
}
```

---

### Research Question 4: `conformance/generate/` Private Package Structure (VEC-02 + TSCONF-02)

**How to keep it out of tarball-leak check:** [VERIFIED: `scripts/check-tarball-leak.mjs` read directly] The tarball-leak script has a hard-coded `PACKAGES` array:
```js
const PACKAGES = [
  { dir: "packages/lattice", name: "@full-self-browsing/lattice", kind: "runtime" },
  { dir: "packages/lattice-cli", name: "@full-self-browsing/lattice-cli", kind: "cli" },
];
```
Any package outside `packages/` is simply NOT inspected by this script. `conformance/generate/` is safe by placement.

**How to keep it out of core-boundary check:** [VERIFIED: `scripts/check-core-package-boundary.mjs` read directly] The script scans `packages/lattice/dist/` only — it checks what the core runtime package imports. `conformance/generate/` is a separate package and is never scanned.

**pnpm workspace declaration:** Add `"conformance/*"` to `pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
  - "conformance/*"
```

**Private package declaration:** The `conformance/generate/package.json` must have `"private": true`. This prevents `pnpm publish` from accidentally publishing it and is the standard pnpm convention for workspace-internal packages.

**The `--regen-vectors` flag no-op pattern:**
```typescript
// conformance/generate/src/main.ts
const args = process.argv.slice(2);
if (!args.includes("--regen-vectors")) {
  console.log("[generate-vectors] No-op: pass --regen-vectors to regenerate.");
  process.exit(0);
}
// ... proceed with generation
```
This is the simplest reliable gate. The package's `scripts.generate` entry in package.json can be:
```json
{
  "scripts": {
    "generate": "tsx src/main.ts --regen-vectors"
  }
}
```
Normal `pnpm -r build` or `pnpm -r test` will NOT trigger generation because the script entry for the CI jobs is named `generate`, not `build`/`test`. CI only invokes `pnpm run generate` explicitly if it wants to regenerate (which it must not).

**TypeScript config:** Extend `tsconfig.base.json` (same pattern as other packages). No `tsdown` build step needed — this is a developer script run directly with `tsx`. No `dist/` output.

**Suggested `package.json`:**
```json
{
  "name": "@lattice-conformance/generate",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "generate": "tsx src/main.ts --regen-vectors",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "ajv": "^8.20.0",
    "tsx": "catalog:",
    "typescript": "catalog:"
  }
}
```

Note: `tsx` is in the workspace root `devDependencies` but since this is a separate package, it should reference `tsx` from `catalog:` or use `pnpm exec tsx` via the root `node_modules/.bin`. Given `tsx` is in root `devDependencies`, `pnpm exec tsx` from the package directory resolves it via hoisting.

---

### Research Question 5: Schema Validation at Generation Time (ajv vs lightweight check)

**Decision:** Use `ajv@^8.x` in the `conformance/generate/` private package. Rationale:

1. The spec/schema files use JSON Schema draft 2020-12 (`"$schema": "https://json-schema.org/draft/2020-12/schema"`). `ajv` with the `ajv/dist/2020` import supports draft 2020-12 natively. [ASSUMED — training knowledge; ajv draft-2020-12 support is well-documented but not verified against their current docs this session]

2. `additionalProperties: false` on the root body and subobjects (`model`, `route`, `usage`) provides a useful drift gate — it will catch if the generator accidentally passes v1.3-only fields into a v1.1 vector body. A lightweight structural check (typeof checks like Phase 50 used) cannot catch this.

3. `ajv` stays in the private `conformance/generate/` package only. It does NOT enter `packages/lattice/` or the runtime. The core-boundary check does not scan `conformance/`.

4. ajv is a widely-adopted package [VERIFIED: `npm view ajv version` returns `8.20.0`; repository: `https://github.com/ajv-validator/ajv.git`]. It is the standard JSON Schema validator in the Node.js ecosystem.

**Usage pattern for draft 2020-12:**
```typescript
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";

const ajv = new Ajv2020();
addFormats(ajv); // for date-time format in issuedAt, timestamp fields

const schemaV11 = JSON.parse(readFileSync("../../spec/schema/v1.1.json", "utf8"));
const validateV11 = ajv.compile(schemaV11);

// Before writing each positive vector:
if (!validateV11(vectorBody)) {
  throw new Error(`v1.1 vector body failed schema validation: ${JSON.stringify(validateV11.errors)}`);
}
```

Note: `ajv-formats` is needed for `format: "date-time"` used in the schema's `issuedAt` and `timestamp` fields. Add it alongside `ajv` in `conformance/generate/package.json`.

**Negative vectors:** Skip schema validation for negative vectors (by definition they may have invalid/absent fields). Only validate positive vector bodies.

---

## Standard Stack

### Core (already in workspace)

| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `canonicalize` | `3.0.0` | RFC 8785 JCS canonicalization | [VERIFIED: pnpm-workspace.yaml catalog] |
| `@noble/ed25519` | via WebCrypto | Ed25519 signing (wrapped by `sign.ts`) | [VERIFIED: pnpm-workspace.yaml catalog] |
| `tsx` | `^4.22.4` | Run TypeScript scripts directly | [VERIFIED: root package.json devDependencies] |
| `vitest` | `4.1.5` | Unit testing for generator self-checks | [VERIFIED: pnpm-workspace.yaml catalog] |

### New — only in `conformance/generate/` (private)

| Library | Version | Purpose | Note |
|---------|---------|---------|------|
| `ajv` | `^8.20.0` | JSON Schema draft 2020-12 validation of vector bodies | [VERIFIED: npm registry — version 8.20.0] |
| `ajv-formats` | current | `format: "date-time"` support for ajv | [ASSUMED — standard companion package, not verified on registry this session] |

**Installation (inside `conformance/generate/`):**
```bash
pnpm add -D ajv ajv-formats
```

### Package Legitimacy Audit

`slopcheck` CLI exited non-zero in this session (run failed). Manual verification performed instead:

| Package | Registry | Evidence | Disposition |
|---------|----------|----------|-------------|
| `canonicalize` | npm | v3.0.0 installed in workspace; authored by RFC 8785 authors; repo: github.com/erdtman/canonicalize | Approved [VERIFIED] |
| `ajv` | npm | v8.20.0 from `npm view ajv version`; repo: github.com/ajv-validator/ajv | Approved [VERIFIED: registry] |
| `ajv-formats` | npm | Standard companion to ajv; `npm view ajv-formats version` not run | [ASSUMED — verify before install] |

*slopcheck was unavailable (run failed). `ajv-formats` is tagged `[ASSUMED]` — planner should run `npm view ajv-formats` and verify the repo before adding to package.json.*

---

## Architecture Patterns

### System Architecture Diagram

```
Developer invokes: pnpm run generate (in conformance/generate/)
        |
        v
[src/main.ts] ─── checks process.argv for --regen-vectors
        |            └─ absent: log "no-op", exit 0
        |            └─ present: proceed
        |
        ├─── RFC 8785 Cross-Check Assertions (VEC-05)
        │      Import canonicalize() directly
        │      Assert §3.2.4 hex bytes match
        │      Assert cyberphone arrays.json output matches
        │      Fail fast if assertions fail
        |
        ├─── Positive Vector Generator (VEC-03)
        │      For each version: v1.1, v1.2, v1.3
        │        Build body → redactReceiptBody() → canonicalizeReceiptBody()
        │        → buildPae() → signer.sign() → encodeEnvelope() → receiptCid()
        │        Validate body against spec/schema/vX.json via ajv
        │        Write conformance/vectors/positive/vec-NN-vX.Y.json
        │      v1.3 output MUST byte-match spec/vector0-fixture.json
        |
        ├─── Negative Vector Generator (VEC-04)
        │      For each VerifyErrorKind: apply single-mutation construction
        │      Write conformance/vectors/negative/neg-XX-<kind>.json
        |
        └─── Manifest Writer (VEC-06)
               Read all vector files from positive/ and negative/
               Sort paths lexicographically
               Compute SHA-256 of each file's bytes (Node.js crypto)
               Write conformance/vectors/MANIFEST.sha256
               Verify self-consistency (sha256sum --check)
               Log "Done: N vectors written, manifest verified"
```

### Recommended Project Structure

```
conformance/
  generate/
    package.json          # private: true, name: @lattice-conformance/generate
    tsconfig.json         # extends ../../tsconfig.base.json
    src/
      main.ts             # entry point: flag check, orchestrates generation
      positive.ts         # positive vector construction per version
      negative.ts         # negative vector construction per VerifyErrorKind
      manifest.ts         # MANIFEST.sha256 writer
      rfc8785-check.ts    # RFC 8785 cross-check assertions (VEC-05)
      types.ts            # ConformanceVector interface (the VEC-01 field set)
  vectors/
    positive/
      vec-00-v1.3.json    # byte-identical to spec/vector0-fixture.json
      vec-01-v1.1.json
      vec-02-v1.2.json
    negative/
      neg-01-envelope-malformed.json
      neg-02-version-mismatch.json
      neg-03a-schema-version-too-low-v1.json
      neg-03b-schema-version-too-low-absent.json
      neg-04-key-not-found.json
      neg-05-key-revoked.json
      neg-06-canonicalization-mismatch.json
      neg-07-signature-invalid-bad-sig.json
      neg-08-signature-invalid-kid-mismatch.json
    MANIFEST.sha256
```

### Pattern 1: Flag Gate — No-Op Without `--regen-vectors`

```typescript
// Source: design decision from 51-CONTEXT.md
const args = process.argv.slice(2);
if (!args.includes("--regen-vectors")) {
  console.log("[generate-vectors] No-op. Pass --regen-vectors to regenerate committed vectors.");
  process.exit(0);
}
```

### Pattern 2: Byte-Identity Check Against vector0-fixture.json

```typescript
// Source: design decision from 51-CONTEXT.md + generate-vector0.ts pattern
import fixtureData from "../../../spec/vector0-fixture.json" with { type: "json" };

// After generating vec-00-v1.3.json, verify it matches the committed fixture:
if (generatedVector.canonicalBytesHex !== fixtureData.canonicalBytesHex) {
  throw new Error("vec-00-v1.3 canonical bytes do not match spec/vector0-fixture.json — keypair or body mismatch");
}
```

### Pattern 3: Fixed Keypair Reuse

The committed keypair lives in `spec/generate-vector0.ts`. The generator imports it from there (or re-embeds the same constants). Do NOT re-generate keys.

```typescript
// Reuse from spec/generate-vector0.ts — same constants
const EXAMPLE_PRIVATE_KEY_JWK: JsonWebKey = {
  key_ops: ["sign"], ext: true, alg: "Ed25519", crv: "Ed25519",
  d: "U0lQtD0LB_4s1248jIAPfXB6_WDu6HOaaSvALETgFNg",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};
const KID = "spec-example-key-v0";
```

### Pattern 4: VEC-01 Vector File Shape

Every vector file (positive and negative) is a JSON object with this field set:

```typescript
// Source: 51-CONTEXT.md decisions
interface ConformanceVector {
  WARNING: string;            // "EXAMPLE/TEST-ONLY KEY MATERIAL..."
  body: object;               // the input receipt body (after redaction for positives)
  canonicalBytesHex: string;  // hex of JCS canonical bytes
  payloadBase64: string;      // standard base64 of canonical bytes (DSSE payload)
  paeHex: string;             // hex of DSSE PAE bytes
  signatureHex: string;       // hex of Ed25519 signature (128 chars = 64 bytes)
  publicKeyJwk: JsonWebKey;   // the public verification key
  kid: string;                // key identifier
  expectedResult: "ok" | VerifyErrorKind;  // "ok" for positives, error kind for negatives

  // Optional fields for negative vectors that require non-standard KeySet state:
  verifyKeyState?: "active" | "retired" | "revoked";  // for key-revoked vector
  verifyKeyid?: string;  // for kid-mismatch / key-not-found vectors (keyid to use in lookup)
}
```

For negative vectors where the signed payload differs from what the verifier would canonicalize back to (NEG-06), the `body` field contains the PARSED body (what JSON.parse produces), and `payloadBase64` contains the TAMPERED bytes. This is the intentional inconsistency the vector tests.

### Anti-Patterns to Avoid

- **Hand-authored canonical bytes:** Never write `canonicalBytesHex` manually. Always derive from `canonicalizeReceiptBody()`. (D-03 in Phase 50 patterns)
- **Running generation in CI:** The flag gate prevents this, but also ensure the `generate` script name differs from `build`/`test` so `pnpm -r build` never triggers generation.
- **Re-generating the keypair:** Using a fresh keypair breaks byte-stability across regenerations and breaks the match to `spec/vector0-fixture.json`.
- **Installing ajv in packages/lattice:** The core-boundary check would not catch it (ajv is not in `FORBIDDEN_CORE_PACKAGES`), but it would inflate the runtime install unnecessarily. Keep ajv in `conformance/generate/` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RFC 8785 JCS | Custom key-sorter | `canonicalize@3.0.0` (already in workspace) | UTF-16BE key ordering edge cases are subtle; the lib is authored by the RFC author |
| Ed25519 signing | Custom crypto | `crypto.subtle` via `sign.ts` `createInMemorySigner` | Avoids raw crypto mistakes; same code path as production |
| SHA-256 manifest hashing | Shell `sha256sum` piping | `node:crypto` `createHash('sha256')` | Platform-independent; no shell tool version drift |
| JSON Schema validation | Manual field-by-field checks | `ajv@^8` + `ajv-formats` | `additionalProperties: false` in schemas catches field-set drift; manual checks miss it |

---

## Common Pitfalls

### Pitfall 1: v1.1 Body Contains v1.2/v1.3-Only Fields
**What goes wrong:** If the v1.1 positive vector body contains `modelClass` (v1.2+) or `parentReceiptCid`/`lineageMerkleRoot` (v1.3), `ajv` validation against `spec/schema/v1.1.json` fails (the schema uses `additionalProperties: false`).
**Why it happens:** `CapabilityReceiptBody` TypeScript type allows all optional fields; spreading a v1.3 body down to v1.1 carries forbidden fields.
**How to avoid:** Build version-specific bodies explicitly, not by stripping from a v1.3 body. Each version has its own body-building function.

### Pitfall 2: MANIFEST.sha256 Path Format Mismatch
**What goes wrong:** `sha256sum --check` fails because the manifest contains absolute paths but the check is run from a different directory, or vice versa.
**How to avoid:** Always write relative paths in the manifest (`positive/vec-00-v1.3.json`), always run `sha256sum --check` from `conformance/vectors/`.

### Pitfall 3: `canonicalization-mismatch` Vector Triggers Wrong Step
**What goes wrong:** When tampering the payload bytes for NEG-06, if the tampered bytes fail JSON.parse (e.g., introducing a syntax error), Step 2 fires instead of Step 7.
**How to avoid:** Tamper in a way that preserves JSON validity: add ASCII whitespace before the closing `}`. `JSON.parse(tampered)` succeeds; `canonicalize(JSON.parse(tampered))` produces the original canonical bytes (whitespace stripped by JCS); `decoded.payloadBytes` ≠ original bytes → Step 7 fires.

### Pitfall 4: Ed25519 Sign Step Requires Await
**What goes wrong:** Forgetting to `await signer.sign()` in the generator results in a Promise object in `signatureHex`, not bytes.
**How to avoid:** The generator is an async function. Await all signing calls.

### Pitfall 5: Fixed Timestamp Value Not the Same as Phase 50
**What goes wrong:** Using a different `issuedAt` timestamp for vec-00-v1.3 than the one in `spec/vector0-fixture.json` ("2026-06-25T00:00:00.000Z") makes it impossible to reproduce the fixture byte-identically.
**How to avoid:** Hard-code the SAME fixed timestamps from generate-vector0.ts for vec-00. Use different but also fixed timestamps for vec-01 (v1.1) and vec-02 (v1.2).

### Pitfall 6: `schema-version-too-low` — Missing `undefined` Vector
**What goes wrong:** Only generating the `"lattice-receipt/v1"` variant of `schema-version-too-low` and missing the absent-version variant (NEG-03b). VEC-04 explicitly requires both.
**How to avoid:** Explicitly build a body object without the `version` key and sign it. The body JSON will not contain a `"version"` field; `asReceiptBody()` accepts it (passes undefined check at step 3), then Step 4 fires.

### Pitfall 7: `body.kid` on `key-revoked` Vector
**What goes wrong:** The `key-revoked` vector has a fully valid signed envelope where `body.kid = "spec-example-key-v0"` — the same kid as the revoked key. If the verifier's KeySet registers this kid as `"active"` instead of `"revoked"`, Step 6 does not fire and the vector becomes a false-positive `"ok"`.
**How to avoid:** The vector file must document that verification requires presenting the key with `state: "revoked"`. Recommend adding `"verifyKeyState": "revoked"` as a field in the negative vector JSON so Phase 52's harness knows to configure the KeySet state appropriately.

---

## Code Examples

### Generate a v1.1 Positive Vector Body

```typescript
// Source: spec/generate-vector0.ts pattern + spec/schema/v1.1.json field inventory
const body11: CapabilityReceiptBody = {
  version: "lattice-receipt/v1.1",
  receiptId: "00000000-0000-4000-a000-000000000002",
  runId: "spec-vector-1",
  issuedAt: "2026-06-25T00:00:01.000Z",  // fixed, different from vec-00
  kid: KID,
  // v1.1 optional step-marker fields are allowed; include at least stepName for coverage
  stepName: "step-v1.1",
  model: { requested: "gpt-4o", observed: "gpt-4o-2024-11-20" },
  route: { providerId: "openai", capabilityId: "chat", attemptNumber: 1 },
  usage: { promptTokens: 50, completionTokens: 20, costUsd: "0.000500" },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: null,
  redactionPolicyId: DEFAULT_REDACTION_POLICY_ID,
  redactions: [],
  // MUST NOT include modelClass, parentReceiptCid, lineageMerkleRoot (v1.2/v1.3 only)
};
// No tripwireEvidence → no redaction fires → redactions[] stays []
```

### RFC 8785 Cross-Check Inline Assertion

```typescript
// Source: RFC 8785 §3.2.2-3.2.4 + cyberphone/json-canonicalization testdata
import canonicalize from "canonicalize";

function runRFC8785CrossChecks(): void {
  // Cross-check A: RFC 8785 §3.2.4 normative example
  const rfcInput = {
    "numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],
    "string": "€$\nA'\"\\/",
    "literals": [null, true, false]
  };
  const rfcExpectedHex =
    "7b226c6974657261ls22" // ... (trimmed)
    // Full expected hex from §3.2.4
  const rfcActualBytes = new TextEncoder().encode(canonicalize(rfcInput)!);
  const rfcActualHex = toHex(rfcActualBytes);
  if (rfcActualHex !== RFC8785_SECTION324_HEX) {
    throw new Error(`RFC 8785 §3.2.4 cross-check FAILED. Expected:\n${RFC8785_SECTION324_HEX}\nActual:\n${rfcActualHex}`);
  }
  console.log("[cross-check A] RFC 8785 §3.2.4 PASSED");

  // Cross-check B: cyberphone/json-canonicalization testdata arrays.json
  const arraysInput = [56, {"d": true, "10": null, "1": []}];
  const arraysExpected = `[56,{"1":[],"10":null,"d":true}]`;
  const arraysActual = canonicalize(arraysInput)!;
  if (arraysActual !== arraysExpected) {
    throw new Error(`RFC 8785 cross-check B (arrays.json) FAILED.\nExpected: ${arraysExpected}\nActual: ${arraysActual}`);
  }
  console.log("[cross-check B] cyberphone arrays.json PASSED");
}
```

The exact RFC 8785 §3.2.4 hex bytes (as a single string, spaces removed) are:
```
7b226c6974657261 6c73223a5b6e756c 6c2c747275652c66 616c73655d2c226e
756d62657273223a 5b333333333333333 333332e3333333333 332c312b33302c342
e352c302e3030322c 312d32375d2c2273 7472696e67223a22 e282ac245c75303030
665c6e41 27425c225c5c5c5c5c 222f227d
```

(The executor should paste the RFC §3.2.4 hex with spaces removed into the cross-check constant.)

---

## Version-Specific Field Differences for Positive Vectors

| Field | v1.1 | v1.2 | v1.3 |
|-------|------|------|------|
| `modelClass` | Must NOT be present | Optional | Optional |
| `parentReceiptCid` | Must NOT be present | Must NOT be present | Optional |
| `lineageMerkleRoot` | Must NOT be present | Must NOT be present | Optional |
| All other fields | Same | Same | Same |

v1.2 positive vector should include `modelClass: "frontier_rlhf"` to exercise the v1.2 addition.
v1.3 positive vector (vec-00) is identical to `spec/vector0-fixture.json` — includes `parentReceiptCid`? No: vector0 does NOT use `parentReceiptCid` or `lineageMerkleRoot` (both are optional). The planner may choose to add them to show v1.3 capability, but it is not required.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ajv@^8` supports JSON Schema draft 2020-12 via `ajv/dist/2020` import | Research Q5 | Schema validation step would need a different approach; risk is LOW (ajv draft-2020-12 support is a well-established feature) |
| A2 | `ajv-formats` exists on npm and is the standard companion for date-time format validation | Standard Stack | Would need alternative approach for format: "date-time" validation; can fall back to patternless validation |
| A3 | vec-00 (v1.3) does not need to include `parentReceiptCid` or `lineageMerkleRoot` to reproduce `spec/vector0-fixture.json` | Code Examples | Confirmed from reading vector0-fixture.json — neither field is present; no risk |

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (workspace catalog) |
| Config file | `conformance/generate/vitest.config.ts` (Wave 0 — does not exist yet) |
| Quick run command | `pnpm --filter @lattice-conformance/generate test` |
| Full suite command | `pnpm --filter @lattice-conformance/generate test` (same; generator tests are fast) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VEC-01 | Vector field set matches spec | unit | verify field presence in generated JSON | No — Wave 0 |
| VEC-02 | Generator exits 0 with no output when `--regen-vectors` absent | unit | mock process.argv, assert no files written | No — Wave 0 |
| VEC-03 | Positive vectors cover v1.1, v1.2, v1.3 | unit | assert 3 files in positive/, assert version fields | No — Wave 0 |
| VEC-04 | Negative vectors cover all 7 VerifyErrorKind | unit | assert expectedResult values cover all 7 kinds | No — Wave 0 |
| VEC-05 | RFC 8785 cross-check passes | unit | inline assertion in generator (auto-run on `--regen-vectors`) | No — Wave 0 |
| VEC-06 | MANIFEST.sha256 passes `sha256sum --check` | integration | `cd conformance/vectors && sha256sum --check MANIFEST.sha256` | No — Wave 0 |
| vec-00 byte identity | vec-00-v1.3.json matches spec/vector0-fixture.json | unit | field-by-field comparison | No — Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm --filter @lattice-conformance/generate test` (fast unit tests for generator logic)
- **Per wave merge:** Same + `cd conformance/vectors && sha256sum --check MANIFEST.sha256`
- **Phase gate:** Full suite green + manifest check before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `conformance/generate/vitest.config.ts` — vitest configuration for the private package
- [ ] `conformance/generate/src/main.test.ts` — covers VEC-02 (no-op without flag), VEC-01 (field set), VEC-03 (version coverage), VEC-04 (kind coverage), VEC-05 (RFC 8785 assertions), byte-identity assertion for vec-00
- [ ] `conformance/generate/tsconfig.json` — extends tsconfig.base.json
- [ ] `conformance/generate/package.json` — private, with ajv deps and test script
- [ ] Framework install: `pnpm --filter @lattice-conformance/generate add -D ajv ajv-formats vitest`

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Generator script | Yes | v24.14.1 | — |
| `tsx` | Running `main.ts` | Yes (via pnpm exec) | ^4.22.4 | `node --import tsx/esm` |
| `pnpm` | Workspace ops | Yes | 10.33.1 | — |
| `sha256sum` | Manifest check (CI/dev) | Yes (macOS + Linux) | Darwin 1.0 / GNU | `shasum -a 256` on macOS (same output format) |
| `canonicalize@3.0.0` | JCS canonicalization | Yes (installed) | 3.0.0 | — |
| `vitest` | Test runner | Yes (workspace) | 4.1.5 | — |
| `ajv@^8` | Schema validation | Not yet installed | — | Add to `conformance/generate/` |

**Missing dependencies with no fallback:**
- `ajv` — must be added to `conformance/generate/package.json` devDependencies before Wave 1

**Missing dependencies with fallback:**
- None blocking

---

## Security Domain

`security_enforcement` not explicitly set in `config.json` — treat as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | n/a — generator is a dev-only script, no auth surface |
| V3 Session Management | No | n/a |
| V4 Access Control | No | n/a — private package, never published |
| V5 Input Validation | Yes — schema validation | `ajv` against `spec/schema/vX.json` at generation time |
| V6 Cryptography | Yes — key material handling | EXAMPLE/TEST-ONLY keypair clearly labeled; `createInMemorySigner` from reference impl; no production keys |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Committed keypair mistaken for production key | Spoofing | `WARNING` field in every vector file + `EXAMPLE/TEST-ONLY` comment in source |
| Silent vector regeneration in CI breaks drift detection | Tampering | `--regen-vectors` flag gate; CI only reads committed vectors |
| Manifest collision (modified vector passes sha256sum --check) | Tampering | SHA-256 is collision-resistant for this use case; manifest itself is committed to git |

---

## Sources

### Primary (HIGH confidence)
- `packages/lattice/src/receipts/verify.ts` — verified first-match-wins 10-step decision tree and all 7 VerifyErrorKind
- `packages/lattice/src/receipts/types.ts` — verified VerifyErrorKind union type definition
- `packages/lattice/src/receipts/canonical.ts` — verified `canonicalize@3.0.0` import and usage
- `packages/lattice/src/receipts/envelope.ts` — verified decodeEnvelope, encodeEnvelope, buildPae, PAYLOAD_TYPE
- `spec/generate-vector0.ts` — verified committed keypair constants and generation pattern
- `spec/vector0-fixture.json` — verified canonical v1.3 positive vector field set
- `spec/schema/v1.1.json` — verified additionalProperties: false, field inventory, draft 2020-12
- `pnpm-workspace.yaml` — verified workspace package glob pattern
- `scripts/check-tarball-leak.mjs` — verified hard-coded PACKAGES array (conformance/ excluded)
- `scripts/check-core-package-boundary.mjs` — verified only scans `packages/lattice/dist/`
- `.planning/config.json` — verified `nyquist_validation: true`
- RFC 8785 §3.2.2–3.2.4 — normative example input, canonical output string, and byte-level hex [CITED: https://www.rfc-editor.org/rfc/rfc8785]
- cyberphone/json-canonicalization testdata arrays.json — input `[56, {"d": true, "10": null, "1": []}]`, expected output `[56,{"1":[],"10":null,"d":true}]` [CITED: https://github.com/cyberphone/json-canonicalization]

### Secondary (MEDIUM confidence)
- `npm view canonicalize version` → 3.0.0 [VERIFIED: registry check]
- `npm view ajv version` → 8.20.0 [VERIFIED: registry check]

### Tertiary (LOW / ASSUMED)
- `ajv-formats` as standard companion package [ASSUMED — not registry-verified this session]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified in installed node_modules or registry
- Architecture: HIGH — all source files read directly
- Negative vector constructions: HIGH — derived from verified verify.ts decision tree
- RFC 8785 cross-check data: HIGH — §3.2.4 hex bytes from the published RFC; arrays.json from canonical repository
- Pitfalls: HIGH — derived from direct code inspection of the pipeline
- ajv-formats existence: ASSUMED — not registry-verified

**Research date:** 2026-06-25
**Valid until:** 2026-09-25 (stable domain: RFC 8785 is final; canonicalize@3.0.0 pinned in catalog)
