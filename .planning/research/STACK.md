# Stack Research

**Domain:** TypeScript SDK — v1.4 additions only (Provider Breadth + Live Multimodal + Eval/Observability Export)
**Researched:** 2026-06-15
**Confidence:** HIGH on OTel and streaming primitives (all verified via npm + official docs); MEDIUM on Gemini Live SDK surface (API surface exists but TypeScript method names need confirmation against @google/genai source); HIGH on OpenRouter/LiteLLM integration shape (pure HTTP, no new dep)

## Scope Discipline

This research covers ONLY net-new dependencies and integration patterns for v1.4. The existing stack from the v1.3 STACK.md (TypeScript 6.0.3, tsdown 0.21.9, Vitest 4.1.5, pnpm 10.33.1, Zod 4.3.6, @opentelemetry/api 1.9.1, @opentelemetry/sdk-node 0.215.0, @opentelemetry/exporter-trace-otlp-http 0.215.0, @anthropic-ai/sdk 0.104.1, @google/genai 2.7.0+, openai 6.34.0+) is NOT re-derived here. The existing provider adapters (7 in v1.3), capability catalog, RunEventKind, CostTracker, and receipt signing are treated as given.

---

## Theme 1: Provider Breadth + Catalog Maintenance

### Integration Shape — LiteLLM Gateway

**Decision: pure OpenAI-compatible HTTP, zero new dep.**

LiteLLM runs as a self-hosted proxy that speaks the OpenAI Chat Completions wire format. Lattice already ships an `OpenAICompatibleProvider` adapter. The v1.4 work is configuration, not a new library:

- Point the existing `OpenAICompatibleProvider` `baseURL` at the LiteLLM gateway endpoint (e.g. `http://localhost:4000/v1`).
- LiteLLM exposes `/v1/models` in OpenAI format; Lattice's capability catalog refresh can poll this endpoint.
- LiteLLM's `proxy_config.yaml` controls virtual keys, cost tracking, and provider routing — all outside Lattice's process.
- No Python SDK embedded; no new npm package.

### Integration Shape — OpenRouter Multi-Model Fallback

**Decision: extend the existing OpenRouter adapter with `models[]` via `extra_body`, zero new dep.**

OpenRouter extends the OpenAI Chat Completions body with a `models` field (array of model IDs in fallback priority order). The primary model is still passed as `model`; if it fails, OpenRouter attempts each `models[N]` in order. Error kinds that trigger fallback: rate-limit, downtime, moderation, context-length.

```typescript
// Lattice OpenRouter adapter — extra_body extension (no new package)
const body = {
  model: primaryModelId,
  models: fallbackModelIds,   // OpenRouter extension field
  messages: [...],
  // ...
};
```

When using the openai SDK pointed at OpenRouter (`baseURL: "https://openrouter.ai/api/v1"`), pass fallbacks via `extra_body: { models: [...] }`. The response `model` field returns whichever model actually served the request — already surfaced in Lattice's RunEventKind for tracing.

**`@openrouter/sdk` status**: npm version `0.12.79` (2026-06-10). This is auto-generated from OpenRouter's OpenAPI spec. Lattice SHOULD NOT add it as a dependency — the existing OpenAI-compatible HTTP path covers all needed routing; adding the OR SDK adds an extra dep layer with no benefit over direct `openai` SDK + `extra_body`.

### Capability Catalog Auto-Refresh

**Decision: native `fetch` + `node:timers` scheduler, zero new dep.**

The existing catalog seeding already fetches OpenRouter `/api/v1/models` at build time (~337 profiles). v1.4 adds a runtime refresh loop:

- `setInterval` / `setTimeout` (Node built-in) to schedule weekly re-fetch.
- `fetch` (Node 24 built-in) to pull `https://openrouter.ai/api/v1/models`.
- Parse + diff against existing profiles using existing catalog types.
- Write drifted profiles to the catalog (JSONL or in-memory depending on storage adapter).

No additional npm library needed. The existing `node-fetch` / undici is not required — Node 24's native `fetch` is stable and covers this use case.

---

## Theme 2: Live / Streaming Multimodal

### Streaming Responses — 5 Newer Adapters

All five adapters (Anthropic, Gemini, xAI, OpenRouter, LM Studio) already support streaming via SSE. The required transport primitives:

