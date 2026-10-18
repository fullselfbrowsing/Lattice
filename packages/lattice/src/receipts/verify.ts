import { canonicalizeReceiptBody } from "./canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
  decodeEnvelope,
} from "./envelope.js";
import {
  MIN_ACCEPTED_RECEIPT_VERSION,
  RECEIPT_VERSIONS,
  isReceiptVersion,
  receiptVersionOrdinal,
} from "./schema-version.js";
import { verifyEd25519Signature } from "./sign.js";
import type {
  CapabilityReceiptBody,
  KeyEntry,
  KeySet,
  ReceiptEnvelope,
  ReceiptVersion,
  VerifyError,
  VerifyOptions,
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

/** Versions a verifier with the given floor ordinal will accept. */
function acceptedVersions(floor: number): readonly ReceiptVersion[] {
  return RECEIPT_VERSIONS.slice(floor);
}

/**
 * Resolve `options.now` to epoch milliseconds. Invalid caller input is a
 * programmer error, so this throws rather than returning a typed failure.
 */
function resolveNowMs(now: VerifyOptions["now"]): number {
  if (now === undefined) return Date.now();
  const ms = now instanceof Date ? now.getTime() : Date.parse(now);
  if (Number.isNaN(ms)) {
    throw new TypeError(
      `verifyReceipt: options.now is not a valid timestamp: ${String(now)}`,
    );
  }
  return ms;
}

/**
 * Resolve the schema-version floor ordinal. The CRYPTO-01 baseline (v1.1)
 * always applies; `minVersion` can only raise it. An unknown literal is a
 * programmer error and throws, because silently accepting everything would
 * be the worst possible failure mode for a verifier option.
 */
function resolveVersionFloor(minVersion: ReceiptVersion | undefined): number {
  const baseline = receiptVersionOrdinal(MIN_ACCEPTED_RECEIPT_VERSION);
  if (minVersion === undefined) return baseline;
  const requested = receiptVersionOrdinal(minVersion);
  if (requested < 0) {
    throw new TypeError(
      `verifyReceipt: options.minVersion "${String(minVersion)}" is not a known receipt version. Known: ${RECEIPT_VERSIONS.join(", ")}`,
    );
  }
  return Math.max(requested, baseline);
}

/**
 * Receipt body shape check. We trust the JSON parse — but we re-validate
 * that the required fields exist with the right primitive types before
 * canonicalizing again. Anything off -> version-mismatch (the body is
 * structurally NOT a receipt, even if it parses as JSON).
 */
function asReceiptBody(value: unknown): CapabilityReceiptBody | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  // CRYPTO-01: accept undefined and every known literal here so too-low
  // versions all reach Step 4 (the schema-version-too-low chokepoint). An
  // unknown non-undefined literal (e.g. lattice-receipt/v2 or "garbage") is a
  // structural shape failure and falls through to the version-mismatch path.
  if (v.version !== undefined && !isReceiptVersion(v.version)) {
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
  // v1.4 binding fields are optional, but when present they must be strings
  // so the binding checks below can compare them safely.
  if (v.audience !== undefined && typeof v.audience !== "string") return undefined;
  if (v.nonce !== undefined && typeof v.nonce !== "string") return undefined;
  if (v.expiresAt !== undefined && typeof v.expiresAt !== "string") return undefined;
  return v as unknown as CapabilityReceiptBody;
}

/**
 * Pure receipt verifier.
 *
 * Returns a typed VerifyResult — never throws for a crafted ENVELOPE
 * (PITFALLS.md security: "Verifier panics on malformed receipts -> DoS via
 * crafted input"). All parsing failures become typed errors. Invalid caller
 * OPTIONS (unknown minVersion, unparseable now) are programmer errors and
 * throw a TypeError before any envelope work.
 *
 * Decision tree (first match wins):
 *   1. decodeEnvelope throws OR signatures[] empty              -> envelope-malformed
 *   2. payload bytes are not valid JSON                         -> envelope-malformed
 *   3. body shape check fails OR version unknown literal        -> version-mismatch
 *   4. body.version undefined OR ordinal below floor            -> schema-version-too-low
 *      (floor = max(options.minVersion, v1.1); CRYPTO-01)
 *   5. keySet.lookup(keyid) === undefined                       -> key-not-found
 *   6. entry.state === "revoked"                                -> key-revoked
 *   7. re-canonicalized body != signed payloadBytes             -> canonicalization-mismatch
 *   8. Ed25519 verification of PAE fails                        -> signature-invalid
 *   9. body.kid !== entry.kid (defense in depth)                -> signature-invalid
 *  10. options.expectedAudience set AND body.audience differs   -> audience-mismatch
 *      (an absent body.audience is a mismatch)
 *  11. options.expectedNonce set AND body.nonce differs         -> nonce-mismatch
 *      (an absent body.nonce is a mismatch)
 *  12. body.expiresAt present AND (unparseable OR before now)
 *      OR options.maxAgeMs set AND (issuedAt unparseable OR issuedAt + maxAgeMs before now)
 *                                                               -> receipt-expired
 *  13. otherwise                                                -> ok + keyState
 *
 * Steps 10 to 12 run AFTER signature verification so an unauthenticated
 * envelope cannot be used to probe which audience or nonce a verifier
 * expects. Step 12's expiresAt branch is enforced even with no options: an
 * issuer that set expiresAt asked every verifier to honor it. Pass
 * options.now to pin the clock in tests.
 */
export async function verifyReceipt(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  // Caller-option normalization. Throws on programmer error; see JSDoc.
  const nowMs = resolveNowMs(options.now);
  const floor = resolveVersionFloor(options.minVersion);

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

  // Step 3: structural body check + version literal check.
  const body = asReceiptBody(parsed);
  if (body === undefined) {
    return fail(
      "version-mismatch",
      `receipt body is not a ${acceptedVersions(receiptVersionOrdinal(MIN_ACCEPTED_RECEIPT_VERSION)).join(", ")} shape`,
    );
  }

  // Step 4: receipt-downgrade defense (CRYPTO-01) plus the caller's floor.
  // v1 receipts predate the v1.1 step-marker integrity surface; an attacker
  // holding a valid signing key could mint a v1-shaped body and submit it to
  // bypass newer schema commitments. A caller can raise the floor further via
  // options.minVersion to demand, for example, the v1.3 lineage commitments.
  // Short-circuits before any cryptographic work (keyset lookup, canonical
  // re-check, signature verify) so the downgrade verdict is unambiguous.
  // See SECURITY.md (Phase 26 threat model) and Radicle 2026-03 precedent.
  if (body.version === undefined || receiptVersionOrdinal(body.version) < floor) {
    const floorLiteral = RECEIPT_VERSIONS[floor] ?? MIN_ACCEPTED_RECEIPT_VERSION;
    const observed =
      body.version === undefined ? "is absent" : `"${String(body.version)}"`;
    return fail(
      "schema-version-too-low",
      `Receipt body.version ${observed} is below the accepted floor "${floorLiteral}" (CRYPTO-01). Accepted: ${acceptedVersions(floor).join(", ")}.`,
    );
  }

  // Step 5: keyset lookup (use first signature; multi-sig deferred to a future schema).
  const firstSig = decoded.signatures[0]!;
  const entry: KeyEntry | undefined = keySet.lookup(firstSig.keyid);
  if (entry === undefined) {
    return fail(
      "key-not-found",
      `keySet has no entry for kid "${firstSig.keyid}"`,
    );
  }

  // Step 6: revoked keys reject every receipt regardless of signing time.
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

  // Step 8: rebuild PAE and verify Ed25519 signature.
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

  // Step 9: defense-in-depth — body.kid MUST equal envelope keyid.
  if (body.kid !== entry.kid) {
    return fail(
      "signature-invalid",
      `body.kid "${body.kid}" does not match envelope keyid "${entry.kid}"`,
    );
  }

  // Step 10: audience binding. Only enforced when the verifier asks for it;
  // a receipt that carries no audience cannot satisfy an expectation.
  if (
    options.expectedAudience !== undefined &&
    body.audience !== options.expectedAudience
  ) {
    return fail(
      "audience-mismatch",
      body.audience === undefined
        ? `receipt carries no audience; verifier expected "${options.expectedAudience}"`
        : `receipt audience "${body.audience}" does not match expected "${options.expectedAudience}"`,
    );
  }

  // Step 11: nonce binding. Messages never echo nonce values.
  if (options.expectedNonce !== undefined && body.nonce !== options.expectedNonce) {
    return fail(
      "nonce-mismatch",
      body.nonce === undefined
        ? "receipt carries no nonce; verifier expected one"
        : "receipt nonce does not match the expected nonce",
    );
  }

  // Step 12: expiry. expiresAt is honored whenever the issuer set it; maxAgeMs
  // is a verifier-side policy over issuedAt. Unparseable timestamps fail
  // closed rather than being treated as "never expires".
  if (body.expiresAt !== undefined) {
    const expiresMs = Date.parse(body.expiresAt);
    if (Number.isNaN(expiresMs)) {
      return fail(
        "receipt-expired",
        `expiresAt "${body.expiresAt}" is not a parseable ISO 8601 timestamp`,
      );
    }
    if (expiresMs < nowMs) {
      return fail("receipt-expired", `receipt expired at ${body.expiresAt}`);
    }
  }
  if (options.maxAgeMs !== undefined) {
    const issuedMs = Date.parse(body.issuedAt);
    if (Number.isNaN(issuedMs)) {
      return fail(
        "receipt-expired",
        `issuedAt "${body.issuedAt}" is not a parseable ISO 8601 timestamp`,
      );
    }
    if (issuedMs + options.maxAgeMs < nowMs) {
      return fail(
        "receipt-expired",
        `receipt issued at ${body.issuedAt} exceeds maxAgeMs=${options.maxAgeMs}`,
      );
    }
  }

  // Step 13: success — surface the key state so callers can warn on retired.
  return { ok: true, body, keyState: entry.state };
}
