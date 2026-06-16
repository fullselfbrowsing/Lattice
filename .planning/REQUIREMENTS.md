# Requirements: Lattice

**Defined:** 2026-06-15
**Milestone:** v1.4 Provider Breadth + Live Multimodal + Observability Export
**Core Value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.

## v1.4 Requirements

### Package Hygiene and Public Surface (`PKG-*`)

- [x] **PKG-01**: `latticeVersion` and the `lattice` CLI banner report the package version from the built package metadata instead of the hardcoded `"0.0.0"` placeholder.
- [x] **PKG-02**: Every new v1.4 public export is covered by runtime public-surface smoke tests, package type tests, `publint`, and `@arethetypeswrong/cli` before release.
- [x] **PKG-03**: The package build keeps optional v1.4 integrations out of the core runtime dependency tree unless the integration is part of the always-on core surface.

### Gateway Delegation and Provider Breadth (`GATE-*`)

- [x] **GATE-01**: Developer can create a LiteLLM-backed provider with a first-class `createLiteLLMProvider` helper that delegates to the existing OpenAI-compatible provider path.
- [x] **GATE-02**: Developer can pass gateway policy fields such as route tags, provider preference, and gateway metadata without losing Lattice's deterministic router decision.
- [x] **GATE-03**: Execution plans and run events record when a run used a gateway adapter and preserve the Lattice-selected adapter/model decision separately from gateway-internal routing.

### OpenRouter Fallback and Catalog Refresh (`ORCAT-*`)

- [x] **ORCAT-01**: Developer can configure OpenRouter model fallback arrays through the existing OpenRouter adapter without adding `@openrouter/sdk` as a runtime dependency.
- [x] **ORCAT-02**: Lattice records the resolved model returned by OpenRouter in the run result, execution plan, and terminal receipt when the gateway serves a fallback model.
- [x] **ORCAT-03**: Capability catalog refresh consumes OpenRouter model metadata deterministically and produces a diffable registry update rather than mutating routing data silently at runtime.
- [x] **ORCAT-04**: Catalog refresh captures model context window, pricing, supported modalities, and supported parameters where the OpenRouter feed provides them.
- [x] **ORCAT-05**: Catalog refresh failures never make PR-time CI flaky; scheduled or manual refresh jobs report skip/fallback status explicitly.
- [x] **ORCAT-06**: Router tests prove gateway fallback metadata does not make Lattice route selection opaque or non-replayable.

### Streaming Contract (`STRM-*`)

- [x] **STRM-01**: `ProviderAdapter` gains an additive optional `executeStream?` method and typed stream chunk union without changing the existing `execute()` contract.
- [x] **STRM-02**: `collectStream()` converts a provider stream into the existing `ProviderRunResponse` shape and is the only supported path from streaming output into receipt issuance.
- [x] **STRM-03**: Streaming receipt issuance happens only after the stream drains, and `outputHash` is computed over the assembled final output rather than provider chunk boundaries.
- [x] **STRM-04**: Streaming run events bracket the stream with start, complete, and failed markers without emitting one `RunEvent` per token.
- [x] **STRM-05**: Property/regression tests prove equivalent final text with different chunk boundaries produces the same signed output hash.

### Streaming Adapter Implementations (`SADAPT-*`)

- [x] **SADAPT-01**: Anthropic adapter implements `executeStream?` with normalized text and tool-input deltas.
- [x] **SADAPT-02**: Gemini adapter implements `executeStream?` with normalized text and function-call deltas.
- [x] **SADAPT-03**: xAI, OpenRouter, and LM Studio adapters implement `executeStream?` through their OpenAI-compatible stream paths where available.
- [x] **SADAPT-04**: Streaming parity tests cover all seven logical providers, including non-streaming fallback behavior for adapters or models that do not support streaming.

### Multimodal and Realtime Direction (`MMRT-*`)

- [x] **MMRT-01**: Anthropic request shaping maps Lattice image artifacts to Anthropic Messages content blocks using inline, URL, or file-id transport according to artifact metadata.
- [x] **MMRT-02**: Gemini request shaping maps image, audio, and video artifacts to Gemini `parts[]` using inline data or file references according to artifact metadata.
- [x] **MMRT-03**: Provider packaging records multimodal transformations so execution plans explain every inline/base64/upload/file-reference choice.
- [x] **MMRT-04**: Lattice exposes an interface-level realtime session design that separates bidirectional WebSocket sessions from single-shot `ai.run()` calls.
- [x] **MMRT-05**: Realtime direction defines how OpenAI Realtime and Gemini Live session summaries/checkpoints would be signed without claiming full realtime production support in v1.4.

### Receipt Provenance and Signing (`REC-*`)

- [x] **REC-01**: Receipt schema gains an additive lineage merkle-root field that commits to the artifact lineage graph without embedding private artifact content.
- [x] **REC-02**: Receipt verification preserves backward compatibility for v1.1/v1.2 receipts while accepting the new v1.3 receipt shape.
- [x] **REC-03**: Runtime receipt issuance includes lineage merkle roots for normal runs, streaming runs after collection, and crew child receipts where lineage is available.
- [x] **REC-04**: KMS signer interfaces let production users adapt AWS KMS, Google Cloud KMS, or an equivalent remote signer to the existing `ReceiptSigner` contract without adding provider SDKs to core.
- [x] **REC-05**: KMS signer tests prove bytes sent to remote signers are the canonical DSSE/PAE bytes and that public-key metadata still verifies through existing `KeySet` logic.

### OpenTelemetry Export (`OTEL-*`)

