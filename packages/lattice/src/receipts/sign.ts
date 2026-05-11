/**
 * WebCrypto Ed25519 wrappers + in-memory signer factory.
 *
 * 09-CONTEXT.md (UNRETROFITTABLE):
 *   - Algorithm name is the LITERAL string "Ed25519" (no params object needed
 *     for sign/verify; Node 24 subtle accepts both forms).
 *   - ReceiptSigner returns 64-byte Ed25519 signatures.
 *   - The runtime accepts a signer reference, NEVER raw private keys.
 *   - Production users plug their own signer (KMS adapter / OS keyring).
 *     createInMemorySigner is the in-process default for tests and dev.
 *
 * Reconciled in plan 09-03 to import ReceiptSigner from ./types.js (plan 09-01
 * owns the spine). `ReceiptSigner_Local` retained as a deprecated alias for
 * backward compatibility with Wave 1 sibling imports.
 */

import type { ReceiptSigner } from "./types.js";

/**
 * @deprecated Use ReceiptSigner from "./types.js". Retained as an alias
 * during the Wave 1 -> Wave 2 reconciliation.
 */
export type ReceiptSigner_Local = ReceiptSigner;

const ALG = "Ed25519" as const;

/**
 * Copy a Uint8Array into a fresh ArrayBuffer. WebCrypto's BufferSource type
 * (under exactOptionalPropertyTypes + strict TS) rejects `Uint8Array<ArrayBufferLike>`
 * because the underlying buffer could be a SharedArrayBuffer. Matches the
 * pattern used in storage/fingerprint.ts.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export async function importEd25519PrivateKey(
  jwk: JsonWebKey,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, ALG, true, ["sign"]);
}

export async function importEd25519PublicKey(
  jwk: JsonWebKey,
): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, ALG, true, ["verify"]);
}

export interface GeneratedEd25519KeyPair {
  readonly privateKeyJwk: JsonWebKey;
  readonly publicKeyJwk: JsonWebKey;
}

export async function generateEd25519KeyPairJwk(): Promise<GeneratedEd25519KeyPair> {
  const pair = (await crypto.subtle.generateKey(ALG, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const [privateKeyJwk, publicKeyJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", pair.privateKey),
    crypto.subtle.exportKey("jwk", pair.publicKey),
  ]);
  return { privateKeyJwk, publicKeyJwk };
}

export async function verifyEd25519Signature(
  publicKeyJwk: JsonWebKey,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  let key: CryptoKey;
  try {
    key = await importEd25519PublicKey(publicKeyJwk);
  } catch {
    return false;
  }
  try {
    return await crypto.subtle.verify(
      ALG,
      key,
      toArrayBuffer(signature),
      toArrayBuffer(message),
    );
  } catch {
    // Malformed signature length or other subtle error — treat as invalid.
    return false;
  }
}

export function createInMemorySigner(
  privateKeyJwk: JsonWebKey,
  options: { readonly kid: string; readonly publicKeyJwk: JsonWebKey },
): ReceiptSigner {
  // Lazily import the key on first sign() — keeps the factory synchronous
  // and avoids touching crypto.subtle during module load.
  let cachedKey: CryptoKey | undefined;
  const ensureKey = async (): Promise<CryptoKey> => {
    if (cachedKey === undefined) {
      cachedKey = await importEd25519PrivateKey(privateKeyJwk);
    }
    return cachedKey;
  };
  return {
    kid: options.kid,
    publicKeyJwk: options.publicKeyJwk,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      const key = await ensureKey();
      const sig = await crypto.subtle.sign(ALG, key, toArrayBuffer(bytes));
      return new Uint8Array(sig);
    },
  };
}
