# Phase 55: Compatibility and Dogfood Validation - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove v1.5.0 modular adoption works outside the full Lattice runtime by running compatibility checks, GitFly-style dogfood fixtures, generic external-consumer examples, and adoption-path documentation.

</domain>

<decisions>
## Implementation Decisions

### Node Compatibility Proof
- Add an executable Node 20 modular import smoke that uses a real local Node 20 binary when available and fails if none can be found.
- Scope Node 20 promises to modules labelled `node20-compatible` in `packages/lattice/package.json`.
- Do not import the root package or `@full-self-browsing/lattice/agents` in the Node 20 smoke; the full package remains Node `>=24`.
- Assert Node 24-only module metadata explicitly so the full-runtime baseline stays visible and intentional.

### Dogfood Fixtures
- Add GitFly-style provider-only coverage as a host-owned execution test that calls a provider adapter directly with native tools and structured output.
- Add GitFly-style external-audit coverage that wraps an externally executed request/response with `createExternalExecutionAudit`, feature-flag metadata, receipt verification, and replay.
- Keep dogfood deterministic and offline; no real GitFly checkout or hosted provider credentials are required.
- Use realistic GitFly model IDs and metadata, but do not couple Lattice tests to a private downstream repository.

### External Consumer Examples
- Add a generic external-consumer example that imports built modular subpaths, not workspace source files.
- Demonstrate at least two independent adoption slices: core/context preparation and tools/MCP artifact validation. Include an audit slice if it stays compact.
- Wire a root npm script so the example is easy to execute after build.
- Keep the example output concise and machine-checkable.

### Documentation Closure
- Update modular adoption docs to cover provider-only, audit-only, context/artifact-only, routing advisory, MCP/tools-only, eval-only, and full runtime paths.
- Add compatibility validation notes that explain Node 20 modular proof versus Node 24 full-runtime support.
- Record how to run the new dogfood and compatibility checks.

### the agent's Discretion
The agent may choose exact script names, test filenames, and example structure as long as every Phase 55 requirement has executable evidence and the verification commands are included in the phase summary.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/package.json` already declares `lattice.modules` compatibility labels.
- `docs/modular-entrypoints.md` already lists module facades and adoption examples.
- `scripts/check-lattice-module-boundaries.mjs` already validates modular package exports and non-agent boundaries.
- `scripts/dogfood-fsb-candidate.mjs` demonstrates temp downstream install patterns and read-only downstream checkout handling.
- `packages/lattice/src/providers/adapters.test.ts` already covers provider-only native tools and structured outputs; Phase 55 can add a higher-level GitFly-style dogfood fixture.
- `packages/lattice/src/audit/external-execution.test.ts` already covers external execution audit primitives.

### Established Patterns
- Examples under `examples/*` import from built `packages/lattice/dist/*` outputs.
- Root package scripts build before running examples.
- Vitest integration tests live under `packages/lattice/test/` when they validate public or cross-module behavior.
- Phase verification should include focused tests plus package lint checks.

### Integration Points
- A Node 20 compatibility script should run after `pnpm --filter @full-self-browsing/lattice build`.
- Root `package.json` can expose `check:node20-modules` and `example:external-consumer` scripts.
- Dogfood tests can run through `pnpm --filter @full-self-browsing/lattice test -- gitfly-dogfood`.

</code_context>

<specifics>
## Specific Ideas

- Use `~/.nvm/versions/node/v20.18.2/bin/node` when present; allow `NODE20_BIN` override for CI or other machines.
- The generic external-consumer example should prove modular imports from `core`, `tools`, `audit`, and `eval` can compose without importing the root runtime.
- Keep existing FSB dogfood script untouched unless needed; Phase 55 is about GitFly-style and generic external-consumer fixtures, not mutating FSB.

</specifics>

<deferred>
## Deferred Ideas

- A real GitFly repository integration remains outside this phase unless the downstream repo and approval are provided.
- CI matrix wiring for Node 20 can be added later; this phase adds the executable local smoke.
- Full-runtime Node 20 support remains out of scope.

</deferred>
