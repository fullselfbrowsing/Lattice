import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import { BAND, createHookPipeline } from "../contract/bands.js";
import { contract } from "../contract/contract.js";
import { createFakeProvider } from "../providers/fake.js";
import type {
  ModelCapability,
  ProviderPricingHint,
  ProviderRunResponse,
} from "../providers/provider.js";
import type { ReceiptSigner } from "../receipts/types.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import {
  CANONICAL_PROJECTED_OUTPUT_TOKENS,
  COST_ESTIMATOR_VERSION,
  estimateCost,
} from "../routing/cost.js";
import { fc } from "../test-support/fast-check.js";
import { defineTool } from "../tools/tools.js";

import type { AgentHost } from "./host.js";
import { runAgent, runAgentInternal } from "./runtime.js";
import type { AgentIntent } from "./types.js";

function countingSigner(options: {
  readonly reject?: boolean;
  readonly secret?: string;
} = {}): {
  readonly signer: ReceiptSigner;
  readonly calls: { value: number };
} {
  const calls = { value: 0 };
  const signer: ReceiptSigner = {
    kid: options.secret ?? "agent-policy-test-key",
    publicKeyJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "test",
    } as JsonWebKey,
    async sign(): Promise<Uint8Array> {
      calls.value += 1;
      if (options.reject === true) {
        throw new Error(options.secret ?? "SECRET-SIGNER-FAILURE");
      }
      return new Uint8Array([1, 2, 3]);
    },
  };
  return { signer, calls };
}

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

function makeBuildConfigSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test-stub",
      validate: (value: unknown) => {
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value) &&
          typeof (value as { readonly command?: unknown }).command === "string"
        ) {
          return { value: value as never };
        }

        return {
          issues: [{ message: "Expected build config with a string command." }],
        };
      },
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

function capabilityForCost(
  id: string,
  pricing: ProviderPricingHint | undefined,
): ModelCapability {
  const base = {
    ...defaultCapabilityForProvider(id),
    modelId: `${id}:cost-test`,
  };
  if (pricing !== undefined) {
    return { ...base, pricing };
  }
  const { pricing: inheritedPricing, ...unpriced } = base;
  return inheritedPricing === undefined ? base : unpriced;
}

