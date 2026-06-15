---
phase: 41
slug: gateway-delegation-litellm-gateway-policy
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-15
---

# Phase 41 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 and tsd |
| **Config file** | `packages/lattice/vitest.config.ts`; package `tsd` config in `packages/lattice/package.json` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test -- litellm runtime public-surface` |
| **Full suite command** | `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-package-version-surfaces.mjs && node scripts/check-core-package-boundary.mjs` |
| **Estimated runtime** | ~2-4 minutes |

---

## Sampling Rate

- **After every task commit:** Run the task's `<automated>` command from the active plan.
- **After every plan wave:** Run `pnpm --filter @full-self-browsing/lattice test -- litellm runtime public-surface` plus any package type test named in the plan.
- **Before `$gsd-verify-work`:** Full suite command must be green.
- **Max feedback latency:** One plan task.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | GATE-01/GATE-02 | T-41-01/T-41-04 | Typed gateway metadata, no dependency or secret leak | unit | `pnpm --filter @full-self-browsing/lattice test -- litellm` | yes | pending |
| 41-01-02 | 01 | 1 | GATE-01/GATE-02 | T-41-01/T-41-03 | LiteLLM wrapper delegates and defaults fallback hint false | unit | `pnpm --filter @full-self-browsing/lattice test -- litellm` | yes | pending |
| 41-02-01 | 02 | 2 | GATE-02/GATE-03 | T-41-02/T-41-03 | Plans/events preserve selected route and separate gateway metadata | integration | `pnpm --filter @full-self-browsing/lattice test -- runtime planning-execution` | yes | pending |
| 41-02-02 | 02 | 2 | GATE-03 | T-41-02/T-41-04 | Observed gateway model recorded without changing receipt route | integration | `pnpm --filter @full-self-browsing/lattice test -- runtime planning-execution` | yes | pending |
| 41-03-01 | 03 | 3 | GATE-01/GATE-02/GATE-03 | T-41-05 | Public exports and package type surface are intentional | type/public | `pnpm --filter @full-self-browsing/lattice test -- public-surface && pnpm --filter @full-self-browsing/lattice test:types` | yes | pending |
| 41-03-02 | 03 | 3 | GATE-01/GATE-02/GATE-03 | T-41-01/T-41-05 | Full package gates prove no dependency leakage | full gate | `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-package-version-surfaces.mjs && node scripts/check-core-package-boundary.mjs` | yes | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < one plan task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

