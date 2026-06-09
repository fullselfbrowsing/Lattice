/**
 * formatToolsForProvider — Phase 19 (v1.2).
 *
 * The agent loop runs over the existing v1.1 + v1.2 `ProviderAdapter`
 * interface unchanged (CONTEXT.md Q2). Adapters accept only a single
 * `task: string` plus `outputs[]` — they have no native multi-turn or
 * tool-use surface.
 *
 * This helper bridges that gap by encoding the running conversation +
 * tool descriptions + a structured "respond with this envelope" instruction
 * into the `task` string. The model is asked to either answer directly or
 * emit a JSON envelope on a line by itself. `parseToolUse` extracts the
 * envelope.
 *
 * The implementation works ACROSS all 7 logical providers (openai,
 * openai-compat, anthropic, gemini, xai, openrouter, lm-studio) by virtue
 * of being provider-agnostic: it uses the adapter's normalized text
 * response (`ProviderRunResponse.rawOutputs`) and never touches the
 * provider-specific request shape. Native tool_use (Anthropic Messages-API
 * `tools[]`, OpenAI Chat-Completions `tools[]`, Gemini `function_declarations`)
 * is DEFERRED to a follow-on milestone where the `ProviderAdapter` interface
 * can be additively extended without breaking the INV-03 parity contract
 * shipped in v1.2 Phase 17.
 *
 * Returned closure shape:
 *   {
 *     buildTask(conversation, system?) — encodes turns + tools + envelope
 *                                        instructions into a single string;
 *     parseToolUse(text)               — extracts JSON tool-call envelopes
 *                                        from the response, returns null
 *                                        when the response is a final answer;
 *     describeForSystem()              — returns the static tool-description
 *                                        block (for tracing / logging);
 *   }
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

import type { ToolDefinition } from "../tools/tools.js";
import type { ToolUseRequest } from "./types.js";

/**
 * One turn in the running conversation.
 *
 * `role: "tool"` is used for tool-result turns; `toolCallId` and `toolName`
 * are populated so the model can correlate the result with its prior
 * `tool_call` envelope.
 */
export interface ConversationTurn {
  readonly role: "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolName?: string;
}

export type FormatToolsMode = "native" | "prompt-reencoded" | "auto";

export interface FormatToolsOptions {
  /**
   * Tool-use protocol mode. Defaults to `"auto"`, which currently resolves
   * to `"prompt-reencoded"` for ALL 7 providers (Phase 19 simplification —
   * native tool_use deferred to a follow-on milestone). Reserved for
   * forward compatibility.
   */
  readonly mode?: FormatToolsMode;
  /**
   * Optional system prompt to prepend. Useful for setting persona /
   * domain-specific instructions on top of the tool-use envelope.
   */
  readonly system?: string;
}

export interface FormattedToolsHandle {
  /**
   * Builds the single `task` string passed to `ProviderAdapter.execute()`.
   * Encodes the conversation, available tools, and response-envelope
   * instructions.
   */
  readonly buildTask: (conversation: readonly ConversationTurn[]) => string;
  /**
   * Parses the assistant's response text. Returns:
   *   - `ToolUseRequest[]` when the response contains one or more tool-call
   *     envelopes (parsed in declaration order).
   *   - `null` when the response is a final answer (no tool-call envelopes
   *     detected).
   *
   * The parser is forgiving: it tolerates extra prose around the JSON
   * envelope (markdown fences, leading explanations) and the model
   * occasionally drifting on whitespace.
   */
  readonly parseToolUse: (responseText: string) => ReadonlyArray<ToolUseRequest> | null;
  /**
   * Returns the static system block describing available tools. Useful for
   * tracing / logging the exact tool-description text fed to the model.
   */
  readonly describeForSystem: () => string;
  /**
   * Effective mode this handle resolved to (`"prompt-reencoded"` for all
   * v1.2 providers). Exposed for inspectability.
   */
  readonly mode: "prompt-reencoded";
}

/**
 * Convert a Standard Schema to a JSON Schema-shaped descriptor suitable for
 * inclusion in an LLM tool description. Standard Schema vendors can
 * optionally expose `toJSONSchema` on their schema objects; when absent,
 * we fall back to a minimal structural description that lists the schema
 * vendor + version + a placeholder. Models tolerate placeholder schemas in
 * practice because the tool description is supplementary — what matters
 * is the envelope contract (`{tool_call: {name, args}}`).
 */
export function toolSchemaToJsonSchema(schema: StandardSchemaV1): unknown {
  const standardSchema = (schema as unknown as { readonly "~standard"?: unknown })["~standard"];
  if (
    typeof standardSchema === "object" &&
    standardSchema !== null &&
    "vendor" in standardSchema
  ) {
    const vendor = standardSchema as { readonly vendor: string };
    const maybeToJson = (schema as unknown as { readonly toJSONSchema?: () => unknown })
      .toJSONSchema;
    if (typeof maybeToJson === "function") {
      try {
        return maybeToJson();
      } catch {
        // fall through to placeholder
      }
    }
    return {
      $comment: `standard-schema vendor: ${vendor.vendor}; toJSONSchema not available`,
      type: "object",
    };
  }
  return { $comment: "non-standard-schema input", type: "object" };
}

