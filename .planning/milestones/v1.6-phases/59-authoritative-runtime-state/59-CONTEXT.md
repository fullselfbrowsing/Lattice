# Phase 59: Authoritative Runtime State - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Mode:** Autonomous discussion - approved milestone defaults

<domain>
## Phase Boundary

Make one policy-checked, route-specific materialized context projection the source
of truth for provider requests, packaging, hashes, receipts, traces, events,
session continuity, and artifact persistence. This phase corrects context,
session, storage, and fallback execution semantics without adding a storage
backend or changing provider adapter methods. Strict receipt issuance, evaluation,
and shared cost policy remain Phase 60 work.

</domain>

<decisions>
## Implementation Decisions

### Route-Specific Context Authority
- **D-01:** `buildContextPack` remains the deterministic classifier. A separate effectful materializer resolves that classification into an immutable provider-visible artifact projection.
- **D-02:** Provider packaging, `ProviderRunRequest.artifacts`, input fingerprints, receipt inputs, lineage roots, attempt records, tracing, and context events must consume the same materialized projection. Original prepared artifacts must not remain reachable by provider execution after materialization.
- **D-03:** Every Lattice fallback route rebuilds its context pack and rematerializes against that route's context limits and capabilities. The top-level plan describes the currently executed or successful route, while each attempt records its own context, packaging, projection membership, and hashes.
- **D-04:** Included current artifacts and selected session content are stable-deduplicated by artifact ID. Archived, omitted, and raw summarized artifacts are excluded by construction, not filtered inside adapters.

### Missing References and Sessions
- **D-05:** The default behavior for an included stored reference that cannot be loaded is `error`, producing a typed pre-provider context-materialization failure. An additive explicit `omit` policy is permitted for compatibility, but it must move the item into the plan's omitted set and emit a non-content warning before execution.
- **D-06:** Selected prior session turns materialize as explicit text context plus their selected input and output artifact references. Archived turns and references from unselected turns are never loaded.
- **D-07:** Session records retain store-returned input and output references, plan IDs, effective tenant scope, privacy, and retention labels. A tenant mismatch or missing tenant scope on a tenant-scoped load fails closed before store access or provider work.
- **D-08:** Existing unscoped session records remain usable only by unscoped runs. Tenant-scoped runs do not silently adopt or rehydrate legacy unscoped history.

### Summary Materialization
- **D-09:** The summarizer receives only concrete artifacts classified as summarized for the current route, never the complete input list or archived/session content that was not selected.
- **D-10:** Every generated summary is normalized as a model-summary artifact whose lineage parents are exactly its selected source artifacts, whose privacy is the most restrictive source privacy, and whose metadata records model-summary trust and source IDs.
- **D-11:** A summarized source is never sent beside its summary. If no summarizer is configured, the source is explicitly omitted with a warning; if a configured summarizer throws or returns an unresolvable summary, materialization fails before the provider call.
- **D-12:** Route-specific rematerialization may reuse an already materialized summary only when its exact source set and summary budget are identical; otherwise it must invoke the summarizer for that attempt.

### Persistence and Policy
- **D-13:** With no artifact store, the persistence stage is `skipped`. With a configured store and permitted retention, lifecycle writes for prepared inputs, transforms, tool results, summaries, and provider outputs are required; a failed write produces a typed persistence failure and the stage is `failed`.
- **D-14:** `retention: "none"` explicitly forbids writes and records a policy-skipped persistence outcome. Configured-store defaults preserve existing behavior by allowing session-scoped persistence unless the caller opts out.
- **D-15:** Tenant, effective privacy, retention, and provider-upload policy are evaluated before persistence and rehydration. `noUpload` continues to govern provider transport; storage retention is controlled separately so local persistence is not accidentally treated as a provider upload.
- **D-16:** Store-returned references and fingerprints are authoritative. Plans, results, and session turns expose those returned values; the runtime must not fabricate a successful storage key, store ID, or fingerprint after `put` returns.
- **D-17:** Reference-only artifacts already carrying a store reference are preserved without a redundant write. They are loaded only when the selected projection requires their value, and the configured store ID plus tenant scope must match before loading.
- **D-18:** A provider success followed by output persistence failure returns a typed run failure with safe partial outputs, usage, attempt evidence, and a failed persistence stage. It is not reported as an ordinary successful persisted run and it does not retry the provider.

### Compatibility and Evidence
- **D-19:** `ArtifactStore`, `SessionStore`, and `ProviderAdapter` gain no new required methods. New policy, session, attempt, materialization, and failure fields are additive.
- **D-20:** `ai.plan()` and `ai.run()` use the same preparation/materialization helpers. Planning retains its existing effectful transform/tool/summarizer behavior; configured persistence during planning is documented by truthful stage metadata rather than a second divergent dry-run implementation.
- **D-21:** Events and OpenTelemetry receive only projection identifiers, counts, artifact IDs, hashes, statuses, and failure classes. Artifact values, signed URLs, tenant secrets, and raw store errors are never added to default telemetry.

