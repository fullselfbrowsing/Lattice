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
  VerifyAdvisory,
  VerifyFail,
} from "./types.js";
import { receiptVerifyAdvisories, verifyReceipt } from "./verify.js";

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

async function signBody(
  body: CapabilityReceiptBody,
  signer: ReceiptSigner,
): Promise<ReceiptEnvelope> {
  const payloadBytes = canonicalizeReceiptBody(body);
  const payload = base64Encode(payloadBytes);
  const pae = buildPae(PAYLOAD_TYPE, payload);
  const sig = await signer.sign(pae);
  return {
    payloadType: PAYLOAD_TYPE,
    payload,
    signatures: [{ keyid: signer.kid, sig: base64Encode(sig) }],
  };
}

describe("verify.ts — happy path", () => {
  it("returns ok=true with keyState='active' for a freshly-signed receipt", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet);
      expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.modelClass).toBeUndefined();
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

  it("returns version-mismatch for unknown body.version literal (e.g. v2)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);

    // Manually craft a v2 body — bypasses createReceipt's v1.2 minting rule.
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
    // Uses v1.1 so the body clears the schema-version-too-low gate and
    // reaches the body.kid mismatch check at step 9 of the decision tree.
    const body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1.1",
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
    const env = await signBody(body, signer);
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

describe("verify.ts — v1.1 through v1.4 schema compatibility", () => {
  it("accepts a hand-crafted signed v1.1 receipt envelope", async () => {
    const { signer, publicKeyJwk } = await makeSigner("phase-2-verify-key");
    const keySet = createMemoryKeySet([
      entryWith("phase-2-verify-key", publicKeyJwk, "active"),
    ]);
    const body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1.1",
      receiptId: "00000000-0000-4000-8000-000000000000",
      runId: "phase-2-verify-run",
      issuedAt: "2026-05-24T00:00:00.000Z",
      kid: "phase-2-verify-key",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
      stepName: "v11-verify-test",
      stepIndex: 0,
    };
    const env = await signBody(body, signer);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.1");
      expect(result.body.stepName).toBe("v11-verify-test");
      expect(result.body.stepIndex).toBe(0);
    }
  });

  it("accepts a signed v1.2 receipt with modelClass", async () => {
    const { signer, publicKeyJwk } = await makeSigner("phase-38-verify-key");
    const body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1.2",
      receiptId: "00000000-0000-4000-8000-000000000012",
      runId: "phase-38-verify-run",
      issuedAt: "2026-06-16T00:00:00.000Z",
      kid: "phase-38-verify-key",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
      modelClass: "frontier_rlhf",
    };
    const env = await signBody(body, signer);
    const keySet = createMemoryKeySet([
      entryWith("phase-38-verify-key", publicKeyJwk, "active"),
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.2");
      expect(result.body.modelClass).toBe("frontier_rlhf");
    }
  });

  it("accepts a normally-minted v1.4 receipt with lineageMerkleRoot", async () => {
    const { signer, publicKeyJwk } = await makeSigner("phase-46-verify-key");
    const env = await createReceipt(
      minimalInput({
        runId: "phase-46-verify-run",
        lineageMerkleRoot: `sha256:${"cd".repeat(32)}`,
      }),
      signer,
    );
    const keySet = createMemoryKeySet([
      entryWith("phase-46-verify-key", publicKeyJwk, "active"),
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.lineageMerkleRoot).toBe(`sha256:${"cd".repeat(32)}`);
    }
  });

  it("emits version-mismatch when body.version is not a known version literal", async () => {
    // Construct a synthetic envelope with a payload encoding version
    // "lattice-receipt/v9". The structural check at Step 3 of the decision
    // tree fires before keyset lookup and signature verification, so the
    // version-mismatch verdict is returned regardless of signature validity.
    const fakeBody = {
      version: "lattice-receipt/v9",
      receiptId: "00000000-0000-4000-8000-000000000000",
      runId: "fake-run",
      issuedAt: "2026-05-24T00:00:00.000Z",
      kid: "fake-key",
      model: { requested: "fake", observed: null },
      route: {
        providerId: "fake",
        capabilityId: "fake/x",
        attemptNumber: 1,
      },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
    };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(fakeBody));
    const env: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload: base64Encode(payloadBytes),
      signatures: [
        { keyid: "fake-key", sig: base64Encode(new Uint8Array(64)) },
      ],
    };
    const keySet = createMemoryKeySet([]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error.kind).toBe("version-mismatch");
    }
  });
});

