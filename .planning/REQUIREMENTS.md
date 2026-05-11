# Milestone v1.1 Requirements — Capability Receipts

**Milestone:** v1.1
**Goal:** Make every Lattice run contract-bound, signed, and reproducible — turning a thumbs-down in prod into a deterministic local repro and a CI-gated regression check.
**Created:** 2026-05-11

REQ-ID format: `<CATEGORY>-<NN>`. Numbering restarts for v1.1; v1.0 requirements are archived in `.planning/milestones/v1.0-*`.

---

## v1.1 Requirements

### Contracts (CONTRACT)

- [ ] **CONTRACT-01**: Developer can pass an optional `contract` field on `ai.run(...)` declaring `budget`, `invariants`, and `qualityFloor`.
- [ ] **CONTRACT-02**: Developer can declare a budget invariant (`maxCostUsd`, `p95LatencyMs`) inside `contract`.
- [ ] **CONTRACT-03**: Developer can declare a `qualityFloor` invariant tied to an eval fixture suite and minimum score inside `contract`.
- [ ] **CONTRACT-04**: Runtime performs pre-flight contract proof against the deterministic router and refuses to execute when no candidate route can satisfy the contract.
- [ ] **CONTRACT-05**: When pre-flight rejects a run, the runtime returns a typed `RunFailure` with kind `no-contract-match` (additive to existing `LatticeRunError`).
- [ ] **CONTRACT-06**: New router reject reasons (`contract-budget-exceeded`, `contract-quality-floor`, `contract-modality-missing`, `contract-privacy-mismatch`) flow through the existing `noRouteReasons` taxonomy.

### Tripwires (TRIP)

- [ ] **TRIP-01**: Developer can declare a tripwire invariant inline using Standard Schema (`@standard-schema/spec`), wrapped in a fluent builder (`inv.mustCite()`, `inv.fieldFromTable()`, `inv.noPII()`, `inv.matches(schema)`).
- [ ] **TRIP-02**: Runtime evaluates tripwire invariants post-execution as a stage between output schema validation and result return.
- [ ] **TRIP-03**: Tripwire violations are typed as terminal failures (`terminal: true`) and are NOT retried by the existing fallback chain.
- [ ] **TRIP-04**: Tripwire violation returns a typed `RunFailure` with kind `tripwire-violated`, the violating invariant id, and structured evidence.
- [ ] **TRIP-05**: A new `"tripwire"` execution stage kind is added to the plan so tripwire timing is inspectable.

### Cost Accounting (COST)

- [ ] **COST-01**: Every `RunResult` (success and failure) exposes a `usage` field with `{ promptTokens, completionTokens, costUsd }`.
- [ ] **COST-02**: The `openai`, `openai-compat`, and `ai-sdk` provider adapters normalize their usage output into the shared `RunResult.usage` shape.
- [ ] **COST-03**: Pre-flight contract proof reads adapter cost metadata from the capability catalog to estimate cost before execution.

### Receipts (RECEIPT)

