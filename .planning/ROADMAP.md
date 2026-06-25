# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md` · `.planning/milestones/v1.2-MILESTONE-AUDIT.md` |
| v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface | Shipped | 2026-06-15 | `.planning/milestones/v1.3-ROADMAP.md` · `.planning/milestones/v1.3-REQUIREMENTS.md` · `.planning/milestones/v1.3-MILESTONE-AUDIT.md` |
| v1.4 Provider Breadth + Live Multimodal + Observability Export | Shipped | 2026-06-16 | `.planning/milestones/v1.4-ROADMAP.md` · `.planning/milestones/v1.4-REQUIREMENTS.md` · `.planning/milestones/v1.4-MILESTONE-AUDIT.md` |
| v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client | Active | — | `.planning/ROADMAP.md` (this file) |

## Phases

<details>
<summary><b>Shipped milestones (collapsed)</b></summary>

### v1.0 milestone (shipped 2026-04-22)

Phases 1 to 6. Package/API spine, artifact lifecycle, deterministic planning, sessions/context/packaging, tools/replay/observability, work-inbox showcase. See `.planning/milestones/v1.0-ROADMAP.md`.

### v1.1 Capability Receipts (shipped 2026-05-12)

Phases 7 to 13 (plus sub-phases 13.1 + 13.2). Contracts + pre-flight + cost accounting, tripwire invariants with terminal semantics, RFC 8785 JCS canonicalization + Ed25519 signed receipts with `kid` and `KeySet`, receipts inside the replay envelope, `lattice` CLI (`repro` / `verify` / `eval`), sidecar support that closes the replay round-trip, showcase enrichment exercising all 36 v1.1 REQ-IDs. See `.planning/milestones/v1.1-ROADMAP.md`.

### v1.2 FSB Integration + Agent Capability (shipped 2026-05-31)

Phases 14 to 22 (plus the Phase 23 milestone audit). Two tracks delivered in one milestone.

- **Track A (Phases 14 to 18):** public surface index + packaging readiness; receipt v1.1 schema extension + tripwire band pipeline + lifecycle events; step-transition tracing + checkpoint hook; five new provider adapters (Anthropic Messages, Gemini, xAI, OpenRouter, LM Studio) + INV-03 parity smoke across 7 logical providers; survivability adapter contract.
- **Track B (Phases 19 to 22):** delegation surface flip + `ai.runAgent(intent)` runtime entrypoint with uniform prompt-reencoded tool-use across 7 providers; pluggable `AgentHost` interface (scheduler / transport / storage seams) + recovery markers closing v1.1 TRACE-EXT-01; five agent infrastructure primitives (cost / transcript / goal-progress / action-history / permission); `examples/agent-loop` showcase + `evalAgentRun` regression-gate kernel.

46 / 46 REQ-IDs wired end-to-end. 733 / 733 workspace tests passing. One non-blocking limitation documented (V1.2-LIMITATION-1: native tool-use deferred). v1.2 branch merged to `main` via PR #1 (merge commit `5ca3e33`); tag `v1.2.0` cut and pushed. See `.planning/milestones/v1.2-ROADMAP.md` and `.planning/milestones/v1.2-MILESTONE-AUDIT.md`.

### v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface (shipped 2026-06-15)

Phases 24 to 39 (16 planned; 13 shipped). First public npm release under `@full-self-browsing/*` via OIDC Trusted Publisher + SLSA provenance (`@full-self-browsing/lattice@1.3.0` + `@full-self-browsing/lattice-cli@1.3.0`, GitHub Release `v1.3.0`). Plus a model-aware SDK upgrade — capability registry (~337 profiles from the OpenRouter feed + static supplements), adapter quirk flags + capability negotiation, prompt scaffolds, opt-in output sanitizers + tool-call validators across all 7 adapters, receipt v1.2 + `modelClass` — and a first-class opt-in multi-agent delegation surface (`defineAgent` / `runAgentCrew`, crew budgets, prompt-cache-prefix sharing, rate-limit groups, chained receipts). 64 / 87 REQ-IDs shipped; the 23 canary REQ-IDs (Phases 30–32) were **superseded** by the decision to dogfood the published package through FSB-via-npm instead of a synthetic canary. See `.planning/milestones/v1.3-ROADMAP.md` and `.planning/milestones/v1.3-MILESTONE-AUDIT.md`.

### v1.4 Provider Breadth + Live Multimodal + Observability Export (shipped 2026-06-16)

