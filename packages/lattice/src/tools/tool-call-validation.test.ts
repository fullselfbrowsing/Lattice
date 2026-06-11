import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ToolCallValidationError,
  validateToolCallRequests,
} from "./tool-call-validation.js";
import { defineTool } from "./tools.js";

const searchTool = defineTool({
  name: "search",
  description: "Search records",
  inputSchema: z.object({ query: z.string() }),
  execute: () => "ok",
});

const validSearchCall = {
  id: "valid-1",
  name: "search",
  args: { query: "lattice" },
};

describe("validateToolCallRequests", () => {
  it("returns undefined when validation is not configured", async () => {
    await expect(validateToolCallRequests([validSearchCall], undefined)).resolves.toBeUndefined();
  });

  it("throws unknown_tool when the model calls a hallucinated tool name", async () => {
    await expect(
      validateToolCallRequests(
        [{ id: "bad-1", name: "search_database", args: { query: "lattice" } }],
        { tools: [searchTool] },
      ),
    ).rejects.toMatchObject({
      reason: "unknown_tool",
      toolName: "search_database",
      attemptedArgs: { query: "lattice" },
      validationIssues: [],
      requestId: "bad-1",
    });
  });

  it("throws invalid_args with normalized issue paths for malformed arguments", async () => {
    await expect(
      validateToolCallRequests(
        [{ id: "bad-2", name: "search", args: { quer: "..." } }],
        { tools: [searchTool], onFailure: "throw" },
      ),
    ).rejects.toMatchObject({
      reason: "invalid_args",
      toolName: "search",
      attemptedArgs: { quer: "..." },
      validationIssues: [{ path: ["query"] }],
      requestId: "bad-2",
    });
  });

  it("throws extra_fields after schema validation succeeds when undeclared args exist", async () => {
    await expect(
      validateToolCallRequests(
        [{ id: "bad-3", name: "search", args: { query: "lattice", ignored: true } }],
        { tools: [searchTool], onFailure: "throw" },
      ),
    ).rejects.toMatchObject({
      reason: "extra_fields",
      toolName: "search",
      validationIssues: [{ path: ["ignored"] }],
      requestId: "bad-3",
    });
  });

  it("permits extra fields when allowExtraFields is true", async () => {
    const result = await validateToolCallRequests(
      [{ id: "ok-extra", name: "search", args: { query: "lattice", ignored: true } }],
      { tools: [searchTool], allowExtraFields: true },
    );

    expect(result).toEqual([{ id: "ok-extra", name: "search", args: { query: "lattice" } }]);
  });

  it("drop mode returns only valid calls", async () => {
    const result = await validateToolCallRequests(
      [
        { id: "bad-4", name: "search_database", args: { query: "lattice" } },
        validSearchCall,
      ],
      { tools: [searchTool], onFailure: "drop" },
    );

    expect(result).toEqual([validSearchCall]);
  });

  it("callback mode reports invalid calls and returns only valid calls", async () => {
    const errors: ToolCallValidationError[] = [];

    const result = await validateToolCallRequests(
      [
        { id: "bad-5", name: "search", args: { quer: "..." } },
        validSearchCall,
      ],
      {
        tools: [searchTool],
        onFailure: "callback",
        onValidationFailure: (error) => {
          errors.push(error);
        },
      },
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(ToolCallValidationError);
    expect(errors[0]?.reason).toBe("invalid_args");
    expect(result).toEqual([validSearchCall]);
  });

  it("rejects callback mode without a callback as a configuration error", async () => {
    await expect(
      validateToolCallRequests([validSearchCall], {
        tools: [searchTool],
        onFailure: "callback",
      }),
    ).rejects.toThrow(/onValidationFailure/);
  });
});
