---
phase: 60-audit-evaluation-and-cost-integrity
plan: 06
subsystem: cross-surface-verification
tags: [receipts, evaluation, pricing, property-testing, public-api]

requires:
  - phase: 60-audit-evaluation-and-cost-integrity
    plan: 05
    provides: completed receipt policy, strict evaluation, and shared cost consumers
provides:
  - Generated public-boundary evidence for every Phase 60 requirement
  - Additive root and modular export/type compatibility closure
  - Complete runtime and CLI regression gate with deterministic test isolation
affects: [agent-receipt-closure, operational-interop]

tech-stack:
  added: []
  patterns: [cross-surface-property-matrix, evaluable-fixture-partition, serialized-cli-integration]

key-files:
  created: [packages/lattice/test/audit-cost-integrity.test.ts]
  modified: [packages/lattice/test/public-surface.test.ts, packages/lattice/test/modular-entrypoints.test.ts, packages/lattice/test-d/public-api.test-d.ts, packages/lattice/test-d/modular-entrypoints.test-d.ts, packages/lattice-cli/test/eval-runner.test.ts, packages/lattice-cli/test/eval.test.ts, packages/lattice-cli/test/showcase-e2e.test.ts, packages/lattice-cli/vitest.config.ts]

key-decisions:
  - "Cross-surface receipt evidence observes signer and provider call counts without adding Phase 61 receipt collectors."
  - "CLI integration files run serially because process cwd and dynamic package mocks are process-wide state."
  - "Showcase baseline tests partition evaluable success receipts while separately proving the full mixed set exits 2 without writing."

patterns-established:
  - "Requirement IDs appear directly in closing integration assertions and validation rows."
  - "Packed declaration tests retain legacy signer, provider, tracker, and scalar-plan literals alongside additive types."

requirements-completed: [AUDIT16-01, AUDIT16-02, AUDIT16-03, AUDIT16-04, EVAL16-01, EVAL16-02, PRICE-01, PRICE-02, PRICE-03, PRICE-04]

duration: 18min
completed: 2026-07-16
---

# Phase 60 Plan 06: Cross-Surface Integrity Closure Summary

**Generated receipt and cost matrices plus strict CLI fixtures prove every Phase 60 requirement through public, packed, and full-package boundaries**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-17T04:37:23Z
- **Completed:** 2026-07-17T04:55:34Z
- **Tasks:** 1
- **Files modified:** 10

## Accomplishments

- Added an 18-case sync/stream receipt-mode matrix covering off, best-effort, and required under missing, working, and rejecting signers with exact provider/signer counts and safe diagnostics.
- Proved required behavior across agent final/tool paths, crew parent/child paths, and external audit without duplicate completed work or new receipt collection fields.
- Added generated pricing/token/budget matrices comparing the structured kernel, legacy compatibility helper, provider normalization, CostTracker, plan evidence, route policy, contract preflight, agent diagnostics, and crew propagation.
- Closed root, audit, routing, and agents facade contracts at runtime and through packed `tsd` fixtures while preserving old provider, signer, tracker, and scalar estimate literals.
- Proved all invalid evaluation stages remain reported, exit 2 outranks regression, and mixed showcase initialization cannot mutate a baseline.
- Ran the complete runtime, CLI, declaration, build, and module-boundary gate.

## Task Commits

1. **Task 1: Fill the cross-surface audit, eval, and cost proof matrix** - `ed269ec` (test)

## Files Created/Modified

- `packages/lattice/test/audit-cost-integrity.test.ts` - Generated cross-surface receipt and pricing proof matrix.
- `packages/lattice/test/public-surface.test.ts` - Exact additive root values and Phase 60 type reachability.
- `packages/lattice/test/modular-entrypoints.test.ts` - Audit, routing, and agent facade closure.
- `packages/lattice/test-d/public-api.test-d.ts` - Packed root compatibility for new and legacy literals.
- `packages/lattice/test-d/modular-entrypoints.test-d.ts` - Packed modular receipt, cost, and tracker types.
- `packages/lattice/src/audit.ts` - AuditError type family exposed from its owning facade.
- `packages/lattice-cli/test/eval-runner.test.ts` and `test/eval.test.ts` - Requirement-labeled invalid-stage and baseline atomicity evidence.
- `packages/lattice-cli/test/showcase-e2e.test.ts` - Mixed invalid-set rejection and evaluable baseline regression coverage.
- `packages/lattice-cli/vitest.config.ts` - Deterministic serialization for process-wide CLI integration state.

