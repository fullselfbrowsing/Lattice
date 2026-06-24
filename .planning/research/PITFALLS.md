# Pitfalls Research

**Domain:** Cross-language canonical-JSON / DSSE / Ed25519 receipt parity (Lattice v1.5)
**Researched:** 2026-06-24
**Confidence:** HIGH — all critical pitfalls derived from direct code audit of the TS implementation plus verified RFC / library documentation

---

## Numeric-Field Audit: At-Risk Fields in `CapabilityReceiptBody`

Before cataloguing pitfalls, a concrete audit of every numeric field in the existing receipt schema is needed to distinguish safe integers from float landmines.

### Fields that are SAFE integers (no cross-language risk)

These fields are typed `number` in TypeScript but in practice will only ever be non-negative integers well inside the IEEE 754 safe range of -(2^53-1) to +(2^53-1):

| Field | Location in receipt | Expected range | Why safe |
|-------|---------------------|----------------|----------|
| `promptTokens` | `usage.promptTokens` | 0–~1,000,000 | Token counts are always non-negative integers; no LLM today approaches 2^53 tokens in a single call |
| `completionTokens` | `usage.completionTokens` | 0–~1,000,000 | Same reasoning |
| `attemptNumber` | `route.attemptNumber` | 1–N (small) | Retry counter, always a positive small integer |
| `stepIndex` | `stepIndex?` | 0–N (small) | Step position in an agent loop, always a small non-negative integer |

Verdict: **these integer fields are cross-language safe**. A compliant JCS library (including `rfc8785.py`) serializes them identically to JavaScript because they are representable exactly as IEEE 754 doubles and are round-tripped without floating-point conversion.

### Fields that are ALREADY SAFE by design (strings, not floats)

| Field | Type in receipt | Why it is safe |
|-------|----------------|----------------|
| `costUsd` | `string \| null` in `ReceiptUsageCanonical` | Explicitly stringified by `stringifyCostUsd()` in `canonical.ts` before canonicalization — the single conversion site. This is the primary float-hardening already done. |
| `issuedAt` | `string` | ISO-8601 timestamp string, never a numeric epoch |
| `timestamp?` | `string` | Same — ISO-8601 string |

### Fields that carry ZERO float exposure

| Field | Type | Notes |
|-------|------|-------|
| `version` | string literal union | No numeric component |
| `receiptId`, `runId`, `kid`, etc. | string | UUIDs / strings throughout |
| `contractHash`, `outputHash`, `inputHashes[]`, `parentReceiptCid?`, `lineageMerkleRoot?` | string | All hash fields are `sha256:<hex>` strings |
| `redactionPolicyId` | string | |
| `contractVerdict` | string literal | |

### Verdict on spec rules

The spec **should forbid non-integer floats outright** in all numeric receipt fields. The current schema does not contain any field that legitimately needs a non-integer float as a raw JSON number (only `costUsd` needed float semantics, and it was already converted to a string). A spec-level constraint of "all JSON number values in a Lattice receipt body MUST be non-negative integers representable within the IEEE 754 safe integer range" is both accurate and eliminates the entire float serialization divergence class.

---

## Critical Pitfalls

### Pitfall 1: JCS Number Canonicalization Divergence for Non-Integer Floats

**What goes wrong:**
A non-integer floating-point value (e.g. a hypothetical `qualityScore: 0.95`) appears as a raw JSON number in the receipt body. The TS `canonicalize@3.0.0` package and the Python `rfc8785.py` or `jcs` package both implement the ECMAScript-derived Grisu3/Ryu float-to-string algorithm, but differences in the float serialization output can occur when: (a) a float is formed by arithmetic that produces slightly different IEEE 754 representations across V8 versions, or (b) a number is passed through a JSON parse–serialize round-trip in a different language that reconstructs the float with a rounding difference.

The canary case is a number like `333333333.33333329`: JS canonicalizes it to `333333333.3333333` (drops the trailing digit due to Grisu3) while a naive Python serializer might produce a different decimal expansion. Even `0.1 + 0.2` canonicalizes to `0.30000000000000004` — which is correct by the standard but only if both sides use the identical float. Any intermediate computation can shift the last digit.

**Why it happens:**
RFC 8785 mandates the ECMAScript number serialization algorithm, which uses IEEE 754 double to shortest-decimal (Grisu3 or Ryu). The TS `canonicalize@3.0.0` package inherits V8's behavior. The Python `rfc8785.py` library from Trail of Bits implements the same algorithm natively, but a developer who writes their own Python serializer or who passes a number through `float()` then `json.dumps()` will get Python's `repr()` or `str()` behavior, which differs.

