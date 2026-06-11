import { describe, expect, it } from "vitest";

import type { StandardSchemaV1 } from "@standard-schema/spec";

import {
  createAI,
  createFakeProvider,
  createNoopAgentHost,
  defineAgent,
  evalAgentRun,
  type AgentRunSnapshot,
  type ProviderRunResponse,
  type Usage,
} from "../../index.js";

function makeSchema(): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "crew-eval",
      validate: (value: unknown) => ({ value: value as never }),
    } as never,
  } as StandardSchemaV1;
}

function makeProvider(answers: readonly string[], usage: Usage) {
  const queue = [...answers];
  return createFakeProvider({
    id: "crew-eval-fake",
    response: (): ProviderRunResponse => ({
      rawOutputs: { answer: queue.shift() ?? "" },
      normalizedUsage: { ...usage },
    }),
  });
}

async function runScriptedCrew() {
  const children = [1, 2, 3].map((n) =>
    defineAgent({
      id: `researcher-${n}`,
      intent: `Research topic ${n}.`,
      tools: [],
      summaryReturnSchema: makeSchema(),
    }),
  );
  const root = defineAgent({
    id: "summarizer",
    intent: "Dispatch all three researchers serially, then synthesize.",
    tools: [],
    childAgents: children,
    summaryReturnSchema: makeSchema(),
  });
  const provider = makeProvider(
    [
      '{"tool_calls":[{"id":"r1","name":"researcher-1","args":{"task":"one"}}]}',
      "summary one",
      '{"tool_calls":[{"id":"r2","name":"researcher-2","args":{"task":"two"}}]}',
      "summary two",
      '{"tool_calls":[{"id":"r3","name":"researcher-3","args":{"task":"three"}}]}',
      "summary three",
      "final synthesis",
    ],
    { promptTokens: 12, completionTokens: 4, costUsd: 0.0003 },
  );

  return createAI({ providers: [provider] }).runAgentCrew({
    root,
    hosts: { childHost: createNoopAgentHost() },
    policy: {
      budget: { maxIterations: 10, maxCostUsd: 0.05 },
      maxTotalIterations: 10,
      maxIterationsPerAgent: 5,
    },
  });
}

function snapshotFromCrew(result: Awaited<ReturnType<typeof runScriptedCrew>>): AgentRunSnapshot {
  return {
    iterationsToGoal: result.totalIterations,
    usage: result.usage,
  };
}

// Phase 39 DELEG-07 regression budget for the deterministic parent + 3
// researchers fake-provider crew. Update intentionally with review when
// the crew protocol changes; never casually.
const CREW_BASELINE: AgentRunSnapshot = {
  iterationsToGoal: 7,
  usage: { promptTokens: 84, completionTokens: 28, costUsd: 0.0021 },
};

describe("evalAgentRun crew regression gate", () => {
  it("passes the scripted crew against the committed baseline", async () => {
    const result = await runScriptedCrew();
    expect(result.result.kind).toBe("success");

    const report = evalAgentRun(CREW_BASELINE, snapshotFromCrew(result));

    expect(report.ok).toBe(true);
    expect(report.regressions).toEqual([]);
  });

  it("fails when iterations exceed the committed budget", () => {
    const current: AgentRunSnapshot = {
      ...CREW_BASELINE,
      iterationsToGoal: CREW_BASELINE.iterationsToGoal + 2,
    };

    const report = evalAgentRun(CREW_BASELINE, current);

    expect(report.ok).toBe(false);
    expect(report.regressions).toEqual([
      expect.objectContaining({
        kind: "iterations-to-goal",
        baseline: CREW_BASELINE.iterationsToGoal,
        current: CREW_BASELINE.iterationsToGoal + 2,
      }),
    ]);
  });

  it("derives snapshots directly from CrewResult totalIterations and usage", async () => {
    const result = await runScriptedCrew();
    const snapshot = snapshotFromCrew(result);

    expect(snapshot.iterationsToGoal).toBe(result.totalIterations);
    expect(snapshot.usage).toEqual(result.usage);
    expect(snapshot).toEqual(CREW_BASELINE);
  });
});
