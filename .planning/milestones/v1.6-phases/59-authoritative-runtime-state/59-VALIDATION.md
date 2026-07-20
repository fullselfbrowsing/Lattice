---
phase: 59
slug: authoritative-runtime-state
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
updated: 2026-07-16
---

# Phase 59 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5, fast-check 4.7.0, tsd |
| **Config file** | `packages/lattice/vitest.config.ts`, `packages/lattice/tsconfig.json`, `packages/lattice/package.json` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/materialize.test.ts test/authoritative-runtime-state.test.ts` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm check:module-boundaries` |
| **Estimated runtime** | Under 6 minutes; phase-level only |

## Sampling Rate

- After every task: run its focused non-watch command.
- After every plan: run package typecheck plus suites touched by that plan.
- Before phase verification: run the complete package build, runtime suite, type tests, and module-boundary gate.
- Maximum task-level feedback latency: 180 seconds; the full six-minute gate is reserved for Plan 09 phase verification.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | CTXAUTH-04, CTXAUTH-06, PERSIST-03, PERSIST-04 | T-59-04, T-59-05 | Additive scope/error contracts and session branches preserve compatible consumers | type/unit | `pnpm --filter @full-self-browsing/lattice exec vitest run src/plan/plan.test.ts src/results/errors.test.ts src/sessions/session.test.ts test/runtime-config.test.ts` | task-created plus existing | passed |
| 59-02-01 | 02 | 2 | PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-04, T-59-06, T-59-07 | Lifecycle and built-in stores preserve exact scoped refs and all truthful outcomes | unit/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/artifact-lifecycle.test.ts src/core/standalone.test.ts test/artifact-storage.test.ts test/artifact-local-store.test.ts` | task-created plus existing | passed |
| 59-03-01 | 03 | 3 | CTXAUTH-01, CTXAUTH-02, CTXAUTH-04, CTXAUTH-05 | T-59-03, T-59-05 | Pure pack names exact current/session membership under route contextWindow | unit/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/context-pack.test.ts src/routing/router.test.ts` | task-created plus existing | passed |
| 59-03-02 | 03 | 3 | CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-04, PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-01, T-59-02, T-59-04, T-59-05 | Materializer loads selected refs only and returns exact summary lifecycle evidence | unit/property/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/materialize.test.ts` | task-created | passed |
| 59-04-01 | 04 | 4 | PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-04, T-59-06 | Shared preparation persists input/derived/tool/summary artifacts after scoped session metadata load | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/prepare-run.test.ts test/context-provider-replay-tools.test.ts` | task-created plus existing | passed |
| 59-04-02 | 04 | 4 | CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-06 | T-59-01, T-59-02, T-59-09 | `ai.plan` and primary sync/stream execution share exact projection membership | integration | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts src/runtime/create-ai.test.ts` | task-created plus existing | passed |
| 59-05-01 | 05 | 5 | CTXAUTH-05, CTXAUTH-06 | T-59-03, T-59-05 | Every fallback reconstructs contextWindow and records its own pack/projection/packaging | integration | `pnpm --filter @full-self-browsing/lattice exec vitest run test/planning-execution.test.ts test/authoritative-runtime-state.test.ts` | existing plus task-created | passed |
| 59-05-02 | 05 | 5 | CTXAUTH-06 | T-59-01, T-59-08 | Request, hashes, receipts, events, and OTel bind to current attempt identity | integration/security | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts src/receipts/receipt.test.ts src/observability/otel.test.ts` | existing plus task-created | passed |
| 59-06-01 | 06 | 6 | PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-06, T-59-07 | Outputs persist before success; post-provider write failure never retries | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts` | task-created | passed |
| 59-06-02 | 06 | 6 | CTXAUTH-04, CTXAUTH-06, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-04, T-59-07 | Sessions append exact scoped refs after one allowed metadata load | integration/fault | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts test/context-provider-replay-tools.test.ts` | task-created plus existing | passed |
| 59-07-01 | 07 | 7 | CTXAUTH-06, PERSIST-02, PERSIST-03 | T-59-08 | Replay recursively redacts top-level and attempt evidence | unit/security | `pnpm --filter @full-self-browsing/lattice exec vitest run src/replay/replay.test.ts test/authoritative-runtime-state.test.ts` | existing plus task-created | passed |
| 59-07-02 | 07 | 7 | CTXAUTH-06, PERSIST-03 | T-59-08 | OTel maps bounded primitive projection/persistence attributes only | unit/security | `pnpm --filter @full-self-browsing/lattice exec vitest run src/observability/otel.test.ts test/authoritative-runtime-state.test.ts` | existing plus task-created | passed |
| 59-08-01 | 08 | 8 | CTXAUTH-01, CTXAUTH-04, CTXAUTH-06, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-09 | Root/modular contracts are additive and old provider/store/session shapes compile | type/public | `pnpm --filter @full-self-browsing/lattice exec vitest run test/public-surface.test.ts test/modular-entrypoints.test.ts && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice build` | existing | passed |
| 59-09-01 | 09 | 9 | CTXAUTH-01..06, PERSIST-01..04 | T-59-01..T-59-09 | Cross-cutting property matrix proves authority, fallback, scope, and lifecycle invariants | property/integration | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts test/context-provider-replay-tools.test.ts test/planning-execution.test.ts src/providers/parity.test.ts` | existing plus task-created | passed |

## Wave 0 Requirements

Tests first consumed by a task are created inside that task:
`src/sessions/session.test.ts`, `src/runtime/artifact-lifecycle.test.ts`,
`src/context/context-pack.test.ts`, `src/context/materialize.test.ts`,
`src/runtime/prepare-run.test.ts`, and `test/authoritative-runtime-state.test.ts`.

## Phase-Level Gate

After focused Plan 09 verification, run the full suite command from Test Infrastructure.
This deliberately sits outside task-level sampling because its estimate exceeds 180 seconds.

**Completion evidence (2026-07-16):** focused matrix 4 files/56 tests; package runtime
91 files/1,209 tests; type gate 112 files/1,435 tests with zero type errors plus
`tsd`; declaration build 110 files; module-boundary check passed.

## Manual-Only Verifications

All Phase 59 behavior has automated verification.

## Validation Sign-Off

- [x] Every task has a deterministic automated command.
- [x] No three-task sampling gap exists.
- [x] Task-created tests are owned before first use.
- [x] Commands are non-watch and bounded.
- [x] Task feedback target is under 180 seconds; full gate is phase-level.
- [x] `nyquist_compliant: true` is set.

**Approval:** revised after two plan-checker passes 2026-07-16