**How to avoid:**
1. The spec MUST declare: all JSON number values in a receipt body MUST be safe integers (integers in -(2^53-1) to +(2^53-1)) or JSON strings. Non-integer floats are prohibited as raw JSON numbers.
2. The Python client MUST use `rfc8785.py` (Trail of Bits) or the reference `jcs` package — never `json.dumps()` with custom number handling.
3. A conformance vector MUST include a receipt body with `promptTokens` and `completionTokens` at edge values (0, 1, MAX_SAFE_INT equivalents) plus a canonical byte hash. The CI gate verifies Python produces the same hash.
4. `IntegerDomainError` from `rfc8785.py` at values ≥ 2^53 should be surfaced at mint time, not silently truncated.

**Warning signs:**
- Conformance vector CI passes for small token counts but fails for large ones (e.g. a 500k-token context window).
- Python `rfc8785.dumps()` raises `IntegerDomainError` on a real receipt — indicates the spec allows a value outside the safe range.
- The TS implementation produces a different canonical hash than Python for the same logical receipt.

**Phase to address:** Spec-definition phase (the phase that writes the language-neutral spec). The "all-numeric-fields-are-safe-integers" rule must appear in the spec before any client code is written, so it becomes a hard mint-time constraint rather than a runtime surprise.

---

### Pitfall 2: JCS String Canonicalization: Python `json` vs `canonicalize@3.0.0` Unicode Divergence

**What goes wrong:**
Three distinct string-level divergences exist between a naive Python JCS implementation and the TS reference:

1. **UTF-16 key ordering vs UTF-8 / codepoint ordering.** RFC 8785 requires object keys to be sorted by their UTF-16BE encoding. For non-ASCII keys (e.g. keys containing CJK characters, emoji, or characters in the U+10000+ range that have UTF-16 surrogate pairs), sorting by UTF-16 code units produces a different order than sorting by Unicode codepoint or UTF-8 bytes. Python's `json.dumps(sort_keys=True)` sorts by Python's native string comparison (which is codepoint-order, equivalent to UTF-32 — not UTF-16 for surrogate-pair ranges). This is a silent, hard-to-debug divergence that only manifests with non-ASCII keys.

2. **Control character escaping.** RFC 8785 / ECMAScript escapes control characters U+0000–U+001F, with some named shortcuts (`\n`, `\r`, `\t`, `\b`, `\f`) and `\uXXXX` for the rest. Python's `json` module with `ensure_ascii=True` does escape them, but the exact form can differ: Python encodes `\x0a` as `\n`, which matches; however subtle differences can arise with specific code units if the library version or platform differs.

3. **Lone surrogates.** JavaScript (V8) can produce `\uD800`–`\uDFFF` lone surrogate escape sequences in JSON.stringify output when strings contain lone surrogates (from, e.g., certain binary data passed as strings). Python's json module has historically either errored or produced `\uXXXX` for lone surrogates depending on the version (CPython issue #93508 is open). A receipt body field containing a lone surrogate character will produce divergent canonical bytes across the two implementations.

**Why it happens:**
`canonicalize@3.0.0` passes through V8's string representation directly. Python string internals are UCS-4 (codepoint-level), so Python's sort and length semantics differ from UTF-16 natively. A developer who uses `json.dumps(obj, sort_keys=True, separators=(',',':'))` thinks they have JCS but they have the wrong key sort order for non-ASCII keys.

**How to avoid:**
1. The Python client MUST use `rfc8785.py` (Trail of Bits) for all canonicalization — not `json.dumps`. `rfc8785.py` implements UTF-16BE key sorting correctly.
2. The spec MUST state: all receipt body string values MUST be valid UTF-8 (no lone surrogates). Mint functions MUST validate this before canonicalization.
3. A conformance vector set MUST include a receipt with a non-ASCII `stepName` string (e.g. a CJK name) and a receipt with `\n`/`\t` control characters in a string field to exercise both divergence paths.
4. The CI gate MUST verify byte-identity on these vectors.

**Warning signs:**
- Canonicalization produces different bytes in Python only when the receipt body has `stepName` or `sessionId` values containing Unicode above U+007F.
- Python CI passes on ASCII-only fixtures but fails on integration tests with real model names containing non-ASCII characters.

