# Roadmap: Lattice

## Milestones

- Complete: **v1.0 milestone** — shipped 2026-04-22. See `.planning/milestones/v1.0-ROADMAP.md`.
- In progress: **v1.1 Capability Receipts** — Phases 7-13.

## Current Work

**Milestone:** v1.1 Capability Receipts
**Goal:** Make every Lattice run contract-bound, signed, and reproducible — turning a thumbs-down in prod into a deterministic local repro and a CI-gated regression check.

## Phases

Phase numbering continues from v1.0 (which ended at Phase 6). v1.1 starts at Phase 7.

- [ ] **Phase 7: Capability Contracts, Pre-flight Proof, and Cost Accounting** — Optional `contract` field on `ai.run` with budget/qualityFloor, deterministic pre-flight refusal with typed `no-contract-match`, and normalized `usage` on every `RunResult`.
- [ ] **Phase 8: Tripwire Invariants with Terminal Semantics** — Fluent invariant builder, post-execution evaluation stage, typed `tripwire-violated` failures that the fallback chain refuses to retry.
- [ ] **Phase 9: Canonical JSON, Ed25519 Signing, and Receipt Issuance** — RFC 8785 JCS canonicalization, redact-then-sign DSSE envelope, `kid`/`KeySet` rotation surface, pure `verifyReceipt`, receipts on success and failure.
- [ ] **Phase 10: Receipts inside the Replay Envelope** — Embed `receipt?` and `contract?` into `ReplayEnvelope` so a single receipt is sufficient to materialize an offline replay.
- [ ] **Phase 11: lattice CLI — repro and verify** — New `packages/lattice-cli` workspace shipping the `lattice` bin via citty with lazy subcommands for `lattice repro` and `lattice verify`.
- [ ] **Phase 12: lattice eval CI Gate** — `lattice eval` discovers receipts, replays via `replayOffline`, gates baseline-relative cost/quality regressions with judge caching and layered determinism classes.
- [ ] **Phase 13: Showcase Update and Milestone Validation** — Extend the work-inbox showcase end-to-end across contracts, tripwires, receipts, repro, and eval; close v1.1.

## Phase Details

### Phase 7: Capability Contracts, Pre-flight Proof, and Cost Accounting
**Goal**: Developers can attach a `contract` to `ai.run` and the deterministic router refuses to execute when no candidate route can satisfy budget, modality, privacy, or quality-floor constraints; every run reports normalized cost and token usage.
**Depends on**: Nothing new — builds on v1.0 router, capability catalog, and provider adapters.
**Requirements**: CONTRACT-01, CONTRACT-02, CONTRACT-03, CONTRACT-04, CONTRACT-05, CONTRACT-06, COST-01, COST-02, COST-03
**Success Criteria** (what must be TRUE):
  1. A developer can attach `contract: { budget, invariants, qualityFloor }` to `ai.run` and existing v1.0 callers without a contract compile and run unchanged.
  2. When no candidate route can satisfy the contract, the run resolves with a typed `RunFailure` of kind `no-contract-match` and the rejection taxonomy in `noRouteReasons` distinguishes `contract-budget-exceeded`, `contract-quality-floor`, `contract-modality-missing`, and `contract-privacy-mismatch`.
  3. Every `RunResult` (success and failure) exposes a `usage` field shaped `{ promptTokens, completionTokens, costUsd }` populated consistently by the openai, openai-compat, and ai-sdk adapters.
  4. Pre-flight contract proof reads adapter cost metadata from the capability catalog to estimate cost before execution, so budget rejections happen without tokens being spent.
**Plans**: 4 plans
Plans:
- [ ] 07-01-PLAN.md — Contract types, capability catalog pricing, and Usage shape (Wave 1)
- [ ] 07-02-PLAN.md — Pre-flight evaluator + router integration with contract reject codes (Wave 2)
- [ ] 07-03-PLAN.md — Adapter usage normalization + RunResult.usage + NoContractMatchError (Wave 2)
- [ ] 07-04-PLAN.md — Runtime wiring through ai.run, classification, and public exports (Wave 3)

