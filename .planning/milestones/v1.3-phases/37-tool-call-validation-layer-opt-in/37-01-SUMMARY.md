---
phase: 37-tool-call-validation-layer-opt-in
plan: 01
subsystem: provider-contract
tags: [tool-call-validation, public-api, parser, standard-schema]
requires:
  - phase: 37-context
    provides: "Locked opt-in validation decisions and VALID-01..03 requirements"
provides:
  - "Shared tool-call validation error, option types, validated call type, and helper"
  - "ProviderRunResponse.toolCalls normalized response field"
  - "parseToolUseEnvelope parser helper reused by formatToolsForProvider"
  - "Root exports and public/type tests for the validation surface"
affects: [phase-37-adapters, phase-37-agent-runtime]
tech-stack:
  added: []
  patterns:
    - "Validation options depend on ToolDefinition name/inputSchema only, avoiding execute generic variance"
    - "Prompt-reencoded tool-call parsing is centralized in parseToolUseEnvelope"
key-files:
  created:
    - packages/lattice/src/tools/tool-call-validation.ts
    - packages/lattice/src/tools/tool-call-validation.test.ts
    - packages/lattice/test-d/tool-call-validation.test-d.ts
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/agent/format-tools.ts
    - packages/lattice/src/agent/format-tools.test.ts
    - packages/lattice/src/index.ts
    - packages/lattice/test/public-surface.test.ts
key-decisions:
  - "ValidateToolCallsOption.tools accepts the validation subset of ToolDefinition so typed Zod tools are assignable without widening execute inputs."
  - "Extra-field rejection runs only after schema validation succeeds, so missing required fields remain invalid_args instead of being masked as extra_fields."
patterns-established:
  - "Tool-call validation returns undefined when not configured, preserving existing adapter behavior."
  - "Callback mode is a configuration error unless onValidationFailure is supplied."
requirements-completed:
  - VALID-01
  - VALID-02
  - VALID-03
duration: 7min
completed: 2026-06-09
---

# Phase 37 Plan 01: Core Tool-Call Validation Summary

**Shared tool-call validation contract with parser reuse, normalized response field, public exports, and direct test coverage**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-09T21:20:39Z
- **Completed:** 2026-06-09T21:27:09Z
- **Tasks:** 4 completed
- **Files modified:** 8

## Accomplishments

- Added `ToolCallValidationError`, `ToolCallValidationFailureReason`, `ValidateToolCallsOption`, `ValidatedToolCall`, and `validateToolCallRequests`.
- Added optional `ProviderRunResponse.toolCalls` and exported `parseToolUseEnvelope` for adapter reuse.
- Added direct validator tests, parser reuse tests, public-surface smoke coverage, and tsd package-type coverage.

## Task Commits

1. **Tasks 1-2: validation types, error, and helper** - `ea6bad0` (feat)
2. **Task 3: response field, parser helper, and root exports** - `be38007` (feat)
3. **Task 4: core behavior and type tests** - `73e80b0` (test)

## Files Created/Modified

- `packages/lattice/src/tools/tool-call-validation.ts` - Shared validator, option types, validated call type, and error class.
- `packages/lattice/src/providers/provider.ts` - Optional normalized `toolCalls` provider response field.
- `packages/lattice/src/agent/format-tools.ts` - Exported `parseToolUseEnvelope`; existing `parseToolUse` delegates to it.
- `packages/lattice/src/tools/tool-call-validation.test.ts` - Throw/drop/callback, invalid args, unknown tool, extra-field, and config-error coverage.
- `packages/lattice/src/agent/format-tools.test.ts` - Parser helper parity coverage.
- `packages/lattice/src/index.ts` - Root exports for the validation surface.
- `packages/lattice/test/public-surface.test.ts` - Public runtime/type smoke coverage.
- `packages/lattice/test-d/tool-call-validation.test-d.ts` - Package-consumer type coverage.

## Decisions Made

- `ValidateToolCallsOption.tools` is typed to the validation subset of `ToolDefinition` (`name` + `inputSchema`). This accepts real `ToolDefinition[]` while avoiding contravariance failures from typed `execute` functions.
- Extra fields are detected after successful schema validation. This keeps malformed calls like `{ quer: "..." }` classified as `invalid_args` with path `["query"]`, matching the requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built declarations before package type tests**
- **Found during:** Task 4 (type tests)
- **Issue:** `tsd` reads `dist/index.d.ts`, and the first `test:types` run saw stale declarations that did not include the new root exports.
- **Fix:** Ran `pnpm --filter @full-self-browsing/lattice build` before rerunning `test:types`.
- **Files modified:** none tracked; `dist` is ignored build output.
- **Verification:** `test:types` passed after the build.
- **Committed in:** none, build output is not tracked.

---

**Total deviations:** 1 auto-fixed (blocking verification setup).
**Impact on plan:** No API scope change. The extra build step was required to verify package-facing declarations.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools public-surface` - passed, 3 files / 137 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.
- `pnpm --filter @full-self-browsing/lattice build` - passed.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 78 files / 976 tests / no type errors, plus `tsd`.

## Self-Check: PASSED

- Key files created and modified as planned.
- Acceptance criteria for all four tasks verified.
- Verification commands passed.
- Ready for Wave 2 adapter/runtime wiring.

## Next Phase Readiness

Wave 2 can now import `ValidateToolCallsOption`, `validateToolCallRequests`, and `parseToolUseEnvelope`. Adapter plans should populate `ProviderRunResponse.toolCalls` without mutating `rawOutputs` or `rawResponse`.

---
*Phase: 37-tool-call-validation-layer-opt-in*
*Completed: 2026-06-09*
