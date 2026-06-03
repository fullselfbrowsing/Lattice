# Lattice

## What This Is

Lattice is a TypeScript-first capability runtime SDK for AI applications. Developers describe the job, provide any mix of artifacts, declare desired outputs, and set policy constraints; Lattice handles provider routing, context packing, artifact transport, fallback, replay, and inspectable execution plans.

The product is for developers building multimodal AI features who do not want to wire together separate chat, image, transcription, speech, file, memory, routing, and provider abstractions by hand.

## Core Value

Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.

## Current State

**v1.2 FSB Integration + Agent Capability shipped 2026-05-31.** All 46 v1.2 requirements wired end-to-end (zero blockers, one documented non-blocking limitation V1.2-LIMITATION-1: native tool-use deferred to v1.3). 733 / 733 workspace tests passing (589 lattice core + 144 lattice-cli). v1.2 branch merged to `main` via PR #1; tag `v1.2.0` cut and pushed.

**Next: v1.3 (planned).** Carryforward themes from v1.2: native tool-use across providers via an additive `ProviderAdapter` extension that preserves INV-03 parity, `lattice eval --agent` CLI subcommand wrapping the existing `evalAgentRun` kernel, multi-scenario agent-loop showcase, KMS adapter shapes for `ReceiptSigner`, lineage merkle root signed inside receipts, `lattice receipt diff` subcommand, OpenTelemetry exporter for `RunEventKind`.

## Shipped Milestones

- **v1.0 milestone** (2026-04-22) — Foundation: package/API spine, artifact lifecycle, deterministic planning, sessions+context+packaging, tools+replay+observability, work-inbox showcase.
- **v1.1 Capability Receipts** (2026-05-12) — Contract-bound, signed, reproducible runs: contracts + pre-flight + cost, tripwire invariants, RFC 8785 + Ed25519 signed receipts with `kid`/`KeySet`, replay envelope integration, `lattice` CLI (`repro`/`verify`/`eval`), sidecar support, end-to-end showcase exercising all 36 REQ-IDs.
- **v1.2 FSB Integration + Agent Capability** (2026-05-31) — Five FSB-integration extensions backfilled onto canonical Lattice (Phases 14-18): public surface index + packaging readiness, receipt v1.1 schema extension, tripwire band pipeline + lifecycle events, step-transition tracing + checkpoint hook, 5 new provider adapters (Anthropic, Gemini, xAI, OpenRouter, LM Studio) + INV-03 parity smoke across 7 providers, survivability adapter contract. Plus a runtime-agnostic single-agent capability (Phases 19-22): `ai.runAgent(intent)` with uniform tool-use across 7 providers + per-iteration signed receipts + SAFETY-band veto, pluggable `AgentHost` with scheduler / transport / storage seams + recovery markers closing v1.1 TRACE-EXT-01, five agent infrastructure primitives (cost / transcript / goal-progress / action-history / permission-context), `examples/agent-loop` showcase + `evalAgentRun` regression gate. Brand identity also shipped (mark + wordmark + app icon + favicons + social card + animated spin GIF, generated from a parametric 3D renderer).

## Requirements

### Validated

