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
| v1.6 Protocol and Runtime Integrity Bridge | Planning | - | Current roadmap below |

## Shipped Milestone History

<details>
<summary><b>Shipped milestones</b></summary>

### v1.0 milestone (shipped 2026-04-22)

Phases 1 to 6. Package/API spine, artifact lifecycle, deterministic planning, sessions/context/packaging, tools/replay/observability, and work-inbox showcase.

### v1.1 Capability Receipts (shipped 2026-05-12)

Phases 7 to 13 plus sub-phases 13.1 and 13.2. Contract-bound signed receipts, replay envelope integration, `lattice` CLI repro/verify/eval, and showcase validation of all 36 v1.1 requirements.

### v1.2 FSB Integration + Agent Capability (shipped 2026-05-31)

Phases 14 to 22. Public surface readiness, receipt v1.1 schema extension, hook bands, checkpoint receipts, five provider adapters, survivability, `ai.runAgent`, `AgentHost`, agent primitives, and agent showcase.

### v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface (shipped 2026-06-15)

Phases 24 to 39. First public npm release under `@full-self-browsing/*`, model capability registry, adapter quirks and negotiation, prompt scaffolds, output/tool-call hardening, receipt v1.2, and opt-in multi-agent crews.

### v1.4 Provider Breadth + Live Multimodal + Observability Export (shipped 2026-06-16)

Phases 40 to 49. LiteLLM/OpenRouter gateway delegation, streaming, multimodal request shaping, realtime direction, receipt lineage, OpenTelemetry export, diagnostics CLI, package checks, and dogfood validation.

### v1.5.0 Modular Adoption + Execution Parity (shipped 2026-06-20)

Phases 50 to 55 in the canonical mainline history. Modular package subpaths, provider-native execution, external audit helpers, standalone core preparation, optional tools/MCP and agent adoption, Node 20 smoke coverage, and external-consumer dogfood. 30 / 30 requirements satisfied; milestone audit passed.

### v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client (shipped 2026-07-06)

Phases 50 to 56. Language-neutral receipt protocol specification, committed conformance vectors, TypeScript self-verification harness, Python verify/replay/mint client, cross-mint parity, and SHA-pinned conformance CI gate. 26 / 26 requirements satisfied; milestone audit passed.

</details>

## v1.6 Protocol and Runtime Integrity Bridge

**Milestone Goal:** Correct Lattice's protocol and execution semantics while preserving bounded compatibility for existing receipts.

**Implementation precondition:** Reconcile and validate `origin/main` before Phase 57 implementation begins. The reconciliation is repository preparation, not a seventh product phase, because it does not satisfy a v1.6 requirement by itself.

## Phases

- [x] **Phase 57: Protocol Semantics** - Make every new receipt standards-compliant while quarantining historical verification behind an explicit, observable bridge. (completed 2026-07-16)
- [ ] **Phase 58: Conformance and Client Migration** - Move the specification, vectors, TypeScript, Python, CLI, and CI to the corrected protocol as one interoperability surface.
- [ ] **Phase 59: Authoritative Runtime State** - Make one materialized context projection and real persistence lifecycle authoritative for provider execution and evidence.
- [ ] **Phase 60: Audit, Evaluation, and Cost Integrity** - Enforce truthful receipt, evaluation, and budget outcomes through shared policies and estimation semantics.
- [ ] **Phase 61: Agent Receipt Closure** - Attach the actual receipt envelopes to iteration, terminal, resume, and crew results without duplication.
- [ ] **Phase 62: Operational Interop and Hygiene** - Validate packed consumers and provider wire families, then align documentation and production comments with shipped behavior.

## Phase Details

### Phase 57: Protocol Semantics

**Goal:** Callers can issue standards-compliant receipts and verify historical receipts only through a bounded, downgrade-resistant compatibility policy.
**Depends on:** Implementation precondition (`origin/main` reconciled and validated)
**Requirements:** SIGBR-01, SIGBR-02, SIGBR-03, SIGBR-04, SIGBR-05, SIGBR-06
**Success Criteria** (what must be TRUE):

  1. TypeScript and Python callers mint new receipts with raw-byte DSSE PAE, signed body version `lattice-receipt/v1.4`, and signature profile `dsse-v1`.
  2. No public or internal production API can mint the historical base64-PAE profile.
  3. Verifiers accept or reject historical receipts through explicit policy and report the profile and deprecation state that actually verified.
  4. A corrected-profile signature failure cannot fall back to legacy verification, and schema version, profile, CID, key selection, and downgrade checks remain independently observable.

**Plans:** 2/2 plans complete

### Phase 58: Conformance and Client Migration

