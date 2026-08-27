/**
 * DSSE-shaped envelope encoder/decoder + Pre-Authentication Encoding (PAE).
 *
 * This module is the single source of truth for:
 *   - PAYLOAD_TYPE constant (the receipt media type)
 *   - base64 (standard, NOT base64url) encoding helpers
 *   - DSSE v1.0 PAE construction over raw payload bytes
 *
 * Reference: https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md
 *
 * Canonical receipt types live in ./types.js. `_Local` aliases are retained
 * as deprecated exports for backward compatibility.
 */

import type { ReceiptEnvelope, ReceiptSignature } from "./types.js";

/**
 * @deprecated Use ReceiptSignature from "./types.js". Retained as an alias
 * for backward compatibility.
 */
export type ReceiptSignature_Local = ReceiptSignature;

/**
 * @deprecated Use ReceiptEnvelope from "./types.js". Retained as an alias
 * for backward compatibility.
 */
export type ReceiptEnvelope_Local = ReceiptEnvelope;

export const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;

const textEncoder = new TextEncoder();
const canonicalBase64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64Decode(value: string): Uint8Array {
  if (!canonicalBase64Pattern.test(value)) {
    throw new Error("value is not canonical standard base64");
  }

  const decoded = new Uint8Array(Buffer.from(value, "base64"));
  if (base64Encode(decoded) !== value) {
    throw new Error("value is not canonical standard base64");
  }
  return decoded;
}

/**
 * DSSE v1.0 Pre-Authentication Encoding.
 *
 * Reference: https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md
 *
 * PAE = "DSSEv1" SP LEN(payloadTypeBytes) SP payloadTypeBytes
 *                  SP LEN(payloadBytes) SP payloadBytes
 *
 * Lengths are decimal byte lengths with no zero-padding. Envelope base64 is
 * transport only and is not part of the signed PAE payload.
 */
export function buildPae(
  payloadType: string,
  payloadBytes: Uint8Array,
): Uint8Array {
  const payloadTypeBytes = textEncoder.encode(payloadType);
  const prefix = textEncoder.encode(`DSSEv1 ${payloadTypeBytes.byteLength} `);
  const separator = textEncoder.encode(` ${payloadBytes.byteLength} `);
  const result = new Uint8Array(
    prefix.byteLength +
      payloadTypeBytes.byteLength +
      separator.byteLength +
      payloadBytes.byteLength,
  );

  let offset = 0;
  for (const part of [prefix, payloadTypeBytes, separator, payloadBytes]) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export interface EncodeEnvelopeInput {
  readonly payloadBytes: Uint8Array;
  readonly signatures: readonly {
    readonly keyid: string;
    readonly sig: Uint8Array;
  }[];
}

export function encodeEnvelope(
  input: EncodeEnvelopeInput,
): ReceiptEnvelope {
  const payload = base64Encode(input.payloadBytes);
  const signatures: ReceiptSignature[] = input.signatures.map((entry) => ({
    keyid: entry.keyid,
    sig: base64Encode(entry.sig),
  }));
  return {
    payloadType: PAYLOAD_TYPE,
    payload,
    signatures,
  };
}

export interface DecodedEnvelope {
  readonly payloadType: string;
  readonly payloadBytes: Uint8Array;
  readonly signatures: readonly {
    readonly keyid: string;
    readonly sig: Uint8Array;
  }[];
}

export function decodeEnvelope(
  envelope: ReceiptEnvelope,
): DecodedEnvelope {
  if (envelope.payloadType !== PAYLOAD_TYPE) {
    throw new Error(
      `envelope payloadType mismatch: expected "${PAYLOAD_TYPE}" got "${envelope.payloadType}"`,
    );
  }
  return {
    payloadType: envelope.payloadType,
    payloadBytes: base64Decode(envelope.payload),
    signatures: envelope.signatures.map((entry) => ({
      keyid: entry.keyid,
      sig: base64Decode(entry.sig),
    })),
  };
}
