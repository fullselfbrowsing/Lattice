# Architecture Research: v1.4 Integration Patterns

**Domain:** TypeScript SDK — provider streaming, gateway delegation, OTel observability export
**Researched:** 2026-06-15
**Confidence:** HIGH (based on direct source inspection of shipped v1.3 codebase)

## Scope Boundary

This document covers ONLY the v1.4 architectural integration questions against the **existing shipped surface**. The v1.3 architecture (ProviderAdapter contract, router, receipts, hook pipeline) is treated as immutable unless a change is explicitly called out as additive and backward-compatible.

Three integration questions in scope:
- (a) Streaming: additive method vs response-mode, and reconciliation with signed receipts
- (b) Gateway delegation: new adapter vs transport seam vs router option
- (c) OTel exporter: binding to RunEventKind / hook pipeline, and `lattice eval --agent` wrapper placement

---

## System Overview (v1.3 baseline — treat as read-only)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Public API layer: createAI({ providers, policy, storage, tracing })         │
│  ai.run() / ai.runAgent() / runAgentCrew()                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  Router layer (deterministic, pure)                                          │
│  routeDeterministically(catalog, request) → RouteDecision                    │
│  ├─ CapabilityCatalog  (registry.generated.ts + registry.static.ts)          │
│  └─ negotiateCapabilities(adapter, modelId) → NegotiatedCapabilities         │
│      (live /models + TTL cache + single-flight + registry fallback)           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ProviderAdapter interface (INV-03 parity contract — 7 adapters)             │
│  { id, kind, capabilities?, execute?(request) → Promise<ProviderRunResponse>,│
│    quirks?, negotiateCapabilities? }                                         │
│  openai / openai-compat / anthropic / gemini / xai / openrouter / lm-studio  │
├──────────────────────────────────────────────────────────────────────────────┤
│  Hook pipeline: SAFETY(0) > OBSERVABILITY(1) > EXTENSION(2) bands            │
│  RunEventKind union (additive literals) + RunEventSink                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  Receipt pipeline: redact → JCS-canonicalize → DSSE/PAE → Ed25519 sign      │
│  CapabilityReceipt (v1.2) ← ReplayEnvelope ← materializeReplayEnvelope      │
├──────────────────────────────────────────────────────────────────────────────┤
│  Agent layer: runAgent / runAgentCrew / CrewDispatcher                       │
│  evalAgentRun (pure kernel: AgentRunSnapshot comparison)                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  lattice-cli: repro / verify / eval (citty lazy subcommands)                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Question (a): Streaming and Signed-Receipt Reconciliation

### Decision: Additive `executeStream()` method, NOT a response-mode flag

**Rationale from the existing surface:**

The current `ProviderAdapter` interface has `execute?` typed as optional (`execute?(request) → Promise<ProviderRunResponse>`). The INV-03 parity contract specifically freezes the METHOD SET — adapters returning different response shapes via the same `execute()` signature would break consumers who assume `execute()` always resolves to a full `ProviderRunResponse`. Adding a separate `executeStream?` method follows the established v1.3 pattern (where `negotiateCapabilities?` and `quirks?` were added as optional fields on the base interface without breaking v1.2 consumer adapters).

The correct shape:

```typescript
export interface ProviderAdapter {
  readonly id: string;
  readonly kind: "provider-adapter";
  readonly capabilities?: readonly ModelCapability[];
  readonly execute?: (request: ProviderRunRequest) => Promise<ProviderRunResponse>;
  // v1.4 ADDITIVE — optional; adapters that do not implement remain INV-03 compliant
  readonly executeStream?: (request: ProviderRunRequest) => AsyncIterable<ProviderStreamChunk>;
  readonly quirks?: AdapterQuirks;
  readonly negotiateCapabilities?: (modelId: string) => Promise<NegotiatedCapabilities>;
}

export interface ProviderStreamChunk {
  readonly kind: "text-delta" | "tool-call-delta" | "usage" | "done";
  readonly delta?: string;
  readonly toolCallId?: string;
  readonly toolCallDelta?: string;
  readonly usage?: Usage;          // final usage on "done" chunk
}
```

