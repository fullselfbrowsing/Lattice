---
phase: 43-streaming-contract-collectstream
plan: 02
subsystem: runtime
tags: [streaming, policy, run-events, provider-runtime]

requires:
  - phase: 43-01
    provides: normalized stream chunks and collectStream
provides:
  - policy.stream runtime opt-in
  - stream.start, stream.complete, and stream.failed events
  - ai.run streaming path through collectStream
  - runtime tests for stream opt-in, bracketing, and failure accounting
affects: [runtime, tracing, policy, receipts]

tech-stack:
  added: []
  patterns:
    - explicit streaming opt-in through run policy
    - stream lifecycle events without per-token event emission

key-files:
  created: []
  modified:
    - packages/lattice/src/policy/policy.ts
    - packages/lattice/src/tracing/tracing.ts
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/runtime/create-ai.test.ts
    - packages/lattice/test-d/index.test-d.ts
    - packages/lattice/src/providers/streaming.test.ts

key-decisions:
  - "Streaming is selected only when PolicySpec.stream is true."
  - "Streaming provider output is collected before validation, persistence, receipt issuance, and result construction."
  - "Stream events carry lifecycle metadata only; text chunks and raw outputs are not included in event metadata."

patterns-established:
  - "Streaming provider attempts emit stream.start before executeStream, stream.complete after collectStream, and stream.failed before rethrow."
  - "Runtime tests assert behavior through ai.run rather than private helper exports."

requirements-completed: [STRM-01, STRM-02, STRM-04]

duration: 6min
completed: 2026-06-16
---

# Phase 43 Plan 02 Summary

**Explicit `policy.stream` execution path that collects provider streams into normal run results and emits bounded lifecycle events**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-16T06:04:59Z
- **Completed:** 2026-06-16T06:10:55Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `PolicySpec.stream` plus `stream.start`, `stream.complete`, and `stream.failed` event kinds.
- Routed opted-in provider attempts through `executeStream()` and `collectStream()` while preserving the default `execute()` path.
- Added runtime tests proving explicit opt-in, event bracketing without per-token events, and provider-execution failure accounting.

## Task Commits

1. **Task 1: Add explicit stream policy and event kinds** - `2142dd3` (feat)
2. **Task 2 auto-fix: Align collector tests with strict types** - `ffbeef7` (fix)
3. **Task 2: Route streaming attempts through collectStream** - `bd8d25c` (feat)
4. **Task 3: Test stream opt-in and event bracketing** - `dde6fb5` (test)

**Plan metadata:** this summary commit.

## Files Created/Modified

- `packages/lattice/src/policy/policy.ts` - adds the `stream` opt-in field to `PolicySpec`.
- `packages/lattice/src/tracing/tracing.ts` - adds stream lifecycle event kinds.
- `packages/lattice/src/runtime/create-ai.ts` - selects streaming adapters only when requested, collects streams, and emits lifecycle events.
- `packages/lattice/src/runtime/create-ai.test.ts` - covers opt-in behavior, event counts, and stream failure accounting.
- `packages/lattice/test-d/index.test-d.ts` - verifies package-root `PolicySpec` accepts `stream: true`.
- `packages/lattice/src/providers/streaming.test.ts` - fixes strict artifact/test typing exposed by full `tsc`.

## Decisions Made

- Kept `execute()` as the default even when a provider also exposes `executeStream()`.
- Treated unavailable `executeStream()` on a streaming-requested route as a failed provider attempt so fallback/accounting remains visible.
- Emitted stream lifecycle metadata only: start status, completed output names/gateway metadata, and failed error messages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Collector tests did not satisfy full package tsc**
- **Found during:** Task 2 verification
- **Issue:** `streaming.test.ts` used an obsolete artifact-ref literal and invoked a narrow no-arg `satisfies` function with arguments, which `vitest --typecheck` had not surfaced but `tsc --noEmit` did.
- **Fix:** Updated the artifact literal to the current `ArtifactRef` shape and reduced the compatibility test to the planned structural assertion.
- **Files modified:** `packages/lattice/src/providers/streaming.test.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice typecheck`
- **Committed in:** `ffbeef7`

---

**Total deviations:** 1 auto-fixed blocking typecheck issue
**Impact on plan:** No runtime scope change; the fix made the Phase 43 collector tests compatible with the full package gate.

## Issues Encountered

`tsd` reads built declarations, so `PolicySpec.stream` required a package build before `test:types` reflected the source change.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- create-ai`
- `pnpm --filter @full-self-browsing/lattice test -- create-ai streaming`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 43-03 can add property/regression tests for chunk-boundary equivalence and receipt output hashing on top of the now-active runtime streaming path.

---
*Phase: 43-streaming-contract-collectstream*
*Completed: 2026-06-16*
