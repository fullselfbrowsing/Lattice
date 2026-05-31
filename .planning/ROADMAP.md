# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | In progress | — | inline below + `.planning/milestones/v1.2-ROADMAP.md` |

## v1.2: FSB Integration + Agent Capability

**Started:** 2026-05-31
**Goal:** Land the five FSB-integration extensions as canonical Lattice surface, and open the previously out-of-scope delegation surface by shipping a runtime-agnostic agent capability.

The milestone has two tracks:
- **Track A — FSB Integration (retro).** Phases 14-18. Code already exists on `local-fsb-integration` (HEAD `e95067b`); each retro phase backfills GSD artifacts and merges the matching commit group into the `v1.2` branch via `--no-ff`. Source narrative: FSB v0.10.0-attempt-2 milestone (`automation/.planning/LATTICE-PIN.md` + `automation/lattice/docs/fsb-integration-gaps.md`).
- **Track B — Agent Capability (forward).** Phases 19-23. Net-new; shape locked during `/gsd-discuss-phase` per phase. Opens the **Delegation** surface that v1.x previously declared out of scope.

Phase numbering continues from v1.1 (which ended at Phase 13.2).

### Phases

- [ ] **Phase 14: Public Surface Index + Packaging Readiness** (Track A retro)
- [ ] **Phase 15: Receipt v1.1 Schema Extension + Tripwire Band Pipeline + Lifecycle Events** (Track A retro)
- [ ] **Phase 16: Step-Transition Tracing + Checkpoint Hook** (Track A retro)
- [ ] **Phase 17: Provider Adapter Alignment + INV-03 Parity Smoke** (Track A retro)
- [ ] **Phase 18: Survivability Adapter Contract + Recovery Tracing Markers** (Track A retro)
- [ ] **Phase 19: Delegation Surface Policy Flip + Agent Runtime Entrypoint** (Track B forward, TBD)
- [ ] **Phase 20: Pluggable AgentHost Adapter** (Track B forward, TBD)
- [ ] **Phase 21: Agent Infrastructure Primitives** (Track B forward, TBD)
- [ ] **Phase 22: Agent Showcase + Eval Mode** (Track B forward, TBD)
- [ ] **Phase 23: Milestone Audit + Tag** (Track B forward, TBD)

### Phase Details

#### Phase 14: Public Surface Index + Packaging Readiness
**Goal**: The receipt-mint API is reachable via the bare `lattice` specifier from any npm consumer, including those that use a `file:` dependency under npm 11 (which rejects pnpm `catalog:` specifiers at parse time).
**Depends on**: Nothing new — builds on v1.1's receipts module.
**Requirements**: PKG-01, INDEX-01
**Success Criteria**:
  1. `import { createReceipt, type CreateReceiptInput } from "lattice"` resolves against `packages/lattice/dist`.
  2. `npm install file:./packages/lattice` succeeds under npm 11.x with no `catalog:` parse errors.
  3. `packages/lattice/test/public-surface.test.ts` asserts `createReceipt` is exported (the inverse of the original v1.1 assertion).
**Plans**: 2 plans (Wave 1: index re-export + public-surface test flip; Wave 1: package.json catalog resolution).
**Track**: A retro. Originating commits: `ab6c1f6`, `195e5ae`, `22bf986`.

#### Phase 15: Receipt v1.1 Schema Extension + Tripwire Band Pipeline + Lifecycle Events
**Goal**: Receipts carry step-marker linked-list threading; hooks compose through priority bands with per-handler budget enforcement and frozen contexts; lifecycle event vocabulary is separate from `RunEventKind`.
**Depends on**: Phase 14 (public surface skeleton must accept new re-exports).
**Requirements**: RECEIPT-EXT-01, RECEIPT-EXT-02, RECEIPT-EXT-03, BAND-01, BAND-02, BAND-03, BAND-04, BAND-05, LIFECYCLE-01, INDEX-02
**Success Criteria**:
  1. `CapabilityReceiptBody.version` accepts both `"lattice-receipt/v1"` and `"lattice-receipt/v1.1"`; verifier accepts both.
  2. `createReceipt` auto-bumps to `v1.1` whenever any of the 6 step-marker fields is populated; otherwise emits `v1`.
  3. `createHookPipeline()` returns a pipeline with three bands; `pipeline.run()` executes handlers in band order and within-band registration order; per-handler `budgetMs` enforced via race-with-log; contexts frozen; `pipeline.freeze()` is irreversible.
  4. `HookLifecycleEvent` union is exported as a top-level type from `lattice` and is structurally separate from `RunEventKind`.
**Plans**: 4 plans (Wave 1: receipt schema + version heuristic + JCS round-trip tests; Wave 1: bands.ts factory + budget + freeze + freeze tests; Wave 2: lifecycle event union + tests; Wave 2: public surface re-exports + public-surface test).
**Track**: A retro. Originating commits: `5c48134`, `2110e19`, `ba6172c`, `00fcfac`, `97836f2`.

