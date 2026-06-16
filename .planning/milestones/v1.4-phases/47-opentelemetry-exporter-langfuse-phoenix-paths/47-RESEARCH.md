# Phase 47 Research

## Primary Findings

### OpenTelemetry GenAI Conventions

The current OpenTelemetry GenAI docs have moved into the OpenTelemetry GenAI semantic-conventions repository, but the public registry still lists the relevant attributes. For Phase 47, Lattice should emit:

| Attribute | Lattice source | Notes |
| --- | --- | --- |
| `gen_ai.provider.name` | `RunEvent.providerId` | Preferred provider identity key. |
| `gen_ai.request.model` | `RunEvent.modelId` | Requested model when known. |
| `gen_ai.response.model` | `metadata.gateway.observedModel` or safe gateway response model | Useful for OpenRouter/LiteLLM resolved model cases. |
| `gen_ai.usage.input_tokens` | usage metadata prompt/input tokens | Only when present; do not estimate in exporter. |
| `gen_ai.usage.output_tokens` | usage metadata completion/output tokens | Only when present. |
| `gen_ai.request.stream` | stream events or stream policy metadata | Boolean marker, not token payload. |

The GenAI registry explicitly warns that input/output message attributes can contain sensitive or PII data. Phase 47 should therefore omit content-bearing attributes by default and require explicit capture mode before considering bounded metadata.

### Library Boundary

The OpenTelemetry JS documentation separates library instrumentation from application SDK setup: libraries can expose instrumentation while host apps install/configure SDKs and exporters. This matches Lattice's package-boundary script, which forbids OTel SDK/exporter dependencies in core.

Decision: define structural `OtelTracerLike`/`OtelSpanLike` types rather than importing `@opentelemetry/api`. Real OpenTelemetry tracers are structurally compatible enough for host apps to pass in `trace.getTracer("lattice")`.

### Langfuse

Langfuse can receive OTLP over HTTP at `/api/public/otel` and signal-specific traces at `/api/public/otel/v1/traces`. It uses Basic auth over public/secret keys and recommends `x-langfuse-ingestion-version=4` for direct OpenTelemetry ingestion. It does not support gRPC at the documented endpoint.

Decision: expose a helper that returns endpoint and headers, not an exporter instance. Host apps wire that into `OTLPTraceExporter`.

### Phoenix

Phoenix accepts OTLP traces and has a TypeScript package `@arizeai/phoenix-otel` that configures OpenTelemetry and exports to Phoenix. Self-hosted Phoenix exposes HTTP `/v1/traces` on port 6006 and gRPC on 4317. The TypeScript helper package remains optional and should be documented as a host-app choice.

Decision: emit both `gen_ai.usage.*` and `llm.token_count.*` when usage exists to improve Phoenix/OpenInference display compatibility, but do not import Phoenix packages.

## Risks

| Risk | Mitigation |
| --- | --- |
| OTel semantic conventions are still moving | Emit a conservative subset of documented `gen_ai.*` keys and stable `lattice.*` keys. |
| Sensitive content leaks into span attributes | Default sanitizer excludes content-shaped and secret-shaped keys; tests assert prompts/outputs/artifact values are absent. |
| Receipt attributes are unavailable on terminal runtime events | Attach receipt references only when an event metadata object carries an envelope; document runtime result receipt timing. |
| Real OTel status enums are unavailable | Use numeric status codes in the structural type: OK=1, ERROR=2. |
| Event vocabulary grows later | Tests use an exhaustive `satisfies readonly RunEventKind[]` list covering every current literal. |

## Source Links

- OpenTelemetry GenAI attribute registry: https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/
- OpenTelemetry JS instrumentation docs: https://opentelemetry.io/docs/languages/js/instrumentation/
- OpenTelemetry GenAI semantic conventions repository: https://github.com/open-telemetry/semantic-conventions-genai
- Langfuse OpenTelemetry integration: https://langfuse.com/integrations/native/opentelemetry
- Phoenix OTEL setup: https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-using-phoenix-otel
- Phoenix self-hosted ports/endpoints: https://arize.com/docs/phoenix/self-hosting/configuration

