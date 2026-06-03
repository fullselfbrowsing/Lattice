# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md` · `.planning/milestones/v1.2-MILESTONE-AUDIT.md` |
| v1.3 | Planned | — | TBD via `/gsd-new-milestone` |

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

</details>

### v1.3 (planned)

Scope and phases TBD. Run `/gsd-new-milestone` to scope. Known carryforward themes from v1.2:

- Native tool-use across providers via an additive `ProviderAdapter` extension that preserves the INV-03 7-provider parity contract.
- `lattice eval --agent` CLI subcommand wrapping the existing `evalAgentRun` kernel.
- Multi-scenario agent-loop showcase (tripwire / stall / budget-exceeded variants).
- KMS adapter shapes for `ReceiptSigner`.
- Lineage merkle root signed inside receipts.
- `lattice receipt diff` subcommand.
- OpenTelemetry exporter for `RunEventKind`.
- Streaming for the 5 new Phase 17 provider adapters.
- OpenRouter multi-model routing / fallback array.
- LM Studio latency-tail diagnostics module.
- Anthropic / Gemini multimodal request shaping.

## Progress

| Milestone | Phases | Status | Completed |
| --- | --- | --- | --- |
| v1.0 | 1 to 6 | Shipped | 2026-04-22 |
| v1.1 | 7 to 13.2 | Shipped | 2026-05-12 |
| v1.2 | 14 to 23 | Shipped | 2026-05-31 |
| v1.3 | — | Planned | — |
