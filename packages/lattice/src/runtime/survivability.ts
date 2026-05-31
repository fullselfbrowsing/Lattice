/**
 * MV3-survivability adapter contract -- Phase 5 (FSB v0.10.0-attempt-2).
 *
 * This module is a SIBLING of create-ai.ts (the Lattice runtime facade) and
 * a SIBLING of contract/bands.ts (the hook pipeline factory) and
 * contract/checkpoint.ts (the per-step receipt hook). It does NOT modify
 * any of them; the SurvivabilityAdapter contract is composed from those
 * surfaces by the consumer (FSB's lattice-runtime-adapter.js in Plan 05-05).
 *
 * What is the survivability problem?
 *   Some host runtimes can evict the execution context mid-flow with no
 *   synchronous shutdown signal:
 *     - Chrome MV3 service workers: evicted after 30s silence OR 5min idle.
 *     - Cloudflare Workers: evicted at end of each request unless waitUntil.
 *     - AWS Lambda: process freeze + thaw across invocations.
 *   Lattice's existing runtime (create-ai.ts) assumes the process stays
 *   live for the duration of a run. The SurvivabilityAdapter contract is
 *   the seam where a host runtime tells Lattice "here is how to serialize
 *   my state, here is how to deserialize it back, here is how to resume
 *   work after I get evicted and recreated."
 *
 * What this module SHIPS:
 *   - SurvivabilityAdapter<TState> interface (4 methods)
 *   - SerializedSnapshot type (string-encodable opaque envelope)
 *   - EvictionHook<TState> type (pre-eviction callback signature)
 *   - ResumePolicy literal-union (post-restore reconstruction verdict)
 *   - UnsubscribeFn type
 *   - createNoopSurvivabilityAdapter() reference implementation
 *
 * What this module DOES NOT ship:
 *   - chrome.storage.session integration (FSB-side; Plan 05-05).
 *   - offscreen-document message bus (FSB-side; Plan 05-04).
 *   - Auto-wiring into create-ai.ts runtime (deferred indefinitely; the
 *     contract is consumer-controlled).
 *   - Mid-API-request / mid-tool-dispatch recovery dispatcher (CONSERVATIVE
 *     recovery wiring is deferred to a follow-on FSB milestone per
 *     CONTEXT.md D-22; only the ResumePolicy taxonomy lands here).
 *
 * Composition conventions (NOT enforced; documented for callers):
 *   D-09: onEviction hooks SHOULD register in BAND.SAFETY band on the
 *         caller's HookPipeline so they run FIRST per Phase 2 priority
 *         ordering. This module does NOT auto-register; it ships the
 *         contract only.
 *   D-10: serialize(state) MAY include the latest checkpoint receipt
 *         envelope (Phase 3 createCheckpointHook output) inside the
 *         SerializedSnapshot.payload; deserialize() reconstructs session
 *         identifiers from the v1.1 receipt body's step-marker fields
 *         (stepName, stepIndex, parentStepName, previousStepName,
 *         sessionId, timestamp). The payload is opaque to Lattice -- the
 *         host runtime defines the shape.
 *
 * ResumePolicy taxonomy (CD-E resolution per attempt-1 02-04-PLAN.md):
 *   - SAFE: the snapshot was captured at a safe boundary (BEFORE_ITERATION
 *     or BEFORE_NEXT_ITERATION_SCHEDULE step markers) and can be replayed
 *     deterministically. The host runtime may re-arm the loop.
 *   - RECOVERY_AMBIGUOUS: the snapshot was captured during a tool dispatch
 *     where re-execution risk is non-zero (file write, network POST without
 *     Idempotency-Key, side-effecting browser action). Host should escalate
 *     to the user before deciding.
 *   - ON_ERROR_SW_EVICTION_MID_REQUEST: the eviction happened mid-API-call
 *     (the provider request was in flight). 6 of 7 FSB providers do NOT
 *     document Idempotency-Key headers; replay risks duplicate charges +
 *     duplicate responses. Host should treat the run as failed and surface
 *     the error to the user.
 *   - ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH: the eviction happened mid-
 *     tool-dispatch (a browser action was in progress). Re-execution risk
 *     is similar to mid-API-call but lands in a different recovery branch
 *     (the host may inspect the page state before deciding).
 *
 * SerializedSnapshot is intentionally opaque + string-encodable. The
 * host runtime defines the payload shape; Lattice's only requirement
 * is that serialize() followed by deserialize() round-trips the state.
 *
 * Ed25519 receipt envelope contract (carries forward from Phase 1-3):
 *   Callers MAY embed a v1.1 ReceiptEnvelope inside SerializedSnapshot.payload
 *   for signed checkpoint round-trip. verifyReceipt against the embedded
 *   envelope MUST return result.ok === true after a serialize -> deserialize
 *   cycle (Test 12). This validates that JSON.stringify + JSON.parse over
 *   the envelope preserves the JCS-canonical body bytes used by DSSE PAE.
 *
 * Threat model (Phase 5 CONTEXT.md security block):
 *   - PII via serialized state: callers MUST ensure SerializedSnapshot.payload
 *     contains only stable identifiers + user-controlled state the user has
 *     already consented to persist. Mirrors Phase 2 D-04 receipt-body contract
 *     (step-marker fields are stable identifiers, not free-form user input).
 *   - Snapshot tampering: the noop adapter does NOT sign the snapshot.
 *     Callers that need cryptographic integrity SHOULD embed a signed
 *     ReceiptEnvelope inside the payload + verify it on deserialize.
 *     Phase 5 ships the contract; signature wrapping is a follow-on.
 *
 * Vocabulary separation (carries forward Phase 2 D-12 + Phase 3 D-02):
 *   ResumePolicy is the survivability vocabulary -- separate from
 *   RunEventKind (tracing) AND separate from HookLifecycleEvent (bands).
 *   The three vocabularies meet only when a host runtime composes them.
 */

