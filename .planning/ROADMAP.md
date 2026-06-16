# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md` · `.planning/milestones/v1.2-MILESTONE-AUDIT.md` |
| v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface | Shipped | 2026-06-15 | `.planning/milestones/v1.3-ROADMAP.md` · `.planning/milestones/v1.3-REQUIREMENTS.md` · `.planning/milestones/v1.3-MILESTONE-AUDIT.md` |
| v1.4 Provider Breadth + Live Multimodal + Observability Export | Shipped | 2026-06-16 | `.planning/milestones/v1.4-ROADMAP.md` · `.planning/milestones/v1.4-REQUIREMENTS.md` · `.planning/milestones/v1.4-MILESTONE-AUDIT.md` |

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

No active milestone. Start the next milestone with `/gsd-new-milestone`; it will create fresh `.planning/REQUIREMENTS.md` and expand this roadmap.
