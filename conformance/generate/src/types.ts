export const VERIFY_ERROR_KINDS = [
  "envelope-malformed",
  "version-mismatch",
  "schema-version-too-low",
  "signature-profile-mismatch",
  "key-not-found",
  "key-revoked",
  "canonicalization-mismatch",
  "signature-invalid",
  "legacy-profile-rejected",
] as const;

export type VerifyErrorKind = (typeof VERIFY_ERROR_KINDS)[number];

export type ExpectedVerificationProfile = "dsse-v1" | null;
export type ExpectedSchemaResult = "valid" | "invalid";

export type AdversarialAxis =
  | "payload-base64-noncanonical"
  | "signature-base64-noncanonical"
  | "version-unknown"
  | "version-too-low"
  | "signature-profile-missing"
  | "signature-profile-unsupported"
  | "legacy-pae-on-v1.4"
  | "key-missing"
  | "key-revoked"
  | "canonicalization"
  | "signature"
  | "kid";

/** Exact envelope submitted by a harness. Invalid vectors may change payloadType. */
export interface VectorEnvelope {
  readonly payloadType: string;
  readonly payload: string;
  readonly signatures: ReadonlyArray<{
    readonly keyid: string;
    readonly sig: string;
  }>;
}

/**
 * Language-neutral shape committed under conformance/vectors/standard.
 * Expected profile and deprecation are null on failures because no profile
 * completed verification.
 */
export interface StandardConformanceVector {
  readonly WARNING: string;
  readonly corpusProfile: "standard";
  readonly schema: "spec/schema/v1.4.json";
  readonly expectedSchemaResult: ExpectedSchemaResult;
  readonly expectedVerificationProfile: ExpectedVerificationProfile;
  readonly expectedDeprecated: boolean | null;
  readonly expectedResult: "ok" | VerifyErrorKind;
  readonly adversarialAxis?: AdversarialAxis;
  readonly body: Record<string, unknown>;
  readonly canonicalBytesHex: string;
  readonly payloadBase64: string;
  readonly paeHex: string;
  readonly signatureHex: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
  readonly verifyKeyState?: "active" | "retired" | "revoked";
  readonly envelope?: VectorEnvelope;
}

export interface NamedStandardVector {
  readonly filename: string;
  readonly vector: StandardConformanceVector;
}
