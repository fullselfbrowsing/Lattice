---
phase: 36-output-sanitizer-hook-opt-in
plan: 03
subsystem: providers
tags: [anthropic, gemini, provider-parity, changesets, sanitizers]
requires:
  - phase: 36-output-sanitizer-hook-opt-in
    provides: Plan 36-01 sanitizer module and Plan 36-02 shared adapter wiring
provides:
  - Anthropic and Gemini sanitizer option wiring
  - Direct adapter sanitizer tests
  - All-seven provider sanitizer parity coverage
  - Phase 36 changeset
affects: [phase-36-completion, public-api, provider-adapters]
tech-stack:
  added: []
  patterns: [direct adapter sanitizer hook, all-seven provider parity]
key-files:
  created:
    - .changeset/v1.3.0-output-sanitizers.md
  modified:
    - packages/lattice/src/providers/anthropic.ts
    - packages/lattice/src/providers/gemini.ts
    - packages/lattice/src/providers/anthropic.test.ts
    - packages/lattice/src/providers/gemini.test.ts
    - packages/lattice/src/providers/parity.test.ts
key-decisions:
  - "Anthropic and Gemini reuse the same applyOutputSanitizers sequencing as OpenAI-compatible providers."
  - "All-seven parity uses the same envelope payload adapted to each provider response schema."
patterns-established:
  - "Every real provider adapter now sanitizes after rawOutputs creation and before ProviderRunResponse return."
  - "Provider parity tests should cover every requested output name, not only a single text output."
requirements-completed: [SANITIZE-01, SANITIZE-03, SANITIZE-04]
duration: 4min
completed: 2026-06-09
---

# Phase 36: Plan 03 Summary

**Anthropic and Gemini sanitizer wiring with all-seven provider parity and release-note coverage**

## Performance

- **Duration:** 4 min
- **Started:** 2026-06-09T17:49:17Z
- **Completed:** 2026-06-09T17:53:23Z
- **Tasks:** 4
- **Files modified:** 6

## Accomplishments

- Added `sanitizeOutput?: SanitizeOutputOption` to Anthropic and Gemini provider options.
- Applied the sanitizer pipeline after provider-specific text extraction and before returning `ProviderRunResponse`.
- Added direct Anthropic/Gemini tests for `unwrapInternalEnvelope({ field: "summary" })` and `rawResponse` preservation.
- Added all-seven provider parity coverage for the `session_1780792387779` envelope shape.
- Added a changeset documenting the opt-in adapter option and built-in sanitizer factories.

## Task Commits

1. **Tasks 1-2: Anthropic and Gemini source wiring** - `988ef57` (`feat`)
2. **Task 3: direct adapter and all-seven parity tests** - `5d46377` (`test`)
3. **Task 4: changeset** - `6ce8af3` (`docs`)

## Files Created/Modified

- `packages/lattice/src/providers/anthropic.ts` - Direct adapter sanitizer option and execution wiring.
- `packages/lattice/src/providers/gemini.ts` - Direct adapter sanitizer option and execution wiring.
- `packages/lattice/src/providers/anthropic.test.ts` - Direct sanitizer regression.
- `packages/lattice/src/providers/gemini.test.ts` - Direct sanitizer regression.
- `packages/lattice/src/providers/parity.test.ts` - All-seven provider sanitizer parity.
- `.changeset/v1.3.0-output-sanitizers.md` - Release note for Phase 36 public API.

## Decisions Made

- The parity test verifies both `text` and `summary` requested outputs so regressions cannot sanitize only the first output key.

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## Issues Encountered

None.

## Verification

- `rg -n 'sanitizeOutput|SanitizeOutputOption|applyOutputSanitizers|rawResponse' packages/lattice/src/providers/anthropic.ts` — passed.
- `rg -n 'sanitizeOutput|SanitizeOutputOption|applyOutputSanitizers|rawResponse' packages/lattice/src/providers/gemini.ts` — passed.
- `pnpm --filter @full-self-browsing/lattice test anthropic gemini parity` — passed, 53 tests.
- `pnpm --filter @full-self-browsing/lattice test sanitizers adapters openrouter xai lm-studio anthropic gemini parity public-surface` — passed, 178 tests.
- `pnpm --filter @full-self-browsing/lattice build` — passed.
- `pnpm --filter @full-self-browsing/lattice test:types` — passed, 957 runtime/typecheck tests plus tsd.
- `pnpm --filter @full-self-browsing/lattice typecheck` — passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 36 is ready for final tracking updates. Phase 37 can author and plan the opt-in tool-call validation layer.

## Self-Check: PASSED

All acceptance criteria and final phase gates passed.

---
*Phase: 36-output-sanitizer-hook-opt-in*
*Completed: 2026-06-09*
