# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md` · `.planning/milestones/v1.2-MILESTONE-AUDIT.md` |
| v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface | Shipped | 2026-06-15 | `.planning/milestones/v1.3-ROADMAP.md` · `.planning/milestones/v1.3-REQUIREMENTS.md` · `.planning/milestones/v1.3-MILESTONE-AUDIT.md` |
| v1.4 Provider Breadth + Live Multimodal + Observability Export | Shipped | 2026-06-16 | `.planning/milestones/v1.4-ROADMAP.md` · `.planning/milestones/v1.4-REQUIREMENTS.md` · `.planning/milestones/v1.4-MILESTONE-AUDIT.md` |
| v1.5.0 Modular Adoption + Execution Parity | Planning | — | `.planning/REQUIREMENTS.md` |

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

## Active Milestone

### v1.5.0 Modular Adoption + Execution Parity

**Status:** Draft roadmap, awaiting approval.

**Goal:** Make Lattice adoptable module-by-module in real apps like GitFly without forcing consumers into Lattice's agent runtime.

**Requirement coverage:** 30 / 30 mapped.

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 50 | Module Boundary Contract | Define and enforce modular entrypoints, dependency boundaries, and compatibility labels before implementation spreads. | MOD-01, MOD-02, MOD-03, MOD-04 |
| 51 | Provider Execution Parity | Close provider-only execution gaps for native tools, structured outputs, streaming step insight, and model IDs. | PROV-01, PROV-02, PROV-03, PROV-04, PROV-05 |
| 52 | External Execution Audit Layer | Let apps keep their existing AI executor while using Lattice receipts, replay, eval, and diffing. | AUD-01, AUD-02, AUD-03, AUD-04, AUD-05 |
| 53 | Standalone Core Modules | Make context packing, artifact transport, routing, and storage independently usable and inspectable. | CORE-01, CORE-02, CORE-03, CORE-04, CORE-05 |
| 54 | Tools/MCP and Agent Optionality | Decouple MCP/tool helpers from agents and close the typed agent-output gap for callers who opt into agents. | TOOL-01, TOOL-02, TOOL-03, AGNT-01, AGNT-02 |
| 55 | Compatibility and Dogfood Validation | Prove Node 20 modular compatibility, Node 24 full-runtime boundaries, GitFly-style dogfood, external examples, and adoption docs. | COMP-01, COMP-02, DOG-01, DOG-02, DOG-03, DOG-04 |

### Phase 50: Module Boundary Contract

**Goal:** Establish the public modular contract before changing runtime behavior.

**Requirements:** MOD-01, MOD-02, MOD-03, MOD-04

**Success criteria:**
1. Package entrypoints or documented module facades identify provider, audit, context, artifact, routing, MCP/tools, storage, eval, and agent surfaces.
2. Dependency-boundary checks prove provider-only, audit-only, and core-only paths do not import agent runtime or crew code.
3. Documentation labels each module as Node 20-compatible, Node 24-only, or adapter-specific.
4. Existing package public-surface tests protect the new modular contract.

**Depends on:** None.

### Phase 51: Provider Execution Parity

**Goal:** Make provider-only use strong enough for GitFly-style execution flows.

**Requirements:** PROV-01, PROV-02, PROV-03, PROV-04, PROV-05

**Success criteria:**
1. Provider-only calls can pass native tool declarations and provider-native tool-choice hints.
2. Provider-only structured output calls materialize typed objects without validating schema objects against raw strings.
3. xAI/GitFly-style model IDs are preserved or normalized intentionally with inspectable negotiation results.
4. Streaming provider paths expose enough step/tool-finish information for host apps to maintain their own SSE insight surfaces.
5. Existing `ai.run()` and `ai.runAgent()` tests prove default behavior remains backward compatible.

**Depends on:** Phase 50.

### Phase 52: External Execution Audit Layer

**Goal:** Let Lattice wrap external execution instead of replacing it.

**Requirements:** AUD-01, AUD-02, AUD-03, AUD-04, AUD-05

**Success criteria:**
1. A host app can create a signed Lattice receipt from an externally executed request/response envelope.
2. Sidecar or replay fixture data captures task, model, artifacts, outputs, usage, policy, raw envelope, and hashes.
3. `lattice repro`, `lattice verify`, `lattice eval`, or shared kernels can operate on external-execution fixtures where required data exists.
4. Receipt compatibility tests prove existing v1.2 receipt verification still works.
5. External execution audit APIs do not depend on provider adapters or agent runtime.

**Depends on:** Phase 50.

### Phase 53: Standalone Core Modules

**Goal:** Make the non-execution core useful to apps that already have an AI runtime.

**Requirements:** CORE-01, CORE-02, CORE-03, CORE-04, CORE-05

**Success criteria:**
1. Context packing can be invoked directly over artifacts and optional session turns.
2. Artifact constructors, refs, fingerprints, lineage, and packaging metadata are usable without provider execution.
3. Deterministic routing and capability negotiation can be used as advisory APIs without invoking providers.
4. Storage adapters are usable independently of `createAI()`.
5. Standalone core operations produce inspectable records that can feed receipts and debugging.

**Depends on:** Phase 50.

### Phase 54: Tools/MCP and Agent Optionality

**Goal:** Keep tools and MCP useful without committing consumers to the agent loop.

**Requirements:** TOOL-01, TOOL-02, TOOL-03, AGNT-01, AGNT-02

**Success criteria:**
1. MCP/tool imports, validation, and artifact conversion are available through non-agent module paths.
2. Returned tool-call validation works independently of provider adapters and agent runtime where possible.
3. MCP resources, prompts, and tool results can be represented as artifacts for packing, replay, and signing.
4. Tests prove non-agent module paths do not import `runAgent`, crew, or AgentHost code.
5. `runAgent` callers can request typed final outputs when they intentionally use the agent surface.

**Depends on:** Phase 50, Phase 51.

### Phase 55: Compatibility and Dogfood Validation

**Goal:** Prove the milestone solves real incremental adoption, not just internal API shape.

**Requirements:** COMP-01, COMP-02, DOG-01, DOG-02, DOG-03, DOG-04

**Success criteria:**
1. Node 20 compatibility tests run for every modular layer classified as Node 20-compatible.
2. Node 24-only modules have explicit guards, docs, or package metadata that prevent accidental Node 20 promises.
3. A GitFly-style provider-only dogfood fixture proves native tools and structured outputs do not regress against the host-owned execution pattern.
4. A GitFly-style audit dogfood fixture proves Lattice receipts/replay can wrap external execution behind a feature flag.
5. Generic external-consumer examples demonstrate at least two independent adoption slices.
6. Docs describe provider-only, audit-only, context/artifact-only, routing advisory, MCP/tools-only, eval-only, and full-runtime adoption paths.

**Depends on:** Phases 51, 52, 53, 54.

## Approval Status

This roadmap is intentionally stopped for human approval before implementation. After approval, start with:

`/gsd-discuss-phase 50`
