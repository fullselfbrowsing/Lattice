---
phase: 44-streaming-adapter-implementations
plan: 01
subsystem: providers
tags: [streaming, sse, openai-compatible, provider-adapters]
requires:
  - phase: 43-streaming-contract-collectstream
    provides: ProviderAdapter.executeStream, ProviderStream chunks, collectStream
provides:
  - Dependency-free SSE reader for provider adapters
  - OpenAI-compatible executeStream implementation shared by wrappers
  - Streaming inheritance and metadata tests for xAI, OpenRouter, LM Studio, and LiteLLM
affects: [anthropic-streaming, gemini-streaming, provider-parity, runtime-streaming]
tech-stack:
  added: []
  patterns:
    - Shared OpenAI-compatible streaming parser
    - Wrapper-specific stream complete-chunk metadata mapping
key-files:
  created:
    - packages/lattice/src/providers/sse.ts
    - packages/lattice/src/providers/sse.test.ts
  modified:
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/providers/adapters.test.ts
    - packages/lattice/src/providers/xai.ts
    - packages/lattice/src/providers/xai.test.ts
    - packages/lattice/src/providers/openrouter.ts
    - packages/lattice/src/providers/openrouter.test.ts
    - packages/lattice/src/providers/lm-studio.ts
    - packages/lattice/src/providers/lm-studio.test.ts
    - packages/lattice/src/providers/litellm.test.ts
key-decisions:
  - "Use a dependency-free SSE reader instead of adding a runtime dependency."
  - "Keep OpenAI-compatible streaming centralized in createOpenAICompatibleProvider so wrappers share one parser."
  - "Preserve xAI reasoning_tokens and OpenRouter fallback-model gateway metadata on streamed complete chunks."
patterns-established:
  - "Provider stream adapters parse provider-specific deltas internally and yield normalized ProviderStreamChunk values."
  - "Wrapper adapters may map final complete chunks to preserve provider metadata without changing text-delta flow."
requirements-completed: [SADAPT-03, SADAPT-04]
duration: 12min
completed: 2026-06-16
---

# Phase 44 Plan 01: Shared OpenAI-Compatible Streaming Summary

**Dependency-free SSE parsing and OpenAI-compatible streaming across generic compat, xAI, OpenRouter, LM Studio, and LiteLLM adapters**

## Performance

- **Duration:** 12 min
- **Started:** 2026-06-16T06:26:03Z
- **Completed:** 2026-06-16T06:38:13Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added `readSseEvents()` with split-frame, comment, multi-data-line, and named-event coverage.
- Added `createOpenAICompatibleProvider().executeStream()` with normalized `text-delta` and `complete` chunks, final sanitization, usage capture, prompt-reencoded tool-call parsing, and native OpenAI-style streamed tool-call accumulation.
- Wired wrapper parity for xAI, OpenRouter, LM Studio, and LiteLLM, including xAI streamed `reasoning_tokens` preservation and OpenRouter streamed fallback-model gateway metadata.
- Updated OpenAI-compatible capabilities to advertise `streaming: true` so runtime routing can select the stream path.

## Task Commits

1. **Task 1: Add dependency-free SSE reader** - `b5142ae` (feat)
2. **Task 2: Add OpenAI-compatible executeStream** - `c339080` (feat)
3. **Task 3: Verify wrapper inheritance and metadata parity** - `537d7d8` (feat)

## Files Created/Modified

- `packages/lattice/src/providers/sse.ts` - Dependency-free SSE frame reader.
- `packages/lattice/src/providers/sse.test.ts` - SSE parser behavior tests.
- `packages/lattice/src/providers/adapters.ts` - Shared OpenAI-compatible request body and streaming parser.
- `packages/lattice/src/providers/adapters.test.ts` - OpenAI-compatible streaming parser and capability tests.
- `packages/lattice/src/providers/xai.ts` - Stream wrapper preserving xAI reasoning-token legacy usage totals.
- `packages/lattice/src/providers/xai.test.ts` - xAI streaming inheritance and reasoning-token coverage.
- `packages/lattice/src/providers/openrouter.ts` - Stream wrapper preserving fallback gateway metadata.
- `packages/lattice/src/providers/openrouter.test.ts` - OpenRouter fallback-model streaming coverage.
- `packages/lattice/src/providers/lm-studio.ts` - Updated streaming support source note.
- `packages/lattice/src/providers/lm-studio.test.ts` - LM Studio streaming inheritance coverage.
- `packages/lattice/src/providers/litellm.test.ts` - LiteLLM streaming gateway metadata coverage.

## Decisions Made

- Centralized OpenAI-compatible stream parsing in `adapters.ts` because xAI, OpenRouter, LM Studio, and LiteLLM share the same chat-completions SSE shape.
- Returned native streamed tool calls on final `complete.toolCalls` after validating accumulated deltas, keeping the provider stream contract simple for collectors.
- Added wrapper stream mapping only where metadata would otherwise be lost: xAI usage total quirk and OpenRouter fallback models.

## Deviations from Plan

### Auto-fixed Issues

**1. Routing capability mismatch**
- **Found during:** Task 3 (wrapper inheritance checks)
- **Issue:** `createOpenAICompatibleProvider` exposed `executeStream` but inherited `defaultCapabilityForProvider(...).streaming: false`, so streaming policy could skip the adapter.
- **Fix:** Set OpenAI-compatible capability `streaming: true` and added a capability assertion.
- **Files modified:** `packages/lattice/src/providers/adapters.ts`, `packages/lattice/src/providers/adapters.test.ts`
- **Verification:** `pnpm --filter @full-self-browsing/lattice test -- adapters xai openrouter lm-studio litellm`
- **Committed in:** `537d7d8`

**Total deviations:** 1 auto-fixed correctness issue.
**Impact on plan:** Required for streaming routing parity; no scope creep.

## Issues Encountered

- TypeScript `exactOptionalPropertyTypes` rejected optional values passed as explicit `undefined` into the stream helper; fixed by conditionally omitting those fields.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 44-02 Anthropic native streaming. The shared SSE reader can be reused directly for Anthropic Messages streaming events.

---
*Phase: 44-streaming-adapter-implementations*
*Completed: 2026-06-16*
