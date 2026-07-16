import {
  EXAMPLE_KID,
  EXAMPLE_PUBLIC_KEY_JWK,
  WARNING_TEXT,
  base64Encode,
  buildAdversarialBase64TextPae,
  makeEnvelope,
  signBody,
  toHex,
  type SignedMaterial,
} from "./protocol.js";
import { bodyMatchesV14Schema } from "./positive.js";
import type {
  AdversarialAxis,
  StandardConformanceVector,
  VectorEnvelope,
  VerifyErrorKind,
} from "./types.js";

export const REQUIRED_ADVERSARIAL_AXES = [
  "payload-base64-noncanonical",
  "signature-base64-noncanonical",
  "version-unknown",
  "version-too-low",
  "signature-profile-missing",
  "signature-profile-unsupported",
  "legacy-pae-on-v1.4",
  "key-missing",
  "key-revoked",
  "canonicalization",
  "signature",
  "kid",
] as const satisfies readonly AdversarialAxis[];

export const STANDARD_NEGATIVE_FILENAMES = [
  "neg-01-payload-base64-noncanonical.json",
  "neg-02-signature-base64-noncanonical.json",
  "neg-03-version-unknown.json",
  "neg-04-version-too-low.json",
  "neg-05-signature-profile-missing.json",
  "neg-06-signature-profile-unsupported.json",
  "neg-07-legacy-pae-on-v1.4.json",
  "neg-08-key-missing.json",
  "neg-09-key-revoked.json",
  "neg-10-canonicalization.json",
  "neg-11-signature.json",
  "neg-12-kid.json",
] as const;

const decoder = new TextDecoder();

function baseBody(index: number): Record<string, unknown> {
  return {
    version: "lattice-receipt/v1.4",
    signatureProfile: "dsse-v1",
    receiptId: `00000000-0000-4000-a000-${String(100 + index).padStart(12, "0")}`,
    runId: `standard-negative-${String(index).padStart(2, "0")}`,
    issuedAt: `2026-07-16T00:01:${String(index).padStart(2, "0")}.000Z`,
    kid: EXAMPLE_KID,
    model: { requested: "example-model", observed: null },
    route: {
      providerId: "example-provider",
      capabilityId: "chat",
      attemptNumber: 1,
    },
    usage: { promptTokens: 1, completionTokens: 1, costUsd: "0.000001" },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: "lattice.default.v1",
    redactions: [],
  };
}

function exactEnvelope(
  material: SignedMaterial,
  options: {
    readonly payload?: string;
    readonly keyid?: string;
    readonly sig?: string;
    readonly payloadType?: string;
  } = {},
): VectorEnvelope {
  const valid = makeEnvelope(material, options.keyid ?? EXAMPLE_KID);
  return {
    payloadType: options.payloadType ?? valid.payloadType,
    payload: options.payload ?? valid.payload,
    signatures: [
      {
        keyid: options.keyid ?? EXAMPLE_KID,
        sig: options.sig ?? valid.signatures[0]!.sig,
      },
    ],
  };
}

function vector(
  body: Record<string, unknown>,
  material: SignedMaterial,
  adversarialAxis: AdversarialAxis,
  expectedResult: VerifyErrorKind,
  overrides: {
    readonly payloadBase64?: string;
    readonly signatureHex?: string;
    readonly kid?: string;
    readonly verifyKeyState?: "active" | "retired" | "revoked";
    readonly envelope?: VectorEnvelope;
  } = {},
): StandardConformanceVector {
  return {
    WARNING: WARNING_TEXT,
    corpusProfile: "standard",
    schema: "spec/schema/v1.4.json",
    expectedSchemaResult: bodyMatchesV14Schema(body) ? "valid" : "invalid",
    expectedVerificationProfile: null,
    expectedDeprecated: null,
    expectedResult,
    adversarialAxis,
    body,
    canonicalBytesHex: material.canonicalBytesHex,
    payloadBase64: overrides.payloadBase64 ?? material.payloadBase64,
    paeHex: material.paeHex,
    signatureHex: overrides.signatureHex ?? material.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: overrides.kid ?? EXAMPLE_KID,
    ...(overrides.verifyKeyState !== undefined
      ? { verifyKeyState: overrides.verifyKeyState }
      : {}),
    ...(overrides.envelope !== undefined
      ? { envelope: overrides.envelope }
      : {}),
  };
}

export async function generateNegativeVectors(): Promise<
  StandardConformanceVector[]
