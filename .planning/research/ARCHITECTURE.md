# Architecture Research

**Domain:** Polyglot receipt protocol — spec, conformance vectors, Python client integration into an existing pnpm/TS monorepo
**Researched:** 2026-06-24
**Confidence:** HIGH (derived entirely from the live codebase; no speculation)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                   SINGLE SOURCE OF TRUTH                            │
│   spec/SPEC.md  (normative)    spec/CHANGELOG.md                    │
│   spec/schema/v1.1.json  v1.2.json  v1.3.json  (locked schemas)    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ referenced by
          ┌────────────────────┼────────────────────┐
          ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│  packages/       │  │  conformance/    │  │  clients/python/     │
│  lattice/src/    │  │  vectors/        │  │  (non-pnpm package)  │
│  receipts/ +     │  │  (committed      │  │  verify + replay     │
│  replay/         │  │   golden files)  │  │  + mint              │
└──────────┬───────┘  └───────┬──────────┘  └──────────┬───────────┘
           │                  │                         │
           │ generates        │ consumed by both        │ consumes
           ▼                  ▼                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  CI: conformance gate job                            │
│  1. pnpm run conformance:verify   (TS consumes own vectors)         │
│  2. python -m pytest clients/python/tests/test_conformance.py       │
│  both must pass; byte-comparison failure = drift                    │
│  3. python mint → TS verify round-trip (cross-mint parity check)    │
└──────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `spec/SPEC.md` | Normative, versioned, language-neutral description of the receipt protocol | NEW |
| `spec/schema/v1.x.json` | Locked JSON Schema snapshots of each `lattice-receipt/v1.x` body | NEW |
| `spec/CHANGELOG.md` | Tracks which spec section changed for which receipt version | NEW |
| `conformance/vectors/` | Committed golden files (input + canonical bytes + envelope + pubkey) | NEW |
| `conformance/generate/` | TS generator script that emits golden files from the live TS impl | NEW |
| `conformance/verify-ts/` | TS test entry-point consuming vectors against the live TS impl | NEW |
| `clients/python/` | Python reference client: verify + replay + mint | NEW |
| `clients/python/tests/test_conformance.py` | Python conformance harness consuming the same golden files | NEW |
| `packages/lattice/src/receipts/` | TS implementation (canonical, envelope, sign, verify, cid, keyset) | EXISTING |
| `packages/lattice/src/replay/` | TS replay (materialize, replayOffline) | EXISTING |
| `scripts/check-tarball-leak.mjs` | Enforces `packages/` whitelist; `clients/` is outside publishable set | EXISTING — no change needed |
| `scripts/check-core-package-boundary.mjs` | Scans only `packages/lattice/dist`; `clients/` + `conformance/` not scanned | EXISTING — no change needed |
| `.github/workflows/ci.yml` | Existing gate; add `conformance` job as a separate parallel step | MODIFY |

---

## Recommended Project Structure

```
lattice/                              # repo root
├── spec/
│   ├── SPEC.md                       # normative language-neutral spec
│   ├── CHANGELOG.md                  # per-version change log for the spec
│   └── schema/
│       ├── lattice-receipt-v1.1.json # locked JSON Schema (v1.1 body shape)
│       ├── lattice-receipt-v1.2.json # locked JSON Schema (v1.2 body shape)
│       └── lattice-receipt-v1.3.json # locked JSON Schema (v1.3 body shape, current)
│
├── conformance/
│   ├── vectors/
│   │   ├── README.md                 # format documentation
│   │   ├── v1.1/
│   │   │   └── <id>.vector.json      # one file per vector (see format below)
│   │   ├── v1.2/
│   │   │   └── <id>.vector.json
│   │   └── v1.3/
│   │       └── <id>.vector.json      # current version vectors
│   ├── generate/
│   │   ├── package.json              # private, no publish
│   │   └── generate-vectors.ts       # TS generator; run: pnpm --filter conformance-generate run generate
│   └── verify-ts/
│       ├── package.json              # private, no publish
│       └── verify-vectors.test.ts    # vitest harness consuming conformance/vectors/
│
├── clients/
│   └── python/
│       ├── pyproject.toml            # Python packaging (hatchling, no npm involvement)
│       ├── lattice_receipt/
│       │   ├── __init__.py
│       │   ├── canonical.py          # RFC 8785 JCS canonicalization
│       │   ├── envelope.py           # DSSE PAE, base64
│       │   ├── verify.py             # verifyReceipt equivalent
│       │   ├── replay.py             # replay (re-hash outputHash)
│       │   └── mint.py               # sign new receipts (Ed25519)
│       └── tests/
│           ├── test_conformance.py   # consumes conformance/vectors/ golden files
│           └── test_round_trip.py    # python mint → bytes → TS verify cross-check
│
├── packages/
│   ├── lattice/                      # unchanged
│   └── lattice-cli/                  # unchanged
│
├── pnpm-workspace.yaml               # add conformance/* to packages list
├── package.json                      # add conformance scripts
└── .github/
    └── workflows/
        ├── ci.yml                    # MODIFY: add conformance job
        └── release.yml               # unchanged
```