### Phase 8: Tripwire Invariants with Terminal Semantics
**Goal**: Developers can declare semantic/policy invariants on a contract using a fluent Standard Schema builder, the runtime evaluates them post-execution as a distinct plan stage, and violations are typed terminal failures that the fallback chain refuses to retry.
**Depends on**: Phase 7 (contract carrier and verdict shape; `terminal: true` semantics must be locked before receipts so the verdict is consistent).
**Requirements**: TRIP-01, TRIP-02, TRIP-03, TRIP-04, TRIP-05
**Success Criteria** (what must be TRUE):
  1. A developer can declare tripwire invariants via `inv.mustCite()`, `inv.fieldFromTable()`, `inv.noPII()`, and `inv.matches(schema)` and have them evaluated against the validated output.
  2. The execution plan exposes a `"tripwire"` stage sitting between output schema validation and result return so tripwire timing is inspectable.
  3. A tripwire violation surfaces a typed `RunFailure` of kind `tripwire-violated` carrying the violating invariant id and structured evidence, and the existing fallback chain treats it as terminal (no retries, no fallback).
  4. The contract verdict that downstream receipts will sign is fully determined by the combined output of pre-flight proof plus tripwire evaluation, with no other source of verdict truth.
**Plans**: TBD

### Phase 9: Canonical JSON, Ed25519 Signing, and Receipt Issuance
**Goal**: Every `ai.run` (success or failure) issues a `CapabilityReceipt` that is RFC 8785-canonicalized, signed over the redacted form with Node 24 WebCrypto Ed25519 in a DSSE-shaped envelope, carries `kid` plus model.observed fingerprint, and can be verified by a pure `verifyReceipt` against a `KeySet`.
**Depends on**: Phase 7 (contract + cost shape inside the receipt), Phase 8 (tripwire verdict inside the receipt).
**Requirements**: RECEIPT-01, RECEIPT-02, RECEIPT-03, RECEIPT-04, RECEIPT-05, RECEIPT-06, RECEIPT-07, RECEIPT-08, RECEIPT-10
**Success Criteria** (what must be TRUE):
  1. The runtime emits a `CapabilityReceipt` covering receipt id, run id, plan hash, route choice, `model.requested`, `model.observed` fingerprint, `usage`, `contractVerdict`, input artifact hashes, output hashes, `redactionPolicyId`, `redactions[]` manifest, `kid`, and timestamp.
  2. Receipts are serialized via RFC 8785 JCS using `canonicalize@3.0.0` (I-JSON only, no raw floats), signed using Node 24 WebCrypto `crypto.subtle` Ed25519, and emitted in a DSSE-shaped envelope (`payloadType`, `payload`, `signatures[]`) with PAE pre-auth encoding.
  3. Redaction always runs before signing — the signed canonical form binds the redacted body, not the cleartext; the `redactions[]` manifest declares what was elided.
  4. `verifyReceipt(envelope, keySet)` is a pure function returning a typed success or typed verification failure, and accepts a `KeySet` whose entries can be `active | retired | revoked` looked up by `kid`.
  5. Receipts are emitted on both success and failure runs (failure receipts carry `contractVerdict: 'tripwire-violated' | 'no-contract-match' | 'execution-failed'`), and are produced only when `LatticeConfig.signer` is configured; when absent, receipts are not emitted.
**Plans**: TBD

### Phase 10: Receipts inside the Replay Envelope
**Goal**: A `ReplayEnvelope` carries optional `receipt` and `contract` fields so that a single receipt is sufficient to materialize an offline replay session deterministically.
**Depends on**: Phase 9 (receipt shape + signing).
**Requirements**: RECEIPT-09
**Success Criteria** (what must be TRUE):
  1. `ReplayEnvelope` accepts optional `receipt?` and `contract?` fields and round-trips through `createReplayEnvelope` / `replayOffline` without losing receipt verifiability.
  2. Given only a `CapabilityReceipt` and content-addressed artifact bodies, the runtime can materialize a `ReplayEnvelope` and run `replayOffline(envelope)` to a deterministic result whose output hashes match the receipt.
**Plans**: TBD

