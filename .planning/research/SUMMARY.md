# Project Research Summary

**Project:** Lattice v1.5 — Polyglot Receipt Protocol + Conformance Vectors + Python Client
**Domain:** Cross-language cryptographic receipt protocol specification, conformance testing, and Python reference client
**Researched:** 2026-06-24
**Confidence:** HIGH

---

## Executive Summary

Lattice v1.5 promotes the capability-receipt format from a TypeScript implementation detail to a versioned, language-neutral protocol. The work is not a runtime port: the TS runtime SDK (`createAI` / `run` / routing / provider adapters) stays TypeScript-only. The portable artifact is the signed, replayable audit trail — a DSSE envelope carrying a JCS-canonicalized body, Ed25519 signature, and `sha256:<hex>` CID. Cross-language protocol ecosystems like this (sigstore, in-toto, W3C VC, DSSE) are built by producing three artifacts in strict order: (1) a written, normative specification that pins every algorithmic choice, (2) committed golden conformance vectors generated from the reference implementation and locked in git, and (3) independent client implementations that must pass the vector suite without modifying it. The research confirms this exact pattern is the correct architecture for Lattice v1.5.

The recommended Python stack is lean and proven: `rfc8785` 0.1.4 (Trail of Bits) for JCS canonicalization, `cryptography` 49.0.0 (pyca) for Ed25519 sign/verify, `jwcrypto` 1.5.8 as the JWK OKP bridge, `hashlib` for CID computation, and `base64` stdlib for encoding — no DSSE library (PAE is ~10 lines), no CID library (`sha256:hex` is one `hashlib` call). Tooling is `uv` + `hatchling` + `pytest` + `ruff` + `mypy`, targeting Python 3.11+. The Python client lives at `clients/python/` (not under `packages/`) to keep the existing tarball-leak and core-boundary scripts unmodified. PyPI publishing is explicitly deferred.

The single most important risk is the hard linear dependency chain that the roadmap must enforce without exception: **spec must be complete before vectors can be generated; vectors must be committed before any client can claim conformance; TS self-verification must pass before Python verification is attempted; Python verify must pass before replay; Python replay must pass before mint; and mint must pass before cross-mint parity with the TS verifier closes the milestone.** Two specific spec-precision questions block the entire chain and must be resolved in the spec phase: (1) the exact `outputHash` algorithm (`sha256(JCS(outputs))` vs `sha256(JSON.stringify(outputs))`), and (2) the conformance-vector JSON schema and fixed test keypair storage format.

---

## Key Findings

### Recommended Stack

The TS side needs no new runtime dependencies — `canonicalize@3.0.0`, `@noble/ed25519@3.1.0`, Node 24 WebCrypto, `zod@4.3.6`, and `vitest` are already present. Two new private pnpm workspace packages are added under `conformance/`: a vector generator and a TS conformance harness. Neither is publishable.

The Python side requires exactly three runtime deps. `rfc8785` 0.1.4 is the only credible choice for JCS in Python: maintained by Trail of Bits, cross-validated byte-for-byte across 8 languages and 192 vectors. The float-divergence risk that typically makes JCS cross-language hazardous is structurally eliminated in Lattice: the receipt body contains exactly four safe-integer numeric fields (`promptTokens`, `completionTokens`, `attemptNumber`, `stepIndex`) and zero raw floats — `costUsd` is pre-serialized as a string by `stringifyCostUsd()` before JCS sees it. The spec must lock this as a hard rule.

**Core technologies:**
- `rfc8785` 0.1.4 (Trail of Bits): JCS canonicalization — only actively maintained Python JCS library, cross-validated across 8 languages, implements correct ECMA 262 float algorithm
- `cryptography` 49.0.0 (pyca): Ed25519 sign/verify — pyca standard, OpenSSL-backed, byte-identical output to Node WebCrypto for same key + message
- `jwcrypto` 1.5.8: JWK OKP (RFC 8037) import/export — wraps pyca, bridges the `{kty:"OKP",crv:"Ed25519",x,d}` format
- `uv` 0.11.23: package manager / venv — official `astral-sh/setup-uv@v6` GitHub Action
- `hatchling`: build backend — safer for library src layouts when PyPI publish is the eventual goal
- `pytest` 9.1.1 + `pytest-cov`, `ruff` 0.15.19, `mypy` 2.1