**INV-03 parity contract preservation:**
- All 7 existing adapters continue to satisfy the interface with `execute()` only.
- No adapter is REQUIRED to implement `executeStream()` in v1.4; streaming is opt-in per adapter.
- The router/runtime checks `typeof adapter.executeStream === "function"` before streaming.
- `streaming: true` in `ModelCapability` and `NegotiatedCapabilities.supports.streaming` already exist as flags — the runtime gates on these before calling `executeStream()`.

**Phase ordering implication:** Define `ProviderStreamChunk` and the `executeStream?` interface extension first (one phase); then implement per-adapter (Anthropic, Gemini are the priority targets per v1.4 scope); realtime/audio builds on top.

### Streaming vs Signed-Receipt Reconciliation — the critical design tension

**The problem:** `createReceipt()` signs a complete `CapabilityReceiptBody` that includes `outputHash` (SHA-256 of the complete output). A stream in progress has no `outputHash` — it cannot be signed mid-flight.

**The solution: buffer-then-sign at stream close.**

The receipt pipeline must not be called mid-stream. Instead:

1. `executeStream()` yields chunks as an `AsyncIterable<ProviderStreamChunk>`.
2. The runtime (or a `collectStream()` utility) accumulates all `text-delta` chunks into a complete output string and the final `usage` chunk into a `Usage` record.
3. Only after the `"done"` chunk is consumed does the runtime call `createReceipt()` with the collected output, computing `outputHash = sha256(completeOutput)`.
4. The `ReceiptEnvelope` is signed over the complete output — identical semantic guarantee to the non-streaming path.

This preserves the invariant: **the signed receipt commits to the complete final output, not to any intermediate state**. The consumer can verify the receipt and replay the run deterministically; the fact that the original execution used streaming is an implementation detail.

**New component required:**

```typescript
// packages/lattice/src/providers/stream.ts  (NEW)
export async function collectStream(
  stream: AsyncIterable<ProviderStreamChunk>,
): Promise<ProviderRunResponse>
```

`collectStream()` consumes the `AsyncIterable`, accumulates deltas, and produces the same `ProviderRunResponse` shape that `execute()` returns. The runtime always uses `collectStream()` before handing off to the receipt pipeline. This makes streaming an execution-path optimization, not a semantic change to the result contract.

**Realtime audio/video distinction:** Gemini Live / OpenAI Realtime present a tougher case because they involve bidirectional streams where there is no discrete "final output" in the text-completion sense. These are scoped as a "direction" in v1.4, not a full implementation. The receipt design for realtime is: sign a session-summary receipt at session close (capturing total usage and a canonical hash of the session transcript blob). This is a separate `RealtimeSessionReceipt` type deferred to a sub-phase.

**RunEventKind additions for streaming (additive literals):**

```typescript
| "stream.chunk"    // optional; high-frequency; emitted per chunk if sink present
| "stream.complete" // emitted once when the stream closes and output is collected
```

`stream.complete` carries the same metadata as the existing `stage.complete` event plus `chunksReceived: number`.

---

## Integration Question (b): Gateway Delegation — New Adapter, Transport Seam, or Router Option?

### Decision: New first-party adapters for LiteLLM and enhanced OpenRouter; NOT a transport seam; NOT a router option

**Rationale from the existing surface:**

LiteLLM exposes an OpenAI-compatible HTTP API. The existing `createOpenAICompatibleProvider()` factory already handles this pattern. However, LiteLLM and the extended OpenRouter multi-model routing surface have adapter-specific behavioral flags (virtual keys, fallback arrays, model routing arrays, cost limits) that belong in dedicated `QuirksLiteLLM` / enhanced `OpenRouterQuirks` objects — the same pattern used for every other first-party adapter.

