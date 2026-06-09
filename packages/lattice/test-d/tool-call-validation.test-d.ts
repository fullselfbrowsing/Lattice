import { expectAssignable, expectType } from "tsd";
import { z } from "zod";

import {
  ToolCallValidationError,
  defineTool,
} from "@full-self-browsing/lattice";
import type {
  ToolCallValidationFailureReason,
  ValidateToolCallsOption,
  ValidatedToolCall,
} from "@full-self-browsing/lattice";

const tool = defineTool({
  name: "search",
  inputSchema: z.object({ query: z.string() }),
  execute: (input) => input.query,
});

const option: ValidateToolCallsOption = {
  tools: [tool],
  onFailure: "callback",
  onValidationFailure: () => undefined,
  allowExtraFields: false,
};

expectType<ValidateToolCallsOption>(option);
expectAssignable<ToolCallValidationFailureReason>("unknown_tool");
expectAssignable<ToolCallValidationFailureReason>("invalid_args");
expectAssignable<ToolCallValidationFailureReason>("extra_fields");

const call: ValidatedToolCall = {
  id: "call-1",
  name: "search",
  args: { query: "lattice" },
};

expectType<string>(call.id);
expectType<string>(call.name);
expectType<unknown>(call.args);

const error = new ToolCallValidationError({
  reason: "unknown_tool",
  toolName: "search_database",
  attemptedArgs: { query: "lattice" },
  requestId: "call-2",
});

expectType<"tool-call-validation">(error.kind);
expectType<ToolCallValidationFailureReason>(error.reason);