**Phase to address:** Conformance-vector definition phase. The vectors themselves must exercise these edge cases; the spec must ban lone surrogates. This should precede Python client implementation so the author has concrete failing cases to test against.

---

### Pitfall 3: DSSE PAE Construction Error — Signing Raw Canonical Bytes Instead of PAE Bytes

**What goes wrong:**
The DSSE PAE formula is:
```
PAE = "DSSEv1" SP LEN(payloadType) SP payloadType SP LEN(payloadBase64) SP payloadBase64
```
where `LEN(s)` is the ASCII decimal encoding of the **byte length** of `s`.

A Python implementer who misreads the spec (or who is porting from a non-DSSE-aware signing library) may sign the raw canonical JSON bytes directly — signing `canonicalize(body)` instead of `PAE(payloadType, base64(canonicalize(body)))`. The signature will be structurally valid Ed25519 (64 bytes, correct format) but will **never verify** against a TS-issued receipt because the TS verifier (`verify.ts` line 160: `buildPae(PAYLOAD_TYPE, payloadB64)`) builds PAE over the base64-encoded payload, not over raw bytes.

A related error: Python's `len()` on a string returns character count, not byte count. Since standard base64 output for ASCII-safe bytes is pure ASCII, `len(payloadBase64_str) == len(payloadBase64_str.encode('utf-8'))` holds in this case — but a developer relying on this coincidence will produce a wrong PAE if they ever use the wrong encoding variable.

**Why it happens:**
DSSE is not yet as widely known as JWT or JWS. Developers porting cryptographic signing code often reach for "sign the bytes" directly without reading the envelope format specification carefully. The TS implementation hides this correctly behind `buildPae()`, but a Python implementer working from the API surface alone will not see the PAE step.

**How to avoid:**
1. The spec document MUST include the full PAE formula with a worked example (payloadType string → length → payloadBase64 → PAE bytes → hex digest).
2. A Python `build_pae(payload_type: str, payload_base64: str) -> bytes` helper MUST be the only path to PAE bytes in the Python client, mirroring the TS `buildPae()` function exactly.
3. A conformance vector MUST include a pre-computed PAE hex (the bytes over which the signature is computed) derived from a known receipt, so the Python client can self-test the PAE construction independently of the full signature check.
4. The Python mint function MUST call `build_pae` and verify the signature verifies against its own PAE output before returning — a round-trip self-check.

**Warning signs:**
- Python-minted receipts fail TS `verifyReceipt` with `signature-invalid` despite the correct key being used.
- Debugging shows the PAE bytes differ between TS and Python for the same payload.

**Phase to address:** Python-client implementation phase. The PAE helper should be the very first function implemented and the very first conformance vector validated — before attempting any full mint/verify round-trip.

---

### Pitfall 4: Base64 Variant Mismatch — Standard vs URL-Safe

**What goes wrong:**
The TS implementation (`envelope.ts`) uses `Buffer.from(bytes).toString("base64")`, which produces standard base64 (alphabet `A-Z a-z 0-9 + / =`). The DSSE spec says "signers may use either standard or URL-safe base64; verifiers MUST accept either." A Python implementer who uses `base64.urlsafe_b64encode()` (which produces `-` and `_` instead of `+` and `/`) will generate receipts that are valid per the DSSE spec but differ in the PAE bytes because the `payloadBase64` string used in PAE construction contains different characters, making the signature over a different byte sequence. A Python verifier that tries to re-derive PAE from a TS-minted envelope's `payload` string (which uses standard base64) will compute the correct bytes; but a Python minter that uses URL-safe base64 will produce a signature that TS's `verifyReceipt` will reject when it re-derives PAE using the standard base64 it expects.

More subtly: padding stripping. Standard base64 may include trailing `=` padding. Some libraries strip it. The PAE length field depends on the exact string including or excluding padding characters. Even a one-byte difference in `payloadBase64.length` breaks the signature.

**Why it happens:**
Python's standard library defaults to URL-safe base64 (`base64.b64encode` is standard, `base64.urlsafe_b64encode` is url-safe, but developers often confuse the two). The TS convention is standard base64 with padding, and this is not made explicit in the envelope API.

**How to avoid:**
1. The spec MUST state: Lattice receipts MUST use standard base64 (RFC 4648 §4, alphabet with `+` and `/`, with `=` padding) in both the `payload` field and the `sig` field. This narrows the DSSE "either is allowed" flexibility to a single canonical choice.
2. The Python client MUST use `base64.b64encode(bytes).decode('ascii')` for encoding and `base64.b64decode(s)` for decoding.
3. A conformance vector MUST include the raw bytes of the `payload` field in hex alongside the base64 string, so a Python implementer can verify their encode/decode independently.

