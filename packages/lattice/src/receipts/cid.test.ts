import { describe, expect, it } from "vitest";

import { createMemoryKeySet } from "./keyset.js";
import { createInMemorySigner, generateEd25519KeyPairJwk } from "./sign.js";
import type { ReceiptSigner } from "./types.js";
import { verifyReceipt } from "./verify.js";

import { createReceipt, type CreateReceiptInput } from "./receipt.js";

import { receiptCid } from "./cid.js";

// Helper: build a fresh ephemeral Ed25519 signer (mirrors receipt.test.ts).
async function makeSigner(
  kid = "cid-test-key",
): Promise<{ signer: ReceiptSigner; publicKeyJwk: JsonWebKey }> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk };
}

function minimalInput(
  overrides: Partial<CreateReceiptInput> = {},
): CreateReceiptInput {
  const base: CreateReceiptInput = {
    runId: "run-cid",
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

describe("cid.ts — receiptCid format", () => {
  it("returns a string matching /^sha256:[0-9a-f]{64}$/", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const cid = await receiptCid(env);
    expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("cid.ts — determinism", () => {
  it("calling twice on the same envelope returns identical strings", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const cid1 = await receiptCid(env);
    const cid2 = await receiptCid(env);
    expect(cid1).toBe(cid2);
  });
});

describe("cid.ts — distinctness", () => {
  it("two envelopes minted from different bodies produce different CIDs", async () => {
    const { signer } = await makeSigner();
    const envA = await createReceipt(
      minimalInput({
        receiptId: "11111111-1111-4111-8111-111111111111",
        issuedAt: "2026-06-10T00:00:00Z",
        runId: "run-a",
      }),
      signer,
    );
    const envB = await createReceipt(
      minimalInput({
        receiptId: "22222222-2222-4222-8222-222222222222",
        issuedAt: "2026-06-10T00:00:00Z",
        runId: "run-b",
      }),
      signer,
    );
    const cidA = await receiptCid(envA);
    const cidB = await receiptCid(envB);
    expect(cidA).not.toBe(cidB);
  });
});

describe("cid.ts — re-derivation cross-check", () => {
  it("equals an independently computed sha256 of the decoded payload bytes", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);

    // Independent re-derivation: decode base64 payload Buffer-free, digest
    // with WebCrypto, hex-encode with padStart join.
    const bytes = Uint8Array.from(atob(env.payload), (c) => c.charCodeAt(0));
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
    const hex = Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const expected = `sha256:${hex}`;

    expect(await receiptCid(env)).toBe(expected);
  });
});

describe("cid.ts — no key material required", () => {
  it("derives the CID from a verified envelope without any KeySet/signer", async () => {
    const { signer, publicKeyJwk } = await makeSigner("no-key-cid");
    const env = await createReceipt(minimalInput(), signer);

    // Prove the envelope is genuine first (verification path).
    const keySet = createMemoryKeySet([
      { kid: "no-key-cid", publicKeyJwk, state: "active" },
    ]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);

    // receiptCid takes ONLY the envelope — no KeySet, no signer, no JWK.
    const cid = await receiptCid(env);
    expect(cid).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
