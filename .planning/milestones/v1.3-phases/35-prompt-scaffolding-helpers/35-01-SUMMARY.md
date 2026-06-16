---
phase: 35-prompt-scaffolding-helpers
plan: 01
subsystem: sdk-api
tags: [prompts, scaffolds, canonicalize, public-api]
requires:
  - phase: 33-model-capability-registry
    provides: RecommendedPromptStrategy union
provides:
  - Prompt scaffold helpers for structured-output and tool-use contracts
  - Version-pinned prompt scaffold constants
  - Root package exports for Phase 35 helpers
affects: [phase-36-output-sanitizers, phase-37-tool-validation]
tech-stack:
  added: []
  patterns: [canonical prompt JSON rendering, strategy-keyed prompt fragments]
key-files:
  created:
    - packages/lattice/src/prompts/scaffolds.ts
    - packages/lattice/src/prompts/index.ts
  modified:
    - packages/lattice/src/index.ts
key-decisions:
  - "Use Phase 33 RecommendedPromptStrategy directly instead of defining a parallel prompt-strategy type."
  - "Validate canonicalize output with JSON.parse so non-JSON payloads fail deterministically."
patterns-established:
  - "Prompt scaffold helpers render stable header lines plus canonical JSON payload sections."
  - "Strategy-specific fragments live in an exhaustive Record<RecommendedPromptStrategy, ...> table."
requirements-completed: [SCAFF-01, SCAFF-02, SCAFF-03]
duration: 10min
completed: 2026-06-09
---

# Phase 35-01: Core Prompt Scaffold Helpers Summary

**Version-pinned prompt scaffold helpers render canonical schema/tool contracts for the five Phase 33 prompt strategies**

## Performance

- **Started:** 2026-06-09T16:34:07Z
- **Completed:** 2026-06-09T16:43:33Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added `PROMPT_SCAFFOLD_VERSION`, `PROMPT_STRATEGIES`, `getStructuredOutputContract`, and `getToolUseContract`.
- Implemented strategy-specific structured-output and tool-use instructions for `frontier`, `mid_tier`, `open_weight`, `reasoning`, and `local`.
- Re-exported the helpers from the package root through `packages/lattice/src/prompts/index.ts`.

## Task Commits

1. **Tasks 1-3: scaffold helpers, strategy text, and exports** - `0887bd2` (`feat(phase-35): add prompt scaffold helpers`)

## Files Created/Modified

- `packages/lattice/src/prompts/scaffolds.ts` - Stable prompt scaffold constants and helper functions.
- `packages/lattice/src/prompts/index.ts` - Local prompt barrel.
- `packages/lattice/src/index.ts` - Root public exports for Phase 35.

## Deviations from Plan

**1. Added JSON.parse validation after canonicalize**
- **Found during:** pre-implementation package probe
- **Issue:** `canonicalize({ bad: () => {} })` returned invalid text rather than `undefined`.
- **Fix:** `canonicalPromptJson` now rejects canonicalized text that cannot be parsed back as JSON.
- **Verification:** Non-serializable schema/tool tests added in Plan 35-02.
- **Committed in:** `0887bd2`

## User Setup Required

None.

## Next Phase Readiness

Plan 35-02 can snapshot the returned strings and assert the open-weight regression behavior against fake provider stubs.

## Self-Check: PASSED

---
*Phase: 35-prompt-scaffolding-helpers*
*Completed: 2026-06-09*
