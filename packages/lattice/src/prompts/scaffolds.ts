import canonicalize from "canonicalize";

import type { RecommendedPromptStrategy } from "../capabilities/profile.js";

export const PROMPT_SCAFFOLD_VERSION = "lattice.prompt-scaffold/v1" as const;

export const PROMPT_STRATEGIES = [
  "frontier",
  "mid_tier",
  "open_weight",
  "reasoning",
  "local",
] as const satisfies readonly RecommendedPromptStrategy[];

type PromptScaffoldPurpose = "structured-output" | "tool-use";
type PromptScaffoldPayload = "schema" | "tools";

interface PromptStrategyInstructions {
  readonly structuredOutput: readonly string[];
  readonly toolUse: readonly string[];
}

const JSON_SERIALIZATION_ERRORS: Record<PromptScaffoldPayload, string> = {
  schema:
    "getStructuredOutputContract: schema must be JSON-serializable for deterministic prompt scaffolds.",
  tools:
    "getToolUseContract: tools must be JSON-serializable for deterministic prompt scaffolds.",
};

const STRATEGY_INSTRUCTIONS: Record<
  RecommendedPromptStrategy,
  PromptStrategyInstructions
> = {
  frontier: {
    structuredOutput: [
      "Return only content that satisfies the contract.",
      "Do not include prose before or after the structured output.",
    ],
    toolUse: [
      "Use a tool only when the task requires an external action or lookup.",
      "Return a normal answer when the user request can be completed without a tool.",
    ],
  },
  mid_tier: {
    structuredOutput: [
      "Treat the contract as instructions, not as prose to repeat.",
      "Return the requested answer in the shape required by the contract.",
    ],
    toolUse: [
      "The tool definitions are available actions, not answer text.",
      "Call only a listed tool, and only with arguments that match its definition.",
    ],
  },
  open_weight: {
    structuredOutput: [
      "The contract below is an instruction, not text to output.",
      "Do not answer with the schema, envelope, or any field name unless that field belongs in the final user-visible JSON.",
      'Bad: {"summary":"Greeted the user."} when the user asked for a natural-language reply.',
      "Good: Greeted the user.",
    ],
    toolUse: [
      "The tool list below is action metadata, not text to output.",
      "Do not copy the tool descriptor into the final answer.",
      "If no listed tool is needed, answer normally without fabricating a tool call.",
    ],
  },
  reasoning: {
    structuredOutput: [
      "Do not expose hidden reasoning, scratchpad text, or analysis in the final answer.",
      "Return only the final content that satisfies the contract.",
    ],
    toolUse: [
      "Keep tool selection separate from hidden reasoning.",
      "Do not include scratchpad text when explaining whether a tool was used.",
    ],
  },
  local: {
    structuredOutput: [
      "Do not copy the contract, chat template, or wrapper text into the answer.",
      "Return the requested answer directly in the required shape.",
    ],
    toolUse: [
      "Do not invent tool names or arguments.",
      "If the task does not require a listed tool, answer directly.",
    ],
  },
};

function canonicalPromptJson(
  value: unknown,
  payload: PromptScaffoldPayload,
): string {
  const errorMessage = JSON_SERIALIZATION_ERRORS[payload];
  let json: string | undefined;

  try {
    json = canonicalize(value);
    if (json === undefined) {
      throw new Error(errorMessage);
    }

    JSON.parse(json);
  } catch {
    throw new Error(errorMessage);
  }

  return json;
}

function renderPromptScaffold(
  strategy: RecommendedPromptStrategy,
  purpose: PromptScaffoldPurpose,
  instructions: readonly string[],
  payloadHeading: "Contract" | "Tools",
  payload: string,
): string {
  return [
    `Lattice Prompt Scaffold: ${PROMPT_SCAFFOLD_VERSION}`,
    `Strategy: ${strategy}`,
    `Purpose: ${purpose}`,
    "",
    ...instructions,
    "",
    `${payloadHeading}:`,
    payload,
  ].join("\n");
}

export function getStructuredOutputContract(
  strategy: RecommendedPromptStrategy,
  schema: unknown,
): string {
  return renderPromptScaffold(
    strategy,
    "structured-output",
    STRATEGY_INSTRUCTIONS[strategy].structuredOutput,
    "Contract",
    canonicalPromptJson(schema, "schema"),
  );
}

export function getToolUseContract(
  strategy: RecommendedPromptStrategy,
  tools: unknown,
): string {
  return renderPromptScaffold(
    strategy,
    "tool-use",
    STRATEGY_INSTRUCTIONS[strategy].toolUse,
    "Tools",
    canonicalPromptJson(tools, "tools"),
  );
}