Phases 40 to 49. Provider breadth via LiteLLM/OpenRouter gateway delegation, deterministic OpenRouter catalog refresh, normalized streaming across seven logical providers, Anthropic/Gemini multimodal request shaping, realtime direction, receipt lineage/KMS signer shapes, OpenTelemetry export with Langfuse/Phoenix OTLP paths, eval/diagnostics CLI expansion, offline validation, tarball checks, and FSB package-candidate dogfood. 44 / 44 REQ-IDs shipped. See `.planning/milestones/v1.4-ROADMAP.md` and `.planning/milestones/v1.4-MILESTONE-AUDIT.md`.

</details>

## Active Milestone: v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client

- [~] **Phase 50: Protocol Specification** - Versioned, normative `spec/SPEC.md` with machine-checkable JSON Schema files, resolving the two spec-precision blockers (`outputHash` algorithm and vector field schema) — Plan 01 complete (1/3 plans)
- [ ] **Phase 51: Conformance Vector Generator + Committed Vectors** - Flag-gated TS generator producing positive, negative, and mint vectors across all three schema versions, committed with SHA manifest
- [ ] **Phase 52: TypeScript Self-Verification Harness** - Private vitest harness asserting byte-identity at every pipeline step against all committed vectors, CI skeleton wired
- [ ] **Phase 53: Python Verify** - `lattice_receipt` Python client with `verify()`, downgrade defense, and a pytest conformance harness passing all positive and negative vectors
- [ ] **Phase 54: Python Replay** - `replay()` in the Python client computing `outputHash` byte-identically to the spec, with replay conformance vectors passing
- [ ] **Phase 55: Python Mint** - `mint()` in the Python client producing DSSE envelopes with byte-identical JCS and PAE before the signature, plus a round-trip self-check
- [ ] **Phase 56: Cross-Mint Parity + CI Gate** - TS `verifyReceipt` accepts a Python-minted receipt; full `conformance` CI job gates every relevant PR

## Phase Details

### Phase 50: Protocol Specification
**Goal**: An implementer can read `spec/SPEC.md` and reproduce every byte of a Lattice receipt without reading TypeScript source, with both spec-precision blocking decisions resolved
**Depends on**: Nothing (first v1.5 phase)
**Requirements**: SPEC-01, SPEC-02, SPEC-03, SPEC-04, SPEC-05, SPEC-06, SPEC-07
**Success Criteria** (what must be TRUE):
  1. A developer reading `spec/SPEC.md` can reproduce JCS canonical bytes for a receipt body — including UTF-16BE key ordering and I-JSON rules — without consulting any TypeScript source file
  2. The spec normatively documents the `outputHash` algorithm as `sha256(JSON.stringify(outputMap))` (resolved by reading `storage/fingerprint.ts`), closing the cross-language replay ambiguity
  3. The spec contains a worked byte-level PAE example, mandates standard base64 (RFC 4648 §4) for `payload` and `sig`, and specifies base64url only for JWK `d`/`x` fields
  4. Three machine-checkable JSON Schema files (`spec/schema/v1.1.json`, `v1.2.json`, `v1.3.json`) exist and a `spec/CHANGELOG.md` records per-version deltas
  5. The spec enumerates the accepted version set (v1.1, v1.2, v1.3), states the downgrade-defense rule (reject `lattice-receipt/v1` and absent version before any crypto), and defines the complete `VerifyErrorKind` taxonomy
**Plans**: 3 plans
Plans:
**Wave 1**
- [x] 50-01-PLAN.md — Generate vector #0 script + committed fixture (wave 1) — COMPLETE (2026-06-25)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 50-02-PLAN.md — Author spec/SPEC.md normative prose §1–§9 + Appendix A (wave 2)
- [x] 50-03-PLAN.md — Author JSON Schema files v1.1/v1.2/v1.3 + CHANGELOG.md (wave 2, parallel)

### Phase 51: Conformance Vector Generator + Committed Vectors
**Goal**: Cross-language golden conformance vectors are committed to the repo, generated once from a fixed keypair and timestamps, and integrity-protected by a SHA manifest
**Depends on**: Phase 50
**Requirements**: VEC-01, VEC-02, VEC-03, VEC-04, VEC-05, VEC-06
**Success Criteria** (what must be TRUE):
  1. A `conformance/generate/` private pnpm package produces vectors only when invoked with an explicit flag (`--regen-vectors`); running it without the flag does nothing, preventing accidental CI regeneration
  2. Committed positive vectors cover schema versions v1.1, v1.2, and v1.3; committed negative/adversarial vectors cover every `VerifyErrorKind` (tampered payload, wrong `kid`, bad signature, `v1` downgrade, absent version, malformed envelope, and remaining kinds)
  3. At least two positive vectors are cross-checked against RFC 8785 reference test data, proving TS JCS canonicalization is spec-compliant rather than self-consistent
  4. `conformance/vectors/MANIFEST.sha256` exists and running `sha256sum --check` against it passes cleanly; any modification to a vector file breaks the manifest check
