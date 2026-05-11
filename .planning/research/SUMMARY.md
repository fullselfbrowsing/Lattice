# Project Research Summary — v1.1 Capability Receipts

**Project:** Lattice
**Milestone:** v1.1 — Capability Receipts
**Domain:** TypeScript capability-runtime SDK; attestation, contracts, replay, and CI regression gate subsystem
**Researched:** 2026-05-11
**Confidence:** HIGH (Stack, Architecture, Pitfalls); MEDIUM-HIGH (Features)

> Scope note: this summary supersedes the v1.0 baseline summary. It synthesizes research for the v1.1 additions only — Capability Contracts on `ai.run`, pre-flight contract proof, tripwire invariants, signed Ed25519 receipts, the `lattice` CLI (`repro`, `verify`, `eval`), and the CI regression gate. The v1.0 runtime is a fixed foundation.

## Executive Summary

v1.1 turns every `ai.run` into a contract-bound, signed, and reproducible operation. The research converges on a small, opinionated stack on top of the existing v1.0 runtime: Node 24 WebCrypto Ed25519 for signing (zero new runtime crypto dependency), `canonicalize@3.0.0` for RFC 8785 JCS canonicalization, `citty@0.2.2` for a tiny ESM-only CLI with lazy subcommand loading, and Standard Schema-shaped invariants reusing the validator interface already established for outputs and tools. Receipts adopt a DSSE-shaped envelope (no `@sigstore/*` runtime dependencies) and a separate `packages/lattice-cli` workspace so the runtime stays portable to workers/edge while the CLI owns `fs`/`process` concerns.

The recommended approach is to prove the type spine before the cryptography, and the cryptography before the CLI. Contracts and pre-flight proof slot cleanly into the existing deterministic router as additional `RouteRejectReason` codes — no new orchestrator branches. Tripwires extend `validateOutputMap` as a post-schema decorator stage and define terminal-vs-transient semantics that the existing fallback chain must honor. Receipts are emitted on both success and failure (including tripwire abort), sign over the redacted canonical form (never the cleartext), include a `kid` for rotation and an `observed` model fingerprint distinct from the requested model id, and embed inside the existing `ReplayEnvelope`. The CLI is a thin wrapper that calls `replayOffline(envelope)` — never re-implements runtime logic — and `lattice eval` is a vitest-style CI driver that gates on baseline-relative cost/quality regressions, not absolute thresholds.

The dominant risks are all integrity-of-the-attestation risks. Signing before redaction creates permanent PII liability. `JSON.stringify` instead of RFC 8785 JCS produces signatures that silently fail to verify across Node 22/24/25/Bun/Deno. A missing `kid` plus single-key design makes rotation and revocation impossible. Tripwires without a `terminal: true` flag let the existing fallback chain retry violations and burn budget. LLM-judge variance (0.05-0.15 score spread) turns naive eval CI into flaky CI that gets disabled within two sprints. The mitigations are architectural and must land in the receipts/tripwire phases — they cannot be retrofitted once receipts are in the wild.

## Key Findings

### Recommended Stack

Only two runtime deps added: `citty@0.2.2` (CLI parser) and `canonicalize@3.0.0` (RFC 8785 JCS). One devDep `@noble/ed25519@3.1.0` as a cross-implementation parity oracle in tests. All signing and verification run through Node 24's built-in WebCrypto `crypto.subtle` Ed25519. Runtime stays ESM-only and `sideEffects: false`; the CLI is a separate workspace package.

- **Node 24 WebCrypto Ed25519** — primary signer/verifier. Zero new audit surface. Isomorphic with browsers, Workers, Deno Deploy for the `lattice/receipts` verify-only subpath export.
- **`canonicalize@3.0.0`** (RFC 8785 JCS) — deterministic JSON canonicalization. Zero deps; TypeScript types included; debuggable in CI logs (unlike CBOR).
- **DSSE-shaped envelope (no library)** — `{ payloadType, payload, signatures[] }` with PAE-style pre-auth encoding. ~80 LOC against WebCrypto + `canonicalize`.
- **`citty@0.2.2`** — declarative `defineCommand`, lazy subcommand loading, wraps `node:util.parseArgs`, ESM-only, ~3 KB gzip.
- **Standard Schema-shaped invariants** — reuses `@standard-schema/spec@1.1.0` already in catalog.
- **`tsdown` shebang auto-bin** — already in catalog at 0.21.9; `bin` field maintained automatically.
- **`vitest@4.1.5`** reused as the `lattice eval` assertion backbone.

### Expected Features

**Must-have:**
- Capability Contract on `ai.run` (budget + invariants + qualityFloor)
- Pre-flight contract proof — typed `NoContractMatchResult` with per-candidate rejection reasons
- Tripwire invariants — post-execution in v1.1 (mid-stream forward-compat), `terminal: true`
- Cost & token accounting on `RunResult.usage`
- RFC 8785 JCS canonical JSON serialization
- Signed Ed25519 Capability Receipts (DSSE envelope, redaction-aware, `redactionPolicyId` + `kid`)
- `verifyReceipt` pure function
- `lattice repro <receipt-id>` — load → verify → materialize replay envelope → `replayOffline` → diff
- `lattice eval` — replay receipt fixtures, regression gate vs last green main
- Drift warnings on replay — model-fingerprint divergence as typed `DriftWarning`

**Should-have differentiators:**
- Contract verdict as a typed result discriminant
- Receipts bind the artifact-lineage merkle root, not just the model call
- Tripwires reusable as eval scorers (shared `Invariant` interface)
- Receipts replayable across providers via deterministic router + `provider=fake`
- `redactionPolicyId` as a signed field

