---
phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
plan: 01
subsystem: observability
tags: [opentelemetry, tracing, run-events]
requires:
  - phase: 43-streaming-contract-collectstream
    provides: stream event vocabulary consumed by the exporter
provides:
  - structural OTel-compatible RunEventSink factory
  - exhaustive current RunEventKind span-event coverage
affects: [observability, public-api, tracing]
tech-stack:
  added: []
  patterns: [structural OTel types without core SDK dependency]
key-files:
  created:
    - packages/lattice/src/observability/otel.ts
    - packages/lattice/src/observability/otel.test.ts
  modified: []
key-decisions:
  - "Use structural tracer/span types instead of importing @opentelemetry/api."
  - "Use one low-cardinality run span plus span events for every RunEvent."
patterns-established:
  - "OTel host apps pass a tracer into createOtelRunEventSink; Lattice core owns only event mapping."
requirements-completed: [OTEL-01, OTEL-02, OTEL-05]
duration: 8min
completed: 2026-06-16
---

# Phase 47 Plan 01 Summary

**Structural OpenTelemetry run-event sink with exhaustive current event-vocabulary tests**

## Performance

- **Duration:** 8 min
- **Started:** 2026-06-16T07:55:00Z
- **Completed:** 2026-06-16T08:03:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `createOtelRunEventSink()` as a dependency-free `RunEventSink` over structural OTel-like tracer/span types.
- Added base `lattice.*` and `gen_ai.*` attribute mapping for run/provider/model/context/router/tool/stream events.
- Added fake-tracer tests for run span lifecycle, lazy span creation, terminal status mapping, and every current `RunEventKind` literal.

## Task Commits

1. **Task 1: Add structural OTel types and sink factory** - `680770b` (feat)
2. **Task 2: Cover run and event vocabulary mapping** - `680770b` (feat)

## Files Created/Modified

- `packages/lattice/src/observability/otel.ts` - Structural OTel sink factory and initial attribute mapping.
- `packages/lattice/src/observability/otel.test.ts` - Fake tracer/span tests and exhaustive event vocabulary assertions.

## Decisions Made

- Kept the span name low-cardinality by default as `lattice.run`.
- Used numeric OTel status codes (`1` OK, `2` ERROR) to avoid importing OTel enums.
- Started spans lazily when an event sink sees events before `run.start`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice test -- otel
pnpm --filter @full-self-browsing/lattice typecheck
```

Both passed.

## Next Phase Readiness

Plan 47-02 can extend the same module with strict sanitizer behavior, receipt attributes, and usage/gateway metadata mapping.

---
*Phase: 47-opentelemetry-exporter-langfuse-phoenix-paths*
*Completed: 2026-06-16*