### the agent's Discretion
- Exact helper names, internal module boundaries, projection ID construction, and whether persistence reports are represented through typed plan-stage metadata or an additive result field are implementation details, provided the outcomes above are directly inspectable and tested.
- Exact retention and missing-reference field nesting may follow the existing flat `PolicySpec` style if that produces the smallest compatible public surface.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Contract
- `.planning/ROADMAP.md` - Phase 59 goal, dependency, and five success criteria.
- `.planning/REQUIREMENTS.md` - Normative `CTXAUTH-01` through `CTXAUTH-06` and `PERSIST-01` through `PERSIST-04` requirements.
- `.planning/STATE.md` - Phase 59 research flags for tenant/privacy/retention, fallback budgets, summarizer eligibility, and storage failures.
- `.planning/research/SUMMARY.md` - Resolved fail-closed context and configured-persistence decisions.
- `.planning/research/FEATURES.md` - Context/session/persistence behavioral contract and anti-features.
- `.planning/research/ARCHITECTURE.md` - Plan-materialize-package architecture, lifecycle order, compatibility boundary, and test strategy.
- `.planning/research/PITFALLS.md` - Provider-input drift, privacy, tenant, retention, and false-persistence hazards.

### Runtime and Context
- `packages/lattice/src/runtime/create-ai.ts` - Current preparation, routing, one-time context planning, provider fallback loop, session append, receipt inputs, and fictional persistence completion.
- `packages/lattice/src/context/context-pack.ts` - Pure current-artifact and session-turn classification plus summarizer contract.
- `packages/lattice/src/plan/plan.ts` - Execution plan, context item, provider packaging, attempt, and stage contracts.
- `packages/lattice/src/providers/provider.ts` - Provider request boundary whose `artifacts` field becomes authoritative.
- `packages/lattice/src/providers/packaging.ts` - Route-specific transport selection and packaging lineage.
- `packages/lattice/src/tracing/tracing.ts` - Event vocabulary and metadata boundary.

### Artifacts, Storage, and Sessions
- `packages/lattice/src/artifacts/artifact.ts` - Artifact privacy, storage references, values, and public ref conversion.
- `packages/lattice/src/artifacts/lineage.ts` - Parent and transform metadata required for generated summaries.
- `packages/lattice/src/storage/storage.ts` - Existing store contract that must remain source compatible.
- `packages/lattice/src/storage/memory.ts` - In-memory reference/fingerprint behavior and fault-test base.
- `packages/lattice/src/storage/local.ts` - Filesystem reference/payload behavior.
- `packages/lattice/src/core/standalone.ts` - Existing real persistence precedent to share with the main runtime.
- `packages/lattice/src/sessions/session.ts` - Current reference-only turn, summary, branch, and store contracts.
- `packages/lattice/src/policy/policy.ts` - Additive policy integration point for missing refs, tenant, and retention.
- `packages/lattice/src/results/errors.ts` - Typed context and persistence failure integration point.
- `packages/lattice/src/results/result.ts` - Result artifact, partial-output, plan, and usage surface.

### Regression Boundaries
- `packages/lattice/test/context-provider-replay-tools.test.ts` - Existing context, session, tool, transform, and summarizer integration coverage.
- `packages/lattice/test/planning-execution.test.ts` - Existing fallback and route-specific packaging coverage.
- `packages/lattice/src/core/standalone.test.ts` - Storage success/failure and prepared-core compatibility coverage.
- `packages/lattice/test/runtime-config.test.ts` - Normalized store/session configuration boundary.
- `packages/lattice/src/providers/parity.test.ts` - Seven-provider request-shape parity boundary.
- `.planning/phases/58-conformance-and-client-migration/58-06-SUMMARY.md` - Confirmed Phase 58 protocol/client closure and Phase 59 readiness.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildContextPack` already classifies current artifacts and session turns deterministically and can remain pure while a new materializer supplies values.
- `packageArtifactsForProvider` already repackages per route when given the correct artifact set.
- `prepareCoreRun` already performs store-backed input persistence and fingerprint selection; its helper logic can become shared runtime infrastructure.
- `ArtifactStore.load`, `SessionStore.load/appendTurn`, artifact lineage helpers, and memory/local stores provide all required method seams.

### Established Patterns
- Public contracts use additive optional fields, typed discriminated errors, immutable readonly records, exact optional properties, and plan-stage status transitions.
- Artifacts carry independent privacy, fingerprint, storage, and lineage metadata; provider packaging creates derived refs without changing source artifacts.
- Run evidence is accumulated through plans, structured events, normalized usage, artifact hashes, and receipts rather than raw request logging.

### Integration Points
- The current `buildPlan` passes the full prepared artifact array to both summarizer and provider packaging; it is the main authority defect.
- The fallback loop already repackages per route but reuses a primary-route context pack and the full original artifacts; materialization must move inside this loop.
- Success currently marks persistence complete without using `normalized.storage`, then appends potentially fabricated refs to the session.
- Receipt input hashes currently use `built.artifacts`; Phase 59 must switch them to the successful or terminal attempt's materialized projection.

</code_context>

<specifics>
## Specific Ideas

The approved bridge milestone treats inspectability as a data-integrity contract:
the route attempt shown in a plan must be reproducible from the same materialized
artifacts that reached the adapter. Privacy enforcement is therefore structural,
and compatibility is provided through explicit omission policy rather than by
silently sending or dropping unavailable content.

</specifics>

<deferred>
## Deferred Ideas

- Required/best-effort receipt policy and signer failures remain Phase 60.
- Shared route/contract/agent cost estimation remains Phase 60.
- Stable agent iteration identity and crew receipt ownership remain Phase 61.
- New storage backends, hosted tenant authorization, retention deletion services, and a public dry-run mode are outside v1.6 scope.

</deferred>

---

*Phase: 59-authoritative-runtime-state*
*Context gathered: 2026-07-16*
