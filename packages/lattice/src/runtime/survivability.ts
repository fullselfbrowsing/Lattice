/**
 * Survivability contract for hosts that may evict an execution context
 * mid-flow without a synchronous shutdown signal, including MV3 service
 * workers, edge workers, and serverless runtimes.
 *
 * The host owns persistence and transport details. Lattice exposes the state
 * serialization, eviction-hook, and resume-policy seams without embedding
 * chrome.storage, an offscreen message bus, or a side-effect recovery engine.
 * Mid-request and mid-tool recovery remain host decisions because replay can
 * duplicate charges, network writes, or browser actions.
 *
 * Eviction hooks should run in the SAFETY band so they execute before other
 * handlers. Snapshots may embed a signed checkpoint receipt; its stable step
 * identifiers can reconstruct session position after deserialization.
 *
 * Resume policies distinguish a safe boundary, an ambiguous side-effect
 * boundary, an in-flight provider request, and an in-flight tool dispatch.
 * Hosts should ask the user before replaying ambiguous side effects and treat
 * in-flight provider requests as failed unless the provider guarantees
 * idempotency.
 *
 * Snapshot payloads may contain only stable identifiers and user-controlled
 * state the user consented to persist. The noop adapter does not authenticate
 * snapshots; callers that need integrity should embed and verify a signed
 * ReceiptEnvelope. ResumePolicy, RunEventKind, and HookLifecycleEvent remain
 * separate vocabularies joined only by a host integration.
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
 * The four literals are a closed compatibility surface.
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
 * The interface has four methods:
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
 * trip via JSON.stringify / JSON.parse. Like createFakeProvider in the
 * providers module, it provides a complete conformance target for host
 * implementations.
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
      // returns the default policy. Real adapters inspect
      // the snapshot's payload to determine which recovery branch
      // applies.
      return defaultPolicy;
    },
  };
}
