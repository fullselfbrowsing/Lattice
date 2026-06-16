import { describe, expect, it } from "vitest";
import { z } from "zod";

import { artifact } from "../src/artifacts/artifact.js";
import { output } from "../src/outputs/contracts.js";
import type { PolicySpec } from "../src/policy/policy.js";
import { createLiteLLMProvider } from "../src/providers/litellm.js";
import type { ProviderAdapter } from "../src/providers/provider.js";
import { createAI } from "../src/runtime/create-ai.js";
import type { RunEvent } from "../src/tracing/tracing.js";

function makeGatewayFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({
      id: "chatcmpl-litellm",
      object: "chat.completion",
      model: "azure/gpt-4o",
      choices: [{ message: { content: "Gateway answer" } }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

describe("createAI runtime facade", () => {
  it("creates phase 1 session references without persistence behavior", () => {
    expect(createAI().session("support-case-1")).toEqual({
      id: "support-case-1",
      kind: "session-ref",
    });
  });

  it("runs a fixture provider adapter and validates typed outputs", async () => {
    const supportCase = artifact.text("support case");
    const audio = artifact.audio("call.mp3", {
      id: "artifact:audio:call",
      privacy: "sensitive",
    });
    const transcript = artifact.derive({
      id: "artifact:text:transcript",
      kind: "text",
      value: "caller transcript",
      label: "transcript",
      parents: [audio],
      transform: {
        kind: "transcription",
        name: "fixture-transcript",
      },
    });
    const toolResult = artifact.toolResult(
      { approved: true },
      {
        id: "artifact:tool-result:refund-check",
        toolName: "refundPolicyCheck",
        callId: "call_123",
      },
    );
    const providerHandle = artifact.derive({
      id: "artifact:file:provider-handle",
      kind: "file",
      source: "provider-upload",
      value: {
        provider: "fixture",
        handle: "file_fixture_123",
      },
      metadata: {
        provider: "fixture",
        handle: "file_fixture_123",
      },
      parents: [supportCase],
      transform: {
        kind: "provider-packaging",
        name: "fixture-provider-upload",
        metadata: {
          transport: "provider-upload",
        },
      },
    });
    const adapter = {
      id: "fixture",
      kind: "provider-adapter",
      execute: async (request) => {
        expect(request.task).toBe("Resolve support case");
        expect(request.artifacts).toEqual([supportCase, audio]);
        expect(request.outputs).toEqual(["answer", "action", "evidence", "generated"]);
        expect(request.policy).toEqual({
          maxCostUsd: 2,
          latency: "interactive",
          noLogging: true,
        });

        return {
          rawOutputs: {
            answer: "Refund approved.",
            action: { kind: "refund", reason: "billing mismatch" },
            evidence: [{ artifactId: "artifact:text:case" }],
            generated: [
              transcript,
              toolResult,
              providerHandle,
            ],
          },
          artifactRefs: [transcript, toolResult, providerHandle],
        };
      },
    } satisfies ProviderAdapter;
    const ai = createAI({
      providers: [adapter],
      defaults: {
        policy: {
          maxCostUsd: 10,
          latency: "interactive",
          noLogging: false,
        },
      },
    });

    const result = await ai.run({
      task: "Resolve support case",
      artifacts: [supportCase, audio],
      outputs: {
        answer: "text",
        action: z.object({
          kind: z.literal("refund"),
          reason: z.string(),
        }),
        evidence: output.citations(),
        generated: output.artifacts(),
      },
      policy: {
        maxCostUsd: 2,
        noLogging: true,
      },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outputs.answer).toBe("Refund approved.");
      expect(result.outputs.action.reason).toBe("billing mismatch");
      expect(result.artifacts).toEqual([
        {
          id: "artifact:text:transcript",
          kind: "text",
          source: "generated",
          privacy: "standard",
          mediaType: "text/plain",
          label: "transcript",
          size: {
            bytes: 17,
            characters: 17,
          },
          lineage: {
            parents: [
              {
                id: "artifact:audio:call",
                kind: "audio",
                source: "file",
                privacy: "sensitive",
                mediaType: "audio/mpeg",
              },
            ],
            transform: {
              kind: "transcription",
              name: "fixture-transcript",
            },
          },
        },
        {
          id: "artifact:tool-result:refund-check",
          kind: "tool-result",
          source: "tool",
          privacy: "standard",
          mediaType: "application/json",
          metadata: {
            callId: "call_123",
            toolName: "refundPolicyCheck",
          },
        },
        {
          id: "artifact:file:provider-handle",
          kind: "file",
          source: "provider-upload",
          privacy: "standard",
          metadata: {
            provider: "fixture",
            handle: "file_fixture_123",
          },
          lineage: {
            parents: [
              {
                id: expect.stringMatching(/^artifact:text:/),
                kind: "text",
                source: "inline",
                privacy: "standard",
                mediaType: "text/plain",
                size: {
                  bytes: 12,
                  characters: 12,
                },
              },
            ],
            transform: {
              kind: "provider-packaging",
              name: "fixture-provider-upload",
              metadata: {
                transport: "provider-upload",
              },
            },
          },
        },
      ]);
      for (const resultArtifact of result.artifacts) {
        expect(resultArtifact).not.toHaveProperty("value");
      }
      expect(result.plan.kind).toBe("execution-plan");
    }
  });

  it("records gateway policy without changing the selected Lattice route", async () => {
    const events: RunEvent[] = [];
    const provider = createLiteLLMProvider({
      model: "gpt-4o",
      apiKey: "sk-litellm-test",
      fetch: makeGatewayFetch(),
    });

    const result = await createAI({
      providers: [provider],
      events: (event) => {
        events.push(event);
      },
    }).run({
      task: "Gateway case",
      outputs: { answer: "text" },
      policy: {
        gateway: {
          routeTags: ["prod"],
          providerPreferences: ["azure"],
          metadata: { trace_id: "trace-41" },
          allowFallbacks: true,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.plan.kind).toBe("execution-plan");
    if (result.plan.kind !== "execution-plan") {
      return;
    }

    expect(result.plan.route.selected).toMatchObject({
      providerId: "litellm",
      modelId: "gpt-4o",
    });
    expect(result.plan.route.fallbackChain).toEqual([]);
    expect(result.plan.metadata?.gateway).toMatchObject({
      providerId: "litellm",
      requestedModel: "gpt-4o",
      policy: {
        routeTags: ["prod"],
        providerPreferences: ["azure"],
        metadata: { trace_id: "trace-41" },
        allowFallbacks: true,
      },
    });
    expect(events.some((event) => (
      event.kind === "provider.attempt" &&
      (event.metadata?.gateway as { readonly observedModel?: string } | undefined)
        ?.observedModel === "azure/gpt-4o"
    ))).toBe(true);
    expect(JSON.stringify(result.plan.metadata)).not.toContain("sk-");
    expect(JSON.stringify(result.events)).not.toContain("sk-");
  });

  it("returns validation failures instead of throwing", async () => {
    const adapter = {
      id: "fixture",
      kind: "provider-adapter",
      execute: async () => ({
        rawOutputs: {
          answer: 42,
        },
      }),
    } satisfies ProviderAdapter;
    const result = await createAI({ providers: [adapter] }).run({
      task: "Resolve support case",
      outputs: {
        answer: "text",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.plan.kind).toBe("execution-plan");
    }
  });

  it("returns execution unavailable when no executable adapter is configured", async () => {
    const result = await createAI({ providers: ["fixture"] }).run({
      task: "Resolve support case",
      outputs: {
        answer: "text",
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("execution_unavailable");
      expect(result.error.message).toBe(
        "No Phase 1 provider adapter with execute() is configured.",
      );
    }
  });

  it("passes the merged policy and signal to the fixture adapter", async () => {
    const defaultPolicy = {
      maxCostUsd: 10,
      privacy: "sensitive",
      noUpload: true,
    } satisfies PolicySpec;
    const runPolicy = {
      maxCostUsd: 1,
      latency: "interactive",
    } satisfies PolicySpec;
    const controller = new AbortController();
    const adapter = {
      id: "fixture",
      kind: "provider-adapter",
      execute: async (request) => {
        expect(request.policy).toEqual({
          maxCostUsd: 1,
          privacy: "sensitive",
          noUpload: true,
          latency: "interactive",
        });
        expect(request.signal).toBe(controller.signal);

        return {
          rawOutputs: {
            answer: "ok",
          },
        };
      },
    } satisfies ProviderAdapter;

    const result = await createAI({
      providers: [adapter],
      defaults: {
        policy: defaultPolicy,
      },
    }).run({
      task: "Resolve support case",
      outputs: {
        answer: "text",
      },
      policy: runPolicy,
      signal: controller.signal,
    });

    expect(result.ok).toBe(true);
  });

  it("throws an abort error before provider execution when the signal is already aborted", async () => {
    let executed = false;
    const controller = new AbortController();
    controller.abort();
    const adapter = {
      id: "fixture",
      kind: "provider-adapter",
      execute: async () => {
        executed = true;
        return {
          rawOutputs: {
            answer: "ok",
          },
        };
      },
    } satisfies ProviderAdapter;

    await expect(
      createAI({ providers: [adapter] }).run({
        task: "Resolve support case",
        outputs: {
          answer: "text",
        },
        signal: controller.signal,
      }),
    ).rejects.toThrow(/Run aborted before execution/);
    expect(executed).toBe(false);
  });
});
