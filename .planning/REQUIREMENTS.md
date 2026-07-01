# Requirements: Lattice v1.5 — Polyglot Receipt Protocol + Conformance Vectors + Python Client

**Defined:** 2026-06-24
**Core Value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Milestone goal:** Promote Lattice's capability-receipt / replay / contract format from a TypeScript implementation detail to a versioned, language-neutral specification, prove cross-language byte-parity with committed conformance vectors, and ship a Python reference client (verify + replay + mint).

## v1.5 Requirements

Requirements for this milestone. Each maps to a roadmap phase. The hard dependency order is: spec → vectors → TS self-verification → Python verify → Python replay → Python mint → cross-mint parity + CI gate.

### Spec — Language-neutral protocol specification

- [x] **SPEC-01**: An implementer can read `spec/SPEC.md` and reproduce byte-identical JCS (RFC 8785) canonical bytes for a receipt body — including UTF-16BE key ordering and I-JSON rules — without reading the TypeScript source.
- [x] **SPEC-02**: The spec normatively requires every receipt-body numeric field to be a safe integer and `costUsd` to be an I-JSON string, permanently closing the cross-language float-canonicalization divergence class.
- [x] **SPEC-03**: The spec defines DSSE Pre-Authentication Encoding with a worked byte-level example and mandates standard base64 (RFC 4648 §4) for the `payload` and `sig` fields.
- [x] **SPEC-04**: The spec normatively defines the exact `outputHash` algorithm (serialization + hash function), resolved by reading the live TS `materialize`/receipt implementation.
- [x] **SPEC-05**: The spec defines the CID format (`sha256:<lowercase-hex>` over the DSSE payload bytes) and the `kid` / KeySet key model with JWK OKP (RFC 8037) key encoding.
- [x] **SPEC-06**: The spec enumerates the accepted schema-version set (`lattice-receipt/v1.1`, `v1.2`, `v1.3`), the downgrade-defense rule (reject `v1` and absent version before any crypto), and the verification algorithm with its complete error-kind taxonomy.
- [x] **SPEC-07**: The spec is versioned with a `CHANGELOG.md` and machine-checkable JSON Schema files (`spec/schema/v1.1.json`, `v1.2.json`, `v1.3.json`) that the vector generator validates bodies against.

### Vectors — Cross-language conformance vectors

- [x] **VEC-01**: A committed vector JSON schema defines each vector's fields (input body, expected canonical-bytes hex, payload base64, PAE hex, signature hex, public-key JWK, `kid`, expected result) so any client consumes the same fixtures.
- [x] **VEC-02**: A TypeScript generator produces golden vectors from the reference implementation using a fixed committed test keypair and fixed timestamps, runnable only as a deliberate flag-gated developer action — never at CI time.
- [x] **VEC-03**: Committed positive vectors cover every accepted schema version (v1.1, v1.2, v1.3).
- [x] **VEC-04**: Committed negative / adversarial vectors cover every `VerifyErrorKind` (tampered payload, wrong `kid`, bad signature, `v1` downgrade, absent version, malformed envelope, and the remaining kinds).
- [x] **VEC-05**: At least two positive vectors are cross-checked against RFC 8785 reference test data, proving canonicalization is spec-compliant rather than merely self-consistent.
- [x] **VEC-06**: A `MANIFEST.sha256` over the committed vector set is verified in CI before any conformance test runs, so silent vector regeneration breaks the build.

### TS Conformance — Reference-implementation self-verification

- [ ] **TSCONF-01**: A TypeScript (vitest) conformance harness re-derives canonical bytes, PAE, signature, and verdict for every committed vector and asserts byte-identity at each pipeline step.
- [ ] **TSCONF-02**: The vector generator and TS harness live as private, unpublished pnpm workspace packages under `conformance/`, leaving the npm tarball-leak and core-package-boundary checks green with no modification.

### Python Verify — Smallest, highest-trust client operation

- [ ] **PYV-01**: A Python developer can install the in-repo `lattice_receipt` client and verify a Lattice DSSE receipt envelope against a KeySet, receiving a typed verdict matching the spec's error-kind taxonomy.
- [ ] **PYV-02**: The Python client canonicalizes a receipt body to byte-identical JCS output (via `rfc8785`) and constructs PAE byte-identically to the spec.
- [ ] **PYV-03**: The Python verifier enforces the downgrade defense (rejects `lattice-receipt/v1` and absent version) before performing any cryptographic work.
- [ ] **PYV-04**: A pytest conformance harness runs the Python client against every committed vector (positive + negative) and is wired into CI as a required job.

### Python Replay — Re-materialize and re-hash

- [ ] **PYR-01**: The Python client recomputes `outputHash` per the spec and reports match / mismatch against a receipt, only after the envelope verifies (verify-first ordering preserved as a security invariant).
- [ ] **PYR-02**: Replay conformance vectors (positive + mismatch) pass in the Python pytest harness.

