import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_PROJECTED_OUTPUT_TOKENS,
  COST_ESTIMATOR_VERSION,
  contract,
  createAI,
  createAISdkProvider,
  createCostTracker,
  createExternalExecutionAudit,
  createNoopAgentHost,
  defineAgent,
  defineTool,
  estimateCost,
  estimateRouteCost,
  evaluateContractAgainstRoute,
  formatToolsForProvider,
  runAgent,
  runAgentCrew,
} from "../src/index.js";
import type {
  ReceiptIssuanceMode,
  ReceiptSigner,
} from "../src/index.js";
import { estimateTokens } from "../src/context.js";
import type {
  ModelCapability,
  ProviderAdapter,
  ProviderPricingHint,
} from "../src/providers.js";
import {
  createCapabilityCatalog,
  defaultCapabilityForProvider,
  routeDeterministically,
} from "../src/routing.js";
import { fc } from "../src/test-support/fast-check.js";

const SIGNER_SECRET = "SECRET-PHASE-60-SIGNER-CAUSE";

type SignerState = "missing" | "working" | "failing";
type RuntimeTransport = "sync" | "stream";

interface SignerHarness {
  readonly calls: { value: number };
  readonly signer?: ReceiptSigner;
}

function signerHarness(input: {
  readonly state?: Exclude<SignerState, "missing">;
  readonly failOn?: readonly number[];
  readonly secret?: string;
} = {}): SignerHarness {
  const calls = { value: 0 };
  if (input.state === undefined) {
    return { calls };
  }
  const failOn = new Set(input.failOn ?? []);
  const signer: ReceiptSigner = {
    kid: `phase-60-${input.state}`,
    publicKeyJwk: {
      kty: "OKP",
      crv: "Ed25519",
      x: "phase-60",
    } as JsonWebKey,
    async sign(): Promise<Uint8Array> {
      calls.value += 1;
      if (input.state === "failing" || failOn.has(calls.value)) {
        throw new Error(input.secret ?? SIGNER_SECRET);
      }
      return new Uint8Array([calls.value, 60]);
    },
  };
  return { calls, signer };
}

function capability(
  id: string,
  pricing: ProviderPricingHint | null = {
    inputPer1kTokens: 0,
    outputPer1kTokens: 0,
  },
): ModelCapability {
  const base = {
    ...defaultCapabilityForProvider(id),
    modelId: `${id}:phase-60`,
    streaming: true,
  };
  if (pricing !== null) {
    return { ...base, pricing };
  }
  const { pricing: _inheritedPricing, ...unpriced } = base;
  return unpriced;
}

function runtimeProvider(
  transport: RuntimeTransport,
  calls: { value: number },
): ProviderAdapter {
  const id = `audit-${transport}`;
  if (transport === "sync") {
    return {
      id,
      kind: "provider-adapter",
      capabilities: [capability(id)],
      async execute() {
        calls.value += 1;
        return {
          rawOutputs: { answer: "done" },
          normalizedUsage: {
            promptTokens: 2,
            completionTokens: 1,
            costUsd: 0,
          },
        };
      },
    };
  }

  return {
    id,
    kind: "provider-adapter",
    capabilities: [capability(id)],
    async *executeStream() {
      calls.value += 1;
      yield { kind: "text-delta" as const, output: "answer", text: "done" };
      yield {
        kind: "usage" as const,
        normalizedUsage: {
          promptTokens: 2,
          completionTokens: 1,
          costUsd: 0,
        },
      };
    },
  };
}

function schema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "phase-60-test",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

const runtimeAuditCases = (["sync", "stream"] as const).flatMap((transport) =>
  (["off", "best-effort", "required"] as const).flatMap((mode) =>
    (["missing", "working", "failing"] as const).map((signerState) => ({
      transport,
      mode,
      signerState,
    })),
  ),
);

