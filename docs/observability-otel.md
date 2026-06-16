# OpenTelemetry Observability

Lattice can export `RunEvent` telemetry into an OpenTelemetry tracer with:

```ts
import { trace } from "@opentelemetry/api";
import { createAI, createOtelRunEventSink } from "@full-self-browsing/lattice";

const tracer = trace.getTracer("lattice");

const ai = createAI({
  providers: [provider],
  events: [createOtelRunEventSink({ tracer })],
});
```

`@full-self-browsing/lattice` does not install or configure the OpenTelemetry SDK. The host application owns provider registration, exporters, batching, sampling, resource attributes, and shutdown.

## Export Shape

`createOtelRunEventSink()` creates one low-cardinality run span named `lattice.run` per `runId`. Every Lattice `RunEvent` is added as a span event named `lattice.<event.kind>`.

Default attributes include:

- `lattice.run.id`
- `lattice.plan.id`
- `lattice.provider.id`
- `lattice.model.id`
- `lattice.event.kind`
- `gen_ai.provider.name`
- `gen_ai.request.model`
- `gen_ai.response.model` when gateway metadata reports an observed model
- `gen_ai.usage.input_tokens` and `gen_ai.usage.output_tokens` when usage metadata is available
- `llm.token_count.prompt` and `llm.token_count.completion` for Phoenix/OpenInference compatibility
- `lattice.receipt.cid` and signature references when an event carries a receipt envelope

The default sanitizer excludes raw prompt, output, artifact, message, body, payload, header, authorization, API key, token, password, and secret-shaped metadata. To include bounded custom metadata, pass:

```ts
createOtelRunEventSink({
  tracer,
  contentCapture: "metadata",
});
```

This mode still excludes content-shaped and secret-shaped keys.

## Langfuse OTLP

Langfuse accepts OTLP over HTTP at `/api/public/otel`; signal-specific trace exports use `/api/public/otel/v1/traces`. Lattice provides a config helper only:

```ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { createLangfuseOtlpConfig } from "@full-self-browsing/lattice";

const langfuse = createLangfuseOtlpConfig({
  baseUrl: "https://us.cloud.langfuse.com",
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
});

const exporter = new OTLPTraceExporter({
  url: langfuse.endpoint,
  headers: langfuse.headers,
});
```

For EU Cloud, omit `baseUrl` to use `https://cloud.langfuse.com`. For local Langfuse, pass the local base URL, for example `http://localhost:3000`.

## Phoenix OTLP

Local Phoenix accepts OTLP HTTP traces at `http://localhost:6006/v1/traces`. Phoenix Cloud and authenticated deployments use a collector endpoint plus Bearer API key. Lattice provides the endpoint/header helper only:

```ts
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { createPhoenixOtlpConfig } from "@full-self-browsing/lattice";

const phoenix = createPhoenixOtlpConfig({
  baseUrl: "https://app.phoenix.arize.com/s/your-space-name",
  apiKey: process.env.PHOENIX_API_KEY,
  projectName: "lattice",
});

const exporter = new OTLPTraceExporter({
  url: phoenix.endpoint,
  headers: phoenix.headers,
});
```

`projectName` sets Phoenix's `x-project-name` HTTP header for OTLP HTTP project routing. If your Phoenix setup already uses resource attributes or the `@arizeai/phoenix-otel` package, keep that setup in the host app and pass its tracer into `createOtelRunEventSink()`.

## Generic OTLP

For any OTLP-compatible backend, configure your normal OpenTelemetry exporter and pass the active tracer to Lattice:

```ts
const ai = createAI({
  providers: [provider],
  events: [
    createOtelRunEventSink({
      tracer: trace.getTracer("lattice"),
    }),
  ],
});
```

Lattice's exporter bridge is intentionally a `RunEventSink`: it does not use the hook pipeline and it does not create a dashboard. Use your existing OpenTelemetry backend for trace storage, search, sampling, alerting, and retention.
