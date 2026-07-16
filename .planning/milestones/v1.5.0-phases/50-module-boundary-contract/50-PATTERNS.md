# Phase 50: Module Boundary Contract - Pattern Map

## Export and Package Patterns

| Target | Existing Analog | Pattern to Reuse |
|--------|-----------------|------------------|
| Subpath facade files | `packages/lattice/src/index.ts` | Use explicit named re-exports, not wildcard barrels. Preserve type-only exports where possible. |
| Build entries | `packages/lattice/tsdown.config.ts` | Add source entry files to the `entry` array so tsdown emits matching JS and declaration files. |
| Package exports | `packages/lattice/package.json` | Each export maps `types`, `import`, and `default` to `dist/*.d.ts` / `dist/*.js`. |
| Public-surface checks | `packages/lattice/test/public-surface.test.ts` | Assert intentional named exports and representative runtime values. |
| Package-boundary scripts | `scripts/check-core-package-boundary.mjs` | Use Node standard-library filesystem traversal and deterministic regex checks with clear FAIL/OK output. |

## Boundary-Sensitive Files

- `packages/lattice/src/runtime/public-types.ts` should not be used wholesale by `core` because it re-exports `AI` and `RunIntent`.
- `packages/lattice/src/runtime/create-ai.ts` should remain runtime/root only because it references agent and crew types.
- `packages/lattice/src/agent/**` and `packages/lattice/src/agent/crew/**` should only be reachable from `agents` and root entrypoints in this phase.
- `packages/lattice/src/providers/provider.ts` is safe as a provider contract source; provider factory implementations should remain provider-only and not depend on agent modules.

## Test Patterns

- Vitest source tests can import `../src/<subpath>.js` directly before package build.
- `tsd` package tests should import `@full-self-browsing/lattice/<subpath>` after build.
- Script checks should be run by package lint so package metadata and generated `dist` surfaces stay aligned.
