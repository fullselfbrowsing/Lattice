# Stack Research

**Domain:** Polyglot protocol specification + cross-language conformance testing + Python reference client (signed cryptographic receipts)
**Researched:** 2026-06-24
**Confidence:** HIGH (all versions verified against live PyPI / npm / GitHub)

---

## Context: What This Milestone Is NOT Building

The runtime SDK (`createAI` / `run` / routing / provider adapters) stays TypeScript-only. This research covers only:

1. TS-side tooling to author the spec + emit/run conformance vectors inside the existing pnpm/vitest monorepo
2. A Python reference client (`verify` + `replay` + `mint`) that produces byte-identical output to the TS impl
3. CI matrix pattern to run Python against the committed vectors alongside pnpm tests
4. Language feasibility table to rank future client targets

---

## Part 1: TypeScript-Side Spec + Conformance Vector Harness

### What the TS side needs to add

The existing monorepo already has `vitest`, `fast-check`, `canonicalize@3.0.0`, `@noble/ed25519@3.1.0`, and Node 24 WebCrypto. No new TS runtime deps are required. The spec and vector harness are **test/tooling concerns only**.

### Conformance Vector Schema and Storage

**Approach:** Committed JSON fixture files — not snapshot tests.

Vitest snapshot (`toMatchSnapshot`) is wrong here because snapshot files are regenerated on `--update-snapshots`, which destroys the golden guarantee. The correct pattern is:

- A `vectors/` directory (e.g. `packages/lattice/test/conformance/vectors/`) containing one or more `.json` files, each holding an array of vector objects.
- Each vector: `{ id, description, input_body, canonical_bytes_hex, envelope_payload_b64, signature_hex, public_key_jwk }` (exact field set to be defined in the spec).
- A TS generator script (`scripts/generate-vectors.ts` or a `vitest` test with `--reporter=json`) that uses the existing TS impl to mint the canonical bytes and signatures for each fixed input.
- A TS conformance runner (`test/conformance/ts-conformance.test.ts`) that reads each vector file and asserts the TS impl reproduces byte-for-byte.
- The Python conformance runner reads the same files via `pytest` and asserts byte-for-byte.

**Why committed JSON, not generated-at-test-time:**
The whole point of the conformance gate is to catch drift between the TS impl and any client. If the reference bytes are regenerated every time the TS impl runs, a silent change to the TS impl silently regenerates the golden, defeating the drift detection. Committed bytes pin the protocol.

**Zod for vector schema validation (dev dep only):**
Already in `devDependencies` (`zod@4.3.6`). Use it to parse and validate the vector JSON on load in the TS runner. No new dep.

### TS Vector Generator

No new dep. Write a `tsx` script (or a vitest `beforeAll` that writes only when `GENERATE_VECTORS=1` env is set) that calls the existing `canonicalizeReceiptBody`, `buildPae`, `base64Encode`, and WebCrypto Ed25519 sign. Output: hex-encoded canonical bytes, base64 envelope payload, hex signature, serialized public key JWK.

**Determinism note:** The generator must use a fixed, hard-coded private key (committed to the vectors file or stored as a test fixture secret) so that signatures are deterministic across runs. Ed25519 is deterministic by construction (RFC 8032 — no random nonce), so the same key + message always produces the same signature bytes.

### No New TS Packages Required

| Concern | Solution | New Dep? |
|---------|----------|----------|
| Vector schema validation | `zod@4.3.6` (already in devDeps) | No |
| Snapshot-style golden assertion | Custom `assertBytesEqual` helper | No |
| Vector file I/O | Node `fs/promises` | No |
| Vector generation | Existing receipt primitives | No |
| Type-safe vector schema | `zod` schema + `z.infer<>` | No |

---

## Part 2: Python Reference Client

### 2a. JCS / RFC 8785 Canonicalization — THE CRITICAL DECISION

