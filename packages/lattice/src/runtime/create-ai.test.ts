import { describe, expect, it } from "vitest";

import { contract } from "../contract/contract.js";
import { inv } from "../contract/invariants.js";
import { createFakeProvider } from "../providers/fake.js";
import type { ModelCapability } from "../providers/provider.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import { createAI } from "./create-ai.js";

function pricedFakeProvider(): ReturnType<typeof createFakeProvider> {
  return createFakeProvider({
    capabilities: [
      {
        ...defaultCapabilityForProvider("fake"),
        modelId: "fake:deterministic",
        pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.001 },
      },
    ],
  });
}

describe("Phase 7 contract + cost integration", () => {
  it("Test 1: RunIntent literal with contract field compiles and routes", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const intent = {
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0.5 } }),
    };
    const plan = await ai.plan(intent);
    expect(plan.kind).toBe("execution-plan");
  });

  it("Test 2: v1.0 backward compatibility — no contract field", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const plan = await ai.plan({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(plan.kind).toBe("execution-plan");
    expect(plan.route.selected).toBeDefined();
  });

  it("Test 3: contract flows to router — preflight reject reasons appear in plan", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const plan = await ai.plan({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    const allReasons = plan.route.candidates.flatMap((c) => c.reasons);
    expect(allReasons.some((r) => r.code === "contract-budget-exceeded")).toBe(true);
  });

  it("Test 4: no-contract-match classification — returns RunFailure with kind no-contract-match", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-budget-exceeded"),
        ).toBe(true);
      }
    }
  });

  it("Test 5: no-route remains no-route without contract", async () => {
    const restrictedCapability: ModelCapability = {
      ...defaultCapabilityForProvider("fake"),
      modelId: "fake:text-only",
      inputModalities: ["text"],
      outputModalities: ["text"],
      structuredOutput: false,
    };
    const provider = createFakeProvider({ capabilities: [restrictedCapability] });
    const ai = createAI({ providers: [provider] });
    // Trigger a no-route by requiring an output modality unsupported (json structured).
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        action: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (_v: unknown) => ({ value: _v }),
          },
        } as never,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no_route");
    }
  });

  it("Test 6: usage 0/0/0 on no-contract-match per CONTEXT.md", async () => {
    const ai = createAI({ providers: [pricedFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });
});

describe("Phase 7 end-to-end integration", () => {
  it("E1: modality reject — contract requiredModalities:[video] on text-only fake yields no-contract-match with contract-modality-missing", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:text-only",
          inputModalities: ["text"],
          outputModalities: ["text"],
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ requiredModalities: ["video"] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-modality-missing"),
        ).toBe(true);
      }
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });

  it("E2: privacy reject — contract requiredPrivacy:restricted on standard-only fake yields no-contract-match with contract-privacy-mismatch", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:standard-only",
          dataPolicy: { privacy: ["standard"] },
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ requiredPrivacy: "restricted" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
      if (result.error.kind === "no-contract-match") {
        expect(
          result.error.noRouteReasons.some((r) => r.code === "contract-privacy-mismatch"),
        ).toBe(true);
      }
    }
  });

  it("E3: budget reject — contract budget=0 on priced fake yields no-contract-match (integration-level safety net)", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:priced",
          pricing: { inputPer1kTokens: 0.001, outputPer1kTokens: 0.001 },
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ budget: { maxCostUsd: 0 } }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no-contract-match");
    }
  });

  it("E4: success populates usage from normalizedUsage", async () => {
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "hello" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, costUsd: 0.0001 });
    }
  });

  it("E5: v1.0 backward compatibility — no contract field, default fake yields RunSuccess with present usage (costUsd null)", async () => {
    const ai = createAI({ providers: [createFakeProvider()] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usage).toBeDefined();
      expect(result.usage.costUsd).toBeNull();
      expect(typeof result.usage.promptTokens).toBe("number");
      expect(typeof result.usage.completionTokens).toBe("number");
    }
  });

  it("E6: no-route still works without contract — fake with no structured output and structured-output request returns no_route (not no-contract-match)", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("fake"),
          modelId: "fake:text-only-unstructured",
          inputModalities: ["text"],
          outputModalities: ["text"],
          structuredOutput: false,
        },
      ],
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: {
        text: "text" as const,
        action: {
          "~standard": {
            version: 1,
            vendor: "test",
            validate: (_v: unknown) => ({ value: _v }),
          },
        } as never,
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("no_route");
      // Sanity: still carries usage even on the no-route branch (zero, per design)
      expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0, costUsd: 0 });
    }
  });
});

