import { describe, expect, it } from "vitest";

import {
  createHookPipeline,
  BAND,
  HOOK_DEFAULT_BUDGET_MS,
  PIPELINE_FROZEN_ERROR_NAME,
  HOOK_TIMEOUT_EVENT_NAME,
  type HookLifecycleEvent,
} from "./bands.js";
import type { TracerLike } from "../tracing/tracing.js";

function recordingTracer(): {
  readonly tracer: TracerLike;
  readonly events: Array<{ name: string; attributes?: Record<string, unknown> }>;
} {
  const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
  const tracer: TracerLike = {
    kind: "tracer",
    event(name, attributes) {
      events.push({ name, ...(attributes !== undefined ? { attributes } : {}) });
    },
  };
  return { tracer, events };
}

describe("createHookPipeline -- factory + identity", () => {
  it("returns a HookPipeline with kind === 'hook-pipeline'", () => {
    const pipe = createHookPipeline();
    expect(pipe.kind).toBe("hook-pipeline");
  });

  it("starts unfrozen", () => {
    const pipe = createHookPipeline();
    expect(pipe.isFrozen()).toBe(false);
  });
});

describe("HookPipeline -- band ordering", () => {
  it("invokes SAFETY before OBSERVABILITY before EXTENSION", async () => {
    const pipe = createHookPipeline();
    const order: string[] = [];
    pipe.register("BEFORE_TOOL", () => { order.push("extension"); }, { band: BAND.EXTENSION });
    pipe.register("BEFORE_TOOL", () => { order.push("safety"); }, { band: BAND.SAFETY });
    pipe.register("BEFORE_TOOL", () => { order.push("observability"); }, { band: BAND.OBSERVABILITY });
    await pipe.run("BEFORE_TOOL", { tool: "stub" });
    expect(order).toEqual(["safety", "observability", "extension"]);
  });

  it("preserves registration order within a band", async () => {
    const pipe = createHookPipeline();
    const order: number[] = [];
    pipe.register("BEFORE_TOOL", () => { order.push(1); }, { band: BAND.EXTENSION });
    pipe.register("BEFORE_TOOL", () => { order.push(2); }, { band: BAND.EXTENSION });
    pipe.register("BEFORE_TOOL", () => { order.push(3); }, { band: BAND.EXTENSION });
    await pipe.run("BEFORE_TOOL", {});
    expect(order).toEqual([1, 2, 3]);
  });
});

describe("HookPipeline -- matcher regex", () => {
  it("invokes handler when matcher regex matches event name", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("BEFORE_TOOL", () => { calls++; }, {
      band: BAND.EXTENSION,
      matcher: /^BEFORE_/,
    });
    await pipe.run("BEFORE_TOOL", {});
    expect(calls).toBe(1);
  });

  it("does NOT invoke handler when matcher rejects event name", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("AFTER_TOOL", () => { calls++; }, {
      band: BAND.EXTENSION,
      matcher: /^BEFORE_/,
    });
    await pipe.run("AFTER_TOOL", {});
    expect(calls).toBe(0);
  });

  it("invokes handler unconditionally when no matcher provided", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("AFTER_PROVIDER", () => { calls++; }, { band: BAND.EXTENSION });
    await pipe.run("AFTER_PROVIDER", {});
    expect(calls).toBe(1);
  });
});