describe("Phase 60 cross-surface receipt integrity", () => {
  it.each(runtimeAuditCases)(
    "[AUDIT16-01..03] $transport $mode with $signerState signer preserves call and terminal policy",
    async ({ transport, mode, signerState }) => {
      const signerStateHarness =
        signerState === "missing"
          ? signerHarness()
          : signerHarness({ state: signerState });
      const providerCalls = { value: 0 };
      const provider = runtimeProvider(transport, providerCalls);
      const result = await createAI({
        providers: [provider],
        receiptMode: mode,
        ...(signerStateHarness.signer !== undefined
          ? { signer: signerStateHarness.signer }
          : {}),
      }).run({
        task: `${transport} ${mode} ${signerState}`,
        outputs: { answer: "text" },
        ...(transport === "stream" ? { policy: { stream: true } } : {}),
      });

      const preExecutionFailure =
        mode === "required" && signerState === "missing";
      const postExecutionFailure =
        mode === "required" && signerState === "failing";
      expect(providerCalls.value).toBe(preExecutionFailure ? 0 : 1);
      expect(signerStateHarness.calls.value).toBe(
        mode === "off" || signerState === "missing" ? 0 : 1,
      );

      if (preExecutionFailure || postExecutionFailure) {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toMatchObject({
            kind: "audit",
            code: preExecutionFailure
              ? "receipt-signer-missing"
              : "receipt-signing-failed",
            stage: preExecutionFailure ? "pre-execution" : "post-execution",
            terminal: true,
          });
        }
      } else {
        expect(result.ok).toBe(true);
        if (result.ok) {
          const shouldIssue =
            mode !== "off" && signerState === "working";
          expect(result.receipt === undefined).toBe(!shouldIssue);
        }
      }
      expect(JSON.stringify(result)).not.toContain(SIGNER_SECRET);
    },
  );

  it("[AUDIT16-02, AUDIT16-04] required missing signer stops agent and crew before provider work", async () => {
    let providerCalls = 0;
    const provider = createAISdkProvider({
      id: "missing-agent-crew",
      model: "missing-agent-crew:model",
      generate: () => {
        providerCalls += 1;
        return { rawOutputs: { answer: "must not execute" } };
      },
    });
    const agentResult = await runAgent(
      { task: "agent preflight", tools: [] },
      { providers: [provider], receiptMode: "required" },
    );
    const root = defineAgent({
      id: "lead",
      intent: "crew preflight",
      tools: [],
      summaryReturnSchema: schema(),
    });
    const crewResult = await runAgentCrew(
      { root, hosts: { childHost: createNoopAgentHost() } },
      { providers: [provider], receiptMode: "required" },
    );

    expect(agentResult).toMatchObject({
      kind: "audit",
      code: "receipt-signer-missing",
      stage: "pre-execution",
    });
    expect(crewResult.result).toMatchObject({
      kind: "audit",
      code: "receipt-signer-missing",
      stage: "pre-execution",
    });
    expect(providerCalls).toBe(0);
  });

  it.each(["final", "tool"] as const)(
    "[AUDIT16-03, AUDIT16-04] required agent $variant signer failure is safe and single-shot",
    async (variant) => {
      const failing = signerHarness({ state: "failing" });
      let providerCalls = 0;
      let toolCalls = 0;
      const provider = createAISdkProvider({
        id: `agent-${variant}`,
        model: `agent-${variant}:model`,
        generate: () => {
          providerCalls += 1;
          return {
            rawOutputs: {
              answer:
                variant === "tool"
                  ? '{"tool_calls":[{"id":"c1","name":"once","args":{}}]}'
                  : "done",
            },
            normalizedUsage: {
              promptTokens: 2,
              completionTokens: 1,
              costUsd: 0,
            },
          };
        },
      });
      const tool = defineTool({
        name: "once",
        inputSchema: schema(),
        execute: () => {
          toolCalls += 1;
          return "done";
        },
      });
      const result = await runAgent(
        {
          task: `agent ${variant}`,
          tools: variant === "tool" ? [tool] : [],
          receiptMode: "required",
          signer: failing.signer!,
        },
        { providers: [provider] },
      );

      expect(result).toMatchObject({
        kind: "audit",
        code: "receipt-signing-failed",
        stage: "post-execution",
      });
      expect(providerCalls).toBe(1);
      expect(toolCalls).toBe(variant === "tool" ? 1 : 0);
      expect(failing.calls.value).toBe(1);
      expect(JSON.stringify(result)).not.toContain(SIGNER_SECRET);
    },
  );

  it("[AUDIT16-04] crew parent/child and external audit paths never repeat completed work", async () => {
    const child = defineAgent({
      id: "researcher",
      intent: "Research once.",
      tools: [],
      summaryReturnSchema: schema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Delegate once.",
      tools: [],
      childAgents: [child],
      summaryReturnSchema: schema(),
    });
    const answers = [
      '{"tool_calls":[{"id":"c1","name":"researcher","args":{"task":"work"}}]}',
      "child summary",
      "parent answer",
    ];
    let crewProviderCalls = 0;
    const crewProvider = createAISdkProvider({
      id: "crew-audit-matrix",
      model: "crew-audit-matrix:model",
      generate: () => {
        crewProviderCalls += 1;
        return {
          rawOutputs: { answer: answers.shift() ?? "" },
          normalizedUsage: {
            promptTokens: 1,
            completionTokens: 1,
            costUsd: 0,
          },
        };
      },
    });
    const working = signerHarness({ state: "working" });
    const crewResult = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        receiptMode: "required",
        signer: working.signer!,
      },
      { providers: [crewProvider] },
    );

    expect(crewResult.result.kind).toBe("success");
    expect(crewProviderCalls).toBe(3);
    expect(working.calls.value).toBeGreaterThan(0);

    const parentSigner = signerHarness({
      state: "working",
      failOn: [4],
      secret: SIGNER_SECRET,
    });
    let parentProviderCalls = 0;
    const parentProvider = createAISdkProvider({
      id: "crew-parent-failure",
      model: "crew-parent-failure:model",
      generate: () => {
        parentProviderCalls += 1;
        return {
          rawOutputs: { answer: "parent completed" },
          normalizedUsage: {
            promptTokens: 2,
            completionTokens: 1,
            costUsd: 0,
          },
        };
      },
    });
    const rootOnly = defineAgent({
      id: "root-only",
      intent: "Complete once.",
      tools: [],
      summaryReturnSchema: schema(),
    });
    const parentFailure = await runAgentCrew(
      {
        root: rootOnly,
        hosts: { childHost: createNoopAgentHost() },
        receiptMode: "required",
        signer: parentSigner.signer!,
      },
      { providers: [parentProvider] },
    );
    expect(parentFailure.result).toMatchObject({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "post-execution",
    });
    expect(parentProviderCalls).toBe(1);
    expect(parentSigner.calls.value).toBe(4);
    expect(JSON.stringify(parentFailure)).not.toContain(SIGNER_SECRET);

    const externalSigner = signerHarness({ state: "failing" });
    let externalFailure: unknown;
    try {
      await createExternalExecutionAudit(
        {
          task: "Already completed external work.",
          policy: {},
          contract: contract(),
          model: { requested: "external-model", observed: null },
          route: {
            providerId: "external",
            capabilityId: "external-model",
            attemptNumber: 1,
          },
          usage: { promptTokens: 2, completionTokens: 1, costUsd: 0.01 },
          outputs: { answer: "completed" },
        },
        externalSigner.signer!,
      );
    } catch (error) {
      externalFailure = error;
    }
    expect(externalFailure).toEqual({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "post-execution",
      message: "Receipt signing failed.",
      terminal: true,
    });
    expect(externalSigner.calls.value).toBe(1);
    expect(JSON.stringify(externalFailure)).not.toContain(SIGNER_SECRET);
  });
});

