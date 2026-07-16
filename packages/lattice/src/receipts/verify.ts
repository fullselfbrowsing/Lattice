import { canonicalizeReceiptBody } from "./canonical.js";
import {
  PAYLOAD_TYPE,
  buildPae,
  decodeEnvelope,
} from "./envelope.js";
import { verifyEd25519Signature } from "./sign.js";
import type {
  CapabilityReceiptBody,
  KeyEntry,
  KeySet,
  ReceiptEnvelope,
  VerifyError,
  VerifyReceiptOptions,
  VerifyResult,
} from "./types.js";

const textEncoder = new TextEncoder();

function fail(kind: VerifyError["kind"], message: string): VerifyResult {
  return { ok: false, error: { kind, message } };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Receipt body shape check. We trust the JSON parse — but we re-validate
 * that the required fields exist with the right primitive types before
 * canonicalizing again. Anything off -> version-mismatch (the body is
 * structurally NOT a v1 receipt, even if it parses as JSON).
 */
function asReceiptBody(value: unknown): CapabilityReceiptBody | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  // Accept undefined and known versions so too-low versions all
  // reach Step 4 (the schema-version-too-low chokepoint). An unknown
  // non-undefined literal (e.g. lattice-receipt/v2 or "garbage") is still a
  // structural shape failure and falls through to the version-mismatch path.
  if (
    v.version !== undefined &&
    v.version !== "lattice-receipt/v1" &&
    v.version !== "lattice-receipt/v1.1" &&
    v.version !== "lattice-receipt/v1.2" &&
    v.version !== "lattice-receipt/v1.3" &&
    v.version !== "lattice-receipt/v1.4"
  ) {
    return undefined;
  }
  if (typeof v.receiptId !== "string") return undefined;
  if (typeof v.runId !== "string") return undefined;
  if (typeof v.issuedAt !== "string") return undefined;
  if (typeof v.kid !== "string") return undefined;
  if (typeof v.model !== "object" || v.model === null) return undefined;
  if (typeof v.route !== "object" || v.route === null) return undefined;
  if (typeof v.usage !== "object" || v.usage === null) return undefined;
  if (typeof v.contractVerdict !== "string") return undefined;
  if (!Array.isArray(v.inputHashes)) return undefined;
  if (typeof v.redactionPolicyId !== "string") return undefined;
  if (!Array.isArray(v.redactions)) return undefined;
  return v as unknown as CapabilityReceiptBody;
}

function hasValidSignatureProfile(body: CapabilityReceiptBody): boolean {
  if (body.version === "lattice-receipt/v1.4") {
    return body.signatureProfile === "dsse-v1";
  }
  return body.signatureProfile === undefined;
}

function buildLegacyPaeForVerification(
  payloadType: string,
  payloadBase64: string,
): Uint8Array {
  return textEncoder.encode(
    `DSSEv1 ${payloadType.length} ${payloadType} ${payloadBase64.length} ${payloadBase64}`,
  );
}

function kidMismatch(
  body: CapabilityReceiptBody,
  entry: KeyEntry,
): VerifyResult | undefined {
  if (body.kid === entry.kid) return undefined;
  return fail(
    "signature-invalid",
    `body.kid "${body.kid}" does not match envelope keyid "${entry.kid}"`,
  );
}

/**
 * Pure receipt verifier.
 *
 * Returns a typed VerifyResult — never throws across the verification
 * boundary (PITFALLS.md security: "Verifier panics on malformed receipts
 * -> DoS via crafted input"). All parsing failures become typed errors.
 *
 * Decision tree (first match wins):
 *   1. decodeEnvelope throws OR signatures[] empty       -> envelope-malformed
 *   2. payload bytes are not valid JSON                  -> envelope-malformed
 *   3. body shape check fails OR version unknown literal -> version-mismatch
 *   4. body.version === undefined OR "lattice-receipt/v1"-> schema-version-too-low (CRYPTO-01)
 *   5. version/profile matrix is invalid                 -> signature-profile-mismatch
 *   6. keySet.lookup(keyid) === undefined                -> key-not-found
 *   7. entry.state === "revoked"                         -> key-revoked
 *   8. re-canonicalized body != signed payloadBytes      -> canonicalization-mismatch
 *   9. standard DSSE verification succeeds              -> ok + dsse-v1
 *  10. corrected-profile standard verification fails    -> signature-invalid
 *  11. historical verification rejected by policy       -> legacy-profile-rejected
 *  12. historical PAE verification succeeds             -> ok + legacy profile
 */
