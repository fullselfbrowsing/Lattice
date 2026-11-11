import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { artifact } from "../artifacts/artifact.js";
import { createAI } from "../runtime/create-ai.js";
import { runAgent } from "../agent/runtime.js";
import { createOpenAICompatibleProvider, createOpenAIProvider } from "./adapters.js";
import { createAnthropicProvider } from "./anthropic.js";
import { createFakeProvider } from "./fake.js";
import { createGeminiProvider } from "./gemini.js";
import { createLmStudioProvider } from "./lm-studio.js";
import { createOpenRouterProvider } from "./openrouter.js";
import { createXaiProvider } from "./xai.js";
import { UnsupportedArtifactTransportError } from "./multimodal.js";
import { NoPublicUrlEgressError } from "./no-public-url.js";
import type { ProviderAdapter, ProviderRunRequest } from "./provider.js";
import { collectStream } from "./streaming.js";

const factories = {
  openai: (fetch: typeof globalThis.fetch) => createOpenAIProvider({ model: "test", apiKey: "secret", fetch }),
  compatible: (fetch: typeof globalThis.fetch) => createOpenAICompatibleProvider({ model: "test", baseUrl: "https://compat.test/v1", fetch }),
  openrouter: (fetch: typeof globalThis.fetch) => createOpenRouterProvider({ model: "test", apiKey: "secret", fetch }),
  xai: (fetch: typeof globalThis.fetch) => createXaiProvider({ model: "test", apiKey: "secret", fetch }),
  lmstudio: (fetch: typeof globalThis.fetch) => createLmStudioProvider({ model: "test", fetch }),
  anthropic: (fetch: typeof globalThis.fetch) => createAnthropicProvider({ model: "test", apiKey: "secret", fetch }),
  gemini: (fetch: typeof globalThis.fetch) => createGeminiProvider({ model: "test", apiKey: "secret", fetch }),
};

function response(stream: boolean): Response {
  const body = {
    choices: [{ message: { content: "ok" }, delta: { content: "ok" } }],
    content: [{ type: "text", text: "ok" }],
    candidates: [{ content: { parts: [{ text: "ok" }] } }],
  };
  return new Response(stream ? `data: ${JSON.stringify(body)}\n\n` : JSON.stringify(body), {
    headers: { "content-type": stream ? "text/event-stream" : "application/json" },
  });
}

async function submit(provider: ProviderAdapter, request: ProviderRunRequest, stream: boolean): Promise<unknown> {
  return stream
    ? collectStream(await provider.executeStream!(request))
    : provider.execute!(request);
}

function userParts(body: Record<string, any>, family: string): Record<string, any>[] {
  return family === "gemini" ? body.contents[0].parts : body.messages.at(-1).content;
}

