# Feature Research

**Domain:** Versioned language-neutral signed-record protocol + multi-language verifier/client ecosystem
**Researched:** 2026-06-24
**Confidence:** HIGH (spec and algorithm features); MEDIUM (Python library choices, exact vector format)

---

## Prior Art Survey

This section establishes the concrete patterns Lattice can adopt, ordered from most directly applicable to least.

### DSSE (Dead Simple Signing Envelope)

Source: secure-systems-lab/dsse `protocol.md` (v1.0.0)

**PAE formula (verbatim):**
```
PAE(type, body) = "DSSEv1" + SP + LEN(type) + SP + type + SP + LEN(body) + SP + body
```
`SP` = ASCII 0x20; `LEN(s)` = ASCII decimal byte-length, no leading zeros.

**What the spec pins down for cross-language parity:**
- The `payloadType` field MUST be treated case-sensitively. Application-specific MIME types or URIs are required; generic `application/json` is explicitly discouraged because two apps could share the encoding but diverge on interpretation.
- Lattice already uses `application/vnd.lattice.receipt+json` — this is correct practice.
- Verification algorithm: decode → optionally filter by keyid → verify `Sign(PAE(UTF8(PAYLOAD_TYPE), SERIALIZED_BODY))` → confirm payloadType is supported → parse body per declared type.
- Critical: "implementations MUST NOT re-parse the envelope after verification to pull out the payload" (security requirement against confused-deputy attacks).
- Multi-sig: a `(t, n)` envelope requires at least `t` valid signatures from `n` unique trusted keys.

