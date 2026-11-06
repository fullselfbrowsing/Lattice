import { describe, expect, it } from "vitest";
import { createFakeProvider } from "../providers/fake.js";
import { hashCanonicalForReceipt } from "../receipts/bindings.js";
import { createMemoryKeySet } from "../receipts/keyset.js";
import { createInMemorySigner, generateEd25519KeyPairJwk } from "../receipts/sign.js";
import { verifyReceipt } from "../receipts/verify.js";
import { createAI } from "./create-ai.js";

const firstHash = "a".repeat(64);
const secondHash = "b".repeat(64);

async function fixture() {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid: "runtime-bindings", publicKeyJwk });
  return { signer, keySet: createMemoryKeySet([{ kid: signer.kid, publicKeyJwk, state: "active" }]) };
}

describe("runtime execution binding", () => {
  it("binds the original task, merged policy, and protected submission callback", async () => {
    const { signer, keySet } = await fixture();
    const provider = createFakeProvider({ response: async (request) => {
      expect(request.task).toBe("formatted provider prompt");
      await request.onRequestPrepared?.({ bodyHash: firstHash });
      return { rawOutputs: { text: "done" } };
    } });
    const ai = createAI({ providers: [provider], signer, defaults: { policy: { privacy: "standard", gateway: { metadata: { inherited: true } } } } });
    const result = await ai.run({
      task: "original task", outputs: { text: "text" },
      policy: { noLogging: true, gateway: { metadata: { added: true } } },
      overrides: { hooks: { beforeProviderCall({ request }) {
        expect(Object.getOwnPropertyDescriptor(request, "onRequestPrepared")).toMatchObject({ writable: false, configurable: false });
        expect(() => Object.defineProperty(request, "onRequestPrepared", { value: () => undefined })).toThrow(TypeError);
        (request as { task: string }).task = "formatted provider prompt";
      } } },
    });
    expect(result.ok).toBe(true);
    expect(await verifyReceipt(result.receipt!, keySet, {
      expectedTaskHash: await hashCanonicalForReceipt("original task"),
      expectedPolicyHash: await hashCanonicalForReceipt({ privacy: "standard", noLogging: true, gateway: { metadata: { inherited: true, added: true } } }),
      expectedProviderRequestHashes: [firstHash],
    })).toMatchObject({ ok: true });
  });

  it("includes failed attempts before successful fallback submissions", async () => {
    const { signer, keySet } = await fixture();
    const failed = createFakeProvider({ id: "a-failed", response: async (request) => {
      await request.onRequestPrepared?.({ bodyHash: firstHash });
      throw new Error("network down");
    } });
    const succeeded = createFakeProvider({ id: "b-succeeded", response: async (request) => {
      await request.onRequestPrepared?.({ bodyHash: secondHash });
      return { rawOutputs: { text: "done" } };
    } });
    const result = await createAI({ providers: [failed, succeeded], signer }).run({ task: "task", outputs: { text: "text" } });
    expect(result.ok).toBe(true);
    expect(await verifyReceipt(result.receipt!, keySet, { expectedProviderRequestHashes: [firstHash, secondHash] })).toMatchObject({ ok: true });
  });

  it("binds final failed requests without a replayable output hash", async () => {
    const { signer, keySet } = await fixture();
    const provider = createFakeProvider({ response: async (request) => {
      await request.onRequestPrepared?.({ bodyHash: firstHash });
      throw new Error("network down");
    } });
    const result = await createAI({ providers: [provider], signer }).run({ task: "task", outputs: { text: "text" } });
    expect(result.ok).toBe(false);
    expect(await verifyReceipt(result.receipt!, keySet, { expectedProviderRequestHashes: [firstHash] })).toMatchObject({
      ok: true, body: { outputHash: null, contractVerdict: "execution-failed" },
    });
  });

  it("leaves custom provider requests explicitly unbound while still binding the task", async () => {
    const { signer, keySet } = await fixture();
    const result = await createAI({ providers: [createFakeProvider()], signer }).run({ task: "custom", outputs: { text: "text" } });
    const verified = await verifyReceipt(result.receipt!, keySet, { expectedTaskHash: await hashCanonicalForReceipt("custom") });
    expect(verified.ok).toBe(true);
    if (verified.ok) expect(verified.body.providerRequestHashes).toBeUndefined();
    expect(await verifyReceipt(result.receipt!, keySet, { expectedProviderRequestHashes: [firstHash] })).toMatchObject({
      ok: false, error: { kind: "execution-binding-mismatch" },
    });
  });
});
