# Milestones

## v1.5.0 Modular Adoption + Execution Parity (Shipped: 2026-06-20)

**Phases completed:** 6 phases, 6 plans, 7 tasks

**Key accomplishments:**

- Modular package subpaths with compatibility metadata, source boundary enforcement, and type/package tests
- Provider-only native tools, native structured outputs, finish metadata, and model-ID preservation
- External execution audit helper with signed receipts, compatible sidecars, replay envelopes, and raw envelope hashes
- Non-executing core preparation helper for artifact refs, optional storage, context packs, advisory routes, hashes, and inspectable execution plans
- Tools/MCP-only artifact helpers and returned tool-call validation without agent adoption
- Node 20 modular smoke, GitFly-style dogfood, and generic external-consumer example

**Audit:** Passed, 30/30 requirements satisfied. Known deferred items at close: 7 stale missing quick-task index entries already acknowledged in `STATE.md`.

---

## v1.4 Provider Breadth + Live Multimodal + Observability Export (Shipped: 2026-06-16)

**Phases completed:** 10 phases, 36 plans, 54 tasks
**Audit:** Passed — 44 / 44 REQ-IDs satisfied (`milestones/v1.4-MILESTONE-AUDIT.md`)
**Validation:** 1026 runtime tests, 157 CLI tests, package version/tarball checks, offline v1.4 showcase, and FSB package-candidate dogfood.
**Known deferred items at close:** 7 stale quick-task index entries (see `STATE.md` Deferred Items).

**Key accomplishments:**

- Package hygiene guardrails: package-local version stamping, exact root value-export inventory, package-entrypoint type smoke tests, packed-artifact version checks, and core dependency boundary scans.
- Gateway and provider breadth: first-class LiteLLM helper, typed gateway policy metadata, OpenRouter fallback arrays, observed served-model accounting, and deterministic OpenRouter registry refresh metadata.
- Live and multimodal surface: provider-neutral streaming contract, explicit `policy.stream` runtime path, chunk-boundary receipt invariants, five streaming adapter implementations, seven-provider parity, and Anthropic/Gemini multimodal request shaping.
- Receipt and signing provenance: lineage merkle roots, runtime/crew lineage issuance, and remote signer/KMS adapter shapes without cloud SDK dependencies in core.
- Observability and diagnostics: structural OpenTelemetry event export, content-safe sanitizer, Langfuse/Phoenix OTLP helpers, agent eval CLI mode, receipt diffing, and LM Studio latency-tail diagnostics.
- Release validation: offline v1.4 showcase, stricter tarball leak/install-script checks, and isolated FSB package-candidate dogfood with generated FSB-side smoke coverage.

---

## v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface (Shipped: 2026-06-15)

**Phases completed:** 13 phases, 42 plans, 80 tasks

**Delivered:** Lattice's first public npm release under `@full-self-browsing/*`, plus a model-aware SDK upgrade and a first-class opt-in multi-agent crew surface.

**Key accomplishments:**

- **Public release infrastructure (Phases 24–29):** scope rename to `@full-self-browsing/*`, release-hygiene docs + receipt-downgrade defense, PR-time `ci.yml` + tag-driven `release.yml`, and npm org + OIDC Trusted Publisher. `@full-self-browsing/lattice@1.3.0` + `@full-self-browsing/lattice-cli@1.3.0` published with SLSA provenance attestations and GitHub Release `v1.3.0`.
- **Model capability registry (Phase 33):** `ModelCapabilityProfile` + 6 closed string-literal unions on the public surface; `getCapabilityProfile` / `findCapabilityProfile`; a build-time generator seeding ~337 profiles from the OpenRouter feed plus 4 static supplements, with a weekly drift-check workflow.
- **Adapter quirks + capability negotiation (Phase 34):** `AdapterQuirks` base + 7 narrowed sub-interfaces, and `negotiateCapabilities` with live `/models` + registry fallback, TTL cache, and single-flight coalescing.
- **Prompt scaffolds (Phase 35):** deterministic, version-pinned structured-output and tool-use contract fragments per prompt strategy; the open-weight scaffold prevents internal-envelope leaks.
- **Opt-in adapter hardening (Phases 36–37):** `sanitizeOutput` and `validateToolCalls` across all 7 adapters with all-seven parity tests; default v1.2 behavior unchanged.
- **Receipt v1.2 (Phase 38):** schema bump to `lattice-receipt/v1.2` with optional signed `modelClass`, downgrade defenses preserved, registry-derived issuance for known models.
- **Multi-agent crew surface (Phase 39):** `defineAgent` / `runAgentCrew`, CrewDispatcher chokepoint, crew budgets, prompt-cache-prefix sharing, a rate-limit-group primitive, `parentReceiptCid` chained receipts, and the `examples/agent-crew/` showcase — all additive, single-agent behavior bit-for-bit unchanged (834/834 tests).

**Coverage:** 64 / 87 REQ-IDs shipped. **23 canary REQ-IDs (Phases 30–32) were superseded** — the dedicated synthetic `fullselfbrowsing/lattice-canary` repo was descoped in favor of dogfooding the published package through FSB-via-npm. See `milestones/v1.3-MILESTONE-AUDIT.md`.

