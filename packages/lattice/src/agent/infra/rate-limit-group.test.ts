import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentTransport } from "../host.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
  ProviderRunResponse,
} from "../../providers/provider.js";

import { createRateLimitGroup, withRateLimit } from "./rate-limit-group.js";

describe("createRateLimitGroup", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: defaults — 50 requests/min and 30k input tokens/min (Anthropic Tier 1)", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup();

    // Request dimension: 50 acquisitions within a simulated minute succeed.
    for (let i = 0; i < 50; i += 1) {
      await group.acquire({ inputTokens: 1 });
    }

    // The 51st waits...
    let resolved = false;
    void group.acquire({ inputTokens: 1 }).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    // ...until one request refills via continuous drain (60_000 / 50 = 1200ms).
    await vi.advanceTimersByTimeAsync(1200);
    expect(resolved).toBe(true);

    // Token dimension: caps at 30_000 input tokens per minute.
    const tokenGroup = createRateLimitGroup();
    await tokenGroup.acquire({ inputTokens: 30_000 });
    let tokenResolved = false;
    void tokenGroup.acquire({ inputTokens: 1 }).then(() => {
      tokenResolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(tokenResolved).toBe(false);

    // One token refills after 60_000 / 30_000 = 2ms of continuous drain.
    await vi.advanceTimersByTimeAsync(2);
    expect(tokenResolved).toBe(true);
  });

  it("Test 2: dual-dimension independence — token exhaustion blocks while requests remain", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });

    // A single acquire exhausts the token bucket; 99 requests remain.
    await group.acquire({ inputTokens: 1000 });

    let resolved = false;
    void group.acquire({ inputTokens: 100 }).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false); // blocked on tokens despite ample request capacity

    // 100 tokens refill after 100 / (1000 / 60_000) = 6000ms.
    await vi.advanceTimersByTimeAsync(6000);
    expect(resolved).toBe(true);
  });

  it("Test 3: continuous drain — pending acquire resolves after half-minute refill", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 2, tokensPerMinute: 1000 });

    await group.acquire({ inputTokens: 400 });
    await group.acquire({ inputTokens: 400 });

    let resolved = false;
    void group.acquire({ inputTokens: 400 }).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false);

    // Half-minute refill: 1 request + 500 tokens become available.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(resolved).toBe(true);
  });

  it("Test 4: lease reconciliation — release refunds under-use and debits over-use", async () => {
    vi.useFakeTimers();

    // Refund path: estimate 1000, actual 200 → 800 tokens refunded.
    const refundGroup = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const lease = await refundGroup.acquire({ inputTokens: 1000 });
    lease.release({ promptTokens: 200 });

    let refundResolved = false;
    void refundGroup.acquire({ inputTokens: 800 }).then(() => {
      refundResolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(refundResolved).toBe(true); // proceeds without waiting

    // Debit path: estimate 1000, actual 1500 → the extra 500 is debited.
    const debitGroup = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 2000 });
    const debitLease = await debitGroup.acquire({ inputTokens: 1000 }); // 1000 left
    debitLease.release({ promptTokens: 1500 }); // 500 left after over-use debit

    let okResolved = false;
    void debitGroup.acquire({ inputTokens: 500 }).then(() => {
      okResolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(okResolved).toBe(true); // exactly 500 remained

    let blockedResolved = false;
    void debitGroup.acquire({ inputTokens: 1 }).then(() => {
      blockedResolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(blockedResolved).toBe(false); // bucket fully drained by the debit
  });

  it("Test 5: FIFO fairness — pending acquires resolve in acquisition order", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 1, tokensPerMinute: 100_000 });

    await group.acquire({ inputTokens: 1 }); // drain the single request slot

    const order: string[] = [];
    void group.acquire({ inputTokens: 1 }).then(() => {
      order.push("A");
    });
    void group.acquire({ inputTokens: 1 }).then(() => {
      order.push("B");
    });

    await vi.advanceTimersByTimeAsync(60_000); // one request refills
    expect(order).toEqual(["A"]);

    await vi.advanceTimersByTimeAsync(60_000); // the next request refills
    expect(order).toEqual(["A", "B"]);
  });

  it("Test 6: injectable now — manual clock drives refill without fake timers", async () => {
    let t = 0;
    const group = createRateLimitGroup({
      requestsPerMinute: 1,
      tokensPerMinute: 10,
      now: () => t,
    });
    expect(group.kind).toBe("rate-limit-group");

    await group.acquire({ inputTokens: 10 }); // drains both dimensions at t=0

    t = 60_000; // one simulated minute later: 1 request + 10 tokens refilled

    // Resolves immediately off the manual clock — no timer needed.
    const lease = await group.acquire({ inputTokens: 10 });
    lease.release({ promptTokens: 10 });
  });
});

// ---------------------------------------------------------------------------
// Task 2: withRateLimit AgentTransport wrapper
// ---------------------------------------------------------------------------

/** 400-char task → chars/4 estimate of exactly 100 input tokens. */
const TASK_100_TOKENS = "x".repeat(400);

function makeRequest(task: string): ProviderRunRequest {
  return {
    task,
    artifacts: [],
    outputs: ["answer"],
    // Secret-shaped policy payload: error paths must never serialize it.
    policy: { apiKey: "sk-super-secret", headers: { authorization: "Bearer sk-super-secret" } },
  };
}

function makeProvider(
  execute?: (request: ProviderRunRequest) => Promise<ProviderRunResponse>,
): ProviderAdapter {
  return {
    id: "fake-provider",
    kind: "provider-adapter",
    ...(execute !== undefined ? { execute } : {}),
  };
}