A "transport seam" approach (inserting LiteLLM as middleware between the router and adapters) was considered and rejected because:
1. It would require the router to know about transport middleware, coupling routing to infrastructure.
2. It conflicts with the "deterministic, inspectable routing" constraint: the execution plan must name the final provider, not an intermediate proxy.
3. `ReceiptRoute` in the signed receipt records the `providerId` and `modelId` — a gateway adapter must produce a concrete `providerId` so the receipt faithfully describes what ran.

A "router option" (flag on `RouteRequest`) was considered and rejected because routing is already deterministic via the capability catalog. The correct lever for gateway behavior is the catalog entry's `providerId` and the adapter's `execute()` implementation.

**What changes:**

1. **`createLiteLLMProvider(options)`** — a new first-party factory (NEW). Thin wrapper around `createOpenAICompatibleProvider` with:
   - `LiteLLMQuirks` extending `AdapterQuirks` with `virtualKeysSupported`, `contextWindowFallbackSupported`, `teamCostTrackingSupported`
   - `negotiateCapabilities` using the LiteLLM `/v1/models` endpoint (same pattern as OpenAI adapter)
   - `id` defaults to `"litellm"`

2. **OpenRouter multi-model routing** — the existing `createOpenRouterProvider()` gains an optional `models` array field on `ProviderRunRequest` (following the precedent of `cacheSystemPrefix` added in Phase 39 — additive optional fields on the request bag are accepted without breaking INV-03). The adapter checks `quirks.providerRoutingArraySupported` before forwarding the array to the upstream API:

   ```typescript
   // Addition to ProviderRunRequest (additive optional field, Phase 39 precedent)
   readonly openRouterModels?: readonly string[];  // model routing array for OpenRouter
   ```

   The Lattice deterministic router selects `providerId: "openrouter"`, and the OpenRouter adapter internally routes to the model array. This keeps Lattice's routing layer deterministic (it selected OpenRouter) while delegating sub-routing to OpenRouter.

3. **Catalog auto-refresh** — the `createCapabilityCatalog()` function currently takes a static array. v1.4 adds an optional async refresh mechanism:

   ```typescript
   // packages/lattice/src/routing/catalog.ts — MODIFIED (additive)
   export async function refreshCatalogFromOpenRouter(
     adapter: ProviderAdapter & { negotiateCapabilities: ... },
     options?: { signal?: AbortSignal },
   ): Promise<CapabilityCatalog>
   ```

   This is a pure function — returns a new catalog; does not mutate state. The runtime or consumer is responsible for calling it on a schedule and passing the fresh catalog into `routeDeterministically`. This preserves the pure/deterministic router contract. A convenience `createAutoRefreshingCatalog(adapter, options)` wrapper can drive the TTL loop, but it is optional and lives in a separate module to keep the core router pure.

**Coexistence with the deterministic capability catalog:**

The catalog is a snapshot at route-time. Gateway adapters (LiteLLM, OpenRouter) appear as `ModelCapability` entries with `providerId: "litellm"` or `providerId: "openrouter"`. The router treats them identically to first-party adapters. The catalog auto-refresh mechanism updates the snapshot without changing routing semantics — the router remains purely functional over whatever catalog it receives.

**New components (gateway theme):**

| Component | File | Status |
|-----------|------|--------|
| `createLiteLLMProvider` | `providers/litellm.ts` | NEW |
| `LiteLLMQuirks` | `providers/quirks.ts` | NEW (additive interface) |
| `refreshCatalogFromOpenRouter` | `routing/catalog.ts` | MODIFIED (additive export) |
| `createAutoRefreshingCatalog` | `routing/auto-refresh.ts` | NEW |
| `openRouterModels` field on `ProviderRunRequest` | `providers/provider.ts` | MODIFIED (additive optional field) |

---

## Integration Question (c): OTel Exporter and `lattice eval --agent`

### OTel Exporter: OBSERVABILITY-band hook + standalone exporter module

**Where it binds:**

The existing hook pipeline has an `OBSERVABILITY` band (priority 1) that runs after `SAFETY` and before `EXTENSION`. `RunEventSink` is already the abstraction for consuming run events. The OTel exporter is a `RunEventSink` implementation that translates `RunEvent` objects to OpenTelemetry spans/attributes.

