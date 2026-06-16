import type { ReceiptSigner } from "./types.js";

export type RemoteReceiptSignerProvider =
  | "aws-kms"
  | "gcp-kms"
  | "external-kms"
  | (string & {});

export type RemoteReceiptPayloadFormat = "dsse-pae";

export interface RemoteReceiptSignRequest {
  readonly kid: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly bytes: Uint8Array;
  readonly payloadFormat: RemoteReceiptPayloadFormat;
  readonly algorithm: "Ed25519";
  readonly provider?: RemoteReceiptSignerProvider;
  readonly keyRef?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface RemoteReceiptSignResult {
  readonly signature: Uint8Array;
}

export interface RemoteReceiptSignerOptions {
  readonly kid: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly provider?: RemoteReceiptSignerProvider;
  readonly keyRef?: string;
  readonly metadata?: Record<string, unknown>;
  sign(
    request: RemoteReceiptSignRequest,
  ): Promise<Uint8Array | RemoteReceiptSignResult>;
}

/**
 * Adapt a remote signing service to Lattice's existing ReceiptSigner contract.
 *
 * The callback receives the exact DSSE PAE bytes that createReceipt signs.
 * Cloud-specific request construction, hashing choices, credentials, retries,
 * and audit logging stay outside core.
 */
export function createRemoteReceiptSigner(
  options: RemoteReceiptSignerOptions,
): ReceiptSigner {
  return {
    kid: options.kid,
    publicKeyJwk: options.publicKeyJwk,
    async sign(bytes: Uint8Array): Promise<Uint8Array> {
      const result = await options.sign({
        kid: options.kid,
        publicKeyJwk: options.publicKeyJwk,
        bytes: copyBytes(bytes),
        payloadFormat: "dsse-pae",
        algorithm: "Ed25519",
        ...(options.provider !== undefined ? { provider: options.provider } : {}),
        ...(options.keyRef !== undefined ? { keyRef: options.keyRef } : {}),
        ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
      });
      return copyBytes(result instanceof Uint8Array ? result : result.signature);
    },
  };
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}