> {
  const payloadBody = baseBody(1);
  const payloadMaterial = await signBody(payloadBody);
  const noncanonicalPayload = `${payloadMaterial.payloadBase64}=`;
  const payloadBase64 = vector(
    payloadBody,
    payloadMaterial,
    "payload-base64-noncanonical",
    "envelope-malformed",
    {
      payloadBase64: noncanonicalPayload,
      envelope: exactEnvelope(payloadMaterial, { payload: noncanonicalPayload }),
    },
  );

  const signatureBody = baseBody(2);
  const signatureMaterial = await signBody(signatureBody);
  const noncanonicalSignature = `${base64Encode(signatureMaterial.signatureBytes)}=`;
  const signatureBase64 = vector(
    signatureBody,
    signatureMaterial,
    "signature-base64-noncanonical",
    "envelope-malformed",
    {
      envelope: exactEnvelope(signatureMaterial, {
        sig: noncanonicalSignature,
      }),
    },
  );

  const unknownVersionBody = {
    ...baseBody(3),
    version: "lattice-receipt/v2",
  };
  const unknownVersionMaterial = await signBody(unknownVersionBody);
  const unknownVersion = vector(
    unknownVersionBody,
    unknownVersionMaterial,
    "version-unknown",
    "version-mismatch",
    { envelope: exactEnvelope(unknownVersionMaterial) },
  );

  const tooLowBody = {
    ...baseBody(4),
    version: "lattice-receipt/v1",
  };
  const tooLowMaterial = await signBody(tooLowBody);
  const tooLow = vector(
    tooLowBody,
    tooLowMaterial,
    "version-too-low",
    "schema-version-too-low",
    { envelope: exactEnvelope(tooLowMaterial) },
  );

  const missingProfileBody = baseBody(5);
  delete missingProfileBody["signatureProfile"];
  const missingProfileMaterial = await signBody(missingProfileBody);
  const missingProfile = vector(
    missingProfileBody,
    missingProfileMaterial,
    "signature-profile-missing",
    "signature-profile-mismatch",
    { envelope: exactEnvelope(missingProfileMaterial) },
  );

  const unsupportedProfileBody = {
    ...baseBody(6),
    signatureProfile: "dsse-v2",
  };
  const unsupportedProfileMaterial = await signBody(unsupportedProfileBody);
  const unsupportedProfile = vector(
    unsupportedProfileBody,
    unsupportedProfileMaterial,
    "signature-profile-unsupported",
    "signature-profile-mismatch",
    { envelope: exactEnvelope(unsupportedProfileMaterial) },
  );

  const legacyPaeBody = baseBody(7);
  const legacyPaeMaterial = await signBody(
    legacyPaeBody,
    (payloadType, _payloadBytes, payloadBase64Text) =>
      buildAdversarialBase64TextPae(payloadType, payloadBase64Text),
  );
  const legacyPae = vector(
    legacyPaeBody,
    legacyPaeMaterial,
    "legacy-pae-on-v1.4",
    "signature-invalid",
    { envelope: exactEnvelope(legacyPaeMaterial) },
  );

  const missingKeyBody = baseBody(8);
  const missingKeyMaterial = await signBody(missingKeyBody);
  const missingKeyId = "unknown-standard-key";
  const missingKey = vector(
    missingKeyBody,
    missingKeyMaterial,
    "key-missing",
    "key-not-found",
    {
      kid: missingKeyId,
      envelope: exactEnvelope(missingKeyMaterial, { keyid: missingKeyId }),
    },
  );

  const revokedKeyBody = baseBody(9);
  const revokedKeyMaterial = await signBody(revokedKeyBody);
  const revokedKey = vector(
    revokedKeyBody,
    revokedKeyMaterial,
    "key-revoked",
    "key-revoked",
    {
      verifyKeyState: "revoked",
      envelope: exactEnvelope(revokedKeyMaterial),
    },
  );

  const canonicalizationBody = baseBody(10);
  const canonicalizationMaterial = await signBody(canonicalizationBody);
  const canonicalText = decoder.decode(canonicalizationMaterial.canonicalBytes);
  if (!canonicalText.endsWith("}")) {
    throw new Error("canonical receipt must end with an object delimiter");
  }
  const noncanonicalBytes = new TextEncoder().encode(
    `${canonicalText.slice(0, -1)} }`,
  );
  const noncanonicalJsonPayload = base64Encode(noncanonicalBytes);
  const canonicalization = vector(
    canonicalizationBody,
    canonicalizationMaterial,
    "canonicalization",
    "canonicalization-mismatch",
    {
      payloadBase64: noncanonicalJsonPayload,
      envelope: exactEnvelope(canonicalizationMaterial, {
        payload: noncanonicalJsonPayload,
      }),
    },
  );

  const corruptedSignatureBody = baseBody(11);
  const corruptedSignatureMaterial = await signBody(corruptedSignatureBody);
  const corruptedSignatureBytes = new Uint8Array(
    corruptedSignatureMaterial.signatureBytes,
  );
  corruptedSignatureBytes[corruptedSignatureBytes.length - 1] =
    (corruptedSignatureBytes[corruptedSignatureBytes.length - 1] ?? 0) ^ 0x01;
  const corruptedSignatureHex = toHex(corruptedSignatureBytes);
  const corruptedSignatureBase64 = base64Encode(corruptedSignatureBytes);
  const corruptedSignature = vector(
    corruptedSignatureBody,
    corruptedSignatureMaterial,
    "signature",
    "signature-invalid",
    {
      signatureHex: corruptedSignatureHex,
      envelope: exactEnvelope(corruptedSignatureMaterial, {
        sig: corruptedSignatureBase64,
      }),
    },
  );

  const kidBody = { ...baseBody(12), kid: "wrong-kid" };
  const kidMaterial = await signBody(kidBody);
  const kid = vector(kidBody, kidMaterial, "kid", "signature-invalid", {
    envelope: exactEnvelope(kidMaterial),
  });

  const vectors = [
    payloadBase64,
    signatureBase64,
    unknownVersion,
    tooLow,
    missingProfile,
    unsupportedProfile,
    legacyPae,
    missingKey,
    revokedKey,
    canonicalization,
    corruptedSignature,
    kid,
  ];

  if (vectors.length !== STANDARD_NEGATIVE_FILENAMES.length) {
    throw new Error("negative vector filename and construction counts differ");
  }
  return vectors;
}