#### Phase 16: Step-Transition Tracing + Checkpoint Hook
**Goal**: A caller can register a checkpoint hook on the `OBSERVABILITY` band that emits exactly one `step.transition` event and (when a signer is configured) mints exactly one v1.1 Capability Receipt per invocation, threading step-markers as a linked list.
**Depends on**: Phase 15 (band pipeline + lifecycle events + receipt v1.1 schema).
**Requirements**: TRACE-01, CHECKPOINT-01, CHECKPOINT-02, CHECKPOINT-03, CHECKPOINT-04, INDEX-03
**Success Criteria**:
  1. `RunEventKind` union accepts `"step.transition"` as an additive final literal; existing `RunEvent` interface unchanged.
  2. `createCheckpointHook(options)` returns a `HookHandler<CheckpointHookContext>` registrable on a `HookPipeline`.
  3. Per invocation: exactly one `step.transition` event emitted via `TracerLike`; when a signer is provided, exactly one v1.1 Capability Receipt minted with step-marker fields populated.
  4. Signer failure surfaces as `metadata.mintError` on the context; never throws upstream.
**Plans**: 3 plans (Wave 1: tracing event kind + tests; Wave 2: checkpoint factory + mint + tracer-only mode + signer mode + signer-failure tests; Wave 3: public surface re-exports + linked-list threading round-trip test).
**Track**: A retro. Originating commits: `fd254c4`, `a67f476`, `acdbb8a`, `7afd62f`.

#### Phase 17: Provider Adapter Alignment + INV-03 Parity Smoke
**Goal**: Five new provider adapters ship as first-class factories on Lattice's public surface; the INV-03 parity smoke proves every adapter conforms to the same `ProviderAdapter` contract under a fake fetch.
**Depends on**: Phase 14 (public surface skeleton).
**Requirements**: PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PARITY-01, INDEX-04
**Success Criteria**:
  1. `createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider` exported from `lattice`.
  2. Each adapter passes its own unit-test file (Anthropic 9 cases, Gemini 10, xAI 9, OpenRouter 7, LM Studio 8).
  3. INV-03 parity smoke iterates all 7 logical providers and asserts ProviderAdapter shape, `rawOutputs` population, normalized `Usage` shape, provider-name error on non-OK, AbortSignal propagation, `rawResponse` preservation, distinct request ids (7 cases).
**Plans**: 6 plans (5 adapter plans in Wave 1 — independent; Wave 2: public surface re-exports; Wave 3: INV-03 parity smoke).
**Track**: A retro. Originating commits: `cf31d82`, `7a32b00`, `09a495e`, `1cfc13c`, `40457ff`, `e5659a8`, `f9c7ef4`, `f1c943b`.

#### Phase 18: Survivability Adapter Contract + Recovery Tracing Markers
**Goal**: Lattice defines what "execution context can be evicted mid-flow" means for any runtime (MV3 SW, Cloudflare Worker, Lambda, equivalent), without coupling the contract to any one platform. Tracing union admits recovery/resume markers paired with the adapter.
**Depends on**: Phase 15 (band pipeline; JSDoc convention says `onEviction` hooks register in `BAND.SAFETY`). Phase 16 (`createCheckpointHook`; `SerializedSnapshot.payload` may embed v1.1 `ReceiptEnvelope`).
**Requirements**: SURV-01, SURV-02, SURV-03, SURV-04, INDEX-05, TRACE-EXT-01
**Success Criteria**:
  1. `SurvivabilityAdapter<TState>` interface exports `serialize`, `deserialize`, `onEviction`, `resume`; `EvictionHook<TState>` + `UnsubscribeFn` companion types exported.
  2. `SerializedSnapshot` JSON round-trips byte-equal; when `payload` embeds a v1.1 `ReceiptEnvelope` it survives DSSE + JCS round-trip with `verifyReceipt`.
  3. `ResumePolicy` literal-union exported with all four variants.
  4. `createNoopSurvivabilityAdapter()` exported as reference impl with 12+ vitest cases.
  5. `RunEventKind` gains the new recovery markers (final literals locked at plan time).
**Plans**: 3 plans (Wave 1: survivability module + tests; Wave 2: public surface re-exports; Wave 3: recovery event kinds + tests).
**Track**: A retro + one carryforward. Originating commits: `a4609bc`, `109d6ae`, `e95067b`. Net-new for TRACE-EXT-01.

