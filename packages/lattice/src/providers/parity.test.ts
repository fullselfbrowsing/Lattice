import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";
import { createLmStudioProvider } from "./lm-studio.js";
import { createOpenRouterProvider } from "./openrouter.js";
import { createXaiProvider } from "./xai.js";
import {
  createOpenAICompatibleProvider,
  createOpenAIProvider,
} from "./adapters.js";
import { unwrapInternalEnvelope } from "../sanitizers/index.js";
import { defineTool } from "../tools/tools.js";
import type { ValidateToolCallsOption } from "../tools/tool-call-validation.js";

import type { ProviderAdapter } from "./provider.js";

/**
 * Phase 4 -- INV-03 provider-parity smoke. Iterates all 7 logical providers
 * against provider-shaped fake fetch responses; asserts each adapter returns
 * a ProviderRunResponse with rawOutputs populated, normalizedUsage shape,
 * AbortSignal wiring, distinct provider ids, and consistent non-OK error
 * behavior.
 *
 * INV-03 ("every improvement works equally across all 7 universal-provider.js
 * targets") is the hard gate for this milestone; this file is the substantive
 * proof. The 5 newly-shipped adapters (Anthropic + Gemini + xAI + OpenRouter
 * + LM Studio) are exercised alongside the pre-existing OpenAI + OpenAI-compat
 * factories.
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
];

describe("INV-03 provider-parity smoke (Phase 4)", () => {
  it("Test 1 (INV-03): all 7 logical providers expose ProviderAdapter shape", () => {
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

  it("Test 7 (CD-02 covered): all 7 adapters claim distinct ids", () => {
    const ids = new Set<string>();
    for (const row of PROVIDERS) {
      const { fetch } = makeFakeFetchCapturing(row.fakeBody);
      const adapter = row.build({ fetch });
      expect(ids.has(adapter.id), `${row.logicalName}: id "${adapter.id}" not collision`).toBe(false);
      ids.add(adapter.id);
    }
    expect(ids.size).toBe(7);
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
];

describe("Phase 36 output sanitizer parity", () => {
  it("all seven providers unwrap the session_1780792387779 internal envelope for every requested output", async () => {
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
  it("all seven providers return validated toolCalls for valid prompt-encoded envelopes", async () => {
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

  it("all seven providers drop invalid returned tool calls when configured", async () => {
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

  it("all seven providers throw for hallucinated tool names when configured", async () => {
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
