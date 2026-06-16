---
phase: 41-gateway-delegation-litellm-gateway-policy
plan: 01
subsystem: providers
tags: [litellm, gateway-policy, openai-compatible]
requires:
  - phase: 40-package-version-stamping-public-surface-guardrails
    provides: public surface and package boundary guardrails
provides:
  - typed GatewayPolicy and GatewayMetadataValue policy surface
  - LiteLLM provider helper over OpenAI-compatible HTTP
  - fake-fetch LiteLLM request, auth, metadata, usage, error, and negotiation tests
affects: [provider-adapters, runtime-accounting, public-surface]
tech-stack:
  added: []
  patterns:
    - first-party OpenAI-compatible gateway wrapper
    - typed gateway metadata serialization
key-files:
  created:
    - packages/lattice/src/providers/litellm.ts
    - packages/lattice/src/providers/litellm.test.ts
  modified:
    - packages/lattice/src/policy/policy.ts
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/capabilities/profile.ts
    - packages/lattice/src/providers/quirks.ts
key-decisions:
  - "LiteLLM stays a thin OpenAI-compatible HTTP wrapper with no runtime dependency."
  - "Gateway fallback hints default to allowFallbacks: false for replayability."
  - "Gateway metadata is typed and secret-shaped entries are filtered before request serialization."
patterns-established:
  - "Gateway hints live in PolicySpec.gateway and serialize to request metadata.lattice_gateway."
  - "LiteLLM capability negotiation is registry-only and does not fetch during negotiation."
requirements-completed: [GATE-01, GATE-02]
duration: 5 min
completed: 2026-06-15
---

# Phase 41 Plan 01: LiteLLM Gateway Helper Summary

**Typed gateway policy metadata plus a first-class LiteLLM OpenAI-compatible provider helper**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-15T13:38:44Z
- **Completed:** 2026-06-15T13:43:30Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added `GatewayPolicy` and `GatewayMetadataValue` to `PolicySpec`.
- Extended OpenAI-compatible requests to merge provider and run gateway hints into top-level `metadata.lattice_gateway`.
- Added `createLiteLLMProvider` with id/base URL defaults, optional bearer auth, default `allowFallbacks: false`, registry-only negotiation, and gateway quirks.
- Added fake-fetch tests for LiteLLM URL handling, optional/provided auth, metadata merging, usage normalization, non-OK errors, registry-only negotiation, and quirks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add typed gateway policy and OpenAI-compatible metadata serialization** - `54bd778` (feat)
2. **Task 2: Add createLiteLLMProvider wrapper and quirks** - `211ec42` (feat)
3. **Task 3: Add LiteLLM fake-fetch provider tests** - `d8c2449` (test)

**Plan metadata:** pending

## Files Created/Modified

- `packages/lattice/src/providers/litellm.ts` - First-class LiteLLM provider helper delegating to OpenAI-compatible HTTP.
- `packages/lattice/src/providers/litellm.test.ts` - Fake-fetch coverage for LiteLLM request, auth, metadata, usage, error, negotiation, and quirks behavior.
- `packages/lattice/src/policy/policy.ts` - Typed gateway policy surface on `PolicySpec`.
- `packages/lattice/src/providers/adapters.ts` - Gateway policy merge and OpenAI-compatible metadata serialization.
- `packages/lattice/src/capabilities/profile.ts` - Closed first-party adapter set now includes `litellm`.
- `packages/lattice/src/providers/quirks.ts` - LiteLLM gateway-specific quirks type.

## Decisions Made

- LiteLLM remains HTTP-only through `createOpenAICompatibleProvider`; no LiteLLM package, Python SDK, gateway process, or new transport abstraction was added.
- `allowFallbacks` defaults to `false` in the LiteLLM helper so gateway fallback is explicit and replay semantics remain deterministic.
- Gateway metadata filters secret-shaped keys and values before request-body serialization.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- litellm` - passed, 920 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## Next Phase Readiness

The LiteLLM helper and typed gateway policy are ready for Plan 41-02 to record gateway hints and observed gateway response metadata in plans and run events without mutating the deterministic Lattice-selected route.

---
*Phase: 41-gateway-delegation-litellm-gateway-policy*
*Completed: 2026-06-15*