| Adapter | Protocol | Transport | New dep? |
|---------|----------|-----------|----------|
| Anthropic | SSE | `@anthropic-ai/sdk` `messages.stream()` or `messages.create({ stream: true })` → `MessageStream` / `Stream<MessageStreamEvent>` | No — `@anthropic-ai/sdk@0.104.1` already ships streaming |
| Gemini | SSE-like over HTTP/2 | `@google/genai@2.8.0` `models.generateContentStream()` | No — `@google/genai@2.8.0` already ships streaming |
| xAI | SSE (OpenAI-compatible) | `openai` SDK pointed at `https://api.x.ai/v1`, `stream: true` | No — identical to OpenAI stream path |
| OpenRouter | SSE (OpenAI-compatible) | `openai` SDK pointed at `https://openrouter.ai/api/v1`, `stream: true` | No |
| LM Studio | SSE (OpenAI-compatible) | `openai` SDK pointed at `http://localhost:1234/v1`, `stream: true` | No |

**Streaming consumer pattern** (already available in Node 24, no new dep):

```typescript
// All adapters return a ReadableStream-compatible async iterable
for await (const chunk of stream) {
  // emit RunEventKind.StreamDelta
}
```

#### `eventsource-parser` — considered, not needed

The `eventsource-parser@3.1.0` package would be useful if implementing a raw SSE decoder. However, all five adapters delegate SSE parsing to their respective official SDKs (or the `openai` SDK for OpenAI-compatible providers). There is no case in v1.4 where Lattice needs to parse raw SSE bytes directly — do NOT add `eventsource-parser` as a core dependency.

### Multimodal Request Shaping — Anthropic

**Decision: zero new dep. Pure data transformation inside the Anthropic adapter.**

Anthropic's Messages API accepts image content blocks in two shapes:

```typescript
// base64 inline
{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "<b64>" } }

// URL reference
{ type: "image", source: { type: "url", url: "https://..." } }

// Files API reference (v0.104+)
{ type: "image", source: { type: "file", file_id: "<id>" } }
```

Supported media types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. Max 20 images/request. Max ~5MB per image after encoding.

The Lattice `Artifact` type already carries `Blob` payloads, MIME types, and URL references. The Anthropic adapter needs a `packMultimodalContent(artifact: Artifact)` shaper that maps Lattice artifacts to the correct Anthropic content block shape. This is pure TypeScript data transformation — no new package.

### Multimodal Request Shaping — Gemini

**Decision: zero new dep. `@google/genai@2.8.0` already covers all shapes.**

Gemini's `generateContent` accepts `parts[]` with:

```typescript
// Inline data
{ inlineData: { mimeType: "image/jpeg", data: "<b64>" } }

// Uploaded file reference (Gemini Files API)
{ fileData: { mimeType: "video/mp4", fileUri: "https://generativelanguage.googleapis.com/v1beta/files/..." } }

// YouTube URL
{ fileData: { mimeType: "video/youtube", fileUri: "https://youtube.com/..." } }
```

Gemini supports image, audio, and video inputs. The Lattice Gemini adapter needs a `packParts(artifacts: Artifact[])` helper that maps Lattice artifact types to Gemini `Part` structures. Zero new dependencies.

### Realtime Bidirectional Audio/Video — OpenAI Realtime API

**Decision: WebSocket via `openai` SDK built-in class, with `ws` as peer dep for Node server-side.**

| Aspect | Detail |
|--------|--------|
| Transport | WebSocket (server-side Node); WebRTC (browser clients — out of scope for Lattice SDK) |
| SDK class | `OpenAIRealtimeWebSocket` from `openai/realtime/websocket` — ships inside `openai@6.42.0` |
| Node WebSocket | `openai` SDK uses `ws` internally for Node; `ws@8.21.0` is the stable package |
| New dep in Lattice? | `ws@8.21.0` as a **peer/optional dep** on the realtime adapter package only |
| Why not raw `ws` directly? | `OpenAIRealtimeWebSocket` handles session setup, event typing (`session.update`, `response.create`, etc.), and error events — reimplementing this wastes v1.4 effort |
| Audio format | Raw PCM 16-bit / 24kHz for input; output is base64-encoded audio chunks in `response.audio.delta` events |
| New package to create | `packages/adapter-openai-realtime` (optional, peer-dep on `openai`) — keeps ws out of core |

