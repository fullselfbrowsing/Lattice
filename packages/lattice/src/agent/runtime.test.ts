import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { BAND, createHookPipeline } from "../contract/bands.js";
import { contract } from "../contract/contract.js";
import { createFakeProvider } from "../providers/fake.js";
import { defineTool } from "../tools/tools.js";

import { runAgent } from "./runtime.js";
import type { AgentIntent } from "./types.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      // Returning `issues: undefined` (omitting it entirely is equivalent) — the
      // real validateSchemaOutput treats ANY truthy `issues` (including an empty
      // array) as a failure. Stubs that pass validation must omit the field.
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

function makeTool(
  name: string,
  execute: (input: unknown) => unknown | Promise<unknown> = () => "ok",
) {
  return defineTool({
    name,
    inputSchema: makeSchema(),
    execute,
  });
}

describe("runAgent — final-answer path", () => {
  it("exits on iteration 0 when the provider returns a final-answer text", async () => {
    let calls = 0;
    const fake = createFakeProvider({
      response: () => {
        calls += 1;
        return {
          rawOutputs: { answer: "Hello, world." },
          normalizedUsage: { promptTokens: 5, completionTokens: 3, costUsd: 0.001 },
        };
      },
    });
    const intent: AgentIntent = { task: "Say hello.", tools: [] };
    const result = await runAgent(intent, { providers: [fake] });
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.output).toEqual({ answer: "Hello, world." });
      expect(result.iterations.length).toBe(1);
      expect(result.iterations[0]?.provider).toBe("fake");
      expect(result.usage.promptTokens).toBe(5);
      expect(result.usage.completionTokens).toBe(3);
      expect(result.usage.costUsd).toBeCloseTo(0.001);
    }
    expect(calls).toBe(1);
  });
});

describe("runAgent — tool-use multi-iteration", () => {
  it("runs an iteration that dispatches a tool, then exits on the final answer", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"echo","args":{"value":"hi"}}]}`,
      "Final answer with echo result included.",
    ];
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.002 },
      }),
    });
    let toolCalls = 0;
    const echo = makeTool("echo", (input) => {
      toolCalls += 1;
      return input;
    });
    const result = await runAgent(
      { task: "Echo hi.", tools: [echo] },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    expect(toolCalls).toBe(1);
    if (result.kind === "success") {
      expect(result.iterations.length).toBe(2);
      expect(result.iterations[0]?.toolCalls.length).toBe(1);
      expect(result.iterations[0]?.toolCalls[0]?.name).toBe("echo");
      expect(result.iterations[1]?.toolCalls.length).toBe(0);
      // Usage accumulates across both iterations.
      expect(result.usage.promptTokens).toBe(20);
      expect(result.usage.completionTokens).toBe(10);
      expect(result.usage.costUsd).toBeCloseTo(0.004);
    }
  });
});

describe("runAgent — sticky provider", () => {
  it("uses the first provider across iterations", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"echo","args":{}}]}`,
      "Done.",
    ];
    const fake = createFakeProvider({
      id: "primary",
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      { task: "Do it.", tools: [makeTool("echo")] },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      const providers = new Set(result.iterations.map((i) => i.provider));
      expect(providers.size).toBe(1);
      expect(providers.has("primary")).toBe(true);
    }
  });
});

describe("runAgent — SAFETY-band deny", () => {
  it("returns agent-iteration-denied when a SAFETY handler calls controls.deny", async () => {
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "Should not run." },
        normalizedUsage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      }),
    });
    const pipeline = createHookPipeline();
    pipeline.register(
      "BEFORE_AGENT_ITERATION",
      (_ctx, controls) => {
        controls?.deny("policy violation: task contains forbidden term");
      },
      { band: BAND.SAFETY },
    );
    const result = await runAgent(
      { task: "Anything.", tools: [], pipeline },
      { providers: [fake] },
    );
    expect(result.kind).toBe("agent-iteration-denied");
    if (result.kind !== "success") {
      expect(result.reason).toMatch(/policy violation/);
      expect(result.iterations.length).toBe(1);
      expect(result.iterations[0]?.deniedReason).toMatch(/policy violation/);
    }
  });
});

