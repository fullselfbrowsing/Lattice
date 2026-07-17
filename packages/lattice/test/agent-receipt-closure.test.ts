import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";

import {
  BAND,
  contract,
  createFakeProvider,
  createHookPipeline,
  createInMemorySigner,
  createMemoryKeySet,
  createNoopAgentHost,
  createNoopSurvivabilityAdapter,
  defineAgent,
  defineTool,
  generateEd25519KeyPairJwk,
  receiptCid,
  runAgent,
  runAgentCrew,
  verifyReceipt,
  type AgentHost,
  type AgentResult,
  type AgentSnapshot,
  type CapabilityReceiptBody,
  type KeySet,
  type ReceiptEnvelope,
  type ReceiptIssuanceMode,
  type ReceiptSigner,
  type SerializedSnapshot,
} from "../src/index.js";
import { fc } from "../src/test-support/fast-check.js";

const ZERO_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  costUsd: null,
} as const;

interface SigningHarness {
  readonly signer: ReceiptSigner;
  readonly keySet: KeySet;
  readonly calls: { value: number };
}

async function signingHarness(options: {
  readonly failOn?: readonly number[];
  readonly rejectAll?: boolean;
  readonly secret?: string;
} = {}): Promise<SigningHarness> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const baseSigner = createInMemorySigner(privateKeyJwk, {
    kid: `phase-61-${Math.random().toString(16).slice(2)}`,
    publicKeyJwk,
  });
  const calls = { value: 0 };
  const failOn = new Set(options.failOn ?? []);
  const signer: ReceiptSigner = {
    ...baseSigner,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      calls.value += 1;
      if (options.rejectAll === true || failOn.has(calls.value)) {
        throw new Error(options.secret ?? "SECRET-PHASE-61-SIGNER");
      }
      return baseSigner.sign(bytes);
    },
  };
  return {
    signer,
    calls,
    keySet: createMemoryKeySet([
      { kid: signer.kid, publicKeyJwk, state: "active" },
    ]),
  };
}

function schema(options: { readonly reject?: boolean } = {}): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "phase-61-public-closure",
      validate: (value: unknown) =>
        options.reject === true
          ? { issues: [{ message: "rejected by public closure schema" }] }
          : { value: value as never },
    } as never,
  } as StandardSchemaV1;
}

function tool(name = "echo") {
  return defineTool({
    name,
    inputSchema: schema(),
    execute: (input: unknown) => input,
  });
}

async function verifiedBody(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
): Promise<CapabilityReceiptBody> {
  const verification = await verifyReceipt(envelope, keySet);
  expect(verification).toMatchObject({
    ok: true,
    verificationProfile: "dsse-v1",
    deprecated: false,
  });
  if (!verification.ok) {
    throw new Error(`Receipt did not verify: ${verification.error.kind}`);
  }
  return verification.body;
}

async function expectAttachedAgentEvidence(
  result: AgentResult,
  harness: SigningHarness,
): Promise<void> {
  const iterationEnvelopes: ReceiptEnvelope[] = [];
  for (const record of result.iterations) {
    expect(record.iterationId).toBe(
      `${record.iterationId?.replace(/:iteration:\d+$/u, "")}:iteration:${record.index}`,
    );
    expect(record.receipt).toBeDefined();
    if (record.receipt === undefined) continue;
    iterationEnvelopes.push(record.receipt);
    const body = await verifiedBody(record.receipt, harness.keySet);
    expect(body.stepName).toBe(record.iterationId);
    expect(body.stepIndex).toBe(record.index);
  }

  expect(result.receipt).toBeDefined();
  if (result.receipt === undefined) return;
  const terminalBody = await verifiedBody(result.receipt, harness.keySet);
  expect(terminalBody.stepName).toMatch(/^agent-execution:[A-Za-z0-9:._-]+:terminal$/u);
  expect(terminalBody.stepIndex).toBe(result.iterations.length);
  expect(iterationEnvelopes).not.toContain(result.receipt);
  expect(new Set([...iterationEnvelopes, result.receipt]).size).toBe(
    result.iterations.length + 1,
  );
}

