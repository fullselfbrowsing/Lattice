---
phase: 40-package-version-stamping-public-surface-guardrails
status: passed
score: 7/7
requirements_verified: [PKG-01, PKG-02, PKG-03]
human_verification: []
gaps: []
completed: 2026-06-15
---

# Phase 40 Verification

**Verdict:** Passed. Phase 40 achieved the package version stamping and public-surface guardrail goal.

## Must-Haves

| Check | Status | Evidence |
|---|---|---|
| Runtime `latticeVersion` reports package metadata, not `0.0.0` | PASS | `packages/lattice/src/version.ts` is generated from `packages/lattice/package.json`; scaffold test compares `latticeVersion` to `pkg.version`. |
| CLI help banner reports CLI package metadata, not `0.0.0` | PASS | `packages/lattice-cli/src/version.ts` is generated from `packages/lattice-cli/package.json`; CLI smoke strips ANSI and matches `(lattice v${pkg.version})`. |
| Packed runtime and CLI artifacts preserve package-truthful versions | PASS | `scripts/check-package-version-surfaces.mjs` packs/extracts both packages and imports/runs packed `dist` artifacts against in-tarball manifests. |
| Runtime root value exports are exact-inventory guarded | PASS | `EXPECTED_PUBLIC_VALUE_EXPORTS` in `packages/lattice/test/public-surface.test.ts` compares sorted `Object.keys(await import("../src/index.js"))` and rejects a default export. |
| Package-entrypoint type smoke remains active | PASS | `packages/lattice/test-d/index.test-d.ts` documents the Phase 40 guard and asserts `latticeVersion` and `createAI` through the package root. |
| Optional v1.4 integrations stay out of core runtime manifest and dist | PASS | `scripts/check-core-package-boundary.mjs` checks forbidden packages in `dependencies`, `peerDependencies`, `optionalDependencies`, and built `dist` imports including subpaths. |
| CI and release enforce the new gates without replacing existing gates | PASS | `.github/workflows/ci.yml` and `.github/workflows/release.yml` run package version and core boundary audits while preserving build/typecheck/test/tsd/lint/tarball/rename/workflow safety steps. |

## Requirements

| Requirement | Status | Evidence |
|---|---|---|
| PKG-01 | PASS | Plans 40-01 and 40-03; source, CLI, and packed-artifact checks passed. |
| PKG-02 | PASS | Plan 40-02 inventory and `tsd` guard; CI still runs `publint` and `attw`. |
| PKG-03 | PASS | Plan 40-03 boundary script and workflow gates; final full gate passed. |

## Automated Verification

Final gate passed after the code-review hardening fix:

```bash
pnpm -r build
pnpm -r typecheck
pnpm -r test
pnpm -r test:types
pnpm -r lint:packages
node scripts/check-tarball-leak.mjs
node scripts/verify-rename.mjs
node scripts/check-package-version-surfaces.mjs
node scripts/check-core-package-boundary.mjs
```

Observed suite totals in the final run:

- Runtime tests: 69 files, 909 tests passed.
- CLI tests: 13 files, 144 tests passed.
- Runtime typecheck/type tests: 87 files, 1091 tests passed, no type errors.
- Package lint: `publint` clean for both packages; `attw --profile esm-only` completed with the existing ignored CJS-to-ESM warning.
- Tarball/name/version/boundary scripts all reported OK.

## Review And Drift Gates

- Code review: `40-REVIEW.md` status `clean`; one boundary scan gap was fixed in `c7ab52e`.
- Schema drift: no drift detected.
- Codebase drift: skipped with reason `no-structure-md`, non-blocking.
- Regression gate: no prior `*-VERIFICATION.md` files exist in the active v1.4 phase tree, so there were no prior phase test files to run separately.

## Human Verification

None required.

## Gaps

None.
