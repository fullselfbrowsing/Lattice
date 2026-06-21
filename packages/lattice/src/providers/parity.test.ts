import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";
import { NoPublicUrlEgressError } from "./no-public-url.js";
import { artifact } from "../artifacts/artifact.js";
import { createLiteLLMProvider } from "./litellm.js";
import { createLmStudioProvider } from "./lm-studio.js";
import { createOpenRouterProvider } from "./openrouter.js";
import { createXaiProvider } from "./xai.js";
import {
  createOpenAICompatibleProvider,
  createOpenAIProvider,
} from "./adapters.js";
import { collectStream } from "./streaming.js";
import { unwrapInternalEnvelope } from "../sanitizers/index.js";
import { defineTool } from "../tools/tools.js";
import type { ValidateToolCallsOption } from "../tools/tool-call-validation.js";

import type { ProviderAdapter } from "./provider.js";

/**
 * Phase 4 -- INV-03 provider-parity smoke. Iterates all first-party logical providers
 * against provider-shaped fake fetch responses; asserts each adapter returns
 * a ProviderRunResponse with rawOutputs populated, normalizedUsage shape,
 * AbortSignal wiring, distinct provider ids, and consistent non-OK error
 * behavior.
 *
 * INV-03 ("every improvement works equally across all first-party universal-provider.js
 * targets") is the hard gate for this milestone; this file is the substantive
 * proof. All first-party adapters are exercised through the same behavior
 * matrix.
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-12: INV-03 parity smoke).
 */

interface FakeFetchCapture {
  url: string;
  init: RequestInit;
}

function makeFakeFetchCapturing(body: unknown, status = 200): {
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
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;
}

