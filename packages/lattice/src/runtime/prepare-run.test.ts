import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import { createFakeProvider } from "../providers/fake.js";
import { defaultCapabilityForProvider } from "../routing/catalog.js";
import type {
  AppendSessionTurnInput,
  CreateSessionOptions,
  SessionRecord,
  SessionStore,
} from "../sessions/session.js";
import type { ArtifactStore } from "../storage/storage.js";
import { defineTool } from "../tools/tools.js";
import type { RunEvent } from "../tracing/tracing.js";
import { normalizeConfig } from "./config.js";
import { prepareRun } from "./prepare-run.js";

describe("prepareRun", () => {
  it("runs transforms and tools once in order and reports unconfigured persistence", async () => {
    const order: string[] = [];
    const transform = vi.fn(() => {
      order.push("transform");
      return artifact.text("derived", { id: "artifact:derived" });
    });
    const executeTool = vi.fn(() => {
      order.push("tool");
      return { ok: true };
    });
    const tool = defineTool({
      name: "lookup",
      inputSchema: z.object({ id: z.string() }),
      execute: executeTool,
    });
    const result = await prepareRun(
      normalizeConfig({ providers: [createFakeProvider()] }),
      {
        task: "prepare",
        artifacts: [artifact.text("input", { id: "artifact:input" })],
        outputs: { answer: "text" },
        overrides: { transforms: [{ name: "derive", transform }] },
        tools: [tool],
        toolInputs: { lookup: { id: "case-1" } },
      },
    );

    expect(result.ok).toBe(true);
    expect(order).toEqual(["transform", "tool"]);
    expect(transform).toHaveBeenCalledOnce();
    expect(executeTool).toHaveBeenCalledOnce();
    expect(result.lifecycleReports.map((report) => [
      report.lifecycle,
      report.status,
      report.status === "skipped" ? report.reason : undefined,
    ])).toEqual([
      ["input", "skipped", "unconfigured"],
      ["derived", "skipped", "unconfigured"],
      ["tool", "skipped", "unconfigured"],
    ]);
    expect(result.plan.stages.find((stage) => stage.kind === "persistence")).toMatchObject({
      status: "skipped",
    });
    if (result.ok) {
      expect(result.materialized?.artifacts.map((input) => input.id)).toEqual([
        "artifact:input",
        "artifact:derived",
        expect.stringMatching(/^artifact:tool-result:lookup:/u),
      ]);
    }
  });

  it("persists input, derived, and tool artifacts once in stable order and keeps exact refs", async () => {
    const returnedRefs: ArtifactRef[] = [];
    const put = vi.fn<ArtifactStore["put"]>(async (input) => {
      const ref: ArtifactRef = {
        ...toArtifactRef(input),
        fingerprint: {
          algorithm: "sha256",
          value: `store-fingerprint:${input.id}`,
        },
        storage: {
          storeId: "store:ordered",
          key: `stored/${input.id}`,
          retention: "session",
        },
      };
      returnedRefs.push(ref);
      return ref;
    });
    const tool = defineTool({
      name: "lookup",
      inputSchema: z.object({}),
      execute: () => ({ ok: true }),
    });
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        storage: createStore({ id: "store:ordered", put }),
      }),
      {
        task: "persist",
        artifacts: [artifact.text("input", { id: "artifact:input" })],
        outputs: { answer: "text" },
        overrides: {
          transforms: [
            {
              name: "derive",
              transform: () =>
                artifact.text("derived", { id: "artifact:derived" }),
            },
          ],
        },
        tools: [tool],
        toolInputs: { lookup: {} },
      },
    );

    expect(result.ok).toBe(true);
    expect(put).toHaveBeenCalledTimes(3);
    expect(result.lifecycleReports.map((report) => report.lifecycle)).toEqual([
      "input",
      "derived",
      "tool",
    ]);
    expect(result.lifecycleReports.every((report) => report.status === "stored")).toBe(true);
    expect(result.preparedArtifactRefs).toEqual(returnedRefs);
    for (const [index, ref] of returnedRefs.entries()) {
      expect(result.preparedArtifactRefs[index]).toBe(ref);
    }
    if (result.ok) {
      expect(result.materialized?.artifactRefs).toEqual(returnedRefs);
      expect(result.materialized?.inputHashes).toEqual(
        returnedRefs.map((ref) => ref.fingerprint?.value),
      );
    }
  });

  it("reports retention-none persistence as a distinct policy skip", async () => {
    const put = vi.fn<ArtifactStore["put"]>();
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        storage: createStore({ put }),
      }),
      {
        task: "ephemeral",
        artifacts: [artifact.text("input", { id: "artifact:input" })],
        outputs: { answer: "text" },
        policy: { retention: "none" },
      },
    );

    expect(result.ok).toBe(true);
    expect(put).not.toHaveBeenCalled();
    expect(result.lifecycleReports).toMatchObject([
      { lifecycle: "input", status: "skipped", reason: "policy" },
    ]);
  });

  it("rejects session scope after one session load and before all other effects", async () => {
    const session = sessionRecord();
    const loadSession = vi.fn(async () => session);
    const createSession = vi.fn<SessionStore["create"]>();
    const appendTurn = vi.fn<SessionStore["appendTurn"]>();
    const artifactPut = vi.fn<ArtifactStore["put"]>();
    const artifactLoad = vi.fn<ArtifactStore["load"]>();
    const transform = vi.fn(() => artifact.text("derived"));
    const summarize = vi.fn(() => [artifact.text("summary")]);
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        sessions: createSessionStore({
          load: loadSession,
          create: createSession,
          appendTurn,
        }),
        storage: createStore({ put: artifactPut, load: artifactLoad }),
      }),
      {
        task: "scoped",
        artifacts: [artifact.text("input", { id: "artifact:input" })],
        outputs: { answer: "text" },
        session: { id: session.id, kind: "session-ref" },
        policy: { tenantId: "tenant:a" },
        overrides: {
          transforms: [{ name: "derive", transform }],
          summarizer: { summarize },
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: {
        kind: "context_materialization",
        reason: "policy-denied",
        sessionId: session.id,
        terminal: true,
      },
    });
    expect(loadSession).toHaveBeenCalledOnce();
    expect(createSession).not.toHaveBeenCalled();
    expect(transform).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
    expect(artifactPut).not.toHaveBeenCalled();
    expect(artifactLoad).not.toHaveBeenCalled();
    expect(appendTurn).not.toHaveBeenCalled();
    expect(result.plan.contextProjection).toBeUndefined();
  });

  it("creates a missing session with effective scope before persistence", async () => {
    const load = vi.fn(async () => undefined);
    const create = vi.fn(async (options: CreateSessionOptions = {}) =>
      sessionRecord({
        id: options.id ?? "session:generated",
        ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
        ...(options.privacy !== undefined ? { privacy: options.privacy } : {}),
        ...(options.retention !== undefined ? { retention: options.retention } : {}),
      }),
    );
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        sessions: createSessionStore({ load, create }),
      }),
      {
        task: "create session",
        outputs: { answer: "text" },
        session: { id: "session:new", kind: "session-ref" },
        policy: {
          tenantId: "tenant:a",
          privacy: "sensitive",
          retention: "durable",
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({
      id: "session:new",
      tenantId: "tenant:a",
      privacy: "sensitive",
      retention: "durable",
    });
    expect(result.sessionRecord).toMatchObject({
      tenantId: "tenant:a",
      privacy: "sensitive",
      retention: "durable",
    });
  });

  it("maps a configured write fault to a bounded terminal persistence result", async () => {
    const cause = new Error("SECRET write endpoint");
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        storage: createStore({
          put: vi.fn(async () => {
            throw cause;
          }),
        }),
      }),
      {
        task: "write",
        artifacts: [artifact.text("input", { id: "artifact:input" })],
        outputs: { answer: "text" },
      },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: {
        kind: "persistence",
        operation: "write",
        lifecycle: "input",
        artifactId: "artifact:input",
        postProvider: false,
        terminal: true,
      },
    });
    if (result.ok) {
      throw new Error("Expected input persistence to fail.");
    }
    expect(result.error.message).not.toContain("SECRET");
    expect(JSON.stringify(result.plan)).not.toContain("SECRET");
    expect(result.plan.stages.find((stage) => stage.kind === "persistence")?.status).toBe(
      "failed",
    );
  });

  it("maps a selected-reference load fault to a bounded terminal context result", async () => {
    const ref = storedRef("artifact:stored");
    const cause = new Error("SECRET load endpoint");
    const load = vi.fn<ArtifactStore["load"]>(async () => {
      throw cause;
    });
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        storage: createStore({ load }),
      }),
      {
        task: "load",
        artifacts: [ref],
        outputs: { answer: "text" },
      },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: {
        kind: "context_materialization",
        reason: "load-failed",
        artifactId: ref.id,
        terminal: true,
      },
    });
    expect(load).toHaveBeenCalledOnce();
    if (result.ok) {
      throw new Error("Expected context materialization to fail.");
    }
    expect(result.error.message).not.toContain("SECRET");
    expect(JSON.stringify(result.plan)).not.toContain("SECRET");
    expect(result.plan.contextProjection).toBeUndefined();
  });

  it("maps a summary write fault to the summary persistence lifecycle", async () => {
    const cause = new Error("SECRET summary store");
    const put = vi.fn<ArtifactStore["put"]>(async (input) => {
      if (input.id === "artifact:summary") {
        throw cause;
      }
      return {
        ...toArtifactRef(input),
        storage: {
          storeId: "store:test",
          key: input.id,
          retention: "session",
        },
      };
    });
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        storage: createStore({ put }),
      }),
      {
        task: "summarize",
        artifacts: [
          artifact.text("x".repeat(8_000), { id: "artifact:source" }),
        ],
        outputs: { answer: "text" },
        overrides: {
          tokenBudget: 300,
          summarizer: {
            summarize: () => [
              artifact.text("summary", { id: "artifact:summary" }),
            ],
          },
        },
      },
    );

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      error: {
        kind: "persistence",
        lifecycle: "summary",
        artifactId: "artifact:summary",
        terminal: true,
      },
    });
    if (result.ok) {
      throw new Error("Expected summary persistence to fail.");
    }
    expect(result.error.message).not.toContain("SECRET");
  });

  it("keeps no-route plans free of fabricated provider-visible projection evidence", async () => {
    const provider = createFakeProvider({
      capabilities: [
        {
          ...defaultCapabilityForProvider("restricted-out"),
          providerId: "restricted-out",
          modelId: "restricted-out:model",
          dataPolicy: {
            privacy: ["standard"],
            uploadRetention: "none",
            supportsNoLogging: true,
            supportsNoTraining: true,
          },
        },
      ],
    });
    const result = await prepareRun(normalizeConfig({ providers: [provider] }), {
      task: "no route",
      artifacts: [artifact.text("input", { id: "artifact:input" })],
      outputs: { answer: "text" },
      policy: { privacy: "restricted" },
    });

    expect(result.ok).toBe(true);
    expect(result.plan.status).toBe("no-route");
    expect(result.plan.contextProjection).toBeUndefined();
    expect(result.plan.providerPackaging?.artifacts).toEqual([]);
    if (result.ok) {
      expect(result.materialized).toBeUndefined();
      expect(result.packaging.packagedArtifacts).toEqual([]);
    }
  });

  it("emits only bounded preparation evidence", async () => {
    const events: RunEvent[] = [];
    const put = vi.fn<ArtifactStore["put"]>(async (input) => ({
      ...toArtifactRef(input),
      storage: {
        storeId: "store:event",
        key: "SECRET_STORAGE_KEY",
        tenantId: "SECRET_TENANT",
        retention: "durable",
      },
    }));
    const result = await prepareRun(
      normalizeConfig({
        providers: [createFakeProvider()],
        storage: createStore({ id: "store:event", put }),
      }),
      {
        task: "events",
        artifacts: [
          artifact.text("SECRET_ARTIFACT_VALUE", { id: "artifact:event" }),
        ],
        outputs: { answer: "text" },
        policy: { tenantId: "SECRET_TENANT", retention: "durable" },
      },
      {
        runId: "run:event",
        emit: (event) => {
          events.push(event);
        },
      },
    );

    expect(result.ok).toBe(true);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("SECRET_ARTIFACT_VALUE");
    expect(serialized).not.toContain("SECRET_STORAGE_KEY");
    expect(serialized).not.toContain("SECRET_TENANT");
    expect(events.find((event) => event.kind === "context.packed")?.metadata).toMatchObject({
      status: "completed",
      projectionId: expect.stringMatching(/^context-projection:/u),
      artifactCount: 1,
      inputHashes: expect.any(Array),
    });
  });
});

function storedRef(id: string): ArtifactInput {
  return {
    id,
    kind: "text",
    source: "inline",
    privacy: "standard",
    storage: {
      storeId: "store:test",
      key: id,
      retention: "session",
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

function createSessionStore(
  options: {
    readonly load?: SessionStore["load"];
    readonly create?: SessionStore["create"];
    readonly appendTurn?: SessionStore["appendTurn"];
  } = {},
): SessionStore {
  return {
    kind: "session-store",
    id: "sessions:test",
    create:
      options.create ??
      (async (createOptions = {}) =>
        sessionRecord({ id: createOptions.id ?? "session:created" })),
    load: options.load ?? (async () => undefined),
    async save(session) {
      return session;
    },
    async branch(_parentId, branchOptions = {}) {
      return sessionRecord({ id: branchOptions.id ?? "session:branch" });
    },
    appendTurn:
      options.appendTurn ??
      (async (_input: AppendSessionTurnInput) => sessionRecord()),
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