describe("withRateLimit", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Test 1: routes through provider.execute and releases with normalizedUsage.promptTokens", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const seen: ProviderRunRequest[] = [];
    const response: ProviderRunResponse = {
      rawOutputs: { answer: "ok" },
      normalizedUsage: { promptTokens: 50, completionTokens: 0, costUsd: null },
    };
    const provider = makeProvider(async (request) => {
      seen.push(request);
      return response;
    });

    const transport = withRateLimit(group);
    const request = makeRequest(TASK_100_TOKENS); // estimate 100
    const result = await transport.call(provider, request);

    expect(result).toBe(response);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(request);

    // Released with ACTUAL 50, not the 100 estimate → 950 tokens remain.
    let resolved = false;
    void group.acquire({ inputTokens: 950 }).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(true);
  });

  it("Test 2: nests over an inner transport — composability with consumer transports", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const innerCalls: { provider: ProviderAdapter; request: ProviderRunRequest }[] = [];
    const inner: AgentTransport = {
      async call(provider, request) {
        innerCalls.push({ provider, request });
        return {
          rawOutputs: { answer: "from-inner" },
          normalizedUsage: { promptTokens: 10, completionTokens: 0, costUsd: null },
        };
      },
    };
    const executeSpy = vi.fn(async (): Promise<ProviderRunResponse> => ({
      rawOutputs: { answer: "from-provider" },
    }));
    const provider = makeProvider(executeSpy);

    const transport = withRateLimit(group, inner);
    const result = await transport.call(provider, makeRequest("hello"));

    expect(result.rawOutputs["answer"]).toBe("from-inner");
    expect(innerCalls).toHaveLength(1);
    expect(innerCalls[0]?.provider).toBe(provider);
    expect(executeSpy).not.toHaveBeenCalled(); // inner transport owns dispatch
  });

  it("Test 3: callers holding the same group instance share one bucket", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 1, tokensPerMinute: 100_000 });
    const provider = makeProvider(async () => ({
      rawOutputs: { answer: "ok" },
      normalizedUsage: { promptTokens: 1, completionTokens: 0, costUsd: null },
    }));

    // Two independently wrapped transports over the SAME group instance.
    const transportA = withRateLimit(group);
    const transportB = withRateLimit(group);

    await transportA.call(provider, makeRequest("first")); // drains the single request slot

    let resolved = false;
    void transportB.call(provider, makeRequest("second")).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(resolved).toBe(false); // second caller waits on the shared bucket

    await vi.advanceTimersByTimeAsync(60_000); // one request refills
    expect(resolved).toBe(true);
  });

  it("Test 4: provider throw — lease burned at the original estimate, same error propagates", async () => {
    vi.useFakeTimers();
    const group = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const boom = new Error("provider exploded");
    const provider = makeProvider(async () => {
      throw boom;
    });

    const transport = withRateLimit(group);
    await expect(transport.call(provider, makeRequest(TASK_100_TOKENS))).rejects.toBe(boom);

    // Error path never serializes the request object or headers.
    expect(boom.message).not.toContain("apiKey");
    expect(boom.message).not.toContain("sk-super-secret");

    // Burned at the ORIGINAL estimate (100): exactly 900 tokens remain.
    let nineHundred = false;
    void group.acquire({ inputTokens: 900 }).then(() => {
      nineHundred = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(nineHundred).toBe(true);

    let oneMore = false;
    void group.acquire({ inputTokens: 1 }).then(() => {
      oneMore = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(oneMore).toBe(false); // nothing was refunded

    // Undefined-execute guard: message names the provider id only.
    const noExecute = makeProvider();
    const guardGroup = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const guardTransport = withRateLimit(guardGroup);
    let guardError: unknown;
    try {
      await guardTransport.call(noExecute, makeRequest("hello"));
    } catch (error) {
      guardError = error;
    }
    expect(guardError).toBeInstanceOf(Error);
    const message = (guardError as Error).message;
    expect(message).toContain("fake-provider");
    expect(message).not.toContain("apiKey");
    expect(message).not.toContain("sk-super-secret");
    expect(message).not.toContain("authorization");
  });

  it("Test 5: missing/null normalizedUsage promptTokens — release falls back to the estimate", async () => {
    vi.useFakeTimers();

    // Missing normalizedUsage entirely.
    const missingGroup = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const missingProvider = makeProvider(async () => ({ rawOutputs: { answer: "ok" } }));
    await withRateLimit(missingGroup).call(missingProvider, makeRequest(TASK_100_TOKENS));

    let missing900 = false;
    void missingGroup.acquire({ inputTokens: 900 }).then(() => {
      missing900 = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(missing900).toBe(true); // estimate (100) consumed — no NaN poisoning

    let missingBlocked = false;
    void missingGroup.acquire({ inputTokens: 1 }).then(() => {
      missingBlocked = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(missingBlocked).toBe(false);

    // Null promptTokens (runtime garbage despite the type).
    const nullGroup = createRateLimitGroup({ requestsPerMinute: 100, tokensPerMinute: 1000 });
    const nullProvider = makeProvider(async () => ({
      rawOutputs: { answer: "ok" },
      normalizedUsage: {
        promptTokens: null as unknown as number,
        completionTokens: 0,
        costUsd: null,
      },
    }));
    await withRateLimit(nullGroup).call(nullProvider, makeRequest(TASK_100_TOKENS));

    let null900 = false;
    void nullGroup.acquire({ inputTokens: 900 }).then(() => {
      null900 = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(null900).toBe(true); // fell back to the estimate, arithmetic stayed finite
  });
});
