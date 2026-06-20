import { describe, expect, it } from "vitest";

import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { output } from "../outputs/contracts.js";
import type { ModelCapability, ProviderAdapter } from "../providers/provider.js";
import { createCapabilityCatalog, defaultCapabilityForProvider } from "../routing/catalog.js";
import type { SessionRecord } from "../sessions/session.js";
import { createMemoryArtifactStore } from "../storage/memory.js";
import { prepareCoreRun } from "./standalone.js";

describe("prepareCoreRun", () => {
  it("returns advisory routing, context, and plan records without executing a provider", async () => {
    const capability = capabilityFor("advisory", "advisory-model");
    const throwingProvider: ProviderAdapter = {
      id: "advisory",
      kind: "provider-adapter",
      capabilities: [capability],
      async execute() {
        throw new Error("prepareCoreRun must not execute providers");
      },
    };
    const input = artifact.text("support case", { id: "artifact:text:case" });
    const outputs = { answer: "text" } satisfies OutputContractMap;

    const prepared = await prepareCoreRun({
      task: "Summarize",
      artifacts: [input],
      outputs,
      catalog: createCapabilityCatalog([throwingProvider]),
      metadata: { consumer: "external-runtime" },
    });

    expect(prepared.kind).toBe("prepared-core-run");
    expect(prepared.outputNames).toEqual(["answer"]);
    expect(prepared.route.selected).toMatchObject({
      providerId: "advisory",
      modelId: "advisory-model",
    });
    expect(prepared.context.kind).toBe("context-pack");
    expect(prepared.context.included).toHaveLength(1);
    expect(prepared.plan.status).toBe("planned");
    expect(prepared.plan.metadata).toMatchObject({
      consumer: "external-runtime",
      standaloneCore: true,
    });
    expect(prepared.inputHashes).toHaveLength(1);
  });

  it("uses an empty advisory catalog when no catalog is supplied", async () => {
    const input = artifact.text("support case", { id: "artifact:text:case" });

    const prepared = await prepareCoreRun({
      task: "Summarize",
      artifacts: [input],
      outputs: { answer: "text" as const },
    });

    expect(prepared.route.catalogVersion).toBe("standalone-empty");
    expect(prepared.route.selected).toBeUndefined();
    expect(prepared.plan.status).toBe("no-route");
    expect(prepared.warnings).toContain("No provider capabilities are configured.");
  });

  it("persists artifacts through optional standalone storage", async () => {
    const store = createMemoryArtifactStore({ id: "standalone" });
    const input = artifact.text("stored case", { id: "artifact:text:stored" });

    const prepared = await prepareCoreRun({
      task: "Prepare",
      artifacts: [input],
      outputs: { answer: "text" as const },
      storage: store,
      catalog: { version: "test", models: [capabilityFor("advisory", "advisory-model")] },
    });

    expect(prepared.artifacts[0]).toMatchObject({
      stored: true,
      ref: {
        id: "artifact:text:stored",
        storage: { storeId: "standalone", key: "artifact:text:stored" },
      },
    });
    expect(prepared.artifacts[0]?.inputHash).toEqual(prepared.inputHashes[0]);
    await expect(store.load("artifact:text:stored")).resolves.toMatchObject({
      id: "artifact:text:stored",
      value: "stored case",
    });
  });

  it("packs optional session turns in standalone context", async () => {
    const prior = artifact.text("prior case", { id: "artifact:text:prior" });
    const session: SessionRecord = {
      id: "session:standalone",
      kind: "session-ref",
      turns: [
        {
          id: "turn:prior",
          task: "Earlier request",
          artifactRefs: [toArtifactRef(prior)],
          outputArtifactRefs: [],
          createdAt: "2026-06-20T00:00:00.000Z",
        },
      ],
      summaries: [],
      artifactRefs: [toArtifactRef(prior)],
      planIds: [],
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
    };

    const prepared = await prepareCoreRun({
      task: "Continue",
      artifacts: [],
      outputs: { answer: output.citations() },
      session,
      tokenBudget: 2_000,
      catalog: { version: "test", models: [capabilityFor("advisory", "advisory-model")] },
    });

    expect(prepared.context.included).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sessionTurnId: "turn:prior" }),
      ]),
    );
  });
});

function capabilityFor(providerId: string, modelId: string): ModelCapability {
  return {
    ...defaultCapabilityForProvider(providerId),
    modelId,
    outputModalities: ["text", "json"],
    structuredOutput: true,
  };
}