This is the highest-risk piece of the entire milestone. The TS impl uses `canonicalize@3.0.0`, which delegates number serialization to V8's `Number::toString()` — which implements the ES2019 "shortest round-trip" algorithm (Grisu3/Ryu). The Python client must produce **identical bytes** for every number that can appear in a receipt body.

**What numbers appear in receipt bodies (from `types.ts`):**

- `promptTokens: number` — always a non-negative integer
- `completionTokens: number` — always a non-negative integer
- `stepIndex?: number` — always a non-negative integer when present
- `costUsd: string | null` — already serialized as an **I-JSON string**, NOT a float (this is the `stringifyCostUsd` invariant in `canonical.ts`)

**Key finding: the receipt schema uses only integers and strings for numeric fields.**

`costUsd` is the only field that could be a float and it is pre-serialized to a string before JCS touches it. The integers (`promptTokens`, `completionTokens`, `stepIndex`) serialize identically in every conformant JCS implementation because integer-valued IEEE 754 doubles have an unambiguous decimal representation.

**This means: the Python JCS float-serialization risk is LOWER than it appears, because receipts contain no raw floats in the body.** The spec should formally lock this: the `CapabilityReceiptBody` type is I-JSON-numeric-safe and contains no raw float fields.

**Still verify the JCS library anyway** because the conformance vectors will catch any divergence.

#### Recommended: `rfc8785` 0.1.4 (Trail of Bits)

- Pure Python, zero dependencies, Python ≥ 3.8
- Released 2024-09-27 (most recent of 8 releases since March 2024, actively maintained)
- Maintained by Trail of Bits — a reputable security research firm with incentive to keep cryptographic primitives correct
- Explicitly declares itself "behaviorally comparable to Andrew Rundgren's reference implementation" (the same implementation that `canonicalize@3.0.0` is based on)
- `_serialize_float()` uses a custom algorithm derived from the Rundgren reference, implementing ECMA 262 7.1.12.1 as amended by RFC 8785 — not Python's bare `str(f)`
- Cross-validated: the `chopmob-cloud/algovoi-jcs-conformance-vectors` project ran 8 independent JCS implementations (including this library) against 24 vectors and found 192/192 byte-for-byte agreements

**Do NOT use `jcs` 0.2.1** — last release was April 2022, Python 3.10 is the highest tested version, and the project shows no maintenance activity.

**Float-serialization risk (explicit call-out per research brief):**

`rfc8785` 0.1.4 uses `str(f)` as a starting point and then post-processes it to match ECMA 262 § 7.1.12.1. This is a known technique (the same approach used by the Rundgren reference). The risk is that Python's `str(f)` for edge-case doubles (subnormals, values near exponent boundaries) may produce a string that the post-processor cannot perfectly reconstruct.

**Mitigation:** Because the Lattice receipt body contains no raw float fields (all numeric fields are integers; `costUsd` is a pre-serialized string), this edge-case risk does not apply to Lattice receipts in practice. The spec should formally constrain the `CapabilityReceiptBody` to I-JSON-numeric-safe (no raw float fields), and the conformance vectors should include test cases with `costUsd` as a string to prove string passthrough, and integer token counts to prove integer canonicalization.

**If a future schema version ever needs a raw float field:** switch the recommendation to a library backed by Ryu (e.g. a cffi wrapper around the C Ryu implementation) and add float-specific vectors. That is a future problem.

| Library | Version | Status | Float handling | Verdict |
|---------|---------|--------|----------------|---------|
| `rfc8785` (Trail of Bits) | 0.1.4 | Active (2024-09) | Custom ECMA 262 algorithm from Rundgren reference | **USE THIS** |
| `jcs` | 0.2.1 | Dead (2022-04) | Unknown | Do not use |

### 2b. Ed25519 Signing and Verification

**Requirement:** Produce 64-byte Ed25519 signatures verifiable by Node WebCrypto (`crypto.subtle.verify("Ed25519", ...)`) and by `@noble/ed25519@3.1.0` (the parity oracle). Both implement RFC 8032 pure Ed25519 with deterministic signing.

