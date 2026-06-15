# Feature Research

**Domain:** TypeScript SDK capability runtime — v1.4 Provider Breadth + Live Multimodal + Eval/Observability
**Researched:** 2026-06-15
**Confidence:** HIGH for gateway delegation and OTel export (verified against official docs + multiple credible sources); MEDIUM for realtime/Live API (official docs clear but TypeScript-specific surface thin); MEDIUM for eval/agent CLI extension (existing surface inspected, downstream pattern research verified)

> Scope note: v1.0–v1.3 features are shipped and treated as given. This file covers ONLY the three v1.4 themes. The existing surface that v1.4 extends is: 7 `ProviderAdapter` implementations (openai, openai-compat, anthropic, gemini, xai, openrouter, lm-studio), a `RunEventKind` tracing union (20 literals including step.transition, recovery.*, capabilities.negotiation.fallback), a `lattice eval` command with baseline-relative cost/quality gating, and `evalAgentRun` kernel. No feature below recreates any of these.

---

## Theme 1 — Provider Breadth + Capability-Catalog Maintenance

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Streaming text responses across all 5 newer adapters (Anthropic, Gemini, xAI, OpenRouter, LM Studio) | Every comparable SDK (Vercel AI SDK, LangChain, LiteLLM) surfaces streaming as the default; synchronous is the edge case | MEDIUM (per-adapter SSE/stream parsing, uniform `AsyncIterable<string>` contract) | Anthropic uses SSE with `message_start → content_block_start → content_block_delta (text_delta) → content_block_stop → message_stop` events. Gemini `generateContentStream` returns an async iterable over chunks. The existing openai-compat adapter already handles SSE; the newer adapters need equivalent wiring. Each partial-token event must not emit a new `RunEvent` — only `stage.start` and `stage.complete` bracket the stream. |
| Cross-provider streaming contract: `AsyncIterable<string>` from `ProviderAdapter.run()` | Without a uniform return, callers cannot consume partial tokens regardless of provider | LOW (type contract + iterator adapter) | The minimal contract: `{ stream: AsyncIterable<string>, usage: Promise<Usage> }` where `usage` resolves when the stream drains. This isolates streaming from replay / receipt signing (both need the full output). Lattice can buffer the stream internally for receipt generation while passing the live iterator to the caller. |
| OpenRouter multi-model fallback array (`models: [...]`) passed through to the OpenRouter adapter | OpenRouter natively supports passing a `models` array in priority order; fallback fires on context-length errors, moderation flags, rate limits, or downtime | LOW (additive option on existing `createOpenRouterProvider`) | The existing OpenRouter adapter sends to `/api/v1/chat/completions`. Adding a `fallbackModels?: string[]` option that serializes as `models: [primary, ...fallbackModels]` in the request body requires no new HTTP plumbing. The response includes a `model` field indicating which model was actually used; this should surface in the `RunEvent.modelId` for the `stage.complete` event so receipts accurately reflect the resolved model. |
| LiteLLM gateway delegation: treat a LiteLLM proxy as an `openai-compat` target with routing config passthrough | Developers already running LiteLLM want to point Lattice at it; LiteLLM exposes `/v1/chat/completions` exactly like OpenAI | LOW (documentation + optional `liteLLMHeaders` on existing openai-compat) | LiteLLM's proxy accepts `x-litellm-tags`, `x-litellm-routing-strategy` as headers and any OpenAI-compatible body. The existing `createOpenAICompatibleProvider` handles this without code changes; what's needed is (a) a `createLiteLLMProvider` factory that pre-configures sensible defaults and (b) documentation. No new transport code. |
| Auto-refresh capability catalog from the OpenRouter `/api/v1/models` feed | The current catalog (~337 static profiles) ages; the OpenRouter feed includes `context_length`, `pricing`, `input_modalities`, `output_modalities`, and `supported_parameters` per model | MEDIUM (scheduled fetch, JSON normalization, delta merge into registry) | The OpenRouter GET `/api/v1/models` response includes per-model: `id`, `context_length`, `pricing.prompt`, `pricing.completion`, `pricing.image`, `architecture.input_modalities`, `architecture.output_modalities`, `supported_parameters[]`. A TTL-based refresh (configurable, default 24h) that merges new profiles into `registry.generated.ts` at build time (or optionally at runtime) closes the hand-maintenance tax. Build-time code-gen is safer than runtime mutation of the registry. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Receipt accurately records the resolved model when OpenRouter fallback fires | Lattice's signed-receipt thesis: every run is verifiable. If the fallback chain resolves to `gryphe/mythomax-l2-13b` instead of `claude-3-5-sonnet`, the receipt must say so — not the primary model the caller requested | LOW (read `response.model` from OpenRouter response, write to receipt `modelId` + `modelClass`) | Ties directly to Lattice's core differentiator. Competitors (Vercel AI SDK, LiteLLM client) do not sign and record the resolved model. |
| Provider routing params forwarded into the Lattice `policy` object (OpenRouter `provider.sort`, `provider.only`, `provider.max_price`) | Lattice's routing is deterministic and inspectable; surfacing gateway-level routing decisions in the `ExecutionPlan` makes "why did this go to provider X" answerable | MEDIUM (new `gatewayPolicy` field on `RunPolicy`, serialized into `provider` object per adapter) | This is additive to the existing contract system and does not break existing consumers. The capability router continues to pick the adapter; `gatewayPolicy` controls behavior inside the adapter's gateway. |
| LM Studio latency-tail diagnostics module (flagged in v1.4 scope) | LM Studio is the primary local inference target; P95/P99 latency attribution for local models is invisible in standard monitoring | MEDIUM (rolling window stats on `provider.attempt` events, exposed as a `LatencyReport` on `RunResult.diagnostics`) | Uses existing `RunEventKind.provider.attempt` events. No new telemetry hook needed; purely additive aggregation. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Building a provider gateway in Lattice | "One gateway to rule them all" — avoids needing LiteLLM / OpenRouter separately | Lattice is an SDK, not a proxy. A gateway requires auth management, rate-limit enforcement, billing, and a network hop — all platform concerns explicitly out of scope | Delegate to LiteLLM or OpenRouter gateway; Lattice wraps them via `openai-compat` |
| Automatic runtime catalog refresh on every `ai.run()` call | "Always current models" | Adds network latency to every cold start; breaks determinism guarantees (router result can change between plan and execute); cache invalidation is hard | Build-time code-gen refresh (CI job PRs a new `registry.generated.ts`) or explicit `refreshCatalog()` call at app startup with configurable TTL |
| Vendoring 100+ provider SDKs directly in Lattice | "Deep integration" | Install-size explosion; auth sprawl; every provider SDK upgrade is a Lattice release | Use openai-compat HTTP for all OpenAI-compatible providers; native SDKs only for Anthropic and Gemini which have non-compatible protocols |

