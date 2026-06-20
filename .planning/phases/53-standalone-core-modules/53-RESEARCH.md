# Phase 53 Research: Standalone Core Modules

## Question

What needs to be planned so context packing, artifact transport, routing, and storage are independently useful to external AI runtimes?

## Current Implementation

- `context/context-pack.ts` already builds `ContextPack` records from task, artifacts, optional route, optional session, and optional token budget.
- `artifacts/artifact.ts` already exposes artifact constructors, refs, storage refs, fingerprints, privacy labels, and lineage.
- `routing/router.ts` already makes deterministic route decisions from a `CapabilityCatalog` and `RouteRequest` without invoking providers.
- `storage/memory.ts`, `storage/local.ts`, and `storage/fingerprint.ts` already work outside `createAI()`.
- `plan/plan.ts` already creates inspectable execution plans from artifact refs, outputs, route decisions, context plans, warnings, and metadata.
- `runtime/create-ai.ts` composes these pieces inside `buildPlan`; Phase 53 should extract a public non-executing composition path rather than duplicate runtime semantics.

## Implementation Direction

Add a standalone core helper, tentatively `prepareCoreRun`, that:

1. Accepts task, artifacts, outputs, optional catalog, optional policy/provider/model/contract, optional session, optional token budget, optional storage, and optional metadata.
2. Persists artifacts through an optional `ArtifactStore`; when no store is provided, computes available fingerprints and refs in memory.
3. Builds a context pack using prepared artifacts and the advisory selected route when one exists.
4. Runs deterministic routing against the supplied catalog, or an empty catalog when none is supplied.
5. Creates an inspectable `ExecutionPlan` with no provider packaging and no provider attempts beyond the planned/no-route shape already produced by `createExecutionPlan`.
6. Returns a stable `PreparedCoreRun` record containing artifact refs, prepared artifact descriptors, context pack, route decision, plan, input hashes, output names, and warnings.

## Boundary Rules

- Implementation must not import `src/runtime/create-ai.ts`, `src/agent/**`, provider adapters, or crew code.
- Type-only imports from provider contracts are acceptable only through existing route/plan/provider contract shapes.
- The helper should live under `src/core/standalone.ts` and be re-exported by `src/core.ts`.
- The root export may remain unchanged to avoid broadening the beginner API path unnecessarily.

## Validation Architecture

- Unit tests should cover:
  - context packing over direct artifacts with no provider execution,
  - optional storage persistence and returned storage refs,
  - advisory routing with a selected route,
  - no-route records when no catalog is provided,
  - session turns included in standalone context packing,
  - plan metadata marking the record as standalone core preparation.
- Type tests should cover `@full-self-browsing/lattice/core` imports for `prepareCoreRun`, `PrepareCoreRunInput`, and `PreparedCoreRun`.
- Boundary checks should prove the core facade still does not import agent modules.
- Package checks should include typecheck, type tests, and `lint:packages`.

## Risks

- `fingerprintArtifactValue` can return `undefined` for ref-only artifacts with no payload. The result should represent available hashes, not pretend every ref has a payload hash.
- A default empty catalog produces a no-route plan. That is acceptable because context/artifact preparation should be usable without model capabilities.
- Duplicating too much of `runtime/create-ai.ts` would create behavior drift. The helper should compose shared kernels only.

## Out of Scope

- Provider packaging plans remain runtime/provider work.
- Receipt signing stays in Phase 52 audit APIs.
- Node 20 CI matrix validation is Phase 55.
- MCP/tool conversion is Phase 54.
