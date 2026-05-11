import { canonicalizeReceiptBody } from "./canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
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
  VerifyResult,
} from "./types.js";

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
  if (v.version !== "lattice-receipt/v1") return undefined;
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
 *   3. body shape check fails OR version != v1           -> version-mismatch
 *   4. keySet.lookup(keyid) === undefined                -> key-not-found
 *   5. entry.state === "revoked"                         -> key-revoked
 *   6. re-canonicalized body != signed payloadBytes      -> canonicalization-mismatch
 *   7. Ed25519 verification of PAE fails                 -> signature-invalid
 *   8. body.kid !== entry.kid (defense in depth)         -> signature-invalid
 *   9. otherwise                                         -> ok + keyState
 */
export async function verifyReceipt(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
): Promise<VerifyResult> {
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
      "receipt body is not a lattice-receipt/v1 shape",
    );
  }

  // Step 4: keyset lookup (use first signature; multi-sig deferred to v1.2).
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

  // Step 5: re-canonicalize body and compare byte-for-byte against
  // decoded.payloadBytes. Catches any swap of canonical form mid-flight
  // (the signed bytes must canonicalize back to themselves).
  const reCanonical = canonicalizeReceiptBody(body);
  if (!bytesEqual(reCanonical, decoded.payloadBytes)) {
    return fail(
      "canonicalization-mismatch",
      "re-canonicalized body does not match signed payload bytes",
    );
  }

  // Step 6: rebuild PAE and verify Ed25519 signature.
  const payloadB64 = base64Encode(decoded.payloadBytes);
  const pae = buildPae(PAYLOAD_TYPE, payloadB64);
  const sigValid = await verifyEd25519Signature(
    entry.publicKeyJwk,
    pae,
    firstSig.sig,
  );
  if (!sigValid) {
    return fail("signature-invalid", "Ed25519 signature does not verify");
  }

  // Step 7: defense-in-depth — body.kid MUST equal envelope keyid.
  if (body.kid !== entry.kid) {
    return fail(
      "signature-invalid",
      `body.kid "${body.kid}" does not match envelope keyid "${entry.kid}"`,
    );
  }

  // Step 8: success — surface the key state so callers can warn on retired.
  return { ok: true, body, keyState: entry.state };
}
