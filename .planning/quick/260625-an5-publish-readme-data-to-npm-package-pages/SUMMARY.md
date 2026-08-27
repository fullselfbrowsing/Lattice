---
status: complete
completed: 2026-06-25
task: Publish README data to npm package pages for runtime and CLI packages
---

# Summary

Added package-local npm README files for both publishable packages, copied from `origin/main:README.md` with npm-safe GitHub URLs for local assets and docs links.

Updated both package manifests to explicitly pack `README.md`, and extended `scripts/check-tarball-leak.mjs` to fail when a publishable tarball lacks a non-empty `package/README.md`.

Verification passed:

- `pnpm --filter @full-self-browsing/lattice build`
- `pnpm --filter @full-self-browsing/lattice-cli build`
- `pnpm check:tarball`
- `pnpm --filter @full-self-browsing/lattice pack --dry-run`
- `pnpm --filter @full-self-browsing/lattice-cli pack --dry-run`

Both dry-run package outputs list `README.md`.