- [x] Phase 1 package/API spine: named `createAI`, `artifact`, and `output` exports; typed `ai.run({ task, artifacts, outputs, policy, session })`; `ai.session(id)` placeholder references; Lattice-owned config, provider, policy, storage, tracing, artifact, session, result, and output contract types; Standard Schema/Zod-compatible output inference and validation.
- [x] Phase 2 artifact lifecycle and storage: text, JSON, file, image, audio, document, URL, tool-result, and derived artifacts; payload-free refs; metadata, privacy, size, storage refs, fingerprints, and lineage; memory/local development stores; runtime/output/public package artifact boundaries.
- [x] Phase 3 deterministic planning and execution: `ai.plan(...)`, stable execution-plan JSON, capability catalog routing, deterministic hard filters/scoring, fallback chains, typed no-route outcomes, fake providers, provider-independent execution, and typed run events.
- [x] Phase 4 context, sessions, and provider packaging: memory session store, turns/artifacts/plan history/branching, context packs with reasons and trust labels, progressive overrides, policy-safe provider packaging, and narrow OpenAI/OpenAI-compatible/AI SDK adapter factories.
- [x] Phase 5 tools, replay, and observability: Standard Schema local tools, explicit MCP-like tool imports, artifact-backed tool results, replay envelopes, offline replay, live rerun warnings, default redaction, and structured event/tracing hooks.
- [x] Phase 6 work-inbox showcase: executable public API example with message, photo, transcript, PDF/policy artifacts, structured action output, route/context/packaging inspection, offline replay, and adversarial fixtures.
- [x] Phase 7 capability contracts, pre-flight proof, and cost accounting: optional `contract` on `ai.run` (budget + qualityFloor + reserved invariants), pure preflight evaluator wired into the deterministic router, typed `no-contract-match` failure with `noRouteReasons[]`, normalized `Usage` on every `RunSuccess` and `RunFailure`, per-1k pricing on capability catalog entries, openai-compat pricing constructor option, and `createFakeProvider({ capabilities })`. (CONTRACT-01..06 + COST-01..03)
- [x] Phase 8 tripwire invariants with terminal semantics: fluent `inv` builder (`mustCite`, `fieldFromTable`, `noPII`, `matches`) backed by Standard Schema; pure `evaluateTripwires` kernel with `defaultPiiDetectors` (email, US SSN, Luhn credit card, US phone); `"tripwire"` execution stage between validation and persistence; `TripwireViolationError` carrying `terminal: true` with structured `TripwireEvidence`; `isTerminal()` predicate consulted by the fallback chain so violations are NOT retried; `usage` populated on tripwire failures. (TRIP-01..05)
- [x] Phase 9 canonical JSON, Ed25519 signing, and receipt issuance: signed `CapabilityReceipt` emitted on every `ai.run` (success and failure) when `LatticeConfig.signer` is configured; RFC 8785 JCS canonicalization via `canonicalize@3.0.0`; DSSE-shaped envelope with PAE; Node 24 WebCrypto Ed25519 (`@noble/ed25519@3.1.0` parity oracle dev-only); redact-then-sign ordering enforced structurally with `redactions[]` manifest and `redactionPolicyId` signed; `kid` + `KeySet` (active/retired/revoked); pure `verifyReceipt` returning typed `VerifyResult` with 6 error kinds; `costUsd` serialized as I-JSON string inside receipts. (RECEIPT-01..08, RECEIPT-10)
- [x] Phase 10 receipts inside the replay envelope: `ReplayEnvelope.receipt?` and `ReplayEnvelope.contract?` additive optional fields (type-only imports); pure async `materializeReplayEnvelope(receipt, { artifactLoader, keySet, ... })` that verifies the receipt BEFORE loading any artifacts; `MaterializationError` discriminated by kind `verify-failed | artifact-load-failed | envelope-malformed`; round-trip property test asserts `createReceipt → materializeReplayEnvelope → replayOffline` preserves `outputHash`. (RECEIPT-09)
- [x] Phase 11 lattice CLI - repro and verify: new `packages/lattice-cli` workspace package with `lattice` bin via tsdown shebang detection; `citty@0.2.2` lazy subcommand loading; `lattice repro <id-or-path>` runs load -> verify -> materialize -> replayOffline -> diff outputHash with exit codes 0/1/2; `lattice verify <path>` runs signature + structural verification with single-line OK/FAIL output; filesystem artifact loader reads `.lattice/fixtures/<sha256>.bin`; depcheck gate prevents CLI deps from entering lattice runtime; redacted-by-default (no `--unsafe-unredacted` flag in v1.1); handler tests use mock argv, bin smoke test spawns built binary. (CLI-01..06)
- [x] Phase 12 lattice eval CI gate: new `lattice eval` lazy subcommand walks `.lattice/receipts/`, replays each via `replayOffline`, gates layered determinism (Exact -> Semantic-cheap no-op -> Semantic-expensive judge with N=3 median) and baseline-relative cost / quality regressions; `--init-baseline` flag writes a fresh baseline; disk-backed judge cache keyed by `hash(fixtureId, model_fingerprint, judge_prompt, output_canonicalized)`; stdout emits single-line JSON `EvalRunReport` (with reserved `tripwireOutcomes: []` forward-compat slot); exit codes 0/1/2 deterministic; configurable cost (default 10%) and quality (default 0.05) tolerances. (EVAL-01..06)
- [x] Phase 13 showcase + milestone validation: `examples/work-inbox` refactored into 3 deterministic scenarios (success / tripwire-violated / no-contract-match) demonstrating contract + signed receipts + redaction-aware verification end-to-end; ephemeral Ed25519 keypair generated per run; receipts written to `.lattice/receipts/`, content-addressed artifacts to `.lattice/fixtures/<sha256>.bin`; copy-pastable `lattice verify` / `lattice repro` / `lattice eval` next-step prompts; `packages/lattice-cli/test/showcase-e2e.test.ts` spawns showcase + CLI bins (6 e2e cases, 105/105 total tests passing); 36-row REQ-coverage matrix in 13-02-SUMMARY.md confirms every v1.1 requirement has an observable behavior. Known v1.1 boundary: `lattice repro` and `lattice eval` cannot fully reconstruct a `RunIntent` from a receipt alone (no embedded task/outputs/policy); the test asserts the documented `execution_unavailable` behavior with forward-compat for v1.2 sidecar-outputs. (cross-cutting integration; validates all 36 v1.1 REQ-IDs)