export async function verifyReceipt(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
  options: VerifyReceiptOptions = {},
): Promise<VerifyResult> {
  const legacyPolicy = options.legacyPolicy ?? "allow";
  // Step 1: decode envelope (catches wrong payloadType, base64 errors).
  let decoded;
  try {
    decoded = decodeEnvelope(envelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("envelope-malformed", message);
  }
  if (decoded.signatures.length === 0) {
    return fail("envelope-malformed", "envelope has no signatures");
  }

  // Step 2: parse the canonical payload.
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(decoded.payloadBytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail("envelope-malformed", `payload is not valid JSON: ${message}`);
  }

  // Step 3: structural body check + version check.
  const body = asReceiptBody(parsed);
  if (body === undefined) {
    return fail(
      "version-mismatch",
      "receipt body is not a supported lattice receipt shape",
    );
  }

  // Step 4: receipt-downgrade defense (CRYPTO-01).
  // Reject receipts whose body.version is absent or equals the v1 literal.
  // v1 receipts predate the v1.1 step-marker integrity surface and the v1.2
  // modelClass audit tag; an attacker holding a valid signing key could mint a
  // v1-shaped body and submit it to bypass newer schema commitments.
  // Short-circuits before any cryptographic work (keyset lookup, canonical
  // re-check, signature verify) so the downgrade verdict is unambiguous.
  // See SECURITY.md (Phase 26 threat model) and Radicle 2026-03 precedent.
  if (body.version === undefined || body.version === "lattice-receipt/v1") {
    return fail(
      "schema-version-too-low",
      "Receipt body.version must be lattice-receipt/v1.1 or newer — v1 receipts are not accepted (CRYPTO-01).",
    );
  }

  // Step 5: the corrected profile is authenticated by the v1.4 body. Older
  // versions must not carry it, or they could be reinterpreted across axes.
  if (!hasValidSignatureProfile(body)) {
    return fail(
      "signature-profile-mismatch",
      body.version === "lattice-receipt/v1.4"
        ? 'lattice-receipt/v1.4 requires signatureProfile "dsse-v1"'
        : "historical receipt versions must not declare signatureProfile",
    );
  }

  // Step 6: keyset lookup (use first signature; multi-sig deferred to a future schema).
  const firstSig = decoded.signatures[0]!;
  const entry: KeyEntry | undefined = keySet.lookup(firstSig.keyid);
  if (entry === undefined) {
    return fail(
      "key-not-found",
      `keySet has no entry for kid "${firstSig.keyid}"`,
    );
  }
  if (entry.state === "revoked") {
    return fail("key-revoked", `key "${entry.kid}" is revoked`);
  }

  // Step 7: re-canonicalize body and compare byte-for-byte against
  // decoded.payloadBytes. Catches any swap of canonical form mid-flight
  // (the signed bytes must canonicalize back to themselves).
  const reCanonical = canonicalizeReceiptBody(body);
  if (!bytesEqual(reCanonical, decoded.payloadBytes)) {
    return fail(
      "canonicalization-mismatch",
      "re-canonicalized body does not match signed payload bytes",
    );
  }

  // Step 8: standard DSSE always runs first over decoded payload bytes.
  const standardPae = buildPae(PAYLOAD_TYPE, decoded.payloadBytes);
  const standardValid = await verifyEd25519Signature(
    entry.publicKeyJwk,
    standardPae,
    firstSig.sig,
  );
  if (standardValid) {
    const mismatch = kidMismatch(body, entry);
    if (mismatch !== undefined) return mismatch;
    return {
      ok: true,
      body,
      keyState: entry.state,
      verificationProfile: "dsse-v1",
      deprecated: false,
    };
  }

  // v1.4 is standard-only. A failed corrected signature never falls back.
  if (body.version === "lattice-receipt/v1.4") {
    return fail("signature-invalid", "Ed25519 signature does not verify");
  }

  if (legacyPolicy === "reject") {
    return fail(
      "legacy-profile-rejected",
      "standard DSSE verification failed and legacy receipt verification is disabled",
    );
  }

  const legacyPae = buildLegacyPaeForVerification(
    PAYLOAD_TYPE,
    envelope.payload,
  );
  const legacyValid = await verifyEd25519Signature(
    entry.publicKeyJwk,
    legacyPae,
    firstSig.sig,
  );
  if (!legacyValid) {
    return fail("signature-invalid", "Ed25519 signature does not verify");
  }

  const mismatch = kidMismatch(body, entry);
  if (mismatch !== undefined) return mismatch;
  return {
    ok: true,
    body,
    keyState: entry.state,
    verificationProfile: "lattice-legacy-base64-pae",
    deprecated: true,
  };
}
