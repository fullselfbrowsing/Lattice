---
quick_id: 260621-67d
slug: release-v1-5-0-metadata-merge-pr-14-and-
status: complete
completed_at: "2026-06-21T09:35:50.000Z"
---

# Release v1.5.0 Prep Summary

## Outcome

Prepared PR #14 for the v1.5.0 release and hardened the CLI test gate for clean CI runners.

## Changes

* Normalized runtime and CLI package manifests plus generated version files to `1.5.0`.
* Added professional `1.5.0` changelog sections for `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli`.
* Updated release note extraction so package bullets use asterisks.
* Hardened the CLI test script so it builds `@full-self-browsing/lattice` before running CLI tests.
* Kept `.DS_Store` untracked and excluded from commits.

## Verification

* `pnpm -r build`
* `pnpm -r typecheck`
* `pnpm -r test`
* `pnpm -r test:types`
* `pnpm -r lint:packages`
* `node scripts/check-tarball-leak.mjs`
* `node scripts/check-package-version-surfaces.mjs`
* `node scripts/check-core-package-boundary.mjs`
* `node scripts/verify-rename.mjs`
* `node scripts/check-workflow-safety.mjs`
* `node scripts/extract-release-notes.mjs v1.5.0 .context/release-notes-preview.md`
* `pnpm --filter @full-self-browsing/lattice-cli test -- showcase-e2e`

## Operational Follow Up

The merge, tag, release workflow monitoring, GitHub Release verification, and npm package verification continue after PR #14 passes CI.
