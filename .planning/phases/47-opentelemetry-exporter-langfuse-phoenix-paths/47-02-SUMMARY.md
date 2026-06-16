---
phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
plan: 02
subsystem: observability
tags: [opentelemetry, sanitizer, receipts]
requires:
  - phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
    provides: structural OTel sink from Plan 47-01
provides:
  - content-safe OTel attribute sanitizer
  - receipt CID/signature enrichment for envelope-bearing events
  - usage, gateway, and Phoenix-compatible token attributes
affects: [observability, receipts, tracing]
tech-stack:
  added: []
  patterns: [content-safe telemetry defaults, best-effort receipt enrichment]
key-files:
  created: []
  modified:
    - packages/lattice/src/observability/otel.ts
    - packages/lattice/src/observability/otel.test.ts
key-decisions:
  - "Default sanitizer excludes content-shaped and secret-shaped metadata keys."
  - "Receipt enrichment runs only when event metadata carries a receipt envelope."
patterns-established:
  - "Unknown metadata is exported only in explicit metadata capture mode and only for bounded primitive values."
requirements-completed: [OTEL-02, OTEL-03]
duration: 4min
completed: 2026-06-16
---

# Phase 47 Plan 02 Summary

**Content-safe OTel sanitizer with usage/gateway aliases and receipt CID attributes**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-16T08:03:23Z
- **Completed:** 2026-06-16T08:07:20Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added safe known-field mapping for provider attempts, context counts, router counts, stream status, tool calls, validation/failure reasons, usage, and gateway metadata.
- Added `createOtelReceiptAttributes()` and best-effort sink enrichment for receipt envelopes on event metadata.
- Added tests proving default content/secret exclusion, explicit bounded metadata capture, usage/OpenInference aliases, gateway model mapping, and real receipt CID/signature attributes.

## Task Commits

1. **Task 1: Implement sanitizer and metadata mapping** - `f9634ea` (feat)
2. **Task 2: Add receipt reference attributes** - `f9634ea` (feat)
3. **Review follow-up: Avoid raw error text in OTel attributes** - `81a41c7` (fix)

## Files Created/Modified

- `packages/lattice/src/observability/otel.ts` - Sanitizer, usage/gateway mapping, receipt attribute helper, and async sink enrichment.
- `packages/lattice/src/observability/otel.test.ts` - Redaction, metadata-capture, gateway/usage, and real receipt-envelope tests.

## Decisions Made

- Kept raw content exclusion active even in metadata capture mode.
- Mapped usage to both `gen_ai.usage.*` and Phoenix/OpenInference-compatible `llm.token_count.*` aliases.
- Swallowed malformed receipt enrichment failures inside the sink so telemetry cannot break runtime event delivery.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Security] Arbitrary provider error text could reach default span attributes**
- **Found during:** Phase-level code review after Plan 47-04
- **Issue:** `metadata.error` strings can contain provider response/request excerpts, so exporting them by default could violate OTEL-03's no raw content default.
- **Fix:** Replaced default `lattice.error.message` / mint-error text with presence booleans and kept only safe `reason` strings for failed span status messages.
- **Files modified:** `packages/lattice/src/observability/otel.ts`, `packages/lattice/src/observability/otel.test.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice test -- otel`; `pnpm --filter @full-self-browsing/lattice typecheck`
- **Committed in:** `81a41c7`

---

**Total deviations:** 1 auto-fixed (security hardening).
**Impact on plan:** Tightens the planned sanitizer default without expanding scope.

## Issues Encountered

None beyond the auto-fixed review finding above.

## User Setup Required

None - no external service configuration required.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice test -- otel receipt
pnpm --filter @full-self-browsing/lattice typecheck
```

Both passed.

## Next Phase Readiness

Plan 47-03 can add dependency-free Langfuse/Phoenix OTLP config helpers and the public setup guide.

---
*Phase: 47-opentelemetry-exporter-langfuse-phoenix-paths*
*Completed: 2026-06-16*
