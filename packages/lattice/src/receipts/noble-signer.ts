/**
 * @noble/ed25519-backed ReceiptSigner factory for Node 20+ signing paths.
 *
 * createNobleEd25519Signer is a drop-in replacement for createInMemorySigner.
 * It uses @noble/ed25519 (pure JS, stable WebCrypto SHA-512 internally) for
 * signing, which avoids the experimental Ed25519 warning in Node 20 when
 * crypto.subtle.sign uses the "Ed25519" algorithm.
 *
 * The factory is synchronous. The 32-byte seed is decoded from the JWK `d`
 * field lazily on the first sign() call (same pattern as createInMemorySigner).
 *
 * Out-of-scope: verifyReceipt and generateEd25519KeyPairJwk still use
 * WebCrypto Ed25519; only the signing path is swapped here.
 */

import * as ed from "@noble/ed25519";
import type { ReceiptSigner } from "./types.js";

function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return new Uint8Array(Buffer.from(b64 + pad, "base64"));
}

export function createNobleEd25519Signer(
  privateKeyJwk: JsonWebKey,
  options: { readonly kid: string; readonly publicKeyJwk: JsonWebKey },
): ReceiptSigner {
  // Validate before touching the d field.
  if (privateKeyJwk.kty !== "OKP") {
    throw new Error(
      `createNobleEd25519Signer: invalid key, expected kty=OKP, got ${String(privateKeyJwk.kty)}`,
    );
  }
  if (privateKeyJwk.crv !== "Ed25519") {
    throw new Error(
      `createNobleEd25519Signer: invalid key, expected crv=Ed25519, got ${String(privateKeyJwk.crv)}`,
    );
  }
  if (typeof privateKeyJwk.d !== "string") {
    throw new Error(
      "createNobleEd25519Signer: invalid key, missing or non-string d field (private key seed required)",
    );
  }

  // Lazily decode the 32-byte seed on first sign() call. Keeps the factory
  // synchronous and avoids touching Buffer during module load.
  let cachedSeed: Uint8Array | undefined;
  const ensureSeed = (): Uint8Array => {
    if (cachedSeed === undefined) {
      // privateKeyJwk.d type-narrowed to string by the guard above.
      cachedSeed = base64UrlDecode(privateKeyJwk.d as string);
    }
    return cachedSeed;
  };

  return {
    kid: options.kid,
    publicKeyJwk: options.publicKeyJwk,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      const seed = ensureSeed();
      return new Uint8Array(await ed.signAsync(bytes, seed));
    },
  };
}