**Warning signs:**
- Python-minted receipts contain `-` or `_` characters in the `payload` or `sig` fields.
- TS verifier returns `signature-invalid` for Python-minted receipts despite correct keys.
- Removing `=` padding from `payload` before computing PAE causes signature failure.

**Phase to address:** Spec-definition phase. The base64 variant must be locked in the spec before any client writes encoding code.

---

### Pitfall 5: Ed25519 Key Encoding — JWK Import Path in Python

**What goes wrong:**
The TS implementation stores keys as JWK objects (`JsonWebKey` with `kty: "OKP"`, `crv: "Ed25519"`, `x` and `d` as base64url-encoded 32-byte values). The Python `pyca/cryptography` library does not natively import Ed25519 keys from JWK format — its `Ed25519PrivateKey` interface accepts raw 32 bytes (`Ed25519PrivateKey.from_private_bytes(data)`) or DER/PEM formats, but not a JWK dict directly. A Python implementer who does not use the `jwcrypto` bridge library (which wraps pyca/cryptography and maps OKP JWK to `Ed25519PrivateKey`) will either:
1. Write ad-hoc JWK parsing that correctly decodes the base64url `d` and `x` parameters, or
2. Mis-decode them (e.g., using standard base64 instead of base64url, or failing to remove padding before decoding).

The `d` and `x` fields in an OKP JWK are base64url-encoded **without** padding (RFC 8037). Standard `base64.b64decode()` will fail on them; `base64.urlsafe_b64decode()` must be used with padding restoration (`s + '=='`). Getting this wrong produces a silently wrong private key and thus wrong signatures.

**Why it happens:**
The JWK OKP format is defined in RFC 8037, which is distinct from the more common RSA/EC JWK formats. Many cryptography tutorials do not cover it. The `pyca/cryptography` library's own docs focus on raw bytes, not JWK, so a developer porting from a TS JWK-based flow hits a conceptual gap.

**How to avoid:**
1. The Python client MUST encapsulate JWK import/export in a single well-tested module (`key.py` or similar) with explicit functions `import_private_key_jwk(jwk: dict) -> Ed25519PrivateKey` and `import_public_key_jwk(jwk: dict) -> Ed25519PublicKey`.
2. The JWK import MUST use `base64.urlsafe_b64decode(x_or_d + "==")` to handle unpadded base64url — this is the one place where base64url appears (all other base64 in the Lattice receipt is standard base64 with padding).
3. A conformance vector MUST include the same keypair expressed as a TS JWK and as a Python `Ed25519PrivateKey.private_bytes_raw()` hex, proving they are the same 32 bytes.
4. The Python client should prefer `pyca/cryptography` directly over `PyNaCl`, because `pyca/cryptography` shares the same underlying OpenSSL backend as Node's WebCrypto and is consistently deterministic across platforms.

**Warning signs:**
- Python JWK import succeeds but produces a different public key `x` value than the TS original.
- Python signs with a key loaded from a TS-generated JWK but TS cannot verify the signature.
- `base64.urlsafe_b64decode` raises padding errors because the `==` suffix was not added.

**Phase to address:** Python-client implementation phase, specifically the key-handling module. This must be verified before the mint function is written — a wrong key is worse than no key because it fails silently.

---

### Pitfall 6: CID / Content-Address Mismatch — Hash Input and Encoding Divergence

**What goes wrong:**
The TS `receiptCid()` function hashes `atob(envelope.payload)` — i.e., the raw bytes of the base64-decoded `payload` field (the JCS canonical body bytes). It returns `sha256:<hex>` where hex is lowercase and exactly 64 characters.

Two divergence points exist for a Python implementer:

1. **Hash input**: Python's `hashlib.sha256(data).hexdigest()` over the canonical bytes produces the same digest — if and only if the input bytes are identical. If the Python implementation serializes the receipt body with a slightly different canonical form (e.g., due to the UTF-16 key-sort bug from Pitfall 2), the CID will differ even though both implementations "succeeded."

2. **Encoding**: `sha256:<hex>` with lowercase hex is not a multibase CID — it is a simple typed-prefix string. This must match exactly. A Python implementer who uses uppercase hex (`sha256:ABCD...`) or adds a multibase prefix (`f0012...`) will produce a CID string that does not match the TS format, causing `parentReceiptCid` chain links to break.