- [x] v1.2 Track A FSB Integration (Phases 14-18): public surface index + packaging readiness (PKG-01, INDEX-01..05); receipt v1.1 schema extension (RECEIPT-EXT-01..03) with six step-marker fields and auto-bumping `createReceipt` heuristic; tripwire band pipeline (BAND-01..05) with SAFETY / OBSERVABILITY / EXTENSION priority bands, per-handler `budgetMs` race-with-log, frozen contexts, irreversible freeze, matcher regex filter; HookLifecycleEvent vocabulary (LIFECYCLE-01); step-transition tracing additive literal (TRACE-01); checkpoint hook factory with one-event-and-one-receipt-per-invocation guarantee (CHECKPOINT-01..04); five new provider adapters (Anthropic Messages, Gemini generateContent, xAI, OpenRouter, LM Studio) (PROV-01..05); INV-03 7-provider parity smoke (PARITY-01); survivability adapter contract with `SerializedSnapshot` round-trip and `ResumePolicy` taxonomy (SURV-01..04); recovery / eviction-resume markers in `RunEventKind` paired with `SurvivabilityAdapter` (TRACE-EXT-01 v1.1 carryforward closed).
- [x] v1.2 Track B Agent Capability (Phases 19-22): delegation surface policy flip from "multi-agent crews: Out of Scope" to "agent execution: First-class, runtime-agnostic" (DELEG-01); `ai.runAgent(intent)` on the runtime returned by `createAI` driving a uniform prompt-reencoded tool-use protocol across all 7 provider adapters, per-iteration step.transition emission for observability composition with `createCheckpointHook`, SAFETY-band hook veto before provider invocation (AGENT-01..04); `AgentHost` interface with three optional seams (scheduler, transport, storage) + `createNoopAgentHost` reference impl + storage composition with `SurvivabilityAdapter` for cross-process resume (HOST-01..03); five agent infrastructure primitives — cost tracker with `contract.budget` awareness, transcript store with filtered tail reads, goal-progress tracker with stuck-detection contract, action-history dedup with `STUCK_REASONS` vocabulary, permission context with per-tool / per-iteration / per-resource gating and SAFETY-band hook helper (AGENT-INFRA-01..04, PERM-01); `examples/agent-loop` showcase exercising every Track B surface with real Ed25519 signing and 3 per-iteration receipts verified, plus `evalAgentRun` regression-gate kernel for iterations-to-goal and total cost (SHOWCASE-AGENT-01..02).