#### Phase 19: Delegation Surface Policy Flip + Agent Runtime Entrypoint
**Goal**: Flip `AGENTS.md` policy stance from "multi-agent: Out of Scope" to "agent execution: First-class, runtime-agnostic." Ship `packages/lattice/src/agent/` with a minimal `runAgent(...)` (or equivalent) entrypoint. Wire `HookPipeline` integration so a `SAFETY`-band handler can deny / abort an iteration. Wire `step.transition` emission so `createCheckpointHook` mints per-iteration receipts when a signer is configured.
**Depends on**: Phase 15 (band pipeline). Phase 16 (step.transition + checkpoint hook). Phase 17 (tool_use across new providers).
**Requirements**: DELEG-01, AGENT-01, AGENT-02, AGENT-03, AGENT-04
**Success Criteria**:
  1. `AGENTS.md` records the policy flip with rationale.
  2. Agent runtime entrypoint exported from `lattice`; smallest credible call signature accepts task description, tool registry, and host triple.
  3. Each iteration emits one `step.transition` event via the existing `HookPipeline`.
  4. A `SAFETY`-band handler observed before provider invocation can deny / abort an iteration before any tokens are spent.
**Plans**: TBD via `/gsd-discuss-phase 19`.
**Track**: B forward.

#### Phase 20: Pluggable AgentHost Adapter
**Goal**: Define `AgentHost` interface with three pluggable seams (scheduler, transport, storage). Ship `createNoopAgentHost()` as the Node-test reference impl. Compose with `SurvivabilityAdapter` so the host's storage seam emits eviction snapshots and the loop re-enters at the recorded step on resume.
**Depends on**: Phase 18 (SurvivabilityAdapter). Phase 19 (agent runtime entrypoint).
**Requirements**: HOST-01, HOST-02, HOST-03
**Success Criteria**:
  1. `AgentHost` interface exported with `scheduler`, `transport`, `storage` seams.
  2. `createNoopAgentHost()` exported with full round-trip test coverage.
  3. Eviction snapshot from the storage seam round-trips through SurvivabilityAdapter and the loop resumes at the recorded step index in a fake-eviction integration test.
**Plans**: TBD via `/gsd-discuss-phase 20`.
**Track**: B forward.

#### Phase 21: Agent Infrastructure Primitives
**Goal**: Cost tracker (contract.budget-aware), transcript store (filtered tail reads), goal-progress tracker (stuck detection), action-history dedup (STUCK_REASONS vocabulary), permission context (per-tool / per-iteration / per-resource).
**Depends on**: Phase 19 (agent runtime). Phase 20 (host adapter — storage seam carries transcripts).
**Requirements**: AGENT-INFRA-01, AGENT-INFRA-02, AGENT-INFRA-03, AGENT-INFRA-04, PERM-01
**Success Criteria**:
  1. Cost tracker respects `contract.budget` and produces a running total per iteration.
  2. Transcript store supports filtered tail reads sized for context-window management.
  3. Goal-progress tracker reports `progressing | stalled | regressed` against a caller-declared goal.
  4. Action-history dedup detects the "consecutive identical tool call" pattern via the `STUCK_REASONS` vocabulary.
  5. PermissionContext gates tool execution per-tool, per-iteration, or per-resource pattern via the band pipeline.
**Plans**: TBD via `/gsd-discuss-phase 21`.
**Track**: B forward.

#### Phase 22: Agent Showcase + Eval Mode
**Goal**: `examples/agent-loop` showcase against fake provider + fake tool registry, producing signed per-step receipts. `lattice eval --agent` (or equivalent) for baseline-relative iterations-to-goal + total-cost regression gating.
**Depends on**: Phases 19, 20, 21.
**Requirements**: SHOWCASE-AGENT-01, SHOWCASE-AGENT-02
**Success Criteria**:
  1. Showcase emits signed per-step receipts written to `.lattice/receipts/`.
  2. `lattice repro` against a showcase receipt exits 0 with `verdict=match`.
  3. `lattice eval --agent` gates iterations-to-goal + total-cost regression against a baseline.
**Plans**: TBD via `/gsd-discuss-phase 22`.
**Track**: B forward.

#### Phase 23: Milestone Audit + Tag
**Goal**: End-to-end audit across both tracks; cut `v1.2.0` tag.
**Depends on**: All previous phases.
**Requirements**: All v1.2 REQ-IDs marked validated.
**Success Criteria**:
  1. Milestone integration audit produces `v1.2-MILESTONE-INTEGRATION.md` with all REQ-IDs marked WIRED.
  2. `git tag v1.2.0` cut on the v1.2 branch after merge to main.
**Plans**: Audit-only phase; closes the milestone.
**Track**: B forward.

## Archive

- v1.0 milestone:
  - Requirements: `.planning/milestones/v1.0-REQUIREMENTS.md`
  - Roadmap: `.planning/milestones/v1.0-ROADMAP.md`
  - Audit: `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
  - Phases: `.planning/milestones/v1.0-phases/`
- v1.1 Capability Receipts:
  - Requirements: `.planning/milestones/v1.1-REQUIREMENTS.md`
  - Roadmap: `.planning/milestones/v1.1-ROADMAP.md`
  - Audit: `.planning/milestones/v1.1-MILESTONE-AUDIT.md`
  - Integration: `.planning/v1.1-MILESTONE-INTEGRATION.md`
