# Phase 40: Package Version Stamping + Public-Surface Guardrails - Patterns

**Generated:** 2026-06-15
**Mode:** Inline fallback. Subagents were not spawned because the user did not explicitly request parallel subagent work in this Codex session.

## Scope Surfaces

Phase 40 likely touches:

- `scripts/stamp-package-version.mjs` - new zero-dependency version stamping helper.
- `scripts/check-package-version-surfaces.mjs` - new packed-artifact version smoke.
- `scripts/check-core-package-boundary.mjs` - new core dependency/dist boundary check.
- `packages/lattice/package.json` and `packages/lattice-cli/package.json` - add `stamp:version` and wire source-consuming scripts through it.
- `packages/lattice/src/version.ts` and `packages/lattice-cli/src/version.ts` - generated package-local version modules.
- `packages/lattice/test/scaffold.test.ts`, `packages/lattice/test/public-surface.test.ts`, and `packages/lattice/test-d/index.test-d.ts` - runtime and type guardrails.
- `packages/lattice-cli/test/cli.test.ts` - CLI help version assertion with ANSI stripping.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml` - run new package hygiene scripts.

## Existing Analogs

### Zero-Dependency Node Scripts

Analogs:

- `scripts/check-tarball-leak.mjs`
- `scripts/verify-rename.mjs`
- `packages/lattice/scripts/check-cli-deps.mjs`

Pattern:

- Use only `node:` built-ins.
- Hard-code publishable package lists where the set must change deliberately.
- Print actionable `[script-name] FAIL - ...` messages.
- Exit 1 on violations.

Planner guidance:

- `stamp-package-version.mjs`, `check-package-version-surfaces.mjs`, and `check-core-package-boundary.mjs` should follow this style.
- Do not add a package just to parse args, read JSON, walk files, pack, or strip ANSI.

### Package Shape Gates

Analogs:

- `packages/lattice/package.json` `lint:packages`
- `packages/lattice-cli/package.json` `lint:packages`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`

Pattern:

- CI order is install -> build -> typecheck -> test -> test:types -> lint packages -> tarball audit -> source rename audit -> workflow safety audit.
- Release workflow builds before publishing and validates package linting before `pnpm -r publish --provenance`.

Planner guidance:

- Add new Phase 40 scripts after build/package validation in CI and before publish in release.
- Keep existing gates intact; append checks rather than replacing `publint`, `attw`, `check-tarball-leak`, or `verify-rename`.

### Public Surface Tests

Analog:

- `packages/lattice/test/public-surface.test.ts`

Pattern:

- Runtime public-surface tests import from `../src/index.js`.
- Type-only public-surface tests live in `packages/lattice/test-d/*.test-d.ts` and import from the package entrypoint path.
- Phase additions append focused tests, but there is not yet a central export inventory.

Planner guidance:

- Add an exact sorted `EXPECTED_PUBLIC_VALUE_EXPORTS` inventory test.
- Keep targeted tests for specific behavior. The inventory is a drift detector, not a substitute for behavior tests.

### CLI Bin Smoke Tests

Analog:

- `packages/lattice-cli/test/cli.test.ts`

Pattern:

- Tests build the CLI first through the package `test` script.
- Tests run `node dist/cli.js`.
- Existing tests assert help output and subcommand failure contracts.

Planner guidance:

- Add `NO_COLOR=1` but do not rely on it. Strip ANSI escapes before matching the banner.
- Match the CLI package version from `packages/lattice-cli/package.json`.

## Data Flow

1. Changesets or manual package metadata updates change `packages/*/package.json` versions.
2. `stamp:version` reads the package-local manifest and writes `src/version.ts`.
3. Build/test/typecheck consume `src/version.ts`.
4. `pnpm pack` includes `dist` built from the stamped source.
5. Tarball version smoke compares runtime/CLI exposed version values against the in-tarball manifest.

## Risks to Preserve in Plans

- Do not hand-edit package version numbers as a release mechanism; Changesets still owns manifest/changelog version bumps.
- Do not make the CLI import runtime `latticeVersion`.
- Do not add runtime filesystem reads of `package.json`.
- Do not add new production dependencies to core for this phase.
- Do not let future root value exports bypass the inventory diff.

