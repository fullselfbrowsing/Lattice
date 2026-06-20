# Phase 55 Research: Compatibility and Dogfood Validation

## Question

How should v1.5.0 prove modular adoption works for real consumers?

## Current Implementation

- `packages/lattice/package.json` declares root `engines.node: >=24` and per-subpath compatibility metadata under `lattice.modules`.
- Node 20-compatible labels currently include audit, context, artifacts, routing, tools, eval, and core.
- Agent surface is labelled `node24-runtime`; providers and storage are `adapter-specific`.
- A local Node 20 binary exists at `~/.nvm/versions/node/v20.18.2/bin/node`.
- `docs/modular-entrypoints.md` describes provider-only, audit-only, core-only, tools/MCP-only, and agent opt-in paths, but does not yet include an explicit eval-only section or executable Node 20 proof.
- Existing adapter tests already prove native tools and structured output mechanics, but not under a GitFly-style host-owned execution fixture.
- Existing external-audit tests already prove receipt/replay wrapping, but not with feature-flag dogfood metadata.

## Implementation Direction

1. Add `scripts/check-lattice-node20-modular.mjs`.
   - Build remains a separate command.
   - The script locates Node 20 via `NODE20_BIN`, current `node` when major 20, `node20`, or common nvm paths.
   - The child Node 20 process imports built node20-compatible subpaths and checks representative exports.
   - The parent script verifies package metadata still marks the root/full runtime as Node 24.
2. Add `packages/lattice/test/gitfly-dogfood.test.ts`.
   - Provider-only fixture calls `createOpenAICompatibleProvider(...).execute()` directly with a GitFly-style model ID, native tool definition, native tool choice, and native structured output.
   - Audit fixture calls `createExternalExecutionAudit` around a host-owned external response and verifies receipt + replay.
3. Add `examples/external-consumer/index.mjs`.
   - Import from built modular dist subpaths.
   - Demonstrate core-only preparation, tools/MCP artifact conversion, audit wrapping, and eval-only scoring.
4. Update root scripts and docs.
   - Add `check:node20-modules`.
   - Add `example:external-consumer`.
   - Expand `docs/modular-entrypoints.md` with context/artifact/routing/eval/full-runtime adoption notes and validation commands.

## Boundary Rules

- Do not make the full package claim Node 20 support.
- Do not run hosted providers or require private GitFly credentials.
- Do not mutate external repositories.
- Keep provider-only dogfood separate from `createAI()` and `runAgent()`.

## Validation Architecture

- `pnpm --filter @full-self-browsing/lattice test -- gitfly-dogfood`
- `pnpm --filter @full-self-browsing/lattice build`
- `node scripts/check-lattice-node20-modular.mjs`
- `node examples/external-consumer/index.mjs`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice test:types`
- `pnpm --filter @full-self-browsing/lattice lint:packages`

## Risks

- Machines without Node 20 need a clear failure and `NODE20_BIN` override path.
- Importing built dist in examples requires a prior build; root scripts should handle that.
- Adding docs without executable checks would not close the dogfood requirement; keep tests/scripts first.

## Out of Scope

- Hosted GitFly migration.
- Full runtime Node 20 support.
- CI workflow changes.
