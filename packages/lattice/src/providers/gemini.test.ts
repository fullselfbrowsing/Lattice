import { describe, expect, it } from "vitest";
import { z } from "zod";
import { artifact } from "../artifacts/artifact.js";
import type { ArtifactInput } from "../artifacts/artifact.js";
import type { ProviderPackagingPlan, SelectedRoute } from "../plan/plan.js";
import { createGeminiProvider } from "./gemini.js";
import { packageArtifactsForProvider } from "./packaging.js";
import { collectStream } from "./streaming.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import { NegotiationAuthError } from "../capabilities/negotiate.js";
import type { RunEvent } from "../tracing/tracing.js";
import { unwrapInternalEnvelope } from "../sanitizers/index.js";
import { defineTool } from "../tools/tools.js";

/**
 * Phase 4 Gemini adapter -- vitest cases (D-09 contract: 7 cases minimum; ships 10).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4. Real-runtime tests: each case calls
 * adapter.execute() against a fake fetch returning a structured Response.
 * No static-text greps; no live API calls (D-10 + D-11).
 */

interface FakeFetchCapture {
  url: string;
  init: RequestInit;
}

function makeFakeFetch(body: unknown, status = 200): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { url: "", init: {} };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

const encoder = new TextEncoder();

function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function makeStreamingFetch(chunks: readonly string[], status = 200): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { url: "", init: {} };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      }),
      {
        status,
        headers: { "content-type": "text/event-stream" },
      },
    );
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

const GEMINI_ROUTE: SelectedRoute = {
  providerId: "gemini",
  modelId: "gemini-2.0-flash",
  score: 0,
  estimates: { inputTokens: 1, outputTokens: 1 },
  inputModalities: ["text", "image", "audio", "video"],
  outputModalities: ["text"],
  fileTransport: ["inline", "json", "url", "base64", "file-id"],
};

function geminiPackaging(artifacts: readonly ArtifactInput[]): ProviderPackagingPlan {
  return packageArtifactsForProvider({
    artifacts,
    route: GEMINI_ROUTE,
  }).plan;
}

function geminiParts(body: Record<string, unknown>): readonly Record<string, unknown>[] {
  const contents = body.contents as readonly { parts: readonly Record<string, unknown>[] }[];
  return contents[0]?.parts ?? [];
}

/**
 * Multi-URL fake fetch for negotiate tests that receive multiple requests.
 */
interface MultiCapture {
  urls: string[];
  inits: RequestInit[];
}

