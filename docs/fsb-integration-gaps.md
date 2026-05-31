# FSB Integration Gaps -- Lattice v1.1 Audit

**Audit date:** 2026-05-24
**Lattice baseline:** v1.1 Capability Receipts (451 tests, fsb-integration-experiments branch)
**FSB target milestone:** v0.10.0 Autopilot via Lattice SDK (attempt 2)
**Audit scope:** 6 surfaces -- Receipts, Tripwires/hooks, Providers, Delegation, MV3-survivability, Observability/step-markers (per FSB Phase 1 CONTEXT.md D-01).
**Severity scheme (D-03):** Blocker (FSB autopilot reliability regression without it) | Important (closes attempt-1 duplication-vs-Lattice pattern) | Nice-to-have (future Lattice-consumer benefit, not FSB-critical).

This doc is the queue for FSB v0.10.0-attempt-2 Phase 2+ Lattice-side work. Each Blocker row maps to a future Lattice-side phase. Each Important row maps to a Lattice-side improvement that closes a pattern FSB built in attempt-1 inside the consumer. Nice-to-have rows are deferred indefinitely unless a future consumer of Lattice surfaces a need.

Ref: FSB v0.10.0-attempt-2 Phase 1.

***

## Receipts

Surface inventory: `lattice/packages/lattice/src/receipts/{receipt,sign,verify,keyset,canonical,envelope,types,redact}.ts`. Public surface re-exports: `createReceipt`, `verifyReceipt`, `createMemoryKeySet`, `createInMemorySigner`, `generateEd25519KeyPairJwk` (from `lattice/packages/lattice/src/index.ts` as of Phase 1 commit). Receipt body schema locked at `lattice-receipt/v1` in `src/receipts/types.ts`.

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Receipts | Capability Receipt mint + verify round-trip via Ed25519 (DSSE v1.0 envelope + JCS canonical form) | Covered | n/a | v1.1 ships this surface end-to-end; FSB's Phase 1 smoke proves the round-trip from a Node-side consumer. |
| Receipts | Step-transition fields on the receipt body (stepName, stepIndex, parentStepName, previousStepName, timestamp per FSB attempt-1 inspector envelope) | Covered | n/a | Phase 2 (FSB v0.10.0-attempt-2) added stepName, stepIndex, parentStepName, previousStepName, timestamp as optional top-level fields on CapabilityReceiptBody; version bumped via literal-union `"lattice-receipt/v1" \| "lattice-receipt/v1.1"`. JCS round-trip unchanged. Redaction policy unchanged (step-marker fields are stable identifiers, not user content). Lattice commit `5c48134`. |
| Receipts | sessionId field on the receipt body (FSB ties step markers to a persistent session across SW eviction) | Covered | n/a | Phase 2 (FSB v0.10.0-attempt-2) added sessionId as optional top-level field on CapabilityReceiptBody, same commit. Lattice commit `5c48134`. |
| Receipts | createReceipt is reachable via the public `lattice` bare specifier | Covered | n/a | Resolved in Phase 1 by re-exporting from `src/index.ts` (D-13 narrowed). |

## Tripwires/hooks

