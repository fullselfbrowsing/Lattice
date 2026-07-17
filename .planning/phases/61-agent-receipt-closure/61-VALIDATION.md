---
phase: 61
slug: agent-receipt-closure
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
updated: 2026-07-17
---

# Phase 61 - Validation Strategy

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.5, fast-check 4.7.0, tsd |
| **Config files** | `packages/lattice/vitest.config.ts`, package TypeScript and tsd configs |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/runtime.test.ts src/agent/host-integration.test.ts src/agent/crew/run-crew.test.ts` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm check:module-boundaries` |
| **Estimated runtime** | Under 6 minutes; phase-level only |

## Sampling Rate

- After every task: run its focused non-watch command.
- After every plan: run package typecheck plus the focused files touched by the plan.
- Before phase verification: run the complete package, build, declaration, tsd, and
  module-boundary gate.
- Maximum task feedback latency: 180 seconds; the complete gate is reserved for Plan
  61-04.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---:|---|---|---|---|---|---|---|
| 61-01-01 | 01 | 1 | AGREC-01 | T-61-01, T-61-02 | Every managed completed/denied iteration has one stable ID and at most one exact issued envelope, including reused-pipeline cases | unit/integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/contract/checkpoint.test.ts src/agent/runtime.test.ts src/agent/integration.test.ts` | existing | pending |
| 61-01-02 | 01 | 1 | AGREC-02 | T-61-01 | Success and every non-audit terminal branch attach the exact finalizer envelope without another provider or signer call | unit/integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/runtime.test.ts src/agent/integration.test.ts test/audit-cost-integrity.test.ts` | existing | pending |
| 61-02-01 | 02 | 2 | AGREC-03 | T-61-03, T-61-05 | New snapshots round-trip execution identity, ordered completed records, and exact envelopes; resume appends without reminting | integration/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/host-integration.test.ts src/agent/survivability-integration.test.ts` | existing | pending |
| 61-02-02 | 02 | 2 | AGREC-03 | T-61-04, T-61-08 | Legacy snapshots gain a stable tail identity while corrupt/inconsistent present snapshots stop before transport with bounded diagnostics | fault/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/host-integration.test.ts src/agent/survivability-integration.test.ts src/agent/runtime.test.ts` | existing | pending |
| 61-03-01 | 03 | 2 | AGREC-02, AGREC-04 | T-61-06, T-61-07 | Child summaries and crew collection reuse child terminal result envelopes and CIDs with no completion replacement mint | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/crew/dispatcher.test.ts src/agent/crew/crew-integration.test.ts` | existing | pending |
| 61-03-02 | 03 | 2 | AGREC-04 | T-61-06, T-61-07 | Crew order is root, serial child terminals, parent terminal; per-agent CIDs hash those exact entries and failure caching stays single-shot | integration/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/crew/run-crew.test.ts src/agent/crew/crew-integration.test.ts` | existing | pending |
| 61-04-01 | 04 | 3 | AGREC-01, AGREC-02, AGREC-03, AGREC-04 | T-61-01..T-61-08 | Generated root/modular/packed matrix proves exact envelope identity, resume deduplication, crew order, and additive compatibility | property/integration/public/type | `pnpm --filter @full-self-browsing/lattice exec vitest run test/agent-receipt-closure.test.ts test/public-surface.test.ts test/modular-entrypoints.test.ts && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice exec tsd` | task-created plus existing | pending |

## Wave 0 Requirements

`test/agent-receipt-closure.test.ts` is created inside Plan 61-04 before its first
use. Existing checkpoint, runtime, host, survivability, dispatcher, crew, public,
and declaration suites own their adjacent cases. No framework or fixture bootstrap is
required.

## Phase-Level Gate

After focused Plan 61-04 verification, run the full suite command from Test
Infrastructure. This sits outside task-level sampling because it includes all package
tests, build output, declaration checking, and packed module boundaries.

## Manual-Only Verifications

All Phase 61 behavior has automated verification. No paid provider call or external
host is required.

## Validation Sign-Off

- [x] Every task has a deterministic automated command.
- [x] No three-task sampling gap exists.
- [x] Task-created tests are owned before first use.
- [x] Commands are non-watch and bounded.
- [x] Task feedback target is under 180 seconds; the full gate is phase-level.
- [x] `nyquist_compliant: true` is set.

**Approval:** passed inline plan-checker convergence on 2026-07-17. All four plan
frontmatters and task structures validate, D-61-01 through D-61-17 are represented,
and AGREC-01 through AGREC-04 have executable coverage.
