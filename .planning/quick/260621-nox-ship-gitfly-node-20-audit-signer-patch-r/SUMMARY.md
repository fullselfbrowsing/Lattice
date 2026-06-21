---
quick_id: 260621-nox
slug: ship-gitfly-node-20-audit-signer-patch-r
status: complete
completed: 2026-06-21
---

# Summary

## Outcome

* Added `createNobleEd25519Signer` for Node 20 audit signing paths.
* Exported the helper from the package root and `@full-self-browsing/lattice/audit`.
* Moved `@noble/ed25519` to runtime dependencies because the helper is a public package surface.
* Added behavior, public surface, and modular entrypoint type tests.
* Documented the Node 20 signing path for audit only consumers.
* Prepared `1.5.1` package metadata, generated version files, changelog sections, and release notes preview.

## Validation

* `pnpm install --frozen-lockfile`
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
* `node scripts/extract-release-notes.mjs v1.5.1 .context/release-notes-v1.5.1-preview.md`
* `node scripts/check-lattice-node20-modular.mjs`

The first recursive test attempt was terminated after a local `tsdown` rebuild stalled. The exact runtime build was rerun successfully by itself, then `pnpm -r test` was rerun and passed cleanly.
