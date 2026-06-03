# Phase 15: Receipt v1.1 Schema Extension + Tripwire Band Pipeline + Lifecycle Events - Context

**Gathered:** 2026-05-31
**Status:** Retroactive backfill (code already on disk via cherry-pick from FSB v0.10.0-attempt-2 Phase 2)
**Mode:** Retro. Originating SHAs: `5c48134`, `2110e19`, `ba6172c`, `00fcfac`, `97836f2`. Cherry-picked onto this phase branch with `git cherry-pick -x` provenance.

<domain>
## Phase Boundary

Receipts gain optional step-marker linked-list threading via a `v1.1` schema extension. Hooks compose through a new priority band pipeline (`SAFETY` > `OBSERVABILITY` > `EXTENSION`) with per-handler matcher regex, race-with-log budget enforcement, frozen contexts, and irreversible mid-session registration freeze. A separate `HookLifecycleEvent` vocabulary names the `BEFORE_PROVIDER` / `AFTER_PROVIDER` / `BEFORE_TOOL` / `AFTER_TOOL` moments that the pipeline orchestrates.

Out of scope: `step.transition` tracer event kind (Phase 16). Checkpoint hook factory (Phase 16). Provider adapter changes (Phase 17). MV3 survivability (Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Receipt Schema (RECEIPT-EXT-01..03)
- `CapabilityReceiptBody.version` widens to literal union `"lattice-receipt/v1" | "lattice-receipt/v1.1"`. Verifier accepts both literals. Existing v1.0 callers and on-disk receipts continue to verify.
- Six new optional top-level fields on `CapabilityReceiptBody`: `stepName`, `stepIndex`, `parentStepName`, `previousStepName`, `sessionId`, `timestamp`. All optional — additive change. JCS canonicalization round-trip preserved (fields in alphabetical order via canonicalize@3.0.0).
- `createReceipt` carries a `hasStepMarker` heuristic: receipts auto-bump to `v1.1` when any step-marker field is populated; otherwise emit `v1`. Authors can keep writing v1 by simply omitting step-marker fields.
- Redaction policy unchanged. Step-marker fields are stable identifiers, not user content.

### Band Pipeline (BAND-01..05) + Lifecycle (LIFECYCLE-01)
- New module `packages/lattice/src/contract/bands.ts` exports `createHookPipeline()` factory.
- Three priority bands: `SAFETY=0`, `OBSERVABILITY=1`, `EXTENSION=2`. Lower number runs first.
- Within a band, registration order is preserved.
- `RegisterOptions.matcher` (optional regex) filters which lifecycle events a handler observes.
- `RegisterOptions.budgetMs` (default 100ms) enforces a race-with-log per-handler timeout. Timeout emits a `HOOK_TIMEOUT` event via the optional `TracerLike` sink. **No-abort `Promise.race` semantics — slow handlers continue running off-thread (CPU-leak risk explicitly accepted per CONTEXT.md D-09).** Trade-off chosen to avoid imposing AbortController on handler authors.
- `pipeline.run()` wraps each handler's context in `structuredClone` + `Object.freeze` so handler mutations do not leak across handlers.
- `pipeline.freeze()` is irreversible. Subsequent `register()` throws `Error` with `name === "PIPELINE_FROZEN"`.
- `HookLifecycleEvent` union exported as a vocabulary structurally separate from `RunEventKind`. Initial members: `BEFORE_PROVIDER`, `AFTER_PROVIDER`, `BEFORE_TOOL`, `AFTER_TOOL`. Phase 3 (Lattice Phase 16) extends `RunEventKind` independently — the two vocabularies do not collide.

### Public Surface (INDEX-02)
- `packages/lattice/src/index.ts` re-exports `createHookPipeline`, `HookPipeline` type, `HookLifecycleEvent` type.
- `packages/lattice/test/public-surface.test.ts` Phase 14 stale assertion flips: `createReceipt is NOT exported` → `createReceipt IS exported`. Now consistent with the actual surface.

### Claude's Discretion
None substantive — every API shape was determined by FSB's v0.10.0-attempt-2 Phase 2 audit + planning. Cherry-pick preserves authorship.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- v1.1 `packages/lattice/src/receipts/{types,receipt,verify}.ts` — receipt mint/verify pipeline. Phase 15 extends each additively without breaking JCS round-trip.
- v1.1 `packages/lattice/src/contract/tripwire.ts` — single-record tripwire evaluator. Phase 15 introduces `bands.ts` as a sibling primitive; tripwire evaluator unchanged.
- `tracing/tracing.ts` (`RunEventKind` union) — Phase 15 does NOT extend; that lands in Phase 16.

### Established Patterns
- Public surface re-exports are flat (one line per source file).
- Tests live alongside source (`bands.test.ts` next to `bands.ts`).
- JCS canonicalization is the structural invariant for receipt evolution — any new field must be optional and alphabetize cleanly.

### Integration Points
- `createHookPipeline` is the foundation Phase 16's `createCheckpointHook` registers on (typically `band: BAND.OBSERVABILITY`).
- `HookLifecycleEvent` union grows in Phase 19 (agent runtime) with iteration-boundary events.

</code_context>

<specifics>
## Specific Ideas

- The `HOOK_TIMEOUT` event is emitted via `TracerLike` (optional), not via `RunEventKind` — keeps the band pipeline runnable without a full tracer.
- `bands.test.ts` covers 20 cases: registration order, band ordering, matcher regex, budget timeout race, frozen context immutability, freeze irreversibility, lifecycle event union exhaustiveness.

</specifics>

<deferred>
## Deferred Ideas

- AbortSignal-based handler cancellation (currently no-abort `Promise.race`).
- Per-band TracerLike override (a single tracer applies to all bands today).
- `register()` returning a deregister handle (currently registrations live for the pipeline's lifetime).

</deferred>
