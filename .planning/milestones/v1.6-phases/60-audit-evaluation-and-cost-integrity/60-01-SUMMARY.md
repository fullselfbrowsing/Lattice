---
phase: 60-audit-evaluation-and-cost-integrity
plan: 01
subsystem: audit-runtime
tags: [receipts, audit-policy, runtime, terminal-errors, tracing]

requires:
  - phase: 59-authoritative-runtime-state
    provides: authoritative terminal plans, usage, artifacts, and event evidence
provides:
  - Shared off, best-effort, and required receipt issuance policy
  - Safe typed terminal AuditError contract
  - Required-mode preflight before capability-run preparation or provider access
  - Single-shot terminal finalization with preserved post-provider evidence
affects: [60-02, 61-receipt-bridge, runtime, audit, tracing]

tech-stack:
  added: []
  patterns: [policy-outcome-union, pre-provider-strict-preflight, post-execution-evidence-preservation]

key-files:
  created: [packages/lattice/src/receipts/policy.ts, packages/lattice/src/receipts/policy.test.ts]
  modified: [packages/lattice/src/runtime/create-ai.ts, packages/lattice/src/results/errors.ts, packages/lattice/src/runtime/config.ts, packages/lattice/src/tracing/tracing.ts]

key-decisions:
  - "Explicit receipt mode takes precedence over signer shorthand; signer-only remains best-effort."
  - "Receipt construction and signing faults share one bounded audit error with no retained cause."
  - "Required post-execution failures replace only the terminal result while preserving usage, plan, partial outputs, artifacts, gateway data, and bounded events."

patterns-established:
  - "Every capability-run terminal branch passes through one receipt finalizer outside provider retry classification."
  - "Strict missing-signer failures return a plan stub and zero usage before preparation work."

requirements-completed: [AUDIT16-01, AUDIT16-02, AUDIT16-03]

duration: 14min
completed: 2026-07-16
---

# Phase 60 Plan 01: Runtime Receipt Policy Summary

**Capability runs now expose explicit receipt strictness and cannot return receipt-less required-mode success or retry provider work after signing failure**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-17T02:56:00Z
- **Completed:** 2026-07-17T03:10:42Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added a shared immutable receipt policy with explicit `off`, `best-effort`, and `required` modes plus `issued | skipped | failed` outcomes.
- Preserved signer-only configuration as best effort while allowing explicit off to suppress a configured signer.
- Added a cause-free typed `AuditError` with stable missing-signer/signing-failure codes, pre/post execution stage, and terminal classification.
- Preflighted required runs without a signer before transforms, context preparation, or provider access and returned zero usage with a plan stub.
- Finalized preparation, routing, materialization, validation, tripwire, persistence, provider-failure, sync, streaming, and fallback-success exits through one policy helper.
- Preserved safe completed-execution evidence on required signing failure and emitted only bounded receipt status/code/stage diagnostics.

## Task Commits

1. **Task 1: Define issuance policy and safe audit failure contracts** - `ad4762c` (feat)
2. **Task 2: Finalize every capability-run result through the policy** - `c6318ea` (feat)

## Files Created/Modified

- `packages/lattice/src/receipts/policy.ts` - Policy normalization, preflight, safe issuance, and outcome vocabulary.
- `packages/lattice/src/runtime/create-ai.ts` - Required preflight and central terminal receipt finalization.
- `packages/lattice/src/results/errors.ts` - Public terminal audit error types and predicate support.
- `packages/lattice/src/runtime/config.ts` - Additive `receiptMode` configuration.
- `packages/lattice/src/tracing/tracing.ts` - Bounded receipt issuance lifecycle event.
- `packages/lattice/src/audit.ts` and `packages/lattice/src/core.ts` - Modular policy/error exports.
- Focused policy, config, error, runtime, streaming, fallback, tripwire, validation, and persistence tests.

## Decisions Made

- Kept `createReceipt` as the explicit low-level issuer and made orchestration use the policy helper.
- Classified receipt-input construction faults with the same safe signing-failure code because callers must not observe internal hashing, canonicalization, or signer causes.
- Left execution-plan evidence truthful to completed provider work when required signing fails; the public result changes to terminal audit failure without rewriting completed execution stages.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Exported policy and error contracts from established modular surfaces**
- **Found during:** Task 1 public boundary review
- **Issue:** The plan named root/public type files but the repository's receipt and result contracts also ship through `audit.ts` and `core.ts`.
- **Fix:** Added compatible exports to both established modular entrypoints.
- **Files modified:** `packages/lattice/src/audit.ts`, `packages/lattice/src/core.ts`
- **Verification:** package typecheck and focused tests passed.
- **Committed in:** `ad4762c`

**2. [Rule 2 - Missing Critical] Added a bounded receipt lifecycle event**
- **Found during:** Task 2 best-effort diagnostic implementation
- **Issue:** Existing `RunEventKind` had no receipt issuance status event, so bounded failure diagnostics could not be retained without overloading unrelated events.
- **Fix:** Added additive `receipt.issuance` and populated only status, code, and stage.
- **Files modified:** `packages/lattice/src/tracing/tracing.ts`
- **Verification:** secret-sentinel and terminal-path tests passed.
- **Committed in:** `c6318ea`

---

**Total deviations:** 2 auto-fixed (2 missing public/diagnostic integration surfaces).
**Impact on plan:** Additive only; provider methods, retry semantics, and low-level receipt issuance remain unchanged.

## Issues Encountered

- The first typecheck exposed two broad-patch export placements and exact-optional test literals; both were corrected before the task commit.
- The repository does not currently install a Prettier binary, so formatting was maintained manually and `git diff --check` was used as the whitespace gate.

## User Setup Required

None - no external service configuration required.

## Validation Evidence

- Receipt policy, error, config, capability-runtime, and authoritative-state matrix: 5 files, 110 tests passed.
- `pnpm --filter @full-self-browsing/lattice typecheck`: passed.
- Required-mode tests prove zero preflight provider calls, one post-provider signing attempt, no fallback duplication, preserved evidence, and no signer sentinel leakage.
- `git diff --check`: passed.

## Next Phase Readiness

- Checkpoints, agents, crews, and external execution can now consume one issuance outcome without redefining strictness.
- Phase 61 can attach successfully issued envelopes using the internal outcome without changing this error policy.
- No blockers remain for Plan 60-02.

## Self-Check: PASSED

- Commits `ad4762c` and `c6318ea` contain the two planned tasks and bounded integration deviations.
- Every capability-run terminal branch now uses the shared finalizer.
- All focused tests and package typecheck pass.
- User paper and graph work remain untouched.

---
*Phase: 60-audit-evaluation-and-cost-integrity*
*Completed: 2026-07-16*