function snapshotHost(
  snapshot: SerializedSnapshot | null,
  counters: { load: number; save: number; clear: number; transport: number },
): AgentHost {
  return {
    ...createNoopAgentHost(),
    storage: {
      async load() {
        counters.load += 1;
        return snapshot;
      },
      async save() {
        counters.save += 1;
      },
      async clear() {
        counters.clear += 1;
      },
    },
    transport: {
      async call(provider, request) {
        counters.transport += 1;
        return provider.execute!(request);
      },
    },
  };
}

describe("Phase 61 public agent receipt closure", () => {
  const modeCases: ReadonlyArray<{
    readonly name: string;
    readonly mode: ReceiptIssuanceMode;
    readonly signer: "missing" | "working" | "failing";
    readonly expectedKind: string;
    readonly providerCalls: number;
    readonly signerCalls: number;
    readonly issued: boolean;
  }> = [
    {
      name: "off ignores a working signer",
      mode: "off",
      signer: "working",
      expectedKind: "success",
      providerCalls: 1,
      signerCalls: 0,
      issued: false,
    },
    {
      name: "best-effort attaches working evidence",
      mode: "best-effort",
      signer: "working",
      expectedKind: "success",
      providerCalls: 1,
      signerCalls: 2,
      issued: true,
    },
    {
      name: "required attaches working evidence",
      mode: "required",
      signer: "working",
      expectedKind: "success",
      providerCalls: 1,
      signerCalls: 2,
      issued: true,
    },
    {
      name: "best-effort preserves work after signer failure",
      mode: "best-effort",
      signer: "failing",
      expectedKind: "success",
      providerCalls: 1,
      signerCalls: 2,
      issued: false,
    },
    {
      name: "required stops after checkpoint signer failure",
      mode: "required",
      signer: "failing",
      expectedKind: "audit",
      providerCalls: 1,
      signerCalls: 1,
      issued: false,
    },
    {
      name: "required missing signer fails before transport",
      mode: "required",
      signer: "missing",
      expectedKind: "audit",
      providerCalls: 0,
      signerCalls: 0,
      issued: false,
    },
  ];

  it.each(modeCases)(
    "[AGREC-01, AGREC-02] $name",
    async (testCase) => {
      const harness = await signingHarness({
        rejectAll: testCase.signer === "failing",
      });
      let providerCalls = 0;
      const provider = createFakeProvider({
        id: `phase-61-mode-${testCase.mode}-${testCase.signer}`,
        response: () => {
          providerCalls += 1;
          return { rawOutputs: { answer: "done" } };
        },
      });
      const result = await runAgent(
        {
          task: testCase.name,
          tools: [],
          receiptMode: testCase.mode,
          ...(testCase.signer !== "missing"
            ? { signer: harness.signer }
            : {}),
        },
        { providers: [provider] },
      );

      expect(result.kind).toBe(testCase.expectedKind);
      expect(providerCalls).toBe(testCase.providerCalls);
      expect(harness.calls.value).toBe(testCase.signerCalls);
      if (testCase.issued) {
        await expectAttachedAgentEvidence(result, harness);
      } else {
        expect(result.receipt).toBeUndefined();
        for (const record of result.iterations) {
          expect(record.receipt).toBeUndefined();
        }
      }
      expect(JSON.stringify(result)).not.toContain("SECRET-PHASE-61-SIGNER");
    },
  );

  it("[AGREC-01, AGREC-02] attaches one exact receipt per iteration and terminal result class", async () => {
    const variants = [
      { name: "final", expectedKind: "success", providerCalls: 1 },
      { name: "tool", expectedKind: "success", providerCalls: 2 },
      {
        name: "denied",
        expectedKind: "agent-iteration-denied",
        providerCalls: 0,
      },
      { name: "validation", expectedKind: "validation", providerCalls: 1 },
      {
        name: "provider",
        expectedKind: "provider_execution",
        providerCalls: 1,
      },
      {
        name: "budget",
        expectedKind: "agent-max-iterations",
        providerCalls: 0,
      },
    ] as const;

    for (const variant of variants) {
      const harness = await signingHarness();
      let providerCalls = 0;
      const answers =
        variant.name === "tool"
          ? [
              '{"tool_calls":[{"id":"call-1","name":"echo","args":{"value":"ok"}}]}',
              "tool complete",
            ]
          : ["done"];
      const provider = createFakeProvider({
        id: `phase-61-terminal-${variant.name}`,
        response: () => {
          providerCalls += 1;
          if (variant.name === "provider") {
            throw new Error("bounded provider failure");
          }
          return {
            rawOutputs:
              variant.name === "validation"
                ? { build: { command: 42 } }
                : { answer: answers.shift() ?? "" },
          };
        },
      });
      const pipeline = createHookPipeline();
      if (variant.name === "denied") {
        pipeline.register(
          "BEFORE_AGENT_ITERATION",
          (_context, controls) => controls?.deny("public closure denial"),
          { band: BAND.SAFETY },
        );
      }
      const result = await runAgent(
        {
          task: `Exercise ${variant.name}.`,
          tools: variant.name === "tool" ? [tool()] : [],
          signer: harness.signer,
          receiptMode: "required",
          ...(variant.name === "denied" ? { pipeline } : {}),
          ...(variant.name === "validation"
            ? { outputs: { build: schema({ reject: true }) } }
            : {}),
          ...(variant.name === "budget"
            ? { contract: contract({ budget: { maxIterations: 0 } }) }
            : {}),
        },
        { providers: [provider] },
      );

      expect(result.kind, variant.name).toBe(variant.expectedKind);
      expect(providerCalls, variant.name).toBe(variant.providerCalls);
      expect(harness.calls.value, variant.name).toBe(
        result.iterations.length + 1,
      );
      await expectAttachedAgentEvidence(result, harness);
    }
  });

  it("[AGREC-01, AGREC-02] generated shared-pipeline runs never accumulate managed receipt handlers", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (runCount) => {
        const harness = await signingHarness();
        const pipeline = createHookPipeline();
        let providerCalls = 0;
        const provider = createFakeProvider({
          id: "phase-61-shared-pipeline",
          response: () => {
            providerCalls += 1;
            return { rawOutputs: { answer: "done" } };
          },
        });
        const iterationIds: string[] = [];
        const receiptPayloads: string[] = [];

        for (let runIndex = 0; runIndex < runCount; runIndex += 1) {
          const result = await runAgent(
            {
              task: `Shared pipeline run ${runIndex}.`,
              tools: [],
              pipeline,
              signer: harness.signer,
              receiptMode: "required",
            },
            { providers: [provider] },
          );
          expect(result.kind).toBe("success");
          await expectAttachedAgentEvidence(result, harness);
          iterationIds.push(result.iterations[0]!.iterationId!);
          receiptPayloads.push(
            result.iterations[0]!.receipt!.payload,
            result.receipt!.payload,
          );
        }

        expect(providerCalls).toBe(runCount);
        expect(harness.calls.value).toBe(runCount * 2);
        expect(new Set(iterationIds).size).toBe(runCount);
        expect(new Set(receiptPayloads).size).toBe(runCount * 2);
      }),
      { numRuns: 6 },
    );
  });
});

