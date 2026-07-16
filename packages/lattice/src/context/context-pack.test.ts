import { describe, expect, it } from "vitest";

import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import type { ContextPackItemPlan, SelectedRoute } from "../plan/plan.js";
import type { SessionRecord } from "../sessions/session.js";
import { fc } from "../test-support/fast-check.js";
import { buildContextPack } from "./context-pack.js";

describe("buildContextPack", () => {
  it("derives the live budget from the route window and bounded output reserve", () => {
    const route = selectedRoute({
      contextWindow: 2_048,
      inputTokens: 1_500,
      outputTokens: 512,
    });

    expect(
      buildContextPack({ task: "task", artifacts: [], route }).tokenBudget,
    ).toBe(1_536);
    expect(
      buildContextPack({
        task: "task",
        artifacts: [],
        route,
        tokenBudget: 1_000,
      }).tokenBudget,
    ).toBe(1_000);
    expect(
      buildContextPack({
        task: "task",
        artifacts: [],
        route,
        tokenBudget: 20_000,
      }).tokenBudget,
    ).toBe(1_536);
  });

  it("does not subtract the route input estimate from the pack a second time", () => {
    const input = artifact.text("x".repeat(3_000), {
      id: "artifact:fits-route-window",
    });
    const pack = buildContextPack({
      task: "task",
      artifacts: [input],
      route: selectedRoute({
        contextWindow: 2_048,
        inputTokens: 1_500,
        outputTokens: 512,
      }),
    });

    expect(pack.included.map((item) => item.artifactId)).toEqual([
      input.id,
    ]);
    expect(pack.summarized).toEqual([]);
  });

  it("keeps stable declaration order while deduplicating artifact membership", () => {
    const first = artifact.text("a", { id: "artifact:first" });
    const summary = artifact.text("x".repeat(2_000), {
      id: "artifact:summary",
    });
    const omitted = artifact.file("binary", {
      id: "artifact:omitted",
      size: { characters: 1_000 },
    });
    const pack = buildContextPack({
      task: "t",
      artifacts: [first, summary, omitted, first],
      tokenBudget: 300,
    });

    expect(pack.included.map((item) => item.artifactId)).toEqual([
      "artifact:first",
    ]);
    expect(pack.summarized.map((item) => item.artifactId)).toEqual([
      "artifact:summary",
    ]);
    expect(pack.omitted.map((item) => item.artifactId)).toEqual([
      "artifact:omitted",
    ]);
    expect(pack.warnings).toContain(
      "Duplicate artifact artifact:first ignored by context classification.",
    );
  });

  it("selects session summaries before their covered raw turns and names exact new refs", () => {
    const inputA = toArtifactRef(
      artifact.text("a", { id: "artifact:session:a" }),
    );
    const inputB = toArtifactRef(
      artifact.text("b", { id: "artifact:session:b" }),
    );
    const inputC = toArtifactRef(
      artifact.text("c", { id: "artifact:session:c" }),
    );
    const outputD = toArtifactRef(
      artifact.text("d", { id: "artifact:session:d" }),
    );
    const summaryRef = toArtifactRef(
      artifact.text("summary", { id: "artifact:session:summary" }),
    );
    const session = sessionRecord({
      summaries: [
        {
          id: "summary:one",
          artifactRef: summaryRef,
          sourceTurnIds: ["turn:one", "turn:one"],
          trust: "model-summary",
          createdAt: "2026-07-16T00:00:00.000Z",
        },
      ],
      turns: [
        {
          id: "turn:one",
          task: "covered",
          artifactRefs: [inputA, inputB, inputA],
          outputArtifactRefs: [inputB],
          createdAt: "2026-07-16T00:00:00.000Z",
        },
        {
          id: "turn:two",
          task: "selected",
          artifactRefs: [inputB, inputC],
          outputArtifactRefs: [inputC, outputD],
          createdAt: "2026-07-16T00:01:00.000Z",
        },
      ],
    });
    const pack = buildContextPack({
      task: "continue",
      artifacts: [],
      session,
      tokenBudget: 2_000,
    });

    expect(pack.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactId: summaryRef.id,
          trust: "model-summary",
          reason: "Prior session summary covers turns: turn:one.",
        }),
        expect.objectContaining({
          sessionTurnId: "turn:two",
          artifactIds: [inputC.id, outputD.id],
        }),
      ]),
    );
    expect(pack.archived).toContainEqual(
      expect.objectContaining({
        sessionTurnId: "turn:one",
        artifactIds: [inputA.id, inputB.id],
        reason:
          "Prior session turn archived because selected summary summary:one covers it.",
      }),
    );
    expect(
      pack.included.some((item) => item.sessionTurnId === "turn:one"),
    ).toBe(false);
  });

  it("preserves unique, disjoint membership for generated artifact declarations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 0, max: 20 }),
            length: fc.integer({ min: 1, max: 8_000 }),
          }),
          { maxLength: 30 },
        ),
        fc.integer({ min: 0, max: 5_000 }),
        async (entries, tokenBudget) => {
          const artifacts = entries.map(({ id, length }) =>
            artifact.text("x".repeat(length), { id: `artifact:${id}` }),
          );
          const pack = buildContextPack({
            task: "property",
            artifacts,
            tokenBudget,
          });
          const categories = [
            pack.included,
            pack.summarized,
            pack.archived,
            pack.omitted,
          ];
          const ids = categories.flatMap((items) => membershipIds(items));

          expect(new Set(ids).size).toBe(ids.length);
          for (const items of categories) {
            const positions = membershipIds(items).map((id) =>
              artifacts.findIndex((input) => input.id === id),
            );
            expect(positions).toEqual([...positions].sort((a, b) => a - b));
          }
          expect(pack.estimatedTokens).toBeLessThanOrEqual(pack.tokenBudget);
        },
      ),
      { numRuns: 50 },
    );
  });
});

function selectedRoute(input: {
  readonly contextWindow: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}): SelectedRoute {
  return {
    providerId: "provider:test",
    modelId: "model:test",
    score: 0,
    estimates: {
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
    },
    contextWindow: input.contextWindow,
    inputModalities: ["text"],
    outputModalities: ["text"],
    fileTransport: ["inline"],
  };
}

function sessionRecord(
  input: Pick<SessionRecord, "summaries" | "turns">,
): SessionRecord {
  return {
    id: "session:test",
    kind: "session-ref",
    turns: input.turns,
    summaries: input.summaries,
    artifactRefs: [],
    planIds: [],
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:01:00.000Z",
  };
}

function membershipIds(items: readonly ContextPackItemPlan[]): string[] {
  return items.flatMap((item) => [
    ...(item.artifactId !== undefined ? [item.artifactId] : []),
    ...(item.artifactIds ?? []),
    ...(item.sessionTurnId !== undefined
      ? [`session-turn:${item.sessionTurnId}`]
      : []),
  ]);
}