### Active

v1.3 active requirements are TBD. Run `/gsd-new-milestone` to scope v1.3 and create the next `REQUIREMENTS.md`. Known carryforward themes from v1.2:

- Native tool-use across providers via an additive `ProviderAdapter` extension that preserves the INV-03 7-provider parity contract.
- `lattice eval --agent` CLI subcommand wrapping the existing `evalAgentRun` kernel.
- Multi-scenario agent-loop showcase (tripwire / stall / budget-exceeded variants).
- KMS adapter shapes for `ReceiptSigner`.
- Lineage merkle root signed inside receipts.
- `lattice receipt diff` subcommand.
- OpenTelemetry exporter for `RunEventKind`.
- Streaming for the 5 new Phase 17 provider adapters (Anthropic / Gemini / xAI / OpenRouter / LM Studio).
- OpenRouter multi-model routing / fallback array.
- LM Studio latency-tail diagnostics module.
- Anthropic / Gemini multimodal request shaping.
- Mainline npm publish of `@fullselfbrowsing/lattice@1.2.0` (waiting on first external consumer ask).

### v1.1-to-v1.2 carryforward outcomes (closed)

- `lattice repro` / `lattice eval` replay round-trip via sidecar — closed by v1.1 sub-phase 13.1 before v1.2 opened.
- `RunEventKind` recovery / eviction-resume markers paired with `SurvivabilityAdapter` — closed by v1.2 Phase 20 (TRACE-EXT-01).

### Out of Scope

- Hosted control plane — the first version should prove the runtime SDK before adding hosted infrastructure.
- Graph DSL — the v0.1 product should feel smaller than orchestration frameworks and avoid making users design graphs first.
- Multi-agent handoff framework (parent-child loops, summary-return, cache-prefix sharing, rate-limit-group coordination) — multi-agent orchestration is not the initial differentiator. **Updated 2026-05-31 for v1.2:** single-agent execution is now in scope (Track B / DELEG-01); multi-agent stays out of scope.
- Building 100 custom provider adapters from scratch — broad provider coverage should initially lean on an existing provider/routing surface where practical.
- Frontend hook library as the center of the product — UI bindings can exist, but the core bet is the runtime.
- Opaque AI-selected routing in v1 — routing should be deterministic and inspectable first.

## Context

As of April 2026, comparable tools each cover part of the desired surface:

- Vercel AI SDK offers a broad provider-agnostic TypeScript toolkit with provider/model management, multimodal generation, agents, subagents, and memory approaches, but it remains a toolkit with multiple explicit surfaces.
- TanStack AI is philosophically close on the TypeScript side, emphasizing a lightweight core, runtime adapter switching, multimodal content, generation hooks, and realtime voice.
- LiteLLM is strong routing infrastructure with a common interface across many providers plus fallback, context-window fallback, image generation, transcription, speech, and MCP gateway capabilities.
- LangChain/LangGraph and OpenAI Agents SDK are strong on context, orchestration, sessions, compaction, tracing, and voice, but they do not provide the tiny universal capability runtime described here.

The missing category is a capability-first runtime SDK rather than another provider wrapper. The developer should provide the task, artifacts, outputs, budget, privacy, latency, and quality constraints; Lattice should build a context pack, prepare artifacts for the chosen providers, execute one or more model stages, handle fallbacks, and return a structured result plus an inspectable plan.