function makeMultiFetch(responses: Array<{ body: unknown; status?: number }>): {
  fetch: typeof fetch;
  capture: MultiCapture;
} {
  const capture: MultiCapture = { urls: [], inits: [] };
  let callCount = 0;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.urls.push(url);
    capture.inits.push(init);
    const resp = responses[callCount] ?? responses[responses.length - 1]!;
    callCount += 1;
    return new Response(JSON.stringify(resp.body), {
      status: resp.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

const HAPPY_BODY = {
  candidates: [
    {
      content: {
        parts: [{ text: "hello gemini" }],
        role: "model",
      },
    },
  ],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    totalTokenCount: 150,
  },
};

const searchTool = defineTool({
  name: "search",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "ok",
});

// Load the fixture (used in negotiate tests)
import geminiModelsOk from "../../test/__fixtures__/quirks/gemini-models-ok.json";
import geminiModels401 from "../../test/__fixtures__/quirks/gemini-models-401.json";
import geminiModels503 from "../../test/__fixtures__/quirks/gemini-models-503.json";

describe("Phase 4 Gemini adapter", () => {
  it("Test 1 (D-09.1): factory identity -- kind, id, capabilities populated", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash-exp",
      apiKey: "AIza-test",
      fetch,
    });
    expect(adapter.kind).toBe("provider-adapter");
    expect(adapter.id).toBe("gemini");
    expect(adapter.capabilities).toBeDefined();
    expect(adapter.capabilities?.length).toBeGreaterThan(0);
    expect(adapter.capabilities?.[0]?.modelId).toBe("gemini-2.0-flash-exp");
  });

  it("Test 2 (D-09.2): request shape -- contents[].parts[].text + safetySettings (FSB BLOCK_NONE convention)", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    await adapter.execute!({
      task: "task-text-here",
      artifacts: [],
      outputs: ["text"],
    });
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(Array.isArray(body.contents)).toBe(true);
    const contents = body.contents as readonly { role: string; parts: readonly { text: string }[] }[];
    expect(contents[0]?.role).toBe("user");
    expect(contents[0]?.parts[0]?.text).toBe("task-text-here");

    // safetySettings: 4 BLOCK_NONE entries (FSB convention mirrored from universal-provider.js:255-272)
    expect(Array.isArray(body.safetySettings)).toBe(true);
    const safety = body.safetySettings as readonly { category: string; threshold: string }[];
    expect(safety.length).toBe(4);
    const categories = new Set(safety.map((s) => s.category));
    expect(categories.has("HARM_CATEGORY_HARASSMENT")).toBe(true);
    expect(categories.has("HARM_CATEGORY_HATE_SPEECH")).toBe(true);
    expect(categories.has("HARM_CATEGORY_SEXUALLY_EXPLICIT")).toBe(true);
    expect(categories.has("HARM_CATEGORY_DANGEROUS_CONTENT")).toBe(true);
    for (const s of safety) {
      expect(s.threshold).toBe("BLOCK_NONE");
    }

    // generationConfig
    expect(body.generationConfig).toBeDefined();
    const cfg = body.generationConfig as Record<string, unknown>;
    expect(typeof cfg.maxOutputTokens).toBe("number");
  });

  it("Gemini packages image artifacts as inlineData parts", async () => {
    const image = artifact.image(new Blob(["png"], { type: "image/png" }), {
      id: "gemini-image",
    });
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });

    await adapter.execute!({
      task: "describe",
      artifacts: [image],
      outputs: ["text"],
      providerPackaging: geminiPackaging([image]),
    });

    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    const parts = geminiParts(body);
    expect(parts[0]).toEqual({ text: "describe" });
    expect(parts[1]).toEqual({
      inlineData: {
        mimeType: "image/png",
        data: "cG5n",
      },
    });
  });

  it("Gemini packages audio file references as fileData parts", async () => {
    const audio = artifact.audio("local-audio.mp3", {
      id: "gemini-audio",
      mediaType: "audio/mpeg",
      metadata: { geminiFileUri: "files/audio-123" },
    });
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });

    await adapter.execute!({
      task: "describe",
      artifacts: [audio],
      outputs: ["text"],
      providerPackaging: geminiPackaging([audio]),
    });

    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(geminiParts(body)[1]).toEqual({
      fileData: {
        mimeType: "audio/mpeg",
        fileUri: "files/audio-123",
      },
    });
  });

  it("Gemini packages video URL artifacts as fileData parts", async () => {
    const video = {
      id: "gemini-video",
      kind: "video",
      source: "file",
      value: "https://cdn.example.test/clip.mp4",
      mediaType: "video/mp4",
      privacy: "standard",
    } satisfies ArtifactInput;
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });

    await adapter.execute!({
      task: "describe",
      artifacts: [video],
      outputs: ["text"],
      providerPackaging: geminiPackaging([video]),
    });

    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(geminiParts(body)[1]).toEqual({
      fileData: {
        mimeType: "video/mp4",
        fileUri: "https://cdn.example.test/clip.mp4",
      },
    });
  });

  it("Test 3 (D-09.3): response parsing -- extracts candidates[0].content.parts[0].text", async () => {
    const { fetch } = makeFakeFetch({
      candidates: [{ content: { parts: [{ text: "extracted gemini text" }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    });
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.rawOutputs.text).toBe("extracted gemini text");
  });

  it("Test 4 (D-09.4): usage extraction -- promptTokenCount/candidatesTokenCount (Gemini-specific shape)", async () => {
    const { fetch } = makeFakeFetch({
      candidates: [{ content: { parts: [{ text: "hi" }] } }],
      usageMetadata: {
        promptTokenCount: 200,
        candidatesTokenCount: 80,
        totalTokenCount: 280,
      },
    });
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.normalizedUsage?.promptTokens).toBe(200);
    expect(response.normalizedUsage?.completionTokens).toBe(80);
    expect(response.normalizedUsage?.costUsd).toBeNull();
    expect(response.usage?.inputTokens).toBe(200);
    expect(response.usage?.outputTokens).toBe(80);
    expect(response.usage?.totalTokens).toBe(280);
  });

  it("Test 5 (D-09.5): error handling -- non-OK throws with provider name + status", async () => {
    const { fetch } = makeFakeFetch({ error: "boom" }, 500);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toThrow(/Gemini provider failed with 500\./);
  });

  it("Test 6 (D-09.6): pricing applied -> costUsd computed; absent -> null", async () => {
    const { fetch: f1 } = makeFakeFetch({
      candidates: [{ content: { parts: [{ text: "hi" }] } }],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
    });
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch: f1,
      pricing: { inputPer1kTokens: 0.00125, outputPer1kTokens: 0.005 },
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // (1000 * 0.00125 + 500 * 0.005) / 1000 = (1.25 + 2.5) / 1000 = 0.00375
    expect(response.normalizedUsage?.costUsd).toBeCloseTo(0.00375, 8);

    const { fetch: f2 } = makeFakeFetch({
      candidates: [{ content: { parts: [{ text: "hi" }] } }],
      usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 },
    });
    const adapter2 = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch: f2,
    });
    const response2 = await adapter2.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response2.normalizedUsage?.costUsd).toBeNull();
  });

  it("Test 7 (D-09.7): AbortSignal wiring -- request.signal propagates to fetch", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    const controller = new AbortController();
    await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
      signal: controller.signal,
    });
    expect(capture.init.signal).toBe(controller.signal);
  });

  it("Test 8: missing candidates -> throws 'Gemini provider returned no candidates.'", async () => {
    const { fetch } = makeFakeFetch({ candidates: [] });
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toThrow(/Gemini provider returned no candidates\./);
  });

  it("Test 9: URL contains `?key=<apiKey>` query string and `:generateContent` segment", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-runtime-secret-XYZ",
      fetch,
    });
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });
    expect(capture.url).toMatch(/\/v1beta\/models\/gemini-1\.5-flash:generateContent/);
    expect(capture.url).toMatch(/[?&]key=AIza-runtime-secret-XYZ/);
  });

  it("Test 10 (D-07): role mapping preserved -- role 'user' (NOT 'system'; NOT 'assistant')", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    const contents = body.contents as readonly { role: string }[];
    for (const c of contents) {
      expect(c.role === "user" || c.role === "model").toBe(true);
      expect(c.role).not.toBe("assistant");
      expect(c.role).not.toBe("system");
    }
  });
});

