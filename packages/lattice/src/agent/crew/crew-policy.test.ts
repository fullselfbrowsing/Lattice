import { describe, expect, it } from "vitest";

import type { AgentSnapshot } from "../host.js";
import type { AgentFailureKind } from "../types.js";

import { validateCrewPolicy, type CrewPolicy } from "./crew-policy.js";

describe("validateCrewPolicy — defaults", () => {
  it("returns frozen defaults when called with no argument", () => {
    const normalized = validateCrewPolicy();
    expect(normalized.maxDepth).toBe(1);
    expect(normalized.maxConcurrentChildren).toBe(1);
    expect(normalized.coordination).toBe("managed");
    expect(Object.isFrozen(normalized)).toBe(true);
    // budget absent — no undefined-valued key emitted.
    expect(Object.keys(normalized)).not.toContain("budget");
  });
});

describe("validateCrewPolicy — maxConcurrentChildren rejection (D-11)", () => {
  it("throws TypeError naming maxConcurrentChildren and the serial-only v1.3 limit", () => {
    expect(() => validateCrewPolicy({ maxConcurrentChildren: 2 })).toThrowError(TypeError);
    try {
      validateCrewPolicy({ maxConcurrentChildren: 2 });
      expect.unreachable("validateCrewPolicy must throw for maxConcurrentChildren > 1");
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      const message = (error as TypeError).message;
      expect(message).toContain("maxConcurrentChildren");
      expect(message).toMatch(/serial/i);
      expect(message).toContain("v1.3");
    }
  });

  it("accepts maxConcurrentChildren: 1 explicitly", () => {
    const normalized = validateCrewPolicy({ maxConcurrentChildren: 1 });
    expect(normalized.maxConcurrentChildren).toBe(1);
  });

  it("rejects non-integer and < 1 structural caps with TypeError naming the field", () => {
    expect(() => validateCrewPolicy({ maxConcurrentChildren: 0 })).toThrowError(
      /maxConcurrentChildren/,
    );
    expect(() => validateCrewPolicy({ maxDepth: 0 })).toThrowError(/maxDepth/);
    expect(() => validateCrewPolicy({ maxDepth: 1.5 })).toThrowError(/maxDepth/);
    expect(() => validateCrewPolicy({ maxTotalIterations: -3 })).toThrowError(
      /maxTotalIterations/,
    );
    expect(() => validateCrewPolicy({ maxIterationsPerAgent: 2.7 })).toThrowError(
      /maxIterationsPerAgent/,
    );
  });
});

describe("validateCrewPolicy — BudgetInvariant verbatim reuse (D-06)", () => {
  it("preserves the budget verbatim, freezes the result, and does not mutate the input", () => {
    const input: CrewPolicy = { budget: { maxCostUsd: 1 }, maxTotalIterations: 20 };
    const inputSnapshot = structuredClone(input);
    const normalized = validateCrewPolicy(input);

    expect(normalized.budget).toEqual({ maxCostUsd: 1 });
    expect(normalized.maxTotalIterations).toBe(20);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.budget)).toBe(true);
    // Input untouched.
    expect(input).toEqual(inputSnapshot);
    expect(Object.isFrozen(input)).toBe(false);
  });
});

describe("validateCrewPolicy — limits + coordination (D-16)", () => {
  it("round-trips a limits record keyed by adapter id and accepts coordination: \"unmanaged\"", () => {
    const normalized = validateCrewPolicy({
      limits: {
        anthropic: { requestsPerMinute: 50, tokensPerMinute: 30_000 },
        openai: { requestsPerMinute: 500 },
      },
      coordination: "unmanaged",
    });
    expect(normalized.limits).toEqual({
      anthropic: { requestsPerMinute: 50, tokensPerMinute: 30_000 },
      openai: { requestsPerMinute: 500 },
    });
    expect(normalized.coordination).toBe("unmanaged");
  });
});

describe("AgentFailureKind — crew-budget-exceeded (D-10)", () => {
  it("accepts \"crew-budget-exceeded\" as an AgentFailureKind value", () => {
    const kind: AgentFailureKind = "crew-budget-exceeded";
    expect(kind).toBe("crew-budget-exceeded");
  });
});

describe("AgentSnapshot — optional ancestry (D-05, Pitfall 8)", () => {
  it("typechecks a v1 snapshot WITHOUT ancestry (backward compat)", () => {
    const v1Snapshot: AgentSnapshot = {
      version: "agent-snapshot/v1",
      iterationIndex: 2,
      conversation: [{ role: "user", content: "hi" }],
      cumulativeUsage: { promptTokens: 1, completionTokens: 1, costUsd: null },
      providerName: "fake",
      capturedAt: "2026-06-10T00:00:00.000Z",
    };
    // A serialized v1 snapshot (no ancestry field) deserializes cleanly.
    const roundTripped = JSON.parse(JSON.stringify(v1Snapshot)) as AgentSnapshot;
    expect(roundTripped.version).toBe("agent-snapshot/v1");
    expect(roundTripped.ancestry).toBeUndefined();
    expect(Object.keys(roundTripped)).not.toContain("ancestry");
  });

  it("round-trips a snapshot WITH ancestry: [\"root\", \"child-a\"]", () => {
    const snapshot: AgentSnapshot = {
      version: "agent-snapshot/v1",
      iterationIndex: 0,
      conversation: [],
      cumulativeUsage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      providerName: "fake",
      capturedAt: "2026-06-10T00:00:00.000Z",
      ancestry: ["root", "child-a"],
    };
    const roundTripped = JSON.parse(JSON.stringify(snapshot)) as AgentSnapshot;
    expect(roundTripped.ancestry).toEqual(["root", "child-a"]);
    // Version literal unchanged — ancestry is additive on v1.
    expect(roundTripped.version).toBe("agent-snapshot/v1");
  });
});