## Decisions Made

- Kept Phase 61 isolated by observing receipt issuance through signer counts and existing result behavior rather than adding iteration or terminal attachment fields.
- Used property generation for pricing shapes and token/budget relations, but table-driven public calls for agent and crew transport counts to keep the closing gate bounded.
- Treated failure-class showcase receipts with null output hashes as invalid evaluation inputs; success-class receipts form the baseline set.
- Serialized CLI test files because their deliberate `process.chdir()` and `vi.doMock()` operations cannot be made file-parallel safely.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Closed stale additive public export inventories**
- **Found during:** Task 1 initial public-surface probe
- **Issue:** The package exported receipt policy and cost values added earlier in Phase 60, but exact runtime and packed consumer inventories still described v1.5.
- **Fix:** Updated root/modular runtime tests, packed type fixtures, and exposed `AuditError` from the audit facade.
- **Files modified:** public and modular tests/type fixtures plus `packages/lattice/src/audit.ts`.
- **Verification:** Focused public suite and packed `tsd` gate passed.
- **Committed in:** `ed269ec`

**2. [Rule 1 - Bug] Serialized CLI files that mutate process-wide state**
- **Found during:** Task 1 complete CLI gate
- **Issue:** Repro and evaluation files changed `process.cwd()` and dynamically mocked the same package while Vitest ran files in parallel, causing nondeterministic replay results.
- **Fix:** Disabled file parallelism for the CLI package with an explicit process-state rationale.
- **Files modified:** `packages/lattice-cli/vitest.config.ts`.
- **Verification:** Serial repro/eval probe passed 37/37; full CLI suite passed 17 files/175 tests.
- **Committed in:** `ed269ec`

**3. [Rule 2 - Missing Critical] Reconciled showcase baseline fixtures with strict invalid-input semantics**
- **Found during:** Task 1 complete CLI gate
- **Issue:** The showcase baseline mixed success receipts with failure receipts that intentionally have null output hashes; strict evaluation correctly rejected the set, invalidating the old exit-0 expectation.
- **Fix:** Added a direct mixed-set exit-2/no-write assertion and used an evaluable-only receipt directory for baseline and cost-regression checks.
- **Files modified:** `packages/lattice-cli/test/showcase-e2e.test.ts`.
- **Verification:** Showcase E2E passed 10/10 and the complete CLI suite passed.
- **Committed in:** `ed269ec`

---

**Total deviations:** 3 auto-fixed (2 missing critical closures, 1 test-isolation bug).
**Impact on plan:** The fixes make the planned full gate truthful and deterministic without weakening strict evaluation or entering Phase 61/62 feature scope.

## Issues Encountered

- `tsd` initially read stale declarations because it was invoked before the package build; rerunning in release order (`build` then `test:types`) passed.
- Full CLI execution exposed process-global test races that focused file runs could not reproduce.

## User Setup Required

None - no external service configuration or paid provider calls required.

## Validation Evidence

- Focused runtime/public/parity matrix: 4 files, 96 tests passed.
- Focused CLI evaluation: 2 files, 31 tests passed.
- Runtime full suite: 95 files, 1,333 tests passed.
- Runtime type gate: 117 files, 1,572 tests, zero type errors, and `tsd` passed.
- CLI full suite: 17 files, 175 tests passed.
- Runtime and CLI typechecks/builds passed; runtime build emitted 112 files and CLI build emitted 19 files.
- `pnpm check:module-boundaries`: passed.
- Production pricing arithmetic search found multiplication only in `routing/cost.ts`.
- `git diff --check`: passed.

## Next Phase Readiness

- Phase 60 has direct automated evidence for all ten requirements and no human-only checks.
- Phase 61 can attach existing issued receipts to stable agent identities without revisiting policy or cost semantics.
- Phase 62 retains packed Node matrix, provider canaries, documentation, and comment hygiene scope.

## Self-Check: PASSED

- Commit `ed269ec` contains the complete matrix, public contracts, and deterministic CLI gate.
- Every Phase 60 validation row is marked passed with a named automated command.
- Runtime, CLI, declarations, builds, and module boundaries are green.
- Agent receipt attachment and operational closure surfaces remain unchanged.
- User paper and journal files remain untouched.

---
*Phase: 60-audit-evaluation-and-cost-integrity*
*Completed: 2026-07-16*