**Why it happens:**
The `sha256:<hex>` format used by Lattice receipts is deliberately simple (not a full IPFS CID with multicodec prefixes). Implementers familiar with IPFS CIDs will expect a different encoding. The hex case convention is not stated explicitly in the TS code comments.

**How to avoid:**
1. The spec MUST state the CID format precisely: `"sha256:" + lowercase hexadecimal SHA-256 digest of the decoded DSSE payload bytes`. Include an example.
2. A conformance vector MUST include a known receipt envelope and its expected CID string so a Python implementer can verify byte-for-byte.
3. The Python `receipt_cid(envelope: dict) -> str` function should be a one-liner: `"sha256:" + hashlib.sha256(base64.b64decode(envelope["payload"])).hexdigest()` — simple enough to audit visually.

**Warning signs:**
- Python CID is uppercase hex while TS CID is lowercase, causing `parentReceiptCid` lookup to fail.
- Python CID digest is correct but the prefix differs (e.g., `sha2-256:` or a bare hex string).
- CIDs differ between TS and Python for the same envelope — indicates the canonical bytes themselves differ (a symptom of Pitfall 1 or 2 upstream).

**Phase to address:** Conformance-vector definition phase. The CID vector can be derived from the same body vectors used for Pitfalls 1 and 2, making the CID check a free "end-to-end" integration test.

---

### Pitfall 7: Schema-Version Parsing and Downgrade Attack Surface in a Second Implementation

**What goes wrong:**
The TS verifier (`verify.ts`) implements a strict downgrade defense: it rejects any receipt with `body.version === undefined` or `body.version === "lattice-receipt/v1"` before any cryptographic work. A Python verifier that omits this check — perhaps because the developer assumes "the signature check is enough" — will accept old receipts that should be rejected. An attacker holding a valid signing key can mint a `v1`-shaped body (which lacks `modelClass` and `stepIndex` integrity commitments) and submit it to a Python verifier that only checks the signature.

A second, subtler failure: the Python verifier performs a string comparison on `body["version"]` but does not handle the forward-compat case (`lattice-receipt/v1.3`, `lattice-receipt/v2`). The TS implementation explicitly enumerates known versions and falls through unknown literals to `version-mismatch`. A Python implementation that uses `if version.startswith("lattice-receipt/v1")` to accept all v1.x variants would accept a hypothetical `lattice-receipt/v1-evil` version.

The auto-bump heuristic (the TS `createReceipt` function bumps the version based on which optional fields are present) creates a third risk: a Python minter that does not implement the same auto-bump logic will mint receipts at a lower version than the body's content warrants, causing the TS verifier's `schema-version-too-low` defense to trigger if the minimum version is raised.

**Why it happens:**
Downgrade defenses are easy to forget in a second implementation because the primary author focuses on making the happy path work. The TS downgrade defense is in `verify.ts` at Step 4 — after parsing, before crypto — and is not visible in the type signatures or the mint API.

**How to avoid:**
1. The spec MUST include a section "Downgrade Defense" that describes the exact version check: reject `undefined`, reject `lattice-receipt/v1`, reject any version string not in the explicit known-versions set.
2. A conformance vector MUST include a negative case: a structurally valid, correctly signed receipt with `version: "lattice-receipt/v1"` and the expected result `{ "ok": false, "error": { "kind": "schema-version-too-low" } }`.
3. A second negative vector for an unknown future version `lattice-receipt/v9` with expected result `{ "ok": false, "error": { "kind": "version-mismatch" } }`.
4. The Python verifier MUST enumerate known versions explicitly (same pattern as TS) rather than using `startswith` or range checks.
5. The spec MUST document the auto-bump heuristic so the Python minter can replicate it (or the Python minter MUST accept an explicit `version` argument with no auto-bump to avoid the divergence).

**Warning signs:**
- Python verifier accepts a `v1`-versioned receipt that TS rejects.
- Python verifier accepts `lattice-receipt/v9` that TS rejects.
- Python minter emits `lattice-receipt/v1.1` for a body that contains `modelClass` (a `v1.2` field), which TS would reject as under-versioned.

**Phase to address:** Spec-definition phase for the rules; conformance-vector definition phase for the negative test vectors. The negative vectors are as important as the positive ones.

---

### Pitfall 8: Test-Vector Rot and False Confidence from Same-Codebase Generation

