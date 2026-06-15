import { describe, expect, it } from "vitest";
import { createLiteLLMProvider } from "./litellm.js";

interface FakeFetchCapture {
  url: string;
  init: RequestInit;
  calls: number;
}

function makeFakeFetch(body: unknown, status = 200): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { url: "", init: {}, calls: 0 };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    capture.calls += 1;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;

  return { fetch: fakeFetch, capture };
}

const HAPPY_BODY = {
  id: "chatcmpl-litellm",
  object: "chat.completion",
  model: "azure/gpt-4o",
  choices: [{ message: { content: "litellm ok" } }],
  usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
};

function requestBody(capture: FakeFetchCapture): Record<string, unknown> {
  return JSON.parse(String(capture.init.body)) as Record<string, unknown>;
}

function requestHeaders(capture: FakeFetchCapture): Record<string, string> {
  return capture.init.headers as Record<string, string>;
}

describe("Phase 41 LiteLLM provider", () => {
  it("uses the default litellm id and posts to the local gateway URL", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", fetch });

    expect(adapter.id).toBe("litellm");
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    expect(capture.url).toBe("http://localhost:4000/chat/completions");
    expect(requestBody(capture).model).toBe("gpt-4o");
  });

  it("normalizes custom base URLs before appending chat completions", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({
      model: "gpt-4o",
      baseUrl: "https://gateway.example/v1/",
      fetch,
    });

    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    expect(capture.url).toBe("https://gateway.example/v1/chat/completions");
  });

  it("omits Authorization when apiKey is absent", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", fetch });

    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    const headers = requestHeaders(capture);
    expect(Object.prototype.hasOwnProperty.call(headers, "authorization")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(headers, "Authorization")).toBe(false);
  });

  it("sends provided apiKey only as a bearer Authorization header", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", apiKey: "sk-litellm", fetch });

    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    expect(requestHeaders(capture).authorization).toBe("Bearer sk-litellm");
    const body = requestBody(capture);
    expect(JSON.stringify(body.metadata)).not.toContain("sk-litellm");
  });

  it("serializes provider gateway metadata under lattice_gateway", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({
      model: "gpt-4o",
      gateway: {
        routeTags: ["prod"],
        providerPreferences: ["openai"],
        metadata: { trace_id: "trace-1" },
      },
      fetch,
    });

    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    const metadata = requestBody(capture).metadata as Record<string, unknown>;
    const latticeGateway = metadata.lattice_gateway as Record<string, unknown>;
    expect(metadata.trace_id).toBe("trace-1");
    expect(latticeGateway.route_tags).toEqual(["prod"]);
    expect(latticeGateway.provider_preferences).toEqual(["openai"]);
    expect(latticeGateway.allow_fallbacks).toBe(false);
  });

  it("merges run gateway policy over provider defaults", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({
      model: "gpt-4o",
      gateway: {
        routeTags: ["provider"],
        providerPreferences: ["openai"],
        metadata: { trace_id: "provider", shared: "provider" },
      },
      fetch,
    });

    await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
      policy: {
        gateway: {
          routeTags: ["run"],
          metadata: { generation_name: "case-1", shared: "run" },
          allowFallbacks: true,
        },
      },
    });

    const metadata = requestBody(capture).metadata as Record<string, unknown>;
    const latticeGateway = metadata.lattice_gateway as Record<string, unknown>;
    expect(metadata.trace_id).toBe("provider");
    expect(metadata.generation_name).toBe("case-1");
    expect(metadata.shared).toBe("run");
    expect(latticeGateway.route_tags).toEqual(["provider", "run"]);
    expect(latticeGateway.provider_preferences).toEqual(["openai"]);
    expect(latticeGateway.allow_fallbacks).toBe(true);
  });

  it("defaults LiteLLM gateway allow_fallbacks to false", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", fetch });

    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    const metadata = requestBody(capture).metadata as Record<string, unknown>;
    const latticeGateway = metadata.lattice_gateway as Record<string, unknown>;
    expect(latticeGateway.allow_fallbacks).toBe(false);
  });

  it("returns raw output text and normalized usage", async () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", fetch });

    const response = await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });

    expect(response.rawOutputs.text).toBe("litellm ok");
    expect(response.normalizedUsage).toEqual({
      promptTokens: 11,
      completionTokens: 7,
      costUsd: null,
    });
  });

  it("rejects non-OK OpenAI-compatible responses", async () => {
    const { fetch } = makeFakeFetch({ error: "boom" }, 500);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", fetch });

    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toThrow(/OpenAI-compatible provider failed with 500/);
  });

  it("negotiates from the registry without calling fetch", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLiteLLMProvider({ model: "gpt-4o", fetch });

    const negotiated = await adapter.negotiateCapabilities("gpt-4o");

    expect(negotiated.source).toBe("registry");
    expect(capture.calls).toBe(0);
  });

  it("exposes LiteLLM gateway quirks", () => {
    const adapter = createLiteLLMProvider({ model: "gpt-4o" });

    expect(adapter.quirks.gatewayMetadataSupported).toBe(true);
    expect(adapter.quirks.gatewayFallbacksSupported).toBe(true);
    expect(adapter.quirks.openAIErrorMapping).toBe(true);
  });
});
