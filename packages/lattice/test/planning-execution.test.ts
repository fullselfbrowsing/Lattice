import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { artifact } from "../src/artifacts/artifact.js";
import type { ContextSummarizer } from "../src/context/context-pack.js";
import { createFakeProvider } from "../src/providers/fake.js";
import { createLiteLLMProvider } from "../src/providers/litellm.js";
import { createOpenRouterProvider } from "../src/providers/openrouter.js";
import type {
  ProviderAdapter,
  ProviderRunRequest,
} from "../src/providers/provider.js";
import { defaultCapabilityForProvider } from "../src/routing/catalog.js";
import { createAI } from "../src/runtime/create-ai.js";
import { fc } from "../src/test-support/fast-check.js";

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

  it("keeps OpenRouter fallback models out of Lattice fallback chain", async () => {
    const ai = createAI({
      providers: [
        createOpenRouterProvider({
          model: "openai/gpt-oss-120b",
          fallbackModels: ["anthropic/claude-sonnet-4.5"],
        }),
      ],
    });

    const plan = await ai.plan({
      task: "OpenRouter fallback planning case",
      outputs: { answer: "text" },
    });

    expect(plan.route.selected).toMatchObject({
      providerId: "openrouter",
      modelId: "openai/gpt-oss-120b",
    });
    expect(plan.route.fallbackChain).toEqual([]);
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

  it("rematerializes fallback membership and transport under that route's limits", async () => {
    const primaryRequests: ProviderRunRequest[] = [];
    const fallbackRequests: ProviderRunRequest[] = [];
    const primary = {
      id: "primary-authority",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("primary-authority"),
          modelId: "primary-authority:model",
          contextWindow: 4_096,
          fileTransport: ["inline", "base64"] as const,
        },
      ],
      async execute(request) {
        primaryRequests.push(request);
        throw new Error("primary unavailable");
      },
    } satisfies ProviderAdapter;
    const fallback = {
      id: "fallback-authority",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("fallback-authority"),
          modelId: "fallback-authority:model",
          contextWindow: 1_300,
          fileTransport: ["inline", "url"] as const,
        },
      ],
      async execute(request) {
        fallbackRequests.push(request);
        return { rawOutputs: { answer: "route-local" } };
      },
    } satisfies ProviderAdapter;
    const summarize = vi.fn<ContextSummarizer["summarize"]>(({ artifacts: sources }) => {
      expect(sources.map((source) => source.id)).toEqual(["artifact:raw"]);
      return [artifact.text("FALLBACK_SUMMARY", { id: "artifact:summary" })];
    });
    const result = await createAI({ providers: [primary, fallback] }).run({
      task: "Route-local fallback",
      artifacts: [
        artifact.text("PRIMARY_AND_FALLBACK", {
          id: "artifact:included",
          size: { characters: 2_000 },
        }),
        artifact.text("RAW_SUMMARIZED_SENTINEL", {
          id: "artifact:raw",
          size: { characters: 1_600 },
        }),
        artifact.image("https://example.test/image.png", {
          id: "artifact:image",
          size: { characters: 4 },
        }),
      ],
      outputs: { answer: "text" },
      overrides: { summarizer: { summarize } },
    });

    expect(result.ok).toBe(true);
    expect(primaryRequests).toHaveLength(1);
    expect(fallbackRequests).toHaveLength(1);
    expect(primaryRequests[0]?.artifacts.map((input) => input.id)).toEqual([
      "artifact:included",
      "artifact:raw",
      "artifact:image",
    ]);
    expect(fallbackRequests[0]?.artifacts.map((input) => input.id)).toEqual([
      "artifact:included",
      "artifact:image",
      "artifact:summary",
    ]);
    expect(JSON.stringify(fallbackRequests[0])).not.toContain(
      "RAW_SUMMARIZED_SENTINEL",
    );
    expect(summarize).toHaveBeenCalledOnce();

    if (!result.ok || result.plan.kind !== "execution-plan") {
      throw new Error("Expected a successful execution plan.");
    }
    expect(result.plan.route.selected?.providerId).toBe("fallback-authority");
    expect(result.plan.attempts).toHaveLength(2);
    for (const [attempt, request] of result.plan.attempts.map((attempt, index) => [
      attempt,
      [primaryRequests[0], fallbackRequests[0]][index],
    ] as const)) {
      expect(attempt.context).toEqual(request?.contextPack);
      expect(attempt.providerPackaging).toEqual(request?.providerPackaging);
      expect(attempt.contextProjection?.artifactRefs.map((ref) => ref.id)).toEqual(
        request?.artifacts.map((input) => input.id),
      );
      expect(attempt.inputHashes).toEqual(attempt.contextProjection?.inputHashes);
    }
    expect(primaryRequests[0]?.providerPackaging?.artifacts).toContainEqual(
      expect.objectContaining({ artifactId: "artifact:image", transport: "base64" }),
    );
    expect(fallbackRequests[0]?.providerPackaging?.artifacts).toContainEqual(
      expect.objectContaining({ artifactId: "artifact:image", transport: "url" }),
    );
    expect(result.plan.context).toEqual(result.plan.attempts[1]?.context);
    expect(result.plan.contextProjection).toEqual(
      result.plan.attempts[1]?.contextProjection,
    );
    expect(result.plan.providerPackaging).toEqual(
      result.plan.attempts[1]?.providerPackaging,
    );
  });

  it("rebuilds generated fallback budgets, membership, and transport per route", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          primaryWindow: fc.integer({ min: 3_200, max: 5_000 }),
          fallbackWindow: fc.integer({ min: 1_300, max: 1_400 }),
          primaryTransport: fc.constantFrom<"base64" | "url">(
            "base64",
            "url",
          ),
        }),
        async ({ primaryWindow, fallbackWindow, primaryTransport }) => {
          const fallbackTransport =
            primaryTransport === "base64" ? "url" : "base64";
          const primaryRequests: ProviderRunRequest[] = [];
          const fallbackRequests: ProviderRunRequest[] = [];
          const primary: ProviderAdapter = {
            id: "generated-primary",
            kind: "provider-adapter",
            capabilities: [
              {
                ...defaultCapabilityForProvider("generated-primary"),
                modelId: "generated-primary:model",
                contextWindow: primaryWindow,
                fileTransport: ["inline", primaryTransport],
              },
            ],
            async execute(request) {
              primaryRequests.push(request);
              throw new Error("generated primary unavailable");
            },
          };
          const fallback: ProviderAdapter = {
            id: "generated-fallback",
            kind: "provider-adapter",
            capabilities: [
              {
                ...defaultCapabilityForProvider("generated-fallback"),
                modelId: "generated-fallback:model",
                contextWindow: fallbackWindow,
                fileTransport: ["inline", fallbackTransport],
              },
            ],
            async execute(request) {
              fallbackRequests.push(request);
              return { rawOutputs: { answer: "generated fallback" } };
            },
          };
          const summarize = vi.fn<ContextSummarizer["summarize"]>(
            ({ artifacts: sources }) => {
              expect(sources.map((source) => source.id)).toEqual([
                "artifact:generated:raw",
              ]);
              return [
                artifact.text("GENERATED_FALLBACK_SUMMARY", {
                  id: "artifact:generated:summary",
                }),
              ];
            },
          );
          const result = await createAI({ providers: [primary, fallback] }).run({
            task: "Generated route-local fallback",
            artifacts: [
              artifact.text("GENERATED_INCLUDED", {
                id: "artifact:generated:included",
                size: { characters: 2_000 },
              }),
              artifact.text("GENERATED_RAW_SUMMARY_SENTINEL", {
                id: "artifact:generated:raw",
                size: { characters: 1_600 },
              }),
              artifact.image("https://example.test/generated.png", {
                id: "artifact:generated:image",
                size: { characters: 4 },
              }),
            ],
            outputs: { answer: "text" },
            overrides: { summarizer: { summarize } },
          });

          expect(result.ok).toBe(true);
          expect(primaryRequests).toHaveLength(1);
          expect(fallbackRequests).toHaveLength(1);
          expect(summarize).toHaveBeenCalledOnce();
          if (
            !result.ok ||
            result.plan.kind !== "execution-plan" ||
            primaryRequests[0] === undefined ||
            fallbackRequests[0] === undefined
          ) {
            throw new Error("Expected generated fallback success.");
          }

          const primaryRequest = primaryRequests[0];
          const fallbackRequest = fallbackRequests[0];
          expect(primaryRequest.artifacts.map((input) => input.id)).toEqual([
            "artifact:generated:included",
            "artifact:generated:raw",
            "artifact:generated:image",
          ]);
          expect(fallbackRequest.artifacts.map((input) => input.id)).toEqual([
            "artifact:generated:included",
            "artifact:generated:image",
            "artifact:generated:summary",
          ]);
          expect(JSON.stringify(fallbackRequest)).not.toContain(
            "GENERATED_RAW_SUMMARY_SENTINEL",
          );

          for (const [request, contextWindow, transport] of [
            [primaryRequest, primaryWindow, primaryTransport],
            [fallbackRequest, fallbackWindow, fallbackTransport],
          ] as const) {
            expect(request.contextPack?.tokenBudget).toBeLessThanOrEqual(
              contextWindow,
            );
            expect(request.contextPack?.estimatedTokens).toBeLessThanOrEqual(
              request.contextPack?.tokenBudget ?? 0,
            );
            expect(request.providerPackaging?.artifacts).toContainEqual(
              expect.objectContaining({
                artifactId: "artifact:generated:image",
                transport,
              }),
            );
            expect(request.plan?.contextProjection?.artifactRefs.map((ref) => ref.id))
              .toEqual(request.artifacts.map((input) => input.id));
          }

          expect(result.plan.attempts).toHaveLength(2);
          for (const [attempt, request] of [
            [result.plan.attempts[0], primaryRequest],
            [result.plan.attempts[1], fallbackRequest],
          ] as const) {
            expect(attempt?.context).toEqual(request.contextPack);
            expect(attempt?.providerPackaging).toEqual(request.providerPackaging);
            expect(attempt?.contextProjection?.artifactRefs.map((ref) => ref.id))
              .toEqual(request.artifacts.map((input) => input.id));
            expect(attempt?.inputHashes).toEqual(
              request.artifacts.map((input) => input.fingerprint?.value),
            );
          }
          expect(result.plan.route.selected?.providerId).toBe(
            "generated-fallback",
          );
          expect(result.plan.contextProjection).toEqual(
            result.plan.attempts[1]?.contextProjection,
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it("stops before a fallback adapter when route materialization fails", async () => {
    let fallbackCalls = 0;
    const primary = {
      id: "primary-materialization",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("primary-materialization"),
          modelId: "primary-materialization:model",
          contextWindow: 4_096,
        },
      ],
      async execute() {
        throw new Error("primary unavailable");
      },
    } satisfies ProviderAdapter;
    const fallback = {
      id: "fallback-materialization",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("fallback-materialization"),
          modelId: "fallback-materialization:model",
          contextWindow: 1_300,
        },
      ],
      async execute() {
        fallbackCalls += 1;
        return { rawOutputs: { answer: "must not execute" } };
      },
    } satisfies ProviderAdapter;
    const result = await createAI({ providers: [primary, fallback] }).run({
      task: "Terminal fallback preparation",
      artifacts: [
        artifact.text("included", {
          id: "artifact:included",
          size: { characters: 2_000 },
        }),
        artifact.text("FAILURE_SOURCE_SENTINEL", {
          id: "artifact:summary-source",
          size: { characters: 1_600 },
        }),
      ],
      outputs: { answer: "text" },
      overrides: {
        summarizer: {
          summarize() {
            throw new Error("SECRET_SUMMARIZER_CAUSE");
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(fallbackCalls).toBe(0);
    if (result.ok || result.plan.kind !== "execution-plan") {
      throw new Error("Expected a terminal materialization failure.");
    }
    expect(result.error).toMatchObject({
      kind: "context_materialization",
      reason: "summary-failed",
      terminal: true,
    });
    expect(result.plan.route.selected?.providerId).toBe(
      "fallback-materialization",
    );
    expect(result.plan.attempts).toHaveLength(2);
    expect(result.plan.attempts[1]).toMatchObject({
      providerId: "fallback-materialization",
      status: "failed",
    });
    expect(result.plan.attempts[1]?.contextProjection).toBeUndefined();
    expect(result.plan.contextProjection).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("SECRET_SUMMARIZER_CAUSE");
  });
});