/**
 * Builds the prompt-reencoded tool-use protocol handle for any provider.
 *
 * Phase 19 ships a uniform implementation across all 7 logical providers
 * (openai, openai-compat, anthropic, gemini, xai, openrouter, lm-studio).
 * The `providerName` argument is accepted for forward compatibility but
 * does not branch the implementation in v1.2.
 */
export function formatToolsForProvider(
  providerName: string,
  tools: ReadonlyArray<ToolDefinition<StandardSchemaV1>>,
  options: FormatToolsOptions = {},
): FormattedToolsHandle {
  // mode is currently a forward-compat field — v1.2 resolves all modes to
  // prompt-reencoded.
  void providerName;
  void options.mode;

  const system = options.system?.trim() ?? "";
  const toolDescriptions = tools
    .map((tool) => {
      const schemaDescriptor = toolSchemaToJsonSchema(tool.inputSchema);
      const schemaJson = JSON.stringify(schemaDescriptor, null, 2);
      const desc = tool.description?.trim() ?? "(no description)";
      return `- name: ${tool.name}\n  description: ${desc}\n  args_schema: ${schemaJson}`;
    })
    .join("\n");

  const envelopeInstructions = [
    "You are a single-agent loop. You can either:",
    "  (a) answer the user directly with a final response, OR",
    "  (b) request one or more tool calls.",
    "",
    "To request tool calls, respond with ONE JSON object on a line by itself:",
    '  {"tool_calls": [{"id": "...", "name": "tool_name", "args": {...}}]}',
    "Each tool_call needs a unique id (any string). The args MUST match the tool's args_schema.",
    "",
    "To answer directly, respond with a final answer in natural language with NO JSON envelope.",
    "Do not mix a final answer and a tool_calls envelope in the same response.",
  ].join("\n");

  const systemBlock = [
    system,
    "",
    "Available tools:",
    toolDescriptions || "(none)",
    "",
    envelopeInstructions,
  ]
    .filter((s) => s !== "" || true)
    .join("\n")
    .replace(/^\n+/, "")
    .trimEnd();

  function buildTask(conversation: readonly ConversationTurn[]): string {
    const lines: string[] = [];
    lines.push(systemBlock);
    lines.push("");
    lines.push("---");
    lines.push("");
    for (const turn of conversation) {
      if (turn.role === "user") {
        lines.push(`USER:\n${turn.content}`);
      } else if (turn.role === "assistant") {
        lines.push(`ASSISTANT:\n${turn.content}`);
      } else {
        const idHint = turn.toolCallId !== undefined ? ` id=${turn.toolCallId}` : "";
        const nameHint = turn.toolName !== undefined ? ` name=${turn.toolName}` : "";
        lines.push(`TOOL_RESULT (${nameHint.trim() || "tool"}${idHint}):\n${turn.content}`);
      }
      lines.push("");
    }
    lines.push("ASSISTANT:");
    return lines.join("\n");
  }

  function describeForSystem(): string {
    return systemBlock;
  }

  return {
    buildTask,
    parseToolUse: parseToolUseEnvelope,
    describeForSystem,
    mode: "prompt-reencoded",
  };
}

export function parseToolUseEnvelope(responseText: string): ReadonlyArray<ToolUseRequest> | null {
  if (typeof responseText !== "string" || responseText.length === 0) {
    return null;
  }
  const candidates = extractJsonCandidates(responseText);
  for (const candidate of candidates) {
    const parsed = tryParseEnvelope(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
}

/**
 * Extracts JSON-looking candidate substrings from a response text.
 *
 * Models routinely wrap JSON in markdown code fences (```json ... ```),
 * prepend explanatory prose ("I'll call the search tool: { ... }"), or
 * produce multiple JSON-shaped blobs. This extractor scans for plausible
 * candidates ordered by likelihood.
 */
function extractJsonCandidates(text: string): readonly string[] {
  const candidates: string[] = [];
  // 1) Fenced code blocks (most common formatting).
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRegex.exec(text)) !== null) {
    const inner = fenceMatch[1];
    if (inner !== undefined) {
      candidates.push(inner.trim());
    }
  }
  // 2) Top-level braced blobs (greedy match from first '{' to last '}').
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    candidates.push(text.slice(braceStart, braceEnd + 1));
  }
  // 3) Whole text as a candidate (envelope-only response).
  candidates.push(text.trim());
  return candidates;
}

function tryParseEnvelope(jsonLike: string): ReadonlyArray<ToolUseRequest> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLike);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const envelope = parsed as Record<string, unknown>;
  const toolCalls = envelope["tool_calls"];
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return null;
  }
  const requests: ToolUseRequest[] = [];
  for (const call of toolCalls) {
    if (typeof call !== "object" || call === null) {
      return null;
    }
    const callRecord = call as Record<string, unknown>;
    const id = callRecord["id"];
    const name = callRecord["name"];
    const args = callRecord["args"];
    if (typeof id !== "string" || typeof name !== "string") {
      return null;
    }
    requests.push({ id, name, args });
  }
  return requests;
}