describe.each(Object.entries(factories))("%s request delivery", (family, factory) => {
  it.each([false, true])("delivers native images, JSON, and settings; hashes exact bytes (stream=%s)", async (stream) => {
    const hashes: string[] = [];
    let capturedBody = "";
    let callbackFinished = false;
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(callbackFinished).toBe(true);
      capturedBody = String(init?.body);
      expect(hashes).toEqual([createHash("sha256").update(capturedBody, "utf8").digest("hex")]);
      return response(stream);
    }) as unknown as typeof globalThis.fetch;
    const bytes = new Uint8Array([99, 1, 2, 3, 88]);
    const inputs = [
      artifact.image(bytes.subarray(1, 4), { id: "view", mediaType: "image/png" }),
      artifact.image(new Uint8Array([1, 2, 3]).buffer, { id: "buffer", mediaType: "image/png" }),
      artifact.image(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), { id: "blob", mediaType: "image/png" }),
      artifact.image(new File([new Uint8Array([1, 2, 3])], "image.png", { type: "image/png" }), { id: "file", mediaType: "image/png" }),
      artifact.image("data:image/png;base64,AQID", { id: "data-url" }),
      artifact.image("https://images.test/photo.png", { id: "url", mediaType: "image/png" }),
      artifact.json({ list: [null, false, 0, "é", { nested: true }] }, { id: "json", metadata: { url: "https://source.test/data.json" } }),
      artifact.json(null, { id: "null" }),
      artifact.json([1, false, "text"], { id: "array" }),
      artifact.toolResult({ answer: 42 }, { id: "tool", toolName: "lookup" }),
    ];
    await submit(factory(fetch), {
      task: "Read the artifacts, including é.", artifacts: inputs, outputs: ["answer"],
      generation: { temperature: 0, maxOutputTokens: 37 },
      onRequestPrepared: async (metadata) => {
        expect(Object.keys(metadata)).toEqual(["bodyHash"]);
        expect(metadata.bodyHash).toMatch(/^[a-f0-9]{64}$/u);
        hashes.push(metadata.bodyHash);
        await Promise.resolve();
        callbackFinished = true;
      },
    }, stream);
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(capturedBody);
    const parts = userParts(body, family);
    const nativeImages = parts.filter((part) => part.type === "image_url" || part.type === "image" || part.inlineData || part.fileData);
    expect(nativeImages).toHaveLength(6);
    for (const image of nativeImages.slice(0, 5)) {
      if (family === "anthropic") expect(image.source).toEqual({ type: "base64", media_type: "image/png", data: "AQID" });
      else if (family === "gemini") expect(image.inlineData).toEqual({ mimeType: "image/png", data: "AQID" });
      else expect(image.image_url).toEqual({ url: "data:image/png;base64,AQID" });
    }
    expect(JSON.stringify(nativeImages[5])).toContain("https://images.test/photo.png");
    const textArtifacts = parts.flatMap((part) => {
      try { return [JSON.parse(part.text)]; } catch { return []; }
    }).filter((part) => part.artifactId);
    expect(textArtifacts.map((part) => part.value)).toEqual([
      { list: [null, false, 0, "é", { nested: true }] }, null, [1, false, "text"], { answer: 42 },
    ]);
    if (family === "gemini") expect(body.generationConfig).toMatchObject({ temperature: 0, maxOutputTokens: 37 });
    else {
      const field = family === "openai" ? "max_completion_tokens" : "max_tokens";
      expect(body).toMatchObject({ temperature: 0, [field]: 37 });
      if (family === "openai") expect(body).not.toHaveProperty("max_tokens");
    }
  });

  it.each([false, true])("hashes attempted failed requests without exposing response secrets (stream=%s)", async (stream) => {
    const callback = vi.fn();
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(callback).toHaveBeenCalledWith({ bodyHash: createHash("sha256").update(String(init?.body)).digest("hex") });
      return new Response("secret-from-response", { status: 503 });
    }) as unknown as typeof globalThis.fetch;
    const attempt = submit(factory(fetch), { task: "hello", artifacts: [], outputs: ["answer"], onRequestPrepared: callback }, stream);
    await expect(attempt).rejects.toThrow(/503/u);
    await expect(attempt).rejects.not.toThrow("secret-from-response");
    expect(callback).toHaveBeenCalledOnce();
  });

  it.each([false, true])("rejects unsatisfied packaging and public URLs before fetch (stream=%s)", async (stream) => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const callback = vi.fn();
    const request: ProviderRunRequest = {
      task: "read", artifacts: [artifact.image("https://images.test/photo.png", { id: "image" })],
      outputs: ["answer"], onRequestPrepared: callback,
      providerPackaging: {
        providerId: family, modelId: "test", warnings: [],
        artifacts: [{ artifactId: "image", transport: "base64", lineageTransform: "provider-packaging", warnings: [] }],
      },
    };
    await expect(submit(factory(fetch), request, stream)).rejects.toBeInstanceOf(UnsupportedArtifactTransportError);
    await expect(submit(factory(fetch), {
      task: request.task, artifacts: request.artifacts, outputs: request.outputs,
      policy: { noPublicUrl: true }, onRequestPrepared: callback,
    }, stream)).rejects.toBeInstanceOf(NoPublicUrlEgressError);
    expect(fetch).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 0, 1.5])("rejects invalid maxOutputTokens=%s", async (maxOutputTokens) => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    await expect(submit(factory(fetch), {
      task: "test", artifacts: [], outputs: [], generation: { maxOutputTokens },
    }, false)).rejects.toThrow("generation.maxOutputTokens");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, -1, 2.1])("rejects invalid temperature=%s", async (temperature) => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    await expect(submit(factory(fetch), {
      task: "test", artifacts: [], outputs: [], generation: { temperature },
    }, false)).rejects.toThrow("generation.temperature");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects lossy JSON and nested public URLs before fetch", async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    for (const value of [{ missing: undefined }, [NaN], { number: Infinity }, { fn: () => 1 }, cycle]) {
      await expect(submit(factory(fetch), { task: "test", artifacts: [{ ...artifact.json(null), value }], outputs: [] }, false))
        .rejects.toBeInstanceOf(UnsupportedArtifactTransportError);
    }
    for (const url of ["https://images.test/photo.png", 'https://images.test/?q="quoted"']) {
      await expect(submit(factory(fetch), {
        task: "test", artifacts: [artifact.json({ nested: [{ url }] })], outputs: [], policy: { noPublicUrl: true },
      }, false)).rejects.toBeInstanceOf(NoPublicUrlEgressError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops before fetch if the request observer rejects", async () => {
    const fetch = vi.fn() as unknown as typeof globalThis.fetch;
    await expect(submit(factory(fetch), {
      task: "test", artifacts: [], outputs: [], onRequestPrepared: () => { throw new Error("observer failed"); },
    }, false)).rejects.toThrow("observer failed");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("runtime generation forwarding", () => {
  it("sends byte-identical bodies for repeated equivalent runs while retaining plan context IDs", async () => {
    const bodies: string[] = [];
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return response(false);
    }) as typeof globalThis.fetch;
    const ai = createAI({ providers: [createOpenAICompatibleProvider({
      model: "test", baseUrl: "https://provider.test/v1", fetch,
    })] });
    const request = {
      task: "Read the image and JSON.", outputs: { answer: "text" as const },
      artifacts: [
        artifact.image(new Uint8Array([1, 2, 3]), { id: "image", mediaType: "image/png" }),
        artifact.json({ answer: 42 }, { id: "json" }),
      ],
      generation: { temperature: 0, maxOutputTokens: 37 },
    };
    const first = await ai.run(request);
    const second = await ai.run(request);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    if (first.plan.kind !== "execution-plan" || second.plan.kind !== "execution-plan") {
      throw new Error("Expected complete execution plans.");
    }
    const firstContext = first.plan.context;
    const secondContext = second.plan.context;
    expect(firstContext?.id).toMatch(/^context-pack:/u);
    expect(secondContext?.id).toMatch(/^context-pack:/u);
    expect(firstContext?.id).not.toBe(secondContext?.id);
    const body = JSON.parse(bodies[0]!);
    const parts = userParts(body, "compatible");
    const contextMetadata = JSON.parse(parts[1]!.text).contextPack;
    expect(contextMetadata).not.toHaveProperty("id");
    expect(contextMetadata).toEqual(Object.fromEntries(
      Object.entries(firstContext!).filter(([key]) => key !== "id" && key !== "kind"),
    ));
    expect(body).toMatchObject({ temperature: 0, max_tokens: 37 });
    expect(parts).toContainEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } });
    expect(parts.some((part) => typeof part.text === "string" && part.text.includes('"answer":42'))).toBe(true);
  });

  it("delivers packed images and JSON through ai.run", async () => {
    let body = "";
    const fetch = (async (_url: unknown, init?: RequestInit) => {
      body = String(init?.body);
      return response(false);
    }) as typeof globalThis.fetch;
    const ai = createAI({ providers: [createOpenRouterProvider({ model: "test", apiKey: "secret", fetch })] });
    const result = await ai.run({
      task: "Read the image and JSON.", outputs: { answer: "text" },
      artifacts: [
        artifact.image(new Uint8Array([1, 2, 3]), { mediaType: "image/png" }),
        artifact.json({ answer: 42 }),
      ],
      generation: { temperature: 0, maxOutputTokens: 37 },
      policy: { noPublicUrl: true },
    });
    expect(result.ok).toBe(true);
    const parts = userParts(JSON.parse(body), "openrouter");
    expect(parts).toContainEqual({ type: "image_url", image_url: { url: "data:image/png;base64,AQID" } });
    expect(parts.some((part) => typeof part.text === "string" && part.text.includes('"answer":42'))).toBe(true);
  });

  it("forwards optional settings through run and runAgent", async () => {
    const seen: unknown[] = [];
    const provider = createFakeProvider({ response: (request) => {
      seen.push(request.generation);
      return { rawOutputs: { answer: "ok" } };
    } });
    const generation = { temperature: 0, maxOutputTokens: 41 };
    const ai = createAI({ providers: [provider] });
    expect((await ai.run({ task: "hello", outputs: { answer: "text" }, generation })).ok).toBe(true);
    expect((await runAgent({ task: "hello", tools: [], generation }, { providers: [provider] })).kind).toBe("success");
    expect(seen).toEqual([generation, generation]);
    await expect(ai.run({ task: "hello", outputs: { answer: "text" }, generation: { temperature: NaN } })).rejects.toThrow("generation.temperature");
    await expect(runAgent({ task: "hello", tools: [], generation: { temperature: Infinity } }, { providers: [provider] })).rejects.toThrow("generation.temperature");
    expect(seen).toHaveLength(2);
  });

  it.each([
    [undefined, "https://api.openai.com/v1"],
    ["https://proxy.test", "https://proxy.test/v1"],
    ["https://proxy.test/", "https://proxy.test/v1"],
    ["https://proxy.test/v1", "https://proxy.test/v1"],
    ["https://proxy.test/v1/", "https://proxy.test/v1"],
    ["https://gateway.ai.cloudflare.com/v1/acct/gw/openai", "https://gateway.ai.cloudflare.com/v1/acct/gw/openai"],
    ["https://proxy.test/openai/", "https://proxy.test/openai"],
    ["https://proxy.test/openai/v1", "https://proxy.test/openai/v1"],
  ] as const)("resolves OpenAI endpoint for %s", async (baseUrl, base) => {
    const urls: string[] = [];
    const fetch = (async (url: unknown) => { urls.push(String(url)); return response(false); }) as typeof globalThis.fetch;
    const provider = createOpenAIProvider({ model: "test", apiKey: "secret", fetch, ...(baseUrl ? { baseUrl } : {}) });
    await provider.execute!({ task: "hello", artifacts: [], outputs: ["answer"] });
    await provider.negotiateCapabilities("test");
    expect(urls).toEqual([`${base}/chat/completions`, `${base}/models`]);
  });

  it("streams to a path-prefixed OpenAI base as given", async () => {
    const urls: string[] = [];
    const fetch = (async (url: unknown) => { urls.push(String(url)); return response(true); }) as typeof globalThis.fetch;
    const provider = createOpenAIProvider({ model: "test", apiKey: "secret", fetch, baseUrl: "https://proxy.test/openai/" });
    await collectStream(await provider.executeStream!({ task: "hello", artifacts: [], outputs: ["answer"] }));
    expect(urls).toEqual(["https://proxy.test/openai/chat/completions"]);
  });

  it("keeps OpenAI-compatible path-prefixed base URLs as given", async () => {
    const urls: string[] = [];
    const fetch = (async (url: unknown) => { urls.push(String(url)); return response(false); }) as typeof globalThis.fetch;
    const provider = createOpenAICompatibleProvider({ model: "test", baseUrl: "https://proxy.test/openai/", fetch });
    await provider.execute!({ task: "hello", artifacts: [], outputs: ["answer"] });
    expect(urls).toEqual(["https://proxy.test/openai/chat/completions"]);
  });
});
