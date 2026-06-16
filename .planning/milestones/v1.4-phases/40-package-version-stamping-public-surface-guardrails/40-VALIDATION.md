---
phase: 40
slug: package-version-stamping-public-surface-guardrails
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-15
---

# Phase 40 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `40-RESEARCH.md` `## Validation Architecture`.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.5, tsd 0.33.0, pnpm workspace scripts, Node 24 scripts |
| **Config file** | `packages/lattice/vitest.config.ts`, `packages/lattice-cli/vitest.config.ts`, package `tsd` config in `packages/lattice/package.json` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test -- scaffold public-surface && pnpm --filter @full-self-browsing/lattice-cli test -- cli` |
| **Full suite command** | `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-package-version-surfaces.mjs && node scripts/check-core-package-boundary.mjs` |
| **Estimated runtime** | about 2-4 minutes |

## Sampling Rate

- **After every task commit:** Run the targeted package tests for the touched files plus the relevant Node script.
- **After every plan wave:** Run `pnpm -r build && pnpm -r test:types` plus new package hygiene scripts that exist at that point.
- **Before `$gsd-verify-work`:** Run the full suite command above.
- **Max feedback latency:** about 4 minutes.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| 40-01-T1 | 40-01 | 1 | PKG-01 | T-40-01, T-40-02 | Package-local version modules are generated from their own manifests | script + source grep | `pnpm --filter @full-self-browsing/lattice stamp:version && pnpm --filter @full-self-browsing/lattice-cli stamp:version && rg 'export const latticeVersion = "1.3.0";' packages/lattice/src/version.ts && rg 'export const latticeCliVersion = "1.3.0";' packages/lattice-cli/src/version.ts` | yes | pending |
| 40-01-T2 | 40-01 | 1 | PKG-01 | T-40-01, T-40-03 | Runtime source and package type tests no longer encode `"0.0.0"` | vitest + tsd | `pnpm --filter @full-self-browsing/lattice test -- scaffold && pnpm --filter @full-self-browsing/lattice test:types` | yes | pending |
| 40-01-T3 | 40-01 | 1 | PKG-01 | T-40-02, T-40-05 | CLI help reports the CLI package version after ANSI stripping | CLI smoke | `pnpm --filter @full-self-browsing/lattice-cli test -- cli` | yes | pending |
| 40-02-T1 | 40-02 | 2 | PKG-02 | T-40-03 | Root value-export inventory catches every runtime export delta | vitest | `pnpm --filter @full-self-browsing/lattice test -- public-surface` | yes | pending |
| 40-02-T2 | 40-02 | 2 | PKG-02 | T-40-03 | Package-entrypoint type smoke remains the required path for public types | tsd | `pnpm --filter @full-self-browsing/lattice test:types` | yes | pending |
| 40-03-T1 | 40-03 | 3 | PKG-01, PKG-02 | T-40-01, T-40-05 | Packed artifacts expose versions matching packed manifests | tarball smoke | `node scripts/check-package-version-surfaces.mjs` | yes | pending |
| 40-03-T2 | 40-03 | 3 | PKG-03 | T-40-04 | Core runtime manifest and dist do not import optional integration deps | package boundary | `pnpm --filter @full-self-browsing/lattice build && node scripts/check-core-package-boundary.mjs` | yes | pending |
| 40-03-T3 | 40-03 | 3 | PKG-01, PKG-02, PKG-03 | all | Full package gate proves source, types, package shape, tarballs, and boundary checks | full suite | `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-package-version-surfaces.mjs && node scripts/check-core-package-boundary.mjs` | n/a | pending |

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements: Vitest, tsd, publint, attw, pnpm workspace scripts, and Node script gates already exist.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 240s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** draft 2026-06-15