---

## Theme 2 — Live / Streaming Multimodal

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Anthropic multimodal request shaping: image artifacts → `content[].image` blocks | Anthropic Messages API accepts `{ type: "image", source: { type: "base64", media_type, data } }` inside the `content` array; the current adapter likely handles text only | MEDIUM (artifact-type dispatch in the Anthropic adapter's request builder) | The Lattice artifact model already has `image` as a first-class type. What's missing is the translation from `Artifact<"image">` to the Anthropic `content.image` block shape. The adapter must handle both inline base64 and URL-referenced images (Anthropic supports `{ type: "url", url }` for HTTPS URLs). Tool-use streaming from Anthropic uses `input_json_delta` delta type — the streaming parser must handle both `text_delta` and `input_json_delta` in the same stream. |
| Gemini multimodal request shaping: image/audio/video artifacts → `parts[]` | Gemini `generateContent` accepts `{ parts: [{ inlineData: { mimeType, data } }, { text: ... }] }`; without this, Gemini calls fail silently on image inputs | MEDIUM (artifact-type dispatch in the Gemini adapter's request builder) | The `@google/genai` TypeScript SDK (`googleapis/js-genai`) supports `generateContentStream` returning an async iterable. Multimodal parts must set `responseModalities` when requesting image outputs. The existing Gemini adapter covers text; this adds binary artifact plumbing. |
| Streaming cross-provider delta contract: distinguish text token, tool-call input fragment, and end-of-stream | Without this distinction, callers cannot progressively render partial tool-call inputs or know when a stream is done vs paused | MEDIUM (typed delta union in the streaming return) | Recommended contract: `type StreamDelta = { type: "text"; text: string } \| { type: "tool_input_fragment"; toolName: string; partialJson: string } \| { type: "done"; usage: Usage }`. Anthropic already uses these semantics (text_delta vs input_json_delta). OpenAI uses `delta.content` vs `delta.tool_calls[].function.arguments`. Gemini uses `parts[].text` vs `functionCall`. A thin normalizer per adapter produces this common union. |
| OpenAI Realtime API session management: WebSocket connection lifecycle | OpenAI Realtime uses WebSockets (server-to-server path) or WebRTC (browser path). Events: client sends `session.update`, `input_audio_buffer.append`, `response.create`; server sends `response.output_text.delta`, `response.output_audio.delta`, `response.output_audio_transcript.delta` | HIGH (new `RealtimeSession` surface, not a `ProviderAdapter.run()` call) | Realtime sessions are stateful and long-lived — fundamentally different from request/response. This requires a distinct `ai.realtimeSession()` entry point or a `RealtimeAdapter` seam. Audio encoding: PCM16 input and output. Tool calling is supported inside sessions. TypeScript SDK available via `openai` npm package. |
| Gemini Live API session management: WebSocket connection lifecycle | Gemini Live uses WSS (stateful bidirectional). Input: raw 16-bit PCM 16kHz audio, JPEG images at ≤1FPS. Output: raw 16-bit PCM 24kHz audio + text transcript. Supports function calls within a session | HIGH (same fundamental shape as OpenAI Realtime — distinct from batch `generateContent`) | The `@google/genai` SDK supports Live API connections. Session model is stateful: connect → stream input → receive events → disconnect. Firebase AI SDK also supports it. Key difference from Anthropic/standard Gemini: no per-request receipt can be minted for a streaming session without explicit checkpointing. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Lattice receipt checkpointing inside a realtime session | Lattice's signed-receipt model is per-run; a realtime session is unbounded. A `createSessionCheckpoint()` call at defined points (e.g., end of each utterance) mints a signed receipt for that segment, maintaining the verifiability thesis even for live audio/video | HIGH (session-segment receipt schema, PCM segment hashing, Ed25519 signing mid-stream) | This is the key differentiator vs Google ADK and OpenAI Realtime directly. ADK and OpenAI provide no cryptographic proof of what was said/heard. Each checkpoint receipt carries: session ID, segment start/end timestamps, audio hash, transcript hash, token usage for that segment, and a `parentReceiptCid` chaining to prior segments. |
| Cross-provider streaming contract that preserves deterministic routing semantics | When streaming is active, the capability router still ran before the stream started. The `ExecutionPlan` with its chosen provider, fallback chain, and capability match is still recorded and signed | LOW (structural; streaming does not bypass the router) | Competitors streaming via Vercel AI SDK skip the routing plan entirely. Lattice's thesis is that even streaming runs are explainable. The `stage.start` event fires before the stream opens; `stage.complete` fires after the stream drains; receipts are minted from the buffered output. |
| Streaming runs emit `RunEvent` at stream start and end, not per token | Prevents event-sink flooding on high-throughput streams | LOW (discipline in the streaming adapter wrapper) | The `RunEventSink` receives `stage.start` → stream tokens flow to caller's `AsyncIterable` → `stage.complete` with final usage. No per-token events. This keeps OTel span cardinality manageable. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-token `RunEvent` emission during streaming | "Full observability" | Crushes the event sink with thousands of events per second; breaks OTel span budgets; destroys replay file size | `stage.start` and `stage.complete` bracket the stream; a single span covers the full provider call. Token text is in the receipt, not in individual events |
| WebRTC support for realtime (browser-side audio capture) | "Lower latency in browser" | Lattice is a server-side SDK; WebRTC requires browser media APIs and SDP negotiation. This is a frontend concern | Use OpenAI WebRTC guide for browser clients; Lattice handles the server-to-server WebSocket path |
| Building a custom realtime audio pipeline (VAD, echo cancellation, resampling) | "Full-stack audio" | Platform-sized scope; these are OS/driver/DSP concerns | Accept PCM input that the caller already prepared; document the expected format (16kHz PCM16 for OpenAI, 16kHz PCM16 for Gemini) |
| Streaming responses bypassing the capability router | "Faster path" | Destroys the deterministic-routing thesis and the ability to sign what ran | All runs, streaming or realtime, go through the router. The router decides the provider before the socket opens. |

---

## Theme 3 — Eval + Observability Export

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| OpenTelemetry exporter for `RunEventKind`: map each event to an OTel span or span event | OTel is the industry-standard substrate for distributed tracing; Langfuse, Phoenix, Datadog, and Jaeger all accept OTLP. Without an exporter, Lattice's `RunEventSink` is a closed system | MEDIUM (bridge from `RunEventSink` to OTel `Tracer.startSpan` / `span.addEvent`) | Recommended mapping: one root span per `ai.run()` call (`run.start` → `run.complete/run.failed`), child spans for each `stage.start` → `stage.complete` pair, span events for `router.candidates`, `fallback.activated`, `tool.call`, `validation.complete`, `validation.failed`, `capabilities.negotiation.fallback`. The `@opentelemetry/api` package is the only required dep (peer); the SDK-specific setup stays in the app. Key attributes: `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`, `gen_ai.system` (provider name), `lattice.run_id`, `lattice.plan_id`. |
| Langfuse OTLP ingestion: Lattice spans arrive at `/api/public/otel/v1/traces` | Langfuse accepts OTLP/HTTP (JSON and protobuf; gRPC not supported). Auth: Basic with `pk-lf-xxx:sk-lf-xxx` base64-encoded. It reads `gen_ai.request.model`, `gen_ai.usage.*`, `user.id`, `session.id` and maps them to its trace model | LOW (documentation + `createLangfuseOtelExporter` thin factory that sets the URL and auth header) | The OTel exporter (table stake above) does the hard work. Langfuse integration is a one-page guide + a factory function that configures `OTLPTraceExporter` pointed at the Langfuse endpoint with correct headers. No Langfuse SDK needed — standard OTLP. |
| Arize Phoenix OTLP ingestion: Lattice spans arrive at Phoenix's OTLP endpoint | Phoenix accepts OTLP via the `@arizeai/phoenix-otel` npm package which registers a provider and re-exports `@arizeai/openinference-core` helpers. It uses OpenInference semantic conventions (similar to GenAI semconv) | LOW (documentation + `createPhoenixOtelExporter` factory) | Same pattern as Langfuse. Phoenix's npm package `@arizeai/phoenix-otel` simplifies provider registration. The key distinction: Phoenix uses OpenInference attribute names (e.g., `llm.token_count.prompt` alongside `gen_ai.usage.input_tokens`). The Lattice OTel bridge should emit both to maximize compatibility. |
| `lattice eval --agent` CLI subcommand wrapping `evalAgentRun` | The existing `lattice eval` walks receipt fixtures and gates regression. `evalAgentRun` (v1.2 SHOWCASE-AGENT-02) evaluates iterations-to-goal and total cost for agent runs. Connecting them via CLI makes agent regression gating available in CI without custom scripts | MEDIUM (new `--agent` flag on existing `lattice eval`, or a separate `lattice eval agent` subcommand that invokes `evalAgentRun` with the same fixture/baseline/keyset infrastructure) | The existing `EvalConfig` and `EvalRunReport` types should extend to cover agent-specific metrics: `iterationsToGoal`, `stuckDetected`, `safetyVetoes`. The `EvalRunReport.tripwireOutcomes: readonly never[]` forward-compat slot (already in `types.ts`) expands here. |
| `lattice receipt diff` subcommand | v1.4 scope item; allows comparing two receipts side-by-side — useful when debugging why a replay diverges | LOW (new citty subcommand under `lattice receipt`; reads two receipt files, outputs structured diff on `modelId`, `usage`, `outputHash`, `artifacts`) | Additive to existing CLI; no new runtime deps. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Signed receipts as OTel span attributes | Competitors (Langfuse, Phoenix, LangSmith) export spans but cannot prove what ran. Lattice can attach the receipt CID and signature to the OTel span, making the span a verifiable pointer into the signed audit trail | LOW (add `lattice.receipt_cid` and `lattice.receipt_signature` as span attributes in the bridge) | This is uniquely Lattice. A Phoenix or Langfuse trace pointing at a Lattice receipt CID allows: (a) UI-side drill-down into the verifiable receipt, (b) offline `lattice verify` of any span in the trace. No other LLM observability SDK provides this. |
| Lineage merkle root signed inside receipts (v1.4 scope item) | Multi-step runs accumulate artifact lineage graphs. A merkle root over all input/output artifact hashes, signed in the receipt, means a receipt verifier can prove the full provenance of derived artifacts | HIGH (merkle computation over `ArtifactLineage` graph, inclusion in receipt `body`, re-signed with existing Ed25519 infrastructure) | This extends the existing `ArtifactRef.fingerprint` and lineage tracking. Merkle root computation is pure crypto — no new dependencies. The receipt schema bumps to `lattice-receipt/v1.3`. |
| KMS adapter shapes for `ReceiptSigner` (v1.4 scope item) | Current Ed25519 signing uses in-process key material. Production deployments want AWS KMS, GCP Cloud KMS, or HashiCorp Vault as the signing backend | MEDIUM (new `KmsReceiptSigner` interface that wraps the existing `ReceiptSigner` contract; implementations for AWS KMS and a generic PKCS#11-compatible interface) | The `ReceiptSigner` interface is already the extension point. KMS adapters are pure adapter implementations — no changes to receipt schema or verification. |
| `lattice eval` baseline gates on agent-specific metrics (iterations, stuck detection) | Standard eval gates on cost and output quality. Agent-specific regression: did the agent take more iterations? Did it stall? These are not captured by output-hash comparison | MEDIUM (extend `BaselineEntry` with optional `agentMetrics: { iterationsToGoal, stuckCount, safetyVetoCount }` and add regression gates) | Ties to `evalAgentRun` which already computes these. The CI gate becomes: `max(actual_iterations / baseline_iterations) <= 1 + iterationsTolerance`. |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Building a tracing dashboard or UI in Lattice | "Full-stack observability" | Platform-sized commitment; Langfuse, Phoenix, Datadog, Grafana are already excellent at this; maintaining a UI is a product in itself | Export into existing platforms via OTLP. Lattice provides the exporter bridge, not the dashboard. This is explicit in the v1.4 scope statement. |
| Baking Langfuse or Phoenix SDK as a hard dependency | "Seamless integration" | Adds install size and version coupling for every user who doesn't use those platforms; most production users already have a preferred observability stack | Peer dependency on `@opentelemetry/api` only. Langfuse and Phoenix integration is documentation + thin factory functions with zero required imports from those SDKs. |
| Per-token OTel spans | "Maximum granularity" | 100K spans per 1K-token response; exceeds all OTLP ingest quotas; destroys trace readability | One span per provider call; token counts as span attributes; full output text as optional span attribute (gated by `includePromptContent` flag per Langfuse pattern) |
| LangSmith integration | "Broadens observability compatibility" | LangSmith is tightly coupled to LangChain's trace model; integrating it encourages LangChain dependency creep; Phoenix and Langfuse cover the same use cases via standard OTLP | Phoenix and Langfuse via OTLP is sufficient and vendor-neutral |
| Multi-scenario agent-loop showcase as an eval feature | The v1.4 scope lists "multi-scenario agent-loop showcase" but this is an example, not an eval feature | Conflating examples with eval infrastructure blurs the purpose of `lattice eval` | Multi-scenario showcase lives in `examples/agent-loop-v2/`; `lattice eval` gates regressions against those scenarios as fixtures |

---

## Feature Dependencies

```
[Streaming cross-provider contract]
    └──required-by──> [Anthropic multimodal request shaping w/ streaming tool-use]
    └──required-by──> [Gemini multimodal request shaping]
    └──required-by──> [OpenAI Realtime session management]
    └──required-by──> [Gemini Live session management]

[OpenRouter multi-model fallback array]
    └──enhances──> [Receipt records resolved model (not requested model)]

[Auto-refresh capability catalog from OpenRouter feed]
    └──requires──> [OpenRouter /api/v1/models response normalization]
    └──enhances──> [Deterministic router — broader model coverage without manual maintenance]

[RunEventKind OTel exporter bridge]
    └──required-by──> [Langfuse OTLP ingestion]
    └──required-by──> [Phoenix OTLP ingestion]
    └──enhances──> [Signed receipts as OTel span attributes]

[lattice eval --agent wrapping evalAgentRun]
    └──requires──> [EvalConfig/EvalRunReport extended with agent metrics]
    └──requires──> [existing evalAgentRun kernel (v1.2 SHOWCASE-AGENT-02, shipped)]

[Lineage merkle root in receipts]
    └──requires──> [receipt schema bump lattice-receipt/v1.3]
    └──enhances──> [Signed receipts as OTel span attributes (merkle root as attribute)]

[KMS adapter for ReceiptSigner]
    └──requires──> [existing ReceiptSigner interface (v1.1, shipped)]
    └──conflicts-with──> [in-process key material as the only signing path]

[Realtime session checkpointing]
    └──requires──> [OpenAI Realtime or Gemini Live session management]
    └──requires──> [receipt schema that supports segment-level signing]
    └──enhances──> [Signed receipts as OTel span attributes]
```

### Dependency Notes

- **Streaming contract required before multimodal shaping:** Anthropic image inputs can arrive in a streaming response that mixes `text_delta` and `input_json_delta` types; the normalizer must handle both before the adapter is considered complete.
- **OTel exporter required before Langfuse/Phoenix integration:** Both platforms accept standard OTLP; integration is purely configuration, not code, once the bridge exists.
- **`lattice eval --agent` requires only CLI plumbing:** The `evalAgentRun` kernel is shipped. This is a CLI surface extension, not a runtime change.
- **Realtime sessions are architecturally distinct:** Neither `ProviderAdapter.run()` nor `ai.run()` can represent a stateful WebSocket session. A new surface (`RealtimeSession` or `ai.realtimeSession()`) is required. This does NOT break existing consumers.
- **Lineage merkle root requires receipt schema v1.3:** Downgrade defense (already established by v1.2) must extend to reject `lattice-receipt/v1.3` receipts on a v1.2 verifier.

---

## MVP Definition

### Ship in v1.4.0

Features needed to close the three competitive gaps against Mastra / OpenRouter / Portkey / Google ADK / Langfuse:

- [ ] **STREAM-01** Streaming text across all 5 newer adapters with `AsyncIterable<string>` contract
- [ ] **STREAM-02** Typed delta union (text token, tool-input fragment, done) from the streaming bridge
- [ ] **STREAM-03** Anthropic multimodal request shaping (image artifacts → `content[].image` blocks, streaming tool-use)
- [ ] **STREAM-04** Gemini multimodal request shaping (image/audio → `parts[]`, `generateContentStream`)
- [ ] **GATEWAY-01** OpenRouter multi-model fallback array (`fallbackModels[]` option, resolved model in receipt)
- [ ] **GATEWAY-02** LiteLLM provider factory (`createLiteLLMProvider`) with documentation
- [ ] **GATEWAY-03** Auto-refresh capability catalog from OpenRouter `/api/v1/models` feed (build-time code-gen, configurable TTL)
- [ ] **OTEL-01** `RunEventKind` → OTel span bridge (`createLatticeOtelExporter` factory, peer dep on `@opentelemetry/api`)
- [ ] **OTEL-02** Langfuse OTLP export factory + integration guide
- [ ] **OTEL-03** Phoenix OTLP export factory + integration guide
- [ ] **EVAL-01** `lattice eval --agent` subcommand wrapping `evalAgentRun` kernel
- [ ] **EVAL-02** Agent-specific baseline metrics (iterations, stuck, safety vetoes) extending `EvalRunReport`
- [ ] **CLI-01** `lattice receipt diff` subcommand

### Add After Core Validation (v1.4.x)

- [ ] **REALTIME-01** OpenAI Realtime API session surface (`ai.realtimeSession()` or `RealtimeAdapter`) — needs architecture decision first
- [ ] **REALTIME-02** Gemini Live API session surface — same architecture decision as REALTIME-01
- [ ] **REALTIME-03** Realtime session receipt checkpointing (segment-level signing)
- [ ] **RECEIPT-01** Lineage merkle root signed inside receipts (receipt schema v1.3 bump)
- [ ] **KMS-01** KMS adapter shapes for `ReceiptSigner` (AWS KMS + generic PKCS#11)
- [ ] **DIAG-01** LM Studio latency-tail diagnostics module

### Future Consideration (v1.5+)

- [ ] OpenRouter provider routing params in `RunPolicy.gatewayPolicy` (inspectable in `ExecutionPlan`)
- [ ] Multi-scenario agent-loop showcase exercising tripwire / stall / budget-exceeded variants
- [ ] Streaming replay: replaying a receipt that was produced from a streamed run

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Streaming across 5 adapters (STREAM-01) | HIGH — blocks every streaming use case | MEDIUM | P1 |
| Anthropic multimodal shaping (STREAM-03) | HIGH — core "multimodal work inbox" use case | MEDIUM | P1 |
| Gemini multimodal shaping (STREAM-04) | HIGH — closes ADK gap | MEDIUM | P1 |
| OTel span bridge (OTEL-01) | HIGH — required for both Langfuse + Phoenix | MEDIUM | P1 |
| OpenRouter fallback array (GATEWAY-01) | HIGH — "coverage without hand-maintenance" thesis | LOW | P1 |
| `lattice eval --agent` (EVAL-01) | HIGH — closes eval CLI gap vs LangSmith | MEDIUM | P1 |
| Langfuse export factory (OTEL-02) | MEDIUM — documentation-weight once OTEL-01 done | LOW | P1 |
| Phoenix export factory (OTEL-03) | MEDIUM — same as OTEL-02 | LOW | P1 |
| Catalog auto-refresh (GATEWAY-03) | MEDIUM — reduces maintenance tax | MEDIUM | P1 |
| LiteLLM provider factory (GATEWAY-02) | MEDIUM — enables self-hosted gateway users | LOW | P2 |
| `lattice receipt diff` (CLI-01) | MEDIUM — developer ergonomics | LOW | P2 |
| Signed receipts as OTel attributes | HIGH for trust story | LOW (additive to OTEL-01) | P2 |
| Agent baseline metrics (EVAL-02) | MEDIUM — extends existing eval; additive | MEDIUM | P2 |
| Typed delta union (STREAM-02) | MEDIUM — needed for tool-use streaming callers | LOW (part of STREAM-01) | P2 |
| OpenAI Realtime session (REALTIME-01) | HIGH potential; HIGH risk | HIGH | P2 (post-core) |
| Gemini Live session (REALTIME-02) | HIGH potential; HIGH risk | HIGH | P2 (post-core) |
| Lineage merkle root (RECEIPT-01) | MEDIUM — extends signing thesis | HIGH | P3 |
| KMS adapter (KMS-01) | MEDIUM — enterprise need | MEDIUM | P3 |
| Realtime checkpointing (REALTIME-03) | HIGH for trust story; depends on REALTIME-01/02 | HIGH | P3 |
| LM Studio latency diagnostics (DIAG-01) | LOW-MEDIUM — niche but differentiating | MEDIUM | P3 |

---

## Competitor Feature Analysis

| Feature | Vercel AI SDK | LiteLLM (gateway) | Google ADK | Langfuse | Lattice v1.4 approach |
|---------|--------------|-------------------|------------|----------|----------------------|
| Streaming | Default path, `StreamingTextResponse` | Proxy-level, transparent | Default in ADK | N/A (observability) | `AsyncIterable<string>` from `ProviderAdapter.run()` with typed delta union |
| Multimodal | `useChat` accepts image parts | Pass-through to providers | Gemini-native multimodal | N/A | Artifact model → provider-native block translation per adapter |
| Provider routing / fallback | `experimental_telemetry`; no gateway | Full gateway with fallback chains, virtual keys, cost routing | Routes only to Google models (Vertex/Gemini) | N/A | OpenRouter `fallbackModels[]` + LiteLLM delegation; Lattice router picks the adapter, gateway router picks the model instance |
| Realtime audio/video | No — defers to WebRTC | No built-in realtime | Gemini Live (ADK's biggest differentiator) | N/A | WebSocket-based `RealtimeSession` surface wrapping OpenAI Realtime + Gemini Live |
| OTel / observability export | `experimental_telemetry` adds spans | OTLP exporter built-in | Cloud Trace | Accepts OTLP via `/api/public/otel` | `createLatticeOtelExporter` factory; receipts as span attributes |
| Agent eval in CI | No | No | No | Partial (Langfuse Evals) | `lattice eval --agent` with iterations/stuck/cost gates, baseline-relative |
| Signed/verifiable runs | No | No | No | No | Signed receipts (v1.1) + OTel span attributes carrying receipt CID (v1.4) |
| Catalog auto-maintenance | AI SDK provider registry (manually maintained by Vercel) | Gateway does this at proxy level | Static per ADK release | N/A | OpenRouter feed → `registry.generated.ts` code-gen with configurable TTL |

---

## Streaming Protocol Reference (SSE vs WebSocket vs WebRTC)

This section records the authoritative protocol facts that each adapter implementation must match. It exists here so implementation phases do not re-research the same ground.

### Anthropic (SSE — unidirectional)

- Protocol: HTTP SSE (`text/event-stream`)
- Event sequence: `message_start` → `content_block_start` → `N × content_block_delta` → `content_block_stop` → `message_delta` (with `stop_reason`, `usage`) → `message_stop`
- Delta types in `content_block_delta.delta`: `{ type: "text_delta", text }` for text, `{ type: "input_json_delta", partial_json }` for tool-call inputs
- Usage: available on `message_delta` at end of stream (not per-token)
- TypeScript: `client.messages.stream(...).on("text", cb)` or raw iterator; `@anthropic-ai/sdk`

### OpenAI (SSE — unidirectional for completions)

- Protocol: HTTP SSE for `/v1/chat/completions` with `stream: true`
- Delta: `choices[].delta.content` (text) or `choices[].delta.tool_calls[].function.arguments` (partial JSON for tool args)
- Terminator: `data: [DONE]`
- Realtime: WebSocket (`wss://api.openai.com/v1/realtime`) or WebRTC (browser). Client events: `session.update`, `input_audio_buffer.append`, `response.create`. Server events: `response.output_text.delta`, `response.output_audio.delta`. Audio: PCM16 16kHz in, PCM16 24kHz out.

### Gemini (async iterable chunks via SDK)

- Protocol: `generateContentStream` returns `AsyncIterable<GenerateContentResponse>` via `@google/genai` SDK
- Each chunk: `candidates[].content.parts[]` where parts are `{ text }` or `{ functionCall }` or `{ inlineData }` for image outputs
- Usage: available on final chunk's `usageMetadata`
- Live API: WebSocket (WSS). Audio in: PCM16 16kHz. Audio out: PCM16 24kHz. Image in: JPEG ≤1FPS. Supports function calls within session.

### OpenRouter (SSE — transparent proxy)

- Protocol: same SSE as OpenAI (OpenRouter is OpenAI-compatible); routing is transparent
- `model` field in response body indicates the actually-resolved model (critical for receipt accuracy)
- Fallback: pass `models: [primary, ...fallbacks]` in request body; `allow_fallbacks: true` in `provider` object (default)
- Provider routing: `provider.sort` (price/throughput/latency), `provider.only`, `provider.ignore`, `provider.max_price`, `provider.require_parameters`

### LiteLLM (SSE — transparent proxy)

- Protocol: OpenAI-compatible SSE at `/v1/chat/completions`
- Routing configured server-side (LiteLLM router strategies: latency-based, usage-based, cost-based, simple-shuffle)
- Fallback: server-side fallback chains with cooldowns; `order` parameter per deployment
- TypeScript client: identical to OpenAI client; no LiteLLM-specific npm package needed

---

## OTel GenAI Semantic Convention Reference

Status as of June 2026: most GenAI semantic conventions are **experimental** (not stable). Production use requires `OTEL_SEMCONV_STABILITY_OPT_IN` for dual-emission during transition. Lattice should emit both legacy and new attribute names.

Key attributes for Lattice's OTel bridge:

| OTel Attribute | Lattice Source | Notes |
|----------------|----------------|-------|
| `gen_ai.operation.name` | `"chat"` or `"generate_content"` | Fixed per adapter type |
| `gen_ai.system` | Provider adapter ID (`"anthropic"`, `"openai"`, etc.) | |
| `gen_ai.request.model` | `RunEvent.modelId` | |
| `gen_ai.response.model` | Resolved model from provider response | May differ from request (OpenRouter fallback) |
| `gen_ai.usage.input_tokens` | `Usage.promptTokens` | |
| `gen_ai.usage.output_tokens` | `Usage.completionTokens` | |
| `gen_ai.response.finish_reasons` | Adapter-normalized stop reason | |
| `lattice.run_id` | `RunEvent.runId` | Lattice-specific namespace |
| `lattice.plan_id` | `RunEvent.planId` | |
| `lattice.receipt_cid` | Receipt CID after signing | Differentiator: verifiable pointer |
| `gen_ai.client.operation.duration` | Histogram metric: span duration | |
| `gen_ai.client.token.usage` | Histogram metric: token counts | |

Langfuse also reads: `user.id`, `session.id`, `langfuse.observation.model.name` (takes precedence over `gen_ai.request.model`).

Phoenix also reads: `llm.token_count.prompt`, `llm.token_count.completion` (OpenInference conventions alongside GenAI semconv).

---

## Sources

- [OpenTelemetry GenAI Observability blog (2026)](https://opentelemetry.io/blog/2026/genai-observability/) — MEDIUM confidence (official OTel blog, summarizes spec)
- [OpenTelemetry GenAI semantic conventions — Greptime analysis (May 2026)](https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions) — MEDIUM (third-party but recent and detailed)
- [Langfuse OpenTelemetry integration docs](https://langfuse.com/integrations/native/opentelemetry) — HIGH (official Langfuse docs, fetched directly)
- [Langfuse OTLP endpoint and attribute mapping (fetched 2026-06-15)](https://langfuse.com/integrations/native/opentelemetry) — HIGH
- [@arizeai/phoenix-otel on npm](https://www.npmjs.com/package/@arizeai/phoenix-otel) — HIGH (official package)
- [Arize Phoenix tracing overview](https://arize.com/docs/phoenix/tracing/llm-traces) — MEDIUM (official docs, limited detail fetched)
- [Gemini Live API overview](https://ai.google.dev/gemini-api/docs/live-api) — HIGH (official Google docs, fetched directly)
- [Gemini Live API WebSocket get-started](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket) — HIGH (official Google docs)
- [googleapis/js-genai TypeScript SDK](https://github.com/googleapis/js-genai) — HIGH (official Google SDK)
- [OpenAI Realtime API guide (developers.openai.com)](https://developers.openai.com/api/docs/guides/realtime) — HIGH (official OpenAI docs, fetched directly)
- [Anthropic streaming messages docs](https://platform.claude.com/docs/en/build-with-claude/streaming) — HIGH (official Anthropic docs, fetched directly — full SSE event taxonomy)
- [LiteLLM Router docs](https://docs.litellm.ai/docs/routing) — HIGH (official LiteLLM docs, fetched directly)
- [OpenRouter model fallback docs](https://openrouter.ai/docs/guides/routing/model-fallbacks) — HIGH (official OpenRouter docs, fetched directly)
- [OpenRouter provider selection docs](https://openrouter.ai/docs/guides/routing/provider-selection) — HIGH (official OpenRouter docs, fetched directly)
- [OpenRouter GET /api/v1/models API reference](https://openrouter.ai/docs/api/api-reference/models/get-models) — HIGH (official OpenRouter docs, fetched directly)
- [LiteLLM vs OpenRouter comparison (truefoundry.com)](https://www.truefoundry.com/blog/litellm-vs-openrouter) — MEDIUM (third-party, recent)
- Lattice codebase: `packages/lattice/src/tracing/tracing.ts` (RunEventKind union — inspected directly) — HIGH
- Lattice codebase: `packages/lattice-cli/src/commands/eval.ts` and `eval/types.ts` (existing eval surface — inspected directly) — HIGH
- Lattice codebase: `packages/lattice/src/providers/adapters.ts` and `capabilities/profile.ts` (CapabilityAdapter enum — inspected directly) — HIGH

---
*Feature research for: Lattice v1.4 — Provider Breadth + Live Multimodal + Eval/Observability Export*
*Researched: 2026-06-15*