- [ ] **RECEIPT-01**: Runtime defines a `CapabilityReceipt` schema covering: receipt id, run id, plan hash, route choice, `model.requested`, `model.observed` fingerprint, `usage`, `contractVerdict`, input artifact hashes, output hashes, `redactionPolicyId`, `redactions[]` manifest, `kid`, timestamp.
- [ ] **RECEIPT-02**: Runtime serializes receipts to canonical JSON per RFC 8785 (JCS) using `canonicalize@3.0.0`. I-JSON only — no raw floats in the receipt schema.
- [ ] **RECEIPT-03**: Runtime signs receipts with Ed25519 via Node 24 WebCrypto `crypto.subtle` and emits a DSSE-shaped envelope (`payloadType`, `payload`, `signatures[]`) with PAE pre-auth encoding.
- [ ] **RECEIPT-04**: Receipts are signed over the redacted canonical form, not the cleartext. Redaction always runs before signing.
- [ ] **RECEIPT-05**: Receipts include a `kid` (key id) field, and the runtime accepts a `KeySet` abstraction with `active | retired | revoked` key states for verification.
- [ ] **RECEIPT-06**: Runtime exposes a pure `verifyReceipt(envelope, keySet)` function that returns a typed success or a typed verification failure.
- [ ] **RECEIPT-07**: Receipts are emitted on both success and failure runs. Failure receipts include `contractVerdict: 'tripwire-violated' | 'no-contract-match' | 'execution-failed'`.
- [ ] **RECEIPT-08**: Receipts include both `model.requested` (developer-specified id) and `model.observed` (provider-returned fingerprint) so model-version drift is detectable.
- [ ] **RECEIPT-09**: Receipts embed inside the existing `ReplayEnvelope` via optional `receipt?` and `contract?` fields, so a receipt is sufficient to materialize an offline replay.
- [ ] **RECEIPT-10**: `LatticeConfig` accepts an optional `signer` setting (a `ReceiptSigner` returning `{ kid, sign(bytes), publicKeyJwk }`); when absent, receipts are not emitted.

### CLI — Repro & Verify (CLI)

- [ ] **CLI-01**: New `packages/lattice-cli` workspace package publishes a single `lattice` bin entry. The bin is auto-maintained via `tsdown` shebang detection.
- [ ] **CLI-02**: `lattice repro <receipt-id>` loads a receipt, verifies its signature, materializes a `ReplayEnvelope` from receipt + content-addressed artifact bodies, runs `replayOffline`, and diffs the result against the receipt's `outputHashes`.
- [ ] **CLI-03**: `lattice verify <receipt-path>` verifies a receipt's signature and structural integrity without running anything; prints a typed verdict.
- [ ] **CLI-04**: `lattice` CLI uses `citty@0.2.2` with lazy subcommand loading so `lattice repro` does not transitively load eval/judge dependencies.
- [ ] **CLI-05**: CLI output is redacted by default — only the redacted fields from the signed receipt are surfaced. (No `--unsafe-unredacted` flag in v1.1.)
- [ ] **CLI-06**: `packages/lattice-cli` imports `lattice` only via its public exports (`workspace:*`); a depcheck gate prevents the runtime package from accidentally importing CLI-only dependencies.

### Eval CI Gate (EVAL)

- [ ] **EVAL-01**: `lattice eval [--fixtures <dir>]` discovers receipts under `.lattice/receipts/`, replays each via `replayOffline`, and emits a structured report.
- [ ] **EVAL-02**: `lattice eval` gates on baseline-relative regression — comparing this run's `usage.costUsd` and `qualityFloor` score against the last green baseline rather than absolute thresholds. Exits non-zero on regression.
- [ ] **EVAL-03**: Quality-floor metrics that use an LLM judge run with `N=3` repetitions and aggregate via median to reduce judge variance.
- [ ] **EVAL-04**: Judge outputs are cached on disk by `hash(fixtureId, model_fingerprint, judge_prompt)` so reruns of the same baseline do not re-spend judge tokens.
- [ ] **EVAL-05**: Quality-floor gates are layered by determinism class — exact (string/hash equality) runs first, then semantic-cheap (schema match), then semantic-expensive (LLM judge). Failures on cheaper layers short-circuit.
- [ ] **EVAL-06**: `lattice eval` exits with a non-zero status on any regression so CI fails the build; the structured report is also emitted as JSON for programmatic consumers.

---

## Future Requirements (deferred to v1.2+)

