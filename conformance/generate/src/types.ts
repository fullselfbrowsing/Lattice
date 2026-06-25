/**
 * conformance/generate/src/types.ts
 *
 * ConformanceVector — the VEC-01 committed vector shape.
 *
 * Every committed vector file (positive and negative) is one JSON object
 * conforming to this interface. The TypeScript verification harness (Phase 52)
 * and the Python harnesses (Phases 53–55) consume this exact shape.
 *
 * Field notes:
 *
 *   `envelope` is set ONLY for envelope-level negative vectors (NEG-01 /
 *   `envelope-malformed`) where the harness cannot reconstruct the malformed
 *   input from the other fields alone. For all positive vectors and for
 *   body-level negatives (version-mismatch, schema-version-too-low,
 *   key-not-found, key-revoked, canonicalization-mismatch, signature-invalid),
 *   this field is ABSENT — the harness reconstructs the envelope from the
 *   standard fields.
 *
 *   `verifyKeyState` is set ONLY for vectors that require the verifier's KeySet
 *   to register the key in a non-default state. For NEG-05 (`key-revoked`) the
 *   generator sets this to `"revoked"`. The harness reads this field and
 *   registers the public key with the given state before calling verifyReceipt.
 *   Positive vectors and all other negatives omit this field (the key is
 *   registered as `"active"` by default).
 */

/**
 * Local mirror of ReceiptEnvelope from packages/lattice/src/receipts/types.ts.
 *
 * We redeclare this interface here (rather than importing across the rootDir
 * boundary) so that `tsc --noEmit` can typecheck conformance/generate/ in
 * isolation. The shape is intentionally identical to the upstream definition —
 * any drift is a bug. Phase 52's harness can re-import from the reference impl
 * directly because it is part of the same workspace build graph.
 *
 * Source of truth: packages/lattice/src/receipts/types.ts ReceiptEnvelope.
 */
export interface ReceiptEnvelope {
  readonly payloadType: "application/vnd.lattice.receipt+json";
  readonly payload: string;
  readonly signatures: ReadonlyArray<{ readonly keyid: string; readonly sig: string }>;
}

/**
 * All 7 VerifyErrorKind string literals, exported as a readonly const array for
 * use in test assertions and runtime validation.
 */
export const VERIFY_ERROR_KINDS = [
  "envelope-malformed",
  "version-mismatch",
  "schema-version-too-low",
  "key-not-found",
  "key-revoked",
  "canonicalization-mismatch",
  "signature-invalid",
] as const;

export type VerifyErrorKind = (typeof VERIFY_ERROR_KINDS)[number];

/**
 * ConformanceVector — VEC-01 field set.
 *
 * One JSON object per committed vector file. Fields are ordered to match the
 * Phase 50 `vector0-fixture.json` layout for readability in diffs.
 */
export interface ConformanceVector {
  /**
   * Required warning on every vector file: signals that the embedded keypair
   * is EXAMPLE/TEST-ONLY material and must never be used in production.
   * T-51-01 mitigation: the type system enforces presence (non-optional).
   */
  WARNING: string;

  /**
   * The receipt body that was fed into the pipeline (after redaction for
   * positive vectors). For body-level negative vectors this is the mutated body
   * that triggers the expected error.
   */
  body: Record<string, unknown>;

  /**
   * Lowercase hex encoding of the RFC 8785 JCS canonical bytes derived from
   * `body`. Even number of hex characters.
   */
  canonicalBytesHex: string;

  /**
   * Standard base64 (RFC 4648 §4, NOT base64url) encoding of the canonical
   * bytes. This is the DSSE payload field value.
   */
  payloadBase64: string;

  /**
   * Lowercase hex encoding of the DSSE Pre-Authentication Encoding (PAE) bytes
   * constructed from payloadType + payloadBase64. The signature is computed over
   * these bytes.
   */
  paeHex: string;

  /**
   * Lowercase hex of the Ed25519 signature (exactly 128 hex chars = 64 bytes)
   * produced by signing paeHex bytes with the EXAMPLE/TEST-ONLY keypair.
   */
  signatureHex: string;

  /**
   * OKP Ed25519 public verification key in JWK format. The harness registers
   * this key (under `kid`) in the KeySet before calling verifyReceipt.
   */
  publicKeyJwk: JsonWebKey;

  /**
   * Key identifier. For positive vectors this must match `body.kid`.
   * For `key-not-found` negatives the kid is intentionally absent from the
   * KeySet; for `key-revoked` negatives the kid resolves to a revoked entry.
   */
  kid: string;

  /**
   * Expected outcome of calling verifyReceipt with this vector's envelope and
   * KeySet. `"ok"` for positive vectors; the exact VerifyErrorKind for
   * negatives.
   */
  expectedResult: "ok" | VerifyErrorKind;

  /**
   * OPTIONAL. Non-default key state the harness must register for this vector.
   * Present only on NEG-05 (`key-revoked`) — value is `"revoked"`.
   * Absent for all positive vectors and all other negatives (default: `"active"`).
   * Locked decision D-01 from 51-CONTEXT.md.
   */
  verifyKeyState?: "active" | "retired" | "revoked";

  /**
   * OPTIONAL. The EXACT envelope object the harness feeds directly into
   * verifyReceipt. Present ONLY for envelope-level negative vectors (NEG-01
   * `envelope-malformed`) where the malformed envelope cannot be reconstructed
   * from the other fields. Absent for positives and body-level negatives.
   */
  envelope?: ReceiptEnvelope;
}