describe("HookPipeline -- race-with-log budget", () => {
  it("emits HOOK_TIMEOUT when handler exceeds budget", async () => {
    const { tracer, events } = recordingTracer();
    const pipe = createHookPipeline({ tracer, sessionId: "sess-1" });
    pipe.register(
      "BEFORE_TOOL",
      async () => {
        await new Promise((r) => setTimeout(r, 200));
      },
      { band: BAND.EXTENSION, budgetMs: 50 },
    );
    await pipe.run("BEFORE_TOOL", {});
    const timeoutEvents = events.filter((e) => e.name === HOOK_TIMEOUT_EVENT_NAME);
    expect(timeoutEvents.length).toBe(1);
    const attrs = timeoutEvents[0]?.attributes ?? {};
    expect(attrs.event).toBe("BEFORE_TOOL");
    expect(attrs.band).toBe(BAND.EXTENSION);
    expect(attrs.budgetMs).toBe(50);
    expect(attrs.sessionId).toBe("sess-1");
    expect(typeof attrs.handlerIndex).toBe("number");
    expect(typeof attrs.elapsedMs).toBe("number");
  });

  it("does NOT emit HOOK_TIMEOUT when handler completes within budget", async () => {
    const { tracer, events } = recordingTracer();
    const pipe = createHookPipeline({ tracer });
    pipe.register("BEFORE_TOOL", () => { /* sync, fast */ }, {
      band: BAND.EXTENSION,
      budgetMs: 100,
    });
    await pipe.run("BEFORE_TOOL", {});
    expect(events.filter((e) => e.name === HOOK_TIMEOUT_EVENT_NAME).length).toBe(0);
  });

  it("default budget is HOOK_DEFAULT_BUDGET_MS (100ms)", () => {
    expect(HOOK_DEFAULT_BUDGET_MS).toBe(100);
  });

  it("continues to next handler after a timeout (no rejection)", async () => {
    const { tracer } = recordingTracer();
    const pipe = createHookPipeline({ tracer });
    let secondHandlerCalled = false;
    pipe.register("BEFORE_TOOL", async () => {
      await new Promise((r) => setTimeout(r, 200));
    }, { band: BAND.EXTENSION, budgetMs: 50 });
    pipe.register("BEFORE_TOOL", () => { secondHandlerCalled = true; }, { band: BAND.EXTENSION });
    await expect(pipe.run("BEFORE_TOOL", {})).resolves.toBeUndefined();
    expect(secondHandlerCalled).toBe(true);
  });

  it("HOOK_TIMEOUT payload contains only documented stable identifiers", async () => {
    const { tracer, events } = recordingTracer();
    const pipe = createHookPipeline({ tracer, sessionId: "sess-2" });
    pipe.register("BEFORE_TOOL", async () => {
      await new Promise((r) => setTimeout(r, 200));
    }, { band: BAND.EXTENSION, budgetMs: 50 });
    await pipe.run("BEFORE_TOOL", { secret: "user-content-that-must-not-leak" });
    const timeoutEvents = events.filter((e) => e.name === HOOK_TIMEOUT_EVENT_NAME);
    expect(timeoutEvents.length).toBe(1);
    const attrs = timeoutEvents[0]?.attributes ?? {};
    const allowedKeys = new Set(["event", "band", "budgetMs", "sessionId", "handlerIndex", "elapsedMs"]);
    for (const key of Object.keys(attrs)) {
      expect(allowedKeys.has(key)).toBe(true);
    }
  });
});

describe("HookPipeline -- frozen context", () => {
  it("freezes the context passed to handlers", async () => {
    const pipe = createHookPipeline();
    let observed: unknown;
    pipe.register("BEFORE_TOOL", (ctx) => { observed = ctx; }, { band: BAND.EXTENSION });
    const original = { tool: "click", payload: { selector: "#btn" } };
    await pipe.run("BEFORE_TOOL", original);
    expect(Object.isFrozen(observed)).toBe(true);
  });

  it("handler mutation does NOT leak to the caller's context", async () => {
    const pipe = createHookPipeline();
    pipe.register("BEFORE_TOOL", (ctx: Readonly<{ counter: number }>) => {
      try { (ctx as { counter: number }).counter = 99; } catch { /* expected in strict mode */ }
    }, { band: BAND.EXTENSION });
    const original = { counter: 0 };
    await pipe.run("BEFORE_TOOL", original);
    expect(original.counter).toBe(0);
  });
});

describe("HookPipeline -- freeze() semantics", () => {
  it("freeze() flips isFrozen() to true", () => {
    const pipe = createHookPipeline();
    pipe.freeze();
    expect(pipe.isFrozen()).toBe(true);
  });

  it("freeze() is idempotent", () => {
    const pipe = createHookPipeline();
    pipe.freeze();
    expect(() => pipe.freeze()).not.toThrow();
  });

  it("register() throws PIPELINE_FROZEN after freeze()", () => {
    const pipe = createHookPipeline();
    pipe.freeze();
    expect(() => pipe.register("BEFORE_TOOL", () => {}, { band: BAND.EXTENSION })).toThrowError();
    try {
      pipe.register("BEFORE_TOOL", () => {}, { band: BAND.EXTENSION });
    } catch (error) {
      expect(error instanceof Error).toBe(true);
      if (error instanceof Error) {
        expect(error.name).toBe(PIPELINE_FROZEN_ERROR_NAME);
      }
    }
  });

  it("run() still works after freeze() (only register is blocked)", async () => {
    const pipe = createHookPipeline();
    let calls = 0;
    pipe.register("BEFORE_TOOL", () => { calls++; }, { band: BAND.EXTENSION });
    pipe.freeze();
    await pipe.run("BEFORE_TOOL", {});
    expect(calls).toBe(1);
  });
});

describe("HookPipeline -- lifecycle event union", () => {
  it("accepts all four lifecycle events", async () => {
    const pipe = createHookPipeline();
    const events: HookLifecycleEvent[] = ["BEFORE_PROVIDER", "AFTER_PROVIDER", "BEFORE_TOOL", "AFTER_TOOL"];
    for (const ev of events) {
      pipe.register(ev, () => {}, { band: BAND.EXTENSION });
      await expect(pipe.run(ev, {})).resolves.toBeUndefined();
    }
  });
});

describe("HookPipeline -- absent event", () => {
  it("run() on an event with no registered handlers is a no-op", async () => {
    const pipe = createHookPipeline();
    await expect(pipe.run("AFTER_TOOL", {})).resolves.toBeUndefined();
  });
});