The key insight from reading `tracing.ts` and `bands.ts`: `RunEventKind` is the comprehensive event vocabulary (`run.start`, `provider.attempt`, `stage.complete`, `step.transition`, `capabilities.negotiation.fallback`, etc.). Each `RunEvent` carries `runId`, `planId`, `stageId`, `providerId`, `modelId`, `timestamp`, and `metadata`. This maps directly to OTel span attributes.

**Architecture:**

```typescript
// packages/lattice/src/observability/otel.ts  (NEW)
import { trace, SpanStatusCode, type Tracer } from "@opentelemetry/api";

export function createOtelRunEventSink(tracer: Tracer): RunEventSink {
  // Maps RunEventKind → OTel span lifecycle:
  //   "run.start"       → span.start  (rootSpan keyed by runId)
  //   "provider.attempt"→ childSpan.start
  //   "stage.complete"  → childSpan.end
  //   "run.complete"    → rootSpan.end (StatusCode.OK)
  //   "run.failed"      → rootSpan.end (StatusCode.ERROR)
  //   others            → rootSpan.addEvent(kind, attributes)
  ...
}
```

The consumer wires it as:

```typescript
const ai = createAI({
  providers: [...],
  tracing: createOtelRunEventSink(tracer),  // RunEventSink is already the hook
});
```

`RunEventSink` is already `(event: RunEvent) => void | Promise<void>` — the OTel exporter is a pure `RunEventSink` factory. No new hook pipeline registration API is needed. No new `OBSERVABILITY`-band registration is needed — the exporter sits at the `RunEventSink` layer, which fires before the hook pipeline (the runtime calls the sink directly in `createRunEvent` calls).

However, for span lifecycle management (start/end pairing), the exporter needs to maintain a span map keyed by `runId`. This is internal state inside the closure returned by `createOtelRunEventSink()`.

**Langfuse / Phoenix export:**

Both Langfuse and Phoenix accept OpenTelemetry OTLP. The exporter is:
- Langfuse: use `LangfuseExporter` from `@langfuse/tracing` configured as an OTel `SpanExporter`; the Lattice OTel sink emits to the OTel SDK which routes to Langfuse via standard OTLP.
- Phoenix: use `@arize-ai/openinference-semantic-conventions` attribute mapping + standard OTel OTLP export.

Neither requires a Lattice-specific integration. The OTel exporter in Lattice is a single `createOtelRunEventSink()` factory; consumers point their OTel SDK at Langfuse or Phoenix via standard OTel configuration.

**New `RunEventKind` literals for streaming (see section a):** `"stream.chunk"` and `"stream.complete"` are additive and flow through the same `RunEventSink`, so the OTel exporter picks them up automatically.

**New components (OTel theme):**

| Component | File | Status |
|-----------|------|--------|
| `createOtelRunEventSink` | `observability/otel.ts` | NEW |
| `"stream.chunk"` / `"stream.complete"` | `tracing/tracing.ts` | MODIFIED (additive literals to `RunEventKind`) |

### `lattice eval --agent`: CLI wrapper around `evalAgentRun`

**Current state:** `evalAgentRun(baseline, current, options)` in `agent/eval.ts` is a **pure kernel** that compares two `AgentRunSnapshot` objects. The existing `lattice eval` command in `lattice-cli/src/commands/eval.ts` is a receipt-walking CI gate for single-run receipts.

**v1.4 addition:** `lattice eval --agent` is a new flag on the existing `eval` subcommand (or a separate `eval-agent` subcommand). It:

1. Walks a directory of agent run snapshots (`.lattice/agent-snapshots/<id>.json`)
2. Loads the baseline snapshot for each (`--baseline` same flag, different schema discriminant)
3. Calls `evalAgentRun(baseline, current, options)` for each snapshot pair
4. Emits a structured JSON report (same `EvalRunReport` shape with `AgentEvalResult` embedded per fixture)
5. Exit codes: 0 (all pass), 1 (regressions found), 2 (load failure)

