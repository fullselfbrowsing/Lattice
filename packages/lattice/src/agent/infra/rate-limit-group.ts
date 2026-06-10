/**
 * RateLimitGroup — Phase 39 (v1.3).
 *
 * Standalone dual-dimension (requests/min + input tokens/min) token-bucket
 * rate limiter with a lease-based async interface. Pure infra following the
 * CostTracker precedent (Phase 21): no dependency on the agent runtime, and
 * usable to gate ANY async work — plain `runAgent` calls, crews, or consumer
 * code outside Lattice entirely (D-12).
 *
 * Zero new runtime dependencies (D-17/D-18). The implementation is in-process
 * only; the lease interface (`acquire`/`release`) is the seam a future
 * cross-process implementation (Redis / Durable Object) can satisfy without
 * changing callers.
 *
 * Drain model: continuous per-millisecond smoothing with LAZY refill — bucket
 * levels are recomputed from the `now()` delta on every acquire/release, and
 * at most ONE `setTimeout` is pending at a time, scheduled for the exact
 * deficit of the head waiter. No interval timers, no recurring background
 * timers (the anthropic.ts lazy-expiry rule: the library must not pin the
 * Node event loop). Anthropic itself enforces its limits with continuously
 * replenished token buckets, so this model matches the enforcer.
 *
 * Reconciliation: `acquire` reserves on ESTIMATED input tokens; `release`
 * reconciles against the actual `Usage.promptTokens` every adapter returns —
 * under-use is refunded to the token bucket, over-use is debited. Requests
 * are consumed at acquire time and never refunded.
 *
 * Failure policy (caller contract): on provider failure, release with the
 * original estimate (no refund) — quota may have been consumed despite the
 * error. `withRateLimit` implements this policy for the AgentTransport seam.
 */

import type { AgentTransport } from "../host.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
} from "../../providers/provider.js";

/** Anthropic Tier 1 requests/minute (fetched 2026-06-10). */
const DEFAULT_REQUESTS_PER_MINUTE = 50;
/** Anthropic Tier 1 input tokens/minute, Sonnet-class (fetched 2026-06-10). */
const DEFAULT_TOKENS_PER_MINUTE = 30_000;

const MS_PER_MINUTE = 60_000;

/**
 * Absorbs floating-point drift in two places: bucket-level comparisons
 * (`available >= need`) and deficit-wait rounding. 1e-6 of a token/request
 * (or millisecond) is far above accumulated IEEE-754 error at these
 * magnitudes and far below anything rate-limit-relevant.
 */
const FLOAT_EPSILON = 1e-6;

export interface RateLimitGroupOptions {
  /** Requests per minute. Defaults to 50 (Anthropic Tier 1). */
  readonly requestsPerMinute?: number;
  /** Input tokens per minute. Defaults to 30_000 (Anthropic Tier 1). */
  readonly tokensPerMinute?: number;
  /** Injectable clock for tests (defaults to `Date.now`). */
  readonly now?: () => number;
}

export interface RateLimitLease {
  /**
   * Reconcile the reservation against actual usage. Refunds
   * `estimate - actual.promptTokens` to the token bucket when positive,
   * debits the difference when negative. Idempotent — only the first call
   * has an effect. Requests are never refunded.
   */
  release(actual: { promptTokens: number }): void;
}

export interface RateLimitGroup {
  readonly kind: "rate-limit-group";
  /**
   * Reserve 1 request + `estimate.inputTokens` tokens. Resolves immediately
   * when both dimensions have capacity; otherwise the caller waits (FIFO)
   * until continuous drain refills the deficit.
   */
  acquire(estimate: { inputTokens: number }): Promise<RateLimitLease>;
}

interface Bucket {
  available: number;
  readonly capacity: number;
  readonly perMsRate: number;
}

interface Waiter {
  readonly inputTokens: number;
  readonly resolve: (lease: RateLimitLease) => void;
}

function createBucket(perMinute: number, label: string): Bucket {
  if (!Number.isFinite(perMinute) || perMinute <= 0) {
    throw new TypeError(
      `createRateLimitGroup: ${label} must be a positive finite number, got ${perMinute}.`,
    );
  }
  return {
    available: perMinute,
    capacity: perMinute,
    perMsRate: perMinute / MS_PER_MINUTE,
  };
}

