# Phase 47 Patterns

## Codebase Patterns To Follow

- Keep core web-standard and dependency-light. Existing optional integrations use typed helpers and fake-fetch tests rather than importing provider SDKs into core.
- Public types flow through `runtime/public-types.ts` and then the package root type export list in `index.ts`.
- Public values are guarded by `packages/lattice/test/public-surface.test.ts`, which expects an exact sorted export inventory.
- Runtime event sinks are best-effort caller hooks. A sink should not mutate `RunEvent` or depend on private runtime state.
- Optional object fields must use conditional spreads or exact shapes compatible with `exactOptionalPropertyTypes`.
- Tests sit beside modules under `src/`, with public-surface and `test-d` coverage for exported API.

## Proposed Module Shape

`packages/lattice/src/observability/otel.ts`

- Value exports:
  - `createOtelRunEventSink(options)`
  - `sanitizeRunEventAttributes(event, options?)`
  - `createOtelReceiptAttributes(envelope)`
  - `createLangfuseOtlpConfig(options)`
  - `createPhoenixOtlpConfig(options)`
- Type exports:
  - `OtelAttributeValue`
  - `OtelAttributes`
  - `OtelSpanLike`
  - `OtelTracerLike`
  - `OtelSpanStatus`
  - `OtelRunEventSinkOptions`
  - `OtelContentCaptureMode`
  - `OtelSanitizerOptions`
  - `OtelHttpTraceConfig`
  - `LangfuseOtlpConfigOptions`
  - `PhoenixOtlpConfigOptions`

## Attribute Naming

Prefer stable keys:

- `lattice.event.kind`
- `lattice.run.id`
- `lattice.plan.id`
- `lattice.stage.id`
- `lattice.provider.id`
- `lattice.model.id`
- `lattice.artifact.id`
- `lattice.provider.attempt.status`
- `lattice.route.selected_model`
- `lattice.route.rejected.count`
- `lattice.route.fallback.count`
- `lattice.context.estimated_tokens`
- `lattice.context.included.count`
- `lattice.context.summarized.count`
- `lattice.context.omitted.count`
- `lattice.tool.name`
- `lattice.tool.call.id`
- `lattice.receipt.cid`
- `lattice.receipt.signature.count`
- `lattice.receipt.signature.keyid`

Use GenAI/OpenInference aliases when directly supported:

- `gen_ai.provider.name`
- `gen_ai.request.model`
- `gen_ai.response.model`
- `gen_ai.usage.input_tokens`
- `gen_ai.usage.output_tokens`
- `gen_ai.request.stream`
- `llm.token_count.prompt`
- `llm.token_count.completion`

## Sanitizer Rules

- Default mode includes only recognized event metadata fields with primitive or primitive-array values.
- Secret-shaped keys are always dropped: `authorization`, `apiKey`, `api_key`, `token`, `secret`, `password`, `credential`, `headers`.
- Content-shaped keys are dropped by default and in metadata mode: `prompt`, `task`, `message`, `messages`, `content`, `input`, `inputs`, `output`, `outputs`, `rawOutputs`, `artifact`, `value`, `body`, `payload`.
- Nested objects are not flattened in default mode except known gateway and usage objects.
- Unknown metadata can be included only in explicit metadata mode, bounded to safe primitive values and with `lattice.metadata.<key>` prefixes.

## Test Doubles

Use a simple fake tracer:

- `startSpan(name, options)` records name/options and returns a fake span.
- Fake span records `setAttributes`, `setAttribute`, `addEvent`, `setStatus`, `recordException`, and `end`.
- No real OTel packages are needed.

