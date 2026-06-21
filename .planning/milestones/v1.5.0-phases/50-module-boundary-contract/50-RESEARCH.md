# Phase 50: Module Boundary Contract - Research

## Objective

Plan a contract-first modularization phase for the `@full-self-browsing/lattice` package. The implementation should expose independent package subpaths and deterministic boundary checks without changing provider execution behavior.

## Current Shape

- The runtime package currently exposes only `"."` from `packages/lattice/package.json`.
- `packages/lattice/src/index.ts` is the single public barrel and mixes provider, audit, context, artifact, routing, MCP/tools, storage, eval, runtime, agent, and crew exports.
- `packages/lattice/tsdown.config.ts` builds one entry, `src/index.ts`.
- The package-level `engines.node` remains `>=24`, matching the full runtime baseline.
- Existing public-surface protection lives in:
  - `packages/lattice/test/public-surface.test.ts`
  - `packages/lattice/test/public-api.test-d.ts`
  - `packages/lattice/test-d/package-types.test-d.ts`
- Existing package-boundary style lives in `scripts/check-core-package-boundary.mjs`, which scans package metadata and built output for forbidden heavyweight dependencies.

## Recommended Implementation Approach

### 1. Public Subpath Facades

Add explicit source entry files that re-export existing modules:

| Subpath | Source Entry | Purpose |
|---------|--------------|---------|
| `@full-self-browsing/lattice/providers` | `packages/lattice/src/providers.ts` | Provider factories, provider contracts, streaming helpers, provider quirk/capability helpers. |
| `@full-self-browsing/lattice/audit` | `packages/lattice/src/audit.ts` | Receipts, signatures, verification, replay envelopes, materialization, OTel receipt attributes. |
| `@full-self-browsing/lattice/context` | `packages/lattice/src/context.ts` | Context packing and token-estimation helpers. |
| `@full-self-browsing/lattice/artifacts` | `packages/lattice/src/artifacts.ts` | Artifact builders, refs, metadata, lineage, and storage-ref types. |
| `@full-self-browsing/lattice/routing` | `packages/lattice/src/routing.ts` | Deterministic routing, catalogs, policy, capability profiles and negotiation helpers. |
| `@full-self-browsing/lattice/tools` | `packages/lattice/src/tools.ts` | Tool definition/execution and MCP-like import helpers. |
| `@full-self-browsing/lattice/storage` | `packages/lattice/src/storage.ts` | Memory/local artifact stores and storage contract types. |
| `@full-self-browsing/lattice/eval` | `packages/lattice/src/eval.ts` | Eval helpers such as `evalAgentRun`. |
| `@full-self-browsing/lattice/agents` | `packages/lattice/src/agents.ts` | Explicit opt-in agent and crew surface. |
| `@full-self-browsing/lattice/core` | `packages/lattice/src/core.ts` | Core non-agent helpers for artifacts, context, outputs, contract, routing primitives, and storage contracts. |

Keep the root export unchanged for backward compatibility.

### 2. Build and Package Metadata

- Update `packages/lattice/tsdown.config.ts` so each new entry produces `dist/<subpath>.js` and `dist/<subpath>.d.ts`.
- Update `packages/lattice/package.json` `exports` for the subpaths.
- Add a custom `lattice.modules` metadata block documenting the compatibility label and intended scope for each subpath. This gives tooling a machine-readable source of truth while docs give humans a readable table.

### 3. Boundary Checks

Add a deterministic script, for example `scripts/check-lattice-module-boundaries.mjs`, that:

- Parses static imports and re-exports from selected source entry files.
- Recursively follows relative imports inside `packages/lattice/src`.
- Fails if provider-only, audit-only, or core-only entrypoints transitively import `src/agent/**` or `src/agent/crew/**`.
- Fails if required subpath exports or `lattice.modules` labels are missing from `packages/lattice/package.json`.
- Uses only Node standard libraries and source files, so the check can run before or after build.

Provider-only entrypoints should not import agent modules. Audit-only should not import agent modules. Core-only should not import agent modules or provider adapter implementations beyond type-only contract primitives.

### 4. Public-Surface Tests

Add tests that:

- Import the source subpath files directly and assert representative functions exist.
- Assert package metadata includes every required subpath and compatibility label.
- Preserve the existing root export inventory test without adding all subpath-only checks to the root list.

Add `tsd` tests against built package subpaths so consumers can import types and values from each modular path.

### 5. Documentation

Add `docs/modular-entrypoints.md` with:

- A module table for each subpath.
- Compatibility labels: `node20-compatible`, `node24-runtime`, or `adapter-specific`.
- A clear statement that the package-level `engines.node` remains `>=24` until Phase 55 proves Node 20-safe modular test execution.
- Examples for provider-only, audit-only, and core-only imports that do not call `createAI()` or `runAgent()`.

## Risks and Constraints

- `runtime/public-types.ts` re-exports `AI` and `RunIntent`, and `create-ai.ts` references agent types. Core-only subpaths should avoid wholesale re-exporting runtime public types.
- Some provider facades may include first-party provider factories implemented with `fetch`, but they should still avoid agent runtime imports.
- Package export shape changes must be verified by build, `publint`, `attw`, and `tsd` after declarations exist.
- The full package `engines.node` remains `>=24`; per-module Node 20 labels are promises for later compatibility validation, not a package-level engine downgrade in Phase 50.

## Validation Architecture

1. **Source boundary check:** `node scripts/check-lattice-module-boundaries.mjs` verifies required subpaths and import graph boundaries.
2. **Runtime/source public-surface tests:** `pnpm --filter @full-self-browsing/lattice test -- modular` verifies source subpath representatives and package metadata.
3. **Type/package smoke tests:** `pnpm --filter @full-self-browsing/lattice test:types` verifies built declarations and `tsd` package subpath imports.
4. **Package lint:** `pnpm --filter @full-self-browsing/lattice lint:packages` verifies publish shape and dependency boundaries after build.

## Research Complete

Phase 50 should be implemented as one focused plan: add facades/metadata/docs, add boundary checks/tests, then verify build/package/type surfaces.