type PricingShape =
  | "modern"
  | "legacy"
  | "mixed"
  | "conflict"
  | "partial"
  | "free";
type BudgetRelation = "under" | "equal" | "over";

function pricingFor(input: {
  readonly shape: PricingShape;
  readonly inputRateMicros: number;
  readonly outputRateMicros: number;
}): ProviderPricingHint {
  const inputRate = input.inputRateMicros / 1_000_000;
  const outputRate = input.outputRateMicros / 1_000_000;
  switch (input.shape) {
    case "modern":
      return {
        inputPer1kTokens: inputRate,
        outputPer1kTokens: outputRate,
      };
    case "legacy":
      return {
        inputCostPer1M: inputRate * 1_000,
        outputCostPer1M: outputRate * 1_000,
      };
    case "mixed":
      return {
        inputPer1kTokens: inputRate,
        outputCostPer1M: outputRate * 1_000,
      };
    case "conflict":
      return {
        inputPer1kTokens: inputRate,
        outputPer1kTokens: outputRate,
        inputCostPer1M: (inputRate + 1) * 1_000,
        outputCostPer1M: (outputRate + 1) * 1_000,
      };
    case "partial":
      return { inputPer1kTokens: inputRate };
    case "free":
      return { inputPer1kTokens: 0, outputPer1kTokens: 0 };
  }
}

