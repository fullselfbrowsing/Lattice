---
phase: 37-tool-call-validation-layer-opt-in
plan: 03
subsystem: provider-adapters
tags: [anthropic, gemini, provider-parity, changeset]
requires:
  - phase: 37-01
    provides: "ValidateToolCallsOption, validateToolCallRequests, parseToolUseEnvelope, and ProviderRunResponse.toolCalls"
  - phase: 37-02
    provides: "OpenAI-compatible family validation wiring and agent runtime response.toolCalls preference"
provides:
  - "Anthropic validateToolCalls option and execution wiring"
  - "Gemini validateToolCalls option and execution wiring"
  - "All-seven adapter validation parity for valid, drop, and throw behavior"
  - "Phase 37 changeset documenting opt-in returned tool-call validation"
affects: [phase-38-receipts, phase-39-agent-crew]
tech-stack:
  added: []
  patterns:
    - "Direct adapters mirror the shared OpenAI-compatible validation flow without changing raw provider response preservation"
    - "Parity tests exercise the same prompt-encoded tool_calls envelope across all 7 first-party adapter factories"
key-files:
  created:
    - .changeset/v1.3.0-tool-call-validation.md
  modified:
    - packages/lattice/src/providers/anthropic.ts
    - packages/lattice/src/providers/gemini.ts
    - packages/lattice/src/providers/anthropic.test.ts
    - packages/lattice/src/providers/gemini.test.ts
    - packages/lattice/src/providers/parity.test.ts
key-decisions:
  - "Anthropic and Gemini parse the original provider text before validation, then return sanitized rawOutputs and original rawResponse exactly as before."
  - "All-seven parity covers valid calls, drop mode, and throw mode using the roadmap typo case `search_database` / `quer`."
patterns-established:
  - "Adapter-level validation remains opt-in: no validateToolCalls option means no response.toolCalls field."
  - "Changeset wording describes returned envelope validation and avoids claiming native provider tool APIs."
requirements-completed:
  - VALID-01
  - VALID-03
duration: 7min
completed: 2026-06-09
---

# Phase 37 Plan 03: Direct Provider Validation Parity Summary

**Anthropic and Gemini now match the OpenAI-compatible validation path, with all-seven provider parity and release notes.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-09T21:32:15Z
- **Completed:** 2026-06-09T21:39:24Z
- **Tasks:** 4 completed
- **Files modified:** 6

## Accomplishments

- Added `validateToolCalls?: ValidateToolCallsOption` to `AnthropicProviderOptions` and `GeminiProviderOptions`.
- Wired both direct adapters through `parseToolUseEnvelope` and `validateToolCallRequests`.
- Added direct Anthropic/Gemini tests for valid normalized calls, failure behavior, raw output preservation, and raw response preservation.
- Added all-seven parity tests covering OpenAI, OpenAI-compatible, Anthropic, Gemini, xAI, OpenRouter, and LM Studio for valid, drop, and throw validation modes.
- Added `.changeset/v1.3.0-tool-call-validation.md` for the new opt-in API surface.

## Task Commits

1. **Tasks 1-2: direct adapter validation wiring** - `0e27618` (feat)
2. **Task 3: direct and parity tests** - `4af3e34` (test)
3. **Task 4: changeset** - `f0be51f` (docs)

## Files Created/Modified

- `packages/lattice/src/providers/anthropic.ts` - Direct Anthropic validation option and normalized `toolCalls` return.
- `packages/lattice/src/providers/gemini.ts` - Direct Gemini validation option and normalized `toolCalls` return.
- `packages/lattice/src/providers/anthropic.test.ts` - Anthropic validation success and failure coverage.
- `packages/lattice/src/providers/gemini.test.ts` - Gemini validation success and failure coverage.
- `packages/lattice/src/providers/parity.test.ts` - All-seven provider validation parity tests.
- `.changeset/v1.3.0-tool-call-validation.md` - Release note for opt-in returned tool-call validation.

## Decisions Made

- Direct adapters validate against the original extracted provider text, then preserve existing sanitized output behavior and `rawResponse`.
- The parity matrix uses the same valid and invalid prompt-encoded envelopes across every provider-shaped response body, proving the public option is consistently wired.
- The changeset intentionally says returned tool-call envelope validation, not native provider tool-use support.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test anthropic gemini parity` - passed, 3 files / 60 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.
- `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools adapters openrouter xai lm-studio agent/runtime anthropic gemini parity public-surface` - passed, 11 files / 295 tests.
- `pnpm --filter @full-self-browsing/lattice build` - passed.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 78 files / 992 tests / no type errors, plus `tsd`.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## Self-Check: PASSED

- Anthropic and Gemini option types and execution paths match the planned validation contract.
- All seven adapter factories accept `validateToolCalls` and pass parity tests.
- Requirements `VALID-01` through `VALID-03` are now complete across Plans 37-01 to 37-03.
- Final verification gates passed.

## Next Phase Readiness

Phase 38 can now begin discussion/planning for receipt schema v1.2 and the `modelClass` tag. The remaining planned-but-unauthored v1.3 requirement groups are `RECEIPT12` and `DELEG`.

---
*Phase: 37-tool-call-validation-layer-opt-in*
*Completed: 2026-06-09*
