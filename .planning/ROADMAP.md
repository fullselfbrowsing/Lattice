# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` |
| v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface | Shipped | 2026-06-15 | `.planning/milestones/v1.3-ROADMAP.md` |
| v1.4 Provider Breadth + Live Multimodal + Observability Export | Shipped | 2026-06-16 | `.planning/milestones/v1.4-ROADMAP.md` |
| v1.5.0 Modular Adoption + Execution Parity | Shipped | 2026-06-20 | `.planning/milestones/v1.5.0-ROADMAP.md` |
| v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client | Shipped | 2026-07-06 | `.planning/milestones/v1.5-ROADMAP.md` |
| v1.6 Protocol and Runtime Integrity Bridge | Shipped | 2026-07-20 | `.planning/milestones/v1.6-ROADMAP.md` |

## Shipped Milestone History

<details>
<summary><b>Shipped milestones</b></summary>

### v1.0 milestone (shipped 2026-04-22)

Phases 1 to 6. Package/API spine, artifact lifecycle, deterministic planning,
sessions/context/packaging, tools/replay/observability, and work-inbox showcase.

### v1.1 Capability Receipts (shipped 2026-05-12)

Phases 7 to 13 plus sub-phases 13.1 and 13.2. Contract-bound signed receipts,
replay envelope integration, `lattice` CLI repro/verify/eval, and showcase
validation of all 36 v1.1 requirements.

### v1.2 FSB Integration + Agent Capability (shipped 2026-05-31)

Phases 14 to 22. Public surface readiness, receipt v1.1 schema extension, hook
bands, checkpoint receipts, five provider adapters, survivability, `ai.runAgent`,
`AgentHost`, agent primitives, and agent showcase.

### v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface (shipped 2026-06-15)

Phases 24 to 39. First public npm release under `@full-self-browsing/*`, model
capability registry, adapter quirks and negotiation, prompt scaffolds, output and
tool-call hardening, receipt v1.2, and opt-in multi-agent crews.

### v1.4 Provider Breadth + Live Multimodal + Observability Export (shipped 2026-06-16)

Phases 40 to 49. LiteLLM/OpenRouter gateway delegation, streaming, multimodal
request shaping, realtime direction, receipt lineage, OpenTelemetry export,
diagnostics CLI, package checks, and dogfood validation.

### v1.5.0 Modular Adoption + Execution Parity (shipped 2026-06-20)

Phases 50 to 55 in the canonical mainline history. Modular package subpaths,
provider-native execution, external audit helpers, standalone core preparation,
optional tools/MCP and agent adoption, and external-consumer dogfood. All 30
requirements passed.

### v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client (shipped 2026-07-06)

Phases 50 to 56 in the reconciled polyglot history. Language-neutral receipt
specification, committed conformance vectors, TypeScript verifier, Python
verify/replay/mint client, cross-mint parity, and conformance CI. All 26
requirements passed.

### v1.6 Protocol and Runtime Integrity Bridge (shipped 2026-07-20)

Phases 57 to 62. Corrected-only DSSE v1.4 issuance with a bounded historical-read
bridge, independent cross-language conformance, authoritative context and
persistence, shared audit/evaluation/cost semantics, exact agent and crew receipt
evidence, and a documented 1.6.0 release validated through clean Node 24/26
consumers and bounded provider canaries. All 42 requirements passed.

</details>

## Next Milestone

No milestone is active. Start the next cycle with `$gsd-new-milestone` so its
requirements, research, and phase roadmap begin from the shipped v1.6 baseline.
