import { describe, expect, it } from "vitest";

import type { ArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import {
  createExecutionPlan,
  type ExecutionStageKind,
  type RouteDecision,
} from "./plan.js";

const artifacts: readonly ArtifactRef[] = [];
const outputs: OutputContractMap = { text: "text" as const };

function selectedRoute(): RouteDecision {
  return {
    catalogVersion: "1",
    selected: {
      providerId: "fake",
      modelId: "fake:m",
      score: 1,
      estimates: { inputTokens: 0, outputTokens: 0 },
      inputModalities: ["text"],
      outputModalities: ["text"],
      fileTransport: ["base64"],
    },
    candidates: [],
    rejected: [],
    fallbackChain: [],
    noRouteReasons: [],
  };
}

function noRouteDecision(): RouteDecision {
  return {
    catalogVersion: "1",
    candidates: [],
    rejected: [],
    fallbackChain: [],
    noRouteReasons: [{ code: "x", message: "no candidates" }],
  };
}

describe("Phase 8 plan stage kinds", () => {
  it("ExecutionStageKind accepts 'tripwire'", () => {
    const kind: ExecutionStageKind = "tripwire";
    expect(kind).toBe("tripwire");
  });

  it("createDefaultStages emits stage:tripwire between stage:validation and stage:persistence on selected", () => {
    const plan = createExecutionPlan({
      task: "x",
      artifacts,
      outputs,
      route: selectedRoute(),
    });
    const stageIds = plan.stages.map((s) => s.id);
    const validationIdx = stageIds.indexOf("stage:validation");
    const tripwireIdx = stageIds.indexOf("stage:tripwire");
    const persistenceIdx = stageIds.indexOf("stage:persistence");
    expect(validationIdx).toBeGreaterThanOrEqual(0);
    expect(tripwireIdx).toBeGreaterThanOrEqual(0);
    expect(persistenceIdx).toBeGreaterThanOrEqual(0);
    expect(tripwireIdx).toBe(validationIdx + 1);
    expect(persistenceIdx).toBe(tripwireIdx + 1);
  });

  it("stage:tripwire status is 'pending' when route is selected", () => {
    const plan = createExecutionPlan({
      task: "x",
      artifacts,
      outputs,
      route: selectedRoute(),
    });
    const tripwire = plan.stages.find((s) => s.id === "stage:tripwire");
    expect(tripwire?.kind).toBe("tripwire");
    expect(tripwire?.status).toBe("pending");
  });

  it("stage:tripwire status is 'skipped' on no-route", () => {
    const plan = createExecutionPlan({
      task: "x",
      artifacts,
      outputs,
      route: noRouteDecision(),
    });
    const tripwire = plan.stages.find((s) => s.id === "stage:tripwire");
    expect(tripwire?.kind).toBe("tripwire");
    expect(tripwire?.status).toBe("skipped");
  });
});
