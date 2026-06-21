# Phase 50: Module Boundary Contract - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Define the modular public contract for Lattice before runtime behavior changes. This phase introduces explicit entrypoint boundaries, compatibility labels, and dependency-boundary checks for independently adoptable surfaces, without changing provider execution semantics or rewriting module internals.

</domain>

<decisions>
## Implementation Decisions

### Public Module Shape
- Add documented package subpath facades for provider, audit, context, artifact, routing, MCP/tools, storage, eval, and agent surfaces while preserving the existing root export.
- Treat the new subpaths as the canonical modular adoption contract for v1.5.0; root exports remain backward compatible but are not the only supported API path.
- Keep subpath files thin and explicit: they re-export existing source modules and avoid new orchestration logic in this phase.
- Do not split packages yet. The umbrella package remains the install target until later phases prove separate packages are necessary.

### Compatibility Labels
- Document each public module facade as `node20-compatible`, `node24-runtime`, or `adapter-specific`.
- Use docs and package export metadata as the source of truth for compatibility promises in this phase.
- Classify provider, audit/receipts/replay/eval, context/artifact/routing, MCP/tools, and storage facades individually instead of applying one runtime baseline to the whole package.
- Leave full `createAI()` runtime compatibility at the existing Node 24 baseline unless a later phase removes the runtime-only assumptions.

### Boundary Enforcement
- Add automated checks proving provider-only, audit-only, and core-only entrypoints do not import `src/agent/**` or `src/agent/crew/**`.
- Prefer deterministic import graph scanning over bundle-size heuristics for Phase 50.
- Extend existing package/public-surface tests to protect the subpath contract.
- Keep the check local to source and built package metadata so it can run in CI without external services.

### Adoption Framing
- Optimize the contract for GitFly-style incremental use: applications can adopt provider, audit/replay/eval, context/artifact/routing, tools, or storage pieces without initializing `createAI()` or `runAgent()`.
- Make agent and crew surfaces opt-in, clearly labeled, and isolated from non-agent adoption paths.
- Do not solve native tool-use parity, structured-output parity, or Node 20 test execution in this phase; those are planned follow-on phases.
- Preserve existing public APIs and avoid removing root exports during this milestone.

### the agent's Discretion
The agent may choose exact file names, test grouping, and check script structure as long as the resulting package contract is explicit, traceable to MOD-01 through MOD-04, and compatible with the existing TypeScript/tsdown workflow.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/index.ts` is the current single public export surface and already gathers provider, receipt, replay, tool, storage, runtime, agent, crew, and eval exports.
- `packages/lattice/package.json` currently exposes only `"."` and sets the full package engine to Node `>=24`.
- `packages/lattice/test/public-surface.test.ts` snapshots intentional root runtime exports.
- `packages/lattice/test-d/package-types.test-d.ts` and `packages/lattice/test/public-api.test-d.ts` protect type-level public API behavior.
- `scripts/check-core-package-boundary.mjs` already scans the package manifest and built `dist` files for forbidden heavyweight dependencies.

### Established Patterns
- Public exports are explicit named re-exports, not barrel wildcard exports.
- Package quality checks are Node scripts under `scripts/` or package-local `scripts/`, wired through root/package scripts.
- Tests use Vitest for runtime/source behavior and `tsd` for built package type checks.
- Package build uses `tsdown` with explicit `entry` and declaration output.

### Integration Points
- `packages/lattice/tsdown.config.ts` must include any new public subpath entry files so `dist/*.js` and `dist/*.d.ts` are produced.
- `packages/lattice/package.json` `exports` must list new subpaths and point to the built files.
- Boundary checks should be callable from root `package.json` scripts and package `lint:packages`.
- Public-surface tests should import both source subpath files and package subpaths where practical.

</code_context>

<specifics>
## Specific Ideas

- GitFly dogfood is the motivating adoption target: provider and audit/replay pieces should be usable without adopting Lattice's agent runtime.
- Node 20 compatibility is scoped to modular layers where feasible; full runtime may remain Node 24-only.
- This phase is contract-first; deeper provider execution changes belong to Phase 51.

</specifics>

<deferred>
## Deferred Ideas

- Native provider tool-use and structured-output parity are deferred to Phase 51.
- External execution receipt wrapping and replay APIs are deferred to Phase 52.
- Node 20 CI/runtime validation for compatible modules is deferred to Phase 55.
- Separate package publishing is deferred until the umbrella subpath contract proves insufficient.

</deferred>
