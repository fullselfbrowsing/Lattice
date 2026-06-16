---
phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
verified_at: 2026-06-16T04:16:14-05:00
status: passed
requirements_verified: [OTEL-01, OTEL-02, OTEL-03, OTEL-04, OTEL-05]
automated:
  passed:
    - pnpm --filter @full-self-browsing/lattice test
    - pnpm --filter @full-self-browsing/lattice typecheck
    - pnpm --filter @full-self-browsing/lattice lint:packages
    - pnpm example:v14-validation
  failed: []
human_verification: []
---

# Phase 47 Verification

## Result

Status: passed.

## Requirement Evidence

- **OTEL-01:** `createOtelRunEventSink` maps run events to spans/span events; Phase 49 showcase validates OTel against runtime events.
- **OTEL-02:** Exported attributes use stable `gen_ai.*` and `lattice.*` names for provider, model, usage, route, plan, run id, and receipt data.
- **OTEL-03:** Sanitization defaults exclude raw prompt/output/artifact content.
- **OTEL-04:** Langfuse and Phoenix OTLP helpers expose setup paths without hard SDK dependencies.
- **OTEL-05:** Tests cover run, stage, provider attempt, fallback, validation, tool, recovery, streaming, and capability-negotiation event mappings.

## Automated Evidence

Final Phase 49 gates reran and passed the runtime suite and v1.4 observability showcase:

```bash
pnpm --filter @full-self-browsing/lattice test
pnpm --filter @full-self-browsing/lattice typecheck
pnpm --filter @full-self-browsing/lattice lint:packages
pnpm example:v14-validation
```