**What goes wrong:**
The conformance vectors are generated by the TS implementation, then the Python client is tested against them. If the TS implementation has a latent bug (e.g., a subtly wrong float serialization for a specific token count edge case), both the vectors and the Python client will pass the test suite consistently while being wrong relative to the spec. This is "same-codebase confirmation bias" — the vectors prove TS-to-Python byte-parity, not spec-compliance.

A related pattern: vectors that cover only happy-path inputs (positive signature verification, all fields present, ASCII-only strings) and exclude:
- Negative cases (wrong signature, revoked key, `v1` version, unknown version)
- Edge-case inputs (empty `inputHashes[]`, `null` `outputHash`, maximum token counts, unicode `stepName`)
- Mutation cases (one byte changed in the `payload` field — should produce `signature-invalid`)

A third failure mode: vectors stored as JSON in the repo are silently regenerated by a developer who hits a test failure and "fixes it" by re-running the generation script. The CI gate then passes because the vectors now match the implementation — even though the implementation changed.

**Why it happens:**
Test-vector generation is usually bootstrapped from the existing implementation because it is the fastest path to "CI green." Negative and edge-case vectors require deliberate adversarial thinking. Vector regeneration is tempting when the format changes.

**How to avoid:**
1. The conformance vectors MUST be committed as static JSON files with a SHA-256 manifest file. The CI gate MUST verify the manifest, making silent regeneration detectable.
2. A separate "vector generation" script MUST be gated behind a flag (`--regen-vectors`) that requires explicit intent; normal CI never regenerates vectors.
3. The vector set MUST include a minimum of: 5 positive cases (covering integer edge values, a unicode `stepName`, a multi-signature shape, a `parentReceiptCid` chain), 4 negative cases (wrong signature, revoked key, v1 version, unknown version), and 2 mutation cases (1-byte payload corruption, 1-byte signature corruption).
4. Cross-check at least 2 positive vectors against an independent JCS reference (the RFC 8785 test data at https://github.com/cyberphone/json-canonicalization/tree/master/testdata) to verify the TS canonicalization is spec-compliant, not just self-consistent.
5. The Python client MUST fail on the negative cases — not skip or error out. Skipped negative tests provide no conformance guarantee.

**Warning signs:**
- All conformance vectors are positive (happy-path only).
- The vector manifest file does not exist or is not checked in CI.
- A developer commits "updated test vectors" in a PR that also changes implementation code without explaining why the vectors changed.
- Python CI skips negative-case vector tests with `pytest.mark.skip` or similar.

**Phase to address:** Conformance-vector definition phase (before Python client starts). The vector set must be frozen and reviewed before implementation, not generated after.

---

### Pitfall 9: The Strategic Scope-Creep Trap — Porting the Runtime Instead of the Receipt Protocol

**What goes wrong:**
The Python client starts as a verify + replay + mint library. A well-intentioned contributor adds "just the provider adapter interface" to make replay easier. Then a routing helper. Then a config model. Six months later the Python client is a partial re-implementation of the TS runtime SDK with no test coverage and permanent maintenance debt.

The inverse trap also exists: a Python client so thin it only deserializes the receipt JSON without implementing the PAE construction or signature verification — a "receipt reader" that gives false confidence (a malformed or forged receipt passes because no crypto is checked).

**Why it happens:**
Protocol clients in new languages are natural attractors for "why not add X too" requests. The receipt format is the portable artifact; the routing, session management, context packing, and provider adapters are the runtime and are TS-only by explicit decision.

**How to avoid:**
1. The spec (and the Python package README) MUST state: "This client implements the receipt protocol only: verify, replay, and mint. It does not implement the Lattice runtime SDK, routing, or provider adapters. Those remain TypeScript-only."
2. The Python package's public API surface MUST be reviewed against this boundary before any code is merged. The boundary functions are: `verify_receipt`, `receipt_cid`, `replay_receipt` (re-materialize + diff `outputHash`), `mint_receipt`, key import/export helpers. Everything else is out of scope.
3. PRs that add anything beyond this surface should be redirected to a discussion about a future separate package, not merged into the receipt client.

**Warning signs:**
- A PR adds a `create_ai_client()` or `run_task()` function to the Python package.
- The Python package's `requirements.txt` grows to include HTTP client libraries (`httpx`, `requests`) — the receipt client should not make network calls.
- The Python package version diverges from the TS package's receipt schema version, indicating they are being developed independently.

**Phase to address:** Explicitly stated in the scope definition of the Python client phase. Put the boundary in the package's `__init__.py` docstring and enforce it in code review.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Use `json.dumps(sort_keys=True)` instead of `rfc8785.py` for canonicalization | Avoids a dependency | Produces wrong key sort for non-ASCII keys; fails conformance vectors | Never — the JCS library is tiny and has no transitive deps |
| Generate conformance vectors from the TS implementation without RFC cross-check | Fast bootstrap | Bakes TS bugs into the vectors; cross-language parity != spec compliance | Acceptable for first iteration if RFC cross-check is added before v1.5 closes |
| Allow Python minter to omit the downgrade check | Simpler code | Creates a security-relevant behavioral divergence from the TS verifier | Never |
| Store Ed25519 keys as raw 32-byte hex in the Python client instead of JWK | Simpler Python code | Breaks interoperability with TS KeySet format; callers must convert manually | Only if JWK is exposed as an optional wrapper on top of the raw-bytes API |
| Accept URL-safe base64 as input to Python verifier | More flexible | Silently accepts receipts that differ from what TS would produce, masking bugs | Acceptable in verifier only (per DSSE spec), NEVER in minter |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `rfc8785.py` integer inputs | Passing Python `int` values larger than 2^53-1 without checking | Validate all integer fields against the spec-mandated safe range before calling `rfc8785.dumps()` |
| pyca/cryptography Ed25519 from JWK | Calling `Ed25519PrivateKey.from_private_bytes(base64.b64decode(jwk["d"]))` | Use `base64.urlsafe_b64decode(jwk["d"] + "==")` — the `d` field is base64url without padding |
| DSSE PAE in Python | `len(payload_base64_str)` for LEN component | `len(payload_base64_str.encode("ascii"))` — though equal for pure ASCII base64, document this explicitly to prevent future regressions |
| Python `hashlib.sha256` for CID | Using `digest()` and encoding to hex manually with uppercase | Use `hexdigest()` which returns lowercase hex — matches TS `byte.toString(16)` behavior |
| Conformance CI | Running only `pytest` without checking the vector manifest SHA | Add a manifest-check step before pytest that fails if vector files have changed |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Python verifier skips the `schema-version-too-low` check | An attacker with a valid key mints a `v1` receipt that bypasses `modelClass` and `stepIndex` integrity fields | Implement the check first and cover it with a negative conformance vector |
| Python minter signs raw canonical bytes (not PAE bytes) | Signatures verify only within Python, not across the TS verifier — a forged receipt appears valid to Python-only consumers | PAE construction function is the first thing built and first thing tested |
| Conformance vectors generated and committed by the same developer who writes the implementation | Bugs are baked into the vectors and "pass" forever | Require a second reviewer to independently verify at least one positive vector against the RFC 8785 test data |
| CID compared with case-insensitive string equality | Two receipts with the same content but different hex casing appear to be the same | CID comparison MUST be case-sensitive byte comparison; the spec mandates lowercase |

---

## "Looks Done But Isn't" Checklist

- [ ] **Conformance suite:** Verify it includes at least 4 negative-case vectors (wrong signature, revoked key, v1 downgrade, unknown future version) — a suite with only positive cases is incomplete.
- [ ] **Python key import:** Verify that a TS-generated JWK round-trips through Python import and export back to the same `x` value — not just that signing works.
- [ ] **Base64 variant:** Verify that the Python minter's output `payload` and `sig` fields contain only `A-Z a-z 0-9 + /` characters and `=` padding — no `-` or `_`.
- [ ] **PAE bytes:** Verify that the Python PAE construction produces byte-identical output to TS `buildPae()` for a known test case before testing full signatures.
- [ ] **Integer edge values:** Verify conformance vectors include `promptTokens: 0`, `promptTokens: 1000000`, and `completionTokens: 0` — not just round numbers.
- [ ] **Unicode step name:** Verify at least one conformance vector has a `stepName` containing a non-ASCII character (e.g., `"分析"`) and that TS and Python produce the same canonical bytes.
- [ ] **Downgrade defense:** Verify the Python verifier returns `schema-version-too-low` (not `signature-invalid` or `ok`) for a correctly signed `v1` receipt.
- [ ] **Scope boundary:** Verify the Python package `pip install` does not transitively install any HTTP client library.
- [ ] **Vector manifest:** Verify the CI gate fails when a vector file is modified without updating the manifest.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Float divergence discovered post-launch | HIGH — issued receipts have different CIDs depending on which implementation produced them | Mint corrected receipts; add a migration note in CHANGELOG; pin spec rule retroactively |
| Wrong base64 variant in minted receipts | MEDIUM — receipts verify within Python only | Add a normalization step in the verifier that detects and converts URL-safe to standard before PAE construction; re-mint affected receipts |
| Vectors generated from buggy TS code | MEDIUM | Re-derive vectors from the RFC 8785 test data; bump vector version; update CI manifest |
| Python client scope creep | MEDIUM | Deprecate and remove the out-of-scope surface in a minor bump; extract to a separate package if callers depend on it |
| Downgrade defense missing from Python verifier | HIGH — security regression | Hotfix release; add negative conformance vector; audit all receipts verified by the Python client since the release |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Float/integer canonicalization divergence | Spec-definition phase — write the "all numeric fields are safe integers" rule into the spec | Conformance vector with edge token counts; Python `rfc8785.dumps()` produces identical bytes |
| Unicode key-sort and string escape divergence | Conformance-vector definition phase — include a non-ASCII `stepName` vector | CI byte-identity check on the unicode vector |
| PAE construction error | Python-client implementation phase — build and test `build_pae()` first | Standalone PAE conformance vector before full-signature test |
| Base64 variant mismatch | Spec-definition phase — lock to standard base64 in the spec | CI check that minted receipts contain no `-` or `_` in `payload` / `sig` fields |
| Ed25519 JWK import path | Python-client implementation phase — `key.py` module with explicit test | Round-trip test: TS JWK → Python import → Python export → compare `x` |
| CID encoding divergence | Conformance-vector definition phase — include a CID vector | CI byte comparison on CID for known envelope |
| Schema-version downgrade omission | Conformance-vector definition phase — negative `v1` vector required | CI verifies Python returns `schema-version-too-low` |
| Test-vector rot | Conformance-vector definition phase — manifest + regen gate | CI manifest check fails on any vector file modification |
| Runtime scope creep | Python-client phase scope definition | Package public API review in PR; `pip install` dep audit |

---

## Sources

- `packages/lattice/src/receipts/canonical.ts` — direct code audit: `costUsd` stringification is the only float conversion; `promptTokens` and `completionTokens` are passed through as integers
- `packages/lattice/src/receipts/types.ts` — direct code audit: complete numeric field inventory
- `packages/lattice/src/receipts/envelope.ts` — direct code audit: `Buffer.from(bytes).toString("base64")` = standard base64 with padding; `buildPae` signs over base64 string, not raw bytes
- `packages/lattice/src/receipts/sign.ts` — direct code audit: JWK-only key interface; `createInMemorySigner` uses WebCrypto with ALG = "Ed25519"
- `packages/lattice/src/receipts/verify.ts` — direct code audit: downgrade check at Step 4; enumerated version set; re-canonicalization parity check
- `packages/lattice/src/receipts/cid.ts` — direct code audit: `sha256:<lowercase hex>` of decoded payload bytes
- [RFC 8785 — JSON Canonicalization Scheme](https://datatracker.ietf.org/doc/html/rfc8785) — number serialization rules, UTF-16BE key sorting requirement
- [rfc8785.py — Trail of Bits](https://github.com/trailofbits/rfc8785.py) — `IntegerDomainError` for values ≥ 2^53; `FloatDomainError` for NaN/Inf; UTF-16BE key sorting (HIGH confidence, Context7 verified)
- [DSSE protocol.md v1.0.0](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md) — PAE formula; LEN = byte length; "verifiers MUST accept either standard or URL-safe base64"
- [pyca/cryptography Ed25519 docs](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/) — no native JWK import; raw 32-byte interface only
- [jwcrypto JWK](https://jwcrypto.readthedocs.io/en/v1.4.2/jwk.html) — OKP JWK → pyca Ed25519 bridge; `d` field is base64url without padding (RFC 8037)
- [CPython issue #93508](https://github.com/python/cpython/issues/93508) — lone surrogate handling divergence in Python json module (MEDIUM confidence — active open issue)
- [cyberphone/json-canonicalization test data](https://github.com/cyberphone/json-canonicalization) — reference test vectors for RFC cross-check (HIGH confidence)

---
*Pitfalls research for: cross-language canonical-JSON / DSSE / Ed25519 receipt parity (Lattice v1.5)*
*Researched: 2026-06-24*
