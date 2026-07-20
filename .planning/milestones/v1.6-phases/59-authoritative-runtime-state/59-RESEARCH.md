# Phase 59: Authoritative Runtime State - Research

**Researched:** 2026-07-16
**Domain:** Runtime context materialization, session rehydration, artifact lifecycle persistence, fallback execution, and evidence parity
**Confidence:** HIGH for repository behavior and implementation seams; MEDIUM-HIGH for additive public policy naming

## RESEARCH COMPLETE

Phase 59 is an execution-authority correction. Lattice already plans context,
packages artifacts per provider, stores artifacts in standalone core, and records
session references, but those features do not share a runtime truth. `buildPlan`
classifies a subset, calls the summarizer with every prepared artifact, packages the
full prepared array, and returns that same full array to every fallback attempt. A
successful run then marks persistence completed without calling the configured store
and appends refs that the store may never resolve.

The correction needs no new dependency and no provider/store/session method change.
Keep classification pure, add a materialization boundary that resolves one concrete
projection per route, extract the existing standalone persistence behavior into a
shared lifecycle helper, and make the runtime consume the projection everywhere after
planning. Typed failures and additive plan records make absence, omission, and store
failure inspectable without exposing content.

## Current Repository Findings

### Context classification is advisory

- `context/context-pack.ts` classifies current artifacts as included, summarized, or
  omitted and prior turns as included or archived. It returns IDs and token estimates,
  not concrete content.
- `runtime/create-ai.ts::buildPlan` sends `artifacts.map(toArtifactRef)` to a custom
  summarizer whenever any item needs summarization. The summarizer therefore sees
  included, omitted, and unrelated artifacts, violating CTXAUTH-03.
- Summary refs are written only to `plan.metadata.summaryArtifactIds`. Their values,
  lineage, privacy, and trust are not normalized, and they never replace raw sources in
  a provider request.
- Both initial packaging and the provider request use the full `artifacts` array, so
  omitted and summarized raw values remain outbound. `ContextPack` is descriptive only.
- A session turn contributes only its task token estimate to classification. No prior
  task, input ref, output ref, or session summary is materialized into the request.

### Fallbacks repackage but do not repack

- The fallback loop correctly invokes `packageArtifactsForProvider` for each route,
  but it always packages `built.artifacts` and always attaches the primary route's
  `built.contextPack`.
- `SelectedRoute` omits the capability context window even though `RouteCandidate`
  retains it. Add an optional `contextWindow` field populated by the router so existing
  manually constructed route literals remain source compatible.
- `ProviderAttemptRecord` records provider/model/status/usage only. It cannot prove
  which context pack, packaging plan, artifact IDs, or hashes were used for an attempt.
- Receipt input hashes and lineage roots use `built.artifacts`, not the request
  projection. Events expose primary-plan counts without a projection identifier.

### Configured storage is dormant

- `normalizeConfig` preserves `LatticeConfig.storage`, but `create-ai.ts` never reads
  `normalized.storage`.
- A successful run unconditionally marks `stage:persistence` completed. This is false
  both when no store exists and when provider output refs have never been written.
- Session append uses `built.artifacts.map(toArtifactRef)` and provider-returned refs.
  Neither set is guaranteed to contain a store-produced key or fingerprint.
- `core/standalone.ts` already implements the useful primitive: `store.put`, preserve
  the returned ref, compute a separate input hash when the store omits a fingerprint,
  and leave the ref itself unmodified. Extract this behavior rather than duplicating it.
- Memory and local stores already separate payload-free refs from `load` values and can
  preserve additive storage-scope metadata without changing methods.

### Failure and redaction surfaces can support the correction

- `LatticeRunError` is a discriminated union and can add `context_materialization` and
  `persistence` failures without changing existing variants.
- `ExecutionPlanStage` already has `skipped` and `failed`, optional metadata, input/output
  artifact IDs, and warnings. It can truthfully report unconfigured, policy-skipped,
  succeeded, and failed persistence.
- `RunFailure` already carries `partialOutputs`, usage, plan, events, and gateway data.
  Output persistence failure can therefore preserve safe post-provider evidence without
  returning success or re-executing a billable call.
- Replay redaction currently walks top-level artifact refs and packaging warnings. New
  attempt projections and storage scope fields must be redacted recursively or limited
  to non-content identifiers.
- OTel has an explicit allowlist path for known metadata and defaults content capture to
  none. Projection IDs/counts/hashes belong on that allowlist; tenant IDs and raw store
  errors do not.

