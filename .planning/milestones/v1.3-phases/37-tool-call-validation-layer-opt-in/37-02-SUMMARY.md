---
phase: 37-tool-call-validation-layer-opt-in
plan: 02
subsystem: provider-adapters
tags: [openai-compatible, openrouter, xai, lm-studio, agent-runtime]
requires:
  - phase: 37-01
    provides: "ValidateToolCallsOption, validateToolCallRequests, parseToolUseEnvelope, and ProviderRunResponse.toolCalls"
provides:
  - "OpenAI-compatible adapter-side validateToolCalls option"
  - "OpenAI, OpenRouter, xAI, and LM Studio inherited validation behavior"
  - "Agent runtime preference for adapter-normalized response.toolCalls"
  - "Tests proving dropped invalid calls are not executed"
affects: [phase-37-direct-providers, phase-37-parity]
tech-stack:
  added: []
  patterns:
    - "Shared OpenAI-compatible execution owns validation for all wrapper providers"
    - "Agent runtime uses response.toolCalls when defined and parser fallback otherwise"
key-files:
  created: []
  modified:
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/agent/runtime.ts
    - packages/lattice/src/providers/adapters.test.ts
    - packages/lattice/src/providers/openrouter.test.ts
    - packages/lattice/src/providers/xai.test.ts
    - packages/lattice/src/providers/lm-studio.test.ts
    - packages/lattice/src/agent/runtime.test.ts
key-decisions:
  - "Validation is wired only in createOpenAICompatibleProvider; wrapper providers inherit it through their existing option extension and forwarding."
  - "An empty response.toolCalls array is treated as no tool work, so invalid dropped calls are never executed by runAgent."
patterns-established:
  - "Wrapper validation tests assert behavior without adding wrapper-local validateToolCallRequests calls."
  - "Runtime tests can simulate adapter-side validation by returning ProviderRunResponse.toolCalls from createFakeProvider."
requirements-completed:
  - VALID-01
  - VALID-02
  - VALID-03
duration: 5min
completed: 2026-06-09
---

# Phase 37 Plan 02: OpenAI-Compatible Validation Summary

**OpenAI-compatible adapter family now returns opt-in validated tool calls and runAgent consumes them before parser fallback**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-09T21:27:09Z
- **Completed:** 2026-06-09T21:32:15Z
- **Tasks:** 4 completed
- **Files modified:** 7

## Accomplishments

- Added `validateToolCalls?: ValidateToolCallsOption` to `OpenAICompatibleProviderOptions`.
- Wired `parseToolUseEnvelope` + `validateToolCallRequests` into the OpenAI-compatible execute path without mutating `rawOutputs` or `rawResponse`.
- Updated `runAgent` to prefer `response.toolCalls` while preserving parser fallback for adapters that do not validate.
- Added tests for OpenAI-compatible, OpenAI, OpenRouter, xAI, LM Studio, and runtime behavior.

## Task Commits

1. **Tasks 1-3: adapter validation and runtime preference** - `4ed3e07` (feat)
2. **Task 4: OpenAI-compatible family and runtime tests** - `cbdb0b6` (test)

## Files Created/Modified

- `packages/lattice/src/providers/adapters.ts` - Shared OpenAI-compatible validation option and normalized `toolCalls` return.
- `packages/lattice/src/agent/runtime.ts` - `response.toolCalls` preference with parser fallback and empty-array no-op behavior.
- `packages/lattice/src/providers/adapters.test.ts` - OpenAI-compatible and OpenAI validation tests.
- `packages/lattice/src/providers/openrouter.test.ts` - OpenRouter wrapper validation test.
- `packages/lattice/src/providers/xai.test.ts` - xAI wrapper one-callback validation test.
- `packages/lattice/src/providers/lm-studio.test.ts` - LM Studio wrapper validation test.
- `packages/lattice/src/agent/runtime.test.ts` - Runtime preference and dropped-call non-execution tests.

## Decisions Made

- Wrapper source files did not need edits: their option interfaces already extend `OpenAICompatibleProviderOptions` and their factories forward `...options`.
- Runtime treats `response.toolCalls: []` like no tool work. This is the adapter-side "drop invalid calls" contract and prevents executing malformed calls.

## Deviations from Plan

None - plan executed exactly as written. Wrapper files were inspected and required no code changes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test adapters openrouter xai lm-studio agent/runtime` - passed, 5 files / 98 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## Self-Check: PASSED

- Shared OpenAI-compatible path owns validation.
- Wrappers inherit validation exactly once.
- Agent runtime consumes normalized calls and does not execute dropped invalid calls.
- Ready for Anthropic/Gemini direct provider parity.

## Next Phase Readiness

Plan 37-03 can mirror the adapter-side validation pattern in Anthropic and Gemini, then add all-seven parity and the Phase 37 changeset.

---
*Phase: 37-tool-call-validation-layer-opt-in*
*Completed: 2026-06-09*
