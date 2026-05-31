import { describe, expect, it } from "vitest";

import { createFakeProvider } from "../providers/fake.js";

import { createNoopAgentHost } from "./host.js";
import type { AgentHost } from "./host.js";

describe("createNoopAgentHost", () => {
  it("returns the documented AgentHost shape with three seams", () => {
    const host: AgentHost = createNoopAgentHost();
    expect(host.kind).toBe("agent-host");
    expect(typeof host.scheduler?.scheduleNext).toBe("function");
    expect(typeof host.transport?.call).toBe("function");
    expect(typeof host.storage?.save).toBe("function");
    expect(typeof host.storage?.load).toBe("function");
    expect(typeof host.storage?.clear).toBe("function");
  });

  it("scheduler.scheduleNext resolves immediately", async () => {
    const host = createNoopAgentHost();
    const start = performance.now();
    await host.scheduler?.scheduleNext(0);
    const elapsed = performance.now() - start;
    // Immediate resolution — finishes well under 50ms even under load.
    expect(elapsed).toBeLessThan(50);
  });

  it("transport.call delegates to provider.execute()", async () => {
    const host = createNoopAgentHost();
    let executed = false;
    const fake = createFakeProvider({
      response: () => {
        executed = true;
        return {
          rawOutputs: { answer: "Hi." },
          normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        };
      },
    });
    const response = await host.transport?.call(fake, {
      task: "Hello",
      artifacts: [],
      outputs: ["answer"],
    });
    expect(executed).toBe(true);
    expect(response?.rawOutputs["answer"]).toBe("Hi.");
  });

  it("transport.call throws when the provider has no execute method", async () => {
    const host = createNoopAgentHost();
    const badProvider = { id: "no-exec", kind: "provider-adapter" as const };
    await expect(host.transport?.call(badProvider, {
      task: "x",
      artifacts: [],
      outputs: ["answer"],
    })).rejects.toThrow(/no execute/);
  });

  it("storage.load() returns null on a fresh host", async () => {
    const host = createNoopAgentHost();
    expect(await host.storage?.load()).toBeNull();
  });

  it("storage.save() is a no-op; subsequent load() still returns null", async () => {
    const host = createNoopAgentHost();
    await host.storage?.save({
      kind: "survivability-snapshot",
      version: "lattice-survivability/v1",
      payload: "test",
      capturedAt: "2026-05-31T00:00:00.000Z",
    });
    expect(await host.storage?.load()).toBeNull();
  });

  it("storage.clear() is a no-op", async () => {
    const host = createNoopAgentHost();
    await expect(host.storage?.clear()).resolves.toBeUndefined();
  });
});

describe("AgentHost — type-only shape conformance", () => {
  it("composable: a custom storage seam can replace the noop default", async () => {
    const stored = new Map<string, unknown>();
    const customHost: AgentHost = {
      ...createNoopAgentHost(),
      storage: {
        async save(snapshot) {
          stored.set("snapshot", snapshot);
        },
        async load() {
          return (stored.get("snapshot") as never) ?? null;
        },
        async clear() {
          stored.clear();
        },
      },
    };
    await customHost.storage?.save({
      kind: "survivability-snapshot",
      version: "lattice-survivability/v1",
      payload: "round-trip",
      capturedAt: "2026-05-31T00:00:00.000Z",
    });
    const loaded = await customHost.storage?.load();
    expect(loaded?.payload).toBe("round-trip");
    await customHost.storage?.clear();
    expect(await customHost.storage?.load()).toBeNull();
  });
});