**Defer to v1.2+:** mid-stream tripwire abort; YAML/JSON contract file loaders; `lattice receipt diff`; iteration budgets in eval; per-candidate rejection-reason detail beyond basic taxonomy.

**Anti-features:** blockchain/Rekor anchoring; hosted receipt store; ZK proofs of inference; cross-provider bit-identity claims; per-chunk streaming signatures; plaintext prompts in receipts; KMS built into Lattice; mandatory contracts on every `ai.run`.

### Architecture Approach

Two new top-level domains inside `packages/lattice` (`contract/` and `receipts/`). A separate `packages/lattice-cli` workspace package owns the `lattice` bin. Runtime stays Node-version-agnostic and free of `fs`/`process`; CLI imports `lattice` via `workspace:*` through public APIs only.

**Major components:**
1. **`contract/`** (NEW) — `CapabilityContract`, `contract()` factory, `evaluateContractAgainstRoute`, `Tripwire` runtime, `runTripwires`.
2. **`receipts/`** (NEW) — `CapabilityReceipt` schema, `createReceipt`/`verifyReceipt`, Ed25519 signer, `canonical.ts`, receipt redactor.
3. **`routing/router.ts`** (MODIFIED) — `RouteRequest.contract?`; new `contract-*` reject codes.
4. **`outputs/validate.ts`** (MODIFIED) — optional `contract` param; post-schema tripwire stage.
5. **`replay/replay.ts`** (MODIFIED) — `ReplayEnvelope.contract?` and `ReplayEnvelope.receipt?`.
6. **`results/errors.ts`** (MODIFIED) — additive `NoContractMatchError` and `TripwireViolationError`; optional `receipt?` on results.
7. **`packages/lattice-cli/`** (NEW) — citty entry, `repro`/`verify`/`eval` subcommands.
8. **`tracing/tracing.ts`** (MODIFIED) — additive event kinds.

Backwards compatibility is strict: every new field optional; v1.0 consumer code compiles unchanged.

### Critical Pitfalls

Top 5:

1. **Signing before redaction.** Sign digest of `redact(canonicalize(run))`. Include `redactions[]` manifest inside the signed payload. Cannot be deferred.
2. **JCS / canonicalization drift across Node versions.** Pin `canonicalize@3.0.0` with RFC 8785 appendix vectors; I-JSON receipt schema (no floats); cross-version CI matrix; lint-ban `JSON.stringify` in signing path.
3. **Ed25519 key rotation without `kid`.** Day-one design: `kid` in signed payload; `KeySet` interface with `active | retired | revoked`; verifier looks up by `kid`.
4. **Tripwires burn budget on retries.** Define violations as `terminal: true`; thread budget through every retry; receipts record `costAtAbort` separately from `costAtSuccess`.
5. **Eval CI is flaky and gets disabled.** Layered gates by determinism class; N=3/N=5 medians; baseline-relative gating; cached judge outputs by `hash(fixture, model_fingerprint, judge_prompt)`.

## Cross-Cutting Decisions (must lock before phase planning)

1. Receipts sign over the redacted form, not the cleartext.
2. Canonical JSON is a substrate, not a feature. Single source in `receipts/canonical.ts`. I-JSON only.
3. Tripwire violations are `terminal: true` against the existing fallback chain.
4. Cost/token accounting on `RunResult.usage` ships in the contracts phase, not the receipts phase.
5. `kid` and `KeySet` ship from day one.
6. CLI lives in a separate `packages/lattice-cli` workspace.
7. Receipts emitted on both success and failure (failure receipts include `contractVerdict`).
8. Receipts pin both `model.requested` and `model.observed`.
9. Tripwire timing is post-execution in v1.1; mid-stream defers to v1.2.
10. CLI is a thin replay-envelope materializer; never re-implements runtime logic.

## Recommended Phase Ordering

Phase numbers continue from the v1.0 final phase 6.

```
Phase 7:  Contracts + Pre-flight + Cost Accounting
Phase 8:  Tripwire Runtime + terminal-flag fallback semantics
Phase 9:  Canonical JSON + Ed25519 + Receipt Issuance
Phase 10: Replay Envelope Integration
Phase 11: lattice CLI (packages/lattice-cli) — repro + verify
Phase 12: lattice eval CI Gate
Phase 13: Showcase Update + Milestone Validation
```

## Top Open Questions for Roadmapper

1. Does the existing v1.0 fallback chain centralize retry decisions in one function? (Affects Phase 8 scope.)
2. Where does cost/token data surface from each existing provider adapter? (Affects Phase 7 normalization sub-task.)
3. Is the existing redactor pure enough to invoke from the receipts module?
4. Canonical form for the lineage merkle root: binary merkle vs JCS-canonicalized JSON tree hash?
5. Terminal/transient discriminator shape on `LatticeRunError`?
6. `signer` on `createAI` only vs per-`ai.run` override?
7. Default receipt emission policy when signer present?
8. `.lattice/` storage convention and fixture-discovery rules for `lattice eval`?
9. Mid-stream tripwire scope: truly out of scope for v1.1?
10. Cross-platform CI cost budget: every PR vs merge-to-main only?

## Confidence Assessment

| Area | Confidence |
|------|------------|
| Stack | HIGH |
| Features | MEDIUM-HIGH |
| Architecture | HIGH |
| Pitfalls | HIGH (signing/repro/CLI), MEDIUM (tripwire DSL, eval CI) |

**Overall:** HIGH

---
*Research completed: 2026-05-11*
*Supersedes: v1.0 baseline summary for v1.1 milestone planning*
