import canonicalize from "canonicalize";

export const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;

export const EXAMPLE_PRIVATE_KEY_JWK: JsonWebKey = {
  key_ops: ["sign"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  d: "U0lQtD0LB_4s1248jIAPfXB6_WDu6HOaaSvALETgFNg",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

export const EXAMPLE_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ["verify"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

export const EXAMPLE_KID = "spec-example-key-v0";
export const WARNING_TEXT =
  "EXAMPLE/TEST-ONLY KEY MATERIAL - DO NOT USE IN PRODUCTION. This keypair is committed for specification purposes only.";

const encoder = new TextEncoder();

export interface SignedMaterial {
  readonly canonicalBytes: Uint8Array;
  readonly canonicalBytesHex: string;
  readonly payloadBase64: string;
  readonly paeBytes: Uint8Array;
  readonly paeHex: string;
  readonly signatureBytes: Uint8Array;
  readonly signatureHex: string;
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export function base64Encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

export function canonicalizeJson(value: unknown): Uint8Array {
  const serialized = canonicalize(value);
  if (serialized === undefined) {
    throw new Error("value is not representable as RFC 8785 canonical JSON");
  }
  return encoder.encode(serialized);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(
    parts.reduce((length, part) => length + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export function buildStandardPae(
  payloadType: string,
  payloadBytes: Uint8Array,
): Uint8Array {
  const payloadTypeBytes = encoder.encode(payloadType);
  return concat([
    encoder.encode(`DSSEv1 ${payloadTypeBytes.byteLength} `),
    payloadTypeBytes,
    encoder.encode(` ${payloadBytes.byteLength} `),
    payloadBytes,
  ]);
}

/** Constructs the obsolete PAE only to create a v1.4 rejection fixture. */
export function buildAdversarialBase64TextPae(
  payloadType: string,
  payloadBase64: string,
): Uint8Array {
  const payloadTypeBytes = encoder.encode(payloadType);
  const payloadBase64Bytes = encoder.encode(payloadBase64);
  return concat([
    encoder.encode(`DSSEv1 ${payloadTypeBytes.byteLength} `),
    payloadTypeBytes,
    encoder.encode(` ${payloadBase64Bytes.byteLength} `),
    payloadBase64Bytes,
  ]);
}

export async function signPae(paeBytes: Uint8Array): Promise<Uint8Array> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    EXAMPLE_PRIVATE_KEY_JWK,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signingBuffer = new ArrayBuffer(paeBytes.byteLength);
  new Uint8Array(signingBuffer).set(paeBytes);
  const signature = await crypto.subtle.sign(
    { name: "Ed25519" },
    privateKey,
    signingBuffer,
  );
  return new Uint8Array(signature);
}

export async function signBody(
  body: Record<string, unknown>,
  paeBuilder: (
    payloadType: string,
    payloadBytes: Uint8Array,
    payloadBase64: string,
  ) => Uint8Array = (payloadType, payloadBytes) =>
    buildStandardPae(payloadType, payloadBytes),
): Promise<SignedMaterial> {
  const canonicalBytes = canonicalizeJson(body);
  const payloadBase64 = base64Encode(canonicalBytes);
  const paeBytes = paeBuilder(PAYLOAD_TYPE, canonicalBytes, payloadBase64);
  const signatureBytes = await signPae(paeBytes);
  return {
    canonicalBytes,
    canonicalBytesHex: toHex(canonicalBytes),
    payloadBase64,
    paeBytes,
    paeHex: toHex(paeBytes),
    signatureBytes,
    signatureHex: toHex(signatureBytes),
  };
}

export function makeEnvelope(
  material: SignedMaterial,
  keyid = EXAMPLE_KID,
): {
  payloadType: typeof PAYLOAD_TYPE;
  payload: string;
  signatures: Array<{ keyid: string; sig: string }>;
} {
  return {
    payloadType: PAYLOAD_TYPE,
    payload: material.payloadBase64,
    signatures: [{ keyid, sig: base64Encode(material.signatureBytes) }],
  };
}
