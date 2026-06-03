# Phase 20: Pluggable AgentHost Adapter + TRACE-EXT-01 Recovery Markers - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Forward. Builds on Phase 19's in-process default host (synchronous loop, direct transport, in-memory transcript) by exposing 3 pluggable seams. Closes TRACE-EXT-01 (the one Important row left open by the v1.1 audit's `docs/fsb-integration-gaps.md`).

<domain>
## Phase Boundary

`AgentHost` ships as a public interface with three optional seams: `scheduler` (how iterations yield), `transport` (how provider calls are dispatched), `storage` (how transcript + state persist for resume). `createNoopAgentHost()` ships as the Node-test reference implementation. The host composes with the Phase 18 `SurvivabilityAdapter` so the storage seam emits eviction snapshots; on resume, the agent loop re-enters at the recorded step.

`RunEventKind` (Phase 16) gains three recovery markers: `"recovery.start"`, `"recovery.complete"`, `"recovery.failed"`. Emitted by the agent loop when host.storage.load() returns a snapshot at run start (resume path) and when survivability adapter `resume()` succeeds or fails.

Out of scope: cost tracker / transcript store / goal-progress / action-history (Phase 21); showcase + eval (Phase 22).

</domain>

<decisions>
## Implementation Decisions

### AgentHost Shape (HOST-01)
- One `AgentHost` interface with three optional nested seams. Composability via three independent adapters is OOS — keeping one umbrella matches LatticeConfig's design.
- Shape:
  ```ts
  interface AgentHost {
    readonly kind: "agent-host";
    readonly scheduler?: AgentScheduler;
    readonly transport?: AgentTransport;
    readonly storage?: AgentStorage;
  }
  ```
- All seam methods are async (Promise-returning) for consistency.

### Scheduler Seam
- `interface AgentScheduler { scheduleNext(iterationIndex: number): Promise<void>; }`
- Called between iterations (after AFTER_AGENT_ITERATION emission, before next BEFORE_AGENT_ITERATION).
- Default (noop): immediate resolution. MV3 SW host calls `setTimeout(resolve, 0)` to yield to the event loop. Edge worker uses `queueMicrotask`. Lambda uses sync.

### Transport Seam
- `interface AgentTransport { call(provider, request): Promise<ProviderRunResponse>; }`
- Wraps the call to `provider.execute(request)`. Default (noop): direct pass-through.
- Cross-process bridges (FSB's offscreen-document Lattice host) override to dispatch via `chrome.runtime.sendMessage` and receive the response asynchronously.

### Storage Seam (HOST-03 composition with SurvivabilityAdapter)
- `interface AgentStorage { save(snapshot): Promise<void>; load(): Promise<SerializedSnapshot | null>; clear(): Promise<void>; }`
- Snapshot type is the Phase 18 `SerializedSnapshot` (string-encodable opaque wrapper).
- Agent loop on start: calls `host.storage.load()`. If a snapshot exists, deserializes via the configured `SurvivabilityAdapter` and re-enters at the recorded step index.
- After each AFTER_AGENT_ITERATION: calls `host.storage.save(serialize(state))`. State carries iteration index + conversation + cumulative usage.
- On success: calls `host.storage.clear()` so the next run starts fresh.

### Noop Reference Impl (HOST-02)
- `createNoopAgentHost()` returns:
  - scheduler: `{ scheduleNext: async () => {} }`
  - transport: `{ call: async (provider, req) => provider.execute!(req) }`
  - storage: `{ save: async () => {}, load: async () => null, clear: async () => {} }`
- Suitable for Node tests + the Phase 19 default behavior (no eviction, no resume).

### Recovery Markers (TRACE-EXT-01)
- `RunEventKind` union gains three new literals additively: `"recovery.start"`, `"recovery.complete"`, `"recovery.failed"`.
- Emitted by `runAgent` via the configured tracer:
  - `recovery.start` — when `host.storage.load()` returns a non-null snapshot (resume path begins).
  - `recovery.complete` — when the SurvivabilityAdapter's `resume()` succeeds and the loop is ready to continue at the recorded step.
  - `recovery.failed` — when `resume()` throws or the snapshot fails JSON round-trip. Loop falls back to start-from-scratch.

### Auto-Inject SurvivabilityAdapter
- Phase 19's `AgentIntent` already declares `host?` as the forward-decl. Phase 20 adds an optional `survivabilityAdapter?: SurvivabilityAdapter` field on `AgentIntent`. When absent, the runtime defaults to `createNoopSurvivabilityAdapter()`.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 18** `packages/lattice/src/runtime/survivability.ts` — `SurvivabilityAdapter`, `SerializedSnapshot`, `createNoopSurvivabilityAdapter()`, `ResumePolicy`. Phase 20 composes these into the agent loop.
- **Phase 19** `packages/lattice/src/agent/types.ts` — `AgentHost` forward-decl placeholder. Phase 20 promotes this to the full interface with three seams.
- **Phase 19** `packages/lattice/src/agent/runtime.ts` — the in-process default scheduler/transport/storage. Phase 20 refactors to dispatch through seams (falling back to default behavior when seams are absent).
- **Phase 16** `packages/lattice/src/tracing/tracing.ts` `RunEventKind` — Phase 20 extends additively with 3 recovery markers.

### Established Patterns
- Optional config fields use `?:` (no default-injected `undefined` shape).
- Public surface re-exports cluster by Phase.

</code_context>

<specifics>
## Specific Ideas

- The agent state snapshot shape:
  ```ts
  interface AgentSnapshot {
    readonly version: "agent-snapshot/v1";
    readonly iterationIndex: number;
    readonly conversation: readonly ConversationTurn[];
    readonly cumulativeUsage: Usage;
    readonly providerName: string;
    readonly capturedAt: string; // ISO-8601
  }
  ```
  Wrapped via `SurvivabilityAdapter.serialize(state)` into the opaque `SerializedSnapshot.payload`.

- Resume flow:
  1. `runAgent` starts.
  2. Call `host.storage.load()`. If snapshot is null → fresh start.
  3. Otherwise: emit `recovery.start` via tracer.
  4. Call `survivabilityAdapter.deserialize(snapshot)` to recover the `AgentSnapshot`.
  5. On success: restore iterationIndex / conversation / cumulativeUsage / providerName; emit `recovery.complete`; enter loop at recorded iteration index.
  6. On failure: emit `recovery.failed` with error.message; clear corrupt snapshot; start fresh.

</specifics>

<deferred>
## Deferred Ideas

- Concrete MV3 SW host (chrome.storage.session-backed) — lives FSB-side per Phase 18 D-22.
- Concrete Cloudflare Worker host (Durable Object-backed).
- Lambda host with DynamoDB-backed storage.
- Mid-iteration eviction recovery (Phase 20 only resumes between iterations; mid-iteration mid-provider-call eviction is OOS).

</deferred>
