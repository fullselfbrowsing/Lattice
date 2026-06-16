# Phase 47: OpenTelemetry Exporter + Langfuse/Phoenix Paths - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 47 adds a core-safe OpenTelemetry bridge for Lattice `RunEvent` values. In scope: a `createOtelRunEventSink()` factory that maps the existing event vocabulary into one root run span plus span events, stable `gen_ai.*` and `lattice.*` attributes, a default sanitizer that excludes raw prompt/output/artifact content, receipt CID/signature references when an event carries a receipt envelope, and Langfuse/Phoenix OTLP setup paths without adding those SDKs or OpenTelemetry packages to `@full-self-browsing/lattice`.

Out of scope: adding `@opentelemetry/*`, `@langfuse/*`, or `@arizeai/*` dependencies to core; building a tracing dashboard; adding per-token stream events; changing `RunEventKind`; changing runtime receipt issuance order; or coupling the exporter to the hook pipeline. The exporter consumes the existing `RunEventSink` boundary.

</domain>

<decisions>
## Implementation Decisions

### Exporter Shape
- Add an `observability/` module with structural OpenTelemetry-like types instead of importing `@opentelemetry/api`. This keeps core dependency-free while accepting real OTel tracer/span objects in host apps.
- `createOtelRunEventSink({ tracer })` returns `RunEventSink`. It starts one run span on `run.start`, lazily creates one if a sink sees later events first, adds every `RunEvent` as a span event, and ends the run span on `run.complete` or `run.failed`.
- The span name should be low-cardinality by default (`lattice.run`). Per-event names use `lattice.<event.kind>` to keep backend filtering predictable.
- Default status mapping: successful terminal runs set status code 1; failed terminal runs set status code 2 and record a sanitized exception/message if available. The structural type accepts numeric OTel status codes without importing the enum.

### Attribute Contract
- Use stable Lattice names with dot-separated keys: `lattice.run.id`, `lattice.plan.id`, `lattice.stage.id`, `lattice.provider.id`, `lattice.model.id`, `lattice.artifact.id`, `lattice.event.kind`.
- Emit GenAI convention keys where Lattice has equivalent data: `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, and `gen_ai.request.stream`.
- Emit OpenInference-compatible token aliases for Phoenix compatibility where usage exists: `llm.token_count.prompt` and `llm.token_count.completion`.
- Do not make up content attributes by default. `gen_ai.input.messages` and `gen_ai.output.messages` are content-bearing and remain absent unless explicit capture is enabled.

### Sanitizer
- Default mode is content-safe. It includes identifiers, statuses, counts, usage, route/fallback summaries, tool names/call ids, safe gateway model metadata, and receipt references.
- Default mode excludes raw prompt, task, message, content, input, output, artifact value, body, payload, headers, authorization, API keys, tokens, secrets, and password-shaped fields.
- An explicit metadata capture mode can include bounded primitive metadata while still redacting secret-shaped keys and content-shaped keys. No mode in this phase emits arbitrary raw artifact bytes or provider response bodies.

### Receipt Attributes
- Runtime terminal `run.complete` currently fires before `maybeIssueReceipt()` returns the result receipt, so the sink cannot attach that result receipt without changing runtime flow.
- The exporter should attach receipt attributes when they are available on event metadata, especially checkpoint `step.transition` events carrying a receipt envelope. Required attributes: `lattice.receipt.cid`, `lattice.receipt.signature.count`, and first signer key id as `lattice.receipt.signature.keyid`.
- Receipt CID derivation should reuse `receiptCid()` and remain best-effort: malformed receipt metadata should not crash telemetry export.

### Langfuse/Phoenix Path
- Provide thin OTLP HTTP configuration helpers or docs that output endpoint/header data only. Do not instantiate OTel SDK exporters inside core.
- Langfuse docs use OTLP HTTP under `/api/public/otel` and signal-specific trace endpoint `/api/public/otel/v1/traces`, with Basic auth and `x-langfuse-ingestion-version=4`.
- Phoenix docs support local HTTP `/v1/traces` on port 6006 and Phoenix Cloud/self-hosted collector endpoints. Phoenix's `@arizeai/phoenix-otel` remains a host-app dependency, not a Lattice dependency.

### the agent's Discretion
- The implementation may expose small helper functions such as `sanitizeRunEventAttributes`, `createOtelReceiptAttributes`, `createLangfuseOtlpConfig`, and `createPhoenixOtlpConfig` if they keep tests and user setup clearer.
- Type exports should be guarded through package-root public-surface tests and `runtime/public-types.ts`.
- Tests should directly synthesize every current `RunEventKind` so future union additions force this exporter test to be updated.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/tracing/tracing.ts` defines `RunEventKind`, `RunEvent`, `RunEventSink`, and `createRunEvent()`.
- `runtime/create-ai.ts` already emits run, artifact, context, router, provider attempt, stream, fallback, validation, tool, and terminal events through `normalized.events`.
- `receiptCid()` in `receipts/cid.ts` derives `sha256:<hex>` from a DSSE receipt envelope without key material.
- `scripts/check-core-package-boundary.mjs` forbids `@opentelemetry/api`, OTel SDK/exporter packages, `@langfuse/otel`, and `@arizeai/phoenix-otel` in core dependencies and built output.