function costProvider(
  pricing: ProviderPricingHint | undefined,
  response: () => ProviderRunResponse,
  id = "cost-provider",
) {
  return createFakeProvider({
    id,
    capabilities: [capabilityForCost(id, pricing)],
    response,
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

  it("materializes declared typed final outputs from provider rawOutputs", async () => {
    let seenOutputs: readonly string[] = [];
    let sawOutputContracts = false;
    const fake = createFakeProvider({
      response: (request) => {
        seenOutputs = request.outputs;
        sawOutputContracts = request.outputContracts !== undefined;
        return {
          rawOutputs: { build: { command: "pnpm build" } },
          normalizedUsage: { promptTokens: 2, completionTokens: 4, costUsd: 0 },
        };
      },
    });
    const result = await runAgent(
      {
        task: "Return a build config.",
        tools: [],
        outputs: { build: makeBuildConfigSchema() },
      },
      { providers: [fake] },
    );

    expect(result.kind).toBe("success");
    expect(seenOutputs).toEqual(["build"]);
    expect(sawOutputContracts).toBe(true);
    if (result.kind === "success") {
      expect(result.output).toEqual({ build: { command: "pnpm build" } });
    }
  });

  it("returns validation failure when declared final outputs are malformed", async () => {
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { build: { command: 42 } },
        normalizedUsage: { promptTokens: 2, completionTokens: 4, costUsd: 0 },
      }),
    });
    const result = await runAgent(
      {
        task: "Return a malformed build config.",
        tools: [],
        outputs: { build: makeBuildConfigSchema() },
      },
      { providers: [fake] },
    );

    expect(result.kind).toBe("validation");
    if (result.kind !== "success") {
      expect(result.reason).toBe('Invalid output "build".');
      expect(result.cause).toMatchObject({
        kind: "validation",
        output: "build",
      });
      expect(result.iterations).toHaveLength(1);
    }
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

  it("prefers response.toolCalls over parser fallback text", async () => {
    let iteration = 0;
    let validatedCalls = 0;
    let fallbackCalls = 0;
    const fake = createFakeProvider({
      response: () => {
        iteration += 1;
        if (iteration === 1) {
          return {
            rawOutputs: {
              answer: `{"tool_calls":[{"id":"fallback","name":"fallback","args":{"value":"wrong"}}]}`,
            },
            toolCalls: [{ id: "validated", name: "validated", args: { value: "right" } }],
            normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
          };
        }
        return {
          rawOutputs: { answer: "Done." },
          normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        };
      },
    });

    const result = await runAgent(
      {
        task: "Use the validated call.",
        tools: [
          makeTool("validated", () => {
            validatedCalls += 1;
            return "validated-result";
          }),
          makeTool("fallback", () => {
            fallbackCalls += 1;
            return "fallback-result";
          }),
        ],
      },
      { providers: [fake] },
    );

    expect(result.kind).toBe("success");
    expect(validatedCalls).toBe(1);
    expect(fallbackCalls).toBe(0);
    if (result.kind === "success") {
      expect(result.iterations[0]?.toolCalls[0]?.id).toBe("validated");
      expect(result.iterations[0]?.toolCalls[0]?.name).toBe("validated");
    }
  });

  it("does not execute invalid calls dropped by adapter validation", async () => {
    let dangerCalls = 0;
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: {
          answer: `{"tool_calls":[{"id":"danger","name":"danger","args":{"value":"run"}}]}`,
        },
        toolCalls: [],
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });

    const result = await runAgent(
      {
        task: "Do not execute dropped calls.",
        tools: [
          makeTool("danger", () => {
            dangerCalls += 1;
            return "danger-result";
          }),
        ],
      },
      { providers: [fake] },
    );

    expect(result.kind).toBe("success");
    expect(dangerCalls).toBe(0);
    if (result.kind === "success") {
      expect(result.iterations).toHaveLength(1);
      expect(result.iterations[0]?.toolCalls).toEqual([]);
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

  it.each([
    {
      name: "exact equality",
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 1 },
      budget: 0.512,
      expectedKind: "success",
      expectedCalls: 1,
    },
    {
      name: "known free equality",
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
      budget: 0,
      expectedKind: "success",
      expectedCalls: 1,
    },
    {
      name: "known overage",
      pricing: { inputPer1kTokens: 0, outputPer1kTokens: 1 },
      budget: 0.511,
      expectedKind: "no-contract-match",
      expectedCalls: 0,
    },
  ] as const)(
    "preflights $name before transport",
    async ({ pricing, budget, expectedKind, expectedCalls }) => {
      let calls = 0;
      const provider = costProvider(pricing, () => {
        calls += 1;
        return {
          rawOutputs: { answer: "done" },
          normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        };
      });
      const result = await runAgent(
        {
          task: "bounded",
          tools: [],
          contract: contract({ budget: { maxCostUsd: budget } }),
        },
        { providers: [provider] },
      );

      expect(result.kind).toBe(expectedKind);
      expect(calls).toBe(expectedCalls);
    },
  );

  it("fails closed on unknown pricing only when a hard ceiling exists", async () => {
    let calls = 0;
    const provider = costProvider(undefined, () => {
      calls += 1;
      return {
        rawOutputs: { answer: "done" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: null },
      };
    });
    const bounded = await runAgent(
      {
        task: "bounded unknown",
        tools: [],
        contract: contract({ budget: { maxCostUsd: 1 } }),
      },
      { providers: [provider] },
    );
    expect(bounded.kind).toBe("no-contract-match");
    expect(calls).toBe(0);

    const unbounded = await runAgent(
      { task: "unbounded unknown", tools: [] },
      { providers: [provider] },
    );
    expect(unbounded.kind).toBe("success");
    expect(calls).toBe(1);
    expect(unbounded.usage.costUsd).toBeNull();
  });

  it("uses cumulative remaining budget before a second provider call", async () => {
    let calls = 0;
    const provider = costProvider(
      { inputPer1kTokens: 0, outputPer1kTokens: 0.1953125 },
      () => {
        calls += 1;
        return {
          rawOutputs: {
            answer:
              calls === 1
                ? '{"tool_calls":[{"id":"c","name":"noop","args":{}}]}'
                : "must not execute",
          },
          normalizedUsage: {
            promptTokens: 1,
            completionTokens: 1,
            costUsd: 0.06,
          },
        };
      },
    );
    const result = await runAgent(
      {
        task: "cumulative",
        tools: [makeTool("noop")],
        contract: contract({ budget: { maxCostUsd: 0.15 } }),
      },
      { providers: [provider] },
    );

    expect(result.kind).toBe("no-contract-match");
    expect(result.usage.costUsd).toBe(0.06);
    expect(result.iterations).toHaveLength(1);
    expect(calls).toBe(1);
  });

  it("fills null actual usage from static pricing while reported cost wins", async () => {
    const pricing = { inputPer1kTokens: 0.001, outputPer1kTokens: 0.002 };
    const estimated = await runAgent(
      { task: "estimate actual", tools: [] },
      {
        providers: [
          costProvider(pricing, () => ({
            rawOutputs: { answer: "done" },
            normalizedUsage: {
              promptTokens: 1_000,
              completionTokens: 500,
              costUsd: null,
            },
          })),
        ],
      },
    );
    expect(estimated.usage.costUsd).toBe(0.002);

    const reported = await runAgent(
      { task: "reported actual", tools: [] },
      {
        providers: [
          costProvider(
            { inputPer1kTokens: 999, outputPer1kTokens: 999 },
            () => ({
              rawOutputs: { answer: "done" },
              normalizedUsage: {
                promptTokens: 1_000,
                completionTokens: 500,
                costUsd: 0.25,
              },
            }),
          ),
        ],
      },
    );
    expect(reported.usage.costUsd).toBe(0.25);
  });

  it("emits bounded estimate diagnostics without task content", async () => {
    const secret = "SECRET-AGENT-COST-PROMPT";
    const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
    const provider = costProvider(undefined, () => ({
      rawOutputs: { answer: "must not execute" },
    }));
    const result = await runAgent(
      {
        task: secret,
        tools: [],
        contract: contract({ budget: { maxCostUsd: 1 } }),
        tracer: {
          kind: "tracer",
          event(name, attributes) {
            events.push({ name, ...(attributes !== undefined ? { attributes } : {}) });
          },
        },
      },
      { providers: [provider] },
    );

    expect(result.kind).toBe("no-contract-match");
    const diagnostic = events.find((event) => event.name === "agent.cost.estimate");
    expect(diagnostic?.attributes).toMatchObject({
      version: COST_ESTIMATOR_VERSION,
      status: "unknown",
      outputTokens: 512,
    });
    expect(diagnostic?.attributes).not.toHaveProperty("totalCostUsd");
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it("property: generated first-call budgets preserve equality and reject overage", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          outputRateMicros: fc.integer({ min: 1, max: 100_000 }),
          task: fc.string({ minLength: 0, maxLength: 100 }),
          relation: fc.constantFrom("under", "equal", "over"),
        }),
        async ({ outputRateMicros, task, relation }) => {
          const pricing = {
            inputPer1kTokens: 0,
            outputPer1kTokens: outputRateMicros / 1_000_000,
          };
          const totalCostUsd = estimateCost({
            pricing,
            inputTokens: 1,
            outputTokens: CANONICAL_PROJECTED_OUTPUT_TOKENS,
          }).totalCostUsd!;
          const maxCostUsd =
            relation === "under"
              ? totalCostUsd * 2
              : relation === "equal"
                ? totalCostUsd
                : totalCostUsd / 2;
          let calls = 0;
          const provider = costProvider(pricing, () => {
            calls += 1;
            return {
              rawOutputs: { answer: "done" },
              normalizedUsage: {
                promptTokens: 1,
                completionTokens: 1,
                costUsd: 0,
              },
            };
          });
          const result = await runAgent(
            {
              task,
              tools: [],
              contract: contract({ budget: { maxCostUsd } }),
            },
            { providers: [provider] },
          );

          expect(calls).toBe(relation === "over" ? 0 : 1);
          expect(result.kind).toBe(
            relation === "over" ? "no-contract-match" : "success",
          );
        },
      ),
      { numRuns: 40 },
    );
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