The wedge is the multimodal work inbox: support, insurance, logistics, field operations, healthcare administration, recruiting, and creator tools all need to process combinations of user messages, screenshots/photos, voice notes/call recordings, and PDFs/manuals/policies into answers, structured actions, and sometimes speech.

Phase 1 completed on 2026-04-22. Lattice now has a verified TypeScript package foundation with named public exports, provider-neutral runtime/config/policy/artifact/session contracts, typed multi-output result inference, Standard Schema/Zod validation, a Phase 1 `ai.run` skeleton, and an `ai.session(id)` placeholder.

Phase 2 completed on 2026-04-22. Lattice now has a verified artifact lifecycle model with synchronous constructors, payload-free refs, metadata/privacy/storage/fingerprint fields, lineage descriptors, memory and local filesystem development stores, and artifact refs wired through provider, runtime, output, and public package boundaries.

Phase 3 completed on 2026-04-22. Lattice now has deterministic dry-run planning, capability catalog routing, fallback/no-route behavior, stable execution plan JSON, fake providers, provider-independent execution, and typed run events.

Phase 4 completed on 2026-04-22. Lattice now has explicit memory sessions, context packs, progressive runtime overrides, policy-safe provider packaging, and narrow provider adapter factories.

Phase 5 completed on 2026-04-22. Lattice now has schema-validated local/MCP-like tools, artifact-backed tool results, replay envelopes, offline/live replay helpers, default redaction, and structured event observability.

Phase 6 completed on 2026-04-22. Lattice now includes an executable multimodal work-inbox showcase using the public package entrypoint and deterministic fixtures.

## Constraints

- **Language**: TypeScript-first — closest competitors and early adopters are strongest in the app/product integration ecosystem.
- **Public API**: Capability-first and small — the beginner path should be one `run` call with artifacts, outputs, and policy.
- **Routing**: Deterministic in v0.1 — use capability matrix plus policy scoring and fallback rules before considering opaque AI-chosen routing.
- **Provider surface**: Reuse existing routing/provider infrastructure where it accelerates learning — provider breadth is not the main differentiation.
- **Protocol**: MCP-native where tools/context integration is needed — avoid inventing a proprietary plugin protocol.
- **Architecture**: One umbrella package with modular internals — easy install should coexist with tree-shakable adapters and optional bindings.
- **Transparency**: Every run must be inspectable — model choices, context packing, summaries, artifact transforms, cost, and latency must be explainable.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build Lattice as a capability-first runtime SDK | The missing product is a layer above provider adapters and media APIs, not another wrapper around one model API. | — Pending |
| Start TypeScript-first | The strongest adjacent products and app integration pain are in the TypeScript ecosystem. | — Pending |
| Use a deterministic router for v0.1 | Inspectability and trust matter more than magical but opaque routing early. | Validated in Phase 3: capability catalog routing, hard filters, scoring, fallback chains, and no-route outcomes are implemented. |
| Make artifacts the universal content model | Text, image, audio, video, PDF, JSON, and tool results need the same lifecycle: reference, transform, package, reuse, trace. | Validated in Phase 2: artifact constructors, refs, metadata, storage, fingerprints, lineage, and runtime/output boundaries are implemented. |
| Treat context management as built-in runtime behavior | Manual trimming, summarizer middleware, and developer-managed file stuffing are core pain points this product should remove. | Validated in Phase 4: context packs record included, summarized, archived, omitted, reasons, estimates, and trust labels. |
| Focus the first showcase on the multimodal work inbox | It exercises text, image, audio, files, structured outputs, policy routing, artifact packaging, and optional speech in one understandable workflow. | Validated in Phase 6: executable work-inbox example and fixtures are included. |
| Keep Phase 1 sessions as references only | Full persistence, context packs, summaries, branching, and replay belong in later phases; Phase 1 only needs a stable public placeholder. | `ai.session(id)` returns a `SessionRef` and can be passed into `ai.run`. |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-31 — Milestone v1.2 (FSB Integration + Agent Capability) opened*