### Current Event Vocabulary
- `run.start`
- `artifact.ingested`
- `context.packed`
- `router.candidates`
- `stage.start`
- `stage.complete`
- `provider.attempt`
- `stream.start`
- `stream.complete`
- `stream.failed`
- `fallback.activated`
- `validation.complete`
- `validation.failed`
- `artifact.created`
- `run.complete`
- `run.failed`
- `tool.call`
- `replay.offline`
- `replay.live`
- `step.transition`
- `recovery.start`
- `recovery.complete`
- `recovery.failed`
- `capabilities.negotiation.fallback`

### Integration Points
- Add `packages/lattice/src/observability/otel.ts` and `otel.test.ts`.
- Export values from `packages/lattice/src/index.ts`.
- Export types from `packages/lattice/src/runtime/public-types.ts` and package root type list.
- Add type reachability assertions in `packages/lattice/src/runtime/public-types.test.ts` and `packages/lattice/test-d/index.test-d.ts` or related package type tests.
- Add a changeset because this adds new public API.

</code_context>

<specifics>
## Specific Ideas

Official docs checked 2026-06-16:
- OpenTelemetry GenAI attribute registry documents `gen_ai.provider.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.request.stream`, and warns that input/output message attributes can contain sensitive information: https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
- OpenTelemetry JS instrumentation docs say library instrumentation should avoid requiring the SDK and emit telemetry only when the host app has an SDK configured: https://opentelemetry.io/docs/languages/js/instrumentation/
- Langfuse OpenTelemetry docs document `/api/public/otel`, `/api/public/otel/v1/traces`, Basic auth, `x-langfuse-ingestion-version=4`, and HTTP JSON/protobuf support without gRPC: https://langfuse.com/integrations/native/opentelemetry
- Phoenix setup docs document `PHOENIX_COLLECTOR_ENDPOINT`, local default `http://localhost:6006`, Phoenix Cloud/self-hosted endpoints, and the optional `@arizeai/phoenix-otel` package for TypeScript host apps: https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-using-phoenix-otel
- Phoenix self-hosted configuration documents HTTP `/v1/traces` on port 6006 and gRPC on 4317: https://arize.com/docs/phoenix/self-hosting/configuration

</specifics>

<deferred>
## Deferred Ideas

Dedicated child provider spans, OTel links, metrics, OpenTelemetry SDK factories, hosted Langfuse/Phoenix SDK wrappers, baggage propagation, user/session attribution helpers, and per-token stream telemetry are deferred. Phase 48 owns diagnostics aggregation and CLI expansion.

</deferred>