### Python Mint — Byte-identical signing in-language

- [ ] **PYM-01**: The Python client mints a new signed receipt (JCS body → PAE → Ed25519 over PAE → DSSE envelope) from a JWK OKP private key, byte-identical to the reference implementation.
- [ ] **PYM-02**: The Python minter rejects non-integer / float numeric body fields (and raw-float `costUsd`) at mint time, enforcing the spec's safe-integer rule.
- [ ] **PYM-03**: Mint conformance vectors assert byte-identical canonical bytes and PAE before the signature check, and an in-language mint→verify round-trip self-check passes.

### Parity — Cross-language proof + CI gate closure

- [ ] **PARITY-01**: The TypeScript `verifyReceipt` accepts a receipt minted by the Python client (cross-mint parity), proven by a TS test that invokes the Python minter.
- [ ] **PARITY-02**: A single CI `conformance` job gates every PR touching receipts, conformance, or the Python client — manifest check → TS harness → Python harness → cross-mint parity — all required to merge, using SHA-pinned language-setup actions.

## Future Requirements

Deferred to a later milestone. Tracked but not in the v1.5 roadmap.

### Additional language clients (v1.6+)

- **GO-01**: Go reference client (`clients/go/`) implementing verify against the committed vectors, with a Go CI conformance job — the cheapest second client (Ed25519 + JCS + base64 in Go stdlib).
- **GO-02**: Go replay + mint, reaching verify+replay+mint parity for a second language.
- **LANG-01**: Rust client via the same spec + vectors (high feasibility, extra CI weight).
- **LANG-02**: Java/Kotlin client.
- **LANG-03**: C# / .NET client (.NET 9+ Ed25519).
- **LANG-04**: Ruby client (pending JCS gem maturity confirmation).

### Distribution (v1.6+)

- **PUB-01**: Publish the Python client to PyPI with trusted publishing + provenance attestations, mirroring the npm OIDC posture.

### Vector breadth (v1.6+)

- **VEC-F1**: Additional Unicode / lone-surrogate edge-case vectors.
- **VEC-F2**: Multi-signature envelope vectors.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Full port of the runtime SDK (`createAI` / `run` / routing / provider adapters) to Python or any language | The runtime stays TypeScript-first; only the audit-trail protocol is portable by construction. A full port is a perpetual N-language maintenance burden with low payoff. |
| HTTP client / network code in the Python package | The client is a pure verify / replay / mint library over local inputs. Network concerns belong to the consumer. |
| Re-implementing the tripwire / PII / quality-floor kernels in Python | These live behind the runtime, outside the receipt-protocol boundary the spec defines. |
| PyPI publishing in v1.5 | Deferred until the client surface stabilizes; publishing posture is a separate concern (see PUB-01). |
| Go / Rust / other clients in v1.5 | Deferred to v1.6 — prove the spec end-to-end with one client + the CI drift gate first; adding clients is then cheap and low-risk. |
| Auto / silent vector regeneration in CI | Vectors are committed golden files protected by a manifest; the gate consumes them and must never regenerate them (would defeat drift detection). |

## Traceability

Which phases cover which requirements. Phase numbers continue from v1.4 (phases begin at 50).

| Requirement | Phase | Status |
|-------------|-------|--------|
| SPEC-01 | Phase 50 | Complete |
| SPEC-02 | Phase 50 | Complete |
| SPEC-03 | Phase 50 | Complete |
| SPEC-04 | Phase 50 | Complete |
| SPEC-05 | Phase 50 | Complete |
| SPEC-06 | Phase 50 | Complete |
| SPEC-07 | Phase 50 | Complete |
| VEC-01 | Phase 51 | Complete |
| VEC-02 | Phase 51 | Complete |
| VEC-03 | Phase 51 | Complete |
| VEC-04 | Phase 51 | Complete |
| VEC-05 | Phase 51 | Complete |
| VEC-06 | Phase 51 | Complete |
| TSCONF-01 | Phase 52 | Pending |
| TSCONF-02 | Phase 52 | Pending |
| PYV-01 | Phase 53 | Pending |
| PYV-02 | Phase 53 | Pending |
| PYV-03 | Phase 53 | Pending |
| PYV-04 | Phase 53 | Pending |
| PYR-01 | Phase 54 | Pending |
| PYR-02 | Phase 54 | Pending |
| PYM-01 | Phase 55 | Pending |
| PYM-02 | Phase 55 | Pending |
| PYM-03 | Phase 55 | Pending |
| PARITY-01 | Phase 56 | Pending |
| PARITY-02 | Phase 56 | Pending |

**Coverage:**
- v1.5 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-24 — traceability filled by roadmapper*
