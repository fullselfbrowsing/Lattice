import { describe, expect, it, vi } from "vitest";

import { artifact } from "../src/artifacts/artifact.js";
import type { ArtifactRef } from "../src/artifacts/artifact.js";
import type { ContextSummarizer } from "../src/context/context-pack.js";
import type { ProviderAdapter, ProviderRunRequest } from "../src/providers/provider.js";
import {
  createReplayEnvelope,
  redactReplayEnvelope,
} from "../src/replay/replay.js";
import { defaultCapabilityForProvider } from "../src/routing/catalog.js";
import { createAI } from "../src/runtime/create-ai.js";
import type { SessionRecord, SessionStore } from "../src/sessions/session.js";
import { createMemorySessionStore } from "../src/sessions/session.js";
import { createMemoryArtifactStore } from "../src/storage/memory.js";
import type { ArtifactStore } from "../src/storage/storage.js";
import { base64Decode } from "../src/receipts/envelope.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../src/receipts/sign.js";
import type { CapabilityReceiptBody } from "../src/receipts/types.js";

describe("authoritative runtime state", () => {
  it("makes ai.plan and sync ai.run share one provider-visible projection", async () => {
    const storage = createMemoryArtifactStore({ id: "store:authority" });
    const sessions = createMemorySessionStore();
    const selectedSession = await storage.put(
      artifact.text("SELECTED_SESSION_VALUE", {
        id: "artifact:session:selected",
      }),
    );
    const unselectedSession = await storage.put(
      artifact.text("UNSELECTED_SESSION_SENTINEL", {
        id: "artifact:session:unselected",
      }),
    );
    const session = sessionRecord({
      turns: [
        {
          id: "turn:selected",
          task: "SELECTED_SESSION_TASK",
          artifactRefs: [selectedSession],
          outputArtifactRefs: [],
          createdAt: "2026-07-16T00:00:00.000Z",
        },
        {
          id: "turn:archived",
          task: `ARCHIVED_SESSION_SENTINEL_${"x".repeat(2_000)}`,
          artifactRefs: [unselectedSession],
          outputArtifactRefs: [],
          createdAt: "2026-07-16T00:01:00.000Z",
        },
      ],
      artifactRefs: [selectedSession, unselectedSession],
    });
    await sessions.save(session);

    const requests: ProviderRunRequest[] = [];
    const provider: ProviderAdapter = {
      id: "authority-sync",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("authority-sync"),
          modelId: "authority-sync:model",
          contextWindow: 4_096,
        },
      ],
      async execute(request) {
        requests.push(request);
        return { rawOutputs: { answer: "ok" } };
      },
    };
    const summarize = vi.fn<ContextSummarizer["summarize"]>(({ artifacts: sources }) => {
      expect(sources.map((input) => input.id)).toEqual([
        "artifact:raw-summary",
      ]);
      expect(sources[0]?.value).toContain("RAW_SUMMARY_SENTINEL");
      return [
        artifact.text("MATERIALIZED_SUMMARY_VALUE", {
          id: "artifact:materialized-summary",
        }),
      ];
    });
    const ai = createAI({ providers: [provider], storage, sessions });
    const intent = {
      task: "authoritative sync",
      artifacts: [
        artifact.text("INCLUDED_VALUE", { id: "artifact:included" }),
        artifact.text(`RAW_SUMMARY_SENTINEL_${"x".repeat(8_000)}`, {
          id: "artifact:raw-summary",
        }),
        artifact.file("OMITTED_VALUE", {
          id: "artifact:omitted",
          size: { characters: 4_000 },
        }),
      ],
      outputs: { answer: "text" as const },
      session: { id: session.id, kind: "session-ref" as const },
      overrides: {
        tokenBudget: 500,
        summarizer: { summarize },
      },
    };

    const planned = await ai.plan(intent);
    const result = await ai.run(intent);

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    expect(summarize).toHaveBeenCalledTimes(2);
    const request = requests[0];
    if (request === undefined || !result.ok || result.plan.kind !== "execution-plan") {
      throw new Error("Expected one successful authoritative request.");
    }

    const expectedIds = [
      "artifact:included",
      `artifact:session-turn:${encodeURIComponent(session.id)}:${encodeURIComponent("turn:selected")}`,
      "artifact:session:selected",
      "artifact:materialized-summary",
    ];
    const excludedIds = [
      "artifact:raw-summary",
      "artifact:omitted",
      "artifact:session:unselected",
    ];

    expect(request.artifacts.map((input) => input.id)).toEqual(expectedIds);
    expect(request.providerPackaging?.artifacts.map((item) => item.artifactId)).toEqual(
      expectedIds,
    );
    expect(request.plan?.contextProjection?.artifactRefs.map((ref) => ref.id)).toEqual(
      expectedIds,
    );
    expect(request.plan?.contextProjection?.inputHashes).toHaveLength(
      expectedIds.length,
    );
    for (const excludedId of excludedIds) {
      expect(request.artifacts.map((input) => input.id)).not.toContain(excludedId);
      expect(request.providerPackaging?.artifacts.map((item) => item.artifactId)).not.toContain(
        excludedId,
      );
      expect(request.plan?.contextProjection?.artifactRefs.map((ref) => ref.id)).not.toContain(
        excludedId,
      );
    }

    expect(result.plan.contextProjection?.artifactRefs.map((ref) => ref.id)).toEqual(
      expectedIds,
    );
    expect(result.plan.providerPackaging?.artifacts.map((item) => item.artifactId)).toEqual(
      expectedIds,
    );
    expect(planned.contextProjection?.artifactRefs.map((ref) => ref.id)).toEqual(
      expectedIds,
    );
    expect(planned.contextProjection?.inputHashes).toEqual(
      result.plan.contextProjection?.inputHashes,
    );
    expect(planned.contextProjection?.id).toBe(result.plan.contextProjection?.id);

    const requestValues = JSON.stringify(request.artifacts);
    expect(requestValues).not.toContain("RAW_SUMMARY_SENTINEL");
    expect(requestValues).not.toContain("OMITTED_VALUE");
    expect(requestValues).not.toContain("UNSELECTED_SESSION_SENTINEL");
    expect(requestValues).not.toContain("ARCHIVED_SESSION_SENTINEL");
    expect(requestValues).toContain("MATERIALIZED_SUMMARY_VALUE");
    expect(JSON.stringify(result.events)).not.toContain("RAW_SUMMARY_SENTINEL");
    expect(JSON.stringify(result.events)).not.toContain("OMITTED_VALUE");
    expect(JSON.stringify(result.events)).not.toContain("UNSELECTED_SESSION_SENTINEL");
  });

  it("uses the same projection for streaming request artifacts and plan evidence", async () => {
    const requests: ProviderRunRequest[] = [];
    const provider: ProviderAdapter = {
      id: "authority-stream",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("authority-stream"),
          modelId: "authority-stream:model",
          contextWindow: 4_096,
          streaming: true,
        },
      ],
      async *executeStream(request) {
        requests.push(request);
        yield { kind: "text-delta", output: "answer", text: "streamed" };
      },
    };
    const ai = createAI({ providers: [provider] });
    const result = await ai.run({
      task: "authoritative stream",
      artifacts: [
        artifact.text("STREAM_INCLUDED", { id: "artifact:stream:included" }),
        artifact.text(`STREAM_RAW_SUMMARY_${"x".repeat(8_000)}`, {
          id: "artifact:stream:raw-summary",
        }),
        artifact.file("STREAM_OMITTED", {
          id: "artifact:stream:omitted",
          size: { characters: 4_000 },
        }),
      ],
      outputs: { answer: "text" },
      policy: { stream: true },
      overrides: {
        tokenBudget: 300,
        summarizer: {
          summarize: ({ artifacts: sources }) => {
            expect(sources.map((input) => input.id)).toEqual([
              "artifact:stream:raw-summary",
            ]);
            return [
              artifact.text("STREAM_SUMMARY", {
                id: "artifact:stream:summary",
              }),
            ];
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(1);
    if (!result.ok || result.plan.kind !== "execution-plan" || requests[0] === undefined) {
      throw new Error("Expected one successful streaming request.");
    }

    const expectedIds = [
      "artifact:stream:included",
      "artifact:stream:summary",
    ];
    const request = requests[0];
    expect(request.artifacts.map((input) => input.id)).toEqual(expectedIds);
    expect(request.plan?.contextProjection?.artifactRefs.map((ref) => ref.id)).toEqual(
      expectedIds,
    );
    expect(request.providerPackaging?.artifacts.map((item) => item.artifactId)).toEqual(
      expectedIds,
    );
    expect(result.plan.contextProjection?.artifactRefs.map((ref) => ref.id)).toEqual(
      expectedIds,
    );
    expect(result.plan.providerPackaging?.artifacts.map((item) => item.artifactId)).toEqual(
      expectedIds,
    );
    expect(request.plan?.contextProjection?.id).toBe(result.plan.contextProjection?.id);
    expect(JSON.stringify(request.artifacts)).not.toContain("STREAM_RAW_SUMMARY");
    expect(JSON.stringify(request.artifacts)).not.toContain("STREAM_OMITTED");
  });

  it("rematerializes streaming fallback context before opening the next stream", async () => {
    const primaryRequests: ProviderRunRequest[] = [];
    const fallbackRequests: ProviderRunRequest[] = [];
    async function* failedStream() {
      throw new Error("primary stream unavailable");
    }
    async function* successfulStream() {
      yield { kind: "text-delta" as const, output: "answer", text: "fallback stream" };
    }
    const primary: ProviderAdapter = {
      id: "authority-stream-primary",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("authority-stream-primary"),
          modelId: "authority-stream-primary:model",
          contextWindow: 4_096,
          fileTransport: ["inline", "base64"],
          streaming: true,
        },
      ],
      executeStream(request) {
        primaryRequests.push(request);
        return failedStream();
      },
    };
    const fallback: ProviderAdapter = {
      id: "authority-stream-fallback",
      kind: "provider-adapter",
      capabilities: [
        {
          ...defaultCapabilityForProvider("authority-stream-fallback"),
          modelId: "authority-stream-fallback:model",
          contextWindow: 1_300,
          fileTransport: ["inline", "url"],
          streaming: true,
        },
      ],
      executeStream(request) {
        fallbackRequests.push(request);
        return successfulStream();
      },
    };
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "authority-fallback-key",
      publicKeyJwk,
    });
    const result = await createAI({
      providers: [primary, fallback],
      signer,
    }).run({
      task: "authoritative stream fallback",
      artifacts: [
        artifact.text("STREAM_SHARED", {
          id: "artifact:stream:shared",
          size: { characters: 2_000 },
        }),
        artifact.text("STREAM_FALLBACK_RAW_SENTINEL", {
          id: "artifact:stream:fallback-raw",
          size: { characters: 1_600 },
        }),
        artifact.image("https://example.test/stream.png", {
          id: "artifact:stream:image",
          size: { characters: 4 },
        }),
      ],
      outputs: { answer: "text" },
      policy: { stream: true },
      overrides: {
        summarizer: {
          summarize: ({ artifacts: sources }) => {
            expect(sources.map((input) => input.id)).toEqual([
              "artifact:stream:fallback-raw",
            ]);
            return [
              artifact.text("STREAM_FALLBACK_SUMMARY", {
                id: "artifact:stream:fallback-summary",
              }),
            ];
          },
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(primaryRequests).toHaveLength(1);
    expect(fallbackRequests).toHaveLength(1);
    expect(fallbackRequests[0]?.artifacts.map((input) => input.id)).toEqual([
      "artifact:stream:shared",
      "artifact:stream:image",
      "artifact:stream:fallback-summary",
    ]);
    expect(JSON.stringify(fallbackRequests[0])).not.toContain(
      "STREAM_FALLBACK_RAW_SENTINEL",
    );
    if (!result.ok || result.plan.kind !== "execution-plan") {
      throw new Error("Expected a successful streaming fallback.");
    }
    expect(result.plan.attempts.map((attempt) => attempt.providerId)).toEqual([
      "authority-stream-primary",
      "authority-stream-fallback",
    ]);
    expect(result.plan.attempts[0]?.contextProjection?.artifactRefs.map((ref) => ref.id))
      .toEqual(primaryRequests[0]?.artifacts.map((input) => input.id));
    expect(result.plan.attempts[1]?.contextProjection?.artifactRefs.map((ref) => ref.id))
      .toEqual(fallbackRequests[0]?.artifacts.map((input) => input.id));
    expect(result.plan.contextProjection).toEqual(
      result.plan.attempts[1]?.contextProjection,
    );
    expect(result.receipt).toBeDefined();
    if (result.receipt === undefined) {
      throw new Error("Expected a fallback receipt.");
    }
    const receiptBody = JSON.parse(
      new TextDecoder().decode(base64Decode(result.receipt.payload)),
    ) as CapabilityReceiptBody;
    expect(receiptBody.inputHashes).toEqual(result.plan.attempts[1]?.inputHashes);
    expect(receiptBody.inputHashes).not.toEqual(result.plan.attempts[0]?.inputHashes);
    expect(receiptBody.route).toMatchObject({
      providerId: "authority-stream-fallback",
      capabilityId: "authority-stream-fallback:model",
      attemptNumber: 2,
    });
    expect(JSON.stringify(result.events)).not.toContain(
      "STREAM_FALLBACK_RAW_SENTINEL",
    );
  });
});

describe("provider output lifecycle", () => {
  for (const failureIndex of [0, 1]) {
    it(`returns partial evidence without fallback when output write ${failureIndex + 1} fails`, async () => {
      const base = createMemoryArtifactStore({ id: `store:failure:${failureIndex}` });
      let outputWriteIndex = 0;
      const storage = overridePut(base, async (input) => {
        if (input.lineage?.transform.kind === "model-output") {
          if (outputWriteIndex === failureIndex) {
            throw new Error("SECRET_OUTPUT_STORE_CAUSE");
          }
          outputWriteIndex += 1;
        }
        return base.put(input);
      });
      let primaryCalls = 0;
      let fallbackCalls = 0;
      const result = await createAI({
        storage,
        providers: [
          outputProvider("output-primary", async () => {
            primaryCalls += 1;
            return {
              rawOutputs: { answer: "validated output" },
              artifactRefs: [
                artifact.text("OUTPUT_ONE", { id: "artifact:output:one" }),
                artifact.text("OUTPUT_TWO", { id: "artifact:output:two" }),
                artifact.text("OUTPUT_THREE", { id: "artifact:output:three" }),
              ],
              normalizedUsage: {
                promptTokens: 7,
                completionTokens: 3,
                costUsd: 0.01,
              },
            };
          }),
          outputProvider("output-fallback", async () => {
            fallbackCalls += 1;
            return { rawOutputs: { answer: "must not retry" } };
          }),
        ],
      }).run({
        task: "persist provider outputs",
        outputs: { answer: "text" },
      });

      expect(result.ok).toBe(false);
      expect(primaryCalls).toBe(1);
      expect(fallbackCalls).toBe(0);
      if (result.ok || result.plan.kind !== "execution-plan") {
        throw new Error("Expected a post-provider persistence failure.");
      }
      expect(result.error).toMatchObject({
        kind: "persistence",
        lifecycle: "provider-output",
        artifactId: `artifact:output:${failureIndex === 0 ? "one" : "two"}`,
        postProvider: true,
        terminal: true,
      });
      expect(result.partialOutputs).toEqual({ answer: "validated output" });
      expect(result.artifacts?.map((ref) => ref.id)).toEqual(
        failureIndex === 0 ? [] : ["artifact:output:one"],
      );
      expect(result.usage).toEqual({
        promptTokens: 7,
        completionTokens: 3,
        costUsd: 0.01,
      });
      expect(result.plan.attempts).toHaveLength(1);
      expect(result.plan.attempts[0]?.status).toBe("succeeded");
      expect(result.plan.stages.find((stage) => stage.kind === "persistence"))
        .toMatchObject({ status: "failed" });
      expect(JSON.stringify(result)).not.toContain("SECRET_OUTPUT_STORE_CAUSE");
    });
  }

  it("redacts real fallback and post-provider persistence evidence recursively", async () => {
    const base = createMemoryArtifactStore({ id: "store:replay-redaction" });
    const storage = overridePut(base, async (input) => {
      if (input.lineage?.transform.kind === "model-output") {
        throw new Error("SECRET_OUTPUT_STORE_CAUSE");
      }

      const stored = await base.put(input);
      return {
        ...stored,
        metadata: {
          ...stored.metadata,
          harmlessLooking: "SECRET_ARTIFACT_METADATA",
          signedUrl: "https://secret.example.test/artifact?sig=SECRET_SIGNATURE",
        },
        storage: {
          ...requiredStorage(stored),
          key: "SECRET_STORAGE_KEY",
        },
      };
    });
    const result = await createAI({
      storage,
      providers: [
        outputProvider("replay-primary", async () => {
          throw new Error("SECRET_PRIMARY_PROVIDER_CAUSE");
        }),
        outputProvider("replay-fallback", async () => ({
          rawOutputs: { answer: "validated fallback output" },
          artifactRefs: [
            artifact.text("SECRET_OUTPUT_VALUE", {
              id: "artifact:replay-output",
            }),
          ],
        })),
      ],
    }).run({
      task: "SECRET_TASK_VALUE",
      artifacts: [
        artifact.text("SECRET_INPUT_VALUE", {
          id: "artifact:replay-input",
        }),
      ],
      outputs: { answer: "text" },
      policy: {
        tenantId: "SECRET_TENANT_ID",
        retention: "durable",
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok || result.plan.kind !== "execution-plan") {
      throw new Error("Expected a fallback output persistence failure.");
    }
    expect(result.plan.attempts).toHaveLength(2);
    const redacted = redactReplayEnvelope(createReplayEnvelope(result));
    const serialized = JSON.stringify(redacted);

    for (const sentinel of [
      "SECRET_OUTPUT_STORE_CAUSE",
      "SECRET_PRIMARY_PROVIDER_CAUSE",
      "SECRET_ARTIFACT_METADATA",
      "SECRET_SIGNATURE",
      "SECRET_STORAGE_KEY",
      "SECRET_TENANT_ID",
      "SECRET_TASK_VALUE",
      "SECRET_INPUT_VALUE",
      "SECRET_OUTPUT_VALUE",
      "secret.example.test",
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
    expect(redacted.plan.attempts.map((attempt) => attempt.status)).toEqual([
      "failed",
      "succeeded",
    ]);
    expect(
      redacted.plan.attempts.map((attempt) => attempt.contextProjection?.id),
    ).toEqual([
      expect.stringMatching(/^context-projection:/u),
      expect.stringMatching(/^context-projection:/u),
    ]);
    expect(redacted.plan.attempts[1]?.inputHashes).toEqual(
      redacted.plan.contextProjection?.inputHashes,
    );
  });

  it("rejects malformed store-returned output refs before ordinary success", async () => {
    const mutations: Array<{
      readonly name: string;
      readonly mutate: (ref: ArtifactRef) => ArtifactRef;
    }> = [
      {
        name: "store",
        mutate: (ref) => ({
          ...ref,
          storage: { ...requiredStorage(ref), storeId: "store:wrong" },
        }),
      },
      {
        name: "tenant",
        mutate: (ref) => ({
          ...ref,
          storage: { ...requiredStorage(ref), tenantId: "tenant:wrong" },
        }),
      },
      {
        name: "retention",
        mutate: (ref) => ({
          ...ref,
          storage: { ...requiredStorage(ref), retention: "session" },
        }),
      },
      {
        name: "privacy",
        mutate: (ref) => ({ ...ref, privacy: "standard" }),
      },
      {
        name: "payload",
        mutate: (ref) => ({ ...ref, value: "INVALID_REF_PAYLOAD" }) as ArtifactRef,
      },
    ];

    for (const mutation of mutations) {
      const base = createMemoryArtifactStore({ id: `store:malformed:${mutation.name}` });
      const storage = overridePut(base, async (input) =>
        mutation.mutate(await base.put(input)));
      let providerCalls = 0;
      const result = await createAI({
        storage,
        providers: [
          outputProvider(`malformed-${mutation.name}`, async () => {
            providerCalls += 1;
            return {
              rawOutputs: { answer: "validated" },
              artifactRefs: [
                artifact.text("MALFORMED_OUTPUT", {
                  id: `artifact:malformed:${mutation.name}`,
                }),
              ],
            };
          }),
        ],
      }).run({
        task: "reject malformed output ref",
        outputs: { answer: "text" },
        policy: {
          tenantId: "tenant:expected",
          privacy: "sensitive",
          retention: "durable",
        },
      });

      expect(providerCalls, mutation.name).toBe(1);
      expect(result.ok, mutation.name).toBe(false);
      if (result.ok) {
        throw new Error(`Expected ${mutation.name} output ref rejection.`);
      }
      expect(result.error).toMatchObject({
        kind: "persistence",
        lifecycle: "provider-output",
        postProvider: true,
        terminal: true,
      });
      expect(JSON.stringify(result)).not.toContain("INVALID_REF_PAYLOAD");
    }
  });

  it("surfaces the exact custom output ref and fingerprint returned by storage", async () => {
    const base = createMemoryArtifactStore({ id: "store:custom-output" });
    const customFingerprint = { algorithm: "sha256" as const, value: "ab".repeat(32) };
    let exactRef: ArtifactRef | undefined;
    const storage = overridePut(base, async (input) => {
      const stored = await base.put({ ...input, fingerprint: customFingerprint });
      exactRef = {
        ...stored,
        fingerprint: customFingerprint,
        storage: {
          ...requiredStorage(stored),
          key: "custom/provider/output/key",
        },
      };
      return exactRef;
    });
    const result = await createAI({
      storage,
      providers: [
        outputProvider("custom-output", async () => ({
          rawOutputs: { answer: "ok" },
          artifactRefs: [
            artifact.text("CUSTOM_OUTPUT", { id: "artifact:custom-output" }),
          ],
        })),
      ],
    }).run({
      task: "preserve store authority",
      outputs: { answer: "text" },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected custom output persistence success.");
    }
    expect(result.artifacts).toEqual([exactRef]);
    expect(result.artifacts[0]?.storage?.key).toBe("custom/provider/output/key");
    expect(result.artifacts[0]?.fingerprint).toEqual(customFingerprint);
  });

  for (const mode of ["unconfigured", "policy"] as const) {
    it(`reports ${mode} output persistence as a truthful skip`, async () => {
      const base = createMemoryArtifactStore({ id: `store:skip:${mode}` });
      const put = vi.fn<ArtifactStore["put"]>((input) => base.put(input));
      const result = await createAI({
        ...(mode === "policy" ? { storage: overridePut(base, put) } : {}),
        providers: [
          outputProvider(`skip-${mode}`, async () => ({
            rawOutputs: { answer: "ok" },
            artifactRefs: [
              artifact.text("SKIPPED_OUTPUT", { id: `artifact:skip:${mode}` }),
            ],
          })),
        ],
      }).run({
        task: "truthful output skip",
        outputs: { answer: "text" },
        ...(mode === "policy" ? { policy: { retention: "none" as const } } : {}),
      });

      expect(result.ok).toBe(true);
      expect(put).not.toHaveBeenCalled();
      if (!result.ok || result.plan.kind !== "execution-plan") {
        throw new Error("Expected skipped output persistence success.");
      }
      expect(result.artifacts[0]?.storage).toBeUndefined();
      const persistence = result.plan.stages.find(
        (stage) => stage.kind === "persistence",
      );
      expect(persistence?.status).toBe("skipped");
      expect(persistence?.metadata?.reports).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lifecycle: "provider-output",
            status: "skipped",
            reason: mode,
          }),
        ]),
      );
    });
  }

  it("does not reopen a stream or fallback after stream output persistence fails", async () => {
    const base = createMemoryArtifactStore({ id: "store:stream-output" });
    const storage = overridePut(base, async (input) => {
      if (input.lineage?.transform.kind === "model-output") {
        throw new Error("SECRET_STREAM_OUTPUT_CAUSE");
      }
      return base.put(input);
    });
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const primary = outputProvider("stream-output-primary", undefined, true);
    const primaryStream: ProviderAdapter = {
      ...primary,
      executeStream() {
        primaryCalls += 1;
        return completedOutputStream("artifact:stream-output");
      },
    };
    const fallback = outputProvider("stream-output-fallback", undefined, true);
    const fallbackStream: ProviderAdapter = {
      ...fallback,
      executeStream() {
        fallbackCalls += 1;
        return completedOutputStream("artifact:must-not-run");
      },
    };
    const result = await createAI({
      storage,
      providers: [primaryStream, fallbackStream],
    }).run({
      task: "stream output persistence",
      outputs: { answer: "text" },
      policy: { stream: true },
    });

    expect(result.ok).toBe(false);
    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(0);
    if (result.ok) {
      throw new Error("Expected stream output persistence failure.");
    }
    expect(result.error).toMatchObject({
      kind: "persistence",
      lifecycle: "provider-output",
      postProvider: true,
    });
    expect(result.partialOutputs).toEqual({ answer: "streamed" });
    expect(JSON.stringify(result)).not.toContain("SECRET_STREAM_OUTPUT_CAUSE");
  });
});

describe("session continuity lifecycle", () => {
  it("appends exact resolvable projection and output refs with effective scope", async () => {
    const storage = createMemoryArtifactStore({ id: "store:session-exact" });
    const sessions = createMemorySessionStore({ id: "sessions:exact" });
    const requests: ProviderRunRequest[] = [];
    const result = await createAI({
      storage,
      sessions,
      providers: [
        outputProvider("session-exact", async (request) => {
          requests.push(request);
          return {
            rawOutputs: { answer: "continued" },
            artifactRefs: [
              artifact.text("SESSION_OUTPUT", { id: "artifact:session-output" }),
            ],
          };
        }),
      ],
    }).run({
      task: "scoped continuity",
      session: { id: "session:exact", kind: "session-ref" },
      artifacts: [
        artifact.text("SESSION_INPUT", { id: "artifact:session-input" }),
      ],
      outputs: { answer: "text" },
      policy: {
        tenantId: "tenant:exact",
        privacy: "sensitive",
        retention: "durable",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.plan.kind !== "execution-plan") {
      throw new Error("Expected exact session continuity success.");
    }
    const record = await sessions.load("session:exact");
    const turn = record?.turns.at(-1);
    expect(turn).toMatchObject({
      task: "scoped continuity",
      planId: result.plan.id,
      tenantId: "tenant:exact",
      privacy: "sensitive",
      retention: "durable",
    });
    expect(turn?.artifactRefs).toEqual(
      result.plan.contextProjection?.artifactRefs.filter(
        (ref) => ref.storage?.storeId === storage.id,
      ),
    );
    expect(turn?.outputArtifactRefs).toEqual(result.artifacts);
    expect(record?.planIds).toEqual([result.plan.id]);
    expect(requests).toHaveLength(1);
    for (const ref of [
      ...(turn?.artifactRefs ?? []),
      ...(turn?.outputArtifactRefs ?? []),
    ]) {
      await expect(storage.load(ref.id)).resolves.toEqual(
        expect.objectContaining({ id: ref.id }),
      );
    }
  });

  for (const mode of ["throw", "malformed"] as const) {
    it(`returns terminal partial evidence when session append ${mode}s`, async () => {
      const storage = createMemoryArtifactStore({ id: `store:session-${mode}` });
      const base = createMemorySessionStore({ id: `sessions:${mode}` });
      const appendTurn = vi.fn<SessionStore["appendTurn"]>(async (input) => {
        if (mode === "throw") {
          throw new Error("SECRET_SESSION_APPEND_CAUSE");
        }

        const appended = await base.appendTurn(input);
        return { ...appended, turns: [] };
      });
      const sessions: SessionStore = { ...base, appendTurn };
      let primaryCalls = 0;
      let fallbackCalls = 0;
      const result = await createAI({
        storage,
        sessions,
        providers: [
          outputProvider(`session-primary-${mode}`, async () => {
            primaryCalls += 1;
            return {
              rawOutputs: { answer: "partial session output" },
              artifactRefs: [
                artifact.text("PERSISTED_BEFORE_SESSION", {
                  id: `artifact:session-failure:${mode}`,
                }),
              ],
              normalizedUsage: {
                promptTokens: 4,
                completionTokens: 2,
                costUsd: 0.02,
              },
            };
          }),
          outputProvider(`session-fallback-${mode}`, async () => {
            fallbackCalls += 1;
            return { rawOutputs: { answer: "must not retry" } };
          }),
        ],
      }).run({
        task: "session append terminal",
        session: { id: `session:failure:${mode}`, kind: "session-ref" },
        outputs: { answer: "text" },
      });

      expect(result.ok).toBe(false);
      expect(primaryCalls).toBe(1);
      expect(fallbackCalls).toBe(0);
      expect(appendTurn).toHaveBeenCalledOnce();
      if (result.ok || result.plan.kind !== "execution-plan") {
        throw new Error("Expected a terminal session persistence failure.");
      }
      expect(result.error).toMatchObject({
        kind: "persistence",
        lifecycle: "session",
        sessionId: `session:failure:${mode}`,
        postProvider: true,
        terminal: true,
      });
      expect(result.partialOutputs).toEqual({ answer: "partial session output" });
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0]?.storage?.storeId).toBe(storage.id);
      expect(result.usage.costUsd).toBe(0.02);
      expect(result.plan.attempts[0]?.status).toBe("succeeded");
      expect(result.plan.stages.find((stage) => stage.kind === "persistence"))
        .toMatchObject({
          status: "failed",
          metadata: {
            failure: { lifecycle: "session" },
          },
        });
      expect(JSON.stringify(result)).not.toContain("SECRET_SESSION_APPEND_CAUSE");
    });
  }

  for (const mode of ["unconfigured", "policy"] as const) {
    it(`keeps task and plan continuity with empty refs for ${mode} storage`, async () => {
      const sessions = createMemorySessionStore({ id: `sessions:skip:${mode}` });
      const storage = createMemoryArtifactStore({ id: `store:session-skip:${mode}` });
      const result = await createAI({
        sessions,
        ...(mode === "policy" ? { storage } : {}),
        providers: [
          outputProvider(`session-skip-${mode}`, async () => ({
            rawOutputs: { answer: "continued" },
            artifactRefs: [
              artifact.text("UNRESOLVED_OUTPUT", {
                id: `artifact:session-skip-output:${mode}`,
              }),
            ],
          })),
        ],
      }).run({
        task: `session ${mode} continuity`,
        session: { id: `session:skip:${mode}`, kind: "session-ref" },
        artifacts: [
          artifact.text("UNRESOLVED_INPUT", {
            id: `artifact:session-skip-input:${mode}`,
          }),
        ],
        outputs: { answer: "text" },
        ...(mode === "policy" ? { policy: { retention: "none" as const } } : {}),
      });

      expect(result.ok).toBe(true);
      if (!result.ok) {
        throw new Error("Expected skipped-storage session continuity success.");
      }
      const record = await sessions.load(`session:skip:${mode}`);
      expect(record?.turns).toHaveLength(1);
      expect(record?.turns[0]).toMatchObject({
        task: `session ${mode} continuity`,
        planId: result.plan.id,
        artifactRefs: [],
        outputArtifactRefs: [],
        ...(mode === "policy" ? { retention: "none" } : {}),
      });
      expect(record?.planIds).toEqual([result.plan.id]);
    });
  }

  it("appends exact output refs after a completed stream", async () => {
    const storage = createMemoryArtifactStore({ id: "store:session-stream" });
    const sessions = createMemorySessionStore({ id: "sessions:stream" });
    let streamCalls = 0;
    const provider: ProviderAdapter = {
      ...outputProvider("session-stream", undefined, true),
      executeStream() {
        streamCalls += 1;
        return completedOutputStream("artifact:session-stream-output");
      },
    };
    const result = await createAI({ storage, sessions, providers: [provider] }).run({
      task: "stream session continuity",
      session: { id: "session:stream", kind: "session-ref" },
      outputs: { answer: "text" },
      policy: { stream: true },
    });

    expect(result.ok).toBe(true);
    expect(streamCalls).toBe(1);
    if (!result.ok) {
      throw new Error("Expected completed-stream session success.");
    }
    const record = await sessions.load("session:stream");
    expect(record?.turns.at(-1)?.outputArtifactRefs).toEqual(result.artifacts);
    expect(result.artifacts[0]?.storage?.storeId).toBe(storage.id);
  });
});

function sessionRecord(
  overrides: Partial<SessionRecord> = {},
): SessionRecord {
  return {
    id: "session:authority",
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

function outputProvider(
  id: string,
  execute?: NonNullable<ProviderAdapter["execute"]>,
  streaming = false,
): ProviderAdapter {
  return {
    id,
    kind: "provider-adapter",
    capabilities: [
      {
        ...defaultCapabilityForProvider(id),
        modelId: `${id}:model`,
        streaming,
      },
    ],
    ...(execute !== undefined ? { execute } : {}),
  };
}

function overridePut(
  base: ArtifactStore,
  put: ArtifactStore["put"],
): ArtifactStore {
  return { ...base, put };
}

function requiredStorage(ref: ArtifactRef): NonNullable<ArtifactRef["storage"]> {
  if (ref.storage === undefined) {
    throw new Error("Expected a stored artifact ref.");
  }
  return ref.storage;
}

async function* completedOutputStream(id: string) {
  yield {
    kind: "complete" as const,
    rawOutputs: { answer: "streamed" },
    artifactRefs: [artifact.text("STREAM_OUTPUT", { id })],
  };
}