- [x] **OTEL-01**: `createOtelRunEventSink` maps Lattice `RunEventKind` events into OpenTelemetry spans/span events without using the hook pipeline as the primary exporter boundary.
- [x] **OTEL-02**: The OTel exporter emits stable `gen_ai.*` and `lattice.*` attributes for provider, model, usage, route, plan, run id, and receipt CID.
- [x] **OTEL-03**: Span sanitization defaults to no raw prompt/output/artifact content and provides an explicit opt-in content capture mode.
- [x] **OTEL-04**: Langfuse and Phoenix setup helpers or docs show how to send Lattice traces through standard OTLP without making either SDK a core dependency.
- [x] **OTEL-05**: Exporter tests prove run, stage, provider attempt, fallback, validation, tool, recovery, streaming, and capability-negotiation events map predictably.

### Eval and Diagnostics CLI (`EVAL-*`)

- [ ] **EVAL-01**: `lattice eval --agent` or an equivalent `lattice eval agent` command wraps the existing `evalAgentRun` kernel with fixture discovery, baseline loading, and JSON reporting.
- [ ] **EVAL-02**: Agent eval reports include iterations-to-goal and cost regression outcomes without breaking the existing `lattice-eval/v1` receipt replay report.
- [ ] **EVAL-03**: `lattice receipt diff` compares two receipt envelopes and reports model, route, usage, hashes, lineage, parent receipt, and signature/key differences.
- [ ] **EVAL-04**: LM Studio latency-tail diagnostics summarize local provider latency distributions from run events without sending data to any hosted service.

### Showcase, Dogfood, and Release Validation (`VAL-*`)

- [ ] **VAL-01**: The agent-loop or work-inbox showcase includes streaming, gateway, observability, and failure-mode scenarios that run offline with fake providers.
- [ ] **VAL-02**: FSB-via-npm dogfood is rerun against the v1.4 package candidate and explicitly checks new public exports, version stamping, and receipt compatibility.
- [ ] **VAL-03**: Tarball validation proves optional integrations do not leak unwanted native dependencies or install scripts into the core package.
- [ ] **VAL-04**: The milestone audit maps every v1.4 requirement to a phase summary, test evidence, or intentionally deferred scope item.

## Future Requirements

- Full production implementation of OpenAI Realtime and Gemini Live bidirectional sessions beyond the v1.4 interface-level design.
- Browser WebRTC realtime support; Lattice remains a server/runtime SDK and should not own browser media capture.
- Hosted gateway, hosted tracing dashboard, hosted eval dashboard, or managed control plane.
- Direct provider SDKs for every gateway-backed provider.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Hosted control plane | Conflicts with the standing SDK-first boundary and would turn v1.4 into a platform project. |
| Lattice-owned provider gateway | LiteLLM and OpenRouter already solve gateway routing, auth, budgets, and proxy operation. |
| Per-token OTel spans | High-cardinality telemetry would be expensive, noisy, and unsafe for prompt/content privacy. |
| Runtime catalog refresh on every `ai.run()` | Adds network latency and makes deterministic routing drift between plan and execution. |
| Hard dependency on Langfuse, Phoenix, or provider observability SDKs | OTel/OTLP is the integration boundary; vendor SDKs belong in host apps or optional docs. |
| Vendoring native media or realtime dependencies in core | Keeps the core install small and preserves edge/runtime compatibility. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PKG-01 | Phase 40 | Complete |
| PKG-02 | Phase 40 | Complete |
| PKG-03 | Phase 40 | Complete |
| GATE-01 | Phase 41 | Complete |
| GATE-02 | Phase 41 | Complete |
| GATE-03 | Phase 41 | Complete |
| ORCAT-01 | Phase 42 | Complete |
| ORCAT-02 | Phase 42 | Complete |
| ORCAT-03 | Phase 42 | Complete |
| ORCAT-04 | Phase 42 | Complete |
| ORCAT-05 | Phase 42 | Complete |
| ORCAT-06 | Phase 42 | Complete |
| STRM-01 | Phase 43 | Complete |
| STRM-02 | Phase 43 | Complete |
| STRM-03 | Phase 43 | Complete |
| STRM-04 | Phase 43 | Complete |
| STRM-05 | Phase 43 | Complete |
| SADAPT-01 | Phase 44 | Complete |
| SADAPT-02 | Phase 44 | Complete |
| SADAPT-03 | Phase 44 | Complete |
| SADAPT-04 | Phase 44 | Complete |
| MMRT-01 | Phase 45 | Complete |
| MMRT-02 | Phase 45 | Complete |
| MMRT-03 | Phase 45 | Complete |
| MMRT-04 | Phase 45 | Complete |
| MMRT-05 | Phase 45 | Complete |
| REC-01 | Phase 46 | Complete |
| REC-02 | Phase 46 | Complete |
| REC-03 | Phase 46 | Complete |
| REC-04 | Phase 46 | Complete |
| REC-05 | Phase 46 | Complete |
| OTEL-01 | Phase 47 | Complete |
| OTEL-02 | Phase 47 | Complete |
| OTEL-03 | Phase 47 | Complete |
| OTEL-04 | Phase 47 | Complete |
| OTEL-05 | Phase 47 | Complete |
| EVAL-01 | Phase 48 | Pending |
| EVAL-02 | Phase 48 | Pending |
| EVAL-03 | Phase 48 | Pending |
| EVAL-04 | Phase 48 | Pending |
| VAL-01 | Phase 49 | Pending |
| VAL-02 | Phase 49 | Pending |
| VAL-03 | Phase 49 | Pending |
| VAL-04 | Phase 49 | Pending |

**Coverage:**
- v1.4 requirements: 44 total
- Mapped to phases: 44
- Unmapped: 0

---
*Requirements defined: 2026-06-15*
*Last updated: 2026-06-15 after gsd-new-milestone*