describe("runAgentInternal — injectable dispatchToolUse seam (Phase 39)", () => {
  it("routes an intercepted request's { content } into the role:\"tool\" turn with original id/name", async () => {
    const tasks: string[] = [];
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"child-agent","args":{"task":"go"}}]}`,
      "Final.",
    ];
    const fake = createFakeProvider({
      response: (request) => {
        tasks.push(request.task);
        return {
          rawOutputs: { answer: responses.shift() ?? "" },
          normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
        };
      },
    });
    const seenContexts: Array<{ iterationIndex: number }> = [];
    const result = await runAgentInternal(
      { task: "Delegate.", tools: [] },
      { providers: [fake] },
      {
        dispatchToolUse: async (req, ctx) => {
          seenContexts.push({ iterationIndex: ctx.iterationIndex });
          if (req.name === "child-agent") {
            return { content: '{"summary":"child done"}' };
          }
          return undefined;
        },
      },
    );
    expect(result.kind).toBe("success");
    // The dispatched content lands verbatim in the role:"tool" turn — the
    // 2nd provider call renders it as a TOOL_RESULT with the original
    // toolCallId and toolName.
    const secondTask = tasks[1] ?? "";
    expect(secondTask).toContain("TOOL_RESULT (name=child-agent id=c1):");
    expect(secondTask).toContain('{"summary":"child done"}');
    expect(seenContexts).toEqual([{ iterationIndex: 0 }]);
    if (result.kind === "success") {
      expect(result.iterations[0]?.toolCalls[0]?.id).toBe("c1");
      expect(result.iterations[0]?.toolCalls[0]?.name).toBe("child-agent");
    }
  });

  it("falls through to the default runTool path when the dispatcher declines", async () => {
    const responses = [
      `{"tool_calls":[{"id":"c1","name":"echo","args":{"value":"hi"}}]}`,
      "Done.",
    ];
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: responses.shift() ?? "" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    let echoCalls = 0;
    const echo = makeTool("echo", (input) => {
      echoCalls += 1;
      return input;
    });
    const result = await runAgentInternal(
      { task: "Echo hi.", tools: [echo] },
      { providers: [fake] },
      {
        // Declines everything that is not a child name — proving fall-through.
        dispatchToolUse: async (req) =>
          req.name === "some-child" ? { content: "never" } : undefined,
      },
    );
    expect(result.kind).toBe("success");
    expect(echoCalls).toBe(1);
    if (result.kind === "success") {
      expect(result.iterations[0]?.toolCalls[0]?.name).toBe("echo");
    }
  });

  it("behaves identically to runAgent when no internal options are passed", async () => {
    const fake = createFakeProvider({
      response: () => ({
        rawOutputs: { answer: "Hello." },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0 },
      }),
    });
    const viaPublic = await runAgent({ task: "Hi.", tools: [] }, { providers: [fake] });
    const viaInternal = await runAgentInternal({ task: "Hi.", tools: [] }, { providers: [fake] });
    expect(viaPublic.kind).toBe("success");
    expect(viaInternal.kind).toBe("success");
    if (viaPublic.kind === "success" && viaInternal.kind === "success") {
      expect(viaInternal.output).toEqual(viaPublic.output);
    }
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

describe("runAgent — receipt policy", () => {
  it("preflights required missing signer before host storage or provider transport", async () => {
    const calls = { storage: 0, transport: 0, provider: 0 };
    const fake = createFakeProvider({
      response: () => {
        calls.provider += 1;
        return { rawOutputs: { answer: "must not run" } };
      },
    });
    const host: AgentHost = {
      kind: "agent-host",
      storage: {
        async load() {
          calls.storage += 1;
          return null;
        },
        async save() {
          calls.storage += 1;
        },
        async clear() {
          calls.storage += 1;
        },
      },
      transport: {
        async call(provider, request) {
          calls.transport += 1;
          return provider.execute!(request);
        },
      },
    };

    const result = await runAgent(
      { task: "Do not run.", tools: [], host },
      { providers: [fake], receiptMode: "required" },
    );

    expect(result).toMatchObject({
      kind: "audit",
      code: "receipt-signer-missing",
      stage: "pre-execution",
      terminal: true,
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      iterations: [],
    });
    expect(calls).toEqual({ storage: 0, transport: 0, provider: 0 });
  });

  it("lets an invocation mode override config and resolves the invocation signer first", async () => {
    const configSigner = countingSigner({ reject: true });
    const localSigner = countingSigner();
    const fake = createFakeProvider({
      response: () => ({ rawOutputs: { answer: "done" } }),
    });

    const offResult = await runAgent(
      {
        task: "No receipt.",
        tools: [],
        receiptMode: "off",
        signer: configSigner.signer,
      },
      { providers: [fake], receiptMode: "required" },
    );
    expect(offResult.kind).toBe("success");
    expect(configSigner.calls.value).toBe(0);

    const localResult = await runAgent(
      {
        task: "Use local signer.",
        tools: [],
        signer: localSigner.signer,
        autoRegisterCheckpoint: false,
      },
      {
        providers: [fake],
        receiptMode: "required",
        signer: configSigner.signer,
      },
    );
    expect(localResult.kind).toBe("success");
    expect(localSigner.calls.value).toBe(1);
    expect(configSigner.calls.value).toBe(0);
  });

  it("reuses a required checkpoint failure after one final-answer provider call", async () => {
    const secret = "SECRET-CHECKPOINT-KMS-FAILURE";
    const { signer, calls } = countingSigner({ reject: true, secret });
    let providerCalls = 0;
    const fake = createFakeProvider({
      response: () => {
        providerCalls += 1;
        return {
          rawOutputs: { answer: "completed output" },
          normalizedUsage: { promptTokens: 4, completionTokens: 2, costUsd: 0.01 },
        };
      },
    });

    const result = await runAgent(
      {
        task: "Complete once.",
        tools: [],
        signer,
        receiptMode: "required",
      },
      { providers: [fake] },
    );

    expect(result).toMatchObject({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "post-execution",
      usage: { promptTokens: 4, completionTokens: 2, costUsd: 0.01 },
    });
    expect(result.iterations).toHaveLength(1);
    expect(providerCalls).toBe(1);
    expect(calls.value).toBe(1);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("stops a tool loop after the first required checkpoint failure", async () => {
    const { signer, calls } = countingSigner({ reject: true });
    let providerCalls = 0;
    let toolCalls = 0;
    const fake = createFakeProvider({
      response: () => {
        providerCalls += 1;
        return {
          rawOutputs: {
            answer:
              providerCalls === 1
                ? `{"tool_calls":[{"id":"c1","name":"once","args":{}}]}`
                : "must not reach a second provider call",
          },
        };
      },
    });

    const result = await runAgent(
      {
        task: "Use one tool.",
        tools: [
          makeTool("once", () => {
            toolCalls += 1;
            return "done";
          }),
        ],
        signer,
        receiptMode: "required",
      },
      { providers: [fake] },
    );

    expect(result.kind).toBe("audit");
    expect(providerCalls).toBe(1);
    expect(toolCalls).toBe(1);
    expect(calls.value).toBe(1);
  });

  it("turns a required terminal signer failure after provider error into safe audit failure", async () => {
    const secret = "SECRET-PROVIDER-TERMINAL-SIGNER";
    const { signer, calls } = countingSigner({ reject: true, secret });
    let providerCalls = 0;
    const fake = createFakeProvider({
      response: () => {
        providerCalls += 1;
        throw new Error("provider failed");
      },
    });

    const result = await runAgent(
      {
        task: "Fail once.",
        tools: [],
        signer,
        receiptMode: "required",
        autoRegisterCheckpoint: false,
      },
      { providers: [fake] },
    );

    expect(result).toMatchObject({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "post-execution",
    });
    expect(providerCalls).toBe(1);
    expect(calls.value).toBe(1);
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("finalizes denied, zero-budget, and validation branches exactly once", async () => {
    const cases: Array<{
      readonly name: string;
      readonly run: (signer: ReceiptSigner) => Promise<unknown>;
      readonly expectedProviderCalls: number;
    }> = [];
    let providerCalls = 0;
    const fake = createFakeProvider({
      response: () => {
        providerCalls += 1;
        return { rawOutputs: { build: { command: 42 } } };
      },
    });
    const deniedPipeline = createHookPipeline();
    deniedPipeline.register(
      "BEFORE_AGENT_ITERATION",
      (_ctx, controls) => controls?.deny("denied"),
      { band: BAND.SAFETY },
    );
    cases.push(
      {
        name: "denied",
        expectedProviderCalls: 0,
        run: (signer) =>
          runAgent(
            {
              task: "Denied.",
              tools: [],
              pipeline: deniedPipeline,
              signer,
              receiptMode: "required",
            },
            { providers: [fake] },
          ),
      },
      {
        name: "zero-budget",
        expectedProviderCalls: 0,
        run: (signer) =>
          runAgent(
            {
              task: "No iterations.",
              tools: [],
              contract: contract({ budget: { maxIterations: 0 } }),
              signer,
              receiptMode: "required",
              autoRegisterCheckpoint: false,
            },
            { providers: [fake] },
          ),
      },
      {
        name: "validation",
        expectedProviderCalls: 1,
        run: (signer) =>
          runAgent(
            {
              task: "Invalid output.",
              tools: [],
              outputs: { build: makeBuildConfigSchema() },
              signer,
              receiptMode: "required",
              autoRegisterCheckpoint: false,
            },
            { providers: [fake] },
          ),
      },
    );

    for (const testCase of cases) {
      providerCalls = 0;
      const signerState = countingSigner({ reject: true });
      const result = await testCase.run(signerState.signer);
      expect(result, testCase.name).toMatchObject({ kind: "audit" });
      expect(signerState.calls.value, testCase.name).toBe(1);
      expect(providerCalls, testCase.name).toBe(testCase.expectedProviderCalls);
    }
  });

  it("keeps best-effort signer failure non-terminal and explicit off skips signing", async () => {
    const bestEffort = countingSigner({ reject: true });
    const off = countingSigner({ reject: true });
    const fake = createFakeProvider({
      response: () => ({ rawOutputs: { answer: "done" } }),
    });

    const bestEffortResult = await runAgent(
      {
        task: "Best effort.",
        tools: [],
        signer: bestEffort.signer,
      },
      { providers: [fake] },
    );
    const offResult = await runAgent(
      {
        task: "Off.",
        tools: [],
        signer: off.signer,
        receiptMode: "off",
      },
      { providers: [fake] },
    );

    expect(bestEffortResult.kind).toBe("success");
    expect(bestEffort.calls.value).toBe(2);
    expect(offResult.kind).toBe("success");
    expect(off.calls.value).toBe(0);
  });

  it("issues one required terminal receipt on the no-provider branch", async () => {
    const { signer, calls } = countingSigner();
    const result = await runAgent(
      {
        task: "No provider.",
        tools: [],
        signer,
        receiptMode: "required",
      },
      { providers: [] },
    );

    expect(result.kind).toBe("execution_unavailable");
    expect(calls.value).toBe(1);
  });
});