Surface inventory: `lattice/packages/lattice/src/policy/policy.ts` (PolicySpec single-record) + `src/contract/tripwire.ts` (`evaluateTripwires(output, invariants, detectors?)`). Invariant kinds in v1.1: `must-cite`, `field-from-table`, `no-pii`, `matches`. No priority bands. No matcher regex beyond the `matches` invariant. No race-with-log per-handler budget. No frozen contexts. No mid-session registration freeze.

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Tripwires/hooks | Pure tripwire evaluator over invariant set | Covered | n/a | v1.1 ships `evaluateTripwires` -- typed result, never throws. |
| Tripwires/hooks | Priority bands (SAFETY > OBSERVABILITY > EXTENSION) for hook ordering | Covered | n/a | Phase 2 (FSB v0.10.0-attempt-2) added `lattice/packages/lattice/src/contract/bands.ts` exporting createHookPipeline factory. Bands: SAFETY=0, OBSERVABILITY=1, EXTENSION=2. Lower number runs first; within-band registration order preserved. Lattice commit `ba6172c`. |
| Tripwires/hooks | Per-handler matcher regex + race-with-log budget so a slow handler cannot stall the safety band | Covered | n/a | Phase 2 -- bands.ts RegisterOptions.matcher (optional per-handler regex) + RegisterOptions.budgetMs (default 100ms). Timeout emits HOOK_TIMEOUT event via TracerLike (no-abort `Promise.race`; CPU-leak risk explicitly accepted per CONTEXT.md D-09). Lattice commit `ba6172c`. |
| Tripwires/hooks | Frozen contexts (handler cannot mutate the band-set after registration window closes) | Covered | n/a | Phase 2 -- bands.ts pipeline.run() wraps each handler's context in structuredClone + Object.freeze. Handler mutations do not leak. Lattice commit `ba6172c`. |
| Tripwires/hooks | Mid-session registration freeze | Covered | n/a | Phase 2 -- bands.ts pipeline.freeze() is irreversible; subsequent register() throws Error(name === "PIPELINE_FROZEN"). Lattice commit `ba6172c`. |
| Tripwires/hooks | Typed lifecycle event union (BEFORE_PROVIDER, AFTER_PROVIDER, BEFORE_TOOL, AFTER_TOOL) separate from RunEventKind | Covered | n/a | Phase 2 -- bands.ts HookLifecycleEvent union. Separate vocabulary from tracing.ts RunEventKind by design (CONTEXT.md D-12). Phase 3 (observability) can extend either independently. Lattice commit `ba6172c`. |

## Providers

Surface inventory: `lattice/packages/lattice/src/providers/{provider,adapters,fake,packaging}.ts`. v1.1 adapters: `createAISdkProvider`, `createOpenAICompatibleProvider`, `createOpenAIProvider`, `createFakeProvider`. No first-class Anthropic / Gemini / LM Studio / xAI / OpenRouter adapter.

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Providers | OpenAI-compatible adapter (covers OpenRouter, LM Studio via OpenAI-compat surface) | Covered | n/a | `createOpenAICompatibleProvider` ships in v1.1. |
| Providers | Anthropic provider adapter aligned to FSB's universal-provider.js Anthropic path | Needs addition | Blocker | FSB autopilot's INV-03 demands provider parity across 7 providers; missing Anthropic in Lattice means FSB cannot route through Lattice's adapter layer for that path. |
| Providers | Gemini provider adapter (single-shot mode -- INV-03 + OOS-06 streaming exclusion) | Needs addition | Blocker | Same reasoning as Anthropic. |
| Providers | xAI provider adapter | Needs addition | Important | FSB primary provider for autopilot today. |
| Providers | First-class LM Studio adapter with the latency-tail canary behavior INV-03 calls out | Needs extension | Important | LM Studio is reachable via OpenAI-compat today but lacks the latency-tail recognition that makes it the canary. |
| Providers | OpenRouter adapter beyond OpenAI-compat | Nice-to-have | n/a | OpenAI-compat path is sufficient for FSB's current OpenRouter usage. |
| Providers | Custom OpenAI-compatible provider (user-configured endpoint) | Covered | n/a | OpenAI-compat surface in v1.1 supports this. |

## Delegation

Surface inventory: `lattice/packages/lattice/src/tools/tools.ts` (single-tool execution via `defineTool` / `runTool`). Lattice's `AGENTS.md` declares multi-agent crews as "Out of Scope" for v1.x. No concept of subagent / parent-child loops / delegation / summary-return / cache-prefix sharing / rate-limit-group coordination anywhere in v1.1.

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Delegation | Single-tool execution (defineTool, runTool) | Covered | n/a | v1.1 ships this. |
| Delegation | Task-delegation primitive (parent-child loops + summary-return + cache-prefix sharing + rate-limit-group coordination) | Out of scope | Blocker | Lattice currently excludes multi-agent. Requires Lattice-policy negotiation per FSB STATE.md R3 mitigation. If Lattice opens multi-agent, becomes a Phase candidate; otherwise FSB designs as a Lattice-adjacent FSB-side primitive consuming Lattice's receipt + tripwire surface. |
| Delegation | importMcpTools / MCP tool ingestion | Covered | n/a | v1.1 ships this. |

## MV3-survivability