/**
 * String-encodable opaque snapshot. The host runtime defines the payload
 * shape; Lattice's only requirement is that serialize() followed by
 * deserialize() round-trips the original state object.
 *
 * Why string-encodable? MV3's chrome.storage.session and most cross-process
 * storage layers accept structured-clone-safe values. JSON-string payloads
 * are the lowest-common-denominator that survives MV3 SW eviction +
 * Cloudflare Worker freeze + Lambda thaw. Callers MAY use a richer payload
 * shape (Uint8Array, Blob) IF the host runtime supports it; the contract
 * does not constrain payload format beyond "deserialize round-trips it".
 */
export interface SerializedSnapshot {
  readonly kind: "survivability-snapshot";
  readonly version: "lattice-survivability/v1";
  readonly payload: string;
  readonly capturedAt: string;
}

/**
 * Pre-eviction callback. The host runtime CAN attempt to call this hook
 * before the execution context is evicted, but MAY NOT be able to in
 * every case (MV3 eviction has no synchronous signal -- the SW just
 * stops). Callers should treat onEviction as best-effort: useful for
 * gathering final state when the eviction is announced (e.g., user-
 * initiated stop) but not load-bearing for involuntary eviction.
 *
 * The hook receives the current TState by reference. Mutations on the
 * hook side leak to the caller's state -- this is deliberate (the hook
 * is the LAST chance to update state before eviction). Callers who want
 * structuredClone semantics SHOULD wrap state in their own freeze layer.
 */
export type EvictionHook<TState> = (state: TState) => void | Promise<void>;

/**
 * Return value of onEviction(); calling unsubscribes the hook.
 *
 * Idempotent -- calling twice has the same effect as calling once.
 */
export type UnsubscribeFn = () => void;

/**
 * Resume policy taxonomy. The host runtime calls adapter.resume(snapshot)
 * after eviction + restore; the returned policy tells the host runtime
 * how to react.
 *
 * The 4 literal members carry forward from FSB v0.10.0-attempt-1's
 * 02-04-PLAN.md CONSERVATIVE recovery dispatch (preserved at
 * .planning/milestones/v0.10.0-attempt-1-pre-pivot/02-state-inspectability-
 * carve-out/02-04-PLAN.md). Per CONTEXT.md CD-E this is the locked union.
 */
