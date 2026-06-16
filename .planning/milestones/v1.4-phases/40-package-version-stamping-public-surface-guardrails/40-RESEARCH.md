# Phase 40: Package Version Stamping + Public-Surface Guardrails - Research

**Status:** Complete
**Mode:** Inline fallback. Subagents were not spawned because the user did not explicitly request parallel subagent work in this Codex session.
**Phase:** 40 - Package Version Stamping + Public-Surface Guardrails
**Requirements:** PKG-01, PKG-02, PKG-03

## Research Complete

Phase 40 is a release-hygiene and package-contract phase. It should not add v1.4 provider, streaming, OTel, realtime, eval, or receipt behavior. It should fix the package identity surfaces and make later public export additions harder to ship without tests.

## Current State

- `packages/lattice/src/version.ts` exports `latticeVersion = "0.0.0"`.
- `packages/lattice-cli/src/version.ts` exports `latticeCliVersion = "0.0.0"`.
- `packages/lattice-cli/src/cli.ts` passes `latticeCliVersion` into citty command metadata, so `lattice --help` prints the bad value.
- `packages/lattice/test/scaffold.test.ts` still asserts `latticeVersion` is `"0.0.0"`.
- `packages/lattice/test-d/index.test-d.ts` still asserts `expectType<"0.0.0">(latticeVersion)`.
- `packages/lattice-cli/test/cli.test.ts` checks subcommand names in help output but not the banner version.
- Package shape gates already exist: `publint`, `attw --pack . --profile esm-only`, `scripts/check-tarball-leak.mjs`, `scripts/verify-rename.mjs`, and `packages/lattice/scripts/check-cli-deps.mjs`.

## Recommended Implementation Shape

### Version Stamping

Use a small zero-dependency Node script that reads a package-local `package.json` and writes a deterministic TypeScript module:

```text
node ../../scripts/stamp-package-version.mjs --package package.json --out src/version.ts --export latticeVersion
node ../../scripts/stamp-package-version.mjs --package package.json --out src/version.ts --export latticeCliVersion
```

The generated module should contain only a stable header and:

```typescript
export const latticeVersion = "1.3.0";
```

or:

```typescript
export const latticeCliVersion = "1.3.0";
```

Do not read `package.json` at runtime. The published packages ship `files: ["dist"]`, and the CLI bundles the runtime package. Runtime filesystem reads would be fragile and would make package identity depend on install layout.

### Public Surface Guard

Add a deterministic value-export inventory test for `packages/lattice/src/index.ts`:

- Import `../src/index.js`.
- Sort `Object.keys(module)`.
- Compare to a sorted `EXPECTED_PUBLIC_VALUE_EXPORTS` array.
- Include all current 83 value exports.

This catches accidental root-export drift in the PR where it happens. It does not replace targeted runtime smoke tests or `tsd`; future plans adding public types still need package-entrypoint type assertions.

### Package Boundary and Tarball Smoke

Extend package hygiene with two scripts:

1. `scripts/check-package-version-surfaces.mjs`
   - Runs `pnpm pack` for both publishable packages.
   - Extracts each tarball.
   - Imports `package/dist/index.js` for runtime and checks `latticeVersion === package/package.json.version`.
   - Runs `node package/dist/cli.js --help` for CLI, strips ANSI, and checks `(lattice v<package version>)`.

2. `scripts/check-core-package-boundary.mjs`
   - Reads `packages/lattice/package.json`.
   - Fails if forbidden optional integration dependencies appear under `dependencies`, `peerDependencies`, or `optionalDependencies`.
   - Scans built `packages/lattice/dist/**/*.{js,mjs,cjs,d.ts}` for import/require/dynamic-import references to those package names.

## Pitfalls

| Code | Pitfall | Prevention |
|---|---|---|
| PKG-1 | Updating source tests to a fixed literal like `"1.3.0"` creates the next stale test when Changesets bumps versions. | Compare runtime values to each package's `package.json` version in tests; use `expectAssignable<string>` in `tsd`. |
| PKG-2 | CLI imports runtime `latticeVersion`; this works while packages are fixed together but is the wrong identity if CLI packaging diverges. | Stamp runtime and CLI independently from their own package manifests. |
| PKG-3 | `pnpm -r build` stamps versions, but `pnpm -r test` or `pnpm -r typecheck` can read stale generated files after a version bump. | Add `stamp:version` to package scripts and run it before source tests/typechecks that consume `src/version.ts`. |
| PKG-4 | `NO_COLOR=1` does not fully control citty help coloring. | CLI tests and tarball smoke should strip ANSI escapes before matching the help banner. |
| PKG-5 | `publint` and `attw` prove package shape but not package identity values. | Add a tarball version-surface smoke script that imports/runs the packed artifacts. |
| PKG-6 | Guarding only value exports misses type-only exports. | Value inventory is mandatory for runtime exports; package-entrypoint `tsd` assertions remain mandatory for every new type-only export. |
| PKG-7 | Optional v1.4 integrations leak into `@full-self-browsing/lattice` core. | Maintain a core forbidden-dependency list and scan both manifest dependency blocks and built dist imports. |

## Validation Architecture

### Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 4.1.5, tsd 0.33.0, pnpm workspace scripts, Node 24 scripts |
| Config file | `packages/lattice/vitest.config.ts`, `packages/lattice-cli/vitest.config.ts`, package `tsd` config in `packages/lattice/package.json` |
| Quick run command | `pnpm --filter @full-self-browsing/lattice test -- scaffold public-surface && pnpm --filter @full-self-browsing/lattice-cli test -- cli` |
| Full suite command | `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-package-version-surfaces.mjs && node scripts/check-core-package-boundary.mjs` |
| Estimated runtime | about 2-4 minutes full suite |

### Required Checks

- Source runtime version test compares `latticeVersion` to `packages/lattice/package.json` version and rejects `"0.0.0"`.
- CLI help test strips ANSI and matches `(lattice v<packages/lattice-cli/package.json version>)`.
- Package `tsd` imports `latticeVersion` through the package entrypoint and asserts it is assignable to `string`, not a fixed version literal.
- Public value export inventory test contains exactly the 83 current value exports and fails on root export drift.
- Tarball smoke imports/runs packed artifacts and compares exposed versions to in-tarball manifests.
- Core boundary scan fails if optional v1.4 integration packages appear in core runtime manifest dependency blocks or built dist imports.

### Threats

| Threat | Severity | Mitigation |
|---|---|---|
| T-40-01: Published runtime reports stale version after Changesets bump | high | Build/test/typecheck scripts run package-local version stamping; tarball smoke compares dist output to packed manifest. |
| T-40-02: CLI banner reports runtime package version instead of CLI package version | medium | CLI has its own stamped `latticeCliVersion`; CLI tests compare against CLI manifest. |
| T-40-03: Public value export is added without a smoke test | medium | Exact root value-export inventory fails until intentionally updated. |
| T-40-04: Optional integration leaks into core runtime dependencies | high | Manifest allowlist plus built-dist import scan blocks forbidden optional packages. |
| T-40-05: ANSI-colored CLI help hides version assertion failures | low | Strip ANSI before banner regex in both source and tarball smoke tests. |

## Research Flags

- No external package or provider docs are needed for this phase.
- No new runtime dependency is justified.
- The executor should avoid hand-editing package version numbers; Changesets still owns manifest/changelog version bumps.