Surface inventory: `lattice/packages/lattice/src/runtime/create-ai.ts` (single `ai.run({ task, artifacts, outputs, policy })` invocation) + `src/sessions/session.ts` (`createMemorySessionStore`, `SessionStore`, `SessionRecord`). Lattice has NO concept of "execution context can be evicted mid-flow." FSB attempt-1 built the setTimeout-chained iterator pattern (`extension/ai/agent-loop.js:1824/2418/2487/2497`) which Lattice cannot reproduce on its own.

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| MV3-survivability | Single-invocation runtime facade (createAI) | Covered | n/a | Sufficient for Node consumers; insufficient for MV3 SW consumers. |
| MV3-survivability | Adapter contract for runtimes whose execution context can be evicted mid-flow (resume-from-checkpoint, conservative recovery, idle-kill survival) | Needs addition | Blocker | FSB attempt-1 _al_handleRestoredMode is exactly this. Per INV-06 the adapter contract lives in Lattice; the MV3 implementation is FSB-side glue. Phase candidate. |
| MV3-survivability | Memory session store sufficient for in-process run history | Covered | n/a | v1.1 ships this; FSB needs the additional eviction-resumption layer ABOVE it. |
| MV3-survivability | Cross-process resumption from persisted state envelope | Needs addition | Blocker | Phase candidate (same phase as eviction adapter contract). |

## Observability/step-markers

Surface inventory: `lattice/packages/lattice/src/tracing/tracing.ts`. `RunEventKind` union: `run.start`, `artifact.ingested`, `context.packed`, `router.candidates`, `stage.start`, `stage.complete`, `provider.attempt`, `fallback.activated`, `validation.complete`, `validation.failed`, `artifact.created`, `run.complete`, `run.failed`, `tool.call`, `replay.offline`, `replay.live`. NO `step.start` / `step.transition` / `step.complete`. NO `stepName` / `stepIndex` / `parentStepName` fields. NO MV3-eviction recovery markers.

| Domain | Gap | Status | Severity | Notes |
|--------|-----|--------|----------|-------|
| Observability | TracerLike interface + createRunEvent factory | Covered | n/a | v1.1 ships this. |
| Observability | step.transition event kind + step.* sub-events (start/complete) | Covered | n/a | Phase 3 (FSB v0.10.0-attempt-2) added `"step.transition"` as the final literal in the `RunEventKind` union at `packages/lattice/src/tracing/tracing.ts`. Dotted-namespace sibling of run.*/stage.*/provider.*/tool.*/replay.*. step.start / step.complete sub-events deferred -- Phase 3 ships the transition marker only (the inspector envelope IS the receipt; no separate start/complete needed). Lattice commit `fd254c4`. |
| Observability | Inspector envelope shape that Lattice can sign as a Capability Receipt directly | Covered | n/a | Phase 3 (FSB v0.10.0-attempt-2) added `createCheckpointHook` factory at `packages/lattice/src/contract/checkpoint.ts` (sibling of `bands.ts`). The factory returns a `HookHandler<CheckpointHookContext>` the caller registers on Phase 2's `HookPipeline` (typically `band: BAND.OBSERVABILITY`). Per invocation the handler emits exactly one `step.transition` tracer event AND (when a signer is provided) mints exactly one v1.1 Capability Receipt with step-marker fields populated -- the envelope IS the inspector record. Best-effort mint (D-07): signer failures degrade to `metadata.mintError` without throwing upstream. Lattice commits `a67f476` (factory + tests) + `acdbb8a` (public surface re-export). |
| Observability | recovery / eviction-resume markers in the tracing union | Needs addition | Important | Paired with the MV3-survivability adapter. |
| Observability | OpenTelemetry exporter | Nice-to-have | n/a | Not on FSB's autopilot critical path; defer to a later phase. |

***

## How this doc gets used

Phase 2 (FSB side) picks up the Blocker rows in the Receipts and Observability domains -- the receipt-shape extensions plus the step-transition tracing kinds. Phase 3 (FSB side) picks up the Tripwires/hooks Blocker + Important rows. Provider and Delegation gaps are paced against Lattice's multi-agent policy stance + FSB's provider-rotation priority.

Each gap row's row position in this file is stable -- when a gap closes, the row's Status flips from "Needs addition" / "Needs extension" to "Covered" with a backlink to the Lattice commit + FSB phase that closed it. The doc is the single audit trail per CONTEXT.md D-02.
