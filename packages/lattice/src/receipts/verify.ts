import { canonicalizeReceiptBody } from "./canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
  decodeEnvelope,
} from "./envelope.js";
import {
  CURRENT_RECEIPT_VERSION,
  MIN_ACCEPTED_RECEIPT_VERSION,
  RECEIPT_VERSIONS,
  isReceiptVersion,
  receiptVersionOrdinal,
} from "./schema-version.js";
import { verifyEd25519Signature } from "./sign.js";
import { RFC3339_INSTANT_REQUIREMENT, parseRfc3339Instant } from "./timestamp.js";
import type {
  CapabilityReceiptBody,
  KeyEntry,
  KeySet,
  ReceiptEnvelope,
  ReceiptVersion,
  VerifyAdvisory,
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
 * programmer error, so this throws rather than returning a typed failure. A
 * string must be an RFC 3339 instant with an explicit offset so the verdict
 * does not depend on the verifier's local timezone; a `Date` is already an
 * instant.
 */
function resolveNowMs(now: VerifyOptions["now"]): number {
  if (now === undefined) return Date.now();
  const ms = now instanceof Date ? now.getTime() : parseRfc3339Instant(now);
  if (ms === undefined || Number.isNaN(ms)) {
    throw new TypeError(
      `verifyReceipt: options.now must be a Date or ${RFC3339_INSTANT_REQUIREMENT}: ${String(now)}`,
    );
  }
  return ms;
}

/**
 * Validate `options.maxAgeMs`. A NaN or negative value would make the age
 * comparison silently false, which is the worst failure mode for a freshness
 * check, so anything that is not a finite non-negative number is a
 * programmer error.
 */
function resolveMaxAgeMs(maxAgeMs: number | undefined): number | undefined {
  if (maxAgeMs === undefined) return undefined;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    throw new TypeError(
      `verifyReceipt: options.maxAgeMs must be a finite, non-negative number of milliseconds, got ${String(maxAgeMs)}`,
    );
  }
  return maxAgeMs;
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
  if (closureFieldProblem(v) !== undefined) return undefined;
  return v as unknown as CapabilityReceiptBody;
}

/**
 * Chain-closure fields are optional, but when present they must have the
 * shape verifyChain relies on. An unknown closure mode is not something this
 * verifier can enforce, so it fails closed instead of reading as "no
 * closure". Returns the problem for the version-mismatch message.
 */