### Phase 11: lattice CLI — repro and verify
**Goal**: A new `packages/lattice-cli` workspace publishes the `lattice` bin with `repro` and `verify` subcommands that go through the runtime via public exports only; redaction defaults are inherited from the signed receipt.
**Depends on**: Phase 10 (envelope-receipt integration is what the CLI materializes).
**Requirements**: CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, CLI-06
**Success Criteria** (what must be TRUE):
  1. `packages/lattice-cli` exists as a workspace package, publishes a single `lattice` bin entry maintained by `tsdown` shebang detection, and depends on `lattice` only through its public exports (`workspace:*`).
  2. `lattice repro <receipt-id>` loads a receipt, verifies its signature, materializes a replay envelope from receipt plus content-addressed artifact bodies, runs `replayOffline`, and diffs the result against the receipt's `outputHashes`.
  3. `lattice verify <receipt-path>` verifies signature and structural integrity without running anything and prints a typed verdict.
  4. The CLI uses `citty@0.2.2` with lazy subcommand loading so `lattice repro` does not transitively load eval/judge dependencies, and a depcheck gate prevents the runtime package from importing CLI-only deps.
  5. CLI output is redacted by default — only the redacted fields from the signed receipt are surfaced; there is no `--unsafe-unredacted` flag in v1.1.
**Plans**: TBD

### Phase 12: lattice eval CI Gate
**Goal**: `lattice eval` walks a fixture directory of receipts, replays each via `replayOffline`, and gates baseline-relative cost-per-task and quality-floor regressions with judge caching, layered determinism classes, and a CI-friendly non-zero exit on regression.
**Depends on**: Phase 11 (CLI plumbing + `replayOffline` integration).
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04, EVAL-05, EVAL-06
**Success Criteria** (what must be TRUE):
  1. `lattice eval [--fixtures <dir>]` discovers receipts under `.lattice/receipts/`, replays each via `replayOffline`, and emits a structured JSON report on stdout.
  2. The gate compares this run's `usage.costUsd` and `qualityFloor` score against the last green baseline (baseline-relative, not absolute thresholds) and exits non-zero on any regression so CI fails the build.
  3. Quality-floor metrics that use an LLM judge run with `N=3` repetitions, aggregate via median to reduce judge variance, and cache outputs on disk by `hash(fixtureId, model_fingerprint, judge_prompt)` so reruns of the same baseline do not re-spend judge tokens.
  4. Quality-floor gates are layered by determinism class — exact (string/hash equality), then semantic-cheap (schema match), then semantic-expensive (LLM judge) — and failures on cheaper layers short-circuit.
**Plans**: TBD

### Phase 13: Showcase Update and Milestone Validation
**Goal**: The work-inbox showcase exercises contracts, tripwires, signed receipts, `lattice repro`, and `lattice eval` end-to-end against deterministic fixtures, and a milestone-level validation pass confirms every v1.1 requirement is satisfied by observable behavior.
**Depends on**: Phases 7-12.
**Requirements**: (cross-cutting integration — no new REQ-IDs; validates all 36 v1.1 REQ-IDs end-to-end)
**Success Criteria** (what must be TRUE):
  1. The work-inbox showcase declares a `contract`, intentionally triggers a tripwire on one fixture, captures a signed receipt for both success and failure paths, and runs them through `lattice repro`.
  2. A `lattice eval` invocation over the showcase's receipts emits a regression report that exits zero on the baseline and non-zero when a fixture is intentionally regressed.
  3. Every v1.1 requirement (CONTRACT, TRIP, COST, RECEIPT, CLI, EVAL) is exercised by at least one showcase or eval-fixture path and recorded in the milestone audit.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 → 8 → 9 → 10 → 11 → 12 → 13.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 7. Capability Contracts, Pre-flight Proof, and Cost Accounting | v1.1 | 0/TBD | Not started | - |
| 8. Tripwire Invariants with Terminal Semantics | v1.1 | 0/TBD | Not started | - |
| 9. Canonical JSON, Ed25519 Signing, and Receipt Issuance | v1.1 | 0/TBD | Not started | - |
| 10. Receipts inside the Replay Envelope | v1.1 | 0/TBD | Not started | - |
| 11. lattice CLI — repro and verify | v1.1 | 0/TBD | Not started | - |
| 12. lattice eval CI Gate | v1.1 | 0/TBD | Not started | - |
| 13. Showcase Update and Milestone Validation | v1.1 | 0/TBD | Not started | - |

## Completed Milestone Summary

| Milestone | Phases | Plans | Status | Completed |
| --- | ---: | ---: | --- | --- |
| v1.0 milestone | 6 | 11 | Complete | 2026-04-22 |

## Archive

- Requirements archive: `.planning/milestones/v1.0-REQUIREMENTS.md`
- Roadmap archive: `.planning/milestones/v1.0-ROADMAP.md`
- Audit report: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- Phase artifacts: `.planning/milestones/v1.0-phases/`
