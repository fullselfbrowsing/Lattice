# Changelog

All notable changes to `@fullselfbrowsing/lattice` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- v1.3.0 prepares the first public npm release under the `@fullselfbrowsing` scope. See `.changeset/v1.3.0-initial.md` for the full release notes.

## [1.2.0] - 2026-05-31

FSB Integration plus Agent Capability. Nine phases, 25 plans, 46 REQ-IDs WIRED end-to-end. Test posture 589 of 589 lattice tests passing, strict tsc clean.

### Added

- `ai.runAgent(intent)` runtime entrypoint with a uniform prompt-reencoded tool-use protocol across all seven provider adapters (Anthropic Messages, Gemini `generateContent`, xAI, OpenRouter, LM Studio, OpenAI, OpenAI-compatible).
- `AgentHost` interface with three optional seams (scheduler, transport, storage) plus `createNoopAgentHost` as the Node-test reference implementation.
- Five agent infrastructure primitives: budget-aware cost tracker (ok / warning / exceeded thresholds), transcript store with tailed reads and first-user-turn preservation, goal-progress tracker (progressing / stalled / regressed), action-history dedup (consecutive-identical and ping-pong patterns), permission context (per-tool, per-iteration, per-resource gating with a SAFETY-band hook helper).
- `SurvivabilityAdapter<TState>` contract describing what mid-flow context eviction means for any runtime. `SerializedSnapshot` JSON round-trips byte-equal and survives DSSE plus JCS round-trip with real Ed25519 when the payload embeds a v1.1 `ReceiptEnvelope`. `createNoopSurvivabilityAdapter` ships as the reference implementation.
- `createCheckpointHook` factory minting exactly one v1.1 receipt per invocation. Signer failure degrades to `metadata.mintError` without throwing upstream.
- `examples/agent-loop` showcase exercising every Track B surface end-to-end against a fake provider and a fake tool registry with real Ed25519 signing. Produces three per-iteration receipts that verify cleanly under the ephemeral KeySet.
- `evalAgentRun` regression-gate kernel covering iterations-to-goal and total-cost gates (11 cases).

### Changed

- `CapabilityReceiptBody.version` widens to `"lattice-receipt/v1" | "lattice-receipt/v1.1"` with auto-bump in `createReceipt` when any step-marker field is populated.
- `createHookPipeline` now ships SAFETY, OBSERVABILITY, and EXTENSION priority bands with per-handler `budgetMs` race-with-log, frozen contexts, irreversible freeze, and a `matcher` regex filter.
- `RunEventKind` gains `step.transition`, `recovery.start`, `recovery.complete`, and `recovery.failed` as additive literals, closing the v1.1 audit carryforward TRACE-EXT-01.
- Delegation policy in `AGENTS.md` flipped from "multi-agent crews: Out of Scope" to "agent execution: First-class, runtime-agnostic" for the single-agent surface.

### Security

- Multi-agent crews remain explicitly out of scope. SAFETY-band hooks can deny or abort an iteration before provider invocation.
- V1.2-LIMITATION-1 documented and deferred to v1.4. Native tool-use across providers is not exposed in v1.2 because admitting native `tools[]` cleanly requires an additive extension to the `ProviderAdapter` interface. The prompt-reencoded protocol preserves INV-03 seven-provider parity in the meantime.

## [1.1.0] - 2026-05-12

Capability Receipts. Nine phases, 24 plans, 21 tasks.

### Added

- WebCrypto Ed25519 signer with an in-memory factory, plus DSSE v1.0 envelope encoder and decoder, plus a `@noble/ed25519@3.1.0` parity oracle (dev-only) defending against silent Node WebCrypto regressions.
- `CapabilityReceipt` schema with RFC 8785 JCS canonicalization via `canonicalize@3.0.0`, signed `kid` field, and a `KeySet` rotation lifecycle covering `current`, `next`, and `retired` states.
- Pure `verifyReceipt` returning a typed `VerifyResult` discriminated union with six error kinds, never throwing across the verification boundary.
- Receipts threaded inside the replay envelope via `materializeReplayEnvelope`, closing the replay round-trip.
- `lattice` CLI shipped from `packages/lattice-cli` with `repro`, `verify`, and `eval` subcommands plus a disk-backed judge cache. See the sibling CHANGELOG for full CLI history.
- Tripwire invariants with terminal semantics (`mustCite`, `fieldFromTable`, `noPII`, `matches`) and a pure `evaluateTripwires` kernel.
- Sidecar primitives (`loadSidecar`, `applySidecar`, `walkReceiptsWithSidecars`) pairing each receipt with its `{ task, outputs, policy, contract }` quadruple for replay reconstruction.
- Four work-inbox showcase scenarios (success, tripwire, no-contract-match, qualityFloor contract) emitting signed Ed25519 receipts plus content-addressed input artifacts under `.lattice/`.

### Changed

- `usage.costUsd` serialized as an I-JSON string inside receipts, not a number, preserving exact decimal semantics across JCS canonicalization.
- Redact-then-sign ordering enforced structurally with a `redactions[]` manifest and a signed `redactionPolicyId`.

## [1.0.0] - 2026-04-22

Foundation. Six phases, 11 plans, 16 tasks.

### Added

- ESM-first pnpm workspace package with strict TypeScript 6, tsdown build output, Vitest smoke coverage, and package declaration checks.
- Provider-neutral runtime, config, policy, artifact, and session contracts.
- Typed `ai.run({ task, artifacts, outputs, policy, session })` with Standard Schema and Zod output inference.
- Provider-neutral artifact lifecycle covering text, JSON, file, image, audio, document, URL, tool-result, and derived records, with payload-free refs, SHA-256 fingerprints, and descriptor-only lineage.
- Memory and local-filesystem development artifact stores with metadata-only refs, payload reloads, and inspectable fixtures.
- `ai.plan(...)` deterministic dry-run with capability-catalog routing, budget and privacy filters, fallback chains, and fake providers.
- Memory sessions, context packs, progressive overrides, narrow OpenAI / OpenAI-compatible / AI SDK adapter factories.
- Standard Schema local tools, MCP-like tool imports, replay envelopes, offline and live replay, and default redaction.
- `examples/work-inbox` multimodal showcase using the public package entrypoint with route, context, and packaging inspection plus structured action output.
