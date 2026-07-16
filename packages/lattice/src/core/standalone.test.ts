import { describe, expect, it, vi } from "vitest";

import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import { output } from "../outputs/contracts.js";
import type { ModelCapability, ProviderAdapter } from "../providers/provider.js";
import { createCapabilityCatalog, defaultCapabilityForProvider } from "../routing/catalog.js";
import type { SessionRecord } from "../sessions/session.js";
import { createMemoryArtifactStore } from "../storage/memory.js";
import type { ArtifactStore } from "../storage/storage.js";
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
        storage: {
          storeId: "standalone",
          key: "artifact:text:stored",
          retention: "session",
        },
      },
    });
    expect(prepared.artifacts[0]?.inputHash).toEqual(prepared.inputHashes[0]);
    await expect(store.load("artifact:text:stored")).resolves.toMatchObject({
      id: "artifact:text:stored",
      value: "stored case",
    });
  });

  it("keeps available input hashes when custom storage omits fingerprints", async () => {
    const input = artifact.text("hashable case", { id: "artifact:text:hashable" });
    const store: ArtifactStore = {
      kind: "artifact-store",
      id: "custom",
      async put(artifactInput) {
        return {
          ...toArtifactRef(artifactInput),
          storage: { storeId: "custom", key: artifactInput.id },
        };
      },
      async get() {
        return undefined;
      },
      async load() {
        return undefined;
      },
      async has() {
        return false;
      },
      async delete() {
        return false;
      },
      async list() {
        return [];
      },
    };

    const prepared = await prepareCoreRun({
      task: "Prepare",
      artifacts: [input],
      outputs: { answer: "text" as const },
      storage: store,
    });

    expect(prepared.artifacts[0]).toMatchObject({
      stored: true,
      ref: {
        id: "artifact:text:hashable",
        storage: { storeId: "custom", key: "artifact:text:hashable" },
      },
    });
    expect(prepared.artifacts[0]?.inputHash).toEqual(prepared.inputHashes[0]);
    expect(prepared.inputHashes[0]).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("does not write artifacts when retention is none", async () => {
    const put = vi.fn<ArtifactStore["put"]>();
    const store = createStore("custom-skip", put);
    const prepared = await prepareCoreRun({
      task: "Prepare without persistence",
      artifacts: [artifact.text("ephemeral", { id: "artifact:text:ephemeral" })],
      outputs: { answer: "text" as const },
      policy: { retention: "none" },
      storage: store,
    });

    expect(put).not.toHaveBeenCalled();
    expect(prepared.artifacts[0]).toMatchObject({
      stored: false,
      ref: { id: "artifact:text:ephemeral" },
      inputHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(prepared.artifacts[0]?.ref.storage).toBeUndefined();
  });

  it("uses the exact reference returned by custom storage", async () => {
    const returnedRef = {
      id: "artifact:text:authoritative",
      kind: "text" as const,
      source: "inline" as const,
      privacy: "restricted" as const,
      fingerprint: {
        algorithm: "sha256" as const,
        value: "authoritative-store-fingerprint",
      },
      storage: {
        storeId: "custom-authoritative",
        key: "custom/path",
        tenantId: "tenant:a",
        retention: "durable" as const,
      },
    };
    const store = createStore(
      "custom-authoritative",
      vi.fn(async () => returnedRef),
    );
    const prepared = await prepareCoreRun({
      task: "Prepare authoritatively",
      artifacts: [
        artifact.text("persist me", {
          id: returnedRef.id,
          privacy: "restricted",
        }),
      ],
      outputs: { answer: "text" as const },
      policy: { tenantId: "tenant:a", retention: "durable" },
      storage: store,
    });

    expect(prepared.artifacts[0]?.ref).toBe(returnedRef);
    expect(prepared.artifactRefs[0]).toBe(returnedRef);
    expect(prepared.inputHashes).toEqual(["authoritative-store-fingerprint"]);
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

function createStore(id: string, put: ArtifactStore["put"]): ArtifactStore {
  return {
    kind: "artifact-store",
    id,
    put,
    async get() {
      return undefined;
    },
    async load() {
      return undefined;
    },
    async has() {
      return false;
    },
    async delete() {
      return false;
    },
    async list() {
      return [];
    },
  };
}