**What the spec does NOT pin down:** canonicalization of the payload (that is RFC 8785's job); the spec is intentionally agnostic to what `SERIALIZED_BODY` is, only committing to the PAE wrapper.

**Cross-language adoption pattern:** The DSSE spec is deliberately minimal so that any language that can do byte concatenation and Ed25519 verification can implement it. Existing implementations exist in Go (sigstore-go), Python (e3-core), Rust (sigstore-types), TypeScript (Lattice). The PAE formula is the sole cross-language artifact — no canonicalization library is required to implement the envelope layer.

### RFC 8785 (JCS) Test Vectors

Source: RFC 8785 Appendices B, F, G; trailofbits/rfc8785.py; algovoi-jcs-conformance-vectors.

**What RFC 8785 ships:**
- Appendix B: IEEE 754 hex-to-JSON number serialization table covering zero, max/min values, infinity/NaN edge cases.
- Sections 3.2.2-3.2.4: A worked example JSON object → canonical bytes → UTF-8 hex. This is the baseline interop test: if two implementations agree on these bytes, they agree on JCS.
- Appendix G: Reference implementations in JavaScript, Java, Go, C#, Python — these are the cross-validation targets.

**What the ecosystem adds (algovoi-jcs-conformance-vectors):**
- 245 vectors across 30 anchor sets, validated byte-for-byte across 8 independent implementations in 8 languages (Java, PHP, .NET, Ruby, Python, Go, Rust, TypeScript).
- Structure: each vector provides an input JSON object, the SHA-256 of the JCS output (the "receipt_hash"), and optionally composed field assertions.
- Negative/adversarial anchor set `adversarial_isolation_v1`: 1 control + 11 isolated rejection vectors, each mutating exactly one field to confirm the named check rejects it.
- Pattern for Lattice: the vector file format the ecosystem has converged on is `{ "description": "...", "input": {...}, "canonical_sha256": "hex...", "expected_error": null | "error-kind-string" }`.

**Python library:** `rfc8785` (trailofbits, v0.1.4, Apache 2.0) — pure Python, zero runtime deps, `rfc8785.dumps(obj)` returns UTF-8 bytes. This is the exact counterpart to npm `canonicalize@3.0.0`.

### in-toto Attestation Framework / SLSA Provenance

Source: in-toto/attestation `spec/README.md`, `spec/versioning.md`, `spec/v1/envelope.md`.

**Predicate type versioning pattern:**
- The `predicateType` URI includes only the major version (e.g., `https://slsa.dev/provenance/v1`). Minor/patch changes are additive and monotonic; they do NOT change the URI.
- Producers MAY add extension fields using field names that are URIs; consumers MUST ignore unrecognized fields (forward compatibility).
- Breaking changes (field meaning changes) REQUIRE a new major version and a new URI.

**Adoptable pattern for Lattice:** The existing `version` field inside `CapabilityReceiptBody` (e.g., `lattice-receipt/v1.2`) follows this pattern already. The spec formalism to add is: the spec document must enumerate exactly which fields are required at which version, which are optional-additive, and what the downgrade rejection boundary is. The `verifyReceipt` step 4 (`schema-version-too-low`) is the machine enforcement of this boundary.

**Cross-language verification:** in-toto ships Protobuf definitions for language-independent statement + predicate type definitions. This is how sigstore achieves Go/Python/Java/Rust client parity: a shared protobuf-spec defines the wire format, and each language client implements verification against that spec. For Lattice the analogous artifact is a written SPEC document + committed conformance vectors (since Lattice's format is JSON-native, protobuf is not needed).

### Sigstore Conformance Suite

Source: sigstore/sigstore-conformance `docs/cli_protocol.md`; sigstore blog (conformance first released late 2022, protobuf-spec early 2023).

**What made Sigstore cross-language:**
1. Late 2022: conformance tests codified a verification API + which scenarios must succeed/fail.
2. Early 2023: protobuf-spec released, standardizing file formats for signed content and verification content so components are interoperable.
3. sigstore-go, sigstore-python, sigstore-java, sigstore-rs all adopted conformance testing + protobuf-specs.
4. sigstore-go passes the full conformance suite; it is now the recommended verification path.

**CLI protocol pattern:** Conforming clients implement `sign-bundle` and `verify-bundle` subcommands to a prescribed flag interface. "Since the client's CLI is unlikely to conform to this protocol, it may be necessary to write a thin wrapper." This is the exact model for Lattice: `lattice-conformance` can be a thin shim that invokes `lattice verify` and checks exit codes + output.

**Test assets:** Parametrized verification tests stored in `test/assets/bundle-verify/`. Most verification tests can be parametrized without new code — a directory of vector files that a single test loop runs over. This is the correct architecture: vectors in data files, single test harness.

**Negative test cases in Sigstore:** "Does the client fail when given a signing certificate that isn't signed by the Fulcio root CA?" and "Does the client fail when given an invalid inclusion proof from Rekor?" — each is a pre-built bundle asset with one specific field corrupted.

**Adoptable pattern for Lattice:** One JSON file per negative case, one field mutated, expected `VerifyError.kind` as the assertion target. The TS verifier already returns exactly 7 typed `VerifyErrorKind` values — these become the exhaustive negative test case labels.

### W3C VC Data Integrity (eddsa-jcs-2022)

Source: W3C TR `vc-di-eddsa` spec.

**JCS profile for signatures:** The `eddsa-jcs-2022` cryptosuite: input document → `rfc8785.dumps()` → SHA-256 → Ed25519 sign. Test vectors for both rdfc (RDF Dataset Normalization) and jcs cryptosuites are included in the spec. The jcs variant is the closest prior art to Lattice's approach (JSON-native, no RDF).

**Adoptable pattern:** The W3C spec includes human-readable worked examples showing the exact bytes at each pipeline stage. Lattice's spec document should do the same for each of the 6 pipeline steps (assemble → redact → JCS → base64 → PAE → Ed25519).

### C2PA Content Credentials

Source: C2PA spec v2.2; c2pa.org/conformance.

**COSE-based approach:** C2PA uses COSE_Sign1 (RFC 8152/9052, CBOR-based), not JSON. Not directly adoptable for Lattice which is JSON-native. However, C2PA's conformance program is instructive: it is a "risk-based governance process" with generator and validator products certified separately. Lattice's v1.5 scope is narrower — one client, one conformance gate in CI — but the generator/validator split (mint vs. verify) maps directly.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any cross-language protocol ecosystem must have. Missing these means the ecosystem claim is hollow.

| Feature | Why Expected | Complexity | Prior Art Pattern | Notes |
|---------|--------------|------------|-------------------|-------|
| Written spec document (SPEC.md or docs/spec/) pinning all protocol decisions | Any language author needs a single authoritative reference; without it, every client diverges by intuition | LOW | in-toto attestation `spec/README.md`; SLSA `spec/v1.0/`; DSSE `protocol.md` | Lift from `paper/main.tex` — the LaTeX already contains the full algorithm. Spec must enumerate: JCS step, base64 encoding, PAE formula, Ed25519 key format (JWK OKP), `kid` resolution, 7 error kinds, downgrade boundary. |
| Spec pins the exact `payloadType` URI | Every verifier must reject an envelope with the wrong type string | LOW | DSSE: payloadType is case-sensitive, must be app-specific | `application/vnd.lattice.receipt+json` is already correct; spec must state it normatively with MUST. |
| Spec pins I-JSON number rules (costUsd as string) | A float on one side of the wire diverges from a string on the other — canonicalization breaks silently | LOW | RFC 7493 (I-JSON); Lattice paper §IV | Already enforced in TS; spec must state this as a MUST with rationale. |
| Committed conformance vectors in the repo | Without committed golden bytes, CI cannot detect drift; clients cannot self-validate | MEDIUM | algovoi-jcs-conformance-vectors (245 vectors / 8 langs); sigstore `test/assets/bundle-verify/`; Ratify protocol (59 canonical vectors) | See "Conformance Vector Suite Specification" section below. |
| CI gate that runs vectors against both TS and Python | Prevents silent drift between implementations | MEDIUM | sigstore-conformance GitHub Actions daily job; algovoi `conformance-run` action | Single workflow job, fail-fast on any single-byte mismatch. |
| Python: `verify(envelope, keyset) -> VerifyResult` matching the 7 TS error kinds | A verifier that returns different errors than the TS reference is not conformant | MEDIUM | pipelock-verify-python (verify-only, single `cryptography` dep); Ratify protocol Go+TS+Python+Rust parity | See "Python Client Scope" section. Verify is the smallest and highest-trust operation. |
| Python: envelope decode + PAE construction byte-identical to TS | PAE is pure byte manipulation; any deviation means the signature fails | LOW | DSSE spec PAE formula is language-neutral; all cross-language impls use the same formula | No library needed — string concatenation with ASCII length encoding. |
| Spec states downgrade rejection boundary explicitly | Without this, a client that accepts v1 receipts is "conformant" by omission | LOW | Lattice already enforces this in TS (step 4, `schema-version-too-low`); in-toto major-version-in-URI pattern | Spec must state: "A conforming verifier MUST reject any receipt whose `body.version` is absent or equals `lattice-receipt/v1`." |
| Public test keypair committed to repo | Conformance vectors must be signed with a known key; the public key must be in the repo | LOW | Sigstore conformance `test/assets/`; FIDO conformance key fixtures | Generate a dedicated test-only Ed25519 keypair at vector creation time; commit public JWK. Private key may be committed (test-only, zero production use). |

### Differentiators (Competitive Advantage)

Features beyond baseline interop that make the Lattice protocol ecosystem credibly useful.

| Feature | Value Proposition | Complexity | Prior Art Pattern | Notes |
|---------|-------------------|------------|-------------------|-------|
| Python: `replay(envelope) -> ReplayResult` with outputHash diff | Enables auditors to rerun the recorded execution and confirm hash parity without the TS runtime | HIGH | Lattice TS: `materializeReplayEnvelope` + `replayOffline`; no direct Python prior art in this domain | Replay is harder than verify because it requires reconstructing the `ExecutionPlan` shell and the artifact loading protocol. Verify-first ordering must be preserved. See "Python Client Scope". |
| Python: `mint(body, signer_jwk) -> ReceiptEnvelope` producing byte-identical canonical JSON | Proves the spec is complete enough for independent issuance; enables Python-based audit tools to generate test receipts | HIGH | W3C VC eddsa-jcs-2022 worked examples; algovoi vectors cross-validate byte identity | Mint is the hardest because it requires: (1) deterministic JCS over the full receipt body, (2) correct I-JSON string serialization of `costUsd`, (3) correct base64 encoding of JCS output, (4) correct PAE assembly, (5) Ed25519 sign. Any step wrong produces a valid-looking but non-conformant receipt. See "Mint Parity" section. |
| Adversarial/negative conformance vectors (not just positive cases) | Proves a verifier rejects tampered inputs — positive-only suites cannot detect "lenient verifier" bugs | MEDIUM | algovoi `adversarial_isolation_v1` (11 isolated rejection vectors); sigstore negative bundle assets | 7 negative vectors minimum, one per `VerifyErrorKind`. Additional: `downgrade-v1-body` (schema-version-too-low), `wrong-kid-in-body` (signature-invalid defense-in-depth), `tampered-outputHash` (canonicalization-mismatch). |
| Spec document versioning with explicit extension rules | Enables future v1.4 fields to be added without breaking Python client | LOW | in-toto versioning.md: additive minor fields, new major for breaking changes; SLSA "consumers MUST ignore unrecognized fields" | The spec should state: fields present in v1.3 are frozen; future optional fields follow the v1.x additive pattern; a new required field requires a new version literal and a new downgrade boundary. |
| Vector file format that is self-documenting | Enables any language author to write a new client without asking the Lattice team | LOW | algovoi vectors include `description` per vector; sigstore assets are named by the failure mode | Each vector: `{ "id", "description", "schema_version", "input_body", "canonical_hex", "canonical_sha256", "pae_hex", "signature_hex", "public_key_jwk", "expected_result": "ok" | "error-kind-string" }` |
| Research-ranked target-language list committed to the repo | Signals which clients are next and why; prevents random requests for obscure languages | LOW | SLSA maintains a "What's supported" table by ecosystem (npm, PyPI, Maven, etc.) | Based on AI/ML ecosystem usage: Python first (data science, audit tooling, LangChain ecosystem), Go second (infrastructure, CI), Rust third (WASM, edge). Commit as a `CLIENTS.md` or a table in the spec. |

### Anti-Features (Explicitly Excluded)

| Feature | Why Requested | Why It Is an Anti-Feature | What to Do Instead |
|---------|---------------|---------------------------|--------------------|
| Porting the TS runtime SDK to Python (`createAI`, `run`, routing, provider adapters) | "If there's a Python client, why not the full SDK?" | Explicitly a non-goal per PROJECT.md. The runtime is TS-first by design; porting it creates a perpetual N-language maintenance burden for 7 provider adapters, capability registry, tripwire kernel, session management, agent loop, etc. | Ship a thin Python client (verify + replay + mint) that consumes receipts. The runtime stays in TS. |
| Dynamic key rotation in the Python client (key state management, retired key logic) | "Python auditors need to manage key rotation" | Key rotation (active/retired/revoked state management) is a runtime concern, not a verifier concern. The verifier already handles `key-revoked` and `key-not-found` — that is the correct boundary. | The Python `verify` function takes a `KeySet` (dict of kid → JWK + state) as input; the caller manages what keys to pass. The client does not manage key lifecycles. |
| PyPI publishing in v1.5 | "Ship the package now" | PyPI publishing (trusted publisher setup, provenance attestations, version lifecycle) is a release-operations concern that should mirror the npm posture established for TS. Doing it hastily before the client surface stabilizes creates a public API commitment too early. | Per PROJECT.md decision: defer PyPI to a later milestone. Ship the Python client in-repo with conformance proof. |
| Re-implementing the tripwire/PII detector in Python | "Python auditors want to re-evaluate invariants" | The tripwire kernel evaluates invariants at run time, inside the TS runtime. A Python client verifying a receipt only needs to check that `contractVerdict` and `tripwireEvidence` fields are structurally correct — it does not re-run the tripwire kernel. | The verifier checks that `tripwireEvidence` parses correctly per schema and that `contractVerdict` is one of the 5 valid string literals. That is the correct boundary. |
| Re-implementing provider routing or catalog logic in Python | "Python tools want to know which model was chosen" | The routing decision is recorded in `route.providerId` and `route.capabilityId` inside the signed receipt body. A verifier reads those fields — it does not re-run the router. | Read `body.route` from the verified receipt. The spec documents what those fields mean. |
| Separate conformance HTTP server / hosted conformance endpoint | "Run conformance against a live service" | Adds infrastructure cost and a network dependency to CI. The vector-based approach (static files + CLI runner) is strictly superior for a protocol at this stage: reproducible, offline, no credentials. | Static vector files in the repo. CI runs `python -m pytest` (or equivalent) against them. |

---

## Conformance Vector Suite Specification

This section is concrete enough to become requirements directly.

### Vector File Format

Each vector is a single JSON file (one file per vector). The filename encodes the vector ID for shell-friendly discovery: `v-{id}-{description-slug}.json`.

```json
{
  "id": "positive-001",
  "description": "Well-formed v1.2 receipt with active key verifies successfully",
  "schema_version": "lattice-receipt/v1.2",
  "envelope": {
    "payloadType": "application/vnd.lattice.receipt+json",
    "payload": "<base64(JCS(body))>",
    "signatures": [{ "keyid": "test-key-001", "sig": "<base64(Ed25519(PAE))>" }]
  },
  "keyset": {
    "test-key-001": {
      "kid": "test-key-001",
      "state": "active",
      "publicKeyJwk": { "kty": "OKP", "crv": "Ed25519", "x": "<base64url>" }
    }
  },
  "expected_result": "ok",
  "expected_key_state": "active",
  "notes": "Baseline positive case. Every conforming verifier MUST return ok."
}
```

For negative cases, `expected_result` is one of the 7 `VerifyErrorKind` strings (not `"ok"`):

```json
{
  "id": "negative-schema-version-too-low",
  "description": "Receipt body.version is 'lattice-receipt/v1' — downgrade defense fires before crypto",
  "expected_result": "schema-version-too-low",
  "notes": "Verify MUST short-circuit before keyset lookup, PAE, or Ed25519."
}
```

### Required Positive Vectors (minimum set)

| ID | Schema Version | Key State | Description |
|----|---------------|-----------|-------------|
| `positive-001` | v1.2 | active | Baseline: well-formed receipt, active key |
| `positive-002` | v1.3 | active | v1.3 receipt with `parentReceiptCid` and `lineageMerkleRoot` |
| `positive-003` | v1.2 | retired | Active-key-retired: verify succeeds, `keyState: "retired"` returned |
| `positive-004` | v1.1 | active | v1.1 receipt (step-marker fields absent): MUST succeed |
| `positive-005` | v1.2 | active | Receipt with `costUsd: null` (unmeasured cost path) |
| `positive-006` | v1.2 | active | Receipt with `outputHash: null` (failed run, no output) |
| `positive-007` | v1.2 | active | Receipt with non-empty `redactions[]` array |
| `positive-008` | v1.2 | active | Receipt with non-empty `noRouteReasons[]` and `contractVerdict: "no-contract-match"` |

### Required Negative/Adversarial Vectors (one per error kind)

| ID | Expected Error Kind | What Is Mutated |
|----|--------------------|--------------| 
| `negative-envelope-malformed-no-sigs` | `envelope-malformed` | `signatures: []` — empty signatures array |
| `negative-envelope-malformed-bad-b64` | `envelope-malformed` | `payload` contains invalid base64 |
| `negative-version-mismatch` | `version-mismatch` | `body.version` set to unknown literal `"lattice-receipt/v99"` |
| `negative-schema-version-too-low-v1` | `schema-version-too-low` | `body.version` = `"lattice-receipt/v1"` (downgrade attack) |
| `negative-schema-version-too-low-absent` | `schema-version-too-low` | `body.version` field absent entirely |
| `negative-key-not-found` | `key-not-found` | `keyid` in envelope is `"unknown-kid"`, not in keyset |
| `negative-key-revoked` | `key-revoked` | keyset entry for the signing key has `state: "revoked"` |
| `negative-canonicalization-mismatch` | `canonicalization-mismatch` | Decoded `payload` bytes do not match re-canonicalized body (one extra space) |
| `negative-signature-invalid-tampered` | `signature-invalid` | `payload` is valid JCS but the sig bytes are zeroed |
| `negative-signature-invalid-wrong-kid-in-body` | `signature-invalid` | `body.kid` differs from `envelope.signatures[0].keyid` (defense-in-depth check) |
| `negative-wrong-payload-type` | `envelope-malformed` | `payloadType` set to `"application/json"` instead of the correct MIME |

### Mint Parity Requirement

A "mint-conformant" implementation must produce byte-identical output to the TS reference for the same input body. The mint conformance vector extends the standard vector format with a `mint_input_body` field:

```json
{
  "id": "mint-001",
  "description": "Mint round-trip: given this body, canonical bytes MUST match byte-for-byte",
  "mint_input_body": { "version": "lattice-receipt/v1.2", "receiptId": "...", ... },
  "canonical_hex": "7b2276657273696f6e223a...",
  "canonical_sha256": "abc123...",
  "pae_hex": "445353457631...",
  "private_key_jwk": { "kty": "OKP", "crv": "Ed25519", "x": "...", "d": "..." },
  "expected_signature_hex": "...",
  "notes": "Private key is test-only. canonical_hex and pae_hex must match before signature is checked."
}
```

**Mint parity requires all three of:**
1. `rfc8785.dumps(body)` produces byte-identical UTF-8 to TS `canonicalize(body)` — unicode escaping, key sort order, number serialization must all match.
2. `costUsd` serialized as `string | null` (I-JSON), never as a float — a float would produce different canonical bytes.
3. PAE bytes `"DSSEv1" + SP + LEN + SP + payloadType + SP + LEN + SP + payload` computed from the base64-encoded canonical bytes, not from the raw bytes.

The test harness for mint vectors: run mint, compare `canonical_hex` byte-for-byte before even checking the signature. If canonical bytes differ, the error is in JCS, not in Ed25519.

### Golden Test Keypair

Generate one Ed25519 keypair at vector creation time, committed to the repo as:
- `conformance/keys/test-key-001.public.jwk.json` — public JWK `{ "kty": "OKP", "crv": "Ed25519", "x": "...", "kid": "test-key-001" }`
- `conformance/keys/test-key-001.private.jwk.json` — full JWK including `"d"` (test-only, never used in production)
- `conformance/keys/test-key-001.revoked.jwk.json` — same public key but `state: "revoked"` for the `key-revoked` negative vector

---

## Python Client Scope: Verify, Replay, Mint

The three operations in ascending order of implementation difficulty.

### Verify (Smallest, Highest Trust)

**What it does:** Takes a `ReceiptEnvelope` dict + a `KeySet` dict, returns `VerifyResult` matching the 7 TS error kinds exactly.

**Dependencies (complete list):**
- `rfc8785` (trailofbits, v0.1.4) — JCS canonicalization
- `cryptography` (PyCA) — Ed25519 `Ed25519PublicKey.from_public_bytes()` + `.verify(sig, message)` raises `InvalidSignature`
- Standard library: `base64`, `json`, `hashlib`

**JWK → Ed25519PublicKey path:**
```python
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
x_bytes = base64.urlsafe_b64decode(jwk["x"] + "==")  # pad for stdlib
key = Ed25519PublicKey.from_public_bytes(x_bytes)
```

**Algorithm (mirrors TS `verifyReceipt`):**
1. Decode `envelope.payload` from base64 → `payload_bytes`
2. Parse `payload_bytes` as UTF-8 JSON → `body` dict
3. Shape check + `body["version"]` against known literals → `version-mismatch` or continue
4. Downgrade check: `body.get("version") in (None, "lattice-receipt/v1")` → `schema-version-too-low`
5. keyset lookup by `envelope.signatures[0]["keyid"]` → `key-not-found` or `key-revoked`
6. Re-canonicalize: `rfc8785.dumps(body)` → `re_canonical_bytes`; compare byte-for-byte against `payload_bytes` → `canonicalization-mismatch`
7. Build PAE: `"DSSEv1" + " " + str(len(payload_type)) + " " + payload_type + " " + str(len(payload_b64)) + " " + payload_b64` (all as bytes)
8. Ed25519 verify: `key.verify(sig_bytes, pae_bytes)` → `signature-invalid` on `InvalidSignature`
9. Defense-in-depth: `body["kid"] != envelope.signatures[0]["keyid"]` → `signature-invalid`
10. Return `{"ok": True, "body": body, "keyState": entry["state"]}`

**Why this is the smallest/highest-trust operation:** No file I/O, no artifact loading, no network, no runtime state. Pure function. Easy to audit. A security-conscious user can read the 60-line implementation and trust it.

### Replay (Medium: Stateful, Requires Artifact Loading)

**What it does:** Takes a verified `ReceiptEnvelope` + an `ArtifactLoader` (function from `sha256_hex -> bytes`) + optional `outputs` dict, returns a `ReplayResult` with an `outputHash` that MUST match `body.outputHash`.

**Implementation complexity delta over verify:**
- Must implement `materializeReplayEnvelope` semantics: verify-first before any artifact loader call.
- Must implement `replayOffline`: if `outputs` are supplied, return `{ok: True, outputs, outputHash}`; otherwise return `{ok: False, kind: "execution_unavailable"}`.
- Must implement `outputHash` computation: `sha256(JCS(outputs))` — this requires knowing the exact serialization Lattice uses for the `outputs` dict before hashing.

**Critical dependency on the spec:** The spec must define exactly how `outputHash` is computed. Currently the TS implementation computes `sha256(JSON.stringify(outputs))` or similar — the spec must pin whether it is `sha256(JCS(outputs))` or `sha256(JSON.stringify(outputs, null, 0))`. Without this, Python replay cannot produce a byte-identical hash.

**Artifact loader protocol:** The spec must also pin the content-addressable artifact storage protocol — how artifact bytes map to SHA-256 hex digests, what file naming convention the CLI uses (currently `.lattice/fixtures/<sha256>.bin`).

**Why replay is harder than verify:** Three additional dependencies on spec precision (outputHash algorithm, artifact storage protocol, outputs serialization). One implementation bug produces a correct-looking `outputHash` mismatch rather than a clear error.

### Mint (Hardest: Full Pipeline, Most Spec Precision Required)

**What it does:** Takes a `CapabilityReceiptBody` dict + a private key JWK, returns a `ReceiptEnvelope` that passes `verify` byte-identically.

**Implementation complexity delta over verify:**
1. Must produce identical JCS bytes as the TS `canonicalize()` call — requires verifying that `rfc8785.dumps()` matches `canonicalize@3.0.0` on all edge cases (Unicode strings, numbers, null, nested objects). This requires running the mint vectors.
2. Must enforce I-JSON string serialization of `costUsd` — if the caller passes a float, the mint function must reject it or stringify it before canonicalizing.
3. Must base64-encode the canonical bytes identically to TS (standard base64, not URL-safe, with padding — verify the TS behavior before committing).
4. Must construct PAE bytes byte-identically (the formula is simple, but off-by-one in `LEN()` breaks everything silently).
5. Must sign with Ed25519 and base64-encode the 64-byte signature.

**Why mint is the hardest:** Every step is a potential byte-parity failure point, and failures compound silently (the resulting envelope is structurally valid but fails `canonicalization-mismatch` in verify). The mint conformance vectors are the only way to catch these failures during development.

**JWK → Ed25519PrivateKey path:**
```python
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
d_bytes = base64.urlsafe_b64decode(jwk["d"] + "==")
private_key = Ed25519PrivateKey.from_private_bytes(d_bytes)
sig_bytes = private_key.sign(pae_bytes)  # returns 64 bytes
```

---

## Feature Dependencies

```
[Spec Document]
    └──required by──> [Conformance Vectors] (vectors encode spec decisions as golden bytes)
    └──required by──> [Python Client: Verify] (algorithm steps must be normative)
    └──required by──> [Python Client: Replay] (outputHash algorithm must be pinned)
    └──required by──> [Python Client: Mint] (every pipeline step must be normative)

[Conformance Vectors]
    └──required by──> [CI Drift Gate] (no vectors = nothing to gate on)
    └──required by──> [Python Client validation] (client passes vectors or it is not conformant)

[Python Client: Verify]
    └──required by──> [Python Client: Replay] (replay calls verify first)
    └──required by──> [Python Client: Mint] (mint output should be immediately verifiable)

[Python Client: Verify] ──independent of──> [Python Client: Mint]
[Python Client: Replay] ──independent of──> [Python Client: Mint]

[CI Drift Gate]
    └──depends on──> [TS test suite] (existing; gates TS conformance)
    └──depends on──> [Python test suite] (new; gates Python conformance)
    └──should run on──> every PR that touches receipts/*, conformance/*, python/

[Spec Document] ──liftable from──> paper/main.tex (Design + Verification + Offline-verifiable-replay sections)
```

### Dependency Notes

- **Spec required before vectors:** The vectors are frozen bytes encoding spec decisions. If the spec changes after vectors are committed, all vectors must be regenerated. Do not commit vectors before the spec is stable on the fields they cover.
- **Verify required before replay:** `materializeReplayEnvelope` calls `verifyReceipt` before loading any artifact. This is a security invariant (verify-first ordering). Python must preserve it.
- **Mint is independent of replay:** Mint creates receipts; replay consumes them. They share the canonicalization step but are otherwise independent code paths.
- **outputHash algorithm blocks replay:** This is the single highest-risk unknown. If the spec does not precisely define outputHash computation, the replay conformance vector cannot be generated and replay conformance cannot be tested.

---

## MVP Definition

### v1.5: Launch With

The "v1.5 launches" with these four deliverables. All four are table stakes for the milestone goal.

- [ ] **Spec document** (`docs/spec/lattice-receipt-v1.md` or similar) — normative description of all 6 pipeline steps, 7 error kinds, downgrade boundary, schema version field semantics, I-JSON rule, PAE formula, `payloadType` URI. Liftable from `paper/main.tex` Sections III-IV.
- [ ] **Conformance vector suite** (`conformance/vectors/`) — minimum 8 positive + 11 negative vectors as specified above, plus 2-3 mint vectors. Committed with golden canonical bytes and test keypair.
- [ ] **Python client** (`clients/python/lattice_receipt/`) — `verify()` function passing all conformance vectors. `replay()` if outputHash algorithm is pinned. `mint()` if mint vectors pass byte-for-byte.
- [ ] **CI drift gate** (`.github/workflows/conformance.yml`) — matrix job running TS verify + Python verify against the committed vectors. Fails on any single-byte drift. Triggered on any PR touching `packages/lattice/src/receipts/`, `conformance/`, `clients/python/`.

### Add After Validation (v1.5.x / v1.6)

- [ ] **Go client** — Go is the second-priority language per the AI/ML infrastructure ecosystem (LiteLLM, OpenTelemetry, k8s-based agent hosting are Go-native). Verify + replay. Mint if the mint spec is stable.
- [ ] **Rust client** — Third priority; enables WASM-deployable verifier for browser/edge audit tools.
- [ ] **PyPI publish** — Trusted publishing + provenance. Deferred per PROJECT.md decision; pick up once surface stabilizes.
- [ ] **Additional negative vectors** — Unicode edge cases in key strings, oversized LEN() in PAE, duplicate key in JSON body.

### Future Consideration (v2+)

- [ ] **Rust WASM verifier** — Browser-deployable receipt verification for audit UIs.
- [ ] **Multi-sig vector set** — DSSE supports `(t, n)` threshold signatures; Lattice currently uses single-sig. Multi-sig vectors when the receipt schema adds multi-signer support.
- [ ] **Protobuf-spec** — If the client ecosystem grows beyond 3-4 languages, a protobuf spec (per the Sigstore pattern) reduces per-language maintenance. Not needed at v1.5 scale.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Spec document | HIGH (foundation for everything else) | LOW (lift from paper) | P1 |
| Positive conformance vectors (8 min) | HIGH | MEDIUM | P1 |
| Negative conformance vectors (11 min) | HIGH (prevents lenient verifiers) | MEDIUM | P1 |
| CI drift gate | HIGH (prevents regression) | LOW | P1 |
| Python verify | HIGH | MEDIUM | P1 |
| Python replay | MEDIUM (requires outputHash spec precision) | HIGH | P1 if outputHash pinned; P2 if not |
| Python mint | MEDIUM (proves spec completeness) | HIGH | P1 |
| Mint conformance vectors | HIGH (only way to validate mint) | MEDIUM | P1 alongside mint |
| Research-ranked language list | LOW (informational) | LOW | P2 |
| Go client | MEDIUM | MEDIUM | P2 |
| PyPI publish | LOW in v1.5 | MEDIUM | P3 (explicitly deferred) |

---

## Sources

- DSSE spec: [dsse/protocol.md at master · secure-systems-lab/dsse](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md)
- RFC 8785 (JCS): [datatracker.ietf.org/doc/html/rfc8785](https://datatracker.ietf.org/doc/html/rfc8785)
- rfc8785 Python library: [pypi.org/project/rfc8785/](https://pypi.org/project/rfc8785/)
- in-toto attestation versioning: [attestation/spec/versioning.md at main · in-toto/attestation](https://github.com/in-toto/attestation/blob/main/spec/versioning.md)
- in-toto attestation envelope: [attestation/spec/v1/envelope.md at main · in-toto/attestation](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md)
- Sigstore conformance: [sigstore/sigstore-conformance](https://github.com/sigstore/sigstore-conformance)
- Sigstore CLI protocol: [sigstore-conformance/docs/cli_protocol.md](https://github.com/sigstore/sigstore-conformance/blob/main/docs/cli_protocol.md)
- Sigstore cross-language: [coffeehousecoders.org/blog/cosign_and_clients.html](https://coffeehousecoders.org/blog/cosign_and_clients.html)
- AlgoVoi JCS conformance vectors: [chopmob-cloud/algovoi-jcs-conformance-vectors](https://github.com/chopmob-cloud/algovoi-jcs-conformance-vectors)
- Pipelock verify-only Python client: [luckyPipewrench/pipelock-verify-python](https://github.com/luckyPipewrench/pipelock-verify-python)
- Python cryptography Ed25519: [cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/)
- SLSA provenance versioning: [slsa.dev/spec/v1.2/build-provenance](https://slsa.dev/spec/v1.2/build-provenance)
- W3C VC Data Integrity EdDSA: [w3c.github.io/vc-di-eddsa/](https://w3c.github.io/vc-di-eddsa/)
- C2PA conformance: [c2pa.org/conformance/](https://c2pa.org/conformance/)

---

*Feature research for: Lattice v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client*
*Researched: 2026-06-24*