describe("Phase 36: Gemini output sanitizer", () => {
  it("unwraps internal envelope output and preserves rawResponse", async () => {
    const rawBody = {
      candidates: [
        {
          content: { parts: [{ text: "{\"summary\":\"Greeted the user.\"}" }] },
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    };
    const { fetch } = makeFakeFetch(rawBody);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
      sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
    });

    const response = await adapter.execute!({
      task: "hi",
      artifacts: [],
      outputs: ["text"],
    });

    expect(response.rawOutputs.text).toBe("Greeted the user.");
    expect(response.rawResponse).toEqual(rawBody);
  });
});

describe("Phase 37: Gemini tool-call validation", () => {
  it("returns validated toolCalls and preserves raw Gemini response data", async () => {
    const rawBody = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: `{"tool_calls":[{"id":"c1","name":"search","args":{"query":"ok"}}]}`,
              },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    };
    const { fetch } = makeFakeFetch(rawBody);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
      validateToolCalls: { tools: [searchTool] },
    });

    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });

    expect(response.rawOutputs.text).toBe(rawBody.candidates[0]?.content.parts[0]?.text);
    expect(response.rawResponse).toEqual(rawBody);
    expect(response.toolCalls).toEqual([
      { id: "c1", name: "search", args: { query: "ok" } },
    ]);
  });

  it("throws for hallucinated tool names before returning invalid calls", async () => {
    const { fetch } = makeFakeFetch({
      candidates: [
        {
          content: {
            parts: [
              {
                text: `{"tool_calls":[{"id":"bad-1","name":"search_database","args":{"quer":"..."}}]}`,
              },
            ],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
    });
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
      validateToolCalls: { tools: [searchTool], onFailure: "throw" },
    });

    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toMatchObject({
      reason: "unknown_tool",
      toolName: "search_database",
      requestId: "bad-1",
    });
  });
});

