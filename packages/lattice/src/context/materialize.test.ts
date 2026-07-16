import { describe, expect, it, vi } from "vitest";

import type {
  ArtifactInput,
  ArtifactPrivacy,
  ArtifactRef,
} from "../artifacts/artifact.js";
import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import type { ContextPackItemPlan, SelectedRoute } from "../plan/plan.js";
import { ArtifactLifecycleFailure } from "../runtime/artifact-lifecycle.js";
import type { SessionRecord } from "../sessions/session.js";
import type { ArtifactStore } from "../storage/storage.js";
import { fc } from "../test-support/fast-check.js";
import type { ContextPack, ContextSummarizer } from "./context-pack.js";
import {
  ContextMaterializationFailure,
  materializeContext,
  toContextProjectionPlan,
} from "./materialize.js";

describe("materializeContext", () => {
  it("projects only included concrete artifacts and derives deterministic evidence", async () => {
    const included = artifact.text("INCLUDED_SENTINEL", {
      id: "artifact:included",
    });
    const archived = artifact.text("ARCHIVED_SENTINEL", {
      id: "artifact:archived",
    });
    const omitted = artifact.text("OMITTED_SENTINEL", {
      id: "artifact:omitted",
    });
    const first = await materializeContext({
      contextPack: contextPack({
        id: "context:first",
        included: [artifactItem(included.id)],
        archived: [artifactItem(archived.id)],
        omitted: [artifactItem(omitted.id)],
      }),
      route: selectedRoute(),
      artifacts: [included, archived, omitted],
    });
    const second = await materializeContext({
      contextPack: contextPack({
        id: "context:second",
        included: [artifactItem(included.id)],
        archived: [artifactItem(archived.id)],
        omitted: [artifactItem(omitted.id)],
      }),
      route: selectedRoute(),
      artifacts: [included, archived, omitted],
    });

    expect(first.artifacts.map((input) => input.id)).toEqual([included.id]);
    expect(JSON.stringify(first.artifacts)).not.toContain("ARCHIVED_SENTINEL");
    expect(JSON.stringify(first.artifacts)).not.toContain("OMITTED_SENTINEL");
    expect(first.inputHashes).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(toContextProjectionPlan(first)).toEqual({
      id: first.id,
      providerId: "provider:test",
      modelId: "model:test",
      artifactRefs: first.artifactRefs,
      summaryArtifactRefs: [],
      inputHashes: first.inputHashes,
      omittedArtifactIds: [omitted.id],
      warnings: [],
    });
  });

  it("moves summary candidates to omitted without loading when no summarizer exists", async () => {
    const source = storedRef("artifact:raw-summary");
    const load = vi.fn<ArtifactStore["load"]>();
    const result = await materializeContext({
      contextPack: contextPack({ summarized: [artifactItem(source.id)] }),
      route: selectedRoute(),
      artifacts: [source],
      storage: createStore({ load }),
    });

    expect(load).not.toHaveBeenCalled();
    expect(result.artifacts).toEqual([]);
    expect(result.contextPack.summarized).toEqual([]);
    expect(result.contextPack.omitted).toContainEqual(
      expect.objectContaining({ artifactId: source.id }),
    );
    expect(result.warnings).toContain(
      `Artifact ${source.id} omitted because no context summarizer is configured.`,
    );
  });

  it("passes only selected concrete sources and forces summary privacy, trust, and lineage", async () => {
    const sourceA = artifact.text("RAW_A_SENTINEL", {
      id: "artifact:source:a",
      privacy: "sensitive",
    });
    const sourceB = artifact.text("RAW_B_SENTINEL", {
      id: "artifact:source:b",
      privacy: "restricted",
    });
    const unrelated = artifact.text("UNRELATED_SENTINEL", {
      id: "artifact:unrelated",
    });
    const summarize = vi.fn<ContextSummarizer["summarize"]>(() => [
      artifact.text("normalized summary", {
        id: "artifact:summary",
        privacy: "standard",
        metadata: { trust: "untrusted" },
      }),
    ]);
    const result = await materializeContext({
      contextPack: contextPack({
        summarized: [artifactItem(sourceA.id), artifactItem(sourceB.id)],
        omitted: [artifactItem(unrelated.id)],
      }),
      route: selectedRoute(),
      artifacts: [sourceA, sourceB, unrelated],
      summarizer: { summarize },
    });

    expect(summarize).toHaveBeenCalledOnce();
    expect(summarize.mock.calls[0]?.[0].artifacts.map((input) => input.id)).toEqual([
      sourceA.id,
      sourceB.id,
    ]);
    expect(summarize.mock.calls[0]?.[0].budgetTokens).toBe(128);
    expect(result.artifacts.map((input) => input.id)).toEqual([
      "artifact:summary",
    ]);
    expect(JSON.stringify(result.artifacts)).not.toContain("RAW_A_SENTINEL");
    expect(JSON.stringify(result.artifacts)).not.toContain("RAW_B_SENTINEL");
    expect(JSON.stringify(result.artifacts)).not.toContain("UNRELATED_SENTINEL");
    expect(result.artifacts[0]).toMatchObject({
      source: "generated",
      privacy: "restricted",
      metadata: {
        trust: "model-summary",
        sourceArtifactIds: [sourceA.id, sourceB.id],
      },
      lineage: {
        parents: [toArtifactRef(sourceA), toArtifactRef(sourceB)],
        transform: {
          kind: "generated",
          name: "context-summary",
          metadata: { sourceArtifactIds: [sourceA.id, sourceB.id] },
        },
      },
    });
    expect(result.summaryLifecycleReports).toMatchObject([
      { status: "skipped", reason: "unconfigured", lifecycle: "summary" },
    ]);
    expect(result.contextPack.summarized).toEqual([
      expect.objectContaining({
        artifactId: sourceA.id,
        summaryArtifactIds: ["artifact:summary"],
      }),
      expect.objectContaining({
        artifactId: sourceB.id,
        summaryArtifactIds: ["artifact:summary"],
      }),
    ]);
  });

  it("rehydrates only stored sources selected for summarization", async () => {
    const selected = storedRef("artifact:summary-source:selected");
    const unselected = storedRef("artifact:summary-source:unselected");
    const load = vi.fn<ArtifactStore["load"]>(async (key) =>
      key === selected.storage?.key
        ? { ...selected, value: "selected source" }
        : { ...unselected, value: "UNSELECTED_SOURCE_SENTINEL" },
    );
    const summarize = vi.fn<ContextSummarizer["summarize"]>(({ artifacts }) => {
      expect(artifacts).toEqual([{ ...selected, value: "selected source" }]);
      return [artifact.text("summary", { id: "artifact:summary" })];
    });
    const result = await materializeContext({
      contextPack: contextPack({
        summarized: [artifactItem(selected.id)],
        archived: [artifactItem(unselected.id)],
      }),
      route: selectedRoute(),
      artifacts: [selected, unselected],
      storage: createStore({ load }),
      summarizer: { summarize },
    });

    expect(load).toHaveBeenCalledOnce();
    expect(load).toHaveBeenCalledWith(selected.storage?.key);
    expect(summarize).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.artifacts)).not.toContain(
      "UNSELECTED_SOURCE_SENTINEL",
    );
  });

  it("surfaces the exact store-returned summary ref and fingerprint", async () => {
    const source = artifact.text("source", {
      id: "artifact:source",
      privacy: "restricted",
    });
    const returnedRef: ArtifactRef = {
      id: "artifact:summary:stored",
      kind: "text",
      source: "generated",
      privacy: "restricted",
      fingerprint: { algorithm: "sha256", value: "store-summary-fingerprint" },
      storage: {
        storeId: "store:summary",
        key: "summaries/custom",
        tenantId: "tenant:a",
        retention: "durable",
      },
    };
    const put = vi.fn<ArtifactStore["put"]>(async () => returnedRef);
    const result = await materializeContext({
      contextPack: contextPack({ summarized: [artifactItem(source.id)] }),
      route: selectedRoute(),
      artifacts: [source],
      policy: {
        tenantId: "tenant:a",
        privacy: "restricted",
        retention: "durable",
      },
      storage: createStore({ id: "store:summary", put }),
      summarizer: {
        summarize: () => [
          artifact.text("summary", { id: returnedRef.id }),
        ],
      },
    });

    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[0]).toMatchObject({
      source: "generated",
      privacy: "restricted",
      metadata: { trust: "model-summary" },
      storage: {
        storeId: "store:summary",
        tenantId: "tenant:a",
        retention: "durable",
      },
    });
    expect(result.summaryArtifactRefs[0]).toBe(returnedRef);
    expect(result.artifactRefs[0]).toEqual(returnedRef);
    expect(result.inputHashes).toEqual(["store-summary-fingerprint"]);
    expect(result.summaryLifecycleReports[0]).toMatchObject({ status: "stored" });
  });

  it("policy-skips summary persistence when retention is none", async () => {
    const source = artifact.text("source", { id: "artifact:source" });
    const put = vi.fn<ArtifactStore["put"]>();
    const result = await materializeContext({
      contextPack: contextPack({ summarized: [artifactItem(source.id)] }),
      route: selectedRoute(),
      artifacts: [source],
      policy: { retention: "none" },
      storage: createStore({ put }),
      summarizer: {
        summarize: () => [
          artifact.text("summary", { id: "artifact:summary" }),
        ],
      },
    });

    expect(put).not.toHaveBeenCalled();
    expect(result.summaryLifecycleReports[0]).toMatchObject({
      status: "skipped",
      reason: "policy",
    });
  });

  it("propagates a typed summary lifecycle failure for malformed store refs", async () => {
    const source = artifact.text("source", { id: "artifact:source" });
    const store = createStore({
      put: vi.fn(async (input) => ({
        ...toArtifactRef(input),
        id: "artifact:wrong",
      })),
    });

    await expect(
      materializeContext({
        contextPack: contextPack({ summarized: [artifactItem(source.id)] }),
        route: selectedRoute(),
        artifacts: [source],
        storage: store,
        summarizer: {
          summarize: () => [
            artifact.text("summary", { id: "artifact:summary" }),
          ],
        },
      }),
    ).rejects.toMatchObject({
      name: "ArtifactLifecycleFailure",
      lifecycle: "summary",
      artifactId: "artifact:summary",
    });
  });

  it("retains a raw store cause only on the internal summary lifecycle error", async () => {
    const cause = new Error("SECRET store failure");
    const source = artifact.text("source", { id: "artifact:source" });

    try {
      await materializeContext({
        contextPack: contextPack({ summarized: [artifactItem(source.id)] }),
        route: selectedRoute(),
        artifacts: [source],
        storage: createStore({
          put: vi.fn(async () => {
            throw cause;
          }),
        }),
        summarizer: {
          summarize: () => [
            artifact.text("summary", { id: "artifact:summary" }),
          ],
        },
      });
      throw new Error("Expected summary persistence to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ArtifactLifecycleFailure);
      expect(error).toMatchObject({
        message: "Artifact lifecycle write failed.",
        cause,
      });
      expect((error as Error).message).not.toContain("SECRET");
    }
  });

  it("loads a selected scoped ref by its store key", async () => {
    const ref = storedRef("artifact:stored", {
      tenantId: "tenant:a",
      retention: "durable",
      privacy: "sensitive",
      key: "custom/key",
    });
    const load = vi.fn<ArtifactStore["load"]>(async () => ({
      ...ref,
      value: "loaded value",
    }));
    const result = await materializeContext({
      contextPack: contextPack({ included: [artifactItem(ref.id)] }),
      route: selectedRoute(),
      artifacts: [ref],
      policy: {
        tenantId: "tenant:a",
        retention: "durable",
        privacy: "sensitive",
      },
      storage: createStore({ load }),
    });

    expect(load).toHaveBeenCalledWith("custom/key");
    expect(result.artifacts).toEqual([{ ...ref, value: "loaded value" }]);
    expect(result.artifactRefs).toEqual([ref]);
  });

  it.each([
    {
      name: "store",
      ref: storedRef("artifact:denied", { storeId: "store:other" }),
      policy: {},
    },
    {
      name: "tenant",
      ref: storedRef("artifact:denied"),
      policy: { tenantId: "tenant:a" },
    },
    {
      name: "retention",
      ref: storedRef("artifact:denied"),
      policy: { retention: "durable" as const },
    },
    {
      name: "retention-none",
      ref: storedRef("artifact:denied"),
      policy: { retention: "none" as const },
    },
    {
      name: "privacy",
      ref: storedRef("artifact:denied"),
      policy: { privacy: "restricted" as const },
    },
  ])("denies incompatible $name scope before storage access", async ({ ref, policy }) => {
    const load = vi.fn<ArtifactStore["load"]>();

    await expect(
      materializeContext({
        contextPack: contextPack({ included: [artifactItem(ref.id)] }),
        route: selectedRoute(),
        artifacts: [ref],
        policy,
        storage: createStore({ load }),
      }),
    ).rejects.toMatchObject({
      name: "ContextMaterializationFailure",
      reason: "policy-denied",
      artifactId: ref.id,
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("fails on a missing selected ref by default and atomically rewrites it under omit", async () => {
    const ref = storedRef("artifact:missing");
    const load = vi.fn<ArtifactStore["load"]>(async () => undefined);
    const input = {
      contextPack: contextPack({ included: [artifactItem(ref.id)] }),
      route: selectedRoute(),
      artifacts: [ref],
      storage: createStore({ load }),
    } as const;

    await expect(materializeContext(input)).rejects.toMatchObject({
      name: "ContextMaterializationFailure",
      reason: "missing-reference",
      artifactId: ref.id,
    });

    const omitted = await materializeContext({
      ...input,
      policy: { missingArtifactRef: "omit" },
    });

    expect(omitted.artifacts).toEqual([]);
    expect(omitted.contextPack.included).toEqual([]);
    expect(omitted.contextPack.omitted).toContainEqual(
      expect.objectContaining({ artifactId: ref.id }),
    );
    expect(omitted.omittedArtifactIds).toEqual([ref.id]);
  });

  it("wraps thrown loads safely and permits explicit omission", async () => {
    const ref = storedRef("artifact:fault");
    const cause = new Error("SECRET load endpoint");
    const load = vi.fn<ArtifactStore["load"]>(async () => {
      throw cause;
    });
    const base = {
      contextPack: contextPack({ included: [artifactItem(ref.id)] }),
      route: selectedRoute(),
      artifacts: [ref],
      storage: createStore({ load }),
    } as const;

    await expect(materializeContext(base)).rejects.toMatchObject({
      name: "ContextMaterializationFailure",
      reason: "load-failed",
      message: "Selected artifact reference load failed.",
      cause,
    });
    const omitted = await materializeContext({
      ...base,
      policy: { missingArtifactRef: "omit" },
    });

    expect(omitted.contextPack.included).toEqual([]);
    expect(JSON.stringify(omitted.warnings)).not.toContain("SECRET");
  });

  it("loads only refs named by selected session items and omits tenant metadata from the task artifact", async () => {
    const selected = storedRef("artifact:session:selected", {
      tenantId: "tenant:a",
      retention: "durable",
      privacy: "sensitive",
      key: "selected/key",
    });
    const summary = storedRef("artifact:session:summary", {
      tenantId: "tenant:a",
      retention: "durable",
      privacy: "sensitive",
      key: "summary/key",
    });
    const unselected = storedRef("artifact:session:unselected", {
      tenantId: "tenant:a",
      retention: "durable",
      privacy: "sensitive",
      key: "unselected/key",
    });
    const session = sessionRecord({
      tenantId: "tenant:a",
      privacy: "sensitive",
      retention: "durable",
      artifactRefs: [selected, summary, unselected],
      summaries: [
        {
          id: "summary:one",
          artifactRef: summary,
          sourceTurnIds: ["turn:archived"],
          trust: "model-summary",
          createdAt: "2026-07-16T00:00:00.000Z",
        },
      ],
      turns: [
        sessionTurn("turn:selected", [selected], {
          tenantId: "tenant:a",
          privacy: "sensitive",
          retention: "durable",
        }),
        sessionTurn("turn:archived", [unselected], {
          tenantId: "tenant:a",
          privacy: "sensitive",
          retention: "durable",
        }),
      ],
    });
    const values = new Map([
      [selected.storage?.key, { ...selected, value: "selected value" }],
      [summary.storage?.key, { ...summary, value: "summary value" }],
      [unselected.storage?.key, { ...unselected, value: "UNSELECTED_SENTINEL" }],
    ]);
    const load = vi.fn<ArtifactStore["load"]>(async (key) => values.get(key));
    const result = await materializeContext({
      contextPack: contextPack({
        included: [
          artifactItem(summary.id),
          {
            sessionTurnId: "turn:selected",
            artifactIds: [selected.id],
            reason: "selected",
            estimatedTokens: 10,
            trust: "user",
          },
        ],
        archived: [
          {
            sessionTurnId: "turn:archived",
            artifactIds: [unselected.id],
            reason: "archived",
            estimatedTokens: 10,
            trust: "user",
          },
        ],
      }),
      route: selectedRoute(),
      artifacts: [],
      session,
      policy: {
        tenantId: "tenant:a",
        privacy: "sensitive",
        retention: "durable",
      },
      storage: createStore({ load }),
    });

    expect(load.mock.calls.map(([key]) => key)).toEqual([
      "summary/key",
      "selected/key",
    ]);
    expect(JSON.stringify(result.artifacts)).not.toContain("UNSELECTED_SENTINEL");
    const taskArtifact = result.artifacts.find((input) =>
      input.id.includes("session-turn"),
    );
    expect(taskArtifact?.metadata).toMatchObject({
      trust: "user",
      contextKind: "session-turn",
      sessionId: session.id,
      turnId: "turn:selected",
    });
    expect(taskArtifact?.metadata).not.toHaveProperty("tenantId");
    expect(JSON.stringify(taskArtifact?.metadata)).not.toContain("tenant:a");
  });

  it("rejects a session scope mismatch before artifact-store access", async () => {
    const ref = storedRef("artifact:session");
    const load = vi.fn<ArtifactStore["load"]>();
    const session = sessionRecord({
      turns: [sessionTurn("turn:one", [ref])],
      artifactRefs: [ref],
    });

    await expect(
      materializeContext({
        contextPack: contextPack({
          included: [
            {
              sessionTurnId: "turn:one",
              artifactIds: [ref.id],
              reason: "selected",
              estimatedTokens: 10,
              trust: "user",
            },
          ],
        }),
        route: selectedRoute(),
        artifacts: [],
        session,
        policy: { tenantId: "tenant:a" },
        storage: createStore({ load }),
      }),
    ).rejects.toMatchObject({
      name: "ContextMaterializationFailure",
      reason: "policy-denied",
      sessionId: session.id,
    });
    expect(load).not.toHaveBeenCalled();
  });

  it("rejects conflicting duplicate IDs but stable-deduplicates identical values", async () => {
    const first = artifact.text("first", { id: "artifact:duplicate" });
    const conflicting = artifact.text("second", { id: first.id });
    const pack = contextPack({ included: [artifactItem(first.id)] });

    await expect(
      materializeContext({
        contextPack: pack,
        route: selectedRoute(),
        artifacts: [first, conflicting],
      }),
    ).rejects.toMatchObject({
      name: "ContextMaterializationFailure",
      artifactId: first.id,
    });

    const deduplicated = await materializeContext({
      contextPack: pack,
      route: selectedRoute(),
      artifacts: [first, artifact.text("first", { id: first.id })],
    });
    expect(deduplicated.artifacts).toHaveLength(1);
  });

  it("classifies thrown, empty, and unresolvable summarizer outputs as safe summary failures", async () => {
    const source = artifact.text("source", { id: "artifact:source" });
    const pack = contextPack({ summarized: [artifactItem(source.id)] });
    const cases: readonly ContextSummarizer[] = [
      {
        summarize() {
          throw new Error("SECRET summarizer cause");
        },
      },
      { summarize: () => [] },
      { summarize: () => [storedRef("artifact:unresolvable")] },
    ];

    for (const summarizer of cases) {
      await expect(
        materializeContext({
          contextPack: pack,
          route: selectedRoute(),
          artifacts: [source],
          summarizer,
        }),
      ).rejects.toMatchObject({
        name: "ContextMaterializationFailure",
        reason: "summary-failed",
      });
    }
  });

  it("preserves privacy monotonicity across generated source sets", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom<ArtifactPrivacy>(
            "standard",
            "sensitive",
            "restricted",
          ),
          { minLength: 1, maxLength: 6 },
        ),
        async (privacies) => {
          const sources = privacies.map((privacy, index) =>
            artifact.text(`source-${index}`, {
              id: `artifact:source:${index}`,
              privacy,
            }),
          );
          const result = await materializeContext({
            contextPack: contextPack({
              summarized: sources.map((source) => artifactItem(source.id)),
            }),
            route: selectedRoute(),
            artifacts: sources,
            summarizer: {
              summarize: () => [
                artifact.text("summary", {
                  id: "artifact:summary",
                  privacy: "standard",
                }),
              ],
            },
          });
          const expected = privacies.includes("restricted")
            ? "restricted"
            : privacies.includes("sensitive")
              ? "sensitive"
              : "standard";

          expect(result.artifacts[0]?.privacy).toBe(expected);
          expect(result.artifacts[0]?.lineage?.parents.map((ref) => ref.id)).toEqual(
            sources.map((source) => source.id),
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("keeps projection identity deterministic for generated ordered inputs", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), {
          minLength: 1,
          maxLength: 8,
        }),
        async (values) => {
          const inputs = values.map((value, index) =>
            artifact.text(value, { id: `artifact:${index}` }),
          );
          const included = inputs.map((input) => artifactItem(input.id));
          const first = await materializeContext({
            contextPack: contextPack({ id: "context:one", included }),
            route: selectedRoute(),
            artifacts: inputs,
          });
          const second = await materializeContext({
            contextPack: contextPack({ id: "context:two", included }),
            route: selectedRoute(),
            artifacts: inputs,
          });

          expect(first.id).toBe(second.id);
          expect(first.inputHashes).toEqual(second.inputHashes);
          expect(first.artifacts.map((input) => input.id)).toEqual(
            inputs.map((input) => input.id),
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});

function contextPack(
  overrides: Partial<ContextPack> = {},
): ContextPack {
  return {
    id: "context:test",
    kind: "context-pack",
    tokenBudget: 1_024,
    estimatedTokens: 0,
    included: [],
    summarized: [],
    archived: [],
    omitted: [],
    warnings: [],
    ...overrides,
  };
}

function artifactItem(id: string): ContextPackItemPlan {
  return {
    artifactId: id,
    reason: "test classification",
    estimatedTokens: 64,
    trust: "user",
  };
}

function selectedRoute(): SelectedRoute {
  return {
    providerId: "provider:test",
    modelId: "model:test",
    score: 0,
    estimates: { inputTokens: 64, outputTokens: 64 },
    contextWindow: 4_096,
    inputModalities: ["text"],
    outputModalities: ["text"],
    fileTransport: ["inline"],
  };
}

function storedRef(
  id: string,
  options: {
    readonly storeId?: string;
    readonly key?: string;
    readonly tenantId?: string;
    readonly retention?: "session" | "durable";
    readonly privacy?: ArtifactPrivacy;
  } = {},
): ArtifactInput {
  return {
    id,
    kind: "text",
    source: "inline",
    privacy: options.privacy ?? "standard",
    storage: {
      storeId: options.storeId ?? "store:test",
      key: options.key ?? id,
      ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
      ...(options.retention !== undefined
        ? { retention: options.retention }
        : { retention: "session" }),
    },
  };
}

function createStore(
  options: {
    readonly id?: string;
    readonly put?: ArtifactStore["put"];
    readonly load?: ArtifactStore["load"];
  } = {},
): ArtifactStore {
  return {
    kind: "artifact-store",
    id: options.id ?? "store:test",
    put: options.put ?? (async (input) => toArtifactRef(input)),
    async get() {
      return undefined;
    },
    load: options.load ?? (async () => undefined),
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

function sessionTurn(
  id: string,
  artifactRefs: readonly ArtifactRef[],
  scope: {
    readonly tenantId?: string;
    readonly privacy?: ArtifactPrivacy;
    readonly retention?: "session" | "durable";
  } = {},
): SessionRecord["turns"][number] {
  return {
    id,
    task: `task for ${id}`,
    artifactRefs,
    outputArtifactRefs: [],
    ...scope,
    createdAt: "2026-07-16T00:00:00.000Z",
  };
}

function sessionRecord(
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id: "session:test",
    kind: "session-ref",
    turns: [],
    summaries: [],
    artifactRefs: [],
    planIds: [],
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}
