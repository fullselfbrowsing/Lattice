---
phase: 36-output-sanitizer-hook-opt-in
plan: 01
subsystem: sdk
tags: [sanitizers, public-api, tests, tsd]
requires:
  - phase: 33-model-capability-registry
    provides: sanitizer key vocabulary and gpt-oss-120b failure-mode context
provides:
  - Core sanitizer types and adapter pipeline helper
  - Built-in output sanitizer factories
  - Root public exports for sanitizer factories and types
  - Direct behavior, public-surface, and package type tests
affects: [phase-36-adapter-wiring, provider-adapters, public-api]
tech-stack:
  added: []
  patterns: [standard-schema guards, fail-safe sanitizer no-op, string-only rawOutputs pipeline]
key-files:
  created:
    - packages/lattice/src/sanitizers/sanitizers.ts
    - packages/lattice/src/sanitizers/index.ts
    - packages/lattice/test/sanitizers.test.ts
    - packages/lattice/test-d/sanitizers.test-d.ts
  modified:
    - packages/lattice/src/index.ts
    - packages/lattice/test/public-surface.test.ts
key-decisions:
  - "Kept applyOutputSanitizers importable from the sanitizer module but not from the root package."
  - "Supported schema-only unwrap only when exactly one own string field is present."
patterns-established:
  - "Sanitizer functions are sync-or-async string transforms with a minimal context object."
  - "Adapter sanitizer application should use applyOutputSanitizers after rawOutputs creation."
requirements-completed: [SANITIZE-02, SANITIZE-03, SANITIZE-04]
duration: 3min
completed: 2026-06-09
---

# Phase 36: Plan 01 Summary

**Opt-in sanitizer module with built-in output cleanup helpers, root exports, and direct behavior/type coverage**

## Performance

- **Duration:** 3 min
- **Started:** 2026-06-09T17:43:21Z
- **Completed:** 2026-06-09T17:46:42Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Added `SanitizerFn`, `SanitizerContext`, `SanitizeOutputOption`, `InternalEnvelopeOptions`, and `applyOutputSanitizers`.
- Added `stripReasoningTags()`, `stripChatTemplateArtifacts()`, and `unwrapInternalEnvelope(...)`.
- Root-exported built-ins and public sanitizer types.
- Added direct Vitest coverage, public-surface smoke tests, and tsd package type tests.

## Task Commits

1. **Tasks 1-2: sanitizer types, pipeline helper, and built-ins** - `90718f1` (`feat`)
2. **Task 3: root public exports** - `fbdfa13` (`feat`)
3. **Task 4: behavior, public-surface, and type tests** - `308d22e` (`test`)

## Files Created/Modified

- `packages/lattice/src/sanitizers/sanitizers.ts` - Core sanitizer types, built-ins, and adapter pipeline helper.
- `packages/lattice/src/sanitizers/index.ts` - Sanitizer barrel exports.
- `packages/lattice/src/index.ts` - Root public exports for built-ins and public types.
- `packages/lattice/test/sanitizers.test.ts` - Direct sanitizer behavior, no-op, order, and error propagation tests.
- `packages/lattice/test/public-surface.test.ts` - Runtime public-surface smoke coverage.
- `packages/lattice/test-d/sanitizers.test-d.ts` - Package type tests for sanitizer exports.

## Decisions Made

- `applyOutputSanitizers` is exported from `src/sanitizers/index.ts` for adapter wiring, but the root package keeps the public surface focused on consumer-facing sanitizer factories and types.
- `unwrapInternalEnvelope(schema)` validates with Standard Schema/Zod and extracts only when the parsed object has exactly one own string field; ambiguous schema-only objects no-op.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## Issues Encountered

- Initial sanitizer tests used `.resolves` against sync sanitizer return values. Fixed by wrapping sync-or-async calls in `Promise.resolve`, matching the public `SanitizerFn` contract.
- `pnpm test:types` reads built declarations through `tsd`, so `pnpm --filter @full-self-browsing/lattice build` must run before package type tests when new exports are added.

## Verification

- `pnpm --filter @full-self-browsing/lattice test sanitizers public-surface` — passed, 47 tests.
- `pnpm --filter @full-self-browsing/lattice build` — passed.
- `pnpm --filter @full-self-browsing/lattice test:types` — passed, 948 runtime/typecheck tests plus tsd.
- `pnpm --filter @full-self-browsing/lattice typecheck` — passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 36-02 and 36-03 can now wire adapters through `applyOutputSanitizers` and import the built-ins from `packages/lattice/src/sanitizers/index.ts`.

## Self-Check: PASSED

All acceptance criteria and plan-level verification commands passed after the declaration build.

---
*Phase: 36-output-sanitizer-hook-opt-in*
*Completed: 2026-06-09*
