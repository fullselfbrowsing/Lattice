# v1.4 Milestone Evidence Matrix

**Generated:** 2026-06-16  
**Phase:** 49 — Showcase + FSB Dogfood Validation  
**Status:** Complete; no v1.4 requirement deferrals.

## Phase 49 Validation Evidence

- Offline v1.4 showcase: `pnpm example:v14-validation`
- FSB package-candidate dogfood: `node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation`
- Tarball hygiene: `pnpm check:package-version` and `pnpm check:tarball`
- Runtime package gates: `pnpm --filter @full-self-browsing/lattice test`, `typecheck`, `lint:packages`
- CLI package gates: `pnpm --filter @full-self-browsing/lattice-cli test`, `typecheck`, `lint:packages`

## Requirement Map

| Requirement | Status | Evidence |
|-------------|--------|----------|
| PKG-01 | Complete | Phase 40 summaries; `pnpm check:package-version` validates packed runtime `latticeVersion` and CLI help banner. |
| PKG-02 | Complete | Phase 40 summaries; runtime public-surface tests, package type tests, `publint`, and ATTW gates rerun in Phase 49. |
| PKG-03 | Complete | Phase 40 summaries; `scripts/check-core-package-boundary.mjs`; Phase 49 tarball native/install-script gate. |
| GATE-01 | Complete | Phase 41 summaries; `createLiteLLMProvider`; v1.4 showcase `scenario=v14-gateway`. |
| GATE-02 | Complete | Phase 41 summaries; gateway policy metadata tests; v1.4 showcase verifies sanitized route tags/metadata passthrough. |
| GATE-03 | Complete | Phase 41 summaries; runtime route/event accounting tests; v1.4 showcase verifies requested/observed gateway model metadata. |
| ORCAT-01 | Complete | Phase 42 summaries; OpenRouter fallback-array adapter tests. |
| ORCAT-02 | Complete | Phase 42 summaries; result, plan, event, and receipt resolved-model tests. |
| ORCAT-03 | Complete | Phase 42 summaries; deterministic catalog refresh/diff fixtures. |
| ORCAT-04 | Complete | Phase 42 summaries; catalog refresh metadata extraction coverage. |
| ORCAT-05 | Complete | Phase 42 summaries; scheduled/manual refresh skip/fallback status handling. |
| ORCAT-06 | Complete | Phase 42 summaries; router tests proving fallback metadata stays deterministic/replayable. |
| STRM-01 | Complete | Phase 43 summaries; additive `executeStream?` and stream chunk type tests. |
| STRM-02 | Complete | Phase 43 summaries; `collectStream()` tests and v1.4 dogfood generated smoke. |
| STRM-03 | Complete | Phase 43 summaries; streaming receipt sign-after-drain/output-hash tests. |
| STRM-04 | Complete | Phase 43 summaries; stream start/complete/failed event tests and v1.4 showcase. |
| STRM-05 | Complete | Phase 43 summaries; chunk-boundary invariant property/regression tests. |
| SADAPT-01 | Complete | Phase 44 summaries; Anthropic streaming tests. |
| SADAPT-02 | Complete | Phase 44 summaries; Gemini streaming tests. |
| SADAPT-03 | Complete | Phase 44 summaries; xAI, OpenRouter, and LM Studio OpenAI-compatible streaming tests. |
| SADAPT-04 | Complete | Phase 44 summaries; all-provider streaming parity tests. |
| MMRT-01 | Complete | Phase 45 summaries; Anthropic image request-shaping tests. |
| MMRT-02 | Complete | Phase 45 summaries; Gemini image/audio/video parts request-shaping tests. |
| MMRT-03 | Complete | Phase 45 summaries; provider packaging transform-evidence tests. |
| MMRT-04 | Complete | Phase 45 summaries; realtime session interface exports/type tests. |
| MMRT-05 | Complete | Phase 45 summaries; realtime receipt descriptor/checkpoint direction tests and deferral notes for full production realtime. |
| REC-01 | Complete | Phase 46 summaries; receipt v1.3 lineage merkle-root schema tests. |
| REC-02 | Complete | Phase 46 summaries; v1.1/v1.2 verification compatibility tests. |
| REC-03 | Complete | Phase 46 summaries; runtime, streaming, and crew lineage receipt tests; FSB v1.4 smoke verifies lineage round-trip. |
| REC-04 | Complete | Phase 46 summaries; remote/KMS signer interface tests without cloud SDK dependencies. |
| REC-05 | Complete | Phase 46 summaries; canonical DSSE/PAE bytes signer tests. |
| OTEL-01 | Complete | Phase 47 summaries; `createOtelRunEventSink` event-to-span tests; v1.4 showcase OTel scenario. |
| OTEL-02 | Complete | Phase 47 summaries; stable `gen_ai.*` and `lattice.*` attribute tests. |
| OTEL-03 | Complete | Phase 47 summaries; sanitizer default no-content tests. |
| OTEL-04 | Complete | Phase 47 summaries; Langfuse/Phoenix OTLP helper tests and exports; FSB v1.4 smoke checks helpers. |
| OTEL-05 | Complete | Phase 47 summaries; full run-event vocabulary mapping tests. |
| EVAL-01 | Complete | Phase 48 summaries; `lattice eval --agent` CLI tests. |
| EVAL-02 | Complete | Phase 48 summaries; agent eval iteration/cost report tests without breaking `lattice-eval/v1`. |
| EVAL-03 | Complete | Phase 48 summaries; `lattice receipt diff` tests for model, route, usage, hashes, lineage, parent receipt, and signatures. |
| EVAL-04 | Complete | Phase 48 summaries; `lattice diagnostics lm-studio` latency-tail tests. |
| VAL-01 | Complete | Phase 49 `examples/v14-validation` and `pnpm example:v14-validation` output for streaming, gateway, observability, and failure-mode scenarios. |
| VAL-02 | Complete | Phase 49 `scripts/dogfood-fsb-candidate.mjs` output: generated FSB v1.4 smoke plus compatible FSB provider smoke from packed candidate install. |
| VAL-03 | Complete | Phase 49 `pnpm check:tarball` output: install script and native/heavy dependency leak audit over packed runtime and CLI tarballs. |
| VAL-04 | Complete | This evidence matrix maps all 44 v1.4 requirements to phase summaries, tests, package checks, or scoped deferral notes. |

## Deferrals

No v1.4 requirement is deferred. Full production realtime implementation remains future scope as already stated by MMRT-05; v1.4 intentionally delivered the interface-level direction and receipt/checkpoint design.

