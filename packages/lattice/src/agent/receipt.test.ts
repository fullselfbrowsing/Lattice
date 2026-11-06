import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { contract } from "../contract/contract.js";
import { createFakeProvider } from "../providers/fake.js";
import { hashCanonicalForReceipt } from "../receipts/bindings.js";
import { createMemoryKeySet } from "../receipts/keyset.js";
import { createInMemorySigner, generateEd25519KeyPairJwk } from "../receipts/sign.js";
import type { ReceiptSigner } from "../receipts/types.js";
import { verifyReceipt } from "../receipts/verify.js";
import { ReceiptSigningError } from "../results/errors.js";
import { createAI } from "../runtime/create-ai.js";
import { runAgentInternal } from "./runtime.js";

const bodyHash = "c".repeat(64);
async function fixture() {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid: "agent-terminal", publicKeyJwk });
  return { signer, keySet: createMemoryKeySet([{ kid: signer.kid, publicKeyJwk, state: "active" }]) };
}

describe("terminal agent receipts", () => {
  it("returns a verifiable bound receipt without a tracer or checkpoint hooks", async () => {
    const { signer, keySet } = await fixture();
    const sign = vi.fn(signer.sign.bind(signer));
    const provider = createFakeProvider({ response: async (request) => {
      await request.onRequestPrepared?.({ bodyHash });
      return { rawOutputs: { answer: "done" }, rawResponse: { model: "observed-model" } };
    } });
    const result = await createAI({ providers: [provider] }).runAgent({
      task: "agent task", tools: [], signer: { ...signer, sign }, autoRegisterCheckpoint: false,
      policy: { noLogging: true },
    });
    expect(result.kind).toBe("success");
    expect(sign).toHaveBeenCalledTimes(1);
    expect(result.receiptError).toBeUndefined();
    const verified = await verifyReceipt(result.receipt!, keySet, {
      expectedTaskHash: await hashCanonicalForReceipt("agent task"),
      expectedPolicyHash: await hashCanonicalForReceipt({ noLogging: true }),
      expectedProviderRequestHashes: [bodyHash],
    });
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.body.contractVerdict).toBe("success");
      expect(verified.body.outputHash).toMatch(/^[0-9a-f]{64}$/u);
      expect(verified.body.model.observed).toBe("observed-model");
    }
  });

  it("uses the runtime signer by default and leaves unsupported custom submissions unbound", async () => {
    const { signer, keySet } = await fixture();
    const result = await createAI({ providers: [createFakeProvider()], signer }).runAgent({ task: "task", tools: [] });
    const verified = await verifyReceipt(result.receipt!, keySet);
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.body.providerRequestHashes).toBeUndefined();
    const overridden = await createAI({
      providers: [createFakeProvider()],
      signer: { ...signer, sign: async () => { throw new Error("unused default signer"); } },
    }).runAgent({ task: "task", tools: [], signer });
    expect((await verifyReceipt(overridden.receipt!, keySet)).ok).toBe(true);
  });

  it("signs validation failures without hashing invalid outputs for replay", async () => {
    const { signer, keySet } = await fixture();
    const provider = createFakeProvider({ response: { rawOutputs: { data: { count: "bad" } } } });
    const result = await createAI({ providers: [provider], signer }).runAgent({
      task: "task", tools: [], outputs: { data: z.object({ count: z.number() }) },
    });
    expect(result.kind).toBe("validation");
    expect(await verifyReceipt(result.receipt!, keySet)).toMatchObject({
      ok: true, body: { contractVerdict: "validation-failed", outputHash: null },
    });
  });

  it("signs cost-budget failure after a completed tool iteration", async () => {
    const { signer, keySet } = await fixture();
    const provider = createFakeProvider({ response: async (request) => {
      await request.onRequestPrepared?.({ bodyHash });
      return {
        rawOutputs: { answer: "" }, toolCalls: [{ id: "tool-1", name: "missing-tool", args: {} }],
        normalizedUsage: { promptTokens: 5, completionTokens: 2, costUsd: 0.002 },
      };
    } });
    const result = await createAI({ providers: [provider], signer }).runAgent({
      task: "task", tools: [], contract: contract({ budget: { maxCostUsd: 0.001, maxIterations: 3 } }),
    });
    expect(result.kind).toBe("no-contract-match");
    expect(result.iterations).toHaveLength(1);
    expect(await verifyReceipt(result.receipt!, keySet, { expectedProviderRequestHashes: [bodyHash] })).toMatchObject({
      ok: true, body: { contractVerdict: "no-contract-match", outputHash: null, usage: { costUsd: "0.002" } },
    });
  });

  it("returns a signed provider failure and captures the failed submission without a tracer", async () => {
    const { signer, keySet } = await fixture();
    const provider = createFakeProvider({ response: async (request) => {
      await request.onRequestPrepared?.({ bodyHash });
      throw new Error("provider failed");
    } });
    const result = await createAI({ providers: [provider], signer }).runAgent({ task: "task", tools: [] });
    expect(result.kind).not.toBe("success");
    expect(await verifyReceipt(result.receipt!, keySet, { expectedProviderRequestHashes: [bodyHash] })).toMatchObject({
      ok: true, body: { contractVerdict: "execution-failed", outputHash: null, route: { attemptNumber: 1 } },
    });
  });

  it.each([
    { budget: { maxIterations: 0 }, kind: "agent-max-iterations" },
    { budget: { maxWallTimeMs: 0 }, kind: "agent-wall-time-exceeded" },
  ])("signs pre-iteration $kind failures without a tracer", async ({ budget, kind }) => {
    const { signer, keySet } = await fixture();
    const execute = vi.fn(() => ({ rawOutputs: { answer: "unexpected" } }));
    const result = await createAI({ providers: [createFakeProvider({ response: execute })], signer }).runAgent({
      task: "task", tools: [], contract: contract({ budget }),
    });
    expect(result.kind).toBe(kind);
    expect(execute).not.toHaveBeenCalled();
    expect(await verifyReceipt(result.receipt!, keySet)).toMatchObject({ ok: true, body: { contractVerdict: "execution-failed", outputHash: null } });
  });

  it("signs no-provider failures and does not mint terminal receipts for the crew internal runner", async () => {
    const { signer, keySet } = await fixture();
    const result = await createAI({ signer }).runAgent({ task: "task", tools: [] });
    expect(result.kind).toBe("execution_unavailable");
    expect(await verifyReceipt(result.receipt!, keySet)).toMatchObject({ ok: true, body: { outputHash: null } });
    const internal = await runAgentInternal({ task: "task", tools: [], signer, autoRegisterCheckpoint: false }, { providers: [createFakeProvider()], signer });
    expect(internal.kind).toBe("success");
    expect(internal.receipt).toBeUndefined();
  });

  it("reports signer failures or rejects according to the configured policy", async () => {
    const signer: ReceiptSigner = { kid: "failed", publicKeyJwk: {}, sign: async () => { throw new Error("signer offline"); } };
    const intent = { task: "task", tools: [] };
    const flagged = await createAI({ providers: [createFakeProvider()], signer }).runAgent(intent);
    expect(flagged.kind).toBe("success");
    expect(flagged.receipt).toBeUndefined();
    expect(flagged.receiptError).toEqual({ kind: "signer-failed", message: "signer offline" });
    await expect(createAI({ providers: [createFakeProvider()], signer, receipts: { onSignerError: "throw" } }).runAgent(intent)).rejects.toBeInstanceOf(ReceiptSigningError);
    const failure = await createAI({ signer }).runAgent(intent);
    expect(failure.kind).toBe("execution_unavailable");
    expect(failure.receiptError?.kind).toBe("signer-failed");
  });

  it("keeps unsigned execution unchanged", async () => {
    const result = await createAI({ providers: [createFakeProvider()] }).runAgent({ task: "task", tools: [] });
    expect(result.kind).toBe("success");
    expect(result.receipt).toBeUndefined();
    expect(result.receiptError).toBeUndefined();
  });
});