### Structure Rationale

- **`spec/` at repo root:** The spec is peer to the TS implementation, not subordinate to it. Placing it under `packages/` would imply it is an npm-publishable artifact; it is not. A root-level `spec/` is the established pattern for language-neutral protocol documents (DSSE, SLSA, OpenID Connect all use root-level `spec/` directories in their repos).

- **`conformance/` at repo root:** Conformance vectors are neither TS source nor Python source; they are protocol-level test fixtures. Placing them at root keeps them accessible to all consumers with a relative path that does not change when packages restructure. The `generate/` and `verify-ts/` sub-packages are private pnpm workspace members (no `publishConfig`), so they benefit from the pnpm catalog but never enter an npm tarball.

- **`clients/python/` not under `packages/`:** `packages/` is the pnpm workspace glob (`packages/*`). Adding Python there would require either making it a pnpm package (which requires a `package.json` and pollutes pnpm's resolution) or making the glob more restrictive. Placing Python under `clients/` keeps it entirely outside the pnpm surface — `pnpm-workspace.yaml` lists only `packages/*` and `conformance/*`. The `check-tarball-leak.mjs` hard-codes `PACKAGES = [packages/lattice, packages/lattice-cli]`, so `clients/` is never packed. The `check-core-package-boundary.mjs` scans only `packages/lattice/dist`, so `clients/` is not scanned.

- **`spec/schema/` JSON Schema files:** These are the machine-checkable complement to the prose spec. The generator in `conformance/generate/` validates each vector's body against the schema for its declared `version` field before writing it, preventing spec drift.

---

## Architectural Patterns

### Pattern 1: Generator-Driven Golden Files (Vectors-From-Impl)

**What:** The TS implementation is the canonical authority for what the protocol does. The `conformance/generate/generate-vectors.ts` script imports directly from `packages/lattice/src/receipts/` to produce committed golden files. Each golden file records: the deterministic body input, the JCS canonical bytes (hex), the DSSE envelope, and the public key used to sign. The generator is run intentionally (not on every CI invocation) and its output is committed to git. CI then checks the committed vectors against the live TS implementation.

**When to use:** Anytime the source of truth for a binary protocol is an existing implementation rather than a written spec. This pattern gives "the spec is the code" semantics while still making the expected bytes observable and independently verifiable.

**Trade-offs:** The generator must be re-run and re-committed every time the signing logic changes. A stale vector set will cause CI to fail — which is exactly the desired drift-detection signal. The generator itself must be deterministic: fixed key material, fixed timestamps, and fixed entropy.

**Generator contract:**
```typescript
// conformance/generate/generate-vectors.ts
// Called: pnpm --filter conformance-generate run generate
import { canonicalizeReceiptBody } from "../../packages/lattice/src/receipts/canonical.js";
import { buildPae, encodeEnvelope, base64Encode } from "../../packages/lattice/src/receipts/envelope.js";
import { createInMemorySigner } from "../../packages/lattice/src/receipts/sign.js";

// MUST use a FIXED private key (embedded in the generator, never in the vector file).
// MUST use a FIXED issuedAt timestamp per vector ID so the output is reproducible.
// Writes conformance/vectors/v1.3/<id>.vector.json for each vector fixture.
```

**Vector file format** (`.vector.json`):
```json
{
  "id": "v1.3-basic-success-001",
  "specVersion": "lattice-receipt/v1.3",
  "description": "basic success receipt, single Ed25519 key, no redactions",
  "input": {
    "body": { /* full CapabilityReceiptBody, all required fields */ }
  },
  "expected": {
    "canonicalBytes": "<hex-encoded JCS UTF-8 bytes of body>",
    "payloadBase64": "<standard base64 of canonicalBytes>",
    "paeBytes": "<hex-encoded DSSE PAE bytes>",
    "signatureBytes": "<hex-encoded Ed25519 signature over PAE>",
    "envelope": {
      "payloadType": "application/vnd.lattice.receipt+json",
      "payload": "<same as payloadBase64>",
      "signatures": [{ "keyid": "test-key-1", "sig": "<base64 signatureBytes>" }]
    }
  },
  "publicKeyJwk": { /* Ed25519 public key in JWK format */ }
}
```

The vector captures every intermediate step in the sign/verify pipeline: canonical bytes, PAE bytes, and the final envelope. This lets each client implementation verify at the step level, not just end-to-end, which makes debugging cross-language failures tractable.

### Pattern 2: Shared-Vector Dual-Harness CI Gate

**What:** Both the TS harness (`conformance/verify-ts/verify-vectors.test.ts`) and the Python harness (`clients/python/tests/test_conformance.py`) consume the exact same committed vector files at `conformance/vectors/`. Neither generates vectors at CI time — they only consume and assert. CI runs both in a single GitHub Actions job (or two parallel jobs in a matrix) and fails if either harness fails.

**When to use:** Whenever byte-level parity between two implementations must be proven continuously, not just at development time.

**Trade-offs:** Both harnesses are coupled to the vector file format. The format must be stable enough to serve both languages without transformation. The JSON format chosen above is intentionally simple (hex strings, base64 strings, plain JSON) so Python's `json` stdlib and Node's built-ins can both parse it without special libraries.

**TS harness outline:**
```typescript
// conformance/verify-ts/verify-vectors.test.ts
import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { canonicalizeReceiptBody } from "../../packages/lattice/src/receipts/canonical.js";
import { buildPae, base64Encode } from "../../packages/lattice/src/receipts/envelope.js";
import { verifyReceipt } from "../../packages/lattice/src/receipts/verify.js";
import { createMemoryKeySet } from "../../packages/lattice/src/receipts/keyset.js";

// For each vector: verify canonicalBytes matches, verifyReceipt returns ok: true,
// body.kid, contractVerdict match expected.
```

**Python harness outline:**
```python
# clients/python/tests/test_conformance.py
import json, pathlib, pytest
VECTORS_DIR = pathlib.Path(__file__).parents[3] / "conformance" / "vectors"

@pytest.mark.parametrize("vector_path", list(VECTORS_DIR.rglob("*.vector.json")))
def test_vector(vector_path):
    v = json.loads(vector_path.read_text())
    body = v["input"]["body"]
    canonical = lattice_receipt.canonical.canonicalize_body(body)
    assert canonical.hex() == v["expected"]["canonicalBytes"]
    # ... verify PAE, verify signature, verify envelope round-trip
```

### Pattern 3: Cross-Mint Parity Round-Trip

**What:** After the Python client can mint (sign new receipts), a dedicated test mints a receipt in Python and then calls the TS `verifyReceipt` to confirm the TS verifier accepts the Python-minted envelope. This closes the loop: it is not enough that Python can verify TS-minted receipts; the TS verifier must also accept Python-minted receipts.

**When to use:** Any time two implementations must be interoperable at the protocol level, not just read-compatible.

**Implementation:** A CI step (or a vitest test that spawns a Python subprocess) that:
1. Calls `python -c "import lattice_receipt.mint; ..."` with a known keypair to produce a receipt JSON.
2. Passes that JSON to `verifyReceipt` in TS.
3. Asserts `result.ok === true`.

The simplest CI-safe implementation: `clients/python/tests/mint_fixture.py` writes a receipt to stdout as JSON. The TS test in `conformance/verify-ts/` spawns this script, parses the output, and calls `verifyReceipt`. This avoids needing a shared file path and works within the pnpm/Python dual-toolchain CI job.

---

## Data Flow

### Build Order and Dependency Graph

```
Step 1: spec/SPEC.md is authored (human; no build dependency)
        spec/schema/v1.x.json are locked alongside the spec

Step 2: conformance/generate/generate-vectors.ts runs (manual + CI trigger)
        Input:  packages/lattice/src/receipts/* (canonical, envelope, sign)
        Output: conformance/vectors/v1.x/*.vector.json  [COMMITTED TO GIT]
        Gate:   validates each body against spec/schema/v1.x.json before writing

Step 3: TS self-verification  [runs on every PR via ci.yml]
        conformance/verify-ts/verify-vectors.test.ts
        Input:  conformance/vectors/**/*.vector.json + packages/lattice/src/receipts/*
        Gate:   each step of sign/verify pipeline byte-matches the committed vector
        Failure = TS impl drifted from committed vectors (must regenerate + commit)

Step 4: Python verify  [runs on every PR via ci.yml conformance job]
        clients/python/tests/test_conformance.py
        Input:  conformance/vectors/**/*.vector.json
        Gate:   Python implementation of canonical + PAE + verify matches all vectors
        Failure = Python client drifted from the protocol

Step 5: Python replay  [runs after Step 4 passes]
        clients/python/tests/test_replay.py
        Input:  a TS-minted ReceiptEnvelope (from conformance vector's envelope field)
        Gate:   Python can decode the envelope, re-canonicalize the body, and compare outputHash

Step 6: Python mint  [runs after Step 5 passes]
        clients/python/tests/test_mint.py
        Gate:   Python can produce a ReceiptEnvelope that passes Python's own verifyReceipt

Step 7: Cross-mint parity  [runs after Step 6 passes]
        conformance/verify-ts/cross_mint_parity.test.ts  (spawns Python mint as subprocess)
        Gate:   TS verifyReceipt accepts a Python-minted envelope  →  full round-trip proven
        This is the final parity assertion: the protocol is byte-identical across languages.
```

### Key Data Flows

1. **Sign flow (both TS and Python must agree byte-for-byte):**
   ```
   CapabilityReceiptBody (JSON object)
       → JCS canonicalize (RFC 8785) → canonical bytes (UTF-8)
       → base64-encode canonical bytes → payloadBase64
       → DSSE PAE: "DSSEv1 " + len(payloadType) + " " + payloadType + " " + len(payloadBase64) + " " + payloadBase64
       → Ed25519 sign PAE bytes → 64-byte signature
       → base64-encode signature → sig string
       → ReceiptEnvelope { payloadType, payload: payloadBase64, signatures: [{ keyid, sig }] }
   ```

2. **Verify flow (identity of steps is the parity contract):**
   ```
   ReceiptEnvelope
       → base64-decode payload → canonical bytes
       → JSON.parse canonical bytes → body object
       → structural shape check → typed body
       → schema version check (must be >= v1.1)
       → keyset lookup by keyid
       → re-canonicalize body → compare byte-for-byte against decoded payload
       → build PAE from payloadType + payloadBase64
       → Ed25519 verify(PAE, sig, publicKey)
       → VerifyResult
   ```

3. **CID flow (used for parentReceiptCid chaining):**
   ```
   ReceiptEnvelope
       → base64-decode payload → canonical bytes
       → SHA-256(canonical bytes) → hex digest
       → "sha256:" + hex  →  CID string
   ```
   Python must implement the same CID derivation. No signing key required.

4. **Replay flow:**
   ```
   ReceiptEnvelope
       → verifyReceipt → CapabilityReceiptBody
       → load artifacts by inputHash (from fixture store)
       → re-run output transformation
       → SHA-256(JSON.stringify(outputs)) → actualOutputHash
       → compare actualOutputHash === body.outputHash  →  "match" | "drift"
   ```

---

## Integration Points

### pnpm Workspace Integration

The `conformance/generate/` and `conformance/verify-ts/` packages must be added to `pnpm-workspace.yaml`. The current file lists only `packages/*`. The required change:

```yaml
# pnpm-workspace.yaml (modified)
packages:
  - "packages/*"
  - "conformance/*"   # adds generate/ and verify-ts/ as private workspace packages
```

Both new packages have `"private": true` and no `publishConfig` in their `package.json`. They will never be picked up by `check-tarball-leak.mjs` because that script hard-codes its `PACKAGES` array to `packages/lattice` and `packages/lattice-cli`. No modification to `check-tarball-leak.mjs` is needed.

The `check-core-package-boundary.mjs` script scans only `packages/lattice/dist/`. The new `conformance/` packages and `clients/python/` are outside that path and require no changes to that script.

### Python Toolchain in CI

The existing `ci.yml` uses a single job on `ubuntu-latest` with Node 24. The conformance gate requires Python. Two implementation options:

**Option A (recommended): Add a separate `conformance` job to `ci.yml`.**

```yaml
conformance:
  name: conformance
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@<sha>
    - uses: pnpm/action-setup@<sha>
    - uses: actions/setup-node@<sha>
      with: { node-version: '24', cache: 'pnpm' }
    - uses: actions/setup-python@<sha>
      with: { python-version: '3.12' }
    - run: pnpm install --frozen-lockfile
    - run: pnpm -r build        # build packages/lattice so conformance/verify-ts can import it
    - name: Run TS conformance vectors
      run: pnpm --filter conformance-verify-ts run test
    - name: Install Python client
      run: pip install -e clients/python[dev]
    - name: Run Python conformance vectors
      run: pytest clients/python/tests/test_conformance.py -v
    - name: Cross-mint parity (Python mint -> TS verify)
      run: pnpm --filter conformance-verify-ts run test:cross-mint
```

This job runs in parallel with the existing `ci` job (which covers build, typecheck, unit tests, lint:packages, tarball checks). Both must pass for a PR to merge.

**Option B:** Extend the existing `ci` job with Python steps. This is simpler but adds Python setup time to every PR's main gate. Not recommended because Python setup adds ~30s to what is currently a fast gate.

The `actions/setup-python` action must be SHA-pinned at 40 chars per the existing CI-02 / D-12 rule.

### Spec Versioning Without Drift

The spec is kept in sync with the implementation via three mechanisms:

1. **Schema JSON files are generated from the TS types.** The `generate-vectors.ts` script, after generating vectors, also validates each body against the corresponding `spec/schema/v1.x.json` using a JSON Schema validator. If the TS implementation uses a field that the schema does not describe, generation fails. This makes the schema the spec and the impl the validator — not the other way around.

2. **The `version` field in `CapabilityReceiptBody` is the authoritative schema discriminant.** When a new field is added (e.g., `lattice-receipt/v1.4`), a new JSON Schema file and new vectors must be added before any code ships the new version string. The vector generator enforces this by matching `body.version` to `spec/schema/<version>.json`.

3. **The spec CHANGELOG records which spec sections changed for which receipt version.** This is a manual discipline but the CI gate on vectors means the implementation cannot advance a version string without vectors for that version also passing. The roadmap phase for adding a new receipt version therefore has three mandatory deliverables: spec section update, schema JSON, new vectors.

---

## Anti-Patterns

### Anti-Pattern 1: Generating Vectors at CI Time

**What people do:** Run the TS generator in CI and compare the output to a reference, or generate vectors on-the-fly during each test run.

**Why it's wrong:** If generation and verification run in the same process with the same code, they cannot detect drift — a bug in canonicalization would affect both generation and verification identically. The value of committed vectors is that they represent a historical snapshot of the protocol behavior; a current bug does not retroactively change them.

**Do this instead:** Vectors are committed to git. The CI gate only consumes them, never regenerates them. The generator is a developer tool run manually before committing a protocol change, with a deliberate "commit the new vectors" step.

### Anti-Pattern 2: Putting the Python Client Under `packages/`

**What people do:** Place `packages/python/` to keep everything in one glob.

**Why it's wrong:** The `pnpm-workspace.yaml` glob `packages/*` causes pnpm to treat every directory under `packages/` as a pnpm package, requiring a `package.json`. The `check-tarball-leak.mjs` script would need a negative exclusion for `packages/python`. More subtly, `check-core-package-boundary.mjs` would scan `packages/python/` looking for forbidden Node imports in Python files, producing false positives. The Python packaging system (pyproject.toml / hatchling) is orthogonal to pnpm.

**Do this instead:** Place the Python client under `clients/python/`. The `clients/` directory is not in any pnpm workspace glob; pnpm ignores it entirely. All existing boundary scripts remain unchanged.

### Anti-Pattern 3: Python Client Importing from `packages/lattice/src/`

**What people do:** Use Node.js subprocess calls or FFI to call the TS implementation from Python to avoid reimplementing the protocol.

**Why it's wrong:** The entire point of the Python client is to prove cross-language byte-parity via an independent implementation. A Python wrapper around TS code is not an independent implementation; it proves nothing about language portability. It also creates a Node.js runtime dependency for Python consumers.

**Do this instead:** The Python client is a pure Python reimplementation of the three core algorithms: JCS canonicalization, DSSE PAE construction, and Ed25519 sign/verify. All three are straightforward pure-Python implementations using the `cryptography` library for Ed25519 and Python's built-in `json` and `hashlib` for the rest.

### Anti-Pattern 4: Floating Spec (Prose Without Schema)

**What people do:** Write `SPEC.md` as prose and trust that implementers read it correctly.

**Why it's wrong:** Prose is ambiguous on edge cases: what happens to `costUsd` when the value is `Infinity`? Does `redactions: []` differ from omitting `redactions`? Is `null` allowed for `outputHash`? The TS implementation answers these questions by behavior; the spec must answer them by text + machine-checkable schema.

**Do this instead:** Every `CapabilityReceiptBody` field is described in prose in `SPEC.md` and also declared in `spec/schema/v1.x.json`. The vector generator validates each golden body against the schema; this catches spec/impl divergence before vectors are committed.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| v1.5 (1 language) | Current layout: `conformance/` + `clients/python/` + single CI job |
| v1.6 (2-3 languages) | Add `clients/go/` and `clients/rust/` under `clients/`; add each to the conformance CI matrix; vectors are shared and require no changes |
| v1.7+ (N languages) | The `conformance` CI job becomes a matrix (`strategy.matrix.language: [ts, python, go, rust]`); each language runs the same vector set; parity is proven by the same mechanism at any N |

The architecture does not need to change to add languages. Only two things change per new language: a new `clients/<lang>/` directory and a new matrix entry in the CI conformance job. The spec, schema, and vectors are shared and language-agnostic by design.

---

## Sources

- Live codebase: `packages/lattice/src/receipts/canonical.ts`, `envelope.ts`, `sign.ts`, `verify.ts`, `cid.ts`, `keyset.ts`, `types.ts`
- Live codebase: `packages/lattice/src/replay/materialize.ts`
- Live codebase: `packages/lattice-cli/src/commands/verify.ts`, `repro.ts`, `receipt.ts`
- Live codebase: `scripts/check-tarball-leak.mjs`, `scripts/check-core-package-boundary.mjs`
- Live codebase: `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Live codebase: `pnpm-workspace.yaml`, root `package.json`, `packages/lattice/package.json`
- `.planning/PROJECT.md` — v1.5 milestone goals and key decisions

---
*Architecture research for: Lattice v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client*
*Researched: 2026-06-24*
