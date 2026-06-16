---
phase: 42
slug: openrouter-fallback-capability-catalog-refresh
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-15
last_audited: 2026-06-16
---

# Phase 42 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + tsd |
| **Config file** | `packages/lattice/vitest.config.ts`, `packages/lattice/tsconfig.json`, `packages/lattice/package.json` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test -- openrouter create-ai planning-execution capabilities-classifier capabilities-registry public-surface` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice lint:packages && node scripts/check-core-package-boundary.mjs && node scripts/check-tarball-leak.mjs && node scripts/refresh-model-registry.mjs --check` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's listed `pnpm --filter @full-self-browsing/lattice test -- ...` command or `typecheck` command.
- **After every plan wave:** Run `pnpm --filter @full-self-browsing/lattice test -- openrouter create-ai planning-execution capabilities-classifier capabilities-registry public-surface`.
- **Before `$gsd-verify-work`:** Full suite must be green.
- **Max feedback latency:** 180 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 42-01-01 | 01 | 1 | ORCAT-01 | T-42-01 | No OpenRouter SDK dependency or raw body escape hatch | unit/type | `pnpm --filter @full-self-browsing/lattice test -- openrouter && pnpm --filter @full-self-browsing/lattice test:types` | yes | covered |
| 42-01-02 | 01 | 1 | ORCAT-01 | T-42-02 | `models` is emitted only when fallback models are configured | unit | `pnpm --filter @full-self-browsing/lattice test -- openrouter` | yes | covered |
| 42-02-01 | 02 | 2 | ORCAT-02, ORCAT-06 | T-42-03 | Observed model is additive and route stays deterministic | unit/integration | `pnpm --filter @full-self-browsing/lattice test -- create-ai planning-execution` | yes | covered |
| 42-02-02 | 02 | 2 | ORCAT-02 | T-42-04 | Receipt signs requested and observed model without leaking raw content | unit | `pnpm --filter @full-self-browsing/lattice test -- create-ai` | yes | covered |
| 42-03-01 | 03 | 1 | ORCAT-03, ORCAT-04 | T-42-05 | Generated registry diffs are deterministic and typed | unit/type | `pnpm --filter @full-self-browsing/lattice test -- capabilities-classifier capabilities-registry && pnpm --filter @full-self-browsing/lattice test:types` | yes | covered |
| 42-03-02 | 03 | 1 | ORCAT-05 | T-42-06 | Scheduled/manual refresh failure is visible but non-flaky | unit/script | `node scripts/refresh-model-registry.mjs --check` | yes | covered |
| 42-03-03 | 03 | 1 | ORCAT-01, ORCAT-04 | T-42-07 | Core package has no OpenRouter SDK or native dependency leak | package | `pnpm --filter @full-self-browsing/lattice lint:packages && node scripts/check-core-package-boundary.mjs && node scripts/check-tarball-leak.mjs` | yes | covered |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification. The scheduled registry refresh PR diff remains an operator review step for unexpected classifier warnings or schema drift, but it is not a substitute for any ORCAT requirement test.

---

## Validation Evidence

| Evidence | Result |
|----------|--------|
| `pnpm --filter @full-self-browsing/lattice test -- openrouter create-ai planning-execution capabilities-classifier capabilities-registry public-surface` | Passed: 70 files / 932 tests |
| `pnpm --filter @full-self-browsing/lattice test:types` | Passed: 88 files / 1122 tests, no type errors |
| `pnpm --filter @full-self-browsing/lattice lint:packages` | Passed: build, publint, attw, and CLI dependency checks |
| `node scripts/check-core-package-boundary.mjs` | Passed: core runtime boundary clean |
| `node scripts/check-tarball-leak.mjs` | Passed: inspected 2 package tarballs |
| `node scripts/refresh-model-registry.mjs --check` | Passed: registry matches upstream; expected unknown-prefix classifier warnings only |

---

## Validation Audit 2026-06-16

| Metric | Count |
|--------|-------|
| Requirements audited | 6 |
| Verification rows audited | 7 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 180s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** verified 2026-06-16
