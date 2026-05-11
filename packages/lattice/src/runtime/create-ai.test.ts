import { describe, expect, it } from "vitest";

import { contract } from "../contract/contract.js";
import { createFakeProvider } from "../providers/fake.js";
import type { ModelCapability } from "../providers/provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import { createAI } from "./create-ai.js";

function pricedFakeProvider(): ReturnType<typeof createFakeProvider> {
  return createFakeProvider({
    capabilities: [
      {
        ...defaultCapabilityForProvider("fake"),
        modelId: "fake:deterministic",
        pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.001 },
      },
    ],
  });
}

describe("Phase 7 contract + cost integration", () => {
  it("Test 1: RunIntent literal with contract field compiles and routes", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const intent = {
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0.5 } }),
    };
    const plan = await ai.plan(intent);
    expect(plan.kind).toBe("execution-plan");
  });

  it("Test 2: v1.0 backward compatibility — no contract field", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const plan = await ai.plan({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(plan.kind).toBe("execution-plan");
    expect(plan.route.selected).toBeDefined();
  });

  it("Test 3: contract flows to router — preflight reject reasons appear in plan", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const plan = await ai.plan({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    const allReasons = plan.route.candidates.flatMap((c) => c.reasons);
    expect(allReasons.some((r) => r.code === "contract-budget-exceeded")).toBe(true);
  });

  it("Test 4: no-contract-match classification — returns RunFailure with kind no-contract-match", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-budget-exceeded"),
        ).toBe(true);
      }
    }
  });

  it("Test 5: no-route remains no-route without contract", async () => {
    const restrictedCapability: ModelCapability = {
      ...defaultCapabilityForProvider("fake"),
      modelId: "fake:text-only",
      inputModalities: ["text"],
      outputModalities: ["text"],
      structuredOutput: false,
    };
    const provider = createFakeProvider({ capabilities: [restrictedCapability] });
    const ai = createAI({ providers: [provider] });
    // Trigger a no-route by requiring an output modality unsupported (json structured).
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        action: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (_v: unknown) => ({ value: _v }),
          },
        } as never,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no_route");
    }
  });

  it("Test 6: usage 0/0/0 on no-contract-match per CONTEXT.md", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });
});
