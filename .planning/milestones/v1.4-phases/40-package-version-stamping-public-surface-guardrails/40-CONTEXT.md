# Phase 40: Package Version Stamping + Public-Surface Guardrails - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 40 fixes the known package identity defect reported by FSB dogfooding and installs release guardrails before v1.4 adds more public APIs. In scope: runtime/CLI version stamping, tests that prove the version surfaces report package metadata, public root-export guardrails, and package/tarball checks that keep optional v1.4 integrations out of the core runtime dependency tree. Out of scope: adding the v1.4 provider, streaming, multimodal, receipt, OTel, eval, or showcase capabilities themselves.

</domain>

<decisions>
## Implementation Decisions

### Version Metadata
- **D-01:** `latticeVersion` represents the `@full-self-browsing/lattice` runtime package version; the CLI help banner represents the `@full-self-browsing/lattice-cli` package version. Do not make the CLI banner import the runtime's `latticeVersion`, even though current releases version both packages together.
- **D-02:** Version values should be stamped from each package's own `package.json` during the build/prebuild path into a generated or otherwise build-derived module. Avoid runtime filesystem reads of `package.json`; the published packages ship `dist` only, and the CLI bundles the runtime.
- **D-03:** The hardcoded `"0.0.0"` scaffold must stop being a valid source/test expectation for active package code. It may remain only in archived planning/history docs.
- **D-04:** Add tests at the source/build/package boundary: runtime import of `latticeVersion`, CLI `--help` banner, and a packed-tarball smoke that compares the exposed version to the packed package manifest version.

### Public Root Export Guardrail
- **D-05:** Add a central root-export inventory guard for runtime value exports. Any new value exported from `packages/lattice/src/index.ts` should require an intentional update to the inventory plus a targeted smoke assertion.
- **D-06:** Type-only public exports still need `tsd` coverage through the package entrypoint. A value export inventory is not enough because TypeScript-only exports disappear at runtime.
- **D-07:** Keep the public API named-export only. Do not add a default export or new deep-import paths as part of this phase.
- **D-08:** For every new v1.4 public export, the expected evidence is: runtime public-surface smoke where applicable, package type test coverage, `publint`, and `@arethetypeswrong/cli`.

### Package Leak and Tarball Policy
- **D-09:** Core runtime dependencies should stay allowlisted. Optional v1.4 integrations belong in optional packages, host-app docs, peer dependencies, or CLI/dev-only paths unless the integration is explicitly part of the always-on runtime surface.
- **D-10:** Extend existing package hygiene gates rather than inventing a parallel release system. `scripts/check-tarball-leak.mjs`, `scripts/verify-rename.mjs`, and `packages/lattice/scripts/check-cli-deps.mjs` are the preferred starting points.
- **D-11:** Add a built-dist/package-manifest scan that catches accidental runtime imports or manifest dependencies for optional provider, observability, realtime, and native packages.
- **D-12:** Local `pnpm pack` tarball validation should be part of Phase 40's gate. Full FSB-via-npm dogfood remains Phase 49 scope, but Phase 40 should catch the version-stamping class of bug without waiting for a downstream product.

### the agent's Discretion
- The planner may choose the exact stamping mechanism: generated `version.ts`, generated JSON module, or a simple prebuild script, as long as it is deterministic, package-local, and verified from packed artifacts.
- The planner may choose whether the root-export inventory lives in an inline snapshot, explicit sorted array, or small helper script. Prefer the simplest form that produces a clear diff when the public surface changes.
- The planner may split package hygiene checks between existing scripts and new scripts if that keeps failure messages understandable.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` — Phase 40 goal, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` — PKG-01, PKG-02, and PKG-03.
- `.planning/PROJECT.md` — v1.4 scope, FSB-via-npm validation decision, and Phase 40 package identity rationale.
- `.planning/STATE.md` — current blocker/concern notes naming the hardcoded version files.
- `.planning/research/SUMMARY.md` — VAL-1 pitfall and Phase 40 ordering rationale.

