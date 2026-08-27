---
phase: 60
slug: audit-evaluation-and-cost-integrity
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
updated: 2026-07-16
---

# Phase 60 - Validation Strategy

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.5, fast-check 4.7.0, tsd |
| **Config files** | `packages/lattice/vitest.config.ts`, `packages/lattice-cli/vitest.config.ts`, package TypeScript configs |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/policy.test.ts src/routing/cost.test.ts test/audit-cost-integrity.test.ts` |
| **CLI quick command** | `pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/eval-runner.test.ts test/eval.test.ts` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice-cli typecheck && pnpm --filter @full-self-browsing/lattice-cli test && pnpm --filter @full-self-browsing/lattice-cli build && pnpm check:module-boundaries` |
| **Estimated runtime** | Under 8 minutes; phase-level only |

## Sampling Rate

- After every task: run its focused non-watch command.
- After every plan: run package typecheck plus the suites touched by that plan.
- Before phase verification: run the complete runtime, CLI, build, type-test, and
  module-boundary gate.
- Maximum task feedback latency: 180 seconds; the complete gate is reserved for Plan
  60-06.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---:|---|---|---|---|---|---|---|
| 60-01-01 | 01 | 1 | AUDIT16-01, AUDIT16-02, AUDIT16-03 | T-60-01, T-60-03 | Shared policy distinguishes off/best-effort/required and emits bounded typed failures | unit/type | `pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/policy.test.ts src/results/errors.test.ts test/runtime-config.test.ts` | task-created plus existing | passed |
| 60-01-02 | 01 | 1 | AUDIT16-01, AUDIT16-02, AUDIT16-03 | T-60-01, T-60-02, T-60-03 | Single-shot terminal branches never return required receipt-less success or retry after signing | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/create-ai.test.ts test/authoritative-runtime-state.test.ts` | existing | passed |
| 60-02-01 | 02 | 2 | AUDIT16-01, AUDIT16-02, AUDIT16-03, AUDIT16-04 | T-60-01..T-60-04 | Checkpoint and agent strictness share safe issuance outcomes and stop before/refrain from repeating provider calls | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/contract/checkpoint.test.ts src/agent/runtime.test.ts src/agent/integration.test.ts` | existing | passed |
| 60-02-02 | 02 | 2 | AUDIT16-01, AUDIT16-02, AUDIT16-03, AUDIT16-04 | T-60-02..T-60-04 | Crew and external audit paths convert signer faults without raw throws or duplicate execution | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/crew/run-crew.test.ts src/agent/crew/crew-integration.test.ts src/audit/external-execution.test.ts` | existing | passed |
| 60-03-01 | 03 | 1 | EVAL16-01 | T-60-05 | Every invalid stage retains a bounded row and contributes to loadFailed | unit/integration | `pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/eval-runner.test.ts` | existing | passed |
| 60-03-02 | 03 | 1 | EVAL16-01, EVAL16-02 | T-60-05, T-60-06 | Exit 2 outranks regression and baseline writer is never called for invalid input | CLI/fault | `pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/eval.test.ts` | existing | passed |
| 60-04-01 | 04 | 2 | PRICE-01, PRICE-02 | T-60-07, T-60-08 | One estimator preserves modern/legacy precedence, partial unknown, and known zero | unit/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/routing/cost.test.ts src/routing/catalog.test.ts` | task-created | passed |
| 60-04-02 | 04 | 2 | PRICE-01, PRICE-02, PRICE-03, PRICE-04 | T-60-07, T-60-08 | Router, plan, policy, and contract use identical estimates and hard-budget unknown rules | unit/property/integration | `pnpm --filter @full-self-browsing/lattice exec vitest run src/routing/router.test.ts src/contract/preflight.test.ts src/plan/plan.test.ts test/planning-execution.test.ts` | existing | passed |
| 60-05-01 | 05 | 2 | PRICE-01, PRICE-02, PRICE-04 | T-60-07, T-60-10 | Provider usage normalization delegates to shared pricing and preserves provider authority | unit/parity | `pnpm --filter @full-self-browsing/lattice exec vitest run src/providers/adapters.test.ts src/providers/anthropic.test.ts src/providers/gemini.test.ts src/providers/parity.test.ts` | existing | passed |
| 60-05-02 | 05 | 3 | PRICE-01, PRICE-02, PRICE-03, PRICE-04 | T-60-08, T-60-09 | Agent and crew hard budgets preflight each call with shared estimate and diagnostics | unit/integration/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/runtime.test.ts src/agent/infra/cost-tracker.test.ts src/agent/crew/run-crew.test.ts src/agent/crew/crew-policy.test.ts` | existing | passed |
| 60-06-01 | 06 | 4 | AUDIT16-01..04, EVAL16-01..02, PRICE-01..04 | T-60-01..T-60-10 | Generated cross-surface matrix proves policy, eval, price, and no-repeat invariants | property/integration/public | `pnpm --filter @full-self-browsing/lattice exec vitest run test/audit-cost-integrity.test.ts test/public-surface.test.ts test/modular-entrypoints.test.ts src/providers/parity.test.ts && pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/eval-runner.test.ts test/eval.test.ts` | task-created plus existing | passed |

## Wave 0 Requirements

Tests first consumed by a task are created inside that task:
`src/receipts/policy.test.ts`, `src/routing/cost.test.ts`, and
`test/audit-cost-integrity.test.ts`. Existing runtime, checkpoint, agent, crew,
provider, preflight, plan, and CLI suites own their adjacent integration cases.

## Phase-Level Gate

After focused Plan 60-06 verification, run the full suite command from Test
Infrastructure. This sits outside task-level sampling because its estimate exceeds the
180-second feedback target.

**Completion evidence (2026-07-16):** focused runtime/public/parity matrix 4
files/96 tests; focused CLI evaluation 2 files/31 tests; runtime package 95
files/1,333 tests; type gate 117 files/1,572 tests with zero type errors plus
`tsd`; CLI package 17 files/175 tests; runtime and CLI builds, typechecks, and
module-boundary check passed.

## Manual-Only Verifications

All Phase 60 behavior has automated verification. No paid provider call is required.

## Validation Sign-Off

- [x] Every task has a deterministic automated command.
- [x] No three-task sampling gap exists.
- [x] Task-created tests are owned before first use.
- [x] Commands are non-watch and bounded.
- [x] Task feedback target is under 180 seconds; full gate is phase-level.
- [x] `nyquist_compliant: true` is set.

**Approval:** passed plan-checker convergence 2026-07-16 (no blockers; bounded integration-plan scope warnings accepted)