## Recommended Contracts

### Materialized context

Add an internal/public context result shaped around execution facts:

```ts
interface MaterializedContext {
  readonly id: string;
  readonly route: { readonly providerId: string; readonly modelId: string };
  readonly contextPack: ContextPack;
  readonly artifacts: readonly ArtifactInput[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly summaryArtifactRefs: readonly ArtifactRef[];
  readonly inputHashes: readonly string[];
  readonly omittedArtifactIds: readonly string[];
  readonly warnings: readonly string[];
}
```

`artifacts` is the only array provider packaging may consume. `artifactRefs` and
`inputHashes` are derived in the same stable order. A content-independent projection
ID should hash route identity plus ordered artifact ID/fingerprint pairs, allowing
plans and events to correlate without logging values.

### Context planning and session selection

- Add optional `SelectedRoute.contextWindow`; use it to bound the route pack while
  preserving explicit `overrides.tokenBudget` as a stricter ceiling.
- Extend `ContextPackItemPlan` additively with `artifactIds?: readonly string[]` for a
  selected session turn and `summaryArtifactIds?: readonly string[]` after
  materialization. Existing single `artifactId` and `sessionTurnId` remain valid.
- Estimate selected turn cost from the task plus its input/output refs. Materialize the
  task as a generated text artifact with non-secret session/turn provenance, then load
  only the listed refs.
- Default `missingArtifactRef` to `error`. Under explicit `omit`, rewrite the final pack
  so unavailable items appear under `omitted` with a stable reason and warning.
- Include stored session summaries only when the pack explicitly selects their refs.
  Do not load every `SessionRecord.artifactRefs` entry as a shortcut.

### Summary normalization

- Change the summarizer input to concrete `ArtifactInput[]`. Existing implementations
  that accept `ArtifactRef[]` remain structurally valid because inputs extend refs.
- Invoke it only with artifacts named by `contextPack.summarized` for that route.
- Normalize each returned input/ref into a generated summary artifact. If a returned ref
  lacks a value, resolve it through the configured store before use.
- Force lineage parents to the selected source refs, transform kind `generated`, trust
  metadata `model-summary`, and the most restrictive source privacy. Do not permit a
  summarizer to downgrade those fields.
- With no summarizer, move would-be summary sources to omitted. A configured summarizer
  exception or unresolvable output is a typed pre-provider failure.

### Persistence policy and lifecycle

Use additive flat policy fields to match the existing `PolicySpec` style:

```ts
type MissingArtifactRefPolicy = "error" | "omit";
type ArtifactRetentionPolicy = "none" | "session" | "durable";

interface PolicySpec {
  readonly tenantId?: string;
  readonly retention?: ArtifactRetentionPolicy;
  readonly missingArtifactRef?: MissingArtifactRefPolicy;
}
```

Extend `ArtifactStorageRef` and session records with optional tenant/retention scope.
Unscoped legacy records remain usable by unscoped runs only. Before every load, require
configured store ID, tenant equality, retention permission, and an eligible privacy
label. This follows the established security principle that ownership must be checked
at the data-access boundary, not inferred from an object ID.

Lifecycle order:

1. Apply transforms and tools.
2. Compute effective privacy as the most restrictive declared artifact/run value.
3. Persist value-bearing prepared artifacts when a store is configured and retention is
   not `none`; preserve returned refs exactly.
4. Route and classify context using prepared facts.
5. Load selected stored refs and create/persist summaries.
6. Package and execute only the materialized set.
7. Persist value-bearing provider outputs; preserve already stored provider refs.
8. Append only store-returned or deliberately ephemeral refs to the scoped session.

No store means persistence `skipped`. `retention: "none"` means `skipped` with policy
metadata. A configured permitted write failure is typed and terminal for that lifecycle
operation. A post-provider output write failure returns failure with partial outputs and
usage and must not activate provider fallback.

### Plan and evidence parity

Add a `ContextProjectionPlan` containing projection ID, route, ordered artifact refs,
summary refs, omitted IDs, and input hashes. Keep `ExecutionPlan.artifactRefs` as declared
source history for compatibility; add `contextProjection` as the provider-visible truth.
Attach context, packaging, and projection plans to each `ProviderAttemptRecord`.

Before each adapter call, update the plan's top-level context, packaging, and projection
to that attempt and pass that exact plan in `ProviderRunRequest`. Provider-attempt and
context-packed events include projection ID plus counts and hashes. Terminal receipts use
the last provider-visible projection for provider, validation, tripwire, and success
branches; a no-route or pre-provider failure has an empty provider-visible input set.

