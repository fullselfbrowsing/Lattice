---
phase: 53
slug: standalone-core-modules
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 53 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest + tsd |
| Config file | `packages/lattice/vitest.config.ts`, `packages/lattice/package.json` `tsd` block |
| Quick run command | `pnpm --filter @full-self-browsing/lattice test -- standalone` |
| Full suite command | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test:types && node scripts/check-lattice-module-boundaries.mjs` |
| Estimated runtime | ~90 seconds |

## Sampling Rate

- After source/test edits: run `pnpm --filter @full-self-browsing/lattice test -- standalone`.
- After export/type-test edits: run `pnpm --filter @full-self-browsing/lattice test:types`.
- Before phase closeout: run typecheck, focused tests, type tests, boundary checks, and package lint.
- Max feedback latency: one task.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | CORE-01, CORE-02, CORE-03, CORE-04, CORE-05 | T-53-01 | No provider or agent execution is invoked from standalone preparation. | unit | `pnpm --filter @full-self-browsing/lattice test -- standalone` | W0 | pending |
| 53-01-02 | 01 | 1 | CORE-01, CORE-02, CORE-03, CORE-04, CORE-05 | T-53-02 | Public core facade remains agent-free and type-safe. | type/boundary | `pnpm --filter @full-self-browsing/lattice test:types && node scripts/check-lattice-module-boundaries.mjs` | W0 | pending |
| 53-01-03 | 01 | 1 | CORE-05 | T-53-03 | Docs describe non-executing core preparation without claiming provider execution. | docs/package | `pnpm --filter @full-self-browsing/lattice lint:packages` | W0 | pending |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have automated verification.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency under 90 seconds for focused checks.

**Approval:** approved 2026-06-20