describe("Phase 44: Gemini streaming", () => {
  it("streams Gemini text parts through executeStream", async () => {
    const { fetch, capture } = makeStreamingFetch([
      sseData({
        candidates: [{ content: { parts: [{ text: "hel" }] } }],
      }),
      sseData({
        candidates: [{ content: { parts: [{ text: "lo" }] } }],
      }),
    ]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
    });

    const response = await collectStream(await adapter.executeStream!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    }));

    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(capture.url).toContain(":streamGenerateContent");
    expect(capture.url).toContain("key=AIza-test");
    expect(capture.url).toContain("alt=sse");
    expect(Array.isArray(body.contents)).toBe(true);
    expect(response.rawOutputs.text).toBe("hello");
  });

  it("Gemini streaming uses the multimodal request body", async () => {
    const image = artifact.image(new Blob(["png"], { type: "image/png" }), {
      id: "stream-image",
    });
    const { fetch, capture } = makeStreamingFetch([
      sseData({
        candidates: [{ content: { parts: [{ text: "ok" }] } }],
      }),
    ]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
    });

    await collectStream(await adapter.executeStream!({
      task: "describe",
      artifacts: [image],
      outputs: ["text"],
      providerPackaging: geminiPackaging([image]),
    }));

    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(geminiParts(body)[1]).toEqual({
      inlineData: {
        mimeType: "image/png",
        data: "cG5n",
      },
    });
  });

  it("streams Gemini functionCall parts into validated toolCalls", async () => {
    const { fetch } = makeStreamingFetch([
      sseData({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "search",
                    args: { query: "ok" },
                  },
                },
              ],
            },
          },
        ],
      }),
    ]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
      validateToolCalls: { tools: [searchTool] },
    });

    const response = await collectStream(await adapter.executeStream!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    }));

    expect(response.toolCalls).toEqual([
      { id: "gemini-function-call-0-0", name: "search", args: { query: "ok" } },
    ]);
  });

  it("streams Gemini usageMetadata into final complete chunk", async () => {
    const { fetch } = makeStreamingFetch([
      sseData({
        candidates: [{ content: { parts: [{ text: "usage" }] } }],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
      sseData({
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 8,
        },
      }),
    ]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
    });

    const response = await collectStream(await adapter.executeStream!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    }));

    expect(response.usage).toEqual({
      inputTokens: 5,
      outputTokens: 3,
      totalTokens: 8,
    });
    expect(response.normalizedUsage).toEqual({
      promptTokens: 5,
      completionTokens: 3,
      costUsd: null,
    });
  });

  it("Gemini executeStream throws on non-OK response", async () => {
    const { fetch } = makeStreamingFetch([], 503);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
    });

    await expect(
      collectStream(await adapter.executeStream!({
        task: "t",
        artifacts: [],
        outputs: ["text"],
      })),
    ).rejects.toThrow("Gemini provider failed with 503.");
  });
});

