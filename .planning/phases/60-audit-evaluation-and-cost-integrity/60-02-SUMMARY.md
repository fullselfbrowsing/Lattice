---
phase: 60-audit-evaluation-and-cost-integrity
plan: 02
subsystem: agent-audit
tags: [receipts, agents, crews, checkpoints, external-audit]

requires:
  - phase: 60-audit-evaluation-and-cost-integrity
    plan: 01
    provides: shared receipt modes, outcomes, and typed AuditError
provides:
  - Policy-aware checkpoint outcomes with bounded trace metadata
  - Agent preflight and single terminal receipt finalizer across every result branch
  - Crew root and completion policy parity with safe nested audit failures
  - Required external execution audit issuance with safe typed throws
affects: [61-agent-receipt-closure, agents, crews, audit, tracing]

tech-stack:
  added: []
  patterns: [effective-invocation-policy, terminal-result-finalizer, checkpoint-failure-reuse, safe-required-throw]

key-files:
  created: []
  modified: [packages/lattice/src/contract/checkpoint.ts, packages/lattice/src/agent/runtime.ts, packages/lattice/src/agent/types.ts, packages/lattice/src/agent/crew/run-crew.ts, packages/lattice/src/agent/crew/dispatcher.ts, packages/lattice/src/audit/external-execution.ts]

key-decisions:
  - "Agent and crew invocation mode overrides config mode, and invocation signer overrides config signer."
  - "A required checkpoint failure is retained and reused by the terminal finalizer instead of signing or executing again."
  - "Successful agent terminal envelopes remain on an internal outcome channel for Phase 61; existing crew completion receipt arrays remain unchanged."
  - "Explicit external audit creation uses a shared required-issuance throwing helper that can expose only AuditError."

patterns-established:
  - "Required missing signer preflight occurs before host construction, storage load, dispatcher construction, or provider selection."
  - "Crew audit failure outranks crew budget failure after completed work."

requirements-completed: [AUDIT16-04]

duration: 22min
completed: 2026-07-16
---

# Phase 60 Plan 02: Cross-Surface Audit Policy Summary

**Checkpoints, agents, crews, and external execution audits now share one strict issuance contract without duplicate provider work or unsafe signer diagnostics**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-17T03:21:30Z
- **Completed:** 2026-07-17T03:43:31Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added policy-aware checkpoint issuance with one bounded outcome callback and exactly one step-transition trace event per invocation.
- Removed raw checkpoint signer messages and replaced them with stable status, code, and stage metadata.
- Added invocation-level `receiptMode` to agents and crews with deterministic local-over-config mode and signer precedence.
- Preflighted required agent and crew runs before host storage, transport, dispatcher, or provider work.
- Routed no-provider, provider-error, validation, safety-denial, wall/iteration/cost-budget, tool-loop, and success agent exits through one terminal finalizer.
- Reused required checkpoint failures after completed or denied iterations, retaining accumulated usage and iteration records without another signing or provider attempt.
- Converted crew root, child completion, and parent completion issuance to shared policy outcomes while preserving the existing successful receipt array and chain.
- Routed explicit external execution audits through required policy issuance and exposed only the shared typed audit error on signer failure.

## Task Commits

1. **Task 1: Make checkpoints and single agents policy-aware** - `e8f0909` (feat)
2. **Task 2: Converge crew and explicit external audit issuance** - `28e8f56` (feat)

## Files Created/Modified

- `packages/lattice/src/contract/checkpoint.ts` - Shared issuance policy, outcome callback, and bounded trace metadata.
- `packages/lattice/src/agent/types.ts` - Invocation receipt mode and discriminated typed audit failure.
- `packages/lattice/src/agent/runtime.ts` - Preflight, effective policy, checkpoint failure reuse, and terminal finalizer.
- `packages/lattice/src/agent/crew/run-crew.ts` - Crew preflight, root/completion outcomes, precedence, and frozen audit results.
- `packages/lattice/src/agent/crew/dispatcher.ts` - Child policy propagation, completion failure conversion, and terminal caching.
- `packages/lattice/src/audit/external-execution.ts` - Required safe receipt issuance.
- `packages/lattice/src/receipts/policy.ts` - Required evidence-factory throwing form.
- Focused checkpoint, agent, crew, dispatcher, cache, and external-audit fault tests.

## Decisions Made

- Kept `autoRegisterCheckpoint: false` effective in required mode because the separate terminal finalizer still enforces strict issuance.
- Used one run-scoped internal outcome callback for successful agent terminal evidence instead of attaching public receipts ahead of Phase 61.
- Classified audit child failures as terminal and cached their structured tool result, preventing repeated child dispatch.
- Preserved best-effort behavior after root, checkpoint, terminal, or completion signing failure and emitted only bounded diagnostics.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated the crew dispatcher completion seam**
- **Found during:** Task 2 receipt path tracing
- **Issue:** Child completion receipts are minted in `dispatcher.ts`, although that file was omitted from the plan's modified-file list.
- **Fix:** Routed the existing completion mint through the effective policy, propagated mode to child intents, and cached required audit failure as terminal.
- **Files modified:** `packages/lattice/src/agent/crew/dispatcher.ts`
- **Verification:** dispatcher, cache-prefix, crew unit, and crew integration suites passed.
- **Committed in:** `28e8f56`

**2. [Rule 3 - Blocking] Narrowed a generic dispatcher test failure helper**
- **Found during:** Task 1 package typecheck
- **Issue:** The helper claimed to construct every `AgentFailure`, including the new audit variant without required code/stage/message fields.
- **Fix:** Narrowed its accepted kind to non-audit failures.
- **Files modified:** `packages/lattice/src/agent/crew/dispatcher.test.ts`
- **Verification:** package typecheck and dispatcher suite passed.
- **Committed in:** `e8f0909`

**3. [Rule 2 - Missing Critical] Added a shared safe throwing form for explicit evidence factories**
- **Found during:** Task 2 external audit conversion
- **Issue:** Handling the theoretically skipped branch locally would reintroduce a second diagnostics authority or an untyped error.
- **Fix:** Added `issueRequiredReceipt`, which returns an envelope or throws only the shared bounded AuditError.
- **Files modified:** `packages/lattice/src/receipts/policy.ts`
- **Verification:** external signer-fault test and package typecheck passed.
- **Committed in:** `28e8f56`

---

**Total deviations:** 3 auto-fixed (2 missing integration surfaces, 1 blocking type fixture).
**Impact on plan:** Required for cross-surface parity; no public provider methods or successful crew receipt arrays changed.

## Issues Encountered

- No runtime blockers. The expanded audit failure discriminant exposed one overbroad test factory during type checking.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- Combined checkpoint, agent, crew, dispatcher, cache-prefix, and external audit matrix: 8 files, 102 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- Root, child completion, parent completion, provider-error, validation, denied, budget, final, and tool-loop fault tests assert exact signer/provider/host counts.
- Secret sentinels are absent from checkpoint metadata, agent/crew results, child tool errors, and external thrown errors.
- `git diff --check`: passed.

## Next Phase Readiness

- Phase 61 can attach the already-issued internal agent outcomes and reconcile crew receipt ordering without redefining strictness or minting duplicates.
- No blockers remain for the shared cost kernel in Plan 60-04.

## Self-Check: PASSED

- Commits `e8f0909` and `28e8f56` contain both planned tasks and required integration deviations.
- Required missing-signer paths perform zero host and provider work.
- Required post-work failures retain safe evidence and never repeat provider or child execution.
- User paper and graph work remain untouched.

---
*Phase: 60-audit-evaluation-and-cost-integrity*
*Completed: 2026-07-16*
