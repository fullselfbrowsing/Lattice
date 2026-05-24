import { describe, expect, it } from "vitest";
import { createLmStudioProvider } from "./lm-studio.js";

/**
 * Phase 4 LM Studio adapter -- vitest cases (D-09 contract: 7 minimum; ships 8).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4.
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
  choices: [{ message: { content: "hello lm-studio" } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

describe("Phase 4 LM Studio adapter", () => {
  it("Test 1 (D-09.1): factory identity -- kind, id, capabilities populated", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch,
    });
    expect(adapter.kind).toBe("provider-adapter");
    expect(adapter.id).toBe("lm-studio");
    expect(adapter.capabilities).toBeDefined();
    expect(adapter.capabilities?.length).toBeGreaterThan(0);
    expect(adapter.capabilities?.[0]?.modelId).toBe("qwen2.5-coder-32b-instruct");
  });

  it("Test 2 (D-09.2): request shape -- default base URL is localhost:1234/v1", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch,
    });
    await adapter.execute!({
      task: "task-text",
      artifacts: [],
      outputs: ["text"],
    });
    expect(capture.url).toMatch(/localhost:1234\/v1\/chat\/completions/);
    const body = JSON.parse(String(capture.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen2.5-coder-32b-instruct");
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("Test 3 (D-09.3): response parsing -- extracts choices[0].message.content", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "extracted lm-studio text" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    });
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch,
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    expect(response.rawOutputs.text).toBe("extracted lm-studio text");
  });

  it("Test 4 (D-09.4): usage extraction -- standard prompt_tokens/completion_tokens", async () => {
    const { fetch } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 200, completion_tokens: 80 },
    });
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
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
  });

  it("Test 5 (D-09.5): error handling -- non-OK throws", async () => {
    const { fetch } = makeFakeFetch({ error: "boom" }, 500);
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch,
    });
    await expect(
      adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
    ).rejects.toThrow(/OpenAI-compatible provider failed with 500\./);
  });

  it("Test 6 (D-09.6): pricing applied -> costUsd computed (LM Studio is local; pricing reflects compute cost when modeled)", async () => {
    const { fetch: f1 } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    });
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch: f1,
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
    });
    const response = await adapter.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // LM Studio runs locally -- pricing 0 yields costUsd === 0 (NOT null;
    // distinguishes "free" from "unmeasured" per 07-CONTEXT.md
    // cost-normalization decision)
    expect(response.normalizedUsage?.costUsd).toBe(0);

    const { fetch: f2 } = makeFakeFetch({
      choices: [{ message: { content: "hi" } }],
      usage: { prompt_tokens: 1000, completion_tokens: 500 },
    });
    const adapter2 = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch: f2,
    });
    const response2 = await adapter2.execute!({
      task: "t",
      artifacts: [],
      outputs: ["text"],
    });
    // No pricing supplied -> costUsd === null (unmeasured)
    expect(response2.normalizedUsage?.costUsd).toBeNull();
  });

  it("Test 7 (D-09.7): AbortSignal wiring -- propagates to fetch", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
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

  it("Test 8 (CD-03): no Authorization header when apiKey omitted (LM Studio default noAuth)", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
      fetch,
    });
    await adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] });
    const headers = capture.init.headers as Record<string, string>;
    // No Authorization / authorization key when apiKey omitted (CD-03 default).
    const hasAuth =
      Object.prototype.hasOwnProperty.call(headers, "authorization") ||
      Object.prototype.hasOwnProperty.call(headers, "Authorization");
    expect(hasAuth).toBe(false);
  });
});
