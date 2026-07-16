---
quick_id: 260621-nox
slug: ship-gitfly-node-20-audit-signer-patch-r
status: complete
created: 2026-06-21
---

# Ship GitFly Node 20 audit signer patch release

## Goal

Publish the unpublished GitFly adoption follow-up as a patch release. The release should add a Node 20 friendly audit signing helper, document the adoption path, prepare `1.5.1` package metadata, and open a focused PR for review before merge and tag publishing.

## Scope

* Add and export `createNobleEd25519Signer` for receipt signing paths that need to avoid Node 20 WebCrypto Ed25519 warnings.
* Promote `@noble/ed25519` to a runtime dependency because the new public helper imports it at runtime.
* Add public surface, type, and behavior tests for the new helper.
* Update modular entrypoint docs with the Node 20 signing path.
* Prepare `1.5.1` runtime and CLI release metadata, changelogs, and generated version files.
* Open a draft PR with professional patch notes.

## Verification

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