function closureFieldProblem(v: Record<string, unknown>): string | undefined {
  if (v.chainClosure !== undefined && v.chainClosure !== "member-cids") {
    return 'chainClosure must be "member-cids"';
  }
  if (
    v.chainMemberCids !== undefined &&
    (!Array.isArray(v.chainMemberCids) ||
      !v.chainMemberCids.every((cid) => typeof cid === "string"))
  ) {
    return "chainMemberCids must be an array of CID strings";
  }
  return undefined;
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
 *   1. decodeEnvelope throws OR signatures[] empty
 *      OR payload is not canonical base64                      -> envelope-malformed
 *   2. payload bytes are not valid JSON                         -> envelope-malformed
 *   3. body shape check fails OR version unknown literal
 *      OR chainClosure / chainMemberCids malformed              -> version-mismatch
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
 *  12. body.expiresAt present AND (not an RFC 3339 instant OR before now)
 *      OR options.maxAgeMs set AND (issuedAt not an RFC 3339 instant
 *                                   OR issuedAt + maxAgeMs before now)
 *                                                               -> receipt-expired
 *  13. otherwise                                                -> ok + keyState
 *
 * Steps 10 to 12 run AFTER signature verification so an unauthenticated
 * envelope cannot be used to probe which audience or nonce a verifier
 * expects. Step 12's expiresAt branch is enforced even with no options: an
 * issuer that set expiresAt asked every verifier to honor it. Timestamps in
 * step 12 must carry an explicit UTC offset (see receipts/timestamp.ts);
 * `Date.parse` would read an offset-less string as local time and make the
 * verdict depend on the verifier's timezone. Pass options.now to pin the
 * clock in tests.
 */
export async function verifyReceipt(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  // Caller-option normalization. Throws on programmer error; see JSDoc.
  const nowMs = resolveNowMs(options.now);
  const floor = resolveVersionFloor(options.minVersion);
  const maxAgeMs = resolveMaxAgeMs(options.maxAgeMs);

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
  // The payload string must be canonical base64. Node's decoder is lenient
  // (base64url alphabet, embedded whitespace), so without this check two
  // different strings would verify as the same receipt while receiptCid,
  // which uses strict atob, rejects one of them.
  if (base64Encode(decoded.payloadBytes) !== envelope.payload) {
    return fail("envelope-malformed", "payload is not canonical base64");
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
    const closure =
      typeof parsed === "object" && parsed !== null
        ? closureFieldProblem(parsed as Record<string, unknown>)
        : undefined;
    return fail(
      "version-mismatch",
      `receipt body is not a ${acceptedVersions(receiptVersionOrdinal(MIN_ACCEPTED_RECEIPT_VERSION)).join(", ")} shape${closure !== undefined ? `: ${closure}` : ""}`,
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
  // is a verifier-side policy over issuedAt. Timestamps that are not RFC 3339
  // instants with an explicit offset fail closed rather than being read as
  // local time or treated as "never expires".
  if (body.expiresAt !== undefined) {
    const expiresMs = parseRfc3339Instant(body.expiresAt);
    if (expiresMs === undefined) {
      return fail(
        "receipt-expired",
        `expiresAt "${body.expiresAt}" is not ${RFC3339_INSTANT_REQUIREMENT}`,
      );
    }
    if (expiresMs < nowMs) {
      return fail("receipt-expired", `receipt expired at ${body.expiresAt}`);
    }
  }
  if (maxAgeMs !== undefined) {
    const issuedMs = parseRfc3339Instant(body.issuedAt);
    if (issuedMs === undefined) {
      return fail(
        "receipt-expired",
        `issuedAt "${body.issuedAt}" is not ${RFC3339_INSTANT_REQUIREMENT}`,
      );
    }
    if (issuedMs + maxAgeMs < nowMs) {
      return fail(
        "receipt-expired",
        `receipt issued at ${body.issuedAt} exceeds maxAgeMs=${maxAgeMs}`,
      );
    }
  }

  // Step 13: success — surface the key state so callers can warn on retired.
  return { ok: true, body, keyState: entry.state };
}

/**
 * Advisories for a receipt that verified with `options`. Binding checks stay
 * opt-in so a receipt minted before audience, nonce, or expiry existed still
 * verifies; this reports what that left unchecked.
 *
 *   warn  audience-unchecked / nonce-unchecked: the receipt is bound to an
 *         audience or nonce, but the matching expectation was not passed,
 *         so the binding was never compared. A replay to another relying
 *         party verifies the same way.
 *   info  audience-absent / nonce-absent / expiry-absent: the receipt does
 *         not use that binding (and, for expiry, `maxAgeMs` was not passed).
 *   info  version-below-current: the receipt predates the current schema
 *         and the effective floor, max(`minVersion`, v1.1), admitted it.
 *         Passing `minVersion` equal to the v1.1 floor does not silence it.
 *
 * `expiresAt`, when the issuer set it, is enforced inside `verifyReceipt`
 * and produces no advisory. Messages never contain the nonce value. Pure;
 * an unknown `minVersion` here is read as the baseline rather than thrown,
 * because `verifyReceipt` already rejected it.
 */
export function receiptVerifyAdvisories(
  body: CapabilityReceiptBody,
  options: VerifyOptions = {},
): readonly VerifyAdvisory[] {
  const notes: VerifyAdvisory[] = [];
  if (body.audience !== undefined && options.expectedAudience === undefined) {
    notes.push({
      code: "audience-unchecked",
      severity: "warn",
      message: `receipt is bound to audience "${String(body.audience)}" but expectedAudience was not passed, so the binding was not checked`,
    });
  } else if (body.audience === undefined && options.expectedAudience === undefined) {
    notes.push({
      code: "audience-absent",
      severity: "info",
      message:
        "receipt has no audience, so any relying party accepts it; pass expectedAudience to require one",
    });
  }
  if (body.nonce !== undefined && options.expectedNonce === undefined) {
    notes.push({
      code: "nonce-unchecked",
      severity: "warn",
      message:
        "receipt carries a nonce but expectedNonce was not passed, so the binding was not checked",
    });
  } else if (body.nonce === undefined && options.expectedNonce === undefined) {
    notes.push({
      code: "nonce-absent",
      severity: "info",
      message:
        "receipt has no nonce; pass expectedNonce and record accepted receiptCid values to reject a replay",
    });
  }
  if (body.expiresAt === undefined && options.maxAgeMs === undefined) {
    notes.push({
      code: "expiry-absent",
      severity: "info",
      message: "receipt has no expiresAt and maxAgeMs was not passed, so it does not expire",
    });
  }
  // Judge the floor the verifier actually applied, not whether minVersion
  // was passed: minVersion below or equal to the CRYPTO-01 baseline leaves
  // the floor where it was.
  const baseline = receiptVersionOrdinal(MIN_ACCEPTED_RECEIPT_VERSION);
  const floor = Math.max(receiptVersionOrdinal(options.minVersion), baseline);
  const bodyOrdinal = receiptVersionOrdinal(body.version);
  if (floor <= bodyOrdinal && bodyOrdinal < receiptVersionOrdinal(CURRENT_RECEIPT_VERSION)) {
    notes.push({
      code: "version-below-current",
      severity: "info",
      message: `receipt is ${String(body.version)}, older than ${CURRENT_RECEIPT_VERSION}, and the effective floor ${RECEIPT_VERSIONS[floor] ?? MIN_ACCEPTED_RECEIPT_VERSION} accepted it; pass minVersion to require a newer schema`,
    });
  }
  return notes;
}
