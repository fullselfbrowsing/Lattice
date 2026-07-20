---
phase: 62
slug: operational-interop-and-hygiene
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-17
updated: 2026-07-20
---

# Phase 62 - Validation Strategy

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.5, tsd, Node 24 built-in test runner, GitHub Actions matrix |
| **Config files** | Workspace/package TypeScript and Vitest configs; workflow YAML under `.github/workflows` |
| **Quick run command** | `pnpm check:packed-consumer && node --test scripts/operational-interop.test.mjs scripts/provider-canary.test.mjs scripts/check-comment-hygiene.test.mjs` |
| **Full suite command** | `pnpm typecheck && pnpm lint:packages && pnpm test && pnpm test:types && pnpm build && pnpm check:package-version && pnpm check:tarball && pnpm check:core-boundary && pnpm check:module-boundaries && pnpm check:packed-consumer && pnpm check:comment-hygiene && node scripts/check-workflow-safety.mjs && node --test scripts/operational-interop.test.mjs scripts/provider-canary.test.mjs scripts/check-comment-hygiene.test.mjs` |
| **Estimated runtime** | Under 15 minutes locally; Node 26 matrix proof completes in CI |

## Sampling Rate

- After every task: run its focused non-watch command.
- After every plan: run package typecheck plus all operational tests introduced by
  that plan.
- Before phase verification: run the complete package, distribution, workflow,
  hygiene, and version gate.
- Maximum focused feedback latency: 240 seconds; package packing and the full suite are
  reserved for their owning tasks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---:|---|---|---|---|---|---|---|
| 62-01-01 | 01 | 1 | OPSVAL-01 | T-62-01, T-62-03 | Real runtime/CLI tarballs install without workspace resolution and exercise root/modular/runtime/receipt/CLI surfaces | packed integration/public | `pnpm check:packed-consumer && pnpm check:module-boundaries` | existing, expanded in task | passed |
| 62-01-02 | 01 | 1 | OPSVAL-01 | T-62-02 | CI declares Node 24/26 packed matrix and release reruns the same gate on Node 24 | static workflow/fault | `node --test scripts/operational-interop.test.mjs && node scripts/check-workflow-safety.mjs` | task-created | passed |
| 62-02-01 | 02 | 2 | OPSVAL-02, OPSVAL-03 | Each public adapter serializes the same explicit positive output cap in streaming/non-streaming requests | unit/property | `pnpm --filter @full-self-browsing/lattice exec vitest run src/providers/adapters.test.ts src/providers/anthropic.test.ts src/providers/gemini.test.ts && pnpm --filter @full-self-browsing/lattice typecheck` | existing | passed |
| 62-02-02 | 02 | 2 | OPSVAL-02, OPSVAL-03 | Packed local-server canaries prove one call, bounded usage/cost/time, strict standard receipt, tri-state status, and sanitized evidence | packed integration/fault | `node --test scripts/provider-canary.test.mjs && node scripts/check-workflow-safety.mjs` | task-created | passed |
| 62-03-01 | 03 | 3 | HYGIENE-02 | Scanner distinguishes comments from strings and reports deterministic diagnostics only for reasoned production scope | unit/property/fault | `node --test scripts/check-comment-hygiene.test.mjs` | task-created | passed |
| 62-03-02 | 03 | 3 | HYGIENE-01, HYGIENE-02 | Production scan has zero findings while runtime behavior and durable rationale remain intact | static/package regression | `pnpm check:comment-hygiene && pnpm typecheck && pnpm test` | task-created plus existing | passed |
| 62-04-01 | 04 | 4 | DOC16-01 | Every current document and version surface describes the same SDK 1.6.0, receipt v1.4, Node 24/26, bridge, and operational gates | static/packed/version | `node --test scripts/operational-interop.test.mjs && pnpm check:package-version && pnpm check:packed-consumer` | task-created plus existing | passed |
| 62-04-02 | 04 | 4 | OPSVAL-01..03, DOC16-01, HYGIENE-01..02 | Complete release candidate passes package, type, distribution, workflow, canary, hygiene, and docs/version gates | full regression/release | full suite command from Test Infrastructure | existing plus task-created | passed |

## Wave 0 Requirements

`scripts/operational-interop.test.mjs`, `scripts/provider-canary.test.mjs`, and
`scripts/check-comment-hygiene.test.mjs` are created inside their owning plans before
first use. Existing provider, modular, package, receipt, and CLI suites own adjacent
coverage. No framework installation is required.

## Phase-Level Gate

After Plan 62-04 focused verification, run the full suite command from Test
Infrastructure. CI supplies the independent Node 26 packed run. A live credentialed
canary is operational evidence and is intentionally not a deterministic pull-request
gate; local fake-server tests prove its complete request/result contract.

## Manual-Only Verifications

All code paths and workflow configuration have automated verification. Protected
environment policy and secret values are repository administration state; the
maintainer runbook identifies those prerequisites without claiming they are testable
from an unprivileged checkout.

## Validation Sign-Off

- [x] Every task has a deterministic automated command.
- [x] No three-task sampling gap exists.
- [x] Task-created tests are owned before first use.
- [x] Commands are non-watch and bounded.
- [x] Live provider spend is outside PR validation and protected by deterministic
  local protocol tests.
- [x] `nyquist_compliant: true` is set.

**Approval:** approved inline for plan-checker convergence on 2026-07-17; all
execution evidence passed by 2026-07-20.
