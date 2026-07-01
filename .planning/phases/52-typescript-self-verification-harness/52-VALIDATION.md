---
phase: 52
slug: typescript-self-verification-harness
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-01
---

# Phase 52 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (identical to every other workspace package, catalog-pinned) |
| **Config file** | `conformance/verify-ts/vitest.config.ts` (new — mirrors `conformance/generate/vitest.config.ts` exactly) |
| **Quick run command** | `pnpm --filter @lattice-conformance/verify-ts test` |
| **Full suite command** | `pnpm -r test` (runs every workspace package's test script, including this new one, automatically — no root-script change needed) |
| **Estimated runtime** | ~2 seconds (sibling `conformance/generate` 28-test suite completes in 1.16s; this suite covers 12 vectors × up to 4 assertions each with comparably lightweight crypto operations) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @lattice-conformance/verify-ts test`
- **After every plan wave:** Run `pnpm -r build && pnpm -r typecheck && pnpm -r test`
- **Before `/gsd-verify-work`:** `pnpm check:tarball && pnpm check:core-boundary` green, plus full `pnpm -r test` green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 52-01-01 | 01 | 1 | TSCONF-02 | — | New package scaffolding is private/unpublished | smoke | `pnpm -r list --depth -1 \| grep verify-ts` shows `(PRIVATE)` | ❌ W0 | ⬜ pending |
| 52-01-02 | 01 | 1 | TSCONF-01 | T-52-01 | Manifest self-check fails build on tampered vector | unit (vitest) | `pnpm --filter @lattice-conformance/verify-ts test -- manifest.test.ts` | ❌ W0 | ⬜ pending |
| 52-01-03 | 01 | 1 | TSCONF-01 | T-52-02 / T-52-03 | Positive vectors re-derive canonical bytes/PAE/signature/verdict byte-identically | unit (vitest) | `pnpm --filter @lattice-conformance/verify-ts test -- positive.test.ts` | ❌ W0 | ⬜ pending |
| 52-01-04 | 01 | 1 | TSCONF-01 | T-52-02 | Negative vectors assert exact `VerifyErrorKind` match | unit (vitest) | `pnpm --filter @lattice-conformance/verify-ts test -- negative.test.ts` | ❌ W0 | ⬜ pending |
| 52-01-05 | 01 | 1 | TSCONF-02 | — | tarball-leak and core-boundary checks remain green with no modification | smoke (shell) | `pnpm check:tarball && pnpm check:core-boundary` | ✅ (both scripts exist today and pass) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `conformance/verify-ts/package.json` — new package manifest (`@lattice-conformance/verify-ts`, private)
- [ ] `conformance/verify-ts/tsconfig.json` — new, extends `../../tsconfig.base.json`
- [ ] `conformance/verify-ts/vitest.config.ts` — new, mirrors `conformance/generate/vitest.config.ts`
- [ ] `conformance/verify-ts/src/manifest.test.ts` — covers TSCONF-01 manifest self-check clause
- [ ] `conformance/verify-ts/src/positive.test.ts` — covers TSCONF-01 4-step re-derivation
- [ ] `conformance/verify-ts/src/negative.test.ts` — covers TSCONF-01 verdict-only assertion
- `pnpm-workspace.yaml` — no change needed; `conformance/*` glob already covers the new directory.

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