describe("Phase 34: Gemini quirks + negotiateCapabilities", () => {
  it("Test 1: factory return narrows to expose quirks: GeminiQuirks + negotiateCapabilities", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    // quirks must be an object (not undefined)
    expect(adapter.quirks).toBeDefined();
    expect(typeof adapter.quirks).toBe("object");
    // negotiateCapabilities must be a function
    expect(typeof adapter.negotiateCapabilities).toBe("function");
  });

  it("Test 2: quirks block populated with 8 verified values per RESEARCH §Q6 Gemini vocabulary", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    expect(adapter.quirks.supportsToolChoice).toBe(true);
    expect(adapter.quirks.parallelToolCalls).toBe(true);
    expect(adapter.quirks.structuredOutputs).toBe(true);
    expect(adapter.quirks.responseFormatHonored).toBe(true);
    expect(adapter.quirks.streamingDiverges).toBe(false);
    expect(adapter.quirks.responseSchemaSupported).toBe(true);
    expect(adapter.quirks.safetySettingsConfigurable).toBe(true);
    expect(adapter.quirks.systemInstructionSupported).toBe(true);
  });

  it("Test 3: happy path with medium-thick derivation -- mocked fetch returns gemini-models-ok.json", async () => {
    const { fetch } = makeFakeFetch(geminiModelsOk);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    const result = await adapter.negotiateCapabilities("gemini-2.0-flash");
    expect(result.source).toBe("live");
    expect(result.modelId).toBe("gemini-2.0-flash");
    // THICK derivation: inputTokenLimit from upstream
    expect(result.contextWindow).toBe(1000000);
    // From supportedGenerationMethods including "streamGenerateContent"
    expect(result.supports.streaming).toBe(true);
    // From supportedGenerationMethods including "generateContent"
    expect(result.supports.nativeToolCalling).toBe(true);
    // Adapter posture (responseSchemaSupported)
    expect(result.supports.structuredOutputs).toBe(true);
    expect(result.supports.parallelToolCalls).toBe(true);
    // thinking: false for gemini-2.0-flash in fixture
    expect(result.supports.extendedThinking).toBe(false);
  });

  it("Test 4: thinking: true model -- supports.extendedThinking = true from upstream", async () => {
    const { fetch } = makeFakeFetch(geminiModelsOk);
    const adapter = createGeminiProvider({
      model: "gemini-2.5-pro",
      apiKey: "AIza-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    const result = await adapter.negotiateCapabilities("gemini-2.5-pro");
    expect(result.source).toBe("live");
    // thinking: true in fixture for gemini-2.5-pro
    expect(result.supports.extendedThinking).toBe(true);
  });

  it("Test 5: 401 auth error throws NegotiationAuthError with adapter: 'gemini'", async () => {
    const { fetch } = makeFakeFetch(geminiModels401, 401);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "bad-key",
      fetch,
      modelsCacheTtlMs: 0,
      modelsRetryCount: 0,
    });
    await expect(adapter.negotiateCapabilities("gemini-2.0-flash")).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof NegotiationAuthError &&
        err.adapter === "gemini" &&
        err.httpStatus === 401,
    );
  });

  it("Test 6: 503 transient fallback -- returns registry-fallback + emits event", async () => {
    const events: RunEvent[] = [];
    const { fetch } = makeFakeFetch(geminiModels503, 503);
    const adapter = createGeminiProvider({
      model: "gemini-2.5-pro",
      apiKey: "AIza-test",
      fetch,
      modelsCacheTtlMs: 0,
      modelsRetryCount: 0,
      runEventSink: (ev) => { events.push(ev); },
    });
    const result = await adapter.negotiateCapabilities("gemini-2.5-pro");
    // gemini-2.5-pro is in registry.static.ts
    expect(result.source).toBe("registry-fallback");
    // RunEvent emitted (1 fallback event)
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.kind).toBe("capabilities.negotiation.fallback");
    expect(events[0]?.metadata?.adapter).toBe("gemini");
  });

  it("Test 7: cache hit -- two sequential calls; fetch called once", async () => {
    const { fetch: fakeFetch, capture } = makeMultiFetch([
      { body: geminiModelsOk, status: 200 },
      { body: geminiModelsOk, status: 200 },
    ]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 60_000, // 1 minute cache
    });
    const r1 = await adapter.negotiateCapabilities("gemini-2.0-flash");
    const r2 = await adapter.negotiateCapabilities("gemini-2.0-flash");
    // Second call should use cache -- fetch only called once
    expect(capture.urls.length).toBe(1);
    expect(r1.contextWindow).toBe(r2.contextWindow);
  });

  it("Test 7 (inflight coalescing): 5 concurrent calls; fetch called once", async () => {
    const { fetch: fakeFetch, capture } = makeMultiFetch([{ body: geminiModelsOk, status: 200 }]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 60_000,
    });
    const results = await Promise.all([
      adapter.negotiateCapabilities("gemini-2.0-flash"),
      adapter.negotiateCapabilities("gemini-2.0-flash"),
      adapter.negotiateCapabilities("gemini-2.0-flash"),
      adapter.negotiateCapabilities("gemini-2.0-flash"),
      adapter.negotiateCapabilities("gemini-2.0-flash"),
    ]);
    // Inflight coalescing: only 1 fetch despite 5 concurrent calls
    expect(capture.urls.length).toBe(1);
    // All 5 resolve to same contextWindow
    const ctxs = results.map((r) => r.contextWindow);
    expect(new Set(ctxs).size).toBe(1);
  });

  it("Test 8: header auth verification -- x-goog-api-key HEADER, NOT ?key= query-string", async () => {
    const { fetch: fakeFetch, capture } = makeMultiFetch([{ body: geminiModelsOk, status: 200 }]);
    const adapter = createGeminiProvider({
      model: "gemini-2.0-flash",
      apiKey: "AIza-secret-key",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });
    await adapter.negotiateCapabilities("gemini-2.0-flash");
    // URL must NOT contain ?key= (key not in query string)
    expect(capture.urls[0]).not.toMatch(/[?&]key=/);
    // Headers MUST contain x-goog-api-key
    const headers = capture.inits[0]?.headers as Record<string, string> | undefined;
    expect(headers?.["x-goog-api-key"]).toBe("AIza-secret-key");
  });

  it("Test 9: lenient parse -- missing 'thinking' field does not crash; extendedThinking = false", async () => {
    const { fetch: fakeFetch } = makeFakeFetch(geminiModelsOk);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash-001",
      apiKey: "AIza-test",
      fetch: fakeFetch,
      modelsCacheTtlMs: 0,
    });
    // gemini-1.5-flash-001 has NO thinking field in the fixture (lenient parse)
    const result = await adapter.negotiateCapabilities("gemini-1.5-flash-001");
    expect(result.source).toBe("live");
    expect(result.supports.extendedThinking).toBe(false);
    // contextWindow derived from inputTokenLimit: 32768
    expect(result.contextWindow).toBe(32768);
    // No streamGenerateContent in supportedGenerationMethods -> streaming: false
    expect(result.supports.streaming).toBe(false);
  });
});