## Security and Failure Model

| Ref | Threat | Severity | Required mitigation |
|-----|--------|----------|---------------------|
| T-59-01 | Omitted or raw summarized content remains in an adapter request | Critical | materializer owns the only post-plan artifact array; capture request sentinels across sync/stream paths |
| T-59-02 | Summarizer sees unselected or restricted content | High | pass exact summarized IDs only; enforce privacy before invocation; normalize privacy/lineage after return |
| T-59-03 | Fallback reuses a primary context pack that exceeds or differs from its route | High | rebuild pack, materialization, packaging, hashes, and attempt evidence per route |
| T-59-04 | Session ID acts as authorization and crosses tenant scope | Critical | compare tenant scope before store/session load; scoped run rejects unscoped or mismatched records |
| T-59-05 | Missing stored content is silently dropped while plan says included | High | fail-closed default; explicit omit rewrites final plan before provider execution |
| T-59-06 | Runtime fabricates persistence completion or storage metadata | High | store-returned refs are authoritative; unconfigured/policy skip and write failures are explicit stage outcomes |
| T-59-07 | Provider succeeds but output persistence fails and runtime returns success or retries | High | typed post-provider persistence failure with partial evidence; no fallback after billable successful response |
| T-59-08 | Projection telemetry leaks tenant IDs, signed URLs, payloads, or raw store errors | High | emit bounded IDs/counts/hashes/failure kinds only; redaction and OTel tests reject content |
| T-59-09 | `ai.plan()` and `ai.run()` compute different context truth | Medium | share preparation/materialization helper and compare equivalent plan/run projection membership |

## Validation Architecture

Use existing Vitest, fast-check, adapter spies, memory/local stores, and package type
tests. No Wave 0 framework or dependency is required.

Fast materializer feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/context/materialize.test.ts`

Persistence/session feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/runtime/artifact-lifecycle.test.ts test/artifact-storage.test.ts test/context-provider-replay-tools.test.ts`

Runtime authority feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run test/authoritative-runtime-state.test.ts test/planning-execution.test.ts src/runtime/create-ai.test.ts`

Public/replay/telemetry feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run test/public-surface.test.ts test/modular-entrypoints.test.ts src/observability/otel.test.ts test/context-provider-replay-tools.test.ts`

Final phase gate:

`pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm check:module-boundaries`

Property tests should cover stable deduplication, privacy monotonicity, omission
invariants, projection hash determinism, and the rule that every attempt's packaging IDs
are exactly its projection IDs minus explicitly blocked transport failures.

## Planning Implications

Use five sequential plans because the main runtime integration has a large behavioral
surface and each plan needs a reviewable invariant:

1. Add policy/scope/failure/projection types and extract a shared store-returned
   lifecycle helper from standalone core.
2. Upgrade pure context classification and implement selected-only materialization,
   summary normalization, missing-ref behavior, and session rehydration.
3. Replace `buildPlan` preparation with real input/tool/transform persistence and a
   primary authoritative projection shared by `ai.plan()` and `ai.run()`.
4. Move materialization inside every fallback attempt; bind provider request, attempt
   plan, events, hashes, and receipts to that projection.
5. Persist provider outputs, append scoped store-returned session refs, enforce typed
   post-provider failures, harden replay/OTel/public exports, and run the full closure
   matrix.

Plans are intentionally sequential: materialization requires lifecycle primitives;
runtime preparation requires materialization; fallback/evidence requires the prepared
projection; output/session closure depends on the final attempt semantics.

## Sources

### Repository
- `.planning/phases/59-authoritative-runtime-state/59-CONTEXT.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/FEATURES.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/context/context-pack.ts`
- `packages/lattice/src/core/standalone.ts`
- `packages/lattice/src/storage/{storage,memory,local}.ts`
- `packages/lattice/src/sessions/session.ts`
- `packages/lattice/src/providers/{provider,packaging}.ts`
- `packages/lattice/src/plan/plan.ts`
- `packages/lattice/src/replay/replay.ts`
- `packages/lattice/src/observability/otel.ts`

### External Primary Guidance
- OWASP Authorization Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- OWASP Multi-Tenant Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html
- OpenTelemetry handling sensitive data: https://opentelemetry.io/docs/security/handling-sensitive-data/
- OpenTelemetry attribute requirement levels: https://opentelemetry.io/docs/specs/semconv/general/attribute-requirement-level/

---

*Research completed: 2026-07-16*
*Ready for planning: yes*
