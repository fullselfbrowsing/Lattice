# v1.4 Research Summary — Provider Breadth + Live Multimodal + Observability Export

*Synthesis of STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md for Lattice milestone v1.4. Overall confidence: HIGH.*

## Executive Summary

Lattice v1.4 closes three competitive gaps (provider breadth, live/streaming multimodal, eval/observability export) using only **two net-new production packages** (`@opentelemetry/semantic-conventions` in a new `exporter-otel` package; `ws` as an optional peer for a future realtime adapter) and **zero new transport or routing abstractions**. Every addition is **additive against the frozen INV-03 7-provider parity contract**: streaming via `executeStream?` + a `collectStream()` buffer-then-sign; gateway delegation via a thin `createLiteLLMProvider` wrapper over the existing `createOpenAICompatibleProvider`; OpenRouter multi-model fallback via a `models[]` body field; OTel export as a `RunEventSink` factory (not a hook-band handler); and `lattice eval --agent` as a CLI flag over the already-shipped `evalAgentRun` kernel. Realtime audio/video (Gemini Live / OpenAI Realtime) is architecturally separate (bidirectional WebSocket), needs a distinct `RealtimeSession` surface, and is scoped as an **interface-level direction phase** after the core streaming critical path.

## Headline Decisions

| Decision | Rationale |
|---|---|
| `executeStream?` additive optional method, NOT a response-mode flag | Keeps `execute()` return type unchanged; no inference breakage for existing callers; matches the v1.3 `negotiateCapabilities?` / `quirks?` precedent. |
| `collectStream()` is the ONLY path from stream → `ProviderRunResponse` | Structurally prevents STRM-1 (sign-after-drain) and STRM-2 (hash assembled output, not chunk sequence) at the architecture level, not by convention. The `createReceipt()` pipeline stays **unmodified**. |
| `createLiteLLMProvider` = thin wrapper over `createOpenAICompatibleProvider` | LiteLLM speaks OpenAI-compatible HTTP; no new transport. `LiteLLMQuirks` follows the established `AdapterQuirks` pattern. |
| OpenRouter `fallbackModels[]` → `extra_body: { models: [...] }`, NOT a new SDK dep | The existing `openai` SDK + `extra_body` covers it; `@openrouter/sdk` adds nothing. |
| `allow_fallbacks: false` DEFAULT for capability-critical runs (GW-2) | Silent gateway fallback makes `lattice repro` replay the wrong path — the receipt would attest to a route that didn't run. |
| OTel exporter = `RunEventSink` factory (`createOtelRunEventSink`), NOT a hook-band handler | `RunEventSink` receives the full `RunEventKind` vocabulary (`provider.attempt`, `fallback.activated`, `capabilities.negotiation.fallback`); the hook pipeline fires on coarser events and would miss most spans. |
| `SpanSanitizer` ships as the default, content capture OFF | Emitting raw `RunEvent.metadata` as span attributes is a data breach, not a bug; mirrors the OTel GenAI "no prompt content by default" guidance and Lattice's own redaction discipline. |
| Semconv attribute names pinned as frozen constants, NOT runtime-imported | `gen_ai.prompt` / `gen_ai.completion` were removed in semconv v1.38; a runtime import makes dashboard breakage one dependency bump away. |
| `lattice eval --agent` = CLI flag calling existing `evalAgentRun` unchanged | The kernel JSDoc already names this as the intended CLI reuse; no runtime surface change. |
| Realtime audio/video = interface-level direction phase only in v1.4 | WebSocket bidirectional sessions are separate from SSE streaming; need a `RealtimeSession` surface + `RealtimeSessionReceipt` (session-summary-hash signing). Full impl deferred to v1.4.x. |

## Existential Pitfalls (must be acceptance criteria, not post-ship concerns)