describe("runAgent — maxIterations budget", () => {
  it("returns agent-max-iterations when budget is exhausted", async () => {
    // Provider always returns a tool_use envelope → loops forever absent budget.
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: `{"tool_calls":[{"id":"c","name":"noop","args":{}}]}` },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      {
        task: "Loop.",
        tools: [makeTool("noop")],
        contract: contract({ budget: { maxIterations: 3 } }),
      },
      { providers: [fake] },
    );
    expect(result.kind).toBe("agent-max-iterations");
    if (result.kind !== "success") {
      expect(result.iterations.length).toBe(3);
    }
  });
});

describe("runAgent — maxWallTimeMs budget", () => {
  it("returns agent-wall-time-exceeded when the budget is reached", async () => {
    const fake = createFakeProvider({
      response: async () => {
        // Slow each iteration by 60ms; budget is 30ms → exceeded after iter 0.
        await new Promise((resolve) => setTimeout(resolve, 60));
        return {
          rawOutputs: { answer: `{"tool_calls":[{"id":"c","name":"noop","args":{}}]}` },
          normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        };
      },
    });
    const result = await runAgent(
      {
        task: "Loop.",
        tools: [makeTool("noop")],
        contract: contract({ budget: { maxWallTimeMs: 30 } }),
      },
      { providers: [fake] },
    );
    expect(result.kind).toBe("agent-wall-time-exceeded");
  });
});

describe("runAgent — cost budget", () => {
  it("returns no-contract-match with a budget-exceeded reason when cumulative cost is exhausted", async () => {
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: `{"tool_calls":[{"id":"c","name":"noop","args":{}}]}` },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 1.0 },
      }),
    });
    const result = await runAgent(
      {
        task: "Loop.",
        tools: [makeTool("noop")],
        contract: contract({ budget: { maxCostUsd: 0.5 } }),
      },
      { providers: [fake] },
    );
    expect(result.kind).toBe("no-contract-match");
    if (result.kind !== "success") {
      expect(result.reason).toMatch(/Cost budget/);
    }
  });
});

describe("runAgent — lifecycle events", () => {
  it("fires BEFORE_AGENT_ITERATION and AFTER_AGENT_ITERATION in order per iteration", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"noop","args":{}}]}`,
      "Final.",
    ];
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      }),
    });
    const seen: string[] = [];
    const pipeline = createHookPipeline();
    pipeline.register(
      "BEFORE_AGENT_ITERATION",
      (ctx) => {
        const c = ctx as { iterationIndex: number };
        seen.push(`before:${c.iterationIndex}`);
      },
      { band: BAND.OBSERVABILITY },
    );
    pipeline.register(
      "AFTER_AGENT_ITERATION",
      (ctx) => {
        const c = ctx as { iterationIndex: number };
        seen.push(`after:${c.iterationIndex}`);
      },
      { band: BAND.OBSERVABILITY },
    );
    const result = await runAgent(
      { task: "Two iterations.", tools: [makeTool("noop")], pipeline },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    expect(seen).toEqual(["before:0", "after:0", "before:1", "after:1"]);
  });
});

describe("runAgent — unknown tool dispatch", () => {
  it("returns an error tool result when the model requests a tool that isn't registered", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"missing","args":{}}]}`,
      "Sorry, that tool doesn't exist.",
    ];
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      { task: "Do.", tools: [makeTool("present")] },
      { providers: [fake] },
    );
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      // The first iteration recorded a tool_call attempt for `missing`.
      expect(result.iterations[0]?.toolCalls[0]?.name).toBe("missing");
      // The conversation included a tool-result turn carrying the error JSON.
      // (Indirect assertion via the second-iteration final answer existing.)
    }
  });
});

describe("runAgent — execution_unavailable when no provider has execute()", () => {
  it("returns execution_unavailable when providers list is empty", async () => {
    const result = await runAgent(
      { task: "Anything.", tools: [] },
      { providers: [] },
    );
    expect(result.kind).toBe("execution_unavailable");
  });
});

describe("runAgent — provider error path", () => {
  it("returns provider_execution when the adapter throws", async () => {
    const fake = createFakeProvider({
      response: () => {
        throw new Error("Simulated provider failure.");
      },
    });
    const result = await runAgent(
      { task: "Anything.", tools: [] },
      { providers: [fake] },
    );
    expect(result.kind).toBe("provider_execution");
    if (result.kind !== "success") {
      expect(result.reason).toMatch(/Simulated provider failure/);
    }
  });
});
