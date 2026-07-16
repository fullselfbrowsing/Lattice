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

import { parseToolUseEnvelope, type ToolUseRequest } from "../tools/tool-use.js";
import { standardSchemaToJsonSchema } from "../tools/schema.js";
import type { ToolDefinition } from "../tools/tools.js";

export { parseToolUseEnvelope };
export type { ToolUseRequest };

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
   * Phase 39 (v1.3): body-only sibling of `buildTask` — identical turn
   * rendering minus the leading system block, so the byte-stable
   * `describeForSystem()` prefix can be hoisted once per crew for
   * prompt-cache sharing without duplication (39-05).
   *
   * Invariant: `describeForSystem() + "\n" + buildTaskBody(conversation)`
   * reconstructs `buildTask(conversation)` byte-for-byte.
   */
  readonly buildTaskBody: (conversation: readonly ConversationTurn[]) => string;
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

export const toolSchemaToJsonSchema = standardSchemaToJsonSchema;

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
  tools: ReadonlyArray<ToolDefinition>,
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

  function assembleTask(
    conversation: readonly ConversationTurn[],
    includeSystemBlock: boolean,
  ): string {
    const lines: string[] = [];
    if (includeSystemBlock) {
      lines.push(systemBlock);
    }
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

  function buildTask(conversation: readonly ConversationTurn[]): string {
    return assembleTask(conversation, true);
  }

  function buildTaskBody(conversation: readonly ConversationTurn[]): string {
    return assembleTask(conversation, false);
  }

  function describeForSystem(): string {
    return systemBlock;
  }

  return {
    buildTask,
    buildTaskBody,
    parseToolUse: parseToolUseEnvelope,
    describeForSystem,
    mode: "prompt-reencoded",
  };
}
