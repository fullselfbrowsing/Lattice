# Phase 59: Authoritative Runtime State - Code Patterns

**Mapped:** 2026-07-16
**Purpose:** Pin planned files to existing Lattice analogues and data flow before execution.

## Data Flow

```text
RunIntent
  -> prepareArtifacts (transforms + tool results)
  -> persistArtifactLifecycle (store-returned refs or explicit skip/failure)
  -> routeDeterministically
  -> buildContextPack(route)
  -> materializeContext(pack, session, store, policy, summarizer)
  -> packageArtifactsForProvider(materialized.artifacts, route)
  -> ProviderRunRequest(materialized.artifacts + exact attempt plan)
  -> persist provider outputs
  -> append scoped store-returned session refs
  -> receipt/events/replay from the same projection
```

## File Map

| Target | Role | Closest Existing Pattern | Constraint |
|--------|------|--------------------------|------------|
| `src/runtime/artifact-lifecycle.ts` | Shared effectful persistence kernel | `src/core/standalone.ts::prepareArtifact` | Preserve store-returned ref; compute hash separately; typed outcome instead of swallowed error |
| `src/context/materialize.ts` | Effectful plan-to-projection boundary | `src/replay/materialize.ts` | Verify policy/scope before `load`; never load omitted or archived refs |
| `src/runtime/prepare-run.ts` | Shared pre-provider preparation | `src/runtime/create-ai.ts::buildPlan` | Keep `ai.plan` and `ai.run` on one helper; provider execution remains outside |
| `src/context/context-pack.ts` | Pure membership classifier | Existing `buildContextPack` | IDs and estimates only; no store or summarizer effects |
| `src/plan/plan.ts` | Additive evidence records | Existing optional `context` and `providerPackaging` fields | Preserve `artifactRefs` declaration history; add provider-visible projection separately |
| `src/results/errors.ts` | Typed materialization/persistence failures | `TripwireViolationError`, `NoContractMatchError` | Discriminated kinds with bounded messages and no raw cause objects |
| `src/sessions/session.ts` | Scoped stored continuity | Existing additive optional session fields | No required `SessionStore` method; clone and branch preserve new scope fields |
| `src/replay/replay.ts` | Evidence redaction | Existing `redactPlan`/`redactArtifactRef` | Walk attempt projection refs and warnings; redact tenant/signed URL metadata |
| `src/observability/otel.ts` | Bounded projection attributes | Existing explicit known-key mapping | Add projection ID/count/failure kind only; never tenant IDs or artifact values |

## Reusable Patterns

### Store-Returned Reference Authority

`prepareCoreRun` already separates the public ref from the independently derived input
hash. The shared helper should return both rather than merging a computed fingerprint or
invented key into the store result:

```ts
const ref = await storage.put(input);
const inputHash = ref.fingerprint?.value
  ?? input.fingerprint?.value
  ?? (await fingerprintArtifactValue(input.value))?.value;
```

### Exact Optional Properties

The repo consistently uses conditional spreads under `exactOptionalPropertyTypes`:

```ts
return {
  ...base,
  ...(value !== undefined ? { value } : {}),
};
```

New policy, projection, session scope, and failure fields must follow this style; do not
write optional properties with explicit `undefined`.

### Plan Stage Transitions

Use nested `markStage` calls and `withPlanStatus` so the returned plan is immutable and
every terminal result contains the stage transition that actually occurred. Extend
`withPlanStatus` for additive `context`, `providerPackaging`, and `contextProjection`
updates rather than mutating a plan object.

### Provider Boundary

`packageArtifactsForProvider` already returns both an explanatory plan and derived
packaging refs. The invariant is entirely at its call site:

```ts
const packaging = packageArtifactsForProvider({
  artifacts: materialized.artifacts,
  route,
  policy,
});
```

The request must reuse that same `materialized.artifacts`; adapters should not interpret
context decisions independently.

### Typed Failures

Follow existing result unions: internal errors may retain a cause for control flow, but
public `LatticeRunError` variants expose a stable `kind`, safe message, operation, and
optional artifact/store identifier. `isTerminal` should include pre-provider context and
post-provider persistence failures because fallback cannot safely repair either without
changing the authoritative plan or replaying a successful billable call.

## Test Patterns

- Adapter-spy tests in `test/planning-execution.test.ts` inspect the exact request and
  are the correct place for primary/fallback projection equality.
- Fault stores in `src/core/standalone.test.ts` provide the shape for deterministic put
  and load failures.
- Sentinel artifacts should place a unique secret in omitted, archived, raw summarized,
  and cross-tenant records, then assert absence from serialized requests, events, replay,
  and OTel attributes.
- fast-check properties should compare ordered projection IDs against pack membership and
  prove privacy never becomes less restrictive across summary normalization.

## Avoid

- Do not keep both original and materialized artifact arrays in the provider-loop scope.
- Do not load all `session.artifactRefs` and filter afterward.
- Do not use plan metadata as an untyped substitute for projection records.
- Do not make `ArtifactStore` or `SessionStore` methods required or provider-specific.
- Do not include raw store exceptions, tenant IDs, artifact values, URLs, or summary text
  in event metadata.