export type ResumePolicy =
  | "SAFE"
  | "RECOVERY_AMBIGUOUS"
  | "ON_ERROR_SW_EVICTION_MID_REQUEST"
  | "ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH";

/**
 * The SurvivabilityAdapter contract. Host runtimes implement this; Lattice
 * runs against the interface.
 *
 * 4 methods (D-08 locked):
 *   - serialize(state): convert in-memory state to SerializedSnapshot
 *   - deserialize(snapshot): inverse of serialize
 *   - onEviction(hook): register a best-effort pre-eviction callback
 *   - resume(snapshot): return ResumePolicy verdict for the post-restore
 *     reconstruction. The host runtime acts on the policy.
 *
 * Adapters are POLYMORPHIC over TState -- the host runtime parameterizes
 * the type. Lattice's vitest covers the contract surface with a noop
 * adapter where TState = Record<string, unknown> for ergonomics.
 */
export interface SurvivabilityAdapter<TState> {
  readonly kind: "survivability-adapter";
  readonly id: string;
  serialize(state: TState): SerializedSnapshot;
  deserialize(snapshot: SerializedSnapshot): TState;
  onEviction(hook: EvictionHook<TState>): UnsubscribeFn;
  resume(snapshot: SerializedSnapshot): Promise<ResumePolicy>;
}

/**
 * Factory options for the reference noop adapter.
 *
 * - id: optional. Defaults to "noop-survivability". Useful when callers
 *   want to distinguish multiple adapter instances in test fixtures.
 * - policy: optional. Sets the default ResumePolicy returned by resume().
 *   Defaults to "SAFE" (matches noop adapter semantics: no recovery
 *   ambiguity if nothing was ever persisted).
 */
export interface NoopSurvivabilityAdapterOptions {
  readonly id?: string;
  readonly policy?: ResumePolicy;
}

/**
 * Reference implementation of SurvivabilityAdapter<TState>. Records
 * eviction events but does NOT persist; serialize / deserialize round-
 * trip via JSON.stringify / JSON.parse. Analog to createFakeProvider
 * in the providers/ module -- gives Lattice's vitest a complete shape-
 * conformance target before the real (FSB-side) adapter ships in
 * Plan 05-05.
 *
 * Per CONTEXT.md D-11 the noop adapter ships in Lattice (not FSB)
 * because it covers the contract surface in Lattice's own test suite;
 * FSB's real chrome.storage.session-backed adapter is glue layer.
 */
export function createNoopSurvivabilityAdapter<TState = Record<string, unknown>>(
  options: NoopSurvivabilityAdapterOptions = {},
): SurvivabilityAdapter<TState> {
  const id = options.id ?? "noop-survivability";
  const defaultPolicy: ResumePolicy = options.policy ?? "SAFE";
  const hooks = new Set<EvictionHook<TState>>();

  return {
    kind: "survivability-adapter" as const,
    id,
    serialize(state: TState): SerializedSnapshot {
      return {
        kind: "survivability-snapshot" as const,
        version: "lattice-survivability/v1" as const,
        payload: JSON.stringify(state ?? null),
        capturedAt: new Date().toISOString(),
      };
    },
    deserialize(snapshot: SerializedSnapshot): TState {
      // Trust the contract: callers are responsible for matching the
      // payload shape to TState (noop adapter does not validate).
      return JSON.parse(snapshot.payload) as TState;
    },
    onEviction(hook: EvictionHook<TState>): UnsubscribeFn {
      hooks.add(hook);
      let unsubscribed = false;
      return () => {
        if (unsubscribed) return;
        unsubscribed = true;
        hooks.delete(hook);
      };
    },
    async resume(_snapshot: SerializedSnapshot): Promise<ResumePolicy> {
      // The noop adapter has no persisted state to inspect; it always
      // returns the default policy. Real adapters (Plan 05-05) inspect
      // the snapshot's payload to determine which CONSERVATIVE branch
      // applies.
      return defaultPolicy;
    },
  };
}