function sseEvent(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function makeStreamingFetchCapturing(chunks: readonly string[]): {
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
      { headers: { "content-type": "text/event-stream" } },
    );
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

/**
 * Per-provider fake response body (each provider has a quirky response shape;
 * the parity smoke must use provider-appropriate fixtures so the adapters'
 * parsers extract content correctly).
 */
const OPENAI_COMPAT_BODY = {
  choices: [{ message: { content: "openai-compat hello" } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

const ANTHROPIC_BODY = {
  content: [{ type: "text", text: "anthropic hello" }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

const GEMINI_BODY = {
  candidates: [
    {
      content: { parts: [{ text: "gemini hello" }], role: "model" },
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
};

const searchTool = defineTool({
  name: "search",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "ok",
});

interface ProviderRow {
  readonly logicalName: string;
  readonly expectedId: string;
  readonly fakeBody: unknown;
  readonly errorPattern: RegExp;
  readonly build: (options: { fetch: typeof fetch }) => ProviderAdapter;
}

const PROVIDERS: readonly ProviderRow[] = [
  {
    logicalName: "OpenAI",
    expectedId: "openai",
    fakeBody: OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createOpenAIProvider({
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        fetch,
      }),
  },
  {
    logicalName: "OpenAI-compatible",
    expectedId: "openai-compatible",
    fakeBody: OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createOpenAICompatibleProvider({
        model: "any-model",
        baseUrl: "https://example.com/v1",
        apiKey: "sk-test",
        fetch,
      }),
  },
  {
    logicalName: "Anthropic",
    expectedId: "anthropic",
    fakeBody: ANTHROPIC_BODY,
    errorPattern: /Anthropic provider failed with/,
    build: ({ fetch }) =>
      createAnthropicProvider({
        model: "claude-3-opus",
        apiKey: "sk-ant-test",
        fetch,
      }),
  },
  {
    logicalName: "Gemini",
    expectedId: "gemini",
    fakeBody: GEMINI_BODY,
    errorPattern: /Gemini provider failed with/,
    build: ({ fetch }) =>
      createGeminiProvider({
        model: "gemini-1.5-flash",
        apiKey: "AIza-test",
        fetch,
      }),
  },
  {
    logicalName: "xAI",
    expectedId: "xai",
    fakeBody: OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createXaiProvider({
        model: "grok-4",
        apiKey: "xai-test",
        fetch,
      }),
  },
  {
    logicalName: "OpenRouter",
    expectedId: "openrouter",
    fakeBody: OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createOpenRouterProvider({
        model: "openai/gpt-4o",
        apiKey: "sk-or-test",
        fetch,
      }),
  },
  {
    logicalName: "LM Studio",
    expectedId: "lm-studio",
    fakeBody: OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createLmStudioProvider({
        model: "qwen2.5-coder-32b-instruct",
        fetch,
      }),
  },
  {
    logicalName: "LiteLLM",
    expectedId: "litellm",
    fakeBody: OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createLiteLLMProvider({
        model: "gpt-4o",
        apiKey: "sk-litellm-test",
        fetch,
      }),
  },
];

function streamingChunksForProvider(providerId: string, text: string): readonly string[] {
  if (providerId === "anthropic") {
    return [
      sseEvent("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text },
      }),
      sseEvent("message_delta", {
        type: "message_delta",
        usage: { output_tokens: 1 },
      }),
      sseEvent("message_stop", { type: "message_stop" }),
    ];
  }

  if (providerId === "gemini") {
    return [
      sseData({
        candidates: [{ content: { parts: [{ text }] } }],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
    ];
  }

  return [
    sseData({
      model: `${providerId}:observed`,
      choices: [{ delta: { content: text } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }),
    sseData("[DONE]"),
  ];
}

describe("INV-03 provider-parity smoke (Phase 4)", () => {
  it("Test 1 (INV-03): all first-party logical providers expose ProviderAdapter shape", () => {
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      expect(adapter.kind, `${row.logicalName}: kind`).toBe("provider-adapter");
      expect(adapter.id, `${row.logicalName}: id`).toBe(row.expectedId);
      expect(adapter.capabilities, `${row.logicalName}: capabilities`).toBeDefined();
      expect(adapter.capabilities?.length, `${row.logicalName}: capabilities length`).toBeGreaterThan(0);
      expect(typeof adapter.execute, `${row.logicalName}: execute is function`).toBe("function");
    }
  });

  it("Test 2 (INV-03): each provider populates rawOutputs[name] as string content", async () => {
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      const response = await adapter.execute!({
        task: `task-for-${row.logicalName}`,
        artifacts: [],
        outputs: ["text"],
      });
      expect(response.rawOutputs, `${row.logicalName}: rawOutputs`).toBeDefined();
      expect(typeof response.rawOutputs.text, `${row.logicalName}: rawOutputs.text type`).toBe("string");
      // Non-empty content extracted from fake body
      expect((response.rawOutputs.text as string).length, `${row.logicalName}: rawOutputs.text not empty`).toBeGreaterThan(0);
    }
  });

  it("Test 3 (INV-03): each provider produces normalizedUsage with Phase 7 shape", async () => {
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      const response = await adapter.execute!({
        task: "t",
        artifacts: [],
        outputs: ["text"],
      });
      expect(response.normalizedUsage, `${row.logicalName}: normalizedUsage defined`).toBeDefined();
      expect(typeof response.normalizedUsage?.promptTokens, `${row.logicalName}: promptTokens`).toBe("number");
      expect(typeof response.normalizedUsage?.completionTokens, `${row.logicalName}: completionTokens`).toBe("number");
      // costUsd is `number | null`; pricing not supplied -> null
      expect(response.normalizedUsage?.costUsd, `${row.logicalName}: costUsd null when pricing absent`).toBeNull();
    }
  });

  it("Test 4 (INV-03): each provider throws on non-OK fetch with provider-identifying message", async () => {
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing({ error: "boom" }, 500);
      const adapter = row.build({ fetch });
      await expect(
        adapter.execute!({ task: "t", artifacts: [], outputs: ["text"] }),
        `${row.logicalName}: 500 throws`,
      ).rejects.toThrow(row.errorPattern);
    }
  });

  it("Test 5 (INV-03 + D-05): each provider wires request.signal into fetch", async () => {
    for (const row of PROVIDERS) {
      const { fetch, capture } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      const controller = new AbortController();
      await adapter.execute!({
        task: "t",
        artifacts: [],
        outputs: ["text"],
        signal: controller.signal,
      });
      expect(capture.init.signal, `${row.logicalName}: signal propagated`).toBe(controller.signal);
    }
  });

  it("Test 6 (INV-03): each provider returns rawResponse (the original parsed body)", async () => {
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      const response = await adapter.execute!({
        task: "t",
        artifacts: [],
        outputs: ["text"],
      });
      expect(response.rawResponse, `${row.logicalName}: rawResponse defined`).toBeDefined();
      expect(typeof response.rawResponse, `${row.logicalName}: rawResponse object`).toBe("object");
    }
  });

  it("Test 7 (CD-02 covered): all first-party adapters claim distinct ids", () => {
    const ids = new Set<string>();
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      expect(ids.has(adapter.id), `${row.logicalName}: id "${adapter.id}" not collision`).toBe(false);
      ids.add(adapter.id);
    }
    expect(ids.size).toBe(PROVIDERS.length);
  });

  it("INV-03 streaming parity: seven logical providers expose executeStream", async () => {
    const streamingRows = PROVIDERS.filter((row) => row.expectedId !== "litellm");
    expect(streamingRows.map((row) => row.expectedId)).toEqual([
      "openai",
      "openai-compatible",
      "anthropic",
      "gemini",
      "xai",
      "openrouter",
      "lm-studio",
    ]);

    for (const row of streamingRows) {
      const expectedText = `${row.expectedId} stream`;
      const { fetch } = makeStreamingFetchCapturing(
        streamingChunksForProvider(row.expectedId, expectedText),
      );
      const adapter = row.build({ fetch });
      expect(typeof adapter.executeStream, `${row.logicalName}: executeStream`).toBe("function");

      const response = await collectStream(await adapter.executeStream!({
        task: `stream-${row.logicalName}`,
        artifacts: [],
        outputs: ["text"],
      }));

      expect(typeof response.rawOutputs.text, `${row.logicalName}: output type`).toBe("string");
      expect(response.rawOutputs.text, `${row.logicalName}: output text`).toBe(expectedText);
    }
  });
});

const SANITIZER_ENVELOPE_TEXT = "{\"summary\":\"Greeted the user.\"}";

const SANITIZER_OPENAI_COMPAT_BODY = {
  choices: [{ message: { content: SANITIZER_ENVELOPE_TEXT } }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

const SANITIZER_ANTHROPIC_BODY = {
  content: [{ type: "text", text: SANITIZER_ENVELOPE_TEXT }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

const SANITIZER_GEMINI_BODY = {
  candidates: [
    {
      content: { parts: [{ text: SANITIZER_ENVELOPE_TEXT }], role: "model" },
    },
  ],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
};

const SANITIZER_PROVIDERS: readonly ProviderRow[] = [
  {
    logicalName: "OpenAI",
    expectedId: "openai",
    fakeBody: SANITIZER_OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createOpenAIProvider({
        model: "gpt-oss-120b",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "OpenAI-compatible",
    expectedId: "openai-compatible",
    fakeBody: SANITIZER_OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createOpenAICompatibleProvider({
        model: "any-model",
        baseUrl: "https://example.com/v1",
        apiKey: "sk-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "Anthropic",
    expectedId: "anthropic",
    fakeBody: SANITIZER_ANTHROPIC_BODY,
    errorPattern: /Anthropic provider failed with/,
    build: ({ fetch }) =>
      createAnthropicProvider({
        model: "claude-3-opus",
        apiKey: "sk-ant-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "Gemini",
    expectedId: "gemini",
    fakeBody: SANITIZER_GEMINI_BODY,
    errorPattern: /Gemini provider failed with/,
    build: ({ fetch }) =>
      createGeminiProvider({
        model: "gemini-1.5-flash",
        apiKey: "AIza-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "xAI",
    expectedId: "xai",
    fakeBody: SANITIZER_OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createXaiProvider({
        model: "grok-4",
        apiKey: "xai-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "OpenRouter",
    expectedId: "openrouter",
    fakeBody: SANITIZER_OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createOpenRouterProvider({
        model: "openai/gpt-oss-120b:free",
        apiKey: "sk-or-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "LM Studio",
    expectedId: "lm-studio",
    fakeBody: SANITIZER_OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createLmStudioProvider({
        model: "qwen2.5-coder-32b-instruct",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
  {
    logicalName: "LiteLLM",
    expectedId: "litellm",
    fakeBody: SANITIZER_OPENAI_COMPAT_BODY,
    errorPattern: /OpenAI-compatible provider failed with/,
    build: ({ fetch }) =>
      createLiteLLMProvider({
        model: "gpt-4o",
        apiKey: "sk-litellm-test",
        fetch,
        sanitizeOutput: unwrapInternalEnvelope({ field: "summary" }),
      }),
  },
];

describe("Phase 36 output sanitizer parity", () => {
  it("all first-party providers unwrap the session_1780792387779 internal envelope for every requested output", async () => {
    const seenIds: string[] = [];

    for (const row of SANITIZER_PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      seenIds.push(adapter.id);

      const response = await adapter.execute!({
        task: `session_1780792387779-${row.logicalName}`,
        artifacts: [],
        outputs: ["text", "summary"],
      });

      expect(response.rawOutputs.text, `${row.logicalName}: text`).toBe("Greeted the user.");
      expect(response.rawOutputs.summary, `${row.logicalName}: summary`).toBe("Greeted the user.");
    }

    expect(seenIds).toEqual([
      "openai",
      "openai-compatible",
      "anthropic",
      "gemini",
      "xai",
      "openrouter",
      "lm-studio",
      "litellm",
    ]);
  });
});

const VALID_TOOL_ENVELOPE =
  `{"tool_calls":[{"id":"tool-1","name":"search","args":{"query":"ok"}}]}`;
const INVALID_TOOL_ENVELOPE =
  `{"tool_calls":[{"id":"tool-bad","name":"search_database","args":{"quer":"..."}}]}`;

interface ValidationProviderRow {
  readonly logicalName: string;
  readonly expectedId: string;
  readonly build: (options: {
    readonly fetch: typeof fetch;
    readonly validateToolCalls: ValidateToolCallsOption;
  }) => ProviderAdapter;
}

const VALIDATION_PROVIDERS: readonly ValidationProviderRow[] = [
  {
    logicalName: "OpenAI",
    expectedId: "openai",
    build: ({ fetch, validateToolCalls }) =>
      createOpenAIProvider({
        model: "gpt-4o",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "OpenAI-compatible",
    expectedId: "openai-compatible",
    build: ({ fetch, validateToolCalls }) =>
      createOpenAICompatibleProvider({
        model: "any-model",
        baseUrl: "https://example.com/v1",
        apiKey: "sk-test",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "Anthropic",
    expectedId: "anthropic",
    build: ({ fetch, validateToolCalls }) =>
      createAnthropicProvider({
        model: "claude-3-opus",
        apiKey: "sk-ant-test",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "Gemini",
    expectedId: "gemini",
    build: ({ fetch, validateToolCalls }) =>
      createGeminiProvider({
        model: "gemini-1.5-flash",
        apiKey: "AIza-test",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "xAI",
    expectedId: "xai",
    build: ({ fetch, validateToolCalls }) =>
      createXaiProvider({
        model: "grok-4",
        apiKey: "xai-test",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "OpenRouter",
    expectedId: "openrouter",
    build: ({ fetch, validateToolCalls }) =>
      createOpenRouterProvider({
        model: "openai/gpt-4o",
        apiKey: "sk-or-test",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "LM Studio",
    expectedId: "lm-studio",
    build: ({ fetch, validateToolCalls }) =>
      createLmStudioProvider({
        model: "qwen2.5-coder-32b-instruct",
        fetch,
        validateToolCalls,
      }),
  },
  {
    logicalName: "LiteLLM",
    expectedId: "litellm",
    build: ({ fetch, validateToolCalls }) =>
      createLiteLLMProvider({
        model: "gpt-4o",
        apiKey: "sk-litellm-test",
        fetch,
        validateToolCalls,
      }),
  },
];

function validationBodyForProvider(providerId: string, text: string): unknown {
  if (providerId === "anthropic") {
    return {
      content: [{ type: "text", text }],
      usage: { input_tokens: 10, output_tokens: 5 },
    };
  }

  if (providerId === "gemini") {
    return {
      candidates: [
        {
          content: { parts: [{ text }], role: "model" },
        },
      ],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    };
  }

  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe("Phase 37 tool-call validation parity", () => {
  it("all first-party providers return validated toolCalls for valid prompt-encoded envelopes", async () => {
    for (const row of VALIDATION_PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(
        validationBodyForProvider(row.expectedId, VALID_TOOL_ENVELOPE),
      );
      const adapter = row.build({
        fetch,
        validateToolCalls: { tools: [searchTool] },
      });

      const response = await adapter.execute!({
        task: `validate-tool-call-${row.logicalName}`,
        artifacts: [],
        outputs: ["text"],
      });

      expect(adapter.id, `${row.logicalName}: id`).toBe(row.expectedId);
      expect(response.rawOutputs.text, `${row.logicalName}: raw text`).toBe(VALID_TOOL_ENVELOPE);
      expect(response.toolCalls, `${row.logicalName}: validated calls`).toEqual([
        { id: "tool-1", name: "search", args: { query: "ok" } },
      ]);
    }
  });

  it("all first-party providers drop invalid returned tool calls when configured", async () => {
    for (const row of VALIDATION_PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(
        validationBodyForProvider(row.expectedId, INVALID_TOOL_ENVELOPE),
      );
      const adapter = row.build({
        fetch,
        validateToolCalls: {
          tools: [searchTool],
          onFailure: "drop",
        },
      });

      const response = await adapter.execute!({
        task: `drop-invalid-tool-call-${row.logicalName}`,
        artifacts: [],
        outputs: ["text"],
      });

      expect(response.toolCalls, `${row.logicalName}: dropped invalid calls`).toEqual([]);
    }
  });

  it("all first-party providers throw for hallucinated tool names when configured", async () => {
    for (const row of VALIDATION_PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(
        validationBodyForProvider(row.expectedId, INVALID_TOOL_ENVELOPE),
      );
      const adapter = row.build({
        fetch,
        validateToolCalls: {
          tools: [searchTool],
          onFailure: "throw",
        },
      });

      await expect(
        adapter.execute!({
          task: `throw-invalid-tool-call-${row.logicalName}`,
          artifacts: [],
          outputs: ["text"],
        }),
        `${row.logicalName}: throws invalid tool call`,
      ).rejects.toMatchObject({
        reason: "unknown_tool",
        toolName: "search_database",
        requestId: "tool-bad",
      });
    }
  });
});

// ---------------------------------------------------------------------------
// noPublicUrl defense-in-depth chokepoint parity (260616-inn)
// ---------------------------------------------------------------------------
// Tests 1, 2, 3 are RED before assertNoPublicUrlEgress is wired into each
// adapter egress path (Task 2).  Tests 4, 5, 6 must be GREEN immediately.
//
// Mislabeling threat: metadata.base64Data holds a public http(s) URL
// (REVIEW3 P2). artifactBase64Data() reads metadata.base64Data first, so the
// URL lands in the serialized body as inlineData.data / source.data for
// Anthropic and Gemini when transport="base64".
//
// For OpenAI-compat the threat vector is a url-kind artifact that the
// packaging mistakenly assigns transport="url" despite noPublicUrl:true.
// The h31 body builder includes the url field only when transport==="url",
// so the URL reaches the wire body in exactly this mis-packaged case.
// ---------------------------------------------------------------------------

const INN_PUBLIC_URL = "https://evil.example/x.png";

// Mislabeled artifact used by Anthropic (Test 2) and Gemini (Test 3).
// The value is a clean data URL; metadata.base64Data is the public URL.
// artifactBase64Data() prefers metadata.base64Data, so the URL becomes
// the base64 payload and lands in the serialized body under base64 transport.
const mislabeledArtifact = artifact.image("data:image/png;base64,abc", {
  id: "mislabeled-img",
  metadata: { base64Data: INN_PUBLIC_URL, encoding: "base64" },
});

// Packaging plan that routes the mislabeled artifact via "base64" transport,
// causing Anthropic/Gemini body builders to call artifactBase64Data() and
// embed the PUBLIC_URL in the request body.
const mislabeledPackaging = {
  providerId: "test",
  modelId: "test",
  artifacts: [
    {
      artifactId: "mislabeled-img",
      transport: "base64" as const,
      lineageTransform: "provider-packaging" as const,
      warnings: [],
    },
  ],
  warnings: [],
};

function makeCapturingFetch(body: unknown): {
  fetch: typeof fetch;
  capturedBodies: string[];
} {
  const capturedBodies: string[] = [];
  const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
    capturedBodies.push(typeof init?.body === "string" ? init.body : "");
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capturedBodies };
}

describe("noPublicUrl defense-in-depth chokepoint parity (260616-inn)", () => {
  // Test 1 (RED before wiring, GREEN after):
  // OpenAI-compat execute throws NoPublicUrlEgressError when a url-kind artifact
  // is mis-packaged with transport="url" despite noPublicUrl:true.
  // The h31 body builder emits url: PUBLIC_URL only when transport==="url";
  // the chokepoint catches this mis-packaged case as defense-in-depth.
  it("Test 1: OpenAI-compat execute throws NoPublicUrlEgressError for url-artifact mis-packaged as url-transport under noPublicUrl", async () => {
    const { fetch } = makeCapturingFetch(OPENAI_COMPAT_BODY);
    const adapter = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://fake.example/v1",
      apiKey: "sk-test",
      fetch,
    });

    const urlArtifact = artifact.url(INN_PUBLIC_URL, { id: "url-mislabeled" });
    const urlPackaging = {
      providerId: "test",
      modelId: "test",
      artifacts: [
        {
          artifactId: urlArtifact.id,
          transport: "url" as const,
          lineageTransform: "provider-packaging" as const,
          warnings: [],
        },
      ],
      warnings: [],
    };

    await expect(
      adapter.execute!({
        task: "describe this",
        artifacts: [urlArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: urlPackaging,
      }),
    ).rejects.toBeInstanceOf(NoPublicUrlEgressError);

    await expect(
      adapter.execute!({
        task: "describe this",
        artifacts: [urlArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: urlPackaging,
      }),
    ).rejects.toThrow(INN_PUBLIC_URL);
  });

  // Test 2 (RED before wiring, GREEN after):
  // Anthropic execute throws NoPublicUrlEgressError for base64-mislabeled artifact.
  // With transport="base64", Anthropic calls artifactBase64Data(artifact) which
  // reads metadata.base64Data first and gets PUBLIC_URL — embedding it in the body.
  it("Test 2: Anthropic execute throws NoPublicUrlEgressError for base64-mislabeled artifact under noPublicUrl", async () => {
    const { fetch } = makeCapturingFetch(ANTHROPIC_BODY);
    const adapter = createAnthropicProvider({
      model: "claude-3-opus",
      apiKey: "sk-ant-test",
      fetch,
    });

    await expect(
      adapter.execute!({
        task: "describe this image",
        artifacts: [mislabeledArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: mislabeledPackaging,
      }),
    ).rejects.toBeInstanceOf(NoPublicUrlEgressError);

    await expect(
      adapter.execute!({
        task: "describe this image",
        artifacts: [mislabeledArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: mislabeledPackaging,
      }),
    ).rejects.toThrow(INN_PUBLIC_URL);
  });

  // Test 3 (RED before wiring, GREEN after):
  // Gemini execute throws NoPublicUrlEgressError for base64-mislabeled artifact.
  // With transport="base64", Gemini calls artifactBase64Data(artifact) which
  // reads metadata.base64Data first and gets PUBLIC_URL — embedding it in the body.
  it("Test 3: Gemini execute throws NoPublicUrlEgressError for base64-mislabeled artifact under noPublicUrl", async () => {
    const { fetch } = makeCapturingFetch(GEMINI_BODY);
    const adapter = createGeminiProvider({
      model: "gemini-1.5-flash",
      apiKey: "AIza-test",
      fetch,
    });

    await expect(
      adapter.execute!({
        task: "describe this image",
        artifacts: [mislabeledArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: mislabeledPackaging,
      }),
    ).rejects.toBeInstanceOf(NoPublicUrlEgressError);

    await expect(
      adapter.execute!({
        task: "describe this image",
        artifacts: [mislabeledArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: mislabeledPackaging,
      }),
    ).rejects.toThrow(INN_PUBLIC_URL);
  });

  // Test 4 (must be GREEN immediately — no-false-positive):
  // noPublicUrl:true but the URL was already stripped from the body by packaging.
  // The chokepoint substring-scans serializedBody; if the URL isn't there, it does not throw.
  it("Test 4: No throw when noPublicUrl:true but URL was already stripped from body (packaging removed it)", async () => {
    const { fetch } = makeCapturingFetch(OPENAI_COMPAT_BODY);
    const adapter = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://fake.example/v1",
      apiKey: "sk-test",
      fetch,
    });

    // Artifact whose value is a public URL, but providerPackaging requests base64 transport.
    // The OpenAI-compat adapter will NOT emit the URL in the body for non-url transport,
    // so assertNoPublicUrlEgress will not find the URL substring and will not throw.
    const urlArtifact = artifact.url(INN_PUBLIC_URL, { id: "url-art" });

    await expect(
      adapter.execute!({
        task: "describe this image",
        artifacts: [urlArtifact],
        outputs: ["text"],
        policy: { noPublicUrl: true },
        providerPackaging: {
          providerId: "test-model",
          modelId: "test-model",
          artifacts: [
            {
              artifactId: urlArtifact.id,
              transport: "base64",
              lineageTransform: "provider-packaging",
              warnings: [],
            },
          ],
          warnings: [],
        },
      }),
    ).resolves.toBeDefined();
  });

  // Test 5 (must be GREEN immediately — scope):
  // gateway.metadata may contain URLs, but those are not artifact-derived.
  // The chokepoint only scans request.artifacts, so this must NOT throw.
  it("Test 5: No throw when gateway metadata has a URL but no artifact has a public URL under noPublicUrl", async () => {
    const { fetch } = makeCapturingFetch(OPENAI_COMPAT_BODY);
    const adapter = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://fake.example/v1",
      apiKey: "sk-test",
      fetch,
    });

    const textArtifact = artifact.text("hello", { id: "txt-1" });

    await expect(
      adapter.execute!({
        task: "summarize",
        artifacts: [textArtifact],
        outputs: ["text"],
        policy: {
          noPublicUrl: true,
          gateway: { metadata: { source: "https://gateway.example/route" } },
        },
      }),
    ).resolves.toBeDefined();
  });

  // Test 6 (must be GREEN immediately — positive baseline):
  // noPublicUrl is not set, so even a URL artifact must pass through.
  it("Test 6: No throw when noPublicUrl is not set even with URL artifact", async () => {
    const { fetch } = makeCapturingFetch(OPENAI_COMPAT_BODY);
    const adapter = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://fake.example/v1",
      apiKey: "sk-test",
      fetch,
    });

    const urlArtifact = artifact.url(INN_PUBLIC_URL, { id: "url-art-2" });

    await expect(
      adapter.execute!({
        task: "fetch this url",
        artifacts: [urlArtifact],
        outputs: ["text"],
        policy: undefined,
      }),
    ).resolves.toBeDefined();
  });
});
