# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md` · `.planning/milestones/v1.2-MILESTONE-AUDIT.md` |
| v1.3 Public Release + Model-Aware SDK + Multi-Agent Surface | Shipped | 2026-06-15 | `.planning/milestones/v1.3-ROADMAP.md` · `.planning/milestones/v1.3-REQUIREMENTS.md` · `.planning/milestones/v1.3-MILESTONE-AUDIT.md` |
| v1.4 Provider Breadth + Live Multimodal + Observability Export | Active | — | `.planning/REQUIREMENTS.md` · `.planning/research/SUMMARY.md` |

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

</details>

### v1.4 Provider Breadth + Live Multimodal + Observability Export (active)

**Goal:** Close the three library-native competitive gaps found vs Mastra / OpenRouter / Portkey / Google ADK / Langfuse — provider breadth via gateway delegation + an auto-refreshing capability catalog, live/streaming multimodal, and eval + OpenTelemetry observability export — without becoming a platform.

**Phase span:** 40 to 49 (10 phases, 44 REQ-IDs).
**Granularity:** coarse (per `.planning/config.json`).
**Coverage:** 44 / 44 planned REQ-IDs authored in `.planning/REQUIREMENTS.md`; 0 / 44 complete.

**Reference docs driving v1.4:**
- `.planning/research/SUMMARY.md` — v1.4 synthesis across stack, features, architecture, and pitfalls.
- `.planning/REQUIREMENTS.md` — source of truth for v1.4 REQ-IDs and traceability.
- `.planning/STATE.md` — FSB-via-npm validation status and remaining version-stamping follow-up.

- [x] **Phase 40: Package Version Stamping + Public-Surface Guardrails** — Fix the known `0.0.0` version-stamping defect and harden package/public-surface checks before adding new v1.4 exports. (completed 2026-06-15)
- [ ] **Phase 41: Gateway Delegation — LiteLLM + Gateway Policy** — Add a first-class LiteLLM provider helper and gateway policy passthrough while preserving deterministic Lattice route accounting.
- [ ] **Phase 42: OpenRouter Fallback + Capability Catalog Refresh** — Add OpenRouter fallback model arrays, resolved-model accounting, and deterministic catalog refresh/diff behavior.
- [ ] **Phase 43: Streaming Contract + collectStream** — Freeze the additive streaming adapter contract and prove sign-after-drain receipt semantics before any streaming adapter ships.
- [ ] **Phase 44: Streaming Adapter Implementations** — Implement normalized streaming across Anthropic, Gemini, xAI, OpenRouter, and LM Studio with all-provider parity coverage.
- [ ] **Phase 45: Multimodal Request Shaping + Realtime Direction** — Map Lattice artifacts into Anthropic/Gemini multimodal request shapes and define realtime session/checkpoint interfaces.
- [ ] **Phase 46: Receipt Provenance + KMS Signer Shapes** — Extend receipts with lineage merkle roots and define production signer adapter shapes without pulling KMS SDKs into core.
- [ ] **Phase 47: OpenTelemetry Exporter + Langfuse/Phoenix Paths** — Export Lattice run events to OTel spans with safe defaults, receipt links, and documented OTLP setup for Langfuse/Phoenix.
- [ ] **Phase 48: Eval + Diagnostics CLI Expansion** — Add agent eval CLI support, receipt diffing, and LM Studio latency-tail diagnostics.
- [ ] **Phase 49: Showcase + FSB Dogfood Validation** — Prove the v1.4 surface through offline examples, tarball checks, and FSB-via-npm dogfood validation.

## Phase Details

### Phase 40: Package Version Stamping + Public-Surface Guardrails

**Goal**: Known package identity surfaces report the actual package version, and every future v1.4 public export has a guardrail before the milestone adds new APIs.
**Depends on**: Nothing.
**Requirements**: PKG-01, PKG-02, PKG-03
**Success Criteria**:

1. `latticeVersion` and `lattice --help` report the built package version from package metadata, not `"0.0.0"`.
2. Runtime tests, CLI tests, and package type tests cover the version surfaces.
3. Public-surface tests are updated so every new v1.4 root export must be deliberately asserted.
4. `pnpm -r build`, `pnpm -r test`, `pnpm -r test:types`, and `pnpm -r lint:packages` pass or any skipped gate is explicitly documented.

**Plans**: TBD

### Phase 41: Gateway Delegation — LiteLLM + Gateway Policy

**Goal**: Developers can point Lattice at LiteLLM or another OpenAI-compatible gateway without losing Lattice's deterministic route plan, event trail, or policy accounting.
**Depends on**: Phase 40
**Requirements**: GATE-01, GATE-02, GATE-03
**Success Criteria**:

1. `createLiteLLMProvider` delegates to `createOpenAICompatibleProvider` and requires no Python SDK or gateway runtime dependency in Lattice.
2. Gateway metadata/policy fields can be passed through in a typed, additive way.
3. Execution plans and run events distinguish Lattice-selected provider/model from gateway-internal routing hints.
4. Fake-fetch tests cover LiteLLM-style base URLs, headers, request bodies, error taxonomy, and usage normalization.

**Plans**:

- **Wave 1:** `41-01` — Gateway policy + LiteLLM provider helper.
- **Wave 2** *(blocked on Wave 1 completion)*: `41-02` — Runtime route/event accounting.
- **Wave 3** *(blocked on Waves 1-2 completion)*: `41-03` — Public surface, provider parity, and release hygiene closure.

### Phase 42: OpenRouter Fallback + Capability Catalog Refresh

**Goal**: OpenRouter can handle multi-model fallback while Lattice records the actual model that served the request and keeps model capability metadata refreshable without runtime opacity.
**Depends on**: Phase 41
**Requirements**: ORCAT-01, ORCAT-02, ORCAT-03, ORCAT-04, ORCAT-05, ORCAT-06
**Success Criteria**:

1. OpenRouter adapter accepts fallback model arrays and serializes them using the documented OpenRouter `models`/`extra_body` path.
2. Result, plan, event, and receipt metadata record the resolved model returned by OpenRouter.
3. Catalog refresh produces deterministic, reviewable registry diffs from OpenRouter model metadata.
4. Scheduled/manual refresh failures are non-flaky and visibly reported.
5. Router tests prove gateway fallback does not make Lattice route choice opaque.

**Plans**: TBD

### Phase 43: Streaming Contract + collectStream

**Goal**: Streaming is an additive provider capability whose final outputs still produce the same replayable, signed result contract as non-streaming runs.
**Depends on**: Phase 40
**Requirements**: STRM-01, STRM-02, STRM-03, STRM-04, STRM-05
**Success Criteria**:

1. `ProviderAdapter.executeStream?` and normalized stream chunk types ship as optional public types.
2. `collectStream()` is the tested bridge from `AsyncIterable` stream to `ProviderRunResponse`.
3. Receipts are issued only after stream collection and hash the assembled final output.
4. Stream event kinds bracket the stream without per-token event flooding.
5. Property tests prove chunk-boundary variation does not change final output hashes.

**Plans**: TBD

### Phase 44: Streaming Adapter Implementations

**Goal**: The five v1.2-era provider adapters that support streaming expose the normalized `executeStream?` path with provider-specific parsing hidden behind one Lattice stream contract.
**Depends on**: Phase 43
**Requirements**: SADAPT-01, SADAPT-02, SADAPT-03, SADAPT-04
**Success Criteria**:

1. Anthropic and Gemini stream text and tool/function-call deltas through the normalized chunk union.
2. xAI, OpenRouter, and LM Studio stream through their OpenAI-compatible paths where the provider supports it.
3. Non-streaming or unavailable models fail predictably or fall back to non-streaming behavior according to policy.
4. All seven logical providers remain compatible with the INV-03 parity expectations.

**Plans**: TBD

### Phase 45: Multimodal Request Shaping + Realtime Direction