describe("Phase 8 tripwire integration", () => {
  it("T1: tripwire violation produces typed failure with terminal flag, invariantId, and evidence", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "ok" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        invariants: [inv.fieldFromTable("text", ["create", "delete"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("tripwire-violated");
      if (result.error.kind === "tripwire-violated") {
        expect(result.error.terminal).toBe(true);
        expect(typeof result.error.invariantId).toBe("string");
        expect(result.error.invariantId.length).toBeGreaterThan(0);
        expect(result.error.evidence.kind).toBe("field-from-table");
        expect(result.error.evidence.path).toBe("text");
      }
    }
  });

  it("T2: no retry on tripwire violation — second provider in fallback chain is not attempted", async () => {
    inv.__resetCounterForTests();
    // Provider A: violates the invariant.
    const providerA = createFakeProvider({
      id: "fake",
      modelId: "fake:a",
      response: {
        rawOutputs: { text: "violator" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    // Provider B: would pass but should NEVER be reached.
    const providerB = createFakeProvider({
      id: "fake-b",
      modelId: "fake-b:passing",
      response: {
        rawOutputs: { text: "create" },
        normalizedUsage: { promptTokens: 999, completionTokens: 999, costUsd: 9.99 },
      },
    });
    const ai = createAI({ providers: [providerA, providerB] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        invariants: [inv.fieldFromTable("text", ["create"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("tripwire-violated");
      // Plan should record exactly one attempt — provider B never reached.
      expect(result.plan.attempts).toHaveLength(1);
      // No fallback.activated event emitted.
      const fallbackEvents = (result.events ?? []).filter(
        (event) => event.kind === "fallback.activated",
      );
      expect(fallbackEvents).toHaveLength(0);
    }
  });

  it("T3: usage populated on tripwire violation from normalizedUsage (cost-so-far)", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "ok" },
        normalizedUsage: { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        invariants: [inv.fieldFromTable("text", ["create"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, costUsd: 0.0001 });
    }
  });

  it("T4: no contract field — success and stage:tripwire status is 'skipped'", async () => {
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "hello" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      expect(tripwire?.status).toBe("skipped");
    }
  });

  it("T5: empty invariants array — stage:tripwire skipped, success returned", async () => {
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "hello" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [] }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      expect(tripwire?.status).toBe("skipped");
    }
  });

  it("T6: must-cite happy path — citations array satisfies invariant, stage:tripwire completed", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "ok", citations: ["artifact-1"] },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [inv.mustCite("artifact-1")] }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      expect(tripwire?.status).toBe("completed");
    }
  });

  it("T7: no-PII violation — evidence carries redacted detector + substring (not full input)", async () => {
    inv.__resetCounterForTests();
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: "Contact alice@example.com please" },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({ invariants: [inv.noPII("text")] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.kind === "tripwire-violated") {
      expect(result.error.evidence.kind).toBe("no-pii");
      const observed = result.error.evidence.observed as {
        detector: string;
        substring: string;
      };
      expect(observed.detector).toBe("email");
      expect(observed.substring).toBe("alice@example.com");
      // Critical: full input string must NOT appear inside the evidence.
      expect(JSON.stringify(result.error.evidence)).not.toContain("Contact ");
      expect(JSON.stringify(result.error.evidence)).not.toContain("please");
    }
  });

  it("T8: validation failure precedes tripwire — error.kind is 'validation', stage:tripwire never runs", async () => {
    inv.__resetCounterForTests();
    // Provider returns a non-string for `text` so output schema validation
    // rejects it BEFORE tripwires evaluate.
    const provider = createFakeProvider({
      response: {
        rawOutputs: { text: 42 as unknown as string },
        normalizedUsage: { promptTokens: 1, completionTokens: 1, costUsd: 0.0 },
      },
    });
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "x",
      outputs: { text: "text" as const },
      contract: contract({
        // This invariant would ALSO fail if reached; assert it never runs.
        invariants: [inv.fieldFromTable("text", ["create"])],
      }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      const tripwire = result.plan.stages.find((s) => s.id === "stage:tripwire");
      // Tripwire stage never advanced — stays at its initial 'pending'/'skipped'
      // status. It must NOT be 'completed' or 'failed'.
      expect(["pending", "skipped"]).toContain(tripwire?.status);
    }
  });
});
