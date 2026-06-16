# Phase 47 Validation

## Automated Gates

Run after exporter implementation:

```bash
pnpm --filter @full-self-browsing/lattice test -- otel create-ai public-types public-surface
pnpm --filter @full-self-browsing/lattice build
pnpm --filter @full-self-browsing/lattice test:types
pnpm --filter @full-self-browsing/lattice typecheck
node scripts/check-core-package-boundary.mjs
```

## Required Assertions

- `createOtelRunEventSink` starts a low-cardinality root span and adds a span event for every current `RunEventKind`.
- Run spans end with OK status on `run.complete` and ERROR status on `run.failed`.
- Late events lazily create a run span when no `run.start` was observed.
- Default sanitizer excludes prompt/output/artifact content and secret-shaped keys.
- Explicit metadata capture includes benign bounded metadata while still excluding secrets/content.
- Usage metadata maps to `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `llm.token_count.prompt`, and `llm.token_count.completion`.
- Gateway observed/requested model metadata maps to request/response model attributes without leaking gateway secrets.
- Receipt envelope metadata maps to `lattice.receipt.cid`, `lattice.receipt.signature.count`, and `lattice.receipt.signature.keyid` where available.
- Langfuse config helper returns the correct endpoint/header shapes without importing Langfuse or OTel packages.
- Phoenix config helper returns local/cloud/self-hosted endpoint/header shapes without importing Phoenix or OTel packages.
- Public API tests and package type tests include the new values and types.
- Core package boundary check remains clean after build.

## Manual Review Checklist

- No `@opentelemetry/*`, `@langfuse/*`, or `@arizeai/*` strings appear in `packages/lattice/package.json` dependencies.
- No raw prompt/output/content examples are embedded in default span attributes.
- The docs/config helper text makes host-app SDK ownership explicit.
- The exporter remains a `RunEventSink`; it does not depend on hook pipeline execution.