**Goal**: Lattice artifacts map cleanly into Anthropic and Gemini multimodal requests, and realtime audio/video gets an explicit direction without pretending it is the same as single-shot streaming.
**Depends on**: Phase 43
**Requirements**: MMRT-01, MMRT-02, MMRT-03, MMRT-04, MMRT-05
**Success Criteria**:

1. Anthropic request builder packages image artifacts into supported content blocks with transform evidence in the provider packaging plan.
2. Gemini request builder packages image/audio/video artifacts into `parts[]` with transform evidence in the provider packaging plan.
3. Multimodal packaging tests cover inline, URL, file-id/file-reference, MIME, privacy, and size-policy branches.
4. Realtime session interfaces and checkpoint receipt design are documented and type-tested as direction-level surfaces.
5. v1.4 docs explicitly defer full production realtime implementation beyond the interface/design phase.

**Plans**: TBD

### Phase 46: Receipt Provenance + KMS Signer Shapes

**Goal**: Receipts can commit to full artifact lineage and production deployments can adapt remote signing infrastructure without weakening existing verification.
**Depends on**: Phase 43, Phase 45
**Requirements**: REC-01, REC-02, REC-03, REC-04, REC-05
**Success Criteria**:

1. Receipt schema accepts lineage merkle roots while preserving v1.1/v1.2 verification compatibility.
2. Runtime receipt issuance computes lineage roots where lineage metadata exists.
3. Streaming and crew receipt tests cover lineage-root inclusion after stream collection/child completion.
4. KMS signer interfaces adapt to the existing `ReceiptSigner` contract without adding cloud SDKs to core.
5. Tests prove the canonical DSSE/PAE bytes are what remote signer adapters receive.

**Plans**: TBD

### Phase 47: OpenTelemetry Exporter + Langfuse/Phoenix Paths

**Goal**: Lattice run events export to standard OTel/OTLP traces with safe defaults and verifiable receipt pointers, letting users inspect runs in Langfuse, Phoenix, or their existing OTel backend.
**Depends on**: Phase 43
**Requirements**: OTEL-01, OTEL-02, OTEL-03, OTEL-04, OTEL-05
**Success Criteria**:

1. `createOtelRunEventSink` maps Lattice events to spans/span events using stable `gen_ai.*` and `lattice.*` attributes.
2. Span sanitizer defaults exclude raw prompt/output/artifact content and require explicit opt-in for content capture.
3. Receipt CID/signature references are attached where available.
4. Langfuse and Phoenix OTLP setup paths are documented or exposed through thin helpers without hard SDK dependencies.
5. Tests cover the full current event vocabulary, including streaming and recovery/capability fallback events.

**Plans**: TBD

### Phase 48: Eval + Diagnostics CLI Expansion

**Goal**: The CLI can gate agent regressions and compare receipts while local-provider diagnostics become inspectable without adding hosted observability.
**Depends on**: Phase 46, Phase 47
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04
**Success Criteria**:

1. `lattice eval --agent` or `lattice eval agent` loads fixtures/baselines and reports `evalAgentRun` regressions as JSON.
2. Agent eval does not break existing `lattice-eval/v1` receipt replay reports.
3. `lattice receipt diff` compares model, route, usage, hashes, lineage, parent receipt, and signature/key fields.
4. LM Studio latency-tail diagnostics summarize local provider latency from run events.
5. CLI tests cover success, regression, malformed fixture, and diff mismatch paths.

**Plans**: TBD

### Phase 49: Showcase + FSB Dogfood Validation

**Goal**: v1.4 is proven through offline examples, package-level validation, and FSB as a real npm downstream consumer before the milestone closes.
**Depends on**: Phases 40-48
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04
**Success Criteria**:

1. Offline showcase scenarios exercise streaming, gateway, observability, and failure-mode behavior with fake providers.
2. FSB-via-npm dogfood validates the v1.4 package candidate, including new exports and version stamping.
3. Tarball checks prove optional integrations do not leak unwanted native deps or install scripts into core.
4. Milestone audit maps every v1.4 requirement to evidence, a summary, or an explicit deferral.

**Plans**: TBD