**Recommended: `cryptography` 49.0.0 (pyca)**

- Current version: 49.0.0 (released 2026-06-12)
- Backed by the Python Cryptographic Authority (pyca) — the authoritative Python security library
- Ed25519 support via `Ed25519PrivateKey` / `Ed25519PublicKey` from `cryptography.hazmat.primitives.asymmetric.ed25519`
- Supports raw 32-byte key import/export: `Ed25519PrivateKey.from_private_bytes(bytes)` and `public_key.public_bytes_raw()`
- Signs and verifies raw bytes; signature output is deterministic 64 bytes
- Backed by OpenSSL's Ed25519 implementation (RFC 8032 compliant, same standard as Node WebCrypto)

**Interoperability confirmation:** Node WebCrypto `"Ed25519"` and `pyca/cryptography` both implement RFC 8032 Ed25519 over Curve25519. The signatures are byte-identical for the same key + message — this is guaranteed by the RFC 8032 deterministic signing algorithm. The conformance vectors (which include fixed key + message → expected signature bytes) will provide CI-level proof.

**JWK bridge:** The TS impl stores keys as JWK (`{ kty: "OKP", crv: "Ed25519", x: "<base64url>", d: "<base64url>" }`). The Python client needs to import/export this format. `pyca/cryptography` itself does not natively parse JWK — use `jwcrypto 1.5.8` (released 2026-06-24, actively maintained) as the JWK layer on top of pyca.

`jwcrypto` depends on `cryptography` and wraps it with JWK/JWE/JWS support. It explicitly supports `kty=OKP` / `crv=Ed25519` per RFC 8037. Import pattern:

```python
from jwcrypto.jwk import JWK
key = JWK(**public_key_jwk_dict)  # or JWK.from_json(json_str)
raw_pub = key.get_op_key("verify")  # returns raw 32-byte public key bytes
```

Then pass the raw bytes to `Ed25519PublicKey.from_public_bytes(raw_pub)` for verification.

**Alternative (PyNaCl):** PyNaCl 1.6.2 (updated 2025-12-31 to libsodium 1.0.20-stable) also implements Ed25519 correctly and would interoperate. However, it does not provide JWK support, so a separate JWK parsing step is still needed. Since `cryptography` is better maintained, has a cleaner public API, and is already a dependency of `jwcrypto`, use `cryptography` + `jwcrypto`.

| Library | Version | Role | JWK? | Verdict |
|---------|---------|------|-------|---------|
| `cryptography` (pyca) | 49.0.0 | Ed25519 sign/verify with raw bytes | No native JWK | **USE** — core crypto |
| `jwcrypto` | 1.5.8 | JWK OKP import/export | Yes (RFC 8037) | **USE** — JWK bridge |
| `PyNaCl` | 1.6.2 | Ed25519 sign/verify | No | Do not add (redundant) |

### 2c. DSSE PAE Construction

No library needed. DSSE PAE is trivial to implement inline per the spec:

```
PAE = UTF-8("DSSEv1 " + len(payloadType) + " " + payloadType + " " + len(payloadBase64) + " " + payloadBase64)
```

The `envelope.ts` source is the reference. Implement as a 10-line helper in `lattice_receipt/envelope.py`. The conformance vectors will include expected PAE bytes to verify the Python impl matches.

### 2d. Standard Base64 (NOT base64url)

Python stdlib `base64.b64encode` / `base64.b64decode`. No library needed. The TS impl uses standard base64 (alphabet `A-Z a-z 0-9 + /` with `=` padding) per `envelope.ts` comments.

**Critical:** Do NOT use `base64.urlsafe_b64encode` (which uses `-` and `_` instead of `+` and `/`). The spec explicitly uses standard base64.

### 2e. CID Computation

The TS `receiptCid` function computes `sha256:<hex>` of the decoded DSSE payload bytes (the base64-decoded canonical body). This is standard SHA-256, not a multihash/IPFS CID — the format is a simple `sha256:` prefix + 64-char lowercase hex digest.