**What NOT to add:** `PyNaCl`, `py-cid`/`py-multihash`, `jcs` 0.2.1 (dead since 2022), `python-jose`/`authlib`, any DSSE library.

**Language feasibility ranking:**
Python (v1.5 primary) > Go (v1.5 stretch, all stdlib) > Rust > Java/Kotlin > C#/.NET > Ruby > PHP.

### Expected Features

**Must have (table stakes):**
- Written normative spec (`spec/SPEC.md` + `spec/schema/v1.x.json`) pinning all pipeline steps, the error-kind taxonomy, the downgrade boundary, I-JSON numeric rules, the PAE formula, the `payloadType` URI, and the CID format
- Committed conformance vectors — positive + negative + mint vectors; all three accepted schema versions (v1.1, v1.2, v1.3) covered; never regenerated at CI time
- CI manifest / byte-identity gate: manifest SHA verified before any test runs; silent regeneration is detectable and breaks CI
- Negative and adversarial vectors covering every `VerifyErrorKind` value — positive-only suites prove "happy path works," not "verifier rejects forgeries"
- Python `verify`, `mint`, `replay` (replay blocked on `outputHash` spec resolution)
- Cross-mint parity: TS `verifyReceipt` accepts a Python-minted receipt

**Should have (differentiators):**
- Self-documenting vector format with step-level intermediate bytes (`canonical_hex`, `pae_hex`)
- `spec/CHANGELOG.md` per-version delta log
- Research-ranked language list committed to repo

**Defer to v1.5.x / v1.6:**
- Go client, additional Unicode vectors, multi-sig vectors, PyPI trusted publishing, Rust client

**Anti-features / non-goals:**
- No `createAI`, `run`, routing, or provider adapters in Python
- No HTTP client (`httpx`, `requests`) in the Python package
- No PyPI publish this milestone
- No tripwire/PII kernel reimplementation in Python

### Architecture Approach

Four top-level components at the repo root: `spec/` (normative), `conformance/` (private pnpm workspace packages + committed golden vector files), `clients/python/` (entirely outside the pnpm surface), and the existing `packages/` (unchanged). Python under `clients/` — not `packages/` — keeps it transparent to `check-tarball-leak.mjs` and `check-core-package-boundary.mjs`. `conformance/generate/` and `conformance/verify-ts/` are added to `pnpm-workspace.yaml` as private packages.

**Major components:**
1. `spec/` (repo root) — `SPEC.md` (normative), `CHANGELOG.md`, `schema/v1.x.json` locked per receipt version
2. `conformance/vectors/` (repo root) — committed golden files; integrity protected by SHA manifest; indexed by schema version (`v1.1/`, `v1.2/`, `v1.3/`)
3. `conformance/generate/` (private pnpm package) — TS generator; manual only; validates against `spec/schema/v1.x.json` before writing
4. `conformance/verify-ts/` (private pnpm package) — vitest harness; byte-identity assertions at each pipeline step
5. `clients/python/` — `lattice_receipt/` package: `canonical.py`, `envelope.py`, `verify.py`, `replay.py`, `mint.py`
6. CI conformance job — TS harness + Python harness + cross-mint parity; vector manifest verified first; all must pass

**Key patterns:** Generator-driven golden files; shared-vector dual-harness CI gate; cross-mint parity round-trip; step-level intermediate bytes in vectors for debugging.

### Critical Pitfalls

