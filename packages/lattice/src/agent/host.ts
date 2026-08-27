/**
 * AgentHost (v1.2).
 *
 * The pluggable host adapter for `runAgent` exposes three optional
 * seams: scheduler (how iterations yield between provider calls),
 * transport (how provider calls are dispatched), and storage (how the
 * agent state persists for resume after eviction).
 *
 * Composition surfaces:
 *   - SurvivabilityAdapter handles serialize/deserialize/resume
 *     against the host's storage payload. The agent loop wires storage +
 *     SurvivabilityAdapter together to deliver the eviction-resume
 *     contract.
 *   - createCheckpointHook mints per-iteration
 *     receipts via the OBSERVABILITY band; receipts can be embedded inside
 *     the `AgentSnapshot.lastReceiptId` (when callers want auditable
 *     resume).
 *
 * This module ships:
 *   - The full `AgentHost` interface (3 seams: scheduler / transport / storage).
 *   - `AgentSnapshot` interface — the agent-state shape that gets serialized.
 *   - `createNoopAgentHost()` reference implementation suitable for Node tests
 *     and the default behavior (no scheduling delay, direct provider
 *     transport, no persistence).
 *
 * Concrete MV3 service worker, Cloudflare Worker, and Lambda hosts live in
 * consumer codebases rather than the runtime package.
 */

import type { SerializedSnapshot } from "../runtime/survivability.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
  Usage,
} from "../providers/provider.js";

import type { ConversationTurn } from "./format-tools.js";
import type { IterationRecord } from "./types.js";

/**
 * Snapshot shape the agent loop serializes between iterations. The full
 * shape is opaque to callers (they only see it through SerializedSnapshot
 * via the configured SurvivabilityAdapter) but it's exported so reference
 * implementations and tests can inspect the round-trip.
 */
export interface AgentSnapshot {
  readonly version: "agent-snapshot/v1";
  readonly executionId?: string;
  readonly iterations?: readonly IterationRecord[];
  readonly iterationIndex: number;
  readonly conversation: readonly ConversationTurn[];
  readonly cumulativeUsage: Usage;
  readonly providerName: string;
  readonly capturedAt: string;
  /**
   * Dispatch ancestry chain of crew `AgentSpec` ids
   * (root-first). Absent = root agent (single-agent runs never set it).
   * Optional so existing serialized `agent-snapshot/v1` snapshots
   * deserialize unchanged — the version literal stays `"agent-snapshot/v1"`
   * without changing the version literal. The crew dispatcher threads the
   * chain through dispatch context; cycle prevention rejects any dispatch whose
   * target id already appears in the chain.
   */
  readonly ancestry?: readonly string[];
}

/**
 * Scheduler seam — controls how the agent loop yields between iterations.
 *
 * `scheduleNext(iterationIndex)` is called AFTER an AFTER_AGENT_ITERATION
 * emission and BEFORE the next iteration's BEFORE_AGENT_ITERATION. The
 * scheduler decides when to resume — synchronously (sync loop), on next
 * tick (setTimeout/queueMicrotask), via a queue (Durable Object), or any
 * other strategy.
 *
 * Default (noop): resolves immediately.
 */
export interface AgentScheduler {
  scheduleNext(iterationIndex: number): Promise<void>;
}

/**
 * Transport seam — controls how a provider call is dispatched.
 *
 * `call(provider, request)` wraps the provider's `execute()` invocation.
 * Default (noop): pass-through (`provider.execute!(request)`). Cross-process
 * bridges such as an offscreen-document host can override it to dispatch via
 * `chrome.runtime.sendMessage`.
 *
 * To preserve adapter parity, the transport seam does NOT
 * modify the `ProviderAdapter` interface — it operates on top of the
 * existing `execute()` method.
 */
export interface AgentTransport {
  call(
    provider: ProviderAdapter,
    request: ProviderRunRequest,
  ): Promise<ProviderRunResponse>;
}

/**
 * Storage seam — controls how agent state persists between iterations for
 * resume after host eviction.
 *
 * The runtime composes this with `SurvivabilityAdapter`:
 *   - The adapter serializes `AgentSnapshot` to `SerializedSnapshot` on
 *     each AFTER_AGENT_ITERATION; storage.save() persists the snapshot.
 *   - On run start, the agent loop calls storage.load(). If a non-null
 *     snapshot is returned, the adapter deserializes it; the loop resumes
 *     at the recorded iteration index.
 *   - On success, the loop calls storage.clear() so the next run starts
 *     fresh.
 *
 * Default (noop): save() is a no-op, load() returns null, clear() is a
 * no-op. Suitable for Node tests where eviction never occurs.
 */
export interface AgentStorage {
  save(snapshot: SerializedSnapshot): Promise<void>;
  load(): Promise<SerializedSnapshot | null>;
  clear(): Promise<void>;
}

/**
 * The host adapter — three optional seams, all swappable independently.
 *
 * Callers pass `host` on `AgentIntent`. The agent runtime falls back to
 * `createNoopAgentHost()` when `intent.host` is absent, so single-shot Node
 * usage continues to work without explicit configuration.
 */
export interface AgentHost {
  readonly kind: "agent-host";
  readonly scheduler?: AgentScheduler;
  readonly transport?: AgentTransport;
  readonly storage?: AgentStorage;
}

/**
 * Reference implementation suitable for Node tests and the default
 * behavior.
 *
 * - scheduler: resolves immediately (no yield between iterations).
 * - transport: pass-through to provider.execute().
 * - storage: save() / clear() are no-ops; load() always returns null.
 *
 * Equivalent to passing no host at all.
 */
export function createNoopAgentHost(): AgentHost {
  return {
    kind: "agent-host",
    scheduler: {
      async scheduleNext(_iterationIndex: number): Promise<void> {
        void _iterationIndex;
      },
    },
    transport: {
      async call(
        provider: ProviderAdapter,
        request: ProviderRunRequest,
      ): Promise<ProviderRunResponse> {
        if (provider.execute === undefined) {
          throw new Error(
            `AgentTransport: provider ${provider.id} has no execute() method.`,
          );
        }
        return provider.execute(request);
      },
    },
    storage: {
      async save(_snapshot: SerializedSnapshot): Promise<void> {
        void _snapshot;
      },
      async load(): Promise<SerializedSnapshot | null> {
        return null;
      },
      async clear(): Promise<void> {
        // no-op
      },
    },
  };
}