---

## v1.2 FSB Integration + Agent Capability (Shipped: 2026-05-31)

**Phases completed:** 9 phases, 25 plans, 46 REQ-IDs WIRED end-to-end

**Test posture:** 589 packages/lattice + 144 packages/lattice-cli = 733 / 733 PASS, strict tsc clean.

**Key accomplishments:**

- Public surface index + packaging readiness. `createReceipt` reachable via the bare `lattice` specifier. `pnpm-workspace` `catalog:` specifiers resolved so npm 11 installs Lattice via a `file:` dependency without parse errors.
- Receipt v1.1 schema extension. `CapabilityReceiptBody.version` widens to `v1 | v1.1`; six optional step-marker fields thread receipts as a linked list; `createReceipt` auto-bumps the version when any step-marker is populated.
- Tripwire band pipeline + lifecycle events. `createHookPipeline` ships SAFETY / OBSERVABILITY / EXTENSION bands with per-handler `budgetMs` race-with-log, frozen contexts, irreversible freeze, and `matcher` regex filter. `HookLifecycleEvent` vocabulary kept separate from `RunEventKind`.
- Step-transition tracing + checkpoint hook. `step.transition` joins `RunEventKind` as an additive literal. `createCheckpointHook` emits exactly one event and (when a signer is configured) mints exactly one v1.1 receipt per invocation; signer failure degrades to `metadata.mintError` without throwing upstream.
- Provider adapter alignment + INV-03 parity. Five new adapters (Anthropic Messages, Gemini `generateContent`, xAI, OpenRouter, LM Studio) ship as first-class factories. INV-03 parity smoke iterates all 7 logical providers under a fake fetch and asserts the same `ProviderAdapter` contract (shape, `rawOutputs`, normalized `Usage`, provider-name error, AbortSignal propagation, `rawResponse`, distinct request ids).
- Survivability adapter contract. `SurvivabilityAdapter<TState>` defines what "execution context can be evicted mid-flow" means for any runtime. `SerializedSnapshot` JSON round-trips byte-equal and survives DSSE + JCS round-trip with real Ed25519 when the payload embeds a v1.1 `ReceiptEnvelope`. `createNoopSurvivabilityAdapter` ships as the reference impl.
- Delegation surface flip + agent runtime entrypoint. `AGENTS.md` policy flips from "multi-agent crews: Out of Scope" to "agent execution: First-class, runtime-agnostic." `ai.runAgent(intent)` ships on the runtime returned by `createAI`. `formatToolsForProvider` drives a uniform prompt-reencoded tool-use protocol across all 7 provider adapters (84-case `describe.each(ALL_PROVIDERS)` parity test). SAFETY-band hooks can deny / abort an iteration before provider invocation.
- Pluggable `AgentHost` + recovery markers. `AgentHost` exports three optional seams (scheduler, transport, storage). `createNoopAgentHost` is the Node-test reference impl. The storage seam composes with `SurvivabilityAdapter` so the agent loop re-enters at the recorded iteration index on resume. `RunEventKind` gains `recovery.start`, `recovery.complete`, `recovery.failed` markers, closing the v1.1 audit carryforward TRACE-EXT-01.
- Agent infrastructure primitives. Five small standalone modules: cost tracker (budget-aware accumulator with ok / warning / exceeded thresholds), transcript store (tailed reads with first-user-turn preservation), goal-progress tracker (stuck detection with progressing / stalled / regressed), action-history dedup (consecutive-identical and ping-pong patterns with `STUCK_REASONS` vocabulary), permission context (per-tool / per-iteration / per-resource gating with a SAFETY-band hook helper).
- Agent showcase + eval helper. `examples/agent-loop` exercises every Track B surface end-to-end against a fake provider and a fake tool registry with real Ed25519 signing; produces 3 per-iteration receipts that verify cleanly under the ephemeral KeySet. `evalAgentRun` ships as a pure regression-gate kernel for iterations-to-goal and total cost (11 cases). A future `lattice eval --agent` CLI subcommand can wrap it without re-implementing the kernel.
- Brand identity. Direction C "Shell" implementation of the Claude.ai design bundle. Isometric wireframe lattice cube, hollow faces, glowing depth-scaled nodes. Static mark + animated gentle 3D sideways sway (240 frames over 14s) + wordmark + app icon + favicons + 1200x630 social card, all generated from `tools/gen-assets.mjs` (ports `lattice-core.js` into Node).

**Documented v1.2 limitation (non-blocking, carry to v1.3):** Native tool-use across providers deferred. Admitting native `tools[]` cleanly requires an additive extension to the `ProviderAdapter` interface to preserve the INV-03 7-provider parity contract.

**Distribution:** Tag `v1.2.0` cut at commit `f0d832a`, pushed to `fullselfbrowsing/Lattice`. v1.2 branch merged to `main` via PR #1 (merge commit `5ca3e33`). Mainline npm publish deferred until at least one external consumer requests it. FSB consumes via git submodule pinned at the tag.

---

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
