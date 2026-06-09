import type { StandardSchemaV1 } from "@standard-schema/spec";

import { validateSchemaOutput } from "../outputs/validate.js";
import type { ToolUseRequest } from "../agent/types.js";
import type { ValidationIssue } from "../results/errors.js";
import type { ToolDefinition } from "./tools.js";

export type ToolCallValidationFailureReason =
  | "unknown_tool"
  | "invalid_args"
  | "extra_fields";

export interface ValidatedToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: unknown;
}

type ToolCallValidationTool = Pick<ToolDefinition, "name" | "inputSchema">;

export interface ValidateToolCallsOption {
  readonly tools: readonly ToolCallValidationTool[];
  readonly onFailure?: "throw" | "drop" | "callback";
  readonly onValidationFailure?: (error: ToolCallValidationError) => void | Promise<void>;
  readonly allowExtraFields?: boolean;
}

export class ToolCallValidationError extends Error {
  readonly kind = "tool-call-validation" as const;
  readonly reason: ToolCallValidationFailureReason;
  readonly toolName: string;
  readonly attemptedArgs: unknown;
  readonly validationIssues: readonly ValidationIssue[];
  readonly requestId: string;

  constructor(input: {
    readonly reason: ToolCallValidationFailureReason;
    readonly toolName: string;
    readonly attemptedArgs: unknown;
    readonly validationIssues?: readonly ValidationIssue[];
    readonly requestId: string;
  }) {
    super(createValidationMessage(input.reason, input.toolName, input.requestId));
    this.name = "ToolCallValidationError";
    this.reason = input.reason;
    this.toolName = input.toolName;
    this.attemptedArgs = input.attemptedArgs;
    this.validationIssues = input.validationIssues ?? [];
    this.requestId = input.requestId;
  }
}

export async function validateToolCallRequests(
  requests: readonly ToolUseRequest[],
  option: ValidateToolCallsOption | undefined,
): Promise<readonly ValidatedToolCall[] | undefined> {
  if (option === undefined) {
    return undefined;
  }

  const onFailure = option.onFailure ?? "throw";
  if (onFailure === "callback" && option.onValidationFailure === undefined) {
    throw new Error(
      'validateToolCalls.onValidationFailure is required when onFailure is "callback".',
    );
  }

  const toolsByName = new Map(option.tools.map((tool) => [tool.name, tool]));
  const validCalls: ValidatedToolCall[] = [];

  for (const request of requests) {
    const tool = toolsByName.get(request.name);
    if (tool === undefined) {
      await handleValidationError(
        new ToolCallValidationError({
          reason: "unknown_tool",
          toolName: request.name,
          attemptedArgs: request.args,
          requestId: request.id,
        }),
        onFailure,
        option.onValidationFailure,
      );
      continue;
    }

    const validation = await validateSchemaOutput(tool.name, tool.inputSchema, request.args);
    if (!validation.ok) {
      await handleValidationError(
        new ToolCallValidationError({
          reason: "invalid_args",
          toolName: request.name,
          attemptedArgs: request.args,
          validationIssues: validation.issue.issues,
          requestId: request.id,
        }),
        onFailure,
        option.onValidationFailure,
      );
      continue;
    }

    const extraFields = option.allowExtraFields === true
      ? []
      : findExtraFields(tool.inputSchema, request.args);
    if (extraFields.length > 0) {
      await handleValidationError(
        new ToolCallValidationError({
          reason: "extra_fields",
          toolName: request.name,
          attemptedArgs: request.args,
          validationIssues: extraFields.map((field) => ({
            message: `Unexpected tool argument field "${field}".`,
            path: [field],
          })),
          requestId: request.id,
        }),
        onFailure,
        option.onValidationFailure,
      );
      continue;
    }

    validCalls.push({
      id: request.id,
      name: request.name,
      args: validation.value,
    });
  }

  return validCalls;
}

async function handleValidationError(
  error: ToolCallValidationError,
  onFailure: "throw" | "drop" | "callback",
  callback: ValidateToolCallsOption["onValidationFailure"],
): Promise<void> {
  if (onFailure === "throw") {
    throw error;
  }
  if (onFailure === "callback") {
    await callback?.(error);
  }
}

function findExtraFields(
  schema: StandardSchemaV1,
  value: unknown,
): readonly string[] {
  if (!isRecord(value)) {
    return [];
  }

  const allowedFields = getObjectSchemaKeys(schema);
  if (allowedFields === undefined) {
    return [];
  }

  const allowed = new Set(allowedFields);
  return Object.keys(value).filter((field) => !allowed.has(field));
}

function getObjectSchemaKeys(schema: StandardSchemaV1): readonly string[] | undefined {
  const candidate = schema as {
    readonly shape?: unknown;
    readonly def?: { readonly type?: unknown; readonly shape?: unknown };
    readonly _def?: { readonly type?: unknown; readonly shape?: unknown };
  };

  const directShape = normalizeShape(candidate.shape);
  if (directShape !== undefined) {
    return directShape;
  }

  if (candidate.def?.type === "object") {
    const defShape = normalizeShape(candidate.def.shape);
    if (defShape !== undefined) {
      return defShape;
    }
  }

  if (candidate._def?.type === "object") {
    return normalizeShape(candidate._def.shape);
  }

  return undefined;
}

function normalizeShape(shape: unknown): readonly string[] | undefined {
  const resolved = typeof shape === "function" ? (shape as () => unknown)() : shape;
  if (!isRecord(resolved)) {
    return undefined;
  }

  return Object.keys(resolved);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createValidationMessage(
  reason: ToolCallValidationFailureReason,
  toolName: string,
  requestId: string,
): string {
  if (reason === "unknown_tool") {
    return `Unknown tool call "${toolName}" (${requestId}).`;
  }
  if (reason === "extra_fields") {
    return `Tool call "${toolName}" contains unexpected argument fields (${requestId}).`;
  }
  return `Invalid arguments for tool call "${toolName}" (${requestId}).`;
}
