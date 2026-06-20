# Phase 53: Standalone Core Modules - Context

**Gathered:** 2026-06-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the non-execution core useful to applications that already own model execution. This phase exposes inspectable preparation helpers for context packing, artifacts, routing, and storage without invoking providers, `createAI()`, `runAgent()`, or crew runtime code.

</domain>

<decisions>
## Implementation Decisions

### Public Core Shape
- Additive APIs only: preserve existing `buildContextPack`, artifact builders, routing, storage, and root exports.
- Prefer one small standalone helper that prepares a non-executing core record from task, artifacts, outputs, policy, catalog, optional session, and optional storage.
- The helper should return existing plan-compatible shapes where possible: artifact refs, context pack, route decision, storage refs, hashes, warnings, and an execution-plan-shaped inspectable record.
- Export the helper from `@full-self-browsing/lattice/core` and the specific module facades that naturally own it; do not create a new package.

### Artifact and Storage Behavior
- Artifact constructors remain the primary user-facing builders; this phase should not replace them with a second artifact DSL.
- Storage should stay optional. If a store is provided, the standalone helper persists artifacts and returns stored refs; otherwise it only computes refs and hashes where possible.
- Fingerprints should be attached or reported using existing `fingerprintArtifactValue` behavior, not a new hash algorithm.
- Storage adapters must remain usable directly through `@full-self-browsing/lattice/storage` without `createAI()`.

### Routing and Context Behavior
- Context packing should be directly invokable over artifacts and optional session turns, preserving current token-budget and warning behavior.
- Deterministic routing remains advisory: the standalone helper may produce a selected route and fallback chain but must never execute a provider.
- Capability negotiation helpers stay in routing/provider facades; this phase should only compose them when no provider call is required.
- Standalone records should include enough stable metadata to feed receipts, audit helpers, debugging, and later dogfood fixtures.

### Boundary Enforcement
- Core/context/artifacts/routing/storage tests must prove the new standalone path does not import `src/agent/**`.
- Avoid provider adapter imports in standalone core implementation. Type-only provider contract imports are acceptable if already part of the core facade.
- Do not alter `ai.run()` or `ai.runAgent()` runtime behavior in this phase.
- Keep Node 20-compatible module promises intact; Node filesystem store remains adapter-specific.

### the agent's Discretion
The agent may choose exact helper names, result field names, and file placement as long as the result closes CORE-01 through CORE-05, stays additive, and follows the Phase 50 module-boundary contract.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/context/context-pack.ts` already exposes `buildContextPack`, token estimates, and artifact-ref extraction without runtime dependencies.
- `packages/lattice/src/artifacts/artifact.ts` already exposes artifact constructors, refs, storage refs, fingerprints, privacy labels, and lineage.
- `packages/lattice/src/routing/router.ts` already exposes deterministic route decisions over a capability catalog.
- `packages/lattice/src/storage/{memory,local,fingerprint}.ts` already provide standalone artifact stores and SHA-256 value fingerprints.
- `packages/lattice/src/plan/plan.ts` already has `createExecutionPlan` and inspectable plan/stage types.

### Established Patterns
- Public facades are thin explicit re-export files at `packages/lattice/src/{core,context,artifacts,routing,storage}.ts`.
- Type tests for modular entrypoints live in `packages/lattice/test-d/modular-entrypoints.test-d.ts`.
- Runtime/source tests use Vitest under `packages/lattice/src/**` or `packages/lattice/test/**`.
- `scripts/check-lattice-module-boundaries.mjs` validates core/provider/audit entrypoints do not reach agent modules.

### Integration Points
- Any new helper must be exported from the relevant facade files and, if root public, added to public-surface expectations.
- Docs in `docs/modular-entrypoints.md` should show the standalone core adoption path.
- Verification should include module-boundary checks, typecheck, type tests, and focused runtime tests for the new helper.

</code_context>

<specifics>
## Specific Ideas

- GitFly-style consumers should be able to ask Lattice, "Given these artifacts and outputs, what would Lattice pack, store, route, and record?" while keeping their own executor.
- The output record should be useful as input context for Phase 52 external audit helpers and Phase 55 dogfood examples.
- Keep the implementation narrow enough that Phase 54 can still handle MCP/tool optionality separately.

</specifics>

<deferred>
## Deferred Ideas

- Node 20 matrix execution is deferred to Phase 55.
- MCP resources/prompts/tool-result artifact conversion is deferred to Phase 54.
- GitFly and generic external-consumer examples are deferred to Phase 55.
- Splitting standalone modules into separately published packages remains out of scope.

</deferred>