### Package Identity
- `packages/lattice/package.json` — runtime package metadata, scripts, dependencies, exports, and published files.
- `packages/lattice-cli/package.json` — CLI package metadata, bin, scripts, dependencies, exports, and published files.
- `packages/lattice/src/version.ts` — current runtime hardcoded `"0.0.0"` source.
- `packages/lattice-cli/src/version.ts` — current CLI hardcoded `"0.0.0"` source.
- `packages/lattice-cli/src/cli.ts` — CLI banner reads `latticeCliVersion` through citty metadata.

### Public Surface and Package Tests
- `packages/lattice/src/index.ts` — runtime public root export surface.
- `packages/lattice/test/public-surface.test.ts` — existing incremental public-surface smoke tests.
- `packages/lattice/test/scaffold.test.ts` — current scaffold version assertion that must be replaced.
- `packages/lattice/test-d/index.test-d.ts` — current package-entrypoint type assertions, including the old literal `"0.0.0"` expectation.
- `packages/lattice/test-d/package-types.test-d.ts` — consumer-visible package type import coverage.
- `packages/lattice-cli/test/cli.test.ts` — CLI bin smoke tests; extend help assertion to cover the stamped version.

### Existing Hygiene Gates
- `scripts/check-tarball-leak.mjs` — existing `pnpm pack` manifest inspection for publishable packages.
- `scripts/verify-rename.mjs` — source import/name audit pattern to reuse for fast hygiene checks.
- `packages/lattice/scripts/check-cli-deps.mjs` — built runtime dist scan that prevents CLI-only deps from leaking into core.
- `.github/workflows/ci.yml` — existing PR-time build, typecheck, test, test:types, and lint:packages gate.
- `.github/workflows/release.yml` — existing release-time package linting gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/version.ts` and `packages/lattice-cli/src/version.ts` are already isolated version modules; they are good stamping targets.
- `packages/lattice-cli/src/cli.ts` already centralizes the banner version through `latticeCliVersion`.
- `packages/lattice/test/public-surface.test.ts` already follows the pattern of proving public root exports by importing from `../src/index.js`.
- `packages/lattice/test-d/*.test-d.ts` already validates consumer package declarations through the package entrypoint.
- `scripts/check-tarball-leak.mjs` already knows how to pack both publishable packages and inspect in-tarball manifests.
- `packages/lattice/scripts/check-cli-deps.mjs` already scans built runtime output for forbidden imports.

### Established Patterns
- Package shape validation is already `pnpm build && publint && attw --pack . --profile esm-only` per package.
- Runtime package dependencies are intentionally small: `@standard-schema/spec`, `canonicalize`, and `mime`.
- The CLI package builds as a standalone bundled binary and uses `noExternal` for `@full-self-browsing/*`, which is why CLI and runtime version identity should be stamped separately.
- Public-surface tests are organized by historical phase, but Phase 40 should add a cross-cutting inventory guard so future exports cannot silently skip a root-surface assertion.

### Integration Points
- Runtime stamping connects to `packages/lattice/src/version.ts`, `packages/lattice/src/index.ts`, `packages/lattice/test/scaffold.test.ts`, and `packages/lattice/test-d/index.test-d.ts`.
- CLI stamping connects to `packages/lattice-cli/src/version.ts`, `packages/lattice-cli/src/cli.ts`, and `packages/lattice-cli/test/cli.test.ts`.
- Tarball validation connects to `scripts/check-tarball-leak.mjs` or a sibling script and should run after build/pack.
- Optional dependency leakage checks connect to `packages/lattice/package.json`, built `packages/lattice/dist`, and the lint/package gate.

</code_context>

<specifics>
## Specific Ideas

- FSB dogfooding confirmed `@full-self-browsing/lattice@1.3.0` installs and runs from npm, but `import { latticeVersion } from "lattice"` returned `"0.0.0"` and `lattice --help` printed `(lattice v0.0.0)`.
- The desired behavior is package-truthful identity: the built/published runtime and CLI should report the version in their own package manifests.
- The first v1.4 phase should catch this entire class of issue locally before FSB-via-npm validation reruns in Phase 49.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 40 scope.

</deferred>

---

*Phase: 40-package-version-stamping-public-surface-guardrails*
*Context gathered: 2026-06-15*