- Typed `NoContractMatchResult` with per-candidate rejection-reason detail beyond the basic taxonomy
- Content-addressed contract identity (hashing contracts via canonical JSON for stable identity)
- Tripwire `shadow | enforce` modes (per-invariant warn vs abort)
- Tripwire streaming-cheap vs streaming-expensive predicate split (forward-compat for mid-stream evaluation)
- Tripwires reusable as eval scorers (shared `Invariant` interface across run-gate and fixture-grade paths)
- `costAtAbort` vs `costAtSuccess` split in `RunResult.usage`
- Lineage merkle root signed inside `CapabilityReceipt`
- `redactionPolicyId` enforcement and signed redaction-policy registry
- Typed verify error union (`KeyNotFound` / `CanonicalizationMismatch` / `RedactionDrift` / `EnvironmentDrift` / `Tampered`)
- Cross-platform CI matrix (ubuntu + macos + windows) + published-tarball smoke test
- Drift warnings on replay (`EnvironmentDrift` surfaced through CLI/result)
- `lattice repro --unsafe-unredacted` opt-in flag
- Cost histogram (mean/p50/p95/max) in `lattice eval` reports
- Vitest-compatible JSON/JUnit reporter for `lattice eval`
- Mid-stream tripwire abort
- YAML/JSON contract file loaders
- `lattice receipt diff` subcommand
- KMS adapter shape (AWS KMS / GCP KMS / OS keyring) for `ReceiptSigner`

---

## Out of Scope

- **Hosted control plane / hosted receipt store** — out of scope per PROJECT.md; v1.x stays SDK-only.
- **Blockchain or Rekor anchoring** — operational complexity not justified for the v1.1 wedge.
- **ZK proofs of inference** — wrong threat model for a capability runtime.
- **Cross-provider bit-identity claims** — physically impossible across non-deterministic LLM providers.
- **Per-chunk streaming signatures** — no meaningful security gain; mid-stream tripwire abort defers to v1.2.
- **Plaintext prompts inside receipts** — receipts only ever contain hashes and redacted fields.
- **KMS built into Lattice** — runtime accepts a `ReceiptSigner` interface; users wire their own KMS.
- **Mandatory contracts on every `ai.run`** — `contract` field stays optional; v1.0 callers compile unchanged.
- **Graph DSL / multi-agent handoff framework** — out of scope per PROJECT.md.

---

## Traceability

Mapped to phases by the roadmapper (2026-05-11). See `.planning/ROADMAP.md` for phase details.

| REQ-ID | Phase |
|--------|-------|
| CONTRACT-01 | Phase 7 |
| CONTRACT-02 | Phase 7 |
| CONTRACT-03 | Phase 7 |
| CONTRACT-04 | Phase 7 |
| CONTRACT-05 | Phase 7 |
| CONTRACT-06 | Phase 7 |
| COST-01 | Phase 7 |
| COST-02 | Phase 7 |
| COST-03 | Phase 7 |
| TRIP-01 | Phase 8 |
| TRIP-02 | Phase 8 |
| TRIP-03 | Phase 8 |
| TRIP-04 | Phase 8 |
| TRIP-05 | Phase 8 |
| RECEIPT-01 | Phase 9 |
| RECEIPT-02 | Phase 9 |
| RECEIPT-03 | Phase 9 |
| RECEIPT-04 | Phase 9 |
| RECEIPT-05 | Phase 9 |
| RECEIPT-06 | Phase 9 |
| RECEIPT-07 | Phase 9 |
| RECEIPT-08 | Phase 9 |
| RECEIPT-10 | Phase 9 |
| RECEIPT-09 | Phase 10 |
| CLI-01 | Phase 11 |
| CLI-02 | Phase 11 |
| CLI-03 | Phase 11 |
| CLI-04 | Phase 11 |
| CLI-05 | Phase 11 |
| CLI-06 | Phase 11 |
| EVAL-01 | Phase 12 |
| EVAL-02 | Phase 12 |
| EVAL-03 | Phase 12 |
| EVAL-04 | Phase 12 |
| EVAL-05 | Phase 12 |
| EVAL-06 | Phase 12 |

**Coverage:** 36/36 v1.1 REQ-IDs mapped. No orphans, no duplicates. Phase 13 is a cross-cutting integration/validation phase that exercises all categories end-to-end without owning any single REQ-ID exclusively.
