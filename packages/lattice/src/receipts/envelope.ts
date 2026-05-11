/**
 * DSSE-shaped envelope encoder/decoder + Pre-Authentication Encoding (PAE).
 *
 * This module is the single source of truth for:
 *   - PAYLOAD_TYPE constant (the receipt media type)
 *   - base64 (standard, NOT base64url) encoding helpers
 *   - DSSE v1.0 PAE construction: signatures MUST be computed over the bytes
 *     returned by buildPae(...), never over raw canonical JSON bytes.
 *
 * Reference: https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md
 *
 * NOTE (parallel execution with plan 09-01): types.ts is owned by plan 09-01
 * (Wave 1). To avoid file conflicts in Wave 1, this module defines local
 * structural types with a `_Local` suffix. Plan 09-03 (Wave 2) will reconcile
 * to import from ./types.js once both Wave 1 plans have merged.
 */

// TODO(09-03): Replace `_Local` types with imports from "./types.js" after
// Wave 1 merges (plan 09-01 lands the canonical type definitions).
export interface ReceiptSignature_Local {
  readonly keyid: string;
  readonly sig: string; // base64
}

export interface ReceiptEnvelope_Local {
  readonly payloadType: "application/vnd.lattice.receipt+json";
  readonly payload: string; // base64(canonical_json_bytes)
  readonly signatures: readonly ReceiptSignature_Local[];
}

export const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;

const textEncoder = new TextEncoder();

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function base64Decode(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

/**
 * DSSE v1.0 Pre-Authentication Encoding.
 *
 * Reference: https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md
 *
 * PAE = UTF-8("DSSEv1 " + len(payloadType) + " " + payloadType
 *           + " " + len(payload) + " " + payload)
 *
 * `payload` here is the BASE64-encoded string per DSSE v1.0 spec (NOT raw
 * canonical bytes). Both signing and verification MUST construct PAE the
 * same way; this module is the single source of truth.
 *
 * ASCII length is decimal (no zero-padding). e.g. length 1000 → "1000".
 */
export function buildPae(
  payloadType: string,
  payloadBase64: string,
): Uint8Array {
  const ascii =
    "DSSEv1 " +
    payloadType.length.toString() +
    " " +
    payloadType +
    " " +
    payloadBase64.length.toString() +
    " " +
    payloadBase64;
  return textEncoder.encode(ascii);
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
): ReceiptEnvelope_Local {
  const payload = base64Encode(input.payloadBytes);
  const signatures: ReceiptSignature_Local[] = input.signatures.map(
    (entry) => ({
      keyid: entry.keyid,
      sig: base64Encode(entry.sig),
    }),
  );
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
  envelope: ReceiptEnvelope_Local,
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