| Code | Pitfall | Prevention |
|---|---|---|
| STRM-1 | Sign mid-stream instead of post-drain — `outputHash` commits to partial content | `collectStream()` is the only import path to `createReceipt()`; structurally enforced. |
| STRM-2 | Hash chunk sequence instead of assembled output — non-deterministic `outputHash` | `collectStream()` concatenates to a UTF-8 string before returning; fast-check property test asserts hash stability across chunk-boundary variations. |
| OTEL-2 | Raw `RunEvent.metadata` emitted as span attributes — PII breach via the observability platform | `SpanSanitizer` interface + default PII-stripping impl; content capture defaults OFF. |
| OTEL-1 | Runtime import of GenAI semconv constants — dashboard breakage on a minor bump | Frozen constant map in the exporter; `semconvVersion` option; CI diff test. |
| GW-2 | Gateway silent fallback breaks plan integrity — receipt attests to the wrong route | `allow_fallbacks: false` default for capability-critical runs; `router.mismatch` event; `attemptNumber` increments on fallback. |
| VAL-1 | FSB dogfooding covers only the API slice FSB uses — new v1.4 exports regress silently | A `public-surface.test.ts` entry required in the same PR as every new export; `publint` + `attw` on the tarball in CI. |

## Net-New Production Dependencies (entire milestone)

| Package | Version | Scope |
|---|---|---|
| `@opentelemetry/semantic-conventions` | `1.41.1` | new `exporter-otel` package (constants only; pin + wrap) |
| `ws` (+ `@types/ws`) | `8.21.0` | optional peer in a future realtime adapter package only |

Everything else uses native Node 24 APIs or the existing SDK surface. `@opentelemetry/sdk-node` stays a host-app dep; the exporter package peer-deps only on the stable `@opentelemetry/api@^1.9.0`.

## Proposed Phase Ordering (Phases 40–49)

| Phase | Name | Notes |
|---|---|---|
| 40 | Package Version Stamping + Public-Surface Guardrails | Small cleanup first; prevents the known FSB-reported `0.0.0` regression from leaking into v1.4 surfaces. |
| 41 | Gateway Delegation — LiteLLM + Gateway Policy | Low-code; closes GW risks before streaming widens the surface. |
| 42 | OpenRouter Fallback + Catalog Refresh | `models[]` body field; resolved-model accounting; deterministic catalog refresh/diff. |
| 43 | Streaming Contract + `collectStream()` | **Must freeze before any adapter implements `executeStream()`** (STRM-1/2). |
| 44 | Streaming Adapter Implementations | Anthropic, Gemini, xAI, OpenRouter, LM Studio. |
| 45 | Multimodal Request Shaping + Realtime Direction | Anthropic/Gemini artifact shaping plus interface-level realtime seams. |
| 46 | Receipt Provenance + KMS Signer Shapes | Lineage merkle root and signer adapters build on existing receipt spine. |
| 47 | OTel `RunEventSink` Exporter + Langfuse/Phoenix factories | `SpanSanitizer` + `BatchSpanProcessor` gating; receipt-CID span attribute is the differentiator. |
| 48 | Eval + Diagnostics CLI Expansion | `lattice eval --agent`, `lattice receipt diff`, LM Studio latency tails. |
| 49 | Showcase + FSB Dogfood Validation | Multi-scenario agent-loop/work-inbox validation and tarball/public-surface checks. |

**Ordering rationale:** 40 clears the known version-stamping defect before new public exports. 41–42 close gateway/catalog integrity risks. 43 must precede 44 so streaming receipt semantics are structurally enforced before adapters ship. 45 co-evolves multimodal shaping with realtime direction. 46–48 are largely independent after the core run/receipt/event contracts exist. 49 validates the whole milestone through examples, package checks, and FSB dogfooding.

## Research Flags & Gaps

- **Phase 48 needs `--research-phase`:** Gemini Live `ai.live.connect()` TS method signature (MEDIUM confidence — verify against installed `@google/genai`); OpenAI Realtime session event types need confirmation.
- **Pre-Phase-40:** run a `public-surface.test.ts` audit of all current public exports to operationalize VAL-1 from the first PR.
- **OpenAI Realtime audio:** PCM 16-bit/24kHz has no `Artifact` MIME subtype yet — needs an `audio/pcm` subtype/alias.
- **LM Studio streaming:** currently `streaming: false`; `executeStream?` feasibility needs validation against the live local server.
- **Build-time vs runtime catalog refresh:** CI code-gen PR (determinism-safe, source-controlled `registry.generated.ts`) vs runtime TTL refresh (convenient) — decide in Phase 40.

## FSB-findings hook

Per the milestone plan, the maintainer will contribute **FSB-via-npm integration findings** at the requirements gate; those bear directly on Theme 1 (catalog maintenance / gateway delegation) and should be folded into the Phase 40 requirements.

*Ready for requirements definition and roadmap creation.*
