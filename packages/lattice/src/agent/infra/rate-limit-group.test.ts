import { afterEach, describe, expect, it, vi } from "vitest";

import { createRateLimitGroup } from "./rate-limit-group.js";

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
