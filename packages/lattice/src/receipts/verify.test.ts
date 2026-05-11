import { describe, expect, it } from "vitest";

import { canonicalizeReceiptBody } from "./canonical.js";
import {
  PAYLOAD_TYPE,
  base64Decode,
  base64Encode,
  buildPae,
  encodeEnvelope,
} from "./envelope.js";
import { createMemoryKeySet } from "./keyset.js";
import { createReceipt, type CreateReceiptInput } from "./receipt.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "./sign.js";
import type {
  CapabilityReceiptBody,
  KeyEntry,
  KeyState,
  ReceiptEnvelope,
  ReceiptSigner,
  VerifyFail,
} from "./types.js";
import { verifyReceipt } from "./verify.js";

async function makeSigner(
  kid = "test-key-1",
): Promise<{ signer: ReceiptSigner; publicKeyJwk: JsonWebKey }> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk };
}

function minimalInput(
  overrides: Partial<CreateReceiptInput> = {},
): CreateReceiptInput {
  const base: CreateReceiptInput = {
    runId: "run-abc",
    model: { requested: "gpt-4o", observed: null },
    route: {
      providerId: "openai",
      capabilityId: "openai/gpt-4o",
      attemptNumber: 1,
    },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  };
  return { ...base, ...overrides };
}

function entryWith(
  kid: string,
  publicKeyJwk: JsonWebKey,
  state: KeyState,
): KeyEntry {
  return { kid, publicKeyJwk, state };
}

describe("verify.ts — happy path", () => {
  it("returns ok=true with keyState='active' for a freshly-signed receipt", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.version).toBe("lattice-receipt/v1");
      expect(result.keyState).toBe("active");
      expect(result.body.kid).toBe("k1");
    }
  });

  it("surfaces keyState='retired' on the success path", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([
      entryWith("k1", publicKeyJwk, "retired"),
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.keyState).toBe("retired");
    }
  });
});

describe("verify.ts — error kinds", () => {
  it("returns key-revoked when the kid is marked revoked", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([
      entryWith("k1", publicKeyJwk, "revoked"),
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("key-revoked");
    }
  });

  it("returns key-not-found when the kid is absent from the keyset", async () => {
    const { signer } = await makeSigner("k1");
    const other = await makeSigner("k2");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([
      entryWith("k2", other.publicKeyJwk, "active"),
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("key-not-found");
    }
  });

  it("returns signature-invalid (or canonicalization-mismatch) when the signed body is tampered", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);

    // Decode payload, mutate body.runId, re-canonicalize, re-base64.
    const originalBytes = base64Decode(env.payload);
    const body = JSON.parse(
      new TextDecoder().decode(originalBytes),
    ) as CapabilityReceiptBody;
    const tamperedBody: CapabilityReceiptBody = {
      ...body,
      runId: "tampered-run-id",
    };
    const tamperedBytes = canonicalizeReceiptBody(tamperedBody);
    const tamperedEnv: ReceiptEnvelope = {
      ...env,
      payload: base64Encode(tamperedBytes),
    };

    const result = await verifyReceipt(tamperedEnv, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The original signature was computed over the original PAE; the
      // tampered envelope rebuilds PAE over the tampered payload — signature
      // fails to verify. canonicalization-mismatch is also acceptable.
      expect(
        result.error.kind === "signature-invalid" ||
          result.error.kind === "canonicalization-mismatch",
      ).toBe(true);
    }
  });

  it("returns signature-invalid when the signature bytes are mutated", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);

    // Mutate one byte of the signature.
    const sigBytes = base64Decode(env.signatures[0]!.sig);
    sigBytes[0] = (sigBytes[0]! ^ 0x01) & 0xff;
    const tamperedEnv: ReceiptEnvelope = {
      ...env,
      signatures: [{ keyid: env.signatures[0]!.keyid, sig: base64Encode(sigBytes) }],
    };

    const result = await verifyReceipt(tamperedEnv, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("signature-invalid");
    }
  });

  it("returns envelope-malformed when payloadType is wrong", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);
    const bad = {
      ...env,
      payloadType: "application/json",
    } as unknown as ReceiptEnvelope;
    const result = await verifyReceipt(bad, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("envelope-malformed");
    }
  });

  it("returns envelope-malformed when signatures[] is empty", async () => {
    const { publicKeyJwk } = await makeSigner("k1");
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);
    const env: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload: "e30=",
      signatures: [],
    };
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("envelope-malformed");
    }
  });

  it("returns envelope-malformed when the payload decodes to non-JSON", async () => {
    const { publicKeyJwk } = await makeSigner("k1");
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);
    const env: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload: base64Encode(new TextEncoder().encode("not json")),
      signatures: [{ keyid: "k1", sig: base64Encode(new Uint8Array(64)) }],
    };
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const fail = result as VerifyFail;
      expect(fail.error.kind).toBe("envelope-malformed");
      expect(fail.error.message.toLowerCase()).toContain("json");
    }
  });

  it("returns version-mismatch when body.version !== 'lattice-receipt/v1'", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);

    // Manually craft a v2 body — bypasses createReceipt's v1 enforcement.
    const v2Body = {
      version: "lattice-receipt/v2",
      receiptId: "00000000-0000-4000-8000-000000000000",
      runId: "run-x",
      issuedAt: "2026-05-11T00:00:00Z",
      kid: "k1",
      model: { requested: "x", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
    };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(v2Body));
    const payload = base64Encode(payloadBytes);
    const pae = buildPae(PAYLOAD_TYPE, payload);
    const sig = await signer.sign(pae);
    const env: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload,
      signatures: [{ keyid: "k1", sig: base64Encode(sig) }],
    };
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("version-mismatch");
    }
  });

  it("returns signature-invalid when body.kid disagrees with envelope keyid (defense in depth)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("actual");
    const keySet = createMemoryKeySet([
      entryWith("actual", publicKeyJwk, "active"),
    ]);

    // Hand-craft a body where body.kid = "different" but the envelope's
    // signature is over THIS canonical form, signed by the real "actual" key.
    const body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1",
      receiptId: "00000000-0000-4000-8000-000000000000",
      runId: "run-x",
      issuedAt: "2026-05-11T00:00:00Z",
      kid: "different",
      model: { requested: "x", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
    };
    const payloadBytes = canonicalizeReceiptBody(body);
    const payload = base64Encode(payloadBytes);
    const pae = buildPae(PAYLOAD_TYPE, payload);
    const sig = await signer.sign(pae);
    const env: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload,
      signatures: [{ keyid: "actual", sig: base64Encode(sig) }],
    };
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("signature-invalid");
      expect(result.error.message).toMatch(/different|actual/);
    }
  });
});

