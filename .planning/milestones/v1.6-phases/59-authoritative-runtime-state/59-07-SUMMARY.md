---
phase: 59-authoritative-runtime-state
plan: 07
subsystem: replay-observability
tags: [replay, redaction, opentelemetry, persistence, fallback, security]

requires:
  - phase: 59-authoritative-runtime-state-06
    provides: exact provider-output refs, truthful persistence stages, and terminal partial failures
provides:
  - Explicit safe-field replay reconstruction for top-level and per-attempt evidence
  - Recursive artifact, lineage, context, packaging, lifecycle, event, and warning redaction
  - Bounded OTel projection, failure, and persistence diagnostics
  - Real completed, skipped, and failed persistence status on runtime completion events
affects: [59-08-public-compatibility, 59-09-closure, replay, observability, runtime-events]

tech-stack:
  added: []
  patterns: [explicit-safe-reconstruction, bounded-event-classification, primitive-persistence-status]

key-files:
  created: [packages/lattice/src/replay/replay.test.ts]
  modified: [packages/lattice/src/replay/replay.ts, packages/lattice/src/observability/otel.ts, packages/lattice/src/observability/otel.test.ts, packages/lattice/src/runtime/create-ai.ts, packages/lattice/test/authoritative-runtime-state.test.ts]

key-decisions:
  - "Replay redaction reconstructs every evidence object from named safe fields instead of spreading typed objects and trying to remove secrets afterward."
  - "Hashes, IDs, counts, statuses, usage, and lifecycle classes remain inspectable; storage scope, free-form text, arbitrary metadata, and raw causes do not."
  - "OTel accepts only closed-set event statuses and failure classes, while real completion events carry a primitive persistence status."

patterns-established:
  - "Evidence redaction: preserve bounded identity and classification, drop open-ended text and unknown nested fields."
  - "Telemetry classification: validate event status/failure strings against closed sets before setting attributes or span errors."

requirements-completed: [CTXAUTH-06, PERSIST-02, PERSIST-03]

duration: 20min
completed: 2026-07-16
---

# Phase 59 Plan 07: Replay and Observability Evidence Summary

**Replay and OpenTelemetry now expose route-local authority and persistence state without serializing content, storage scope, or raw failure data**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-17T01:19:00Z
- **Completed:** 2026-07-17T01:39:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Replaced permissive replay spreads with explicit reconstruction for plans, stages, context packs, projections, packaging, attempts, artifact lineage, events, and persistence reports.
- Preserved primary and fallback projection IDs, ordered input hashes, safe artifact IDs/fingerprints, counts, statuses, usage, and bounded lifecycle evidence.
- Removed labels, storage refs, tenant IDs, storage keys, signed URLs, arbitrary metadata, free-form context/packaging text, transform metadata, and raw attempt/store errors.
- Added synthetic nested fixtures and a real fallback-then-output-write-failure integration case with distinct leakage sentinels.
- Bounded OTel event statuses, failure kinds, and failure reasons before they can become attributes, span status messages, or exceptions.
- Added `lattice.persistence.status` and real runtime emission for completed, skipped, and failed persistence outcomes.

## Task Commits

1. **Task 1: Redact nested projection and persistence evidence for replay** - `83c8cc2` (feat)
2. **Task 2: Bound projection and persistence OpenTelemetry attributes** - `8295005` (feat)

## Files Created/Modified

- `packages/lattice/src/replay/replay.ts` - Explicit safe replay reconstruction and recursive bounded evidence redaction.
- `packages/lattice/src/replay/replay.test.ts` - Primary/fallback, lineage, packaging, lifecycle, event, and partial-failure sentinel fixtures.
- `packages/lattice/src/observability/otel.ts` - Closed-set event/failure mapping and persistence status attribute.
- `packages/lattice/src/observability/otel.test.ts` - Primary, fallback, pre-provider, post-provider, and arbitrary-failure span tests.
- `packages/lattice/src/runtime/create-ai.ts` - Primitive persistence status on success and post-provider failure events.
- `packages/lattice/test/authoritative-runtime-state.test.ts` - Real fallback/persistence replay redaction and completed/skipped/failed OTel assertions.

## Decisions Made

- Treated artifact IDs and fingerprints as safe diagnostic identity, but removed the entire storage reference rather than preserving a redacted synthetic key.
- Converted free-form warnings and context/packaging reasons to bounded codes so unknown text cannot survive serialization.
- Kept opt-in primitive metadata capture behavior intact; default telemetry remains explicit and unknown nested metadata is ignored.
- Used closed sets for status and failure classification so a malicious or accidental raw string cannot become a span exception.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Emitted persistence status from real runtime events**
- **Found during:** Task 2 telemetry integration
- **Issue:** The planned OTel attribute had no primitive runtime field to consume, so only synthetic fixtures could exercise it.
- **Fix:** Added the final persistence-stage status to `run.complete` and `failed` to post-provider persistence `run.failed` events.
- **Files modified:** `packages/lattice/src/runtime/create-ai.ts`, `packages/lattice/test/authoritative-runtime-state.test.ts`
- **Verification:** real configured, unconfigured/policy-skipped, and output-write-failure runs map to `completed`, `skipped`, and `failed` respectively.
- **Committed in:** `8295005`

---

**Total deviations:** 1 auto-fixed (1 missing critical runtime link).
**Impact on plan:** The added runtime link is additive and necessary for truthful production telemetry; no provider, store, session, or public method changed.

## Issues Encountered

- The repository does not install a Prettier binary despite documenting Prettier in the recommended stack. No formatting command was available; strict typecheck, focused tests, and `git diff --check` passed.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- `pnpm --filter @full-self-browsing/lattice exec vitest run src/replay/replay.test.ts src/observability/otel.test.ts test/authoritative-runtime-state.test.ts`: 3 files, 42 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- `git diff --check`: passed.

## Next Phase Readiness

- Redacted replay and OTel surfaces now cover every authoritative top-level and fallback attempt field introduced in Phase 59.
- Plan 08 can validate root/modular exports and legacy provider/store/session compatibility without an unresolved evidence leak.

## Self-Check: PASSED

- Task commits `83c8cc2` and `8295005` exist and contain only Plan 07 implementation/test files.
- Serialized sentinel tests cover content, summaries, tenants, storage keys, signed URLs, provider payloads, arbitrary metadata, and raw causes.
- Full Plan 07 focused tests and strict typecheck pass.
- User paper work remains untouched.

---
*Phase: 59-authoritative-runtime-state*
*Completed: 2026-07-16*