**Integration point:** The CLI handler calls `evalAgentRun` directly — no new runtime API needed. The `AgentRunSnapshot` serialization format (`{ iterationsToGoal, usage }`) is minimal and already defined in `agent/eval.ts`.

**New/modified components (eval theme):**

| Component | File | Status |
|-----------|------|--------|
| `--agent` flag / `runEvalAgent()` handler | `lattice-cli/src/commands/eval.ts` | MODIFIED (additive flag + new handler function) |
| Agent snapshot walker | `lattice-cli/src/io/snapshot-walker.ts` | NEW |
| Agent snapshot loader | `lattice-cli/src/io/snapshot-loader.ts` | NEW |

The `evalAgentRun` kernel in `packages/lattice/src/agent/eval.ts` is **unmodified** — it is already designed for reuse by a CLI wrapper (the JSDoc says "a future `lattice eval --agent` CLI subcommand can reuse the same gate").

---

## Data Flow Changes Summary

### Streaming data flow (new path)

```
ai.run() / agent loop
    ↓
Router selects adapter with executeStream capability
    ↓
adapter.executeStream(request) → AsyncIterable<ProviderStreamChunk>
    ↓
collectStream() accumulates chunks, emits "stream.chunk" RunEvents
    ↓
"done" chunk received → full ProviderRunResponse assembled
    ↓
"stream.complete" RunEvent emitted
    ↓
(existing path) tripwire eval → createReceipt(completeOutput) → sign
```

The signed receipt path is unchanged. Streaming adds a collection step before the existing receipt pipeline.

### Gateway delegation data flow (modified path)

```
ai.run()
    ↓
routeDeterministically(catalog, request) selects "litellm" or "openrouter" entry
    ↓ (catalog may have been refreshed from OpenRouter /models feed)
adapter.execute(request) [with optional openRouterModels field]
    ↓
LiteLLM/OpenRouter gateway routes to upstream provider (transparent to Lattice)
    ↓
ProviderRunResponse returned (same shape as first-party adapters)
    ↓
(existing path) receipt → sign (providerId: "litellm" | "openrouter" in receipt)
```

### OTel observability data flow (new parallel path)

```
Any RunEvent emitted via createRunEvent() + sink(event)
    ↓ (parallel, non-blocking)
createOtelRunEventSink(tracer) → OTel SDK span lifecycle
    ↓
OTel SDK → OTLP exporter → Langfuse / Phoenix / Jaeger / etc.
```

The `RunEventSink` is already on the hot path. The OTel exporter is additive and does not change any existing event-emission points.

---

## New vs Modified Component Map

### New components

| Component | Package | Purpose |
|-----------|---------|---------|
| `providers/stream.ts` | `lattice` | `ProviderStreamChunk` type + `collectStream()` utility |
| `providers/litellm.ts` | `lattice` | `createLiteLLMProvider()` factory |
| `routing/auto-refresh.ts` | `lattice` | `createAutoRefreshingCatalog()` optional scheduler |
| `observability/otel.ts` | `lattice` | `createOtelRunEventSink()` factory |
| `lattice-cli/src/io/snapshot-walker.ts` | `lattice-cli` | Walk agent snapshot directories |
| `lattice-cli/src/io/snapshot-loader.ts` | `lattice-cli` | Load + validate `AgentRunSnapshot` JSON |

### Modified components (additive only — no breaking changes)

| Component | File | Change |
|-----------|------|--------|
| `ProviderAdapter` interface | `providers/provider.ts` | Add optional `executeStream?` method |
| `ProviderRunRequest` | `providers/provider.ts` | Add optional `openRouterModels?` field |
| `RunEventKind` union | `tracing/tracing.ts` | Add `"stream.chunk"` and `"stream.complete"` literals |
| `AdapterQuirks` subtypes | `providers/quirks.ts` | Add `LiteLLMQuirks` interface |
| `catalog.ts` | `routing/catalog.ts` | Add `refreshCatalogFromOpenRouter()` export |
| `eval.ts` (CLI) | `lattice-cli/src/commands/eval.ts` | Add `--agent` flag + `runEvalAgent()` handler |

