import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { artifact } from "../src/artifacts/artifact.js";
import { createOpenAICompatibleProvider } from "../src/providers/adapters.js";
import { createFakeProvider } from "../src/providers/fake.js";
import {
  createReplayEnvelope,
  redactReplayEnvelope,
  replayOffline,
} from "../src/replay/replay.js";
import { createAI } from "../src/runtime/create-ai.js";
import {
  createMemorySessionStore,
  type SessionStore,
} from "../src/sessions/session.js";
import { createMemoryArtifactStore } from "../src/storage/memory.js";
import type { ArtifactStore } from "../src/storage/storage.js";
import { defineTool, importMcpTools, runTool } from "../src/tools/tools.js";

describe("context, sessions, provider adapters, replay, and tools", () => {
  it("persists session turns and records context plus provider packaging state", async () => {
    const sessions = createMemorySessionStore();
    const ai = createAI({
      sessions,
      providers: [
        createFakeProvider({
          response: {
            rawOutputs: {
              answer: "ok",
            },
          },
        }),
      ],
    });
    const session = ai.session("case-1");
    const result = await ai.run({
      task: "Resolve case",
      session,
      artifacts: [
        artifact.document("manual.pdf", {
          id: "artifact:document:manual",
          privacy: "sensitive",
        }),
      ],
      outputs: { answer: "text" },
      policy: { privacy: "sensitive", noLogging: true },
    });

    expect(result.ok).toBe(true);
    expect(result.plan.kind).toBe("execution-plan");
    if (result.plan.kind === "execution-plan") {
      expect(result.plan.context?.included[0]).toMatchObject({
        artifactId: "artifact:document:manual",
      });
      expect(result.plan.providerPackaging?.artifacts[0]).toMatchObject({
        artifactId: "artifact:document:manual",
        lineageTransform: "provider-packaging",
      });
    }

    const record = await sessions.load("case-1");
    expect(record?.turns).toHaveLength(1);
    expect(record?.planIds).toEqual([result.plan.id]);
  });

  it("rejects scoped access to legacy session history before artifact or provider work", async () => {
    const baseSessions = createMemorySessionStore({ id: "sessions:legacy-scope" });
    await baseSessions.save({
      id: "session:legacy-unscoped",
      kind: "session-ref",
      turns: [],
      summaries: [],
      artifactRefs: [],
      planIds: [],
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });
    const loadSession = vi.fn<SessionStore["load"]>((id) =>
      baseSessions.load(id));
    const appendTurn = vi.fn<SessionStore["appendTurn"]>((input) =>
      baseSessions.appendTurn(input));
    const sessions: SessionStore = {
      ...baseSessions,
      load: loadSession,
      appendTurn,
    };
    const baseStorage = createMemoryArtifactStore({ id: "store:legacy-scope" });
    const putArtifact = vi.fn<ArtifactStore["put"]>((input) =>
      baseStorage.put(input));
    const loadArtifact = vi.fn<ArtifactStore["load"]>((id) =>
      baseStorage.load(id));
    const storage: ArtifactStore = {
      ...baseStorage,
      put: putArtifact,
      load: loadArtifact,
    };
    let providerCalls = 0;
    const summarize = vi.fn(() => []);
    const result = await createAI({
      sessions,
      storage,
      providers: [
        createFakeProvider({
          response: () => {
            providerCalls += 1;
            return { rawOutputs: { answer: "must not execute" } };
          },
        }),
      ],
    }).run({
      task: "scoped legacy access",
      session: { id: "session:legacy-unscoped", kind: "session-ref" },
      artifacts: [
        artifact.text("MUST_NOT_PERSIST", { id: "artifact:blocked-before-put" }),
      ],
      outputs: { answer: "text" },
      policy: { tenantId: "tenant:scoped" },
      overrides: { summarizer: { summarize } },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected legacy session scope rejection.");
    }
    expect(result.error).toMatchObject({
      kind: "context_materialization",
      reason: "policy-denied",
      sessionId: "session:legacy-unscoped",
      terminal: true,
    });
    expect(loadSession).toHaveBeenCalledOnce();
    expect(putArtifact).not.toHaveBeenCalled();
    expect(loadArtifact).not.toHaveBeenCalled();
    expect(summarize).not.toHaveBeenCalled();
    expect(providerCalls).toBe(0);
    expect(appendTurn).not.toHaveBeenCalled();
  });

  it("wraps OpenAI-compatible HTTP without leaking provider SDK types", async () => {
    const calls: unknown[] = [];
    const provider = createOpenAICompatibleProvider({
      model: "test-model",
      baseUrl: "https://gateway.test/v1",
      apiKey: "secret",
      fetch: async (_url, init) => {
        calls.push(init);
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "hello" } }],
            usage: {
              prompt_tokens: 3,
              completion_tokens: 4,
              total_tokens: 7,
            },
          }),
          { status: 200 },
        );
      },
    });

    const response = await provider.execute?.({
      task: "Say hello",
      artifacts: [
        artifact.url("https://example.test/manual", {
          id: "artifact:url:manual",
        }),
      ],
      outputs: ["answer"],
      contextPack: {
        id: "context-pack:test",
        kind: "context-pack",
        tokenBudget: 128,
        estimatedTokens: 12,
        included: [],
        summarized: [],
        archived: [],
        omitted: [],
        warnings: [],
      },
      plan: {
        id: "plan:test",
        kind: "execution-plan",
        version: 1,
        createdAt: new Date().toISOString(),
        status: "planned",
        task: "Say hello",
        outputNames: ["answer"],
        artifactRefs: [],
        route: {
          catalogVersion: "test",
          selected: {
            providerId: "openai-compatible",
            modelId: "test-model",
            score: 0,
            estimates: { inputTokens: 1, outputTokens: 1 },
            inputModalities: ["text"],
            outputModalities: ["text"],
            fileTransport: ["url"],
          },
          candidates: [],
          rejected: [],
          fallbackChain: [],
          noRouteReasons: [],
        },
        stages: [],
        providerPackaging: {
          providerId: "openai-compatible",
          modelId: "test-model",
          artifacts: [
            {
              artifactId: "artifact:url:manual",
              transport: "url",
              lineageTransform: "provider-packaging",
              warnings: [],
            },
          ],
          warnings: [],
        },
        attempts: [],
        warnings: [],
      },
    });

    expect(response?.rawOutputs.answer).toBe("hello");
    expect(response?.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
    });
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls[0])).toContain("artifact:url:manual");
    expect(JSON.stringify(calls[0])).toContain("context-pack:test");
  });

  it("validates local and MCP-like tools and returns artifact-backed results", async () => {
    const schema = z.object({ caseId: z.string() });
    const tool = defineTool({
      name: "lookupCase",
      inputSchema: schema,
      execute: (input) => ({ caseId: input.caseId, approved: true }),
    });

    const result = await runTool(tool, { caseId: "case-1" });
    expect(result.artifact).toMatchObject({
      kind: "tool-result",
      source: "tool",
      metadata: {
        toolName: "lookupCase",
      },
    });

    const imported = await importMcpTools({
      listTools: () => [
        {
          name: "mcpLookup",
          inputSchema: schema,
        },
      ],
      callTool: ({ arguments: args }) => args,
    });

    expect(imported[0]?.name).toBe("mcpLookup");
  });

  it("runs declared tools inside ai.run and records tool events/artifacts", async () => {
    const schema = z.object({ caseId: z.string() });
    const tool = defineTool({
      name: "lookupCase",
      inputSchema: schema,
      execute: (input) => ({ caseId: input.caseId, approved: true }),
    });
    const ai = createAI({
      providers: [
        {
          id: "fixture",
          kind: "provider-adapter",
          execute: async (request) => {
            expect(request.artifacts.some((item) => item.kind === "tool-result")).toBe(true);
            return {
              rawOutputs: { answer: "ok" },
            };
          },
        },
      ],
    });

    const result = await ai.run({
      task: "Resolve case",
      tools: [tool],
      toolInputs: { lookupCase: { caseId: "case-1" } },
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    expect(result.events?.map((event) => event.kind)).toEqual(
      expect.arrayContaining(["tool.call", "artifact.created"]),
    );
    expect(result.plan.kind).toBe("execution-plan");
    if (result.plan.kind === "execution-plan") {
      expect(result.plan.stages.find((stage) => stage.kind === "tool-execution")?.status).toBe(
        "completed",
      );
    }
  });

  it("applies artifact transforms and custom summarizers through runtime overrides", async () => {
    let summarized = false;
    const ai = createAI({
      providers: [
        createFakeProvider({
          response: {
            rawOutputs: { answer: "ok" },
          },
        }),
      ],
    });

    const plan = await ai.plan({
      task: "Resolve case",
      artifacts: [artifact.text("x".repeat(10_000), { id: "artifact:text:long" })],
      outputs: { answer: "text" },
      overrides: {
        tokenBudget: 512,
        transforms: [
          {
            name: "add-note",
            transform: () => artifact.text("derived note", { id: "artifact:text:derived" }),
          },
        ],
        summarizer: {
          summarize: (input) => {
            summarized = true;
            return [
              artifact.text(`summary for ${input.artifacts.length}`, {
                id: "artifact:text:summary",
              }),
            ];
          },
        },
      },
    });

    expect(summarized).toBe(true);
    expect(plan.artifactRefs.map((ref) => ref.id)).toContain("artifact:text:derived");
    expect(plan.metadata?.summaryArtifactIds).toEqual(["artifact:text:summary"]);
  });

  it("creates redacted replay envelopes and replays successful runs offline", async () => {
    const ai = createAI({
      providers: [
        createFakeProvider({
          response: {
            rawOutputs: {
              answer: "ok",
            },
          },
        }),
      ],
    });
    const result = await ai.run({
      task: "Resolve case with Bearer secret-token",
      artifacts: [
        artifact.url("https://signed.example.test/file?token=abc", {
          id: "artifact:url:signed",
          metadata: {
            signedUrl: "https://signed.example.test/file?token=abc",
            transcript: "private call",
          },
        }),
      ],
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const envelope = createReplayEnvelope(result);
    const redacted = redactReplayEnvelope(envelope);
    const offline = await replayOffline(envelope);

    expect(offline.ok).toBe(true);
    expect(JSON.stringify(redacted)).not.toContain("secret-token");
    expect(JSON.stringify(redacted)).not.toContain("signed.example.test/file");
    expect(JSON.stringify(redacted)).not.toContain("private call");
  });
});