**What NOT to add**: `openai-realtime-api-beta` (older reference client, superseded by the built-in `openai/realtime/websocket` path). The official `openai` package at `6.42.0` already ships realtime support natively.

### Realtime Bidirectional Audio/Video — Gemini Live API

**Decision: `@google/genai@2.8.0` `ai.live` surface, native WebSocket under the hood, no extra dep.**

The `@google/genai` SDK exposes a `live` property on the `GoogleGenAI` client. The Live API uses WebSockets internally to `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent`. The SDK abstracts the WebSocket — Lattice does NOT need a raw WebSocket connection or the `ws` package for Gemini Live.

Key method: `ai.live.connect({ model, config })` — returns a live session handle for bidirectional text/audio/video streaming.

Audio format: PCM 16-bit / 16kHz input; supports voice activity detection (VAD) and automatic transcription.

Models in 2026: `gemini-3.1-flash-live-preview` (current; migrated from older preview names). Lock to `models/gemini-2.5-flash-live-001` for stability if preview names keep rotating.

**New dep?** None — `@google/genai@2.8.0` covers this. The `live` module is included in the existing package.

### Streaming Primitives Summary — What Stays Native

Node 24 provides all needed streaming primitives for v1.4:
- `ReadableStream` / `TransformStream` / `WritableStream` (Web Streams API) — for streaming chunk passthrough
- `Response.body` (fetch) — for raw SSE parsing when needed
- Native `WebSocket` (Node 22.4+, stable in Node 24) — available but all provider SDKs wrap it; Lattice doesn't need to use it directly
- `node:stream` `Readable`/`Transform` — for piping to Node consumers

**Do not add**: `undici` (already a peer of many packages but not needed directly), `node-fetch` (superseded by native fetch in Node 24), `eventsource-parser` (provider SDKs handle SSE parsing internally).

---

## Theme 3: Eval + Observability Export

### OpenTelemetry — Core SDK Versions (ALREADY IN REPO — confirm, do not upgrade carelessly)

The v1.3 STACK.md pins these. Verified current versions as of 2026-06-15:

| Package | Current npm version | Pinned in repo | Action |
|---------|--------------------|--------------------|--------|
| `@opentelemetry/api` | `1.9.1` | `1.9.1` | No change — stable API version |
| `@opentelemetry/sdk-node` | `0.219.0` | `0.215.0` | Patch upgrade available; safe to upgrade |
| `@opentelemetry/exporter-trace-otlp-http` | `0.219.0` | `0.215.0` | Patch upgrade available; safe to upgrade |
| `@opentelemetry/sdk-trace-base` | `2.8.0` | n/a (peer) | Transitively managed |

**`@opentelemetry/sdk-node` 0.219.x vs 0.215.x**: same semver pre-1.0 patch stream; safe to take `0.219.0`. The OTel JS SDK uses a parallel versioning scheme where `0.x` is the unstable layer and `1.x` is the stable `@opentelemetry/api`; the split is intentional.

### OpenTelemetry GenAI Semantic Conventions

**Decision: `@opentelemetry/semantic-conventions@1.41.1`, import from `/incubating` entry point.**

GenAI attributes are in the `incubating` (experimental) export. There are **130 gen_ai.* attribute constants** in `@opentelemetry/semantic-conventions@1.41.1`. Key constants verified:

| Constant | String value |
|----------|-------------|
| `ATTR_GEN_AI_SYSTEM` | `gen_ai.system` |
| `ATTR_GEN_AI_REQUEST_MODEL` | `gen_ai.request.model` |
| `ATTR_GEN_AI_RESPONSE_MODEL` | `gen_ai.response.model` |
| `ATTR_GEN_AI_OPERATION_NAME` | `gen_ai.operation.name` |
| `ATTR_GEN_AI_USAGE_INPUT_TOKENS` | `gen_ai.usage.input_tokens` |
| `ATTR_GEN_AI_USAGE_OUTPUT_TOKENS` | `gen_ai.usage.output_tokens` |
| `ATTR_GEN_AI_AGENT_NAME` | `gen_ai.agent.name` |
| `ATTR_GEN_AI_AGENT_ID` | `gen_ai.agent.id` |
| `ATTR_GEN_AI_TOOL_NAME` | `gen_ai.tool.name` |
| `ATTR_GEN_AI_TOOL_CALL_ID` | `gen_ai.tool.call.id` |
| `GEN_AI_SYSTEM_VALUE_ANTHROPIC` | `anthropic` |
| `GEN_AI_SYSTEM_VALUE_OPENAI` | `openai` |
| `GEN_AI_SYSTEM_VALUE_GEMINI` | `gemini` |
| `GEN_AI_SYSTEM_VALUE_GCP_VERTEX_AI` | `vertex_ai` |
| `GEN_AI_SYSTEM_VALUE_XAI` | `xai` |
| `GEN_AI_OPERATION_NAME_VALUE_CHAT` | `chat` |
| `GEN_AI_OPERATION_NAME_VALUE_INVOKE_AGENT` | `invoke_agent` |

