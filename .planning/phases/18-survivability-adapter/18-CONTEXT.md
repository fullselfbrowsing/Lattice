# Phase 18: Survivability Adapter Contract - Context

**Gathered:** 2026-05-31
**Status:** Retroactive backfill (code on disk via cherry-pick from FSB v0.10.0-attempt-2 Phase 5).
**Mode:** Retro. Originating SHAs: `a4609bc`, `109d6ae`, `e95067b`. Cherry-picked with `git cherry-pick -x` provenance.

**Note on TRACE-EXT-01:** The v1.2 ROADMAP originally bundled "recovery / eviction-resume markers in `RunEventKind`" (the one Important row from v1.1 audit) into Phase 18 as net-new work. Since Phase 18 is a pure retro and the FSB Phase 5 commits do not include those markers, TRACE-EXT-01 is **DEFERRED** to Track B (Phase 19 or sub-phase) where it naturally composes with the agent host's storage seam. v1.2 REQUIREMENTS will reflect the deferral.

<domain>
## Phase Boundary

Lattice defines what "execution context can be evicted mid-flow" means for any runtime (MV3 SW, Cloudflare Worker, Lambda, equivalent) without coupling the contract to any one platform. The `SurvivabilityAdapter<TState>` interface ships with `serialize`, `deserialize`, `onEviction`, `resume`; `SerializedSnapshot` is a string-encodable opaque wrapper; `ResumePolicy` is a literal-union taxonomy carried forward from FSB attempt-1; `createNoopSurvivabilityAdapter()` ships as a Node-test reference implementation.

Out of scope: TRACE-EXT-01 (deferred to Track B). Concrete MV3 / chrome.storage.session-backed adapter (lives FSB-side per CONTEXT D-22 from FSB v0.10.0-attempt-2 Phase 5). CONSERVATIVE recovery dispatcher (explicitly deferred to follow-on milestone).

</domain>

<decisions>
## Implementation Decisions

### SurvivabilityAdapter (SURV-01..04)
- New module `packages/lattice/src/runtime/survivability.ts`.
- Interface `SurvivabilityAdapter<TState>` with 4 methods: `serialize(state) → SerializedSnapshot`; `deserialize(snapshot) → TState`; `onEviction(hook) → UnsubscribeFn`; `resume(snapshot, policy) → Promise<{ state, policy }>`.
- Companion types: `EvictionHook<TState>`, `UnsubscribeFn`.
- `SerializedSnapshot` shape: `{ kind: "survivability-snapshot", version: "lattice-survivability/v1", payload: string, capturedAt: ISO-8601 }`. Opaque string-encodable wrapper. Survives MV3 SW eviction, Cloudflare Worker freeze, Lambda thaw.
- `ResumePolicy` literal-union: `SAFE | RECOVERY_AMBIGUOUS | ON_ERROR_SW_EVICTION_MID_REQUEST | ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH`. Carried forward from FSB attempt-1 02-04-PLAN.md CONSERVATIVE recovery taxonomy.
- `createNoopSurvivabilityAdapter()` reference implementation.
- 17 vitest cases: shape conformance + JSON round-trip + composition with v1.1 ReceiptEnvelope (Test 12 exercises DSSE+JCS round-trip with real ephemeral Ed25519 keypair; no mocks for Lattice primitives).

### Public Surface (INDEX-05)
- `packages/lattice/src/index.ts` re-exports `createNoopSurvivabilityAdapter` value + 5 type-only re-exports.

### Composition Conventions (JSDoc, Not Enforced)
- `onEviction` hooks SHOULD register in `BAND.SAFETY` (Phase 15 band pipeline).
- `SerializedSnapshot.payload` MAY embed v1.1 `ReceiptEnvelope` from Phase 16 `createCheckpointHook`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 15 band pipeline — survivability adapter composes via JSDoc convention only (no hard dependency).
- Phase 16 v1.1 receipts — `SerializedSnapshot.payload` may carry a `ReceiptEnvelope` opaquely.

### Established Patterns
- `runtime/` modules ship next to `runtime/create-ai.ts`. Phase 18 is the first runtime-level contract added since v1.0.
- 17 cases match the test count from FSB v0.10.0-attempt-2 Phase 5 (Plan 05-02).

</code_context>

<specifics>
## Specific Ideas

- The hardest test (Test 12 of `survivability.test.ts`): create a real ephemeral Ed25519 keypair, mint a real v1.1 ReceiptEnvelope via `createReceipt`, embed it in a `SerializedSnapshot.payload`, JSON round-trip the snapshot, recover the envelope, verify via `verifyReceipt`. Proves the snapshot survives byte-equal under DSSE + JCS round-trip.

</specifics>

<deferred>
## Deferred Ideas

- TRACE-EXT-01 (recovery / eviction-resume markers in `RunEventKind`) — moved to Track B planning. Was originally bundled into Phase 18 in the v1.2 ROADMAP draft; corrected here because Phase 18 is a pure retro.
- CONSERVATIVE recovery dispatcher — explicit OOS per FSB CONTEXT D-22; deferred to follow-on milestone.
- Concrete MV3 / chrome.storage.session implementation — lives FSB-side, not in Lattice.

</deferred>