describe("Phase 61 public resume closure", () => {
  it("[AGREC-03] restores exact persisted evidence once and appends under one execution identity", async () => {
    const harness = await signingHarness();
    const adapter = createNoopSurvivabilityAdapter<AgentSnapshot>();
    let captured: SerializedSnapshot | null = null;
    let firstProviderCalls = 0;
    const firstProvider = createFakeProvider({
      id: "phase-61-resume",
      response: () => {
        firstProviderCalls += 1;
        return {
          rawOutputs: {
            answer:
              '{"tool_calls":[{"id":"call-1","name":"echo","args":{"value":"first"}}]}',
          },
        };
      },
    });
    const firstHost: AgentHost = {
      ...createNoopAgentHost(),
      storage: {
        async load() {
          return null;
        },
        async save(snapshot) {
          captured = snapshot;
        },
        async clear() {},
      },
      scheduler: {
        async scheduleNext() {
          throw new Error("simulated public host eviction");
        },
      },
    };

    await expect(
      runAgent(
        {
          task: "Resume one completed tool iteration.",
          tools: [tool()],
          host: firstHost,
          signer: harness.signer,
          receiptMode: "required",
        },
        { providers: [firstProvider] },
      ),
    ).rejects.toThrow("simulated public host eviction");
    expect(firstProviderCalls).toBe(1);
    expect(harness.calls.value).toBe(1);
    expect(captured).not.toBeNull();
    if (captured === null) throw new Error("Expected a persisted snapshot.");

    const persisted = adapter.deserialize(captured);
    expect(persisted.executionId).toMatch(/^agent-execution:/u);
    expect(persisted.iterations).toHaveLength(1);
    expect(persisted.iterations?.[0]?.receipt).toBeDefined();
    const persistedEnvelopeBytes = JSON.stringify(
      persisted.iterations?.[0]?.receipt,
    );

    let secondProviderCalls = 0;
    let clearCalls = 0;
    const secondProvider = createFakeProvider({
      id: "phase-61-resume",
      response: () => {
        secondProviderCalls += 1;
        return { rawOutputs: { answer: "resumed final" } };
      },
    });
    const secondHost: AgentHost = {
      ...createNoopAgentHost(),
      storage: {
        async load() {
          return captured;
        },
        async save() {},
        async clear() {
          clearCalls += 1;
        },
      },
    };
    const result = await runAgent(
      {
        task: "Resume one completed tool iteration.",
        tools: [tool()],
        host: secondHost,
        signer: harness.signer,
        receiptMode: "required",
      },
      { providers: [secondProvider] },
    );

    expect(result.kind).toBe("success");
    expect(secondProviderCalls).toBe(1);
    expect(clearCalls).toBe(1);
    expect(harness.calls.value).toBe(3);
    expect(result.iterations).toHaveLength(2);
    expect(result.iterations.map((record) => record.iterationId)).toEqual([
      `${persisted.executionId}:iteration:0`,
      `${persisted.executionId}:iteration:1`,
    ]);
    expect(JSON.stringify(result.iterations[0]?.receipt)).toBe(
      persistedEnvelopeBytes,
    );
    expect(
      result.iterations.filter(
        (record) => JSON.stringify(record.receipt) === persistedEnvelopeBytes,
      ),
    ).toHaveLength(1);
    await expectAttachedAgentEvidence(result, harness);
  });

  it("[AGREC-03] generated historical snapshots derive a stable tail without fabricating prior records", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 12 }), async (startIndex) => {
        const adapter = createNoopSurvivabilityAdapter<AgentSnapshot>();
        const historical = adapter.serialize({
          version: "agent-snapshot/v1",
          iterationIndex: startIndex,
          conversation: [{ role: "user", content: "historical public task" }],
          cumulativeUsage: ZERO_USAGE,
          providerName: "phase-61-historical",
          capturedAt: "2026-07-17T00:00:00.000Z",
        });
        const harness = await signingHarness();
        let providerCalls = 0;
        const provider = createFakeProvider({
          id: "phase-61-historical",
          response: () => {
            providerCalls += 1;
            return { rawOutputs: { answer: "historical tail" } };
          },
        });
        const run = () =>
          runAgent(
            {
              task: "historical public task",
              tools: [],
              host: snapshotHost(historical, {
                load: 0,
                save: 0,
                clear: 0,
                transport: 0,
              }),
              signer: harness.signer,
              receiptMode: "required",
            },
            { providers: [provider] },
          );

        const first = await run();
        const second = await run();
        expect(first.kind).toBe("success");
        expect(second.kind).toBe("success");
        expect(first.iterations).toHaveLength(1);
        expect(second.iterations).toHaveLength(1);
        expect(first.iterations[0]?.index).toBe(startIndex);
        expect(first.iterations[0]?.iterationId).toBe(
          second.iterations[0]?.iterationId,
        );
        expect(first.iterations[0]?.iterationId).toMatch(
          new RegExp(
            `^agent-execution:legacy:[a-f0-9]{64}:iteration:${startIndex}$`,
            "u",
          ),
        );
        expect(providerCalls).toBe(2);
        expect(harness.calls.value).toBe(4);
      }),
      { numRuns: 6 },
    );
  });

  it("[AGREC-03] corrupt and generated inconsistent snapshots fail closed with bounded diagnostics", async () => {
    const secret = "SECRET-PHASE-61-INVALID-SNAPSHOT";

    async function expectInvalid(
      snapshot: SerializedSnapshot,
      reason: "deserialize-failed" | "snapshot-invalid",
    ): Promise<void> {
      const harness = await signingHarness();
      const counters = { load: 0, save: 0, clear: 0, transport: 0 };
      let providerCalls = 0;
      const events: Array<{
        readonly name: string;
        readonly attributes?: Record<string, unknown>;
      }> = [];
      const provider = createFakeProvider({
        id: "phase-61-invalid-snapshot",
        response: () => {
          providerCalls += 1;
          return { rawOutputs: { answer: "must not execute" } };
        },
      });
      const result = await runAgent(
        {
          task: "Do not restart invalid state.",
          tools: [],
          host: snapshotHost(snapshot, counters),
          signer: harness.signer,
          receiptMode: "required",
          tracer: {
            kind: "tracer",
            event(name, attributes) {
              if (name.startsWith("recovery.")) {
                events.push({
                  name,
                  ...(attributes !== undefined ? { attributes } : {}),
                });
              }
            },
          },
        },
        { providers: [provider] },
      );

      expect(result).toMatchObject({
        kind: "agent-recovery-failed",
        reason,
        usage: ZERO_USAGE,
        iterations: [],
      });
      expect(events.map((event) => event.name)).toEqual([
        "recovery.start",
        "recovery.failed",
      ]);
      expect(events.at(-1)?.attributes).toEqual({ reason });
      expect(counters).toEqual({ load: 1, save: 0, clear: 0, transport: 0 });
      expect(providerCalls).toBe(0);
      expect(harness.calls.value).toBe(0);
      expect(JSON.stringify({ result, events })).not.toContain(secret);
    }

    await expectInvalid(
      {
        kind: "survivability-snapshot",
        version: "lattice-survivability/v1",
        payload: `{${secret}`,
        capturedAt: "2026-07-17T00:00:00.000Z",
      },
      "deserialize-failed",
    );

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 }), async (index) => {
        const executionId = "agent-execution:phase-61-invalid";
        const record = {
          iterationId: `${executionId}:iteration:${index}`,
          index,
          provider: "phase-61-invalid-snapshot",
          promptTokens: 0,
          completionTokens: 0,
          costUsd: null,
          durationMs: 0,
          toolCalls: [],
        };
        const snapshot = createNoopSurvivabilityAdapter<unknown>().serialize({
          version: "agent-snapshot/v1",
          executionId,
          iterations: [record, record],
          iterationIndex: index + 1,
          conversation: [{ role: "user", content: secret }],
          cumulativeUsage: ZERO_USAGE,
          providerName: "phase-61-invalid-snapshot",
          capturedAt: "2026-07-17T00:00:00.000Z",
        });
        await expectInvalid(snapshot, "snapshot-invalid");
      }),
      { numRuns: 6 },
    );
  });
});