1. **JCS float serialization divergence** — Lock spec to "all receipt body numbers MUST be safe integers; `costUsd` MUST be a string." Use `rfc8785` 0.1.4 only (never `json.dumps(sort_keys=True)`). The four safe-integer fields and zero raw floats in the current receipt body mean this risk is already structurally eliminated — the spec rule makes it permanent.
2. **Silent vector regeneration (test-vector rot)** — Commit a SHA manifest. CI verifies the manifest before any test. Generator gated behind a `--regen-vectors` flag. Negative and adversarial vectors are mandatory. "Vectors generated by the same code that tests them prove self-consistency, not spec compliance."
3. **PAE construction error** — Python must sign PAE bytes (`"DSSEv1 " + len(payloadType) + " " + payloadType + " " + len(payloadBase64) + " " + payloadBase64`), not raw canonical bytes. `build_pae()` is the first Python function built and the first to have a conformance vector test.
4. **Base64 variant mismatch** — Spec must state: standard base64 (RFC 4648 §4, `+/=` alphabet) in both `payload` and `sig`. JWK `d`/`x` fields are the only place base64url appears — `base64.urlsafe_b64decode(s + "==")`.
5. **Downgrade defense omission** — Spec must enumerate the exact known-version set and require rejection of `body.version = "lattice-receipt/v1"` and absent `body.version` before any cryptographic work. Dedicated negative conformance vectors for each rejection case.

---

## Implications for Roadmap

A hard linear dependency order the roadmap phases MUST respect. Suggested 7 phases:

### Phase 1: Spec + Numeric Audit + Blocking Decisions
Spec is the prerequisite for every downstream artifact. Resolve both blocking questions here — `outputHash` algorithm and vector JSON schema — before any generator code is written.
**Delivers:** `spec/SPEC.md`, `spec/CHANGELOG.md`, `spec/schema/v1.1.json` + `v1.2.json` + `v1.3.json`, locked `outputHash` algorithm, locked vector field set, committed test keypair location, the spec rule locking all receipt body numbers as safe integers.
**Avoids:** Pitfalls 1, 4, 5, and test-vector-rot prerequisites (all prevented at the spec layer).
**Research:** None external — content is liftable from `paper/main.tex` and existing TS source. Includes a code-read of `materialize.ts` to fix `outputHash`.

### Phase 2: Conformance Vector Generator + Committed Vectors
Vectors must exist before either harness can be written. Generated once from a fixed keypair and fixed timestamps; committed to git; never regenerated at CI time.
**Delivers:** `conformance/generate/` package, `conformance/keys/` test keypair, `conformance/vectors/v1.1|v1.2|v1.3/` (positive + negative + mint vectors), `conformance/vectors/MANIFEST.sha256`.
**Critical rule:** At least two positive vectors cross-checked against RFC 8785 reference test data to verify TS canonicalization is spec-compliant, not just self-consistent.

### Phase 3: TS Self-Verification Harness
Confirms vectors were generated correctly before Python depends on them.
**Delivers:** `conformance/verify-ts/` vitest package, `pnpm-workspace.yaml` updated, CI conformance job skeleton.

### Phase 4: Python `verify` + Conformance Harness
Verify is the smallest, highest-trust operation — pure function, ~60 lines, easy to audit. First CI evidence of cross-language byte-parity.
**Delivers:** `clients/python/` with `pyproject.toml`, `canonical.py`, `envelope.py` (`build_pae()` first), `key.py` (JWK import with `urlsafe_b64decode(x+"==")`), `verify.py` (downgrade defense before crypto work), `tests/test_conformance.py` parametrized over all vector files.

### Phase 5: Python `replay`
Blocked until Phase 1 resolves `outputHash` and Phase 4 proves verify works. Verify-first ordering preserved as a security invariant.
**Delivers:** `replay.py`, replay conformance vectors, `tests/test_replay.py`.
**Research:** Confirm artifact-loader protocol (`.lattice/fixtures/<sha256>.bin`) against the live CLI before building.

### Phase 6: Python `mint`
Hardest operation — every step a potential byte-parity failure point; must come after verify to enable a round-trip self-check. `costUsd` rejected as a raw float at mint time.
**Delivers:** `mint.py`, mint vectors pass `canonical_hex` byte-for-byte before the signature check, round-trip self-check, `tests/test_mint.py`.

### Phase 7: Cross-Mint Parity + CI Gate Closure
Milestone is complete only when TS `verifyReceipt` accepts a Python-minted receipt — the final bilateral parity assertion.
**Delivers:** `mint_fixture.py` (Python → stdout), `cross_mint_parity.test.ts` (TS spawns Python, calls `verifyReceipt`), full CI conformance job gating every PR touching receipts, conformance, or the Python client.