### Unmodified (confirmed stable)

| Component | Why unmodified |
|-----------|---------------|
| `createReceipt()` | Receipt pipeline is unchanged; buffer-then-sign means streaming never touches it |
| `routeDeterministically()` | Pure function over catalog; gateway adapters appear as catalog entries |
| `createHookPipeline()` | OTel exporter is a `RunEventSink`, not a hook handler |
| `evalAgentRun()` | Pure kernel; CLI wrapper calls it directly |
| `verifyReceipt()` | Signature verification is unchanged; streaming outputs are buffered before signing |
| All 7 existing adapters' `execute()` | INV-03 parity contract frozen; streaming is additive `executeStream?` |

---

## Architectural Patterns

### Pattern 1: Additive Optional Method (streaming, negotiateCapabilities)

**What:** New optional methods on `ProviderAdapter` that default to `undefined` on existing adapters.
**When to use:** When extending the adapter contract without requiring all 7 adapters to implement immediately.
**Precedent:** `negotiateCapabilities?` and `quirks?` added in v1.3 (Phase 34) without breaking v1.2 adapters.
**Trade-offs:** Consumers must check `typeof adapter.executeStream === "function"` before calling. The router already does this for `negotiateCapabilities`.

### Pattern 2: Buffer-then-Sign (streaming + receipts)

**What:** Accumulate the full stream output in memory before passing to `createReceipt()`.
**When to use:** Whenever a streaming execution path must produce a signed, replayable receipt.
**Trade-offs:** Memory cost proportional to output size. For Lattice's use case (text/JSON outputs), this is acceptable. For realtime audio/video, a session-summary receipt pattern is more appropriate (future sub-phase).

### Pattern 3: Thin Gateway Adapter (LiteLLM, enhanced OpenRouter)

**What:** Wrap `createOpenAICompatibleProvider()` with gateway-specific quirks and negotiation.
**When to use:** Gateway has OpenAI-compatible wire format but distinct behavioral flags.
**Precedent:** `createOpenRouterProvider()` already does this (wraps `createOpenAICompatibleProvider`, adds `OpenRouterQuirks`).

### Pattern 4: RunEventSink as OTel Bridge

**What:** `createOtelRunEventSink()` returns a `RunEventSink` that translates Lattice events to OTel spans.
**When to use:** Exporting Lattice observability to any OTel-compatible backend.
**Trade-offs:** Span lifecycle (start/end pairing) requires stateful bookkeeping inside the sink closure, keyed by `runId`. Spans for runs that never emit `run.complete` (crashed runs) need a timeout eviction to prevent memory leak.

---

## Anti-Patterns

### Anti-Pattern 1: Response-mode flag for streaming

**What people do:** Add `streaming: true` to `ProviderRunRequest` and have `execute()` return either a Promise or an AsyncIterable based on the flag.
**Why it's wrong:** The `execute()` return type is `Promise<ProviderRunResponse>` — changing it to a union breaks TypeScript inference for all existing callers and requires every consumer to handle both paths.
**Do this instead:** Additive `executeStream?` method. Consumers that want streaming call `executeStream()`; consumers that do not care about streaming call `execute()` as before.

### Anti-Pattern 2: Signing a stream mid-flight

**What people do:** Call `createReceipt()` after receiving the first chunk, with `outputHash: null`, then "update" the receipt when the stream closes.
**Why it's wrong:** `createReceipt()` produces a DSSE envelope that commits to the body bytes. There is no "update" path. A receipt with `outputHash: null` is a partial receipt that cannot support replay determinism for the output.
**Do this instead:** Buffer with `collectStream()`, sign once when the stream is complete.

### Anti-Pattern 3: Gateway as a router option

**What people do:** Add `{ gateway: "litellm", baseUrl: "..." }` to the route request or policy.
**Why it's wrong:** The router is a pure function over capability entries — routing concerns (which provider handles the request) belong in the catalog, not in per-request options. Gateway configuration belongs in the adapter factory, not the route request.
**Do this instead:** Register `createLiteLLMProvider({ baseUrl })` in the providers list; the catalog entry carries `providerId: "litellm"` and routing policy selects it normally.