describe("Phase 61 public crew receipt closure", () => {
  it("[AGREC-04] generated serial topologies expose root, exact child terminals, then the exact parent terminal", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 3 }), async (childCount) => {
        const harness = await signingHarness();
        const children = Array.from({ length: childCount }, (_, index) =>
          defineAgent({
            id: `child-${index}`,
            intent: `Complete child ${index}.`,
            tools: [],
            summaryReturnSchema: schema(),
          }),
        );
        const root = defineAgent({
          id: "lead",
          intent: "Dispatch every child in serial order.",
          tools: [],
          childAgents: children,
          summaryReturnSchema: schema(),
        });
        const answers =
          childCount === 0
            ? ["parent final"]
            : [
                JSON.stringify({
                  tool_calls: children.map((child, index) => ({
                    id: `call-${index}`,
                    name: child.id,
                    args: { task: `task-${index}` },
                  })),
                }),
                ...children.map((child) => `${child.id} summary`),
                "parent final",
              ];
        const tasks: string[] = [];
        const provider = createFakeProvider({
          id: "phase-61-generated-crew",
          response: (request) => {
            tasks.push(request.task);
            return { rawOutputs: { answer: answers.shift() ?? "" } };
          },
        });

        const result = await runAgentCrew(
          {
            root,
            hosts: { childHost: createNoopAgentHost() },
            signer: harness.signer,
            receiptMode: "required",
          },
          { providers: [provider] },
        );

        expect(result.result.kind).toBe("success");
        expect(tasks).toHaveLength(childCount === 0 ? 1 : childCount + 2);
        expect(result.receipts).toHaveLength(childCount + 2);
        expect(harness.calls.value).toBe(
          childCount === 0 ? 3 : childCount * 2 + 4,
        );
        const bodies = await Promise.all(
          result.receipts.map((envelope) =>
            verifiedBody(envelope, harness.keySet),
          ),
        );
        expect(bodies.map((body) => body.stepName)).toEqual([
          "crew-start:lead",
          ...children.map((child) => `crew-agent-completion:${child.id}`),
          "crew-agent-completion:lead",
        ]);
        expect(bodies[0]?.parentReceiptCid).toBeUndefined();
        expect(result.crewRootCid).toBe(
          await receiptCid(result.receipts[0]!),
        );
        for (const body of bodies.slice(1)) {
          expect(body.parentReceiptCid).toBe(result.crewRootCid);
          expect(body.route.capabilityId).toBe("lattice-agent/terminal");
        }
        for (let index = 0; index < children.length; index += 1) {
          const child = children[index]!;
          const cid = await receiptCid(result.receipts[index + 1]!);
          expect(
            result.perAgent.find((entry) => entry.id === child.id)?.receiptCids,
          ).toEqual([cid]);
          expect(tasks.at(-1)).toContain(cid);
        }
        const parentEnvelope = result.receipts.at(-1)!;
        expect(result.result.receipt).toBe(parentEnvelope);
        expect(
          result.perAgent.find((entry) => entry.id === "lead")?.receiptCids,
        ).toEqual([await receiptCid(parentEnvelope)]);
      }),
      { numRuns: 6 },
    );
  });

  it("[AGREC-04] repeated successful child dispatches retain two distinct exact terminal envelopes", async () => {
    const harness = await signingHarness();
    const child = defineAgent({
      id: "researcher",
      intent: "Complete each requested run.",
      tools: [],
      summaryReturnSchema: schema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Run the same child twice.",
      tools: [],
      childAgents: [child],
      summaryReturnSchema: schema(),
    });
    const answers = [
      '{"tool_calls":[{"id":"one","name":"researcher","args":{"task":"same"}},{"id":"two","name":"researcher","args":{"task":"same"}}]}',
      "first summary",
      "second summary",
      "parent final",
    ];
    const tasks: string[] = [];
    const provider = createFakeProvider({
      id: "phase-61-repeated-child",
      response: (request) => {
        tasks.push(request.task);
        return { rawOutputs: { answer: answers.shift() ?? "" } };
      },
    });
    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer: harness.signer,
        receiptMode: "required",
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    expect(tasks).toHaveLength(4);
    expect(harness.calls.value).toBe(8);
    expect(result.receipts).toHaveLength(4);
    const childCids = await Promise.all([
      receiptCid(result.receipts[1]!),
      receiptCid(result.receipts[2]!),
    ]);
    expect(new Set(childCids).size).toBe(2);
    expect(
      result.perAgent.find((entry) => entry.id === "researcher")?.receiptCids,
    ).toEqual(childCids);
    expect(tasks.at(-1)).toContain(childCids[0]);
    expect(tasks.at(-1)).toContain(childCids[1]);
    expect(result.result.receipt).toBe(result.receipts[3]);
  });

  it("[AGREC-04] required child terminal signing failure is cached without fabricated evidence", async () => {
    const secret = "SECRET-PHASE-61-CHILD-TERMINAL";
    const harness = await signingHarness({ failOn: [3], secret });
    const child = defineAgent({
      id: "researcher",
      intent: "Complete once before terminal signing.",
      tools: [],
      summaryReturnSchema: schema(),
    });
    const root = defineAgent({
      id: "lead",
      intent: "Request the same terminal child twice.",
      tools: [],
      childAgents: [child],
      summaryReturnSchema: schema(),
    });
    const answers = [
      '{"tool_calls":[{"id":"one","name":"researcher","args":{"task":"once"}},{"id":"two","name":"researcher","args":{"task":"once"}}]}',
      "child completed",
      "parent handled audit",
    ];
    const tasks: string[] = [];
    const provider = createFakeProvider({
      id: "phase-61-child-terminal-fault",
      response: (request) => {
        tasks.push(request.task);
        return { rawOutputs: { answer: answers.shift() ?? "" } };
      },
    });
    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer: harness.signer,
        receiptMode: "required",
      },
      { providers: [provider] },
    );

    expect(result.result.kind).toBe("success");
    expect(tasks.filter((task) => task.includes("USER:\nonce"))).toHaveLength(1);
    expect(tasks).toHaveLength(3);
    expect(harness.calls.value).toBe(6);
    expect(result.receipts).toHaveLength(2);
    expect(
      result.perAgent.find((entry) => entry.id === "researcher")?.receiptCids,
    ).toEqual([]);
    expect(result.result.receipt).toBe(result.receipts[1]);
    expect(JSON.stringify({ result, tasks })).not.toContain(secret);
  });

  it("[AGREC-02, AGREC-04] required parent terminal signing failure returns one audit without replacement minting", async () => {
    const secret = "SECRET-PHASE-61-PARENT-TERMINAL";
    const harness = await signingHarness({ failOn: [3], secret });
    let providerCalls = 0;
    const provider = createFakeProvider({
      id: "phase-61-parent-terminal-fault",
      response: () => {
        providerCalls += 1;
        return { rawOutputs: { answer: "parent completed" } };
      },
    });
    const root = defineAgent({
      id: "lead",
      intent: "Complete once.",
      tools: [],
      summaryReturnSchema: schema(),
    });
    const result = await runAgentCrew(
      {
        root,
        hosts: { childHost: createNoopAgentHost() },
        signer: harness.signer,
        receiptMode: "required",
      },
      { providers: [provider] },
    );

    expect(result.result).toMatchObject({
      kind: "audit",
      code: "receipt-signing-failed",
      stage: "post-execution",
    });
    expect(providerCalls).toBe(1);
    expect(harness.calls.value).toBe(3);
    expect(result.receipts).toHaveLength(1);
    expect(result.crewRootCid).toBe(await receiptCid(result.receipts[0]!));
    expect(result.result.receipt).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(secret);
  });
});
