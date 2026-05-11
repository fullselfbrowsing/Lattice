import * as ed from "@noble/ed25519";
import { describe, expect, it } from "vitest";

import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
  importEd25519PrivateKey,
  importEd25519PublicKey,
  verifyEd25519Signature,
} from "./sign.js";

function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return new Uint8Array(Buffer.from(b64 + pad, "base64"));
}

describe("sign.ts — generateEd25519KeyPairJwk", () => {
  it("produces extractable OKP/Ed25519 JWK pair with d on the private and x on both", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();

    expect(privateKeyJwk.kty).toBe("OKP");
    expect(privateKeyJwk.crv).toBe("Ed25519");
    expect(typeof privateKeyJwk.d).toBe("string");
    expect((privateKeyJwk.d as string).length).toBeGreaterThan(0);
    expect(typeof privateKeyJwk.x).toBe("string");
    expect((privateKeyJwk.x as string).length).toBeGreaterThan(0);

    expect(publicKeyJwk.kty).toBe("OKP");
    expect(publicKeyJwk.crv).toBe("Ed25519");
    expect(publicKeyJwk.d).toBeUndefined();
    expect(typeof publicKeyJwk.x).toBe("string");
  });
});

describe("sign.ts — importEd25519PrivateKey / importEd25519PublicKey", () => {
  it("imports the generated JWKs as sign / verify usages without error", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const priv = await importEd25519PrivateKey(privateKeyJwk);
    const pub = await importEd25519PublicKey(publicKeyJwk);
    expect(priv.type).toBe("private");
    expect(priv.usages).toContain("sign");
    expect(pub.type).toBe("public");
    expect(pub.usages).toContain("verify");
  });
});

describe("sign.ts — round-trip sign + verify", () => {
  it("verifies a valid signature", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "test-rt",
      publicKeyJwk,
    });
    const msg = crypto.getRandomValues(new Uint8Array(32));
    const sig = await signer.sign(msg);
    const ok = await verifyEd25519Signature(publicKeyJwk, msg, sig);
    expect(ok).toBe(true);
  });

  it("rejects a tampered message", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "test-tamper",
      publicKeyJwk,
    });
    const msg = crypto.getRandomValues(new Uint8Array(32));
    const sig = await signer.sign(msg);
    const tampered = new Uint8Array(msg);
    tampered[0] = (tampered[0]! ^ 0x01) & 0xff;
    const ok = await verifyEd25519Signature(publicKeyJwk, tampered, sig);
    expect(ok).toBe(false);
  });
});

describe("sign.ts — signature size", () => {
  it("signer.sign returns exactly 64 bytes (Ed25519 RFC 8032)", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "len-check",
      publicKeyJwk,
    });
    const sig = await signer.sign(new Uint8Array(16));
    expect(sig.length).toBe(64);
  });
});

describe("sign.ts — createInMemorySigner identity", () => {
  it("returns a ReceiptSigner with the configured kid and publicKeyJwk", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "test-key-1",
      publicKeyJwk,
    });
    expect(signer.kid).toBe("test-key-1");
    expect(signer.publicKeyJwk).toBe(publicKeyJwk);
  });

  it("produces signatures verifiable via verifyEd25519Signature", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "kvr",
      publicKeyJwk,
    });
    const msg = new Uint8Array(64).fill(0x7f);
    const sig = await signer.sign(msg);
    const ok = await verifyEd25519Signature(publicKeyJwk, msg, sig);
    expect(ok).toBe(true);
  });

  it("is deterministic — same message twice produces byte-equal signatures", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "det",
      publicKeyJwk,
    });
    const msg = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const sig1 = await signer.sign(msg);
    const sig2 = await signer.sign(msg);
    expect(sig1.length).toBe(sig2.length);
    for (let i = 0; i < sig1.length; i += 1) {
      expect(sig1[i]).toBe(sig2[i]);
    }
  });
});

describe("sign.ts — @noble/ed25519 parity oracle (silent regression detector)", () => {
  it("WebCrypto Ed25519 signature byte-equals @noble/ed25519 signature for the same key+message", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();

    // Extract 32-byte raw seed from JWK d field (base64url-decoded).
    const seed = base64UrlDecode(privateKeyJwk.d as string);
    expect(seed.length).toBe(32);

    const msg = new Uint8Array(64);
    for (let i = 0; i < msg.length; i += 1) {
      msg[i] = i & 0xff;
    }

    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "parity",
      publicKeyJwk,
    });
    const webcryptoSig = await signer.sign(msg);
    // @noble/ed25519@3.x async API
    const nobleSig = await ed.signAsync(msg, seed);

    expect(webcryptoSig.length).toBe(64);
    expect(nobleSig.length).toBe(64);
    for (let i = 0; i < 64; i += 1) {
      expect(webcryptoSig[i]).toBe(nobleSig[i]);
    }
  });
});

describe("sign.ts — verifyEd25519Signature failure modes", () => {
  it("returns false (does NOT throw) when signature was produced by a different key", async () => {
    const a = await generateEd25519KeyPairJwk();
    const b = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(a.privateKeyJwk, {
      kid: "A",
      publicKeyJwk: a.publicKeyJwk,
    });
    const msg = new Uint8Array(16).fill(0xaa);
    const sig = await signer.sign(msg);
    const ok = await verifyEd25519Signature(b.publicKeyJwk, msg, sig);
    expect(ok).toBe(false);
  });

  it("returns false (does NOT throw) when signature is wrong length (63 bytes)", async () => {
    const { publicKeyJwk } = await generateEd25519KeyPairJwk();
    const msg = new Uint8Array(8);
    const badSig = new Uint8Array(63);
    const ok = await verifyEd25519Signature(publicKeyJwk, msg, badSig);
    expect(ok).toBe(false);
  });
});