### Anti-Pattern 4: OTel sink as a hook handler

**What people do:** Register the OTel exporter as a `BAND.OBSERVABILITY` hook handler.
**Why it's wrong:** The hook pipeline fires on `HookLifecycleEvent` (BEFORE/AFTER_PROVIDER, BEFORE/AFTER_TOOL, BEFORE/AFTER_AGENT_ITERATION). These are coarser than `RunEventKind`. The OTel exporter needs the fine-grained `RunEvent` stream (e.g., `provider.attempt`, `fallback.activated`, `capabilities.negotiation.fallback`) that only flows through the `RunEventSink`. Using the hook pipeline would miss most events.
**Do this instead:** Wire the OTel exporter as a `RunEventSink` via `createAI({ tracing: createOtelRunEventSink(tracer) })`.

---

## Phase-Specific Warnings

| Phase Topic | Integration Risk | Mitigation |
|-------------|-----------------|------------|
| Streaming contract definition | Choosing the wrong `ProviderStreamChunk` shape now blocks all 5 adapter implementations | Define `ProviderStreamChunk` + `collectStream()` in one phase; freeze before implementing adapters |
| Streaming + receipts | The buffer-then-sign pattern must be enforced structurally, not by convention | `collectStream()` should be the only call site that returns `ProviderRunResponse` from a stream; receipts should never be imported by streaming adapter code directly |
| LiteLLM adapter | LiteLLM's `/v1/models` endpoint returns model IDs that include the upstream provider prefix (e.g. `openai/gpt-4o`) — need the same `stripOpenRouterVariant`-style normalization for registry lookup | Reuse `lookup.ts` helpers; add LiteLLM-specific ID normalization before registry key construction |
| OpenRouter multi-model routing | The `openRouterModels` field on `ProviderRunRequest` is advisory — the OpenRouter adapter must silently ignore it if OpenRouter does not support it for the selected model | Gate on `quirks.providerRoutingArraySupported` inside the adapter's `execute()`, not in the router |
| OTel span lifecycle | Long-running agent runs hold open OTel root spans for the duration of all iterations | Use `step.transition` events as child span boundaries within an agent loop; the root span stays open until `run.complete` |
| OTel sink + realtime | Realtime audio/video sessions have no `run.complete` event; the span map in `createOtelRunEventSink` would leak entries | Add a session-close event (`realtime.session.complete`) in the realtime sub-phase; the OTel sink evicts on this event |
| `lattice eval --agent` snapshot format | `AgentRunSnapshot` is minimal (`iterationsToGoal`, `usage`) — adding fields later requires baseline migration | Version the snapshot file format with a `"version": "lattice-agent-eval/v1"` discriminant from the start |
| Catalog auto-refresh | The refresh loop must not pin the Node event loop | Use `setInterval` with `unref()` so the process can exit even if the refresh loop is pending |

---

## Dependency-Ordered Build Sequence

The build order respects the principle that contract/interface definitions must precede implementations, and that streaming must be defined before realtime (which is a streaming extension).

