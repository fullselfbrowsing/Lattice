import { describe, expect, it } from "vitest";

import { createNobleEd25519Signer } from "./noble-signer.js";
import { createMemoryKeySet } from "./keyset.js";
import { createReceipt, type CreateReceiptInput } from "./receipt.js";
import { createInMemorySigner, generateEd25519KeyPairJwk } from "./sign.js";
import type { ReceiptSigner } from "./types.js";
import { verifyReceipt } from "./verify.js";

function minimalInput(): CreateReceiptInput {
  return {
    runId: "noble-signer-run",
    model: { requested: "external-model", observed: null },
    route: {
      providerId: "external",
      capabilityId: "external-model",
      attemptNumber: 1,
    },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  };
}

describe("createNobleEd25519Signer — identity", () => {
  it("returns a ReceiptSigner with the configured kid and publicKeyJwk (reference equality)", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer: ReceiptSigner = createNobleEd25519Signer(privateKeyJwk, {
      kid: "noble-k1",
      publicKeyJwk,
    });
    expect(signer.kid).toBe("noble-k1");
    expect(signer.publicKeyJwk).toBe(publicKeyJwk);
  });
});

describe("createNobleEd25519Signer — signature size", () => {
  it("sign returns exactly 64 bytes (Ed25519 RFC 8032)", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createNobleEd25519Signer(privateKeyJwk, {
      kid: "noble-size",
      publicKeyJwk,
    });
    const sig = await signer.sign(new Uint8Array(32));
    expect(sig.length).toBe(64);
  });
});

describe("createNobleEd25519Signer — interop with verifyReceipt", () => {
  it("a receipt signed with noble signer passes verifyReceipt against a matching keyset", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createNobleEd25519Signer(privateKeyJwk, {
      kid: "noble-verify",
      publicKeyJwk,
    });
    const envelope = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([
      { kid: "noble-verify", publicKeyJwk, state: "active" },
    ]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
  });
});

describe("createNobleEd25519Signer — cross-impl byte parity", () => {
  it("noble signer signature byte-equals createInMemorySigner signature for the same key+message", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const nobleSigner = createNobleEd25519Signer(privateKeyJwk, {
      kid: "noble-parity",
      publicKeyJwk,
    });
    const webCryptoSigner = createInMemorySigner(privateKeyJwk, {
      kid: "webcrypto-parity",
      publicKeyJwk,
    });

    const msg = new Uint8Array(64);
    for (let i = 0; i < msg.length; i += 1) {
      msg[i] = i & 0xff;
    }

    const nobleSig = await nobleSigner.sign(msg);
    const webCryptoSig = await webCryptoSigner.sign(msg);

    expect(nobleSig.length).toBe(64);
    expect(webCryptoSig.length).toBe(64);
    for (let i = 0; i < 64; i += 1) {
      expect(nobleSig[i]).toBe(webCryptoSig[i]);
    }
  });
});

describe("createNobleEd25519Signer — generateEd25519KeyPairJwk compat", () => {
  it("works with keys produced by generateEd25519KeyPairJwk", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createNobleEd25519Signer(privateKeyJwk, {
      kid: "noble-keygen",
      publicKeyJwk,
    });
    const sig = await signer.sign(new Uint8Array([1, 2, 3, 4]));
    expect(sig.length).toBe(64);
    expect(signer.kid).toBe("noble-keygen");
  });
});

describe("createNobleEd25519Signer — rejects bad JWK kty", () => {
  it("throws Error when kty is not OKP", () => {
    expect(() =>
      createNobleEd25519Signer({ kty: "RSA" } as unknown as JsonWebKey, {
        kid: "k",
        publicKeyJwk: {},
      }),
    ).toThrow("createNobleEd25519Signer: invalid key");
  });
});

describe("createNobleEd25519Signer — rejects bad JWK crv", () => {
  it("throws Error when crv is not Ed25519", () => {
    expect(() =>
      createNobleEd25519Signer(
        { kty: "OKP", crv: "X25519" } as unknown as JsonWebKey,
        { kid: "k", publicKeyJwk: {} },
      ),
    ).toThrow("createNobleEd25519Signer: invalid key");
  });
});

describe("createNobleEd25519Signer — rejects missing d", () => {
  it("throws Error when d field is absent", () => {
    expect(() =>
      createNobleEd25519Signer(
        { kty: "OKP", crv: "Ed25519" } as unknown as JsonWebKey,
        { kid: "k", publicKeyJwk: {} },
      ),
    ).toThrow("createNobleEd25519Signer: invalid key");
  });
});
