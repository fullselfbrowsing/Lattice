import { describe, expect, it } from "vitest";
import { z } from "zod";

import { artifact } from "../src/artifacts/artifact.js";
import { createFakeProvider } from "../src/providers/fake.js";
import { createLiteLLMProvider } from "../src/providers/litellm.js";
import type { ProviderAdapter } from "../src/providers/provider.js";
import { defaultCapabilityForProvider } from "../src/routing/catalog.js";
import { createAI } from "../src/runtime/create-ai.js";

describe("deterministic planning and execution spine", () => {
  it("dry-runs route candidates, context, packaging, and fallback chain", async () => {
    const ai = createAI({
      providers: [
        createFakeProvider({ id: "first" }),
        createFakeProvider({ id: "second" }),
      ],
    });

    const plan = await ai.plan({
      task: "Resolve case",
      artifacts: [
        artifact.text("case note", { id: "artifact:text:case" }),
        artifact.image("package.png", { id: "artifact:image:package" }),
      ],
      outputs: {
        answer: "text",
        action: z.object({ kind: z.literal("replace") }),
      },
    });

    expect(plan.kind).toBe("execution-plan");
    expect(plan.status).toBe("planned");
    expect(plan.route.selected).toMatchObject({
      providerId: "first",
      modelId: "first:deterministic",
    });
    expect(plan.route.fallbackChain).toEqual([
      expect.objectContaining({
        providerId: "second",
        reason: "policy-preserving-fallback",
      }),
    ]);
    expect(plan.context?.included.length).toBeGreaterThan(0);
    expect(plan.providerPackaging?.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactId: "artifact:image:package",
        }),
      ]),
    );
  });

  it("returns typed no-route plans without silently downgrading policy", async () => {
    const ai = createAI({
      providers: [createFakeProvider({ id: "fixture" })],
    });

    const plan = await ai.plan({
      task: "Resolve restricted case",
      outputs: { answer: "text" },
      policy: { privacy: "restricted" },
    });

    expect(plan.status).toBe("no-route");
    expect(plan.route.selected).toBeUndefined();
    expect(plan.route.noRouteReasons).toEqual([
      expect.objectContaining({ code: "privacy-unsupported" }),
    ]);
  });

  it("keeps gateway fallback hints out of the Lattice fallback chain", async () => {
    const ai = createAI({
      providers: [
        createLiteLLMProvider({
          model: "gpt-4o",
        }),
      ],
    });

    const plan = await ai.plan({
      task: "Gateway planning case",
      outputs: { answer: "text" },
      policy: {
        gateway: {
          allowFallbacks: true,
        },
      },
    });

    expect(plan.route.selected).toMatchObject({
      providerId: "litellm",
      modelId: "gpt-4o",
    });
    expect(plan.route.fallbackChain).toEqual([]);
    expect(plan.metadata?.gateway).toMatchObject({
      providerId: "litellm",
      requestedModel: "gpt-4o",
      policy: {
        allowFallbacks: true,
      },
    });
  });

  it("executes a planned fake-provider run and emits inspectable events", async () => {
    const seen: string[] = [];
    const ai = createAI({
      events: (event) => {
        seen.push(event.kind);
      },
      providers: [
        createFakeProvider({
          response: {
            rawOutputs: {
              answer: "Replacement approved.",
            },
          },
        }),
      ],
    });

    const result = await ai.run({
      task: "Resolve case",
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs.answer).toBe("Replacement approved.");
      expect(result.plan.kind).toBe("execution-plan");
      expect(result.plan.status).toBe("completed");
    }
    expect(seen).toEqual(
      expect.arrayContaining([
        "run.start",
        "router.candidates",
        "provider.attempt",
        "validation.complete",
        "run.complete",
      ]),
    );
  });

  it("filters candidates that exceed maxCostUsd", async () => {
    const expensive = {
      id: "expensive",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("expensive"),
          modelId: "expensive:model",
          pricing: {
            inputCostPer1M: 500_000,
            outputCostPer1M: 500_000,
          },
        },
      ],
      execute: async () => ({
        rawOutputs: { answer: "ok" },
      }),
    } satisfies ProviderAdapter;

    const plan = await createAI({ providers: [expensive] }).plan({
      task: "Resolve case",
      outputs: { answer: "text" },
      policy: { maxCostUsd: 0.000001 },
    });

    expect(plan.status).toBe("no-route");
    expect(plan.route.noRouteReasons).toEqual([
      expect.objectContaining({ code: "budget-exceeded" }),
    ]);
  });

  it("executes policy-preserving fallback candidates after provider failure", async () => {
    const ai = createAI({
      providers: [
        createFakeProvider({
          id: "primary",
          response: () => {
            throw new Error("primary failed");
          },
        }),
        createFakeProvider({
          id: "fallback",
          response: {
            rawOutputs: { answer: "fallback ok" },
          },
        }),
      ],
    });

    const result = await ai.run({
      task: "Resolve case",
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs.answer).toBe("fallback ok");
      expect(result.plan.kind).toBe("execution-plan");
      if (result.plan.kind !== "execution-plan") {
        return;
      }
      expect(result.plan.attempts.map((attempt) => attempt.providerId)).toEqual([
        "primary",
        "fallback",
      ]);
      expect(result.events?.map((event) => event.kind)).toContain("fallback.activated");
    }
  });

  it("repackages artifacts using fallback provider transport capabilities", async () => {
    const primaryCapability = {
      ...defaultCapabilityForProvider("primary"),
      modelId: "primary:model",
      fileTransport: ["base64"] as const,
    };
    const fallbackCapability = {
      ...defaultCapabilityForProvider("fallback"),
      modelId: "fallback:model",
      fileTransport: ["url"] as const,
    };
    const primary = {
      id: "primary",
      kind: "provider-adapter",
      capabilities: [primaryCapability],
      execute: async () => {
        throw new Error("primary failed");
      },
    } satisfies ProviderAdapter;
    const fallback = {
      id: "fallback",
      kind: "provider-adapter",
      capabilities: [fallbackCapability],
      execute: async (request) => {
        expect(request.providerPackaging?.providerId).toBe("fallback");
        expect(request.providerPackaging?.artifacts[0]).toMatchObject({
          artifactId: "artifact:image:package",
          transport: "url",
        });

        return {
          rawOutputs: { answer: "fallback packaged" },
        };
      },
    } satisfies ProviderAdapter;

    const result = await createAI({ providers: [primary, fallback] }).run({
      task: "Resolve case",
      artifacts: [
        artifact.image("package.png", {
          id: "artifact:image:package",
        }),
      ],
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs.answer).toBe("fallback packaged");
    }
  });
});