Import pattern:
```typescript
import {
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_SYSTEM_VALUE_ANTHROPIC,
} from "@opentelemetry/semantic-conventions/incubating";
```

**Stability caveat**: the `/incubating` export is explicitly NOT stable-semver. Breaking changes can appear in minor releases. Lattice's `RunEventKind` → OTel span mapper should isolate these imports to one internal module so a convention rename only touches one file.

**No separate `@opentelemetry/semantic-conventions-genai` package exists on npm** (there is a Python package `opentelemetry-semantic-conventions-ai` but nothing equivalent for JS/TS). The JS constants live in the standard `@opentelemetry/semantic-conventions` `/incubating` path.

### OTel Exporter for `RunEventKind` — Design

**Decision: thin `packages/exporter-otel` package, peer-deps on `@opentelemetry/api` only (not sdk-node).**

The exporter:
1. Accepts the existing `OtelTracer` / `TraceProvider` from the host app (not creating its own).
2. Maps `RunEventKind` union members to OTel spans using the GenAI semconv constants above.
3. Emits `gen_ai.operation.name = "chat"` for provider calls, `gen_ai.operation.name = "invoke_agent"` for agent iterations.
4. Sets `gen_ai.system` from the provider adapter's system identifier, `gen_ai.request.model` / `gen_ai.response.model` from the run result.
5. Emits token usage attributes per completion.

This keeps `@opentelemetry/api` as the only dep — the API package is stable-semver (`1.x`) and will not break. `sdk-node` stays in the host app (or in a separate `exporter-otel-setup` helper package).

### Langfuse Export via OTel

**Decision: `@langfuse/otel@5.4.1` as an OPTIONAL peer dep. Do not bake into core.**

Langfuse now provides `LangfuseSpanProcessor` from `@langfuse/otel`. Users add it to their existing OTel `NodeSDK.spanProcessors` alongside Lattice's exporter:

```typescript
import { LangfuseSpanProcessor } from "@langfuse/otel";
// peer deps: @opentelemetry/api ^1.9.0, @opentelemetry/sdk-trace-base ^2.0.1, @opentelemetry/exporter-trace-otlp-http >=0.202.0
```

**Langfuse OTLP endpoint** (for raw OTLP path, if user prefers not to use the SDK):
- EU: `https://cloud.langfuse.com/api/public/otel/v1/traces`
- US: `https://us.cloud.langfuse.com/api/public/otel/v1/traces`
- Auth: Basic auth header → `Authorization: Basic base64(pk-lf-xxx:sk-lf-xxx)` + `x-langfuse-ingestion-version: 4`
- Formats: HTTP/JSON and HTTP/Protobuf both supported; gRPC NOT supported

**Attribute conventions Langfuse reads**: `gen_ai.*` attributes (highest priority), `langfuse.*` namespace overrides, then catch-all storage under `metadata.attributes`. Lattice's `gen_ai.*` span output is natively readable by Langfuse without any attribute remapping.

Lattice should provide a docs example showing how to wire `LangfuseSpanProcessor` into a `NodeSDK`. Lattice does NOT import `@langfuse/otel` in its own packages — it remains a user-side integration.

### Arize Phoenix Export via OTel

**Decision: raw OTLP exporter (`@opentelemetry/exporter-trace-otlp-http` already in repo). `@arizeai/phoenix-otel@1.0.2` is optional convenience only.**

Phoenix receives standard OTLP traces on `/v1/traces` (normalizes Phoenix base URL to OTLP path internally). The `@arizeai/phoenix-otel` package is a thin wrapper that sets the endpoint and re-exports `@arizeai/openinference-core`. If users want it:

```bash
npm install @arizeai/phoenix-otel @arizeai/openinference-core
```

But since Lattice already emits `gen_ai.*` spans using the standard semconv, Phoenix ingests them without any Arize-specific instrumentation. The OTLP exporter already in the repo (`@opentelemetry/exporter-trace-otlp-http@0.215.0`) is sufficient.

**Do NOT add** `@arizeai/phoenix-otel` or `@arizeai/openinference-core` to Lattice's own packages. These are user-side additions.

### `lattice eval --agent` CLI Subcommand

**Decision: extends existing `citty@0.2.2` CLI. Zero new deps.**

The existing `lattice eval` subcommand (CLI-06, Phase 12) already walks `.lattice/receipts/` and runs `replayOffline`. The `--agent` flag wraps the existing `evalAgentRun` kernel (Phase 22, SHOWCASE-AGENT-02) to run multi-scenario agent evaluations.

No new CLI parsing library needed — `citty` already handles lazy subcommands and flags.

---

## New Dependencies Summary

These are the ONLY net-new packages v1.4 may add to the monorepo:

| Package | Version | Where | Justification | Tree-shakable? |
|---------|---------|-------|---------------|----------------|
| `@opentelemetry/semantic-conventions` | `1.41.1` | `packages/exporter-otel` | GenAI attribute constants (`/incubating`); confirms existing pinning or adds if not present | YES — import only what you reference |
| `ws` | `8.21.0` | `packages/adapter-openai-realtime` (optional peer) | OpenAI Realtime WebSocket (server-side); Node 24 has native WS but `openai/realtime/websocket` uses `ws` internally for typed events | N/A — server-only |
| `@types/ws` | `8.18.1` | devDependency in `adapter-openai-realtime` | Type stubs for `ws` | N/A — dev only |

**No other new production dependencies.** Every streaming primitive, multimodal content shaping, gateway integration, and catalog refresh uses either existing provider SDKs already in the monorepo or Node 24 built-ins.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `eventsource-parser` | Provider SDKs (Anthropic, Google, OpenAI) all handle SSE parsing internally; Lattice never sees raw SSE bytes | Built-in SDK streaming on existing deps |
| `@openrouter/sdk@0.12.79` | OpenAI-compatible HTTP via `openai` SDK + `extra_body: { models: [...] }` already covers fallback; OR SDK is an extra dep with same surface | Existing OpenRouter adapter + `models[]` extension field |
| `@arizeai/phoenix-otel` / `@arizeai/openinference-core` | Lattice's `gen_ai.*` OTel spans are natively ingested by Phoenix; no Arize SDK needed in Lattice itself | Document as user-side addition |
| `@langfuse/tracing` / `@langfuse/otel` | Same — Langfuse OTel ingestion reads standard `gen_ai.*` spans; user adds `LangfuseSpanProcessor` in their app, not in Lattice | Document as user-side addition |
| `@opentelemetry/sdk-node` in `exporter-otel` | SDK-node is a Node.js bootstrap package; it must live in host apps, not in a library package | Peer-dep on `@opentelemetry/api@^1.9.0` only |
| `openai-realtime-api-beta` | Superseded by `openai/realtime/websocket` built into `openai@6.42.0` | `OpenAIRealtimeWebSocket` from `openai/realtime/websocket` |
| `node-fetch` or `undici` (direct) | Node 24 native `fetch` is stable and covers catalog refresh HTTP calls | `globalThis.fetch` (Node 24 built-in) |
| `@google/generative-ai` | Deprecated November 30 2025; `@google/genai@2.8.0` replaces it and includes Live API support | `@google/genai` (already in repo from v1.3 canary) |
| WebRTC for OpenAI Realtime | WebRTC is browser-only; Lattice is a Node SDK; OpenAI recommends WebSocket for server-to-server | `OpenAIRealtimeWebSocket` (ws-based) |
| LiteLLM Python SDK | Python process complexity defeats TypeScript-first constraint; LiteLLM as a gateway needs no JS SDK | HTTP to LiteLLM's OpenAI-compatible `/v1/*` endpoints |
| Any dashboard / UI library | v1.4 exports INTO Langfuse / Phoenix; it does not build dashboards | OTel export to OTLP endpoint |
| New eval framework (promptfoo, etc.) | Lattice ships its own `evalAgentRun` kernel and `lattice eval`; adding a framework dep violates small-SDK constraint | Extend existing `lattice eval --agent` subcommand |

