# Requirements: Lattice v1.6 Protocol and Runtime Integrity Bridge

**Defined:** 2026-07-16
**Core Value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Milestone Goal:** Correct Lattice's protocol and execution semantics while preserving bounded compatibility for existing receipts.

## v1.6 Requirements

### Receipt Bridge

- [x] **SIGBR-01**: A TypeScript or Python caller can mint a new receipt whose signature uses standard DSSE PAE over the canonical payload bytes.
- [x] **SIGBR-02**: A caller can identify every corrected write by the signed `lattice-receipt/v1.4` body version and `dsse-v1` signature profile.
- [x] **SIGBR-03**: A verifier can allow or reject legacy base64-PAE receipts through explicit policy and receives the profile and deprecation state that actually verified.
- [x] **SIGBR-04**: A corrected-profile receipt cannot enter the legacy verification branch after standard signature failure.
- [x] **SIGBR-05**: A caller cannot mint a legacy base64-PAE receipt through any public or internal production API.
- [x] **SIGBR-06**: A verifier evaluates schema version, signature profile, CID, key selection, and downgrade rules as independent security checks.

### Conformance

- [x] **CONF16-01**: An implementer can use the specification, schemas, examples, and migration guide to reproduce both standard verification and the bounded legacy bridge without reading production source.
- [x] **CONF16-02**: A conformance consumer can distinguish immutable legacy vectors from standard positive and adversarial negative vectors.
- [x] **CONF16-03**: TypeScript and Python callers can reciprocally mint and verify standard-profile receipts.
- [x] **CONF16-04**: CI validates standard PAE behavior against the independent `securesystemslib==1.4.0` test oracle without adding a runtime dependency.
- [x] **CONF16-05**: CLI verification and replay report the verified signature profile and can enforce standard-only verification.
- [x] **CONF16-06**: CI rejects stale manifests, generated artifacts, cross-language drift, independent-oracle failures, and packed-consumer incompatibility.

### Context Authority

- [x] **CTXAUTH-01**: A provider receives exactly the materialized context projection selected by the execution plan.
- [x] **CTXAUTH-02**: A provider never receives omitted, archived, or raw summarized artifacts.
- [x] **CTXAUTH-03**: A summarizer receives only selected source artifacts, and each resulting summary preserves source lineage, privacy, and trust metadata.
- [x] **CTXAUTH-04**: A caller can include policy-permitted session turns and stored artifact references in provider context with explicit missing-reference behavior.
- [x] **CTXAUTH-05**: Each fallback attempt materializes and packages context against that route's limits and capabilities before its provider call.
- [x] **CTXAUTH-06**: Plans, hashes, receipts, traces, and events describe the same provider-visible context projection.

### Persistence

- [x] **PERSIST-01**: A configured artifact store receives lifecycle writes for input, summary, tool, derived, and provider-output artifacts.
- [x] **PERSIST-02**: Runtime results and session records expose store-returned references and fingerprints instead of fabricated storage metadata.
- [x] **PERSIST-03**: A run reports unconfigured persistence as skipped and returns typed outcomes for configured write or load failures.
- [x] **PERSIST-04**: Tenant, privacy, retention, and upload policy is enforced before an artifact is persisted or rehydrated.

### Audit and Evaluation

- [x] **AUDIT16-01**: A caller can select `off`, `best-effort`, or `required` receipt issuance policy without changing provider behavior.
- [x] **AUDIT16-02**: A required-receipt run without a signer fails before any provider execution.
- [x] **AUDIT16-03**: A signing failure after provider execution returns a typed audit failure with safe diagnostics and never retries the provider.
- [x] **AUDIT16-04**: Runtime, agent, and crew terminal paths apply the selected receipt policy consistently.
- [x] **EVAL16-01**: Evaluation reports every load, verification, materialization, and replay failure and exits with code 2 when any is present.
- [x] **EVAL16-02**: Baseline initialization writes no baseline when any input fixture is invalid or unevaluable.

### Cost Integrity

- [x] **PRICE-01**: All pre-execution callers use one estimator that normalizes preferred per-1k and legacy per-1M pricing hints.
- [x] **PRICE-02**: Every estimate preserves the distinction between a known zero cost and unknown cost.
- [x] **PRICE-03**: Route policy and contract budgets produce the same decision for identical route, token, and budget inputs.
- [x] **PRICE-04**: Plans, agents, crews, diagnostics, routing, and contract preflight consume the shared estimator rather than duplicate formulas.

### Agent Evidence

- [ ] **AGREC-01**: Each agent iteration record exposes the receipt envelope that attests that iteration when one is issued.
- [ ] **AGREC-02**: Terminal agent success and failure results expose their terminal receipt when one is issued.
- [ ] **AGREC-03**: Resumed agent execution uses stable iteration identity and does not duplicate previously issued receipts.
- [ ] **AGREC-04**: Crew receipt arrays and CIDs reference the same envelopes in documented order without duplicate minting.

### Operational Closure