export function createRateLimitGroup(
  options: RateLimitGroupOptions = {},
): RateLimitGroup {
  const now = options.now ?? Date.now;
  const requests = createBucket(
    options.requestsPerMinute ?? DEFAULT_REQUESTS_PER_MINUTE,
    "requestsPerMinute",
  );
  const tokens = createBucket(
    options.tokensPerMinute ?? DEFAULT_TOKENS_PER_MINUTE,
    "tokensPerMinute",
  );
  let lastRefillAt = now();
  const waiters: Waiter[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  /** Lazy continuous refill from the clock delta — never a recurring timer. */
  function refill(): void {
    const t = now();
    const elapsed = t - lastRefillAt;
    if (elapsed <= 0) return;
    lastRefillAt = t;
    requests.available = Math.min(
      requests.capacity,
      requests.available + elapsed * requests.perMsRate,
    );
    tokens.available = Math.min(
      tokens.capacity,
      tokens.available + elapsed * tokens.perMsRate,
    );
  }

  /**
   * Token requirement for availability checks, clamped to capacity so an
   * oversized estimate (> bucket capacity) proceeds at full bucket instead
   * of deadlocking; the full amount is still debited (the bucket goes into
   * debt and recovers via drain).
   */
  function tokenNeed(inputTokens: number): number {
    return Math.min(inputTokens, tokens.capacity);
  }

  function tryDebit(inputTokens: number): boolean {
    if (
      requests.available + FLOAT_EPSILON >= 1 &&
      tokens.available + FLOAT_EPSILON >= tokenNeed(inputTokens)
    ) {
      requests.available -= 1;
      tokens.available -= inputTokens;
      return true;
    }
    return false;
  }

  /** Exact wait (ms) until both dimensions can cover the head waiter. */
  function deficitWaitMs(inputTokens: number): number {
    const requestDeficit = Math.max(0, 1 - requests.available);
    const tokenDeficit = Math.max(0, tokenNeed(inputTokens) - tokens.available);
    const requestWait = requestDeficit / requests.perMsRate;
    const tokenWait = tokenDeficit / tokens.perMsRate;
    return Math.max(requestWait, tokenWait);
  }

  function scheduleNext(): void {
    if (timer !== null) return;
    const head = waiters[0];
    if (head === undefined) return;
    const waitMs = Math.max(
      1,
      Math.ceil(deficitWaitMs(head.inputTokens) - FLOAT_EPSILON),
    );
    timer = setTimeout(() => {
      timer = null;
      pump();
    }, waitMs);
  }

  /** Refill, resolve as many FIFO waiters as capacity allows, reschedule. */
  function pump(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    refill();
    while (waiters.length > 0) {
      const head = waiters[0];
      if (head === undefined || !tryDebit(head.inputTokens)) break;
      waiters.shift();
      head.resolve(createLease(head.inputTokens));
    }
    scheduleNext();
  }

  function createLease(estimateTokens: number): RateLimitLease {
    let released = false;
    return {
      release(actual: { promptTokens: number }): void {
        if (released) return;
        released = true;
        refill();
        const actualTokens =
          typeof actual.promptTokens === "number" &&
          Number.isFinite(actual.promptTokens)
            ? actual.promptTokens
            : estimateTokens;
        // Token bucket only — requests were consumed at acquire, never refunded.
        tokens.available = Math.min(
          tokens.capacity,
          tokens.available + (estimateTokens - actualTokens),
        );
        // A refund may unblock pending waiters (or shorten the head's wait).
        pump();
      },
    };
  }

  return {
    kind: "rate-limit-group" as const,
    async acquire(estimate: { inputTokens: number }): Promise<RateLimitLease> {
      refill();
      // Fast path only when nobody is queued — preserves FIFO fairness.
      if (waiters.length === 0 && tryDebit(estimate.inputTokens)) {
        return createLease(estimate.inputTokens);
      }
      return new Promise<RateLimitLease>((resolve) => {
        waiters.push({ inputTokens: estimate.inputTokens, resolve });
        scheduleNext();
      });
    },
  };
}

/**
 * chars/4 heuristic for lease reservation (matches the transcript-store
 * default `TokenEstimator`). Persistent estimation error is benign: `release`
 * reconciles every lease against the actual `Usage.promptTokens` (A2).
 */
function estimateInputTokens(task: string): number {
  return Math.ceil(task.length / 4);
}

/**
 * Wrap an `AgentTransport` so every provider call is gated through `group`.
 *
 * Every transport wrapped with the SAME group instance shares one bucket —
 * `runAgentCrew` (39-06) wraps parent + child hosts with one shared group per
 * adapter instance, structurally guaranteeing crew-wide coordination (D-13).
 * `ProviderAdapter` is never modified (INV-03 parity invariant intact).
 *
 * - `inner` provided → dispatch nests through `inner.call(provider, request)`,
 *   composing with consumer transports (e.g. cross-process bridges).
 * - `inner` undefined → falls through to `provider.execute(request)`, guarded
 *   the same way as `createNoopAgentHost` (error names the provider id only).
 *
 * Release policy:
 * - Success → release with `normalizedUsage.promptTokens`; when usage is
 *   missing or non-finite, fall back to the estimate (no NaN arithmetic —
 *   the `costUsd: null` "unmeasured" discipline analog).
 * - Throw → release with the ORIGINAL estimate (burn — no refund; the
 *   provider may have consumed quota despite the error) and rethrow the
 *   same error unchanged. Request objects and headers are never serialized
 *   into error paths.
 */
export function withRateLimit(
  group: RateLimitGroup,
  inner?: AgentTransport,
): AgentTransport {
  return {
    async call(
      provider: ProviderAdapter,
      request: ProviderRunRequest,
    ): Promise<ProviderRunResponse> {
      const estimate = estimateInputTokens(request.task);
      const lease = await group.acquire({ inputTokens: estimate });
      try {
        let response: ProviderRunResponse;
        if (inner !== undefined) {
          response = await inner.call(provider, request);
        } else {
          if (provider.execute === undefined) {
            throw new Error(
              `AgentTransport: provider ${provider.id} has no execute() method.`,
            );
          }
          response = await provider.execute(request);
        }
        const actual = response.normalizedUsage?.promptTokens;
        lease.release({
          promptTokens:
            typeof actual === "number" && Number.isFinite(actual)
              ? actual
              : estimate,
        });
        return response;
      } catch (error) {
        // Burn the reservation: quota may have been consumed despite the error.
        lease.release({ promptTokens: estimate });
        throw error;
      }
    },
  };
}
