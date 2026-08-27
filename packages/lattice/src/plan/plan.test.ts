import { describe, expect, it } from "vitest";

import type { ArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { COST_ESTIMATOR_VERSION, estimateCost } from "../routing/cost.js";
import {
  createExecutionPlan,
  withPlanStatus,
  type ContextPackPlan,
  type ContextProjectionPlan,
  type ExecutionStageKind,
  type ProviderPackagingPlan,
  type RouteDecision,
} from "./plan.js";

const artifacts: readonly ArtifactRef[] = [];
const outputs: OutputContractMap = { text: "text" as const };

function selectedRoute(): RouteDecision {
  const costEstimate = estimateCost({
    pricing: { inputPer1kTokens: 0, outputPer1kTokens: 0 },
    inputTokens: 0,
    outputTokens: 0,
  });
  return {
    catalogVersion: "1",
    selected: {
      providerId: "fake",
      modelId: "fake:m",
      score: 1,
      estimates: {
        inputTokens: 0,
        outputTokens: 0,
        costEstimate,
        costUsd: 0,
      },
      contextWindow: 8_192,
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

const context: ContextPackPlan = {
  id: "context:primary",
  tokenBudget: 1_024,
  estimatedTokens: 12,
  included: [],
  summarized: [],
  archived: [],
  omitted: [],
  warnings: [],
};

const contextProjection: ContextProjectionPlan = {
  id: "projection:primary",
  providerId: "fake",
  modelId: "fake:m",
  artifactRefs: [],
  summaryArtifactRefs: [],
  inputHashes: ["sha256:input"],
  omittedArtifactIds: ["artifact:omitted"],
  warnings: ["projection warning"],
};

const providerPackaging: ProviderPackagingPlan = {
  providerId: "fake",
  modelId: "fake:m",
  artifacts: [],
  warnings: [],
};

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

describe("authoritative context evidence", () => {
  it("records projection evidence separately from declared artifacts", () => {
    const plan = createExecutionPlan({
      task: "x",
      artifacts,
      outputs,
      route: selectedRoute(),
      context,
      contextProjection,
      providerPackaging,
    });

    expect(plan.artifactRefs).toEqual([]);
    expect(plan.contextProjection).toBe(contextProjection);
    expect(plan.warnings).toContain("projection warning");
    expect(plan.attempts[0]).toMatchObject({
      context,
      contextProjection,
      providerPackaging,
      inputHashes: ["sha256:input"],
    });
    expect(plan.route.selected?.contextWindow).toBe(8_192);
    expect(plan.route.selected?.estimates.costEstimate).toMatchObject({
      version: COST_ESTIMATOR_VERSION,
      status: "known",
      totalCostUsd: 0,
    });
  });

  it("immutably replaces top-level route context and packaging evidence", () => {
    const plan = createExecutionPlan({
      task: "x",
      artifacts,
      outputs,
      route: selectedRoute(),
      context,
      contextProjection,
      providerPackaging,
    });
    const nextRoute = {
      ...selectedRoute(),
      catalogVersion: "2",
    };
    const nextContext = { ...context, id: "context:fallback" };
    const nextProjection = {
      ...contextProjection,
      id: "projection:fallback",
      inputHashes: ["sha256:fallback"],
    };
    const nextPackaging = {
      ...providerPackaging,
      modelId: "fake:fallback",
    };
    const updated = withPlanStatus(plan, "running", {
      route: nextRoute,
      context: nextContext,
      contextProjection: nextProjection,
      providerPackaging: nextPackaging,
    });

    expect(updated).not.toBe(plan);
    expect(updated.route).toBe(nextRoute);
    expect(updated.context).toBe(nextContext);
    expect(updated.contextProjection).toBe(nextProjection);
    expect(updated.providerPackaging).toBe(nextPackaging);
    expect(plan.contextProjection).toBe(contextProjection);
  });
});
