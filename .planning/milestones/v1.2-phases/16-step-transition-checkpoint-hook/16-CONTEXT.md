# Phase 16: Step-Transition Tracing + Checkpoint Hook - Context

**Gathered:** 2026-05-31
**Status:** Retroactive backfill (code on disk via cherry-pick from FSB v0.10.0-attempt-2 Phase 3).
**Mode:** Retro. Originating SHAs: `fd254c4`, `a67f476`, `acdbb8a`, `7afd62f`. Cherry-picked with `git cherry-pick -x` provenance.

<domain>
## Phase Boundary

`RunEventKind` admits a single additive literal `"step.transition"`. A new `createCheckpointHook` factory ships as a sibling of Phase 15's `bands.ts`, returning a `HookHandler<CheckpointHookContext>` registrable on a `HookPipeline` (typically `band: BAND.OBSERVABILITY`). Per invocation the handler emits exactly one `step.transition` tracer event AND (when a signer is configured) mints exactly one v1.1 Capability Receipt with step-marker fields populated — the envelope IS the inspector record.

Out of scope: `step.start` / `step.complete` sub-events (deferred indefinitely; the transition marker IS the inspector record). Provider adapters (Phase 17). Survivability (Phase 18).

</domain>

<decisions>
## Implementation Decisions

### Tracing (TRACE-01)
- `RunEventKind` union gains `"step.transition"` as a final, additive literal. Module otherwise byte-frozen.
- `RunEvent` interface unchanged. Step-marker payload rides in `metadata?: Record<string, unknown>`.

### Checkpoint Hook (CHECKPOINT-01..04)
- New module `packages/lattice/src/contract/checkpoint.ts` exports `createCheckpointHook(options)`.
- Factory returns a `HookHandler<CheckpointHookContext>` registrable on Phase 15's `HookPipeline`.
- Per invocation: emit exactly one `step.transition` tracer event (D-10).
- When `options.signer` is provided: mint exactly one v1.1 Capability Receipt with the 6 step-marker fields populated (D-08). Signer failure degrades to `metadata.mintError` without throwing upstream (best-effort mint per D-07).
- Module exports constants `STEP_TRANSITION_EVENT_NAME` (`"step.transition"`) and `DEFAULT_CHECKPOINT_BAND` (`BAND.OBSERVABILITY`).
- Module exports types `CheckpointHookContext` and `CheckpointHookOptions`.

### Public Surface (INDEX-03)
- `createCheckpointHook` value re-exported from `packages/lattice/src/index.ts`.
- Constants `STEP_TRANSITION_EVENT_NAME` and `DEFAULT_CHECKPOINT_BAND` re-exported.
- Type-only re-exports for `CheckpointHookContext` and `CheckpointHookOptions`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 15 `contract/bands.ts` — `createCheckpointHook` registers on this pipeline; uses `BAND.OBSERVABILITY` default.
- Phase 15 v1.1 receipt schema — `createCheckpointHook` mints v1.1 receipts via `createReceipt` from Phase 14's public surface.
- v1.1 `tracing/tracing.ts` `TracerLike` interface — checkpoint hook emits via the optional tracer.

### Established Patterns
- `contract/` modules are siblings with no cross-file types. `checkpoint.ts` is independent of `bands.ts` at the type level; runtime composes them.
- `dist/` gitignored at this baseline; downstream consumers regenerate via tsdown.

</code_context>

<specifics>
## Specific Ideas

- Linked-list threading test: 3-step fake sequence (initial / linear sibling / nested child); verify 3 v1.1 receipts; all 6 step-marker fields round-trip; `previousStepName` chain consistent.
- 15 vitest cases across 7 describe blocks (factory identity / tracer-only mode / signer mode mint+verify / signer-throws fallback / 3-call linked-list threading / HookPipeline integration / tracer-absent mint-still-works).

</specifics>

<deferred>
## Deferred Ideas

- `step.start` / `step.complete` granular events.
- Recovery / eviction-resume markers in `RunEventKind` — closed in Phase 18 (paired with SurvivabilityAdapter).
- OpenTelemetry exporter — Out of scope for v1.x.

</deferred>
