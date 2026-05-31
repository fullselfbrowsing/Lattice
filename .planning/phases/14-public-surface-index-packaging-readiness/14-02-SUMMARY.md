# Plan 14-02: Resolve catalog: specifiers — SUMMARY

**Completed:** 2026-05-31 (retro; original work landed 2026-05-24)
**Status:** Complete via cherry-pick
**REQ-IDs covered:** PKG-01

## What Was Done

`packages/lattice/package.json` — 6 dependencies flipped from `"catalog:"` to literal semver:

| Field | Before | After |
| --- | --- | --- |
| `dependencies["@standard-schema/spec"]` | `catalog:` | `1.1.0` |
| `dependencies["canonicalize"]` | `catalog:` | `3.0.0` |
| `dependencies["mime"]` | `catalog:` | `4.1.0` |
| `devDependencies["@noble/ed25519"]` | `catalog:` | `3.1.0` |
| `devDependencies["@types/node"]` | `catalog:` | `24.12.2` |
| `devDependencies["zod"]` | `catalog:` | `4.3.6` |

`pnpm-lock.yaml` regenerated: 27 lines removed (catalog indirection), no semantic dep changes.

## How It Was Done

Cherry-picked `22bf986` from FSB v0.10.0-attempt-2 Phase 1 → `48f444d` on this branch. `git cherry-pick -x` provenance preserved.

## Verification

- `git diff main..HEAD -- packages/lattice/package.json` confirms 6 literal substitutions.
- No `catalog:` string in `packages/lattice/package.json`.
- `pnpm-workspace.yaml` itself unchanged (other workspace packages still use `catalog:` — only the package distributed via `file:` deps needs literals).

## Outcome

Plan 14-02 complete. `packages/lattice` is now installable from any npm 11+ consumer via `file:` dependency. PKG-01 closed.
