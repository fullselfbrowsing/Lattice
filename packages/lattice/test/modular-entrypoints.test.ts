import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import * as agents from "../src/agents.js";
import * as artifacts from "../src/artifacts.js";
import * as audit from "../src/audit.js";
import * as context from "../src/context.js";
import * as core from "../src/core.js";
import * as evals from "../src/eval.js";
import * as providers from "../src/providers.js";
import * as routing from "../src/routing.js";
import * as storage from "../src/storage.js";
import * as tools from "../src/tools.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as {
  readonly exports: Record<string, Record<string, string>>;
  readonly lattice?: {
    readonly modules?: Record<string, {
      readonly compatibility?: string;
      readonly description?: string;
    }>;
  };
};

const REQUIRED_MODULES = [
  "./providers",
  "./audit",
  "./context",
  "./artifacts",
  "./routing",
  "./tools",
  "./storage",
  "./eval",
  "./agents",
  "./core",
] as const;

const COMPATIBILITY_LABELS = [
  "node24-plus",
  "adapter-specific",
] as const;

const EXPECTED_CONTEXT_VALUE_EXPORTS = [
  "buildContextPack",
  "estimateArtifactTokens",
  "estimateTokens",
  "materializeContext",
  "toContextArtifactRefs",
] as const;

const EXPECTED_CORE_VALUE_EXPORTS = [
  "DEFAULT_CATALOG_VERSION",
  "artifact",
  "buildContextPack",
  "contract",
  "createCapabilityCatalog",
  "createMemoryArtifactStore",
  "defaultCapabilityForProvider",
  "defaultPiiDetectors",
  "effectivePer1kPricing",
  "estimateArtifactTokens",
  "estimateRouteCost",
  "estimateTokens",
  "evaluateContractAgainstRoute",
  "evaluateTripwires",
  "inv",
  "isArtifactRef",
  "isTerminal",
  "materializeContext",
  "mergePolicy",
  "modalRank",
  "output",
  "prepareCoreRun",
  "routeDeterministically",
  "toArtifactRef",
  "toContextArtifactRefs",
] as const;

