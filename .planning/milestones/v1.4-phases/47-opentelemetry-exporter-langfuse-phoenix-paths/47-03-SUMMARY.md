---
phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
plan: 03
subsystem: observability
tags: [opentelemetry, otlp, docs, langfuse, phoenix]
requires:
  - phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
    provides: OTel sink and sanitizer from Plans 47-01 and 47-02
provides:
  - dependency-free Langfuse OTLP config helper
  - dependency-free Phoenix OTLP config helper
  - host-app OTel setup guide
affects: [observability, docs, public-api]
tech-stack:
  added: []
  patterns: [host-owned OTel SDK setup, pure config helpers]
key-files:
  created:
    - docs/observability-otel.md
  modified:
    - packages/lattice/src/observability/otel.ts
    - packages/lattice/src/observability/otel.test.ts
key-decisions:
  - "Config helpers return endpoint/header data only."
  - "Phoenix project routing uses the x-project-name OTLP HTTP header."
patterns-established:
  - "Langfuse/Phoenix integrations stay docs/helper-only with no core SDK imports."
requirements-completed: [OTEL-04]
duration: 3min
completed: 2026-06-16
---

# Phase 47 Plan 03 Summary

**Dependency-free Langfuse and Phoenix OTLP config helpers with host-app setup docs**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-16T08:07:20Z
- **Completed:** 2026-06-16T08:10:40Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `createLangfuseOtlpConfig()` for Langfuse trace endpoint normalization, Basic auth, ingestion-version header, and custom headers.
- Added `createPhoenixOtlpConfig()` for local/cloud/self-hosted trace endpoints, Bearer auth, optional `x-project-name`, and custom headers.
- Added `docs/observability-otel.md` showing host-owned OTel SDK setup, Lattice sink wiring, Langfuse setup, Phoenix setup, and sanitizer defaults.

## Task Commits

1. **Task 1: Add Langfuse and Phoenix config helpers** - `85ed551` (feat)
2. **Task 2: Add setup documentation** - `85ed551` (feat)

## Files Created/Modified

- `packages/lattice/src/observability/otel.ts` - OTLP config helper types and functions.
- `packages/lattice/src/observability/otel.test.ts` - Endpoint/header normalization tests.
- `docs/observability-otel.md` - Host-app setup guide.

## Decisions Made

- Default Langfuse base URL is EU Cloud `https://cloud.langfuse.com`.
- Phoenix `endpoint` is treated as exact; `baseUrl` receives `/v1/traces` normalization.
- Docs mention host-app OTel packages but core still imports none.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - this plan added docs only. Users who adopt the feature must configure an OpenTelemetry SDK/exporter in their host app.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice test -- otel
pnpm --filter @full-self-browsing/lattice typecheck
node scripts/check-core-package-boundary.mjs
```

All passed.

## Next Phase Readiness

Plan 47-04 can export the public API, add the changeset, run package type tests, and close the phase.

---
*Phase: 47-opentelemetry-exporter-langfuse-phoenix-paths*
*Completed: 2026-06-16*
