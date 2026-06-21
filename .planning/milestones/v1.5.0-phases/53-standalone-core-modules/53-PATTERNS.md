# Phase 53 Patterns: Standalone Core Modules

## Analog Files

| File | Pattern to Reuse |
|------|------------------|
| `packages/lattice/src/runtime/create-ai.ts` | Existing non-public composition order: prepare artifacts, merge policy, route, pack context, create plan. |
| `packages/lattice/src/audit/external-execution.ts` | Additive helper shape returning a structured record and re-exported public types from a facade. |
| `packages/lattice/src/context/context-pack.ts` | Pure helper style with no runtime or provider side effects. |
| `packages/lattice/src/storage/memory.ts` | Store-assisted fingerprint and storage-ref enrichment. |
| `packages/lattice/test-d/modular-entrypoints.test-d.ts` | Public subpath type-surface coverage. |
| `scripts/check-lattice-module-boundaries.mjs` | Import graph enforcement for core facade. |

## Code Patterns

### Runtime Composition Order

`runtime/create-ai.ts` builds plans in this order:

1. prepare artifacts,
2. create catalog and route decision,
3. build context pack,
4. create execution plan,
5. emit inspectable events.

Phase 53 should reuse steps 2 through 4 and replace runtime-only work with a returned `PreparedCoreRun` record.

### Additive Public Helper

`audit/external-execution.ts` is the closest precedent: it accepts externally owned execution data and returns Lattice artifacts without taking over execution. Phase 53 should mirror that style for non-executing preparation.

### Facade Exports

Phase 50 facades are explicit re-exports. Add `prepareCoreRun` to `src/core.ts` and keep `src/context.ts`, `src/artifacts.ts`, `src/routing.ts`, and `src/storage.ts` focused on their existing narrower modules.

## Files Expected to Change

- `packages/lattice/src/core/standalone.ts`
- `packages/lattice/src/core/standalone.test.ts`
- `packages/lattice/src/core.ts`
- `packages/lattice/test-d/modular-entrypoints.test-d.ts`
- `docs/modular-entrypoints.md`

## Files Expected to Read During Execution

- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/context/context-pack.ts`
- `packages/lattice/src/artifacts/artifact.ts`
- `packages/lattice/src/routing/router.ts`
- `packages/lattice/src/storage/memory.ts`
- `packages/lattice/src/storage/fingerprint.ts`
- `packages/lattice/src/plan/plan.ts`
- `scripts/check-lattice-module-boundaries.mjs`