describe("verify.ts — schema-version-too-low downgrade defense (CRYPTO-01)", () => {
  it("rejects a receipt whose body.version field is absent", async () => {
    const { signer, publicKeyJwk } = await makeSigner("crypto-01-undef");
    const keySet = createMemoryKeySet([
      entryWith("crypto-01-undef", publicKeyJwk, "active"),
    ]);

    // Build a valid v1.2 body, then construct a sibling object with the
    // `version` field stripped. CapabilityReceiptBody.version is a required
    // literal union at compile time; the only way to model "absent version"
    // is to spread an Omit type at the value level.
    const valid: CapabilityReceiptBody = {
      version: "lattice-receipt/v1.2",
      receiptId: "00000000-0000-4000-8000-000000000000",
      runId: "downgrade-undef",
      issuedAt: "2026-06-06T00:00:00.000Z",
      kid: "crypto-01-undef",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
    };
    const { version: _ignored, ...rest } = valid;
    void _ignored;
    const stripped = rest as unknown as CapabilityReceiptBody;

    const env = await signBody(stripped, signer);

    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-too-low");
    }
  });

  it("rejects a signed v1 receipt with modelClass (downgrade attack)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("crypto-01-v1");
    const keySet = createMemoryKeySet([
      entryWith("crypto-01-v1", publicKeyJwk, "active"),
    ]);

    // Hand-craft a body with the OLD v1 literal. The body is otherwise
    // valid: it canonicalizes, the kid matches the keyset, and we sign
    // it with a real key so signature verification WOULD pass if the
    // downgrade branch were absent. This proves the branch short-circuits
    // before signature verification.
    const v1Body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1",
      receiptId: "00000000-0000-4000-8000-000000000001",
      runId: "downgrade-v1",
      issuedAt: "2026-06-06T00:00:00.000Z",
      kid: "crypto-01-v1",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
      modelClass: "local_quantized",
    };
    const env = await signBody(v1Body, signer);

    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-too-low");
    }
  });

  it("rejects a forged v1 body carrying parentReceiptCid (downgrade attack, Phase 39)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("crypto-01-v1-cid");
    const keySet = createMemoryKeySet([
      entryWith("crypto-01-v1-cid", publicKeyJwk, "active"),
    ]);

    // Hand-craft a v1 body smuggling the Phase 39 chain field. The body is
    // otherwise valid and signed with a real key matching the keyset, so
    // signature verification WOULD pass if the downgrade gate were absent.
    const v1Body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1",
      receiptId: "00000000-0000-4000-8000-000000000002",
      runId: "downgrade-v1-parent-cid",
      issuedAt: "2026-06-10T00:00:00.000Z",
      kid: "crypto-01-v1-cid",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
      parentReceiptCid: `sha256:${"cd".repeat(32)}`,
    };
    const env = await signBody(v1Body, signer);

    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-too-low");
    }
  });

  it("rejects an absent-version body carrying parentReceiptCid (Phase 39)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("crypto-01-undef-cid");
    const keySet = createMemoryKeySet([
      entryWith("crypto-01-undef-cid", publicKeyJwk, "active"),
    ]);

    const valid: CapabilityReceiptBody = {
      version: "lattice-receipt/v1.2",
      receiptId: "00000000-0000-4000-8000-000000000003",
      runId: "downgrade-undef-parent-cid",
      issuedAt: "2026-06-10T00:00:00.000Z",
      kid: "crypto-01-undef-cid",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
      parentReceiptCid: `sha256:${"ef".repeat(32)}`,
    };
    const { version: _ignored, ...rest } = valid;
    void _ignored;
    const stripped = rest as unknown as CapabilityReceiptBody;

    const env = await signBody(stripped, signer);

    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-too-low");
    }
  });

  it("rejects a forged 'lattice-receipt/v2' literal carrying parentReceiptCid with version-mismatch", async () => {
    const { signer, publicKeyJwk } = await makeSigner("crypto-01-v2-cid");
    const keySet = createMemoryKeySet([
      entryWith("crypto-01-v2-cid", publicKeyJwk, "active"),
    ]);

    const v2Body = {
      version: "lattice-receipt/v2",
      receiptId: "00000000-0000-4000-8000-000000000004",
      runId: "forged-v2-parent-cid",
      issuedAt: "2026-06-10T00:00:00.000Z",
      kid: "crypto-01-v2-cid",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
      parentReceiptCid: `sha256:${"01".repeat(32)}`,
    };
    const payloadBytes = new TextEncoder().encode(JSON.stringify(v2Body));
    const payload = base64Encode(payloadBytes);
    const pae = buildPae(PAYLOAD_TYPE, payload);
    const sig = await signer.sign(pae);
    const env: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload,
      signatures: [{ keyid: "crypto-01-v2-cid", sig: base64Encode(sig) }],
    };
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("version-mismatch");
    }
  });

  it("still verifies a previously-signed v1.1 receipt without parentReceiptCid (compatibility)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("v11-compat-cid");
    const keySet = createMemoryKeySet([
      entryWith("v11-compat-cid", publicKeyJwk, "active"),
    ]);
    const body: CapabilityReceiptBody = {
      version: "lattice-receipt/v1.1",
      receiptId: "00000000-0000-4000-8000-000000000005",
      runId: "v11-compat-run",
      issuedAt: "2026-06-10T00:00:00.000Z",
      kid: "v11-compat-cid",
      model: { requested: "test", observed: null },
      route: { providerId: "p", capabilityId: "p/x", attemptNumber: 1 },
      usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes: [],
      outputHash: null,
      redactionPolicyId: "lattice.default.v1",
      redactions: [],
    };
    const env = await signBody(body, signer);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.1");
      expect(result.body.parentReceiptCid).toBeUndefined();
    }
  });

  it("rejects post-signing tamper of parentReceiptCid (canonicalization-mismatch or signature-invalid)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("tamper-cid");
    const keySet = createMemoryKeySet([
      entryWith("tamper-cid", publicKeyJwk, "active"),
    ]);

    const env = await createReceipt(
      minimalInput({
        runId: "tamper-parent-cid",
        parentReceiptCid: `sha256:${"aa".repeat(32)}`,
      }),
      signer,
    );

    // Positive control: untampered envelope verifies.
    const ok = await verifyReceipt(env, keySet);
    expect(ok.ok).toBe(true);

    // Tamper: swap the chain link to point at a DIFFERENT parent.
    const originalBytes = base64Decode(env.payload);
    const body = JSON.parse(
      new TextDecoder().decode(originalBytes),
    ) as CapabilityReceiptBody;
    const tamperedBody: CapabilityReceiptBody = {
      ...body,
      parentReceiptCid: `sha256:${"bb".repeat(32)}`,
    };
    const tamperedBytes = canonicalizeReceiptBody(tamperedBody);
    const tamperedEnv: ReceiptEnvelope = {
      ...env,
      payload: base64Encode(tamperedBytes),
    };

    const result = await verifyReceipt(tamperedEnv, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.error.kind === "canonicalization-mismatch" ||
          result.error.kind === "signature-invalid",
      ).toBe(true);
    }
  });

  it("accepts a normally-minted v1.4 receipt (positive control regression guard)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("crypto-01-positive");
    const env = await createReceipt(
      {
        ...minimalInput(),
        runId: "downgrade-positive-control",
        stepName: "crypto-01-positive",
        stepIndex: 0,
      },
      signer,
    );
    const keySet = createMemoryKeySet([
      entryWith("crypto-01-positive", publicKeyJwk, "active"),
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.stepName).toBe("crypto-01-positive");
    }
  });
});

