---
phase: 40-package-version-stamping-public-surface-guardrails
status: clean
depth: standard
files_reviewed: 14
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
fixed_during_review:
  - commit: c7ab52e
    issue: "Core boundary scan matched exact forbidden package imports but not slash-delimited subpath imports."
completed: 2026-06-15
---

# Phase 40 Code Review

**Result:** Clean after one inline hardening fix.

## Scope

- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `package.json`
- `packages/lattice/package.json`
- `packages/lattice/src/version.ts`
- `packages/lattice/test/scaffold.test.ts`
- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/index.test-d.ts`
- `packages/lattice-cli/package.json`
- `packages/lattice-cli/src/version.ts`
- `packages/lattice-cli/test/cli.test.ts`
- `scripts/stamp-package-version.mjs`
- `scripts/check-package-version-surfaces.mjs`
- `scripts/check-core-package-boundary.mjs`

## Findings

No open findings.

## Fixed During Review

### FR-01: Core boundary scan missed forbidden subpath imports

- **Severity:** Warning before fix
- **File:** `scripts/check-core-package-boundary.mjs`
- **Issue:** The initial forbidden-import regex matched exact package specifiers like `openai` but did not match subpaths such as `openai/resources`.
- **Fix:** `c7ab52e` updates the regex to match the forbidden root package and slash-delimited subpaths.
- **Verification:** `pnpm --filter @full-self-browsing/lattice build && node scripts/check-core-package-boundary.mjs`, then the full Phase 40 gate, both passed.

## Verification Reviewed

- `pnpm -r build`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm -r test:types`
- `pnpm -r lint:packages`
- `node scripts/check-tarball-leak.mjs`
- `node scripts/verify-rename.mjs`
- `node scripts/check-package-version-surfaces.mjs`
- `node scripts/check-core-package-boundary.mjs`

## Residual Risk

- `check-package-version-surfaces.mjs` links local installed dependencies into extracted tarballs to model a real install. That is appropriate for version-surface validation, but it is not intended to prove dependency declaration completeness. Existing `publint`, `attw`, and package lint gates remain responsible for package-shape validation.
