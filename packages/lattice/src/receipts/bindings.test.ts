import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { createRequestBindingCollector, hashCanonicalForReceipt } from "./bindings.js";
import { canonicalizeReceiptBody } from "./canonical.js";
import { base64Decode, base64Encode, buildPae, PAYLOAD_TYPE } from "./envelope.js";
import { createMemoryKeySet } from "./keyset.js";
import { createReceipt, type CreateReceiptInput } from "./receipt.js";
import { createInMemorySigner, generateEd25519KeyPairJwk } from "./sign.js";
import type { CapabilityReceiptBody, ReceiptEnvelope } from "./types.js";
import { verifyReceipt } from "./verify.js";

const a = "a".repeat(64);
const b = "b".repeat(64);
const input: CreateReceiptInput = {
  runId: "binding-run", receiptId: "binding-receipt", issuedAt: "2026-10-27T00:00:00Z",
  model: { requested: "fake", observed: null },
  route: { providerId: "fake", capabilityId: "fake", attemptNumber: 1 },
  usage: { promptTokens: 1, completionTokens: 2, costUsd: 0 },
  contractVerdict: "success", contractHash: null, inputHashes: [], outputHash: null,
};

async function fixture() {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid: "bindings", publicKeyJwk });
  const keySet = createMemoryKeySet([{ kid: signer.kid, publicKeyJwk, state: "active" }]);
  return { signer, keySet };
}

function bodyOf(envelope: ReceiptEnvelope): CapabilityReceiptBody {
  return JSON.parse(new TextDecoder().decode(base64Decode(envelope.payload))) as CapabilityReceiptBody;
}

describe("execution bindings", () => {
  it("hashes canonical JSON, including string quotes, independently of object insertion order", async () => {
    expect(await hashCanonicalForReceipt("café\n")).toBe(createHash("sha256").update(JSON.stringify("café\n")).digest("hex"));
    expect(await hashCanonicalForReceipt({ privacy: "standard", gateway: { metadata: { b: 2, a: 1 } } }))
      .toBe(await hashCanonicalForReceipt({ gateway: { metadata: { a: 1, b: 2 } }, privacy: "standard" }));
    expect(await hashCanonicalForReceipt("first task")).not.toBe(await hashCanonicalForReceipt("second task"));
  });

  it("preserves omitted canonical bytes and verifies pre-binding receipts", async () => {
    const { signer, keySet } = await fixture();
    const envelope = await createReceipt(input, signer);
    const body = bodyOf(envelope);
    expect(body).not.toHaveProperty("taskHash");
    expect(body).not.toHaveProperty("policyHash");
    expect(body).not.toHaveProperty("providerRequestHashes");
    expect(await createReceipt({ ...input }, signer)).toEqual(envelope);
    const legacyBody = { ...body, version: "lattice-receipt/v1.3" as const };
    const payload = base64Encode(canonicalizeReceiptBody(legacyBody));
    const signature = await signer.sign(buildPae(PAYLOAD_TYPE, payload));
    const legacy = { ...envelope, payload, signatures: [{ keyid: signer.kid, sig: base64Encode(signature) }] };
    expect((await verifyReceipt(legacy, keySet)).ok).toBe(true);
    expect(await verifyReceipt(legacy, keySet, { expectedTaskHash: a })).toMatchObject({
      ok: false, error: { kind: "execution-binding-mismatch" },
    });
  });

  it("signs bindings, preserves their redacted values, and requires ordered exact expectations", async () => {
    const { signer, keySet } = await fixture();
    const bound = { ...input, taskHash: a, policyHash: b, providerRequestHashes: [a, b, a] };
    const envelope = await createReceipt(bound, signer);
    const result = await verifyReceipt(envelope, keySet, {
      expectedTaskHash: a, expectedPolicyHash: b, expectedProviderRequestHashes: [a, b, a],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toMatchObject({ taskHash: a, policyHash: b, providerRequestHashes: [a, b, a] });
    for (const options of [
      { expectedTaskHash: b }, { expectedPolicyHash: a },
      { expectedProviderRequestHashes: [b, a, a] }, { expectedProviderRequestHashes: [a, b] },
    ]) expect(await verifyReceipt(envelope, keySet, options)).toMatchObject({ ok: false, error: { kind: "execution-binding-mismatch" } });

    for (const mutation of [{ taskHash: b }, { policyHash: a }, { providerRequestHashes: [b, a, a] }]) {
      const changed = await createReceipt({ ...bound, ...mutation }, signer);
      expect(changed.payload).not.toBe(envelope.payload);
      expect(changed.signatures[0]?.sig).not.toBe(envelope.signatures[0]?.sig);
      const tampered = { ...envelope, payload: base64Encode(canonicalizeReceiptBody({ ...bodyOf(envelope), ...mutation })) };
      expect(await verifyReceipt(tampered, keySet)).toMatchObject({ ok: false, error: { kind: "signature-invalid" } });
    }
  });

  it.each([
    { taskHash: "A".repeat(64) }, { policyHash: null }, { providerRequestHashes: [] },
    { providerRequestHashes: a }, { providerRequestHashes: [42] }, { taskHash: {} },
    { providerRequestHashes: new Array(1) },
  ])("rejects malformed minted and crafted binding fields without verifier throws: %j", async (bad) => {
    const { signer, keySet } = await fixture();
    await expect(createReceipt({ ...input, ...bad } as CreateReceiptInput, signer)).rejects.toThrow(TypeError);
    const envelope = await createReceipt(input, signer);
    const payload = base64Encode(canonicalizeReceiptBody({ ...bodyOf(envelope), ...bad } as CapabilityReceiptBody));
    const signed = { ...envelope, payload, signatures: [{ keyid: signer.kid, sig: base64Encode(await signer.sign(buildPae(PAYLOAD_TYPE, payload))) }] };
    await expect(verifyReceipt(signed, keySet)).resolves.toMatchObject({ ok: false, error: { kind: "version-mismatch" } });
  });

  it("validates malformed expected binding options as caller errors", async () => {
    const { signer, keySet } = await fixture();
    await expect(verifyReceipt(await createReceipt(input, signer), keySet, { expectedProviderRequestHashes: [] })).rejects.toThrow(TypeError);
  });
});

describe("provider submission collection", () => {
  it("retains failed submissions and retries in their actual order", async () => {
    const collector = createRequestBindingCollector();
    await expect(collector.observe(async () => {
      collector.onRequestPrepared({ bodyHash: a });
      collector.onRequestPrepared({ bodyHash: b });
      throw new Error("network failure");
    })).rejects.toThrow("network failure");
    await collector.observe(async () => collector.onRequestPrepared({ bodyHash: a }));
    expect(collector.hashes).toEqual([a, b, a]);
  });

  it("does not claim completeness when one executed custom provider omits metadata", async () => {
    const collector = createRequestBindingCollector();
    await collector.observe(async () => collector.onRequestPrepared({ bodyHash: a }));
    await collector.observe(async () => undefined);
    expect(collector.hashes).toBeUndefined();
  });
});