**Plans**: TBD

### Phase 52: TypeScript Self-Verification Harness
**Goal**: The TypeScript reference implementation proves the committed vectors are correct by asserting byte-identity at every pipeline step before any Python client depends on them
**Depends on**: Phase 51
**Requirements**: TSCONF-01, TSCONF-02
**Success Criteria** (what must be TRUE):
  1. A `conformance/verify-ts/` vitest package re-derives canonical bytes, PAE hex, signature, and verdict for every committed vector and asserts byte-identity at each step; the harness fails the build if any vector diverges
  2. Both `conformance/generate/` and `conformance/verify-ts/` are added to `pnpm-workspace.yaml` as private, unpublished packages; the existing tarball-leak and core-package-boundary CI scripts remain green with no modification
**Plans**: TBD

### Phase 53: Python Verify
**Goal**: A Python developer can verify a Lattice DSSE receipt envelope with a typed verdict matching the spec's error-kind taxonomy, proven against all committed vectors
**Depends on**: Phase 52
**Requirements**: PYV-01, PYV-02, PYV-03, PYV-04
**Success Criteria** (what must be TRUE):
  1. Running `from lattice_receipt import verify; verify(envelope_dict, keyset)` returns a typed verdict for a valid receipt and a typed error kind for every failure mode in the spec taxonomy
  2. The Python client's JCS canonicalization produces byte-identical output to the TypeScript reference implementation for all positive vector bodies (confirmed by the pytest harness consuming the committed vector files)
  3. The Python verifier rejects receipts with version `"lattice-receipt/v1"` or absent version before performing any cryptographic work, matching the dedicated negative vectors
  4. A pytest conformance harness at `clients/python/tests/test_conformance.py` parametrized over all vector files runs in CI as a required job and passes all positive and negative vectors
**Plans**: TBD

### Phase 54: Python Replay
**Goal**: The Python client recomputes `outputHash` byte-identically to the spec and reports match/mismatch only after the envelope verifies, preserving the verify-first security invariant
**Depends on**: Phase 53
**Requirements**: PYR-01, PYR-02
**Success Criteria** (what must be TRUE):
  1. `replay(envelope_dict, keyset, outputs)` returns `{"match": true}` for a valid receipt whose stored `outputHash` matches `sha256(JSON.stringify(outputs))` and returns a typed mismatch result otherwise; it raises `VerifyError` without computing `outputHash` if envelope verification fails
  2. Replay conformance vectors (positive match + intentional mismatch) pass in the Python pytest harness
**Plans**: TBD

### Phase 55: Python Mint
**Goal**: The Python client produces DSSE-enveloped receipts with byte-identical JCS body and PAE to the TypeScript reference, and a round-trip self-check closes the in-language correctness loop
**Depends on**: Phase 54
**Requirements**: PYM-01, PYM-02, PYM-03
**Success Criteria** (what must be TRUE):
  1. `mint(body_dict, jwk_private_key)` produces a DSSE envelope whose `canonical_hex` and `pae_hex` intermediate values match the committed mint vectors byte-for-byte before the signature is checked
  2. Passing a body dict with any non-integer numeric field or a raw-float `costUsd` value to `mint()` raises a typed error before any cryptographic work begins
  3. A round-trip self-check — `verify(mint(body, key), keyset)` — passes for a correctly formed body, asserting the minted envelope verifies under the public key extracted from the same JWK
**Plans**: TBD

### Phase 56: Cross-Mint Parity + CI Gate
**Goal**: The TypeScript verifier accepts a Python-minted receipt (bilateral parity proven), and a single required CI job gates all future drift across the full conformance pipeline
**Depends on**: Phase 55
**Requirements**: PARITY-01, PARITY-02
**Success Criteria** (what must be TRUE):
  1. A TypeScript test (`cross_mint_parity.test.ts`) spawns the Python minter as a subprocess, calls `verifyReceipt` on its output, and asserts `result.ok === true` — proving TS accepts a Python-minted receipt
  2. A `conformance` CI job runs on every PR touching `spec/`, `conformance/`, or `clients/python/`; the job executes in strict order (manifest check → TS harness → Python harness → cross-mint parity) using SHA-pinned language-setup actions, and all four steps are required to merge
**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 50. Protocol Specification | 3/3 | Complete   | 2026-06-25 |
| 51. Conformance Vector Generator + Committed Vectors | 0/TBD | Not started | - |
| 52. TypeScript Self-Verification Harness | 0/TBD | Not started | - |
| 53. Python Verify | 0/TBD | Not started | - |
| 54. Python Replay | 0/TBD | Not started | - |
| 55. Python Mint | 0/TBD | Not started | - |
| 56. Cross-Mint Parity + CI Gate | 0/TBD | Not started | - |
