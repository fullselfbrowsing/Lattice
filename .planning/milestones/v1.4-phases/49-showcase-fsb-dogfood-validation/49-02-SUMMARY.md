# Phase 49-02 Summary: Tarball Native/Install-Script Validation

## Status

Complete.

## What Changed

- Extended `scripts/check-tarball-leak.mjs` to inspect packed package manifests for install-time lifecycle scripts:
  - `preinstall`
  - `install`
  - `postinstall`
  - `prepare`
- Added a core-runtime direct-dependency denylist for optional native/heavy integrations such as `sharp`, FFmpeg packages, SQLite packages, PDF/media packages, AWS S3, OTel SDK/exporter packages, and Langfuse packages.
- Kept the existing stale bare `lattice` tarball checks intact.
- Added root script `check:tarball`.

## Verification

- `pnpm check:tarball` — passed, inspected both publishable tarballs.

## Requirement Coverage

- VAL-03 covered for packed-package install scripts and direct optional/native dependency leakage.