describe("modular package entrypoints", () => {
  it("exposes representative source-level values for every module facade", () => {
    expect(typeof providers.createOpenAICompatibleProvider).toBe("function");
    expect(typeof providers.parseToolUseEnvelope).toBe("function");
    expect(typeof audit.createReceipt).toBe("function");
    expect(typeof audit.issueReceipt).toBe("function");
    expect(typeof audit.preflightReceiptPolicy).toBe("function");
    expect(typeof audit.resolveReceiptPolicy).toBe("function");
    expect(typeof context.buildContextPack).toBe("function");
    expect(typeof context.materializeContext).toBe("function");
    expect(typeof artifacts.artifact.text).toBe("function");
    expect(typeof routing.routeDeterministically).toBe("function");
    expect(typeof routing.estimateCost).toBe("function");
    expect(routing.COST_ESTIMATOR_VERSION).toBe("lattice-cost/v1");
    expect(typeof tools.defineTool).toBe("function");
    expect(typeof tools.mcpResourceArtifact).toBe("function");
    expect(typeof tools.validateToolCallRequests).toBe("function");
    expect(typeof storage.createMemoryArtifactStore).toBe("function");
    expect(typeof evals.evalAgentRun).toBe("function");
    expect(typeof agents.runAgent).toBe("function");
    expect(typeof agents.createCostTracker).toBe("function");
    expect(typeof core.artifact.text).toBe("function");
    expect(typeof core.routeDeterministically).toBe("function");
    expect(typeof core.materializeContext).toBe("function");
  });

  it("reaches Phase 60 additive types through their owning facades", () => {
    type _AuditError = import("../src/audit.js").AuditError;
    type _ReceiptIssuanceMode = import("../src/audit.js").ReceiptIssuanceMode;
    type _CostEstimate = import("../src/routing.js").CostEstimate;
    type _CostTrackerOptions = import("../src/agents.js").CostTrackerOptions;

    void (null as unknown as
      | _AuditError
      | _ReceiptIssuanceMode
      | _CostEstimate
      | _CostTrackerOptions);
    expect(true).toBe(true);
  });

  it("reaches Phase 61 additive agent evidence without exporting runtime internals", () => {
    type AgentFailure = import("../src/agents.js").AgentFailure;
    type AgentSnapshot = import("../src/agents.js").AgentSnapshot;
    type IterationRecord = import("../src/agents.js").IterationRecord;

    const historicalIteration: IterationRecord = {
      index: 0,
      provider: "legacy-provider",
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null,
      durationMs: 0,
      toolCalls: [],
    };
    const historicalSnapshot: AgentSnapshot = {
      version: "agent-snapshot/v1",
      iterationIndex: 0,
      conversation: [],
      cumulativeUsage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      providerName: "legacy-provider",
      capturedAt: "2026-07-17T00:00:00.000Z",
    };
    const recoveryFailure: AgentFailure = {
      kind: "agent-recovery-failed",
      reason: "snapshot-invalid",
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      iterations: [],
    };

    expect(historicalIteration.iterationId).toBeUndefined();
    expect(historicalSnapshot.executionId).toBeUndefined();
    expect(recoveryFailure.kind).toBe("agent-recovery-failed");
    expect("createCrewDispatcher" in agents).toBe(false);
    expect("runAgentInternal" in agents).toBe(false);
  });

  it("keeps context and core value exports exact", () => {
    expect(Object.keys(context).sort()).toEqual([
      ...EXPECTED_CONTEXT_VALUE_EXPORTS,
    ]);
    expect(Object.keys(core).sort()).toEqual([...EXPECTED_CORE_VALUE_EXPORTS]);
    for (const internalName of [
      "ArtifactLifecycleFailure",
      "ContextMaterializationFailure",
      "persistArtifactLifecycle",
      "persistArtifactLifecycleBatch",
      "prepareRouteAttempt",
      "toContextProjectionPlan",
    ]) {
      expect(internalName in context).toBe(false);
      expect(internalName in core).toBe(false);
    }
  });

  it("declares package exports and compatibility metadata for every module", () => {
    for (const modulePath of REQUIRED_MODULES) {
      expect(packageJson.exports[modulePath]).toMatchObject({
        types: `./dist/${modulePath.slice(2)}.d.ts`,
        import: `./dist/${modulePath.slice(2)}.js`,
        default: `./dist/${modulePath.slice(2)}.js`,
      });
      expect(COMPATIBILITY_LABELS).toContain(
        packageJson.lattice?.modules?.[modulePath]?.compatibility,
      );
      expect(packageJson.lattice?.modules?.[modulePath]?.description).toEqual(
        expect.any(String),
      );
    }
  });

  it("keeps provider, audit, tools, and core facades separate from agent APIs", () => {
    expect("runAgent" in providers).toBe(false);
    expect("runAgentCrew" in providers).toBe(false);
    expect("runAgent" in audit).toBe(false);
    expect("runAgentCrew" in audit).toBe(false);
    expect("runAgent" in tools).toBe(false);
    expect("runAgentCrew" in tools).toBe(false);
    expect("runAgent" in core).toBe(false);
    expect("runAgentCrew" in core).toBe(false);

    expect(packageJson.lattice?.modules?.["./providers"]?.compatibility).toBe(
      "adapter-specific",
    );
    expect(packageJson.lattice?.modules?.["./audit"]?.compatibility).toBe(
      "node24-plus",
    );
    expect(packageJson.lattice?.modules?.["./tools"]?.compatibility).toBe(
      "node24-plus",
    );
    expect(packageJson.lattice?.modules?.["./core"]?.compatibility).toBe(
      "node24-plus",
    );
    expect(packageJson.lattice?.modules?.["./agents"]?.compatibility).toBe(
      "node24-plus",
    );
  });
});