---

## Integration Points Against Existing Stack

| v1.4 Feature | Existing Surface It Extends | Integration Point |
|---|---|---|
| Streaming (all 5 adapters) | `ProviderAdapter` interface + `RunEventKind` | Add `StreamDelta` to RunEventKind; adapters return `AsyncIterable<Chunk>` from existing `call()` method |
| Anthropic multimodal shaping | Anthropic `ProviderAdapter.call()` | `packMultimodalContent()` helper inside Anthropic adapter module |
| Gemini multimodal shaping | Gemini `ProviderAdapter.call()` | `packParts()` helper inside Gemini adapter module |
| OpenAI Realtime | New optional `packages/adapter-openai-realtime` | Implements same `ProviderAdapter` interface; emits `RunEventKind.StreamDelta` for audio chunks |
| Gemini Live | Existing Gemini adapter extended | `ai.live.connect()` from `@google/genai` called inside Gemini adapter's realtime path |
| OTel RunEventKind exporter | `RunEventKind` union + CostTracker + receipt receipts | New `packages/exporter-otel`; subscribes to existing trace hooks |
| OTel GenAI semconv | `@opentelemetry/semantic-conventions/incubating` | Maps `RunEventKind` fields → span attributes using verified constants |
| OpenRouter fallback array | Existing OpenRouter `ProviderAdapter` | Extend `OpenRouterProviderOptions` with `fallbackModels?: string[]`; inject as `extra_body.models` |
| LiteLLM gateway | `OpenAICompatibleProvider` | Config-level: `baseURL` → LiteLLM; catalog refresh polls LiteLLM `/v1/models` |
| Catalog auto-refresh | Existing catalog types + capability registry | `setInterval` polling + native `fetch` in catalog package |
| `lattice eval --agent` | Existing `citty` CLI + `evalAgentRun` kernel | New `--agent` flag on existing `eval` subcommand |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@opentelemetry/api@1.9.1` | `@opentelemetry/sdk-node@0.219.0` | sdk-node peer-requires `@opentelemetry/api >= 1.0.0 < 1.10.0`; 1.9.1 is in range |
| `@langfuse/otel@5.4.1` | `@opentelemetry/api@^1.9.0`, `@opentelemetry/sdk-trace-base@^2.0.1`, `@opentelemetry/exporter-trace-otlp-http@>=0.202.0` | Lattice's existing OTel versions satisfy all three peer deps |
| `@opentelemetry/semantic-conventions@1.41.1` | All OTel 1.x SDK packages | Semantic conventions are versioned independently; 1.41.1 is forward-compatible |
| `ws@8.21.0` | `openai@6.42.0` realtime | OpenAI realtime uses ws internally; version pinning is inside the openai package |
| `@google/genai@2.8.0` | Node >= 18 | Covers Live API (`ai.live`); compatible with Node 24 floor |
| `openai@6.42.0` | `OpenAIRealtimeWebSocket` | Realtime class ships in mainline openai package at this version |

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@opentelemetry/semantic-conventions/incubating` for gen_ai attrs | Hard-coded string constants | Only if the semconv package causes bundle issues (it won't in a Node SDK) |
| `OpenAIRealtimeWebSocket` from `openai` pkg | Raw `ws` + manual event protocol | Only if building a custom realtime transport not based on OpenAI |
| Gemini Live via `@google/genai` `ai.live` | Raw WebSocket to Gemini WS endpoint | Only if SDK surface doesn't expose a needed Live API feature; adds protocol maintenance burden |
| OTLP HTTP exporter (existing) for Phoenix | `@arizeai/phoenix-otel` | If user wants simplified Phoenix endpoint setup; acceptable as user-side addition, not Lattice core |
| `LangfuseSpanProcessor` from `@langfuse/otel` | Raw OTLP to Langfuse endpoint | Both work; `LangfuseSpanProcessor` adds masking/filtering features |
| OpenAI-compatible HTTP for LiteLLM | LiteLLM JS SDK (not official) | No official LiteLLM JS SDK exists; community ones are wrappers over the same HTTP |

---

## Installation

```bash
# In packages/exporter-otel (new package)
pnpm add @opentelemetry/api@^1.9.0
pnpm add -D @opentelemetry/semantic-conventions@1.41.1

# In packages/adapter-openai-realtime (new optional package)
pnpm add ws@^8.21.0
pnpm add -D @types/ws@^8.18.1
# openai is a peer dep (already in repo)

# Nothing else — all other v1.4 features use existing deps
```

**User-side (documented, not in Lattice packages):**
```bash
# For Langfuse export
npm install @langfuse/otel @opentelemetry/sdk-node

# For Phoenix export (optional wrapper)
npm install @arizeai/phoenix-otel
# OR: raw OTLP with existing @opentelemetry/exporter-trace-otlp-http
```

---

## Sources

- `@opentelemetry/semantic-conventions@1.41.1` — verified via `npm view` + local install; `/incubating` exports 130 gen_ai.* constants confirmed by running `node -e` against installed package. HIGH confidence.
- `@opentelemetry/api@1.9.1`, `@opentelemetry/sdk-node@0.219.0`, `@opentelemetry/exporter-trace-otlp-http@0.219.0` — verified via `npm view`. HIGH confidence.
- `@langfuse/otel@5.4.1` peer deps — verified via `npm view @langfuse/otel peerDependencies`. HIGH confidence.
- [Langfuse OTel integration docs](https://langfuse.com/integrations/native/opentelemetry) — OTLP endpoint format, auth headers, attribute conventions. HIGH confidence.
- [Langfuse existing OTel setup guide](https://langfuse.com/faq/all/existing-otel-setup) — `LangfuseSpanProcessor` import and NodeSDK wiring. HIGH confidence.
- `@arizeai/phoenix-otel@1.0.2` — verified via `npm view`. [Phoenix OTel docs](https://arize.com/docs/phoenix/sdk-api-reference/typescript/packages/phoenix-otel/overview). MEDIUM confidence (package is "under active development, APIs may change").
- OpenAI Realtime API — [WebSocket docs](https://developers.openai.com/api/docs/guides/realtime-websocket) confirm ws-based server-to-server; `openai/realtime/websocket` `OpenAIRealtimeWebSocket` class confirmed via GitHub source. `openai@6.42.0` verified via `npm view`. HIGH confidence.
- Gemini Live API — [WebSocket guide](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket) and [js-genai repo](https://github.com/googleapis/js-genai) confirm `ai.live` property; `@google/genai@2.8.0` verified via `npm view`. MEDIUM confidence on exact method name (`ai.live.connect`) — needs confirmation against SDK source or docs page for js-genai.
- xAI streaming — [xAI streaming docs](https://docs.x.ai/developers/model-capabilities/text/streaming) confirm OpenAI-compatible SSE, `stream: true`, `chat.completion.chunk` response shape. HIGH confidence.
- LM Studio streaming — [LM Studio OpenAI compat docs](https://lmstudio.ai/docs/app/api/endpoints/openai) confirm OpenAI-compatible SSE. HIGH confidence.
- OpenRouter `models[]` fallback — [OpenRouter model fallbacks docs](https://openrouter.ai/docs/guides/routing/model-fallbacks) confirm `models` field in HTTP body and `extra_body` pattern with OpenAI SDK. HIGH confidence.
- `@openrouter/sdk@0.12.79` — verified via `npm view`. HIGH confidence (version current).
- Anthropic multimodal — [Claude Vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) confirm base64/url/file content block shapes and supported MIME types. HIGH confidence.
- Gemini multimodal — [Image understanding docs](https://ai.google.dev/gemini-api/docs/image-understanding) and [Video understanding docs](https://ai.google.dev/gemini-api/docs/video-understanding) confirm `inlineData`/`fileData` `parts[]` shape. HIGH confidence.
- `ws@8.21.0`, `@types/ws@8.18.1` — verified via `npm view`. HIGH confidence.
- OTel GenAI semconv stability — [OpenTelemetry GenAI semconv docs](https://opentelemetry.io/docs/specs/semconv/gen-ai/) confirm experimental/development status; `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` for latest attrs. MEDIUM confidence (conventions actively evolving).

---
*Stack research for: v1.4 Provider Breadth + Live Multimodal + Eval/Observability Export*
*Researched: 2026-06-15*
