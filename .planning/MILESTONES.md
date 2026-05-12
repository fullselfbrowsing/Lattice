# Milestones

## v1.1 Capability Receipts (Shipped: 2026-05-12)

**Phases completed:** 9 phases, 24 plans, 21 tasks

**Key accomplishments:**

- 1. [Rule 2 - Critical functionality] `effectivePer1kPricing` exported, not internal-only
- 1. [Rule 2 - Strengthened test coverage] Added `openai-compat input_tokens/output_tokens` variant test
- 1. [Rule 3 - Blocking issue] Closed Plan 07-03's 7 deferred tsc errors in `validate.ts` and `replay.ts` in addition to `create-ai.ts`
- 1. [Rule 3 - Blocking] Phase 7 tests referenced the old InvariantDeclaration placeholder shape
- 1. [Rule 1 - Bug] T6 must-cite test originally declared only `text` in outputs
- WebCrypto Ed25519 signer with in-memory factory + DSSE v1.0 envelope encoder/decoder + @noble/ed25519 parity oracle defending against silent Node WebCrypto regressions.
- 1. [Rule 1 - Bug] Updated stale cli.test.ts verify smoke assertion
- 1. [Rule 1 - Bug] ArtifactInput shape in plan example was incomplete
- 1. [Rule 3 - Blocker] EvalConfig missing artifactsDir and judgePrompt fields
- stdout (programmatic consumers):
- Refactored examples/work-inbox/ from a single v1.0 script into a contract-aware three-scenario v1.1 demo (success / tripwire / no-contract-match) that emits signed Ed25519 receipts + content-addressed input artifacts under .lattice/ for Plan 13-02 to ingest.
- Added a single Vitest end-to-end integration test that spawns the work-inbox showcase + the built `lattice` CLI bin for verify / repro / eval / eval --init-baseline / artificial-regression-flip, asserting every observable v1.1 contract and documenting the Phase 10 replay-failed boundary as an explicit forward-compat assertion.
- Strict JSON sidecar loader (loadSidecar / applySidecar) plus a sidecar-aware receipt walker (walkReceiptsWithSidecars) that pair each receipt with its `{ task, outputs, policy, contract }` quadruple for replay reconstruction — the v1.1 primitives Plans 02 and 03 will wire into `lattice repro` and `lattice eval`.
- Wires the Plan 01 sidecar primitives into `lattice repro` and `lattice eval` so the v1.1 audit's replay-failed forward-compat branch and the unreachable cost-regression gate both close: `repro` now reaches `verdict=match` when a sidecar is present, and `eval`'s regression gate actually fires for sidecar-paired fixtures.
- Wires the Plan 01+02 sidecar primitives into the `examples/work-inbox` showcase end-to-end and flips the two `showcase-e2e.test.ts` forward-compat assertions to HARD assertions so the v1.1 audit's `replay-failed` boundary and the unreachable cost-regression gate are both observably closed. V1.1-LIMITATION-1 and V1.1-LIMITATION-2 from `13-02-SUMMARY.md` are now resolved.
- Fourth work-inbox scenario declares a qualityFloor contract whose receipt contractHash provably binds the qualityFloor field, and exercises openai/openai-compat/ai-sdk adapters end-to-end so all three normalized Usage shapes (catalog-priced, caller-priced, null-cost) are observable in stdout.
- Showcase-e2e now hard-asserts the quality-floor receipt's contractHash matches the canonicalized showcase hash (CONTRACT-03), and two new sibling cases exercise runJudgeWithN with a deterministic stub to prove N=3 median aggregation (EVAL-03) and judge-cache short-circuit on the second invocation (EVAL-04).

---

## v1.0 milestone (Shipped: 2026-04-22)

**Phases completed:** 6 phases, 11 plans, 16 tasks

**Key accomplishments:**

- ESM-first pnpm workspace package named `lattice` with strict TypeScript 6, tsdown build output, Vitest smoke coverage, and package declaration checks
- Provider-neutral runtime config contracts with Phase 1 artifact helpers and tested normalization behavior
- Named output maps with Standard Schema validation and typed RunResult success/failure unions
- createAI runtime facade with named lattice exports, fixture adapter validation, and package declaration inference tests
- Provider-neutral artifact records with synchronous constructors, cheap metadata defaults, payload-free refs, and descriptor-only lineage.
- Development artifact stores with metadata-only refs, payload reloads, SHA-256 fingerprints, and inspectable filesystem fixtures.
- Public artifact lifecycle APIs with payload-free generated artifacts across provider, runtime, output, and package type boundaries.
- Deterministic planning and execution with `ai.plan`, capability catalog routing, budget/privacy filters, fallback execution, no-route results, fake providers, and typed run events.
- Context/session/provider packaging runtime with memory sessions, context packs, progressive overrides, per-attempt provider packaging, OpenAI-compatible usage capture, and narrow adapter factories.
- Tools, replay, and observability with Standard Schema tool validation, MCP-like tool import, runtime tool events, replay envelopes, offline/live replay, and default redaction.
- Executable work-inbox showcase using the public package entrypoint with multimodal fixtures, route/context/packaging inspection, structured action output, and offline replay.

---
