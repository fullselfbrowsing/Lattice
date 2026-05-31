import { describe, expect, it } from "vitest";
import { createGeminiProvider } from "./gemini.js";

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