- [ ] **OPSVAL-01**: A clean consumer can install and use packed runtime and CLI artifacts on every supported Node line.
- [ ] **OPSVAL-02**: Scheduled or manually dispatched canaries validate representative OpenAI-compatible, Anthropic, and Gemini wire families.
- [ ] **OPSVAL-03**: Each canary enforces token, time, retry, and spend limits and reports `not-run` distinctly from success or failure.
- [ ] **DOC16-01**: Root, package, CLI, protocol, migration, and release documentation matches the shipped v1.6 APIs, versions, and compatibility behavior.
- [ ] **HYGIENE-01**: Production comments explain durable technical constraints without phase, plan, milestone, or workflow-history narration.
- [ ] **HYGIENE-02**: CI scans workflow-specific production comment tokens with narrow documented exclusions while preserving durable rationale and archived history.

## Future Requirements

### Legacy Sunset

- **SUNSET-01**: Legacy verification becomes opt-in or is removed after measured usage and a separately announced deprecation window.
- **SUNSET-02**: Compatibility telemetry can support an evidence-based legacy removal decision without exposing receipt contents.

### Distribution and Language Breadth

- **PYPUB-01**: The Python client publishes to PyPI through trusted publishing with provenance.
- **LANG-01**: An additional language client verifies the standard conformance corpus.

### Runtime Expansion

- **STORE-F01**: Production storage backends implement the corrected persistence lifecycle.
- **CANARY-F01**: Live canaries expand by provider, model, and modality where mock coverage cannot detect protocol drift.
- **TYPE-F01**: Required receipt mode narrows result types at compile time after runtime behavior stabilizes.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Re-signing or mutating historical receipts | Historical evidence must remain immutable and verifiable through the labeled compatibility bridge. |
| Continued legacy receipt issuance | v1.6 compatibility is read-only; all new writers use standard DSSE. |
| Silent or universal dual verification | It creates an unobservable downgrade path and prevents measuring migration debt. |
| New storage backends or hosted migration services | Existing storage configuration must work correctly before the adapter surface expands. |
| Pricing ingestion, billing, or decimal settlement services | This milestone unifies deterministic estimate semantics, not commercial billing infrastructure. |
| New agent or crew orchestration features | Existing public evidence contracts must become truthful before orchestration expands. |
| PyPI publication as part of the protocol correction | Conformance and client behavior can ship independently of a distribution milestone. |
| Live calls for every provider, model, and modality | Representative wire-family canaries provide bounded signal without uncontrolled cost or flakiness. |
| Blanket deletion of comments or archived planning history | Only workflow-specific production narration is rewritten; durable rationale and historical records remain. |

## Traceability

Roadmap creation maps each requirement to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIGBR-01 | Phase 57 | Complete |
| SIGBR-02 | Phase 57 | Complete |
| SIGBR-03 | Phase 57 | Complete |
| SIGBR-04 | Phase 57 | Complete |
| SIGBR-05 | Phase 57 | Complete |
| SIGBR-06 | Phase 57 | Complete |
| CONF16-01 | Phase 58 | Complete |
| CONF16-02 | Phase 58 | Complete |
| CONF16-03 | Phase 58 | Complete |
| CONF16-04 | Phase 58 | Complete |
| CONF16-05 | Phase 58 | Complete |
| CONF16-06 | Phase 58 | Complete |
| CTXAUTH-01 | Phase 59 | Complete |
| CTXAUTH-02 | Phase 59 | Complete |
| CTXAUTH-03 | Phase 59 | Complete |
| CTXAUTH-04 | Phase 59 | Complete |
| CTXAUTH-05 | Phase 59 | Complete |
| CTXAUTH-06 | Phase 59 | Complete |
| PERSIST-01 | Phase 59 | Complete |
| PERSIST-02 | Phase 59 | Complete |
| PERSIST-03 | Phase 59 | Complete |
| PERSIST-04 | Phase 59 | Complete |
| AUDIT16-01 | Phase 60 | Complete |
| AUDIT16-02 | Phase 60 | Complete |
| AUDIT16-03 | Phase 60 | Complete |
| AUDIT16-04 | Phase 60 | Complete |
| EVAL16-01 | Phase 60 | Complete |
| EVAL16-02 | Phase 60 | Complete |
| PRICE-01 | Phase 60 | Complete |
| PRICE-02 | Phase 60 | Complete |
| PRICE-03 | Phase 60 | Complete |
| PRICE-04 | Phase 60 | Complete |
| AGREC-01 | Phase 61 | Pending |
| AGREC-02 | Phase 61 | Pending |
| AGREC-03 | Phase 61 | Pending |
| AGREC-04 | Phase 61 | Pending |
| OPSVAL-01 | Phase 62 | Pending |
| OPSVAL-02 | Phase 62 | Pending |
| OPSVAL-03 | Phase 62 | Pending |
| DOC16-01 | Phase 62 | Pending |
| HYGIENE-01 | Phase 62 | Pending |
| HYGIENE-02 | Phase 62 | Pending |

**Coverage:**

- v1.6 requirements: 42 total
- Mapped to phases: 42
- Unmapped: 0

---
*Requirements defined: 2026-07-16*
*Last updated: 2026-07-16 after roadmap creation*
