# Phase 51: Conformance Vector Generator + Committed Vectors - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all proposed decisions accepted

<domain>
## Phase Boundary

Deliver the cross-language **golden conformance vectors** for the Lattice receipt protocol,
generated once from a fixed committed keypair + fixed timestamps and integrity-protected by a
SHA manifest. Requirements: **VEC-01 … VEC-06**.

Deliverables:
- A **flag-gated TypeScript generator** (private pnpm package `conformance/generate/`) that
  emits golden vectors from the reference implementation only when invoked with `--regen-vectors`.
- Committed **positive** vectors covering schema versions v1.1, v1.2, v1.3.
- Committed **negative / adversarial** vectors covering every `VerifyErrorKind`.
- `conformance/vectors/MANIFEST.sha256` integrity manifest.

**Out of scope (later phases):** the TS self-verification harness that consumes these vectors
(Phase 52); the Python client (53–55); the CI `conformance` job wiring (56, though VEC-06 places
the manifest check at the front of it). No changes to the runtime reference implementation.
</domain>

<decisions>
## Implementation Decisions

### Generator package & invocation
- **Generator lives in a NEW private pnpm workspace package `conformance/generate/`** (NOT under
  `packages/`, NOT under `spec/`) — keeps the npm tarball-leak and core-package-boundary checks
  green (TSCONF-02 boundary). Unpublished/private.
- **Invocation is gated by an explicit `--regen-vectors` flag.** Running the generator without
  the flag is a **no-op** — this prevents accidental regeneration at CI time (VEC-02). CI never
  regenerates; it only consumes committed vectors.
- **Reuse Phase 50's committed fixed Ed25519 keypair + fixed ISO timestamps** (the EXAMPLE/TEST-ONLY
  keypair embedded in `spec/generate-vector0.ts`) so output is deterministic and byte-stable across
  regenerations. The keypair is test material, clearly labeled — never production keys.
- **`spec/vector0-fixture.json` (from Phase 50) is the canonical v1.3 positive vector #0** (Phase 50
  D-05). The generator reproduces it byte-identically; do not fork a divergent copy.

### Vector set layout & coverage
- **Directory layout:** `conformance/vectors/` with `positive/` and `negative/` subdirectories.
- **Positive coverage:** at least one positive vector **per accepted version** — v1.1, v1.2, v1.3
  (VEC-03).
- **Negative coverage:** **one vector per `VerifyErrorKind`** (VEC-04). The kinds, mapped to a
  concrete adversarial construction: `canonicalization-mismatch` (tampered payload),
  `key-not-found` (wrong/unknown kid), `signature-invalid` (bad signature / kid mismatch),
  `schema-version-too-low` (v1 downgrade AND absent version — both rejected before crypto),
  `version-mismatch` (unknown/garbage version literal or malformed body shape),
  `envelope-malformed` (bad base64 / no signatures / wrong payloadType), and `key-revoked`
  (kid resolves to a revoked KeySet entry).
- **Vector file format = the VEC-01 field set**, one JSON object per vector, shared by positive and
  negative: `input body`, `canonicalBytesHex`, `payloadBase64`, `paeHex`, `signatureHex`,
  `publicKeyJwk`, `kid`, and `expectedResult` (for negatives, `expectedResult` carries the expected
  `VerifyErrorKind`). This is the single fixture shape every client (TS harness, Python) consumes.

### Integrity & spec-compliance proof
- **`conformance/vectors/MANIFEST.sha256`** lists the SHA-256 of every committed vector file;
  `sha256sum --check` must pass cleanly and break on any modification (VEC-06). This is the front
  gate of the Phase 56 CI `conformance` job.
- **RFC 8785 cross-check:** at least **2 positive vectors' canonical bytes are cross-checked against
  RFC 8785 reference test data** (sourced from the `canonicalize`/`canonicalize@3.0.0` library's
  published test corpus or the RFC 8785 appendix examples) — proving the canonicalization is
  spec-compliant, not merely self-consistent (VEC-05).
- **Schema validation at generation time:** the generator validates each vector's `input body`
  against the matching `spec/schema/vX.json` before writing the vector, catching body/schema drift
  at the source. (ajv is not yet a workspace dep — if needed, add it to the `conformance/generate/`
  private package only, not the runtime.)

### Claude's Discretion
- Exact generator CLI ergonomics, internal module layout, per-vector filenames, and the manifest
  generation mechanics are at the planner/executor's discretion within the constraints above.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 50 outputs (the spec + seed this phase builds on)
- `spec/SPEC.md` — the normative protocol (pipeline, verification algorithm, error taxonomy) the vectors must exercise.
- `spec/schema/v1.1.json`, `spec/schema/v1.2.json`, `spec/schema/v1.3.json` — schemas to validate vector bodies against.
- `spec/vector0-fixture.json` — the canonical v1.3 positive vector #0 (reuse, do not diverge).
- `spec/generate-vector0.ts` — the Phase 50 generator + the committed fixed EXAMPLE/TEST-ONLY Ed25519 keypair to reuse.

### Reference implementation (NORMATIVE — vectors are generated from these)
- `packages/lattice/src/receipts/{types,canonical,envelope,cid,verify,sign,receipt,redact}.ts`
- `packages/lattice/src/receipts/verify.ts` — the 10-step decision tree mapping each negative vector to its `VerifyErrorKind`.

### Requirements
- `.planning/REQUIREMENTS.md` — VEC-01..06 definitions + the downstream TSCONF/PYV/PYR/PYM/PARITY chain.
- `.planning/ROADMAP.md` — Phase 51 goal + success criteria.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `spec/generate-vector0.ts` — the existing generator already wires the full receipt pipeline (redact→canonicalize→PAE→sign→encode→CID) with the fixed keypair; the Phase 51 generator generalizes this to N vectors across versions + adversarial mutations.
- The reference `verifyReceipt` and `createReceipt` paths define exactly what each positive vector should contain and what each negative vector must trip.
- `tsx` is already in workspace-root devDependencies (added in Phase 50) for running TS scripts.

### Established Patterns
- Phase 50 proved the deterministic-generation pattern (fixed keypair + fixed timestamps → byte-stable fixture). Phase 51 extends it.
- Private/unpublished workspace packages must stay outside `packages/` to keep tarball + core-boundary checks green.

### Integration Points
- `conformance/` is a NEW top-level directory. The generator writes to `conformance/vectors/`.
- Phase 52's TS harness and Phases 53–55's Python client consume `conformance/vectors/` + `MANIFEST.sha256`.
</code_context>

<specifics>
## Specific Ideas

- Vector #0 (the v1.3 positive) = byte-identical to `spec/vector0-fixture.json`.
- Negative vectors are derived by mutating a valid signed envelope/body in exactly one way each, so each isolates a single `VerifyErrorKind`.
- The RFC 8785 cross-check should cite the specific external reference data used, so the proof is auditable.
</specifics>

<deferred>
## Deferred Ideas

- Additional Unicode / lone-surrogate edge-case vectors (VEC-F1) and multi-signature envelope vectors (VEC-F2) — v1.6+.
- The CI `conformance` job itself (manifest check → TS harness → Python harness → cross-mint parity) is wired in Phase 56; Phase 51 only produces the committed vectors + manifest it will gate on.

None introduced as scope creep this session — discussion stayed within VEC-01..06.
</deferred>