```
Phase 40: Gateway Delegation — Catalog Auto-Refresh + LiteLLM Adapter
  Depends on: existing catalog.ts, existing OpenAI-compat factory
  Delivers: createLiteLLMProvider(), refreshCatalogFromOpenRouter(), LiteLLMQuirks
  Unblocks: nothing (self-contained)

Phase 41: OpenRouter Multi-Model Routing + Fallback Array
  Depends on: Phase 40 (catalog refresh infrastructure), existing OpenRouter adapter
  Delivers: openRouterModels field on ProviderRunRequest, enhanced OpenRouterQuirks
  Unblocks: nothing new

Phase 42: Streaming Contract + collectStream()
  Depends on: existing ProviderAdapter interface, tracing.ts RunEventKind
  Delivers: executeStream? on ProviderAdapter, ProviderStreamChunk type,
            collectStream() utility, "stream.chunk"/"stream.complete" RunEventKind literals
  Unblocks: Phases 43, 44 (adapter streaming implementations)

Phase 43: Anthropic + Gemini Streaming Adapters
  Depends on: Phase 42 (streaming contract)
  Delivers: anthropic.ts + gemini.ts executeStream() implementations

Phase 44: xAI + OpenRouter + LM Studio Streaming Adapters
  Depends on: Phase 42 (streaming contract)
  Delivers: xai.ts + openrouter.ts + lm-studio.ts executeStream() implementations
  Note: LM Studio streaming is a low-confidence target; mark as best-effort

Phase 45: Anthropic + Gemini Multimodal Request Shaping
  Depends on: Phase 43 (streaming adapters, as multimodal and streaming are often co-designed)
  Delivers: image/audio artifact → Anthropic content block, Gemini Part encoding in execute() and executeStream()

Phase 46: Realtime Audio/Video Direction
  Depends on: Phase 42 (streaming contract), Phase 45 (multimodal shaping)
  Delivers: interface sketch for realtime session API; RealtimeSessionReceipt type
  Note: "direction" in v1.4 means interface-level definition; full WebSocket implementation is future

Phase 47: OTel RunEventSink Exporter
  Depends on: existing RunEventKind, existing RunEventSink; does NOT depend on streaming phases
  Delivers: createOtelRunEventSink(), observability/otel.ts
  Note: can be built in parallel with Phases 40-46

Phase 48: lattice eval --agent CLI Subcommand
  Depends on: existing evalAgentRun() kernel (unmodified), existing lattice eval command structure
  Delivers: --agent flag on eval command, snapshot-walker.ts, snapshot-loader.ts
  Note: can be built in parallel with any phase; no runtime dependencies
```

**Parallelism opportunities:** Phase 47 (OTel) and Phase 48 (eval --agent) can be built in any order relative to the streaming/gateway themes. Phase 40 and Phase 41 can overlap (different files). Phases 43 and 44 can be built in parallel (different adapter files).

---

## Sources

- `packages/lattice/src/providers/provider.ts` — `ProviderAdapter`, `ProviderRunRequest`, `ProviderRunResponse` interfaces (verified v1.3)
- `packages/lattice/src/providers/adapters.ts` — `createOpenAICompatibleProvider`, `createOpenAIProvider` (additive optional fields precedent)
- `packages/lattice/src/providers/anthropic.ts` — full negotiate/execute implementation (streaming deferred comment in JSDoc)
- `packages/lattice/src/providers/openrouter.ts` — model-routing array deferred comment in JSDoc (D-17 carryforward)
- `packages/lattice/src/tracing/tracing.ts` — `RunEventKind` union, `RunEventSink`, `createRunEvent` (additive literal precedent)
- `packages/lattice/src/contract/bands.ts` — `HookPipeline`, `BAND` constants, `HookLifecycleEvent` (OTel sink placement rationale)
- `packages/lattice/src/receipts/receipt.ts` — `createReceipt()` ordering invariant: redact → canonicalize → PAE → sign
- `packages/lattice/src/routing/router.ts` — `routeDeterministically()` pure function signature
- `packages/lattice/src/routing/catalog.ts` — `createCapabilityCatalog()` static construction pattern
- `packages/lattice/src/capabilities/negotiate.ts` — `negotiateCapabilities()` delegation pattern, Pitfall 5 (zero live-path logic in helper)
- `packages/lattice/src/agent/eval.ts` — `evalAgentRun()` pure kernel, JSDoc cites CLI reuse intent
- `packages/lattice-cli/src/commands/eval.ts` — existing `runEval()` handler pattern (testable via deps injection)
- `.planning/PROJECT.md` — v1.4 scope, INV-03 parity constraint, "Hosted control plane — Out of Scope" decision

---

*Architecture research for: Lattice v1.4 Provider Breadth + Live Multimodal + Observability Export*
*Researched: 2026-06-15*