describe("verify.ts — key rotation lifecycle (RECEIPT-05)", () => {
  it("rotates a kid through active -> retired -> revoked with the right verify outcomes", async () => {
    const a = await makeSigner("k1");
    const b = await makeSigner("k2");
    const r1 = await createReceipt(minimalInput({ runId: "r1" }), a.signer);
    const r2 = await createReceipt(minimalInput({ runId: "r2" }), b.signer);

    // Both active.
    let keySet = createMemoryKeySet([
      entryWith("k1", a.publicKeyJwk, "active"),
      entryWith("k2", b.publicKeyJwk, "active"),
    ]);
    let res1 = await verifyReceipt(r1, keySet);
    let res2 = await verifyReceipt(r2, keySet);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (res1.ok) expect(res1.keyState).toBe("active");
    if (res2.ok) expect(res2.keyState).toBe("active");

    // k1 retired.
    keySet = createMemoryKeySet([
      entryWith("k1", a.publicKeyJwk, "retired"),
      entryWith("k2", b.publicKeyJwk, "active"),
    ]);
    res1 = await verifyReceipt(r1, keySet);
    res2 = await verifyReceipt(r2, keySet);
    expect(res1.ok).toBe(true);
    expect(res2.ok).toBe(true);
    if (res1.ok) expect(res1.keyState).toBe("retired");
    if (res2.ok) expect(res2.keyState).toBe("active");

    // k1 revoked.
    keySet = createMemoryKeySet([
      entryWith("k1", a.publicKeyJwk, "revoked"),
      entryWith("k2", b.publicKeyJwk, "active"),
    ]);
    res1 = await verifyReceipt(r1, keySet);
    res2 = await verifyReceipt(r2, keySet);
    expect(res1.ok).toBe(false);
    expect(res2.ok).toBe(true);
    if (!res1.ok) expect(res1.error.kind).toBe("key-revoked");
    if (res2.ok) expect(res2.keyState).toBe("active");
  });
});

describe("verify.ts — purity", () => {
  it("returns structurally-equal results across 50 verifications of the same inputs", async () => {
    const { signer, publicKeyJwk } = await makeSigner("pure");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([
      entryWith("pure", publicKeyJwk, "active"),
    ]);
    const first = await verifyReceipt(env, keySet);
    expect(first.ok).toBe(true);
    for (let i = 0; i < 50; i += 1) {
      const next = await verifyReceipt(env, keySet);
      expect(JSON.stringify(next)).toBe(JSON.stringify(first));
    }
  });
});