**Goal:** Implementers and automated consumers can independently reproduce and enforce the corrected receipt protocol across every supported language and entrypoint.
**Depends on:** Phase 57
**Requirements:** CONF16-01, CONF16-02, CONF16-03, CONF16-04, CONF16-05, CONF16-06
**Success Criteria** (what must be TRUE):

  1. The specification, schemas, examples, and migration guide are sufficient to reproduce standard verification and the bounded legacy bridge without reading production source.
  2. Consumers can distinguish immutable legacy vectors from separately labeled standard positive and adversarial negative vectors.
  3. TypeScript and Python can reciprocally mint and verify standard-profile receipts.
  4. CI checks PAE behavior against `securesystemslib==1.4.0` as a test-only oracle and rejects stale manifests, generated artifacts, language drift, oracle failures, and packed-consumer incompatibility.
  5. CLI verify and replay report the profile that verified and can enforce standard-only operation.

**Plans:** 3/6 plans executed

### Phase 59: Authoritative Runtime State

**Goal:** Provider calls, plans, evidence, sessions, and storage all describe the same policy-permitted materialized artifact projection.
**Depends on:** Phase 58
**Requirements:** CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-04, CTXAUTH-05, CTXAUTH-06, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04
**Success Criteria** (what must be TRUE):

  1. Providers receive exactly the planned materialized projection, including policy-permitted session turns and stored references with explicit missing-reference behavior.
  2. Omitted, archived, and raw summarized artifacts never reach a provider request.
  3. Summarizers receive only selected sources, and summaries preserve source lineage, privacy, and trust metadata.
  4. Every fallback route repacks against its own limits and capabilities, while plans, hashes, receipts, traces, and events describe that route's provider-visible projection.
  5. Configured stores perform policy-checked lifecycle writes and return the references exposed by results and sessions; unconfigured storage reports `skipped`, and configured load or write failures return typed outcomes.

**Plans:** TBD

### Phase 60: Audit, Evaluation, and Cost Integrity

**Goal:** Strict audit, evaluation, and budget modes fail truthfully and use one cost model across runtime surfaces.
**Depends on:** Phase 59
**Requirements:** AUDIT16-01, AUDIT16-02, AUDIT16-03, AUDIT16-04, EVAL16-01, EVAL16-02, PRICE-01, PRICE-02, PRICE-03, PRICE-04
**Success Criteria** (what must be TRUE):

  1. Callers can select `off`, `best-effort`, or `required` receipt issuance consistently, and required mode without a signer fails before provider execution.
  2. A post-execution signing failure returns a typed, safely diagnosed audit failure without retrying the provider, across runtime, agent, and crew terminal paths.
  3. Evaluation reports every load, verification, materialization, and replay failure, exits with code 2, and writes no baseline when any input is invalid or unevaluable.
  4. One estimator normalizes per-1k and legacy per-1M hints while preserving known zero cost separately from unknown cost.
  5. Routing and contract budgets reach the same decision for identical inputs, and plans, agents, crews, diagnostics, routing, and preflight consume the shared estimate.

**Plans:** TBD

### Phase 61: Agent Receipt Closure

**Goal:** Agent and crew result surfaces expose the exact receipt evidence issued for their stable execution identities.
**Depends on:** Phase 60
**Requirements:** AGREC-01, AGREC-02, AGREC-03, AGREC-04
**Success Criteria** (what must be TRUE):

  1. Every agent iteration record exposes the actual receipt envelope issued for that iteration.
  2. Terminal agent success and failure results expose their issued terminal receipt.
  3. Resumed execution retains stable iteration identity and does not duplicate receipts already issued.
  4. Crew receipt arrays and CIDs reuse the same envelopes in documented order without duplicate minting.

**Plans:** TBD

### Phase 62: Operational Interop and Hygiene

**Goal:** Maintainers can release a packed, documented, independently exercised v1.6 product whose production commentary records only durable rationale.
**Depends on:** Phases 58-61
**Requirements:** OPSVAL-01, OPSVAL-02, OPSVAL-03, DOC16-01, HYGIENE-01, HYGIENE-02
**Success Criteria** (what must be TRUE):

  1. Clean consumers install and use packed runtime and CLI artifacts on every supported Node line.
  2. Scheduled or manually dispatched canaries exercise representative OpenAI-compatible, Anthropic, and Gemini wire families.
  3. Canaries enforce token, time, retry, and spend limits and distinguish `not-run` from success or failure.
  4. Root, package, CLI, protocol, migration, and release documentation matches the shipped v1.6 APIs, versions, and compatibility behavior.
  5. Production comments retain durable technical rationale without workflow-history narration, and CI enforces the rule with narrow documented exclusions.

**Plans:** TBD

## Progress

**Execution Order:** Phase 57 -> Phase 58 -> Phase 59 -> Phase 60 -> Phase 61 -> Phase 62

| Phase | Milestone | Plans Complete | Status | Completed |
| --- | --- | --- | --- | --- |
| 57. Protocol Semantics | v1.6 | 2/2 | Complete    | 2026-07-16 |
| 58. Conformance and Client Migration | v1.6 | 3/6 | In Progress|  |
| 59. Authoritative Runtime State | v1.6 | 0/TBD | Not started | - |
| 60. Audit, Evaluation, and Cost Integrity | v1.6 | 0/TBD | Not started | - |
| 61. Agent Receipt Closure | v1.6 | 0/TBD | Not started | - |
| 62. Operational Interop and Hygiene | v1.6 | 0/TBD | Not started | - |
