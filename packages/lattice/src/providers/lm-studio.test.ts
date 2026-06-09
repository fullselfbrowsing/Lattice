import { describe, expect, it, vi } from "vitest";
import { createLmStudioProvider } from "./lm-studio.js";
import type { LmStudioQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import { unwrapInternalEnvelope } from "../sanitizers/index.js";

/**
 * Phase 4 LM Studio adapter -- vitest cases (D-09 contract: 7 minimum; ships 8).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4.
 */

interface FakeFetchCapture {
  url: string;
  init: RequestInit;
  urls: string[];
}

function makeFakeFetch(body: unknown, status = 200): {
  fetch: typeof fetch;
  capture: FakeFetchCapture;
} {
  const capture: FakeFetchCapture = { url: "", init: {}, urls: [] };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capture.url = url;
    capture.init = init;
    capture.urls.push(url);
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

describe("Phase 34: LM Studio quirks + negotiateCapabilities (registry-only)", () => {
  it("Test 1: factory return narrows to expose quirks + negotiateCapabilities", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({ model: "local-template", fetch });
    // quirks must be present and be the LmStudioQuirks type
    expect(adapter.quirks).toBeDefined();
    expect(typeof adapter.quirks).toBe("object");
    // negotiateCapabilities must be a function
    expect(typeof adapter.negotiateCapabilities).toBe("function");
    // Verify the narrowed quirks type fields exist
    const q = adapter.quirks as LmStudioQuirks;
    expect(typeof q.supportsToolChoice).toBe("boolean");
    expect(typeof q.customChatTemplateRiskFlag).toBe("boolean");
    expect(typeof q.noAuthRequired).toBe("boolean");
  });

  it("Test 2: quirks block populated per RESEARCH Q6/Pattern 2 LM Studio vocabulary", () => {
    const adapter = createLmStudioProvider({ model: "local-template" });
    const q = adapter.quirks as LmStudioQuirks;
    // 5 universal booleans (conservative defaults for local quantized models)
    expect(q.supportsToolChoice).toBe(false);
    expect(q.parallelToolCalls).toBe(false);
    expect(q.structuredOutputs).toBe(false);
    expect(q.responseFormatHonored).toBe(false);
    // streamingDiverges: true -- some LM Studio chat templates produce different output streaming vs buffered
    expect(q.streamingDiverges).toBe(true);
    // LM Studio-specific flags
    // CITED: lmstudio-bug-tracker issue 1342 -- Jinja template mismatches cause output format corruption
    expect(q.customChatTemplateRiskFlag).toBe(true);
    // VERIFIED: lm-studio.ts:35-37 -- apiKey is optional; local LM Studio needs no auth
    expect(q.noAuthRequired).toBe(true);
  });

  it("Test 3: negotiateCapabilities('local-template') resolves with source: registry + registry data", async () => {
    const adapter = createLmStudioProvider({ model: "local-template" });
    const result: NegotiatedCapabilities = await adapter.negotiateCapabilities("local-template");
    // Source must always be "registry" (no fetch, no /models endpoint)
    expect(result.source).toBe("registry");
    expect(result.modelId).toBe("local-template");
    // Phase 33 static profile: lm-studio:local-template has contextWindow: 8192
    expect(result.contextWindow).toBe(8192);
    // local_quantized class has limited capabilities -- these booleans should reflect registry profile
    expect(typeof result.supports.nativeToolCalling).toBe("boolean");
    expect(typeof result.supports.structuredOutputs).toBe("boolean");
    // knownFailureModes from registry: local_quantized has 5 failure modes per Phase 33 D-14
    expect(Array.isArray(result.knownFailureModes)).toBe(true);
    expect(result.knownFailureModes.length).toBeGreaterThan(0);
    // recommendedSanitizers: local_quantized has template_artifact_leak + internal_envelope_leak
    // -> maps to stripChatTemplateArtifacts + unwrapInternalEnvelope
    expect(Array.isArray(result.recommendedSanitizers)).toBe(true);
    expect(result.recommendedSanitizers.length).toBeGreaterThan(0);
    expect(result.recommendedSanitizers).toContain("stripChatTemplateArtifacts");
    expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
  });

  it("Test 4: negotiateCapabilities('unknown-local-model-xyz') returns empty-stub with source: registry", async () => {
    const adapter = createLmStudioProvider({ model: "unknown-local-model-xyz" });
    const result = await adapter.negotiateCapabilities("unknown-local-model-xyz");
    expect(result.source).toBe("registry");
    // Not in registry -> empty stub
    expect(result.contextWindow).toBe(0);
    expect(result.knownFailureModes).toEqual([]);
    expect(result.recommendedSanitizers).toEqual([]);
    expect(result.supports.nativeToolCalling).toBe(false);
    expect(result.supports.structuredOutputs).toBe(false);
    expect(result.supports.parallelToolCalls).toBe(false);
  });

  it("Test 5: no fetch is EVER called for negotiate() -- registry-only path", async () => {
    const { fetch, capture } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({ model: "local-template", fetch });
    await adapter.negotiateCapabilities("local-template");
    // The mocked fetch must never have been called
    expect(capture.urls.length).toBe(0);
  });

  it("Test 6: runEventSink receives zero events for registry-only path (per RESEARCH Open Question 5)", async () => {
    const eventSink = vi.fn();
    const adapter = createLmStudioProvider({
      model: "local-template",
      runEventSink: eventSink,
    });
    await adapter.negotiateCapabilities("local-template");
    // No event should be emitted for source: "registry" (intentional no-endpoint)
    expect(eventSink).not.toHaveBeenCalled();
  });

  it("Test 7: backward-compat -- existing Phase 4 tests continue to pass (factory still has execute, id, capabilities)", () => {
    const { fetch } = makeFakeFetch(HAPPY_BODY);
    const adapter = createLmStudioProvider({ model: "qwen2.5-coder-32b-instruct", fetch });
    expect(adapter.kind).toBe("provider-adapter");
    expect(adapter.id).toBe("lm-studio");
    expect(typeof adapter.execute).toBe("function");
    expect(Array.isArray(adapter.capabilities)).toBe(true);
  });
});

describe("Phase 36: LM Studio output sanitizer", () => {
  it("applies sanitizer through the delegated OpenAI-compatible adapter", async () => {
    const rawBody = {
      choices: [{ message: { content: "{\"summary\":\"Greeted the user.\"}" } }],
      usage: { prompt_tokens: 1, completion_tokens: 2 },
    };
    const { fetch } = makeFakeFetch(rawBody);
    const adapter = createLmStudioProvider({
      model: "qwen2.5-coder-32b-instruct",
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