// ---------------------------------------------------------------------------
// Issue #21 F2/F4 — VerifyOptions: audience/nonce binding, expiry, minVersion
// ---------------------------------------------------------------------------

function bodyForVersion(
  version: CapabilityReceiptBody["version"],
  kid: string,
  extra: Partial<CapabilityReceiptBody> = {},
): CapabilityReceiptBody {
  return {
    version,
    receiptId: "00000000-0000-4000-8000-00000000abcd",
    runId: "run-options",
    issuedAt: "2026-01-01T00:00:00.000Z",
    kid,
    model: { requested: "m", observed: null },
    route: { providerId: "p", capabilityId: "c", attemptNumber: 1 },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: "lattice.default.v1",
    redactions: [],
    ...extra,
  };
}

function flipSignature(env: ReceiptEnvelope): ReceiptEnvelope {
  const first = env.signatures[0]!;
  const sig = (first.sig.startsWith("A") ? "B" : "A") + first.sig.slice(1);
  return { ...env, signatures: [{ keyid: first.keyid, sig }] };
}

describe("verify.ts — VerifyOptions audience binding (F2)", () => {
  it("accepts when expectedAudience matches body.audience", async () => {
    const { signer, publicKeyJwk } = await makeSigner("aud");
    const env = await createReceipt(minimalInput({ audience: "svc-a" }), signer);
    const keySet = createMemoryKeySet([entryWith("aud", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { expectedAudience: "svc-a" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.audience).toBe("svc-a");
  });

  it("rejects with audience-mismatch when the audiences differ", async () => {
    const { signer, publicKeyJwk } = await makeSigner("aud");
    const env = await createReceipt(minimalInput({ audience: "svc-a" }), signer);
    const keySet = createMemoryKeySet([entryWith("aud", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { expectedAudience: "svc-b" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("audience-mismatch");
      expect(result.error.message).toContain("svc-b");
    }
  });

  it("rejects when the verifier expects an audience but the receipt carries none", async () => {
    const { signer, publicKeyJwk } = await makeSigner("aud");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("aud", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { expectedAudience: "svc-a" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("audience-mismatch");
      expect(result.error.message).toContain("no audience");
    }
  });

  it("does not enforce audience when the verifier passes no expectation", async () => {
    const { signer, publicKeyJwk } = await makeSigner("aud");
    const env = await createReceipt(minimalInput({ audience: "svc-a" }), signer);
    const keySet = createMemoryKeySet([entryWith("aud", publicKeyJwk, "active")]);
    expect((await verifyReceipt(env, keySet)).ok).toBe(true);
  });

  it("treats a non-string audience as a structural shape failure (version-mismatch)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("aud");
    const forged = {
      ...bodyForVersion("lattice-receipt/v1.4", "aud"),
      audience: 42,
    } as unknown as CapabilityReceiptBody;
    const env = await signBody(forged, signer);
    const keySet = createMemoryKeySet([entryWith("aud", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("version-mismatch");
  });

  it("checks the signature before the audience so unauthenticated envelopes cannot probe expectations", async () => {
    const { signer, publicKeyJwk } = await makeSigner("aud");
    const env = flipSignature(await createReceipt(minimalInput({ audience: "svc-a" }), signer));
    const keySet = createMemoryKeySet([entryWith("aud", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { expectedAudience: "svc-b" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("signature-invalid");
  });
});

describe("verify.ts — VerifyOptions nonce binding (F2)", () => {
  it("accepts a matching nonce, rejects a mismatch, and rejects an absent nonce when one is expected", async () => {
    const { signer, publicKeyJwk } = await makeSigner("nonce");
    const keySet = createMemoryKeySet([entryWith("nonce", publicKeyJwk, "active")]);
    const withNonce = await createReceipt(minimalInput({ nonce: "n-1" }), signer);
    const withoutNonce = await createReceipt(minimalInput(), signer);

    expect((await verifyReceipt(withNonce, keySet, { expectedNonce: "n-1" })).ok).toBe(true);

    const mismatch = await verifyReceipt(withNonce, keySet, { expectedNonce: "n-2" });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.kind).toBe("nonce-mismatch");
      // Messages must never echo nonce values.
      expect(mismatch.error.message).not.toContain("n-1");
      expect(mismatch.error.message).not.toContain("n-2");
    }

    const absent = await verifyReceipt(withoutNonce, keySet, { expectedNonce: "n-1" });
    expect(absent.ok).toBe(false);
    if (!absent.ok) expect(absent.error.kind).toBe("nonce-mismatch");

    // No expectation: nonce is informational only.
    expect((await verifyReceipt(withNonce, keySet)).ok).toBe(true);
  });
});

describe("verify.ts — VerifyOptions expiry (F2)", () => {
  const issuedAt = "2026-01-01T00:00:00.000Z";
  const expiresAt = "2026-01-01T01:00:00.000Z";

  it("accepts before expiresAt and rejects after it, honoring options.now", async () => {
    const { signer, publicKeyJwk } = await makeSigner("exp");
    const env = await createReceipt(minimalInput({ issuedAt, expiresAt }), signer);
    const keySet = createMemoryKeySet([entryWith("exp", publicKeyJwk, "active")]);

    expect((await verifyReceipt(env, keySet, { now: "2026-01-01T00:30:00Z" })).ok).toBe(true);
    expect((await verifyReceipt(env, keySet, { now: new Date("2026-01-01T00:59:59Z") })).ok).toBe(true);

    const late = await verifyReceipt(env, keySet, { now: "2026-01-01T02:00:00Z" });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error.kind).toBe("receipt-expired");
  });

  it("enforces expiresAt even when the verifier passes no options", async () => {
    const { signer, publicKeyJwk } = await makeSigner("exp");
    const env = await createReceipt(minimalInput({ issuedAt, expiresAt }), signer);
    const keySet = createMemoryKeySet([entryWith("exp", publicKeyJwk, "active")]);
    // expiresAt is in the past relative to the real clock at test time.
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("receipt-expired");
  });

  it("applies maxAgeMs against issuedAt", async () => {
    const { signer, publicKeyJwk } = await makeSigner("exp");
    const env = await createReceipt(minimalInput({ issuedAt }), signer);
    const keySet = createMemoryKeySet([entryWith("exp", publicKeyJwk, "active")]);
    const now = "2026-01-01T02:00:00Z";

    const tooOld = await verifyReceipt(env, keySet, { now, maxAgeMs: 3_600_000 });
    expect(tooOld.ok).toBe(false);
    if (!tooOld.ok) expect(tooOld.error.kind).toBe("receipt-expired");

    expect((await verifyReceipt(env, keySet, { now, maxAgeMs: 10_800_000 })).ok).toBe(true);
  });

  it("fails closed on an unparseable expiresAt", async () => {
    const { signer, publicKeyJwk } = await makeSigner("exp");
    const env = await signBody(
      bodyForVersion("lattice-receipt/v1.4", "exp", { expiresAt: "not-a-date" }),
      signer,
    );
    const keySet = createMemoryKeySet([entryWith("exp", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { now: "2026-01-01T00:00:00Z" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("receipt-expired");
  });

  it("throws a TypeError for an unparseable options.now (caller error, not a verdict)", async () => {
    const { signer, publicKeyJwk } = await makeSigner("exp");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("exp", publicKeyJwk, "active")]);
    await expect(verifyReceipt(env, keySet, { now: "garbage" })).rejects.toThrow(TypeError);
  });

  describe("timestamps must carry an explicit UTC offset (review follow-up round 5)", () => {
    // Date.parse reads "2999-01-01T00:00:00" as local time, so the same signed
    // receipt would expire at different instants in different timezones. The
    // verifier accepts only RFC 3339 instants with a Z or numeric offset.
    it.each([
      ["offset-less date-time", "2999-01-01T00:00:00"],
      ["non-ISO text", "Jan 1 2999"],
      ["date only", "2999-01-01"],
      ["missing seconds", "2999-01-01T00:00Z"],
      ["impossible month with an offset", "2999-13-01T00:00:00Z"],
    ])("rejects a far-future expiresAt that is %s, instead of reading it as local time", async (_label, expiresAt) => {
      const { signer, publicKeyJwk } = await makeSigner("tz");
      const env = await signBody(bodyForVersion("lattice-receipt/v1.4", "tz", { expiresAt }), signer);
      const keySet = createMemoryKeySet([entryWith("tz", publicKeyJwk, "active")]);
      const result = await verifyReceipt(env, keySet, { now: "2026-01-01T00:00:00Z" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("receipt-expired");
        expect(result.error.message).toContain("UTC offset");
      }
    });

    it("rejects an impossible calendar date instead of rolling it forward (review follow-up round 6)", async () => {
      // Date.parse turns 2026-02-31 into 2026-03-03, so a lenient verifier
      // would still accept this receipt on March 1. Ours fails closed.
      const { signer, publicKeyJwk } = await makeSigner("tz");
      const env = await signBody(
        bodyForVersion("lattice-receipt/v1.4", "tz", { expiresAt: "2026-02-31T00:00:00Z" }),
        signer,
      );
      const keySet = createMemoryKeySet([entryWith("tz", publicKeyJwk, "active")]);
      const result = await verifyReceipt(env, keySet, { now: "2026-03-01T00:00:00Z" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("receipt-expired");
        expect(result.error.message).toContain("calendar-valid");
      }
      await expect(verifyReceipt(env, keySet, { now: "2026-10-18T24:00:00Z" })).rejects.toThrow(TypeError);
    });

    it("accepts a numeric offset and compares it as an instant", async () => {
      const { signer, publicKeyJwk } = await makeSigner("tz");
      // 2026-01-01T02:00:00+05:30 is 2025-12-31T20:30:00Z.
      const env = await signBody(
        bodyForVersion("lattice-receipt/v1.4", "tz", { expiresAt: "2026-01-01T02:00:00+05:30" }),
        signer,
      );
      const keySet = createMemoryKeySet([entryWith("tz", publicKeyJwk, "active")]);
      expect((await verifyReceipt(env, keySet, { now: "2025-12-31T20:29:59Z" })).ok).toBe(true);
      const late = await verifyReceipt(env, keySet, { now: "2025-12-31T20:30:01Z" });
      expect(late.ok).toBe(false);
      if (!late.ok) expect(late.error.kind).toBe("receipt-expired");
    });

    it("rejects an offset-less issuedAt under maxAgeMs instead of reading it as local time", async () => {
      const { signer, publicKeyJwk } = await makeSigner("tz");
      const env = await signBody(
        bodyForVersion("lattice-receipt/v1.4", "tz", { issuedAt: "2026-01-01T00:00:00" }),
        signer,
      );
      const keySet = createMemoryKeySet([entryWith("tz", publicKeyJwk, "active")]);
      // Without maxAgeMs the issuedAt shape is not consulted, so the signature still verifies.
      expect((await verifyReceipt(env, keySet, { now: "2026-01-01T00:00:01Z" })).ok).toBe(true);
      const aged = await verifyReceipt(env, keySet, { now: "2026-01-01T00:00:01Z", maxAgeMs: 86_400_000 });
      expect(aged.ok).toBe(false);
      if (!aged.ok) expect(aged.error.kind).toBe("receipt-expired");
    });

    it("throws a TypeError for an offset-less options.now string but accepts a Date", async () => {
      const { signer, publicKeyJwk } = await makeSigner("tz");
      const env = await createReceipt(minimalInput(), signer);
      const keySet = createMemoryKeySet([entryWith("tz", publicKeyJwk, "active")]);
      await expect(verifyReceipt(env, keySet, { now: "2026-01-01T00:00:00" })).rejects.toThrow(TypeError);
      await expect(verifyReceipt(env, keySet, { now: new Date("2026-01-01T00:00:00Z") })).resolves.toMatchObject({ ok: true });
      await expect(verifyReceipt(env, keySet, { now: new Date(Number.NaN) })).rejects.toThrow(TypeError);
    });
  });
});

describe("verify.ts — VerifyOptions minVersion (F4)", () => {
  it("rejects a hand-signed v1.3 receipt when the verifier demands v1.4", async () => {
    const { signer, publicKeyJwk } = await makeSigner("min");
    const env = await signBody(bodyForVersion("lattice-receipt/v1.3", "min"), signer);
    const keySet = createMemoryKeySet([entryWith("min", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { minVersion: "lattice-receipt/v1.4" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("schema-version-too-low");
      expect(result.error.message).toContain("lattice-receipt/v1.4");
    }
  });

  it("accepts receipts at or above the requested floor", async () => {
    const { signer, publicKeyJwk } = await makeSigner("min");
    const keySet = createMemoryKeySet([entryWith("min", publicKeyJwk, "active")]);
    const minted = await createReceipt(minimalInput(), signer);
    expect((await verifyReceipt(minted, keySet, { minVersion: "lattice-receipt/v1.4" })).ok).toBe(true);
    const v12 = await signBody(bodyForVersion("lattice-receipt/v1.2", "min"), signer);
    expect((await verifyReceipt(v12, keySet, { minVersion: "lattice-receipt/v1.2" })).ok).toBe(true);
  });

  it("clamps minVersion to the CRYPTO-01 floor: v1 bodies are rejected even when minVersion is v1", async () => {
    const { signer, publicKeyJwk } = await makeSigner("min");
    const env = await signBody(bodyForVersion("lattice-receipt/v1", "min"), signer);
    const keySet = createMemoryKeySet([entryWith("min", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet, { minVersion: "lattice-receipt/v1" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("schema-version-too-low");
  });

  it("throws a TypeError for an unknown minVersion literal instead of accepting everything", async () => {
    const { signer, publicKeyJwk } = await makeSigner("min");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("min", publicKeyJwk, "active")]);
    await expect(
      verifyReceipt(env, keySet, {
        minVersion: "lattice-receipt/v9" as CapabilityReceiptBody["version"],
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe("verify.ts — canonical base64 payload (review follow-up)", () => {
  // Node's base64 decoder ignores whitespace and accepts the base64url
  // alphabet, so before this check a payload with stray characters decoded
  // to the same bytes, re-encoded to the canonical string for the PAE, and
  // verified; receiptCid (strict atob) then threw on the same envelope.
  it("rejects a payload with embedded whitespace as envelope-malformed", async () => {
    const { signer, publicKeyJwk } = await makeSigner("b64");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("b64", publicKeyJwk, "active")]);
    const half = Math.floor(env.payload.length / 2);
    const spaced: ReceiptEnvelope = {
      ...env,
      payload: `${env.payload.slice(0, half)}\n${env.payload.slice(half)}`,
    };
    const result = await verifyReceipt(spaced, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("envelope-malformed");
      expect(result.error.message).toContain("canonical base64");
    }
  });

  it("rejects a base64url-alphabet payload as envelope-malformed", async () => {
    const { signer, publicKeyJwk } = await makeSigner("b64");
    // Base64 of ASCII JSON only produces "+" or "/" from the low six bits of
    // every third byte, and only for bytes such as "?" (0x3F) and "~" (0x7E).
    // A runId made of those characters guarantees the canonical payload
    // contains a character that base64url spells differently.
    const env = await createReceipt(minimalInput({ runId: "run-??????~~~~~~" }), signer);
    expect(/[+/]/.test(env.payload)).toBe(true);
    const urlSafe: ReceiptEnvelope = {
      ...env,
      payload: env.payload.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    };
    const keySet = createMemoryKeySet([entryWith("b64", publicKeyJwk, "active")]);
    const result = await verifyReceipt(urlSafe, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("envelope-malformed");
    // The untouched envelope still verifies.
    expect((await verifyReceipt(env, keySet)).ok).toBe(true);
  });
});

describe("verify.ts — maxAgeMs validation (review follow-up)", () => {
  it.each([Number.NaN, -1, Number.POSITIVE_INFINITY])(
    "throws a TypeError for maxAgeMs=%s instead of silently passing",
    async (maxAgeMs) => {
      const { signer, publicKeyJwk } = await makeSigner("age");
      const env = await createReceipt(minimalInput({ issuedAt: "2020-01-01T00:00:00.000Z" }), signer);
      const keySet = createMemoryKeySet([entryWith("age", publicKeyJwk, "active")]);
      await expect(verifyReceipt(env, keySet, { maxAgeMs })).rejects.toThrow(TypeError);
    },
  );

  it("accepts maxAgeMs=0 and treats it as 'issued exactly now'", async () => {
    const { signer, publicKeyJwk } = await makeSigner("age");
    const issuedAt = "2026-01-01T00:00:00.000Z";
    const env = await createReceipt(minimalInput({ issuedAt }), signer);
    const keySet = createMemoryKeySet([entryWith("age", publicKeyJwk, "active")]);
    expect((await verifyReceipt(env, keySet, { now: issuedAt, maxAgeMs: 0 })).ok).toBe(true);
    const later = await verifyReceipt(env, keySet, { now: "2026-01-01T00:00:00.001Z", maxAgeMs: 0 });
    expect(later.ok).toBe(false);
    if (!later.ok) expect(later.error.kind).toBe("receipt-expired");
  });
});

describe("verify.ts — chain-closure field shape", () => {
  it.each([
    ["chainClosure", "merkle-v2"],
    ["chainClosure", true],
    ["chainMemberCids", "sha256:abc"],
    ["chainMemberCids", { a: 1 }],
    ["chainMemberCids", null],
    ["chainMemberCids", [1, 2]],
  ])("rejects a signed body whose %s is %j as version-mismatch", async (field, value) => {
    const { signer, publicKeyJwk } = await makeSigner("shape");
    const keySet = createMemoryKeySet([entryWith("shape", publicKeyJwk, "active")]);
    const body = { ...bodyForVersion("lattice-receipt/v1.4", "shape"), [field]: value };
    const env = await signBody(body as unknown as CapabilityReceiptBody, signer);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("version-mismatch");
      expect(result.error.message).toContain(field);
    }
  });

  it("accepts the well-formed fields", async () => {
    const { signer, publicKeyJwk } = await makeSigner("shape");
    const keySet = createMemoryKeySet([entryWith("shape", publicKeyJwk, "active")]);
    const env = await signBody(
      bodyForVersion("lattice-receipt/v1.4", "shape", {
        chainClosure: "member-cids",
        chainMemberCids: [`sha256:${"a".repeat(64)}`],
      }),
      signer,
    );
    expect((await verifyReceipt(env, keySet)).ok).toBe(true);
  });
});

describe("verify.ts — receiptVerifyAdvisories", () => {
  const codes = (notes: readonly VerifyAdvisory[]): string[] =>
    notes.map((note) => `${note.severity}:${note.code}`).sort();

  it("reports absent bindings as info on an unbound receipt", () => {
    const body = bodyForVersion("lattice-receipt/v1.4", "adv");
    expect(codes(receiptVerifyAdvisories(body))).toEqual([
      "info:audience-absent",
      "info:expiry-absent",
      "info:nonce-absent",
    ]);
  });

  it("warns when the receipt is bound to an audience or nonce the verifier did not check", () => {
    const body = bodyForVersion("lattice-receipt/v1.4", "adv", {
      audience: "bank-A",
      nonce: "nonce-secret-123",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    const notes = receiptVerifyAdvisories(body, {});
    expect(codes(notes)).toEqual(["warn:audience-unchecked", "warn:nonce-unchecked"]);
    expect(notes.find((note) => note.code === "audience-unchecked")?.message).toContain("bank-A");
    for (const note of notes) {
      expect(note.message).not.toContain("nonce-secret-123");
    }
  });

  it("reports nothing once the bindings are checked and the receipt expires", () => {
    const body = bodyForVersion("lattice-receipt/v1.4", "adv", {
      audience: "bank-A",
      nonce: "n",
      expiresAt: "2099-01-01T00:00:00Z",
    });
    expect(receiptVerifyAdvisories(body, { expectedAudience: "bank-A", expectedNonce: "n" })).toEqual([]);
  });

  it("treats maxAgeMs as an expiry", () => {
    const body = bodyForVersion("lattice-receipt/v1.4", "adv");
    expect(codes(receiptVerifyAdvisories(body, { maxAgeMs: 60_000 }))).not.toContain(
      "info:expiry-absent",
    );
  });

  it("judges version-below-current on the effective floor, not on whether minVersion was passed", () => {
    const body = bodyForVersion("lattice-receipt/v1.2", "adv");
    const note = (minVersion?: CapabilityReceiptBody["version"]) =>
      receiptVerifyAdvisories(body, minVersion !== undefined ? { minVersion } : {}).find(
        (entry) => entry.code === "version-below-current",
      );
    expect(note()?.severity).toBe("info");
    expect(note()?.message).toContain("effective floor lattice-receipt/v1.1");
    // minVersion at or below the CRYPTO-01 floor does not move it.
    expect(note("lattice-receipt/v1.1")?.message).toContain("effective floor lattice-receipt/v1.1");
    expect(note("lattice-receipt/v1")?.message).toContain("effective floor lattice-receipt/v1.1");
    expect(note("lattice-receipt/v1.2")?.message).toContain("effective floor lattice-receipt/v1.2");
    // A floor above the receipt would have rejected it, so there is nothing to note.
    expect(note("lattice-receipt/v1.3")).toBeUndefined();
    expect(
      receiptVerifyAdvisories(bodyForVersion("lattice-receipt/v1.4", "adv")).map((entry) => entry.code),
    ).not.toContain("version-below-current");
  });

  it("matches what verifyReceipt accepted for a bound receipt", async () => {
    const { signer, publicKeyJwk } = await makeSigner("adv");
    const keySet = createMemoryKeySet([entryWith("adv", publicKeyJwk, "active")]);
    const env = await createReceipt(minimalInput({ audience: "bank-A" }), signer);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(codes(receiptVerifyAdvisories(result.body))).toEqual([
        "info:expiry-absent",
        "info:nonce-absent",
        "warn:audience-unchecked",
      ]);
    }
  });
});
