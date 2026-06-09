import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { defineTool } from "../tools/tools.js";
import {
  formatToolsForProvider,
  parseToolUseEnvelope,
  toolSchemaToJsonSchema,
  type ConversationTurn,
} from "./format-tools.js";

const ALL_PROVIDERS = [
  "openai",
  "openai-compat",
  "anthropic",
  "gemini",
  "xai",
  "openrouter",
  "lm-studio",
] as const;

function makeSchema(_label: string): StandardSchemaV1 {
  // Minimal Standard-Schema-shaped stub: declares the vendor + version so
  // the format-tools helper's toolSchemaToJsonSchema can recognize it.
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      validate: (value: unknown) => ({ value: value as never, issues: [] }),
    } as never,
  } as StandardSchemaV1;
}

function makeTool(name: string, description?: string) {
  return defineTool({
    name,
    ...(description !== undefined ? { description } : {}),
    inputSchema: makeSchema(name),
    execute: () => "stub",
  });
}

describe("toolSchemaToJsonSchema", () => {
  it("returns a vendor-aware placeholder for Standard Schema inputs", () => {
    const schema = makeSchema("search");
    const result = toolSchemaToJsonSchema(schema) as Record<string, unknown>;
    expect(result["type"]).toBe("object");
    expect(String(result["$comment"])).toContain("test-stub");
  });

  it("returns a non-standard-schema placeholder when ~standard is missing", () => {
    const result = toolSchemaToJsonSchema({} as unknown as StandardSchemaV1) as Record<
      string,
      unknown
    >;
    expect(result["type"]).toBe("object");
    expect(String(result["$comment"])).toContain("non-standard-schema");
  });
});

describe.each(ALL_PROVIDERS)("formatToolsForProvider — %s", (providerName) => {
  it("resolves to prompt-reencoded mode for v1.2", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    expect(handle.mode).toBe("prompt-reencoded");
  });

  it("describeForSystem() lists each registered tool by name", () => {
    const tools = [makeTool("search", "Run a web search"), makeTool("calc")];
    const handle = formatToolsForProvider(providerName, tools);
    const sys = handle.describeForSystem();
    expect(sys).toContain("name: search");
    expect(sys).toContain("Run a web search");
    expect(sys).toContain("name: calc");
    expect(sys).toContain("(no description)");
  });

  it("buildTask() encodes the conversation with USER / ASSISTANT / TOOL_RESULT markers", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const conversation: ConversationTurn[] = [
      { role: "user", content: "find me a pet store" },
      { role: "assistant", content: '{"tool_calls":[{"id":"c1","name":"search","args":{}}]}' },
      {
        role: "tool",
        content: '{"results":["pet world"]}',
        toolCallId: "c1",
        toolName: "search",
      },
    ];
    const task = handle.buildTask(conversation);
    expect(task).toContain("Available tools:");
    expect(task).toContain("USER:");
    expect(task).toContain("ASSISTANT:");
    expect(task).toContain("TOOL_RESULT (name=search id=c1)");
    // task should end with a trailing ASSISTANT: prompt to elicit the next response
    expect(task.trim().endsWith("ASSISTANT:")).toBe(true);
  });

  it("parseToolUse() returns null for a plain final-answer response", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    expect(handle.parseToolUse("Here is the answer: 42.")).toBeNull();
  });

  it("parseToolUse() extracts a tool_calls envelope from a bare JSON response", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const envelope = `{"tool_calls":[{"id":"c1","name":"search","args":{"q":"pet store"}}]}`;
    const parsed = handle.parseToolUse(envelope);
    expect(parsed).not.toBeNull();
    expect(parsed?.length).toBe(1);
    expect(parsed?.[0]?.id).toBe("c1");
    expect(parsed?.[0]?.name).toBe("search");
    expect(parsed?.[0]?.args).toEqual({ q: "pet store" });
  });

  it("parseToolUseEnvelope() preserves the same parser behavior as parseToolUse()", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const envelope = `{"tool_calls":[{"id":"c1","name":"search","args":{"q":"pet store"}}]}`;
    expect(parseToolUseEnvelope(envelope)).toEqual(handle.parseToolUse(envelope));
  });

  it("parseToolUse() extracts an envelope embedded in a markdown code fence", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const response = [
      "I will run a search:",
      "```json",
      `{"tool_calls":[{"id":"c2","name":"search","args":{"q":"sushi"}}]}`,
      "```",
    ].join("\n");
    const parsed = handle.parseToolUse(response);
    expect(parsed?.length).toBe(1);
    expect(parsed?.[0]?.args).toEqual({ q: "sushi" });
  });

  it("parseToolUse() extracts an envelope embedded in prose around braces", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const response = `Sure: {"tool_calls":[{"id":"c3","name":"search","args":{}}]} done.`;
    const parsed = handle.parseToolUse(response);
    expect(parsed?.length).toBe(1);
    expect(parsed?.[0]?.id).toBe("c3");
  });

  it("parseToolUse() returns null when JSON is not a tool_calls envelope", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const response = `{"answer": "42"}`;
    expect(handle.parseToolUse(response)).toBeNull();
  });

  it("parseToolUse() returns null for malformed JSON", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    expect(handle.parseToolUse("{this is not json")).toBeNull();
  });

  it("parseToolUse() returns null for empty string", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    expect(handle.parseToolUse("")).toBeNull();
  });

  it("parseToolUse() accepts multiple tool_calls in a single envelope", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("a"), makeTool("b")]);
    const envelope = `{"tool_calls":[
      {"id":"x1","name":"a","args":{"v":1}},
      {"id":"x2","name":"b","args":{"v":2}}
    ]}`;
    const parsed = handle.parseToolUse(envelope);
    expect(parsed?.length).toBe(2);
    expect(parsed?.[0]?.name).toBe("a");
    expect(parsed?.[1]?.name).toBe("b");
  });

  it("parseToolUse() rejects envelopes with non-string id or name", () => {
    const handle = formatToolsForProvider(providerName, [makeTool("search")]);
    const envelope = `{"tool_calls":[{"id":42,"name":"search","args":{}}]}`;
    expect(handle.parseToolUse(envelope)).toBeNull();
  });
});

describe("formatToolsForProvider — system prompt option", () => {
  it("prepends the system option to the system block", () => {
    const handle = formatToolsForProvider("openai", [makeTool("search")], {
      system: "You are a helpful research assistant.",
    });
    const sys = handle.describeForSystem();
    expect(sys.startsWith("You are a helpful research assistant.")).toBe(true);
    expect(sys).toContain("Available tools:");
  });

  it("works with an empty system option (default)", () => {
    const handle = formatToolsForProvider("openai", [makeTool("search")]);
    const sys = handle.describeForSystem();
    expect(sys.startsWith("Available tools:")).toBe(true);
  });
});