**No CID library needed.** Python stdlib `hashlib.sha256`:

```python
import hashlib, base64
payload_bytes = base64.b64decode(envelope["payload"])
digest = hashlib.sha256(payload_bytes).hexdigest()
cid = f"sha256:{digest}"
```

**Do NOT add `py-cid`, `py-multihash`, or `ipfs-cid`** — they are multihash/IPFS CID v1 libraries and the Lattice CID format is purposely a simple `sha256:<hex>` string, not a multibase-encoded multihash. Adding those libraries would be scope creep and a dependency risk.

### 2f. Python Project Tooling

#### Package Manager + Venv: `uv` 0.11.23

- Released 2026-06-19, actively maintained by Astral (same team as Ruff)
- 10-100x faster than pip/poetry for installs; sub-second `uv sync`
- Standard `pyproject.toml` with PEP 621 metadata — no proprietary lock format
- `uv run pytest` and `uv run ruff` work without activating a venv
- GitHub Actions: `astral-sh/setup-uv` action (official, maintained by Astral)
- **Build backend:** Use `hatchling` (Hatch's backend) rather than `uv_build` for library packaging — `uv_build` is optimized for applications; `hatchling` is more flexible for library src layouts and dynamic versioning. Since this milestone explicitly defers PyPI publishing, either works for in-repo development, but `hatchling` is the safer choice when publishing is the eventual goal.

#### Test Runner: `pytest` 9.1.1

- Released 2026-06-19
- Requires Python ≥ 3.10
- De facto standard; no credible alternative
- Use `pytest-cov` for coverage gating in CI

#### Lint + Format: `ruff` 0.15.19

- Released 2026-06-24 (same day as this research)
- Replaces `black`, `isort`, `flake8`, and ~20 plugins in one binary
- Used by FastAPI, Pydantic, Transformers, pandas — highest-confidence community signal
- Configure with `[tool.ruff]` in `pyproject.toml`

#### Type Checking: `mypy` 2.1

- Released 2026-05-11
- Mypy 2.0+ has experimental parallel type-checking (`--num-workers`)
- Minimum target Python 3.10 (matches pytest requirement)
- More conservative than pyright (fewer false negatives on third-party stubs) — correct choice for a library where correctness matters more than IDE speed
- **Alternative:** `pyright` is faster and better integrated into VS Code/Pylance. Use `mypy` for CI gate; developers may optionally run `pyright` locally. Do not run both in CI (redundant cost, false divergence between them on edge cases).

#### Python Version Target: 3.11+

- Python 3.11 is the minimum for `pytest` 9.x compatibility and mypy 2.x minimum
- Python 3.12 is acceptable as minimum if the team wants `tomllib` in stdlib and the improved error messages
- Avoid pinning to 3.13 (still "latest") — use 3.11 to maximize user compatibility

### 2g. Complete Python Dependency Summary

**`pyproject.toml` runtime dependencies:**

```toml
[project]
name = "lattice-receipt"
requires-python = ">=3.11"
dependencies = [
    "rfc8785>=0.1.4",
    "cryptography>=49.0.0",
    "jwcrypto>=1.5.8",
]
```

**Dev dependencies:**

```toml
[tool.uv.dev-dependencies]
dev = [
    "pytest>=9.1.1",
    "pytest-cov>=6.0.0",
    "ruff>=0.15.19",
    "mypy>=2.1.0",
]
```

**What NOT to add:**
- `PyNaCl` — redundant with `cryptography`
- `py-cid` / `py-multihash` — wrong abstraction for `sha256:<hex>` format
- `jcs` — unmaintained
- `pynacl` — redundant
- `python-jose` / `authlib` — full JWT stacks, overkill for JWK parsing only

---

## Part 3: CI Matrix — pnpm + Python in the Same Workflow

### Pattern: Separate jobs sharing committed vector artifacts

```yaml
jobs:
  ts-conformance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @full-self-browsing/lattice test
        # This runs the TS conformance runner which reads committed vectors

  python-conformance:
    runs-on: ubuntu-latest
    needs: []   # runs in parallel with ts-conformance
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v6
        with: { python-version: '3.11' }
      - run: uv sync --frozen
        working-directory: clients/python
      - run: uv run pytest clients/python/tests/test_conformance.py -v
        # Reads the same committed vectors from the repo root
```

**Why parallel, not matrix:** TS and Python are not testing the same thing (different ecosystems); they both independently verify against the same committed vector files. A language-axis matrix (with `include: [lang: ts, lang: python]`) would mean writing per-language setup inside a single job, which is harder to maintain. Two separate named jobs are clearer and parallelize naturally.

**Vector file path convention:** `conformance/vectors/v1/*.json` at the repo root (or under `packages/lattice/test/conformance/`). Both TS and Python runners are hard-coded to read from the same path.

**Drift gate:** If either job fails, the CI fails. The conformance gate is mandatory, not advisory.

### `setup-uv` Action

`astral-sh/setup-uv` is the official GitHub Action for uv. Pin to `v6` (latest at time of writing). It handles Python installation, caching, and PATH setup.

---

## Part 4: Language Feasibility Table for Future Clients

This table ranks the additional languages by the maturity of their JCS/RFC 8785, Ed25519, DSSE, and CID/multihash library ecosystems. The ranking informs which clients are cheap to add in v1.5 vs Future.

### Summary Table

| Language | JCS/RFC 8785 | Ed25519 | DSSE (PAE only) | CID (`sha256:<hex>`) | Overall Feasibility | v1.5 vs Future |
|----------|-------------|---------|-----------------|----------------------|---------------------|----------------|
| **Python** | `rfc8785` 0.1.4 (active, Trail of Bits) | `cryptography` 49.0.0 (stdlib-tier) | Trivial inline | `hashlib` stdlib | **HIGH** | v1.5 (primary) |
| **Go** | `gowebpki/jcs` or `cyberphone/json-canonicalization/go` (multiple active options) | `crypto/ed25519` in stdlib | Trivial inline | `crypto/sha256` stdlib | **HIGH** | v1.5 candidate |
| **Rust** | `serde_json_canonicalizer` (active; `serde_jcs` abandoned) | `ed25519-dalek` or `ring` (both active) | Trivial inline | `sha2` crate | **HIGH** | v1.5 candidate |
| **Java/Kotlin** | `io.github.erdtman:java-json-canonicalization` (active; cross-validated in 8-lang test) | `java.security` Ed25519 (Java 15+, GA in 17) | Trivial inline | `MessageDigest.SHA-256` stdlib | **MEDIUM-HIGH** | Future (more boilerplate) |
| **C# / .NET** | `Baqhub.Packages.JsonCanonicalization` 1.0.1 (active; cross-validated) | `System.Security.Cryptography.Ed25519` (.NET 9+) | Trivial inline | `SHA256.HashData` stdlib | **MEDIUM** | Future (requires .NET 9+) |
| **Ruby** | `json-canonicalization` gem (cross-validated in 8-lang test, maintainer unclear) | `openssl` gem (stdlib-backed, has Ed25519) | Trivial inline | `Digest::SHA2` stdlib | **MEDIUM** | Future (gem freshness unclear) |
| **PHP** | No well-maintained standalone package; `root23/php-json-canonicalization` mentioned in cross-validation but not on Packagist prominently | `sodium_crypto_sign_*` (libsodium, PHP 7.2+) | Trivial inline | `hash('sha256', ...)` stdlib | **LOW** | Future (JCS library risk) |

### Per-Language Notes

**Go (HIGH):**
Go is the strongest v1.5 candidate after Python. The stdlib `crypto/ed25519` is built-in and RFC 8032 compliant. Multiple JCS libraries exist — `gowebpki/jcs` and `cyberphone/json-canonicalization/go` (last updated December 2024) are the most cited. JWK parsing requires `lestrrat-go/jwx` (active, v3 series). A Go client could be added to v1.5 in a dedicated sub-phase with low risk. The AI agent SDK ecosystem (LangChain-Go, Google Genkit Go) is catching up quickly and Go is a common deployment target for agentic infrastructure.

**Rust (HIGH):**
Rust has excellent cryptographic primitives. `serde_json_canonicalizer` is actively maintained (the older `serde_jcs` was abandoned). `ed25519-dalek` is the ecosystem standard for Ed25519. JWK requires `josekit` or manual parsing. The main cost is Rust's boilerplate for error handling. A Rust client is feasible in v1.5 but would add more CI complexity (cargo + pnpm + uv). Recommend deferring to a dedicated Future milestone unless there is a specific Rust consumer.

**Java/Kotlin (MEDIUM-HIGH):**
Java 17+ has native Ed25519 (`KeyPairGenerator.getInstance("Ed25519")`). `io.github.erdtman:java-json-canonicalization` passed the 8-language cross-validation. JWK parsing requires `com.nimbusds:nimbus-jose-jwt` (active, widely used). The primary friction is Java's build system (Maven/Gradle) adding CI complexity disproportionate to the payoff unless there is a JVM consumer. Defer to Future.

**C# / .NET (MEDIUM):**
.NET 9 added `System.Security.Cryptography.Ed25519` in GA. For .NET 8 and earlier, Ed25519 is available via `BouncyCastle`. `Baqhub.Packages.JsonCanonicalization` passed the 8-language cross-validation. NuGet packaging is straightforward. The blocker is `.NET 9` requirement for native Ed25519 — projects on .NET 8 LTS need BouncyCastle. Defer to Future unless there is a .NET consumer.

**Ruby (MEDIUM):**
Ruby's `openssl` gem (which wraps OpenSSL) supports Ed25519. The `json-canonicalization` gem appears in the 8-language cross-validation but its maintenance status is unclear (no prominent Packagist listing found). Defer to Future pending JCS gem freshness verification.

**PHP (LOW):**
PHP's crypto story for Ed25519 is fine (libsodium is bundled since PHP 7.2). The JCS problem is harder — no prominent well-maintained Packagist package was found. `root23/php-json-canonicalization` is referenced in the cross-validation but cannot be confirmed as actively maintained on Packagist. Defer to Future.

### v1.5 Scope Recommendation

**v1.5:** Python client (primary). Go client (optional stretch goal, low additional risk). Everything else: Future.

**Rationale:** Python dominates the AI/LLM SDK consumer ecosystem — the primary audience for the receipt protocol (data scientists, ML engineers, evaluation frameworks). Go is a strong secondary target for infrastructure-oriented consumers. Rust, Java, C#, Ruby, and PHP are all feasible but bring disproportionate CI complexity for the v1.5 scope.

---

## What NOT to Build or Add

| Avoid | Why | Instead |
|-------|-----|---------|
| PyPI publish in v1.5 | Client API surface needs to stabilize against the conformance vectors first | Add to Future milestone with trusted publishing + provenance |
| `py-cid` / `py-multihash` | Lattice CID is `sha256:<hex>`, not a multiformat CID v1 | Use `hashlib.sha256` + string formatting |
| `PyNaCl` | Redundant with `cryptography`; adds a libsodium compile dep | `cryptography` covers all needs |
| `jcs` 0.2.1 | Unmaintained since 2022 | `rfc8785` 0.1.4 |
| Vitest snapshot for conformance vectors | Snapshots are regenerated on `--update-snapshots`, destroying the golden guarantee | Committed JSON vector files + custom byte-equality assertions |
| Poetry for the Python client | uv is strictly faster, standard-compliant, and has better CI tooling | uv 0.11.23 |
| Separate Python repo | Cross-language conformance gate only works if vectors and runners are co-located | `clients/python/` inside the existing monorepo |
| Full DSSE library import | PAE is 10 lines; a full DSSE library import adds unnecessary dependency surface | Inline PAE implementation in `lattice_receipt/envelope.py` |

---

## Version Compatibility Notes

| Component | Version | Compatible With | Notes |
|-----------|---------|-----------------|-------|
| `rfc8785` | 0.1.4 | Python ≥ 3.8 | Use ≥ 3.11 to match pytest requirement |
| `cryptography` | 49.0.0 | Python ≥ 3.8 | `Ed25519PrivateKey.from_private_bytes` stable since v40 |
| `jwcrypto` | 1.5.8 | Python ≥ 3.8, depends on `cryptography` | OKP/Ed25519 support via RFC 8037 |
| `pytest` | 9.1.1 | Python ≥ 3.10 | Forces Python ≥ 3.10 minimum |
| `ruff` | 0.15.19 | Python ≥ 3.7 (runtime) | No Python minimum for linting |
| `mypy` | 2.1 | Python ≥ 3.10 (target) | Rejects `--python-version 3.9` |
| `uv` | 0.11.23 | Any | CI via `astral-sh/setup-uv@v6` |
| `canonicalize` (TS) | 3.0.0 | Node ≥ 24 | Already pinned; do not upgrade without cross-lang re-validation |
| `@noble/ed25519` | 3.1.0 | Node ≥ 24 | Parity oracle only; do not use in production signing |

---

## Sources

- [rfc8785 on PyPI](https://pypi.org/project/rfc8785/) — version 0.1.4, release history, Python requirements (HIGH confidence)
- [trailofbits/rfc8785.py on GitHub](https://github.com/trailofbits/rfc8785.py) — `_serialize_float()` implementation using ECMA 262 reference algorithm (HIGH confidence)
- [cryptography on PyPI](https://pypi.org/project/cryptography/) — version 49.0.0, released 2026-06-12 (HIGH confidence)
- [pyca/cryptography Ed25519 docs](https://cryptography.io/en/latest/hazmat/primitives/asymmetric/ed25519/) — raw key I/O, sign/verify API (HIGH confidence)
- [jwcrypto on PyPI](https://pypi.org/project/jwcrypto/) — version 1.5.8, released 2026-06-24 (HIGH confidence)
- [jwcrypto JWK docs](https://jwcrypto.readthedocs.io/en/latest/jwk.html) — OKP/Ed25519 JWK support confirmed (HIGH confidence)
- [pytest on PyPI](https://pypi.org/project/pytest/) — version 9.1.1, released 2026-06-19 (HIGH confidence)
- [ruff on PyPI](https://pypi.org/project/ruff/) — version 0.15.19, released 2026-06-24 (HIGH confidence)
- [uv releases](https://github.com/astral-sh/uv/releases) — version 0.11.23, released 2026-06-19 (HIGH confidence)
- [mypy 2.1 release notes](https://mypy-lang.org/) — released 2026-05-11, minimum Python 3.10 (HIGH confidence)
- [chopmob-cloud/algovoi-jcs-conformance-vectors](https://github.com/chopmob-cloud/algovoi-jcs-conformance-vectors/blob/main/_attestations/2026-05-24-8-impl-cross-validation.md) — 8-language 192/192 JCS cross-validation (HIGH confidence)
- [astral-sh/setup-uv](https://github.com/astral-sh/setup-uv) — GitHub Actions uv setup action (HIGH confidence)
- [secure-systems-lab/dsse](https://github.com/secure-systems-lab/dsse) — DSSE spec + reference implementations (MEDIUM confidence for Python impl location)
- `packages/lattice/src/receipts/canonical.ts` — confirms `costUsd` is pre-serialized as string before JCS (HIGH confidence, first-party)
- `packages/lattice/src/receipts/types.ts` — confirms only integers and strings appear as numeric fields in receipt body (HIGH confidence, first-party)
- `packages/lattice/src/receipts/cid.ts` — confirms CID format is `sha256:<hex>`, not a multiformat CID (HIGH confidence, first-party)

---

*Stack research for: Lattice v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client*
*Researched: 2026-06-24*