### Phase Ordering Rationale
- Spec before vectors: vectors encode spec decisions as bytes; spec changes after commitment require regenerating all vectors.
- Both blocking spec questions resolved in Phase 1: `outputHash` and vector schema are the only unbounded unknowns; they must be closed before Phase 2 begins.
- Vectors before harnesses: both the TS (Phase 3) and Python (Phase 4) harnesses depend on committed files.
- TS self-verification before Python verification: Phase 3 catches generator-output bugs before Python builds against it.
- Verify → replay → mint → cross-mint: architectural dependency chain.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against live PyPI / npm / GitHub; 8-language JCS cross-validation confirms `rfc8785` 0.1.4 byte-parity |
| Features | HIGH (spec/vectors/verify/mint); MEDIUM (replay) | Replay has one gap: `outputHash` serialization must be confirmed from live TS code |
| Architecture | HIGH | Derived entirely from live codebase; directory layout and CI job structure confirmed against existing scripts |
| Pitfalls | HIGH | All critical pitfalls from direct code audit of `canonical.ts`, `envelope.ts`, `verify.ts`, `cid.ts`, `types.ts` |

**Overall confidence:** HIGH

### Gaps to Address

- **`outputHash` algorithm (MUST resolve in Phase 1):** Read `packages/lattice/src/replay/materialize.ts` — is it `sha256(JCS(outputs))` or `sha256(JSON.stringify(outputs, null, 0))`? This single question gates Python replay.
- **Vector JSON field schema (MUST resolve in Phase 1):** STACK.md and FEATURES.md each propose a slightly different field set. Pick one, commit it to the spec.
- **`verifyReceipt` accepted version set (confirm before Phase 2):** Confirm the exact accepted-version enum from `verify.ts` — currently v1.1, v1.2, and v1.3 — so the vector directory structure covers all accepted versions, not just the latest.
- **Go client scope decision:** Decide before Phase 1 closes whether the Go client is in scope for v1.5 or deferred. Research rates it HIGH feasibility (all stdlib crypto); the CI cost is one matrix entry and `clients/go/`.

---

## Sources

### Primary (HIGH confidence)
- `packages/lattice/src/receipts/canonical.ts`, `envelope.ts`, `verify.ts`, `cid.ts`, `sign.ts`, `types.ts` — direct code audit
- `scripts/check-tarball-leak.mjs`, `scripts/check-core-package-boundary.mjs` — confirms `clients/` placement
- `pnpm-workspace.yaml` — current glob confirmed as `packages/*`
- [rfc8785 PyPI](https://pypi.org/project/rfc8785/) + [trailofbits/rfc8785.py](https://github.com/trailofbits/rfc8785.py) — v0.1.4, ECMA 262 float algorithm
- [cryptography PyPI](https://pypi.org/project/cryptography/) — v49.0.0
- [jwcrypto PyPI](https://pypi.org/project/jwcrypto/) — v1.5.8, OKP/Ed25519 JWK
- [uv releases](https://github.com/astral-sh/uv/releases) — v0.11.23
- [DSSE protocol.md](https://github.com/secure-systems-lab/dsse/blob/master/protocol.md) — PAE formula
- [RFC 8785](https://datatracker.ietf.org/doc/html/rfc8785) — JCS number serialization, UTF-16BE key sorting
- [sigstore-conformance](https://github.com/sigstore/sigstore-conformance) — committed-vector CI pattern
- [in-toto attestation versioning](https://github.com/in-toto/attestation/blob/main/spec/versioning.md) — additive minor-field pattern

### Secondary (MEDIUM confidence)
- [DSSE Python impl location](https://github.com/secure-systems-lab/dsse) — PAE formula is HIGH; Python impl location uncertain
- [CPython issue #93508](https://github.com/python/cpython/issues/93508) — lone surrogate divergence; active open issue

---

*Research completed: 2026-06-24*
*Ready for roadmap: yes*
