---
phase: 43-streaming-contract-collectstream
plan: 01
subsystem: provider-runtime
tags: [streaming, provider-contract, public-surface, collectStream]

requires: []
provides:
  - normalized provider stream chunk contract
  - optional ProviderAdapter.executeStream hook
  - collectStream bridge to ProviderRunResponse
  - package-root streaming exports and type coverage
affects: [provider-adapters, runtime-streaming, public-api]

tech-stack:
  added: []
  patterns:
    - provider-neutral stream chunks
    - stream collection into existing ProviderRunResponse

key-files:
  created:
    - packages/lattice/src/providers/streaming.ts
    - packages/lattice/src/providers/streaming.test.ts
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/runtime/public-types.ts
    - packages/lattice/src/index.ts
    - packages/lattice/test/public-surface.test.ts
    - packages/lattice/test-d/index.test-d.ts
    - packages/lattice/src/runtime/create-ai.test.ts

key-decisions:
  - "executeStream remains optional so existing ProviderAdapter literals stay source-compatible."
  - "collectStream exposes only normalized chunks and emits a content-free synthetic rawResponse when providers do not supply one."

patterns-established:
  - "Streaming adapters produce ProviderStreamChunk values; runtime-facing code consumes ProviderRunResponse after collectStream."
  - "Package-root exports are protected by both exact public-surface inventory and tsd coverage."

requirements-completed: [STRM-01, STRM-02]

duration: 9min
completed: 2026-06-16
---

# Phase 43 Plan 01 Summary

**Provider-neutral streaming contract with an optional adapter hook, deterministic collection into ProviderRunResponse, and package-root export coverage**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-16T05:59:06Z
- **Completed:** 2026-06-16T06:04:59Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added normalized `ProviderStreamChunk` types and optional `ProviderAdapter.executeStream`.
- Implemented `collectStream()` with deterministic text, output, usage, gateway, artifact, tool-call, and raw-response merge semantics.
- Exported streaming types and `collectStream` through the package root with public-surface and tsd coverage.

## Task Commits

1. **Task 1 blocker fix: narrow resolved model plan test** - `37c2d6c` (fix)
2. **Task 1: Add normalized stream chunk types and optional executeStream** - `2095c4c` (feat)
3. **Task 2: Implement collectStream** - `4bd6a93` (feat)
4. **Task 3: Export streaming contracts through the package root** - `cf892b3` (feat)

**Plan metadata:** this summary commit.

## Files Created/Modified

- `packages/lattice/src/providers/provider.ts` - adds provider-neutral stream chunk types and optional `executeStream`.
- `packages/lattice/src/providers/streaming.ts` - implements `collectStream()`.
- `packages/lattice/src/providers/streaming.test.ts` - verifies collector semantics and adapter backward compatibility.
- `packages/lattice/src/runtime/public-types.ts` - re-exports streaming public types.
- `packages/lattice/src/index.ts` - exports `collectStream` and streaming type names from the package root.
- `packages/lattice/test/public-surface.test.ts` - locks the new root value export.
- `packages/lattice/test-d/index.test-d.ts` - verifies package-root streaming type usage.
- `packages/lattice/src/runtime/create-ai.test.ts` - narrows an existing resolved-model plan assertion so typecheck can run under the current union.

## Decisions Made

- Kept streaming provider-neutral at the core boundary; raw SSE/provider event shapes stay adapter-local.
- Made complete chunks authoritative for final raw outputs while preserving explicit output chunks over accumulated text.
- Used a content-free synthetic `rawResponse` summary when the provider stream does not include one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing test accessed execution-plan-only fields without narrowing**
- **Found during:** Task 1 verification
- **Issue:** `packages/lattice/src/runtime/create-ai.test.ts` accessed `result.plan.route` before narrowing `ResultPlan` to `execution-plan`, causing `typecheck` to fail before the streaming contract could be verified.
- **Fix:** Added an explicit `result.plan.kind` assertion and branch before checking the resolved model route.
- **Files modified:** `packages/lattice/src/runtime/create-ai.test.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice typecheck`
- **Committed in:** `37c2d6c`

---

**Total deviations:** 1 auto-fixed blocking type error
**Impact on plan:** No scope change; the fix was required to verify the planned provider contract.

## Issues Encountered

The package-root tsd test reads built declarations, so the source export changes needed a build before `test:types` reflected them.

## Verification

- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice test -- streaming provider`
- `pnpm --filter @full-self-browsing/lattice test -- public-surface`
- `pnpm --filter @full-self-browsing/lattice test:types`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 43-02 can now route `policy.stream` through `executeStream`, collect the final response via `collectStream`, and emit stream lifecycle tracing events without changing existing non-streaming providers.

---
*Phase: 43-streaming-contract-collectstream*
*Completed: 2026-06-16*