function budgetFor(
  totalCostUsd: number | null,
  relation: BudgetRelation,
): number {
  if (totalCostUsd === null) return 1;
  if (relation === "equal") return totalCostUsd;
  if (relation === "under") {
    return totalCostUsd + Math.max(totalCostUsd, 0.001);
  }
  return totalCostUsd === 0 ? 0 : totalCostUsd / 2;
}

const costCaseArbitrary = fc.record({
  shape: fc.constantFrom<PricingShape>(
    "modern",
    "legacy",
    "mixed",
    "conflict",
    "partial",
    "free",
  ),
  inputRateMicros: fc.integer({ min: 1, max: 250_000 }),
  outputRateMicros: fc.integer({ min: 1, max: 250_000 }),
  inputTokens: fc.integer({ min: 1, max: 20_000 }),
  outputTokens: fc.integer({ min: 1, max: 4_000 }),
  relation: fc.constantFrom<BudgetRelation>("under", "equal", "over"),
  task: fc.string({ minLength: 0, maxLength: 120 }),
});

describe("Phase 60 cross-surface cost integrity", () => {
  it("[PRICE-01..04] generated pricing, token, and budget cases agree across kernel, provider, tracker, plan, policy, and contract", async () => {
    await fc.assert(
      fc.asyncProperty(costCaseArbitrary, async (input) => {
        const pricing = pricingFor(input);
        const kernel = estimateCost({
          pricing,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
        });
        const routeCompatibility = estimateRouteCost({
          capability: capability("direct-cost", pricing),
          estimatedInputTokens: input.inputTokens,
          estimatedOutputTokens: input.outputTokens,
        });
        const tracker = createCostTracker({ pricing });
        tracker.recordIteration({
          promptTokens: input.inputTokens,
          completionTokens: input.outputTokens,
          costUsd: null,
        });
        const provider = createAISdkProvider({
          id: `provider-${input.shape}`,
          model: `provider-${input.shape}:model`,
          pricing,
          generate: () => ({
            rawOutputs: { answer: "ok" },
            normalizedUsage: {
              promptTokens: input.inputTokens,
              completionTokens: input.outputTokens,
              costUsd: null,
            },
          }),
        });
        const providerResult = await provider.execute!({
          task: input.task,
          artifacts: [],
          outputs: ["answer"],
        });

        expect(kernel.version).toBe(COST_ESTIMATOR_VERSION);
        expect(routeCompatibility).toBe(kernel.totalCostUsd);
        expect(tracker.total().costUsd).toBe(kernel.totalCostUsd);
        expect(tracker.latestEstimate()).toEqual(kernel);
        expect(providerResult.normalizedUsage?.costUsd).toBe(
          kernel.totalCostUsd,
        );

        const directBudget = budgetFor(kernel.totalCostUsd, input.relation);
        const directContract = evaluateContractAgainstRoute(
          contract({ budget: { maxCostUsd: directBudget } }),
          {
            capability: capability("direct-contract", pricing),
            estimatedInputTokens: input.inputTokens,
            estimatedOutputTokens: input.outputTokens,
          },
        );
        const directExpected =
          kernel.status === "known" && kernel.totalCostUsd! <= directBudget;
        expect(directContract.ok).toBe(directExpected);

        const routeCapability = capability("route-cost", pricing);
        const catalog = createCapabilityCatalog([
          {
            id: "route-cost",
            kind: "provider-adapter",
            capabilities: [routeCapability],
          },
        ]);
        const baseRoute = routeDeterministically(catalog, {
          task: input.task,
          artifacts: [],
          outputs: { answer: "text" },
        });
        const plannedEstimate = baseRoute.selected!.estimates.costEstimate!;
        expect(plannedEstimate).toEqual(
          estimateCost({
            pricing,
            inputTokens: estimateTokens(input.task),
            outputTokens: CANONICAL_PROJECTED_OUTPUT_TOKENS,
          }),
        );
        const routeBudget = budgetFor(
          plannedEstimate.totalCostUsd,
          input.relation,
        );
        const policyRoute = routeDeterministically(catalog, {
          task: input.task,
          artifacts: [],
          outputs: { answer: "text" },
          policy: { maxCostUsd: routeBudget },
        });
        const contractRoute = routeDeterministically(catalog, {
          task: input.task,
          artifacts: [],
          outputs: { answer: "text" },
          contract: contract({ budget: { maxCostUsd: routeBudget } }),
        });
        const routeExpected =
          plannedEstimate.status === "known" &&
          plannedEstimate.totalCostUsd! <= routeBudget;
        expect(policyRoute.selected !== undefined).toBe(routeExpected);
        expect(contractRoute.selected !== undefined).toBe(routeExpected);
      }),
      { numRuns: 60 },
    );
  });

  it("[PRICE-01, PRICE-02] equivalent modern and legacy units preserve known zero and partial unknown", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          inputRateMicros: fc.integer({ min: 0, max: 250_000 }),
          outputRateMicros: fc.integer({ min: 0, max: 250_000 }),
          inputTokens: fc.integer({ min: 1, max: 20_000 }),
          outputTokens: fc.integer({ min: 1, max: 4_000 }),
        }),
        async (input) => {
          const modern = {
            inputPer1kTokens: input.inputRateMicros / 1_000_000,
            outputPer1kTokens: input.outputRateMicros / 1_000_000,
          };
          const legacy = {
            inputCostPer1M: modern.inputPer1kTokens * 1_000,
            outputCostPer1M: modern.outputPer1kTokens * 1_000,
          };
          const modernEstimate = estimateCost({
            pricing: modern,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
          });
          const legacyEstimate = estimateCost({
            pricing: legacy,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
          });
          expect(legacyEstimate.totalCostUsd).toBeCloseTo(
            modernEstimate.totalCostUsd!,
            12,
          );
        },
      ),
      { numRuns: 40 },
    );

    expect(
      estimateCost({
        pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toMatchObject({ status: "known", totalCostUsd: 0 });
    expect(
      estimateCost({
        pricing: { inputPer1kTokens: 0.001 },
        inputTokens: 1,
        outputTokens: 1,
      }),
    ).toMatchObject({ status: "unknown", totalCostUsd: null });
  });

  it("[PRICE-04] reported usage remains authoritative for provider and tracker consumers", async () => {
    const provider = createAISdkProvider({
      id: "reported-authority",
      model: "reported-authority:model",
      pricing: { inputPer1kTokens: 999, outputPer1kTokens: 999 },
      generate: () => ({
        rawOutputs: { answer: "ok" },
        normalizedUsage: {
          promptTokens: 1_000,
          completionTokens: 500,
          costUsd: 0.25,
        },
      }),
    });
    const response = await provider.execute!({
      task: "reported",
      artifacts: [],
      outputs: ["answer"],
    });
    const tracker = createCostTracker({
      pricing: { inputPer1kTokens: 999, outputPer1kTokens: 999 },
    });
    tracker.recordIteration({
      promptTokens: 1_000,
      completionTokens: 500,
      costUsd: 0.25,
    });

    expect(response.normalizedUsage?.costUsd).toBe(0.25);
    expect(tracker.total().costUsd).toBe(0.25);
  });

  it("[PRICE-03, PRICE-04] agent diagnostics and crew propagation share equality, overage, free, and unknown decisions", async () => {
    const scenarios: readonly {
      readonly name: string;
      readonly pricing: ProviderPricingHint | null;
      readonly relation: BudgetRelation;
      readonly hardBudget: boolean;
    }[] = [
      {
        name: "known-under",
        pricing: { inputPer1kTokens: 0.01, outputPer1kTokens: 0.02 },
        relation: "under",
        hardBudget: true,
      },
      {
        name: "known-equal",
        pricing: { inputPer1kTokens: 0.01, outputPer1kTokens: 0.02 },
        relation: "equal",
        hardBudget: true,
      },
      {
        name: "known-over",
        pricing: { inputPer1kTokens: 0.01, outputPer1kTokens: 0.02 },
        relation: "over",
        hardBudget: true,
      },
      {
        name: "known-free",
        pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
        relation: "equal",
        hardBudget: true,
      },
      {
        name: "unknown-hard",
        pricing: null,
        relation: "under",
        hardBudget: true,
      },
      {
        name: "unknown-unbounded",
        pricing: null,
        relation: "under",
        hardBudget: false,
      },
    ];

    for (const scenario of scenarios) {
      const providerId = `agent-crew-${scenario.name}`;
      const task = `Run ${scenario.name}.`;
      const builtTask = formatToolsForProvider(providerId, []).buildTask([
        { role: "user", content: task },
      ]);
      const estimate = estimateCost({
        ...(scenario.pricing !== null ? { pricing: scenario.pricing } : {}),
        inputTokens: estimateTokens(builtTask),
        outputTokens: CANONICAL_PROJECTED_OUTPUT_TOKENS,
      });
      const maxCostUsd = scenario.hardBudget
        ? budgetFor(estimate.totalCostUsd, scenario.relation)
        : undefined;
      const shouldExecute =
        maxCostUsd === undefined ||
        (estimate.status === "known" && estimate.totalCostUsd! <= maxCostUsd);
      const agentEvents: Array<{
        readonly name: string;
        readonly attributes?: Record<string, unknown>;
      }> = [];
      let agentCalls = 0;
      const agentProvider = createAISdkProvider({
        id: providerId,
        model: `${providerId}:model`,
        ...(scenario.pricing !== null ? { pricing: scenario.pricing } : {}),
        generate: () => {
          agentCalls += 1;
          return {
            rawOutputs: { answer: "done" },
            normalizedUsage: {
              promptTokens: 1,
              completionTokens: 1,
              costUsd: null,
            },
          };
        },
      });
      const agentResult = await runAgent(
        {
          task,
          tools: [],
          ...(maxCostUsd !== undefined
            ? { contract: contract({ budget: { maxCostUsd } }) }
            : {}),
          tracer: {
            kind: "tracer",
            event(name, attributes) {
              agentEvents.push({
                name,
                ...(attributes !== undefined ? { attributes } : {}),
              });
            },
          },
        },
        { providers: [agentProvider] },
      );

      expect(agentCalls, scenario.name).toBe(shouldExecute ? 1 : 0);
      expect(agentResult.kind, scenario.name).toBe(
        shouldExecute ? "success" : "no-contract-match",
      );
      expect(
        agentEvents.find((event) => event.name === "agent.cost.estimate")
          ?.attributes,
        scenario.name,
      ).toMatchObject({
        version: COST_ESTIMATOR_VERSION,
        status: estimate.status,
        inputTokens: estimate.input.tokenCount,
        outputTokens: CANONICAL_PROJECTED_OUTPUT_TOKENS,
        ...(estimate.totalCostUsd !== null
          ? { totalCostUsd: estimate.totalCostUsd }
          : {}),
      });

      let crewCalls = 0;
      const crewProvider = createAISdkProvider({
        id: providerId,
        model: `${providerId}:model`,
        ...(scenario.pricing !== null ? { pricing: scenario.pricing } : {}),
        generate: () => {
          crewCalls += 1;
          return {
            rawOutputs: { answer: "done" },
            normalizedUsage: {
              promptTokens: 1,
              completionTokens: 1,
              costUsd: null,
            },
          };
        },
      });
      const root = defineAgent({
        id: `lead-${scenario.name}`,
        intent: task,
        tools: [],
        summaryReturnSchema: schema(),
      });
      const crewResult = await runAgentCrew(
        {
          root,
          hosts: { childHost: createNoopAgentHost() },
          policy:
            maxCostUsd !== undefined
              ? { budget: { maxCostUsd } }
              : {},
        },
        { providers: [crewProvider] },
      );

      expect(crewCalls, scenario.name).toBe(shouldExecute ? 1 : 0);
      expect(crewResult.result.kind, scenario.name).toBe(
        shouldExecute ? "success" : "no-contract-match",
      );
    }
  });
});
