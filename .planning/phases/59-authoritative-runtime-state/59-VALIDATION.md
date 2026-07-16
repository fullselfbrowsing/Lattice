---
phase: 59
slug: authoritative-runtime-state
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
---

# Phase 59 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5, fast-check 4.7.0, tsd |
| **Config file** | `packages/lattice/vitest.config.ts`, `packages/lattice/tsconfig.json`, `packages/lattice/package.json` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/materialize.test.ts test/authoritative-runtime-state.test.ts` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm check:module-boundaries` |
| **Estimated runtime** | Under 6 minutes |

## Sampling Rate

- After every task: run the focused test command named in the task.
- After every plan: run package typecheck plus all tests touched by that plan.
- Before phase verification: run the complete package build, runtime suite, type tests, and module-boundary gate.
- Maximum task-level feedback latency: 180 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | CTXAUTH-04, CTXAUTH-06, PERSIST-03, PERSIST-04 | T-59-04, T-59-05 | Additive policy, scope, projection, and typed failure contracts preserve current consumers | type/unit | `pnpm --filter @full-self-browsing/lattice exec vitest run src/plan/plan.test.ts src/results/errors.test.ts test/runtime-config.test.ts` | existing | pending |
| 59-01-02 | 01 | 1 | PERSIST-01, PERSIST-02, PERSIST-03 | T-59-06 | Shared lifecycle helper preserves store-returned refs and distinguishes skipped/failed/stored | unit | `pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/artifact-lifecycle.test.ts src/core/standalone.test.ts` | task-created | pending |
| 59-02-01 | 02 | 2 | CTXAUTH-01, CTXAUTH-02, CTXAUTH-04, CTXAUTH-05 | T-59-03, T-59-05 | Pure pack names exact current/session membership and applies route-specific budgets | unit/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/context-pack.test.ts` | task-created | pending |
| 59-02-02 | 02 | 2 | CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-04, PERSIST-04 | T-59-01, T-59-02, T-59-04, T-59-05 | Materializer loads selected refs only, excludes raw summaries, preserves privacy/lineage, and fails closed | unit/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/context/materialize.test.ts` | task-created | pending |
| 59-02-03 | 02 | 2 | CTXAUTH-01, CTXAUTH-06 | T-59-09 | Context module and root/core types expose one compatible materialization contract | type/public | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice exec vitest run test/public-surface.test.ts test/modular-entrypoints.test.ts` | existing | pending |
| 59-03-01 | 03 | 3 | PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-04, T-59-06 | Main runtime persists prepared input/derived/tool artifacts and loads scoped sessions before planning | integration | `pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/prepare-run.test.ts test/context-provider-replay-tools.test.ts` | task-created | pending |
| 59-03-02 | 03 | 3 | CTXAUTH-01, CTXAUTH-02, CTXAUTH-03, CTXAUTH-06 | T-59-01, T-59-02, T-59-09 | `ai.plan` and primary `ai.run` share exact projection membership and sync/stream adapters see no sentinel omissions | integration | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts src/runtime/create-ai.test.ts` | task-created | pending |
| 59-04-01 | 04 | 4 | CTXAUTH-05, CTXAUTH-06 | T-59-03 | Every fallback attempt records and executes its own pack, projection, and packaging | integration | `pnpm --filter @full-self-browsing/lattice exec vitest run test/planning-execution.test.ts test/authoritative-runtime-state.test.ts` | existing plus task-created | pending |
| 59-04-02 | 04 | 4 | CTXAUTH-06 | T-59-01, T-59-08 | Attempt plan, request, hashes, receipts, and events share projection identity without content leakage | integration/security | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts src/receipts/receipt.test.ts src/observability/otel.test.ts` | existing plus task-created | pending |
| 59-05-01 | 05 | 5 | PERSIST-01, PERSIST-02, PERSIST-03, PERSIST-04 | T-59-04, T-59-06, T-59-07 | Outputs persist before success, failures retain partial evidence without retry, sessions store returned scoped refs | integration/fault injection | `pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts test/context-provider-replay-tools.test.ts` | existing plus task-created | pending |
| 59-05-02 | 05 | 5 | CTXAUTH-06, PERSIST-02, PERSIST-03 | T-59-08 | Replay, OTel, public exports, and type consumers expose bounded projection/persistence evidence | unit/type | `pnpm --filter @full-self-browsing/lattice exec vitest run src/observability/otel.test.ts test/public-surface.test.ts test/modular-entrypoints.test.ts && pnpm --filter @full-self-browsing/lattice test:types` | existing | pending |
| 59-05-03 | 05 | 5 | CTXAUTH-01..06, PERSIST-01..04 | T-59-01..T-59-09 | Complete runtime and package gates prove authority and lifecycle invariants | full integration | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm check:module-boundaries` | existing | pending |

## Wave 0 Requirements

Existing test infrastructure covers the phase. Tests first consumed by a task are created
inside that task: `src/runtime/artifact-lifecycle.test.ts`,
`src/context/context-pack.test.ts`, `src/context/materialize.test.ts`,
`src/runtime/prepare-run.test.ts`, and `test/authoritative-runtime-state.test.ts`.

## Manual-Only Verifications

All phase behavior has automated verification.

## Validation Sign-Off

- [x] Every task has a deterministic automated command.
- [x] No three-task sampling gap exists.
- [x] Task-created tests are owned before first use.
- [x] Commands are non-watch and bounded.
- [x] Task feedback target is under 180 seconds.
- [x] `nyquist_compliant: true` is set.

**Approval:** approved 2026-07-16
