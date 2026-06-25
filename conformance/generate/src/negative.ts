/**
 * conformance/generate/src/negative.ts
 *
 * Negative conformance vector generator — 9 adversarial constructions.
 *
 * Each vector applies exactly ONE mutation to a base valid signed receipt so
 * that verifyReceipt()'s first-match-wins 10-step decision tree fires at the
 * intended step and no earlier. The recipes are derived directly from the
 * confirmed verify.ts source (packages/lattice/src/receipts/verify.ts).
 *
 * Decision tree steps targeted:
 *   NEG-01  Step 1  envelope-malformed      payloadType = "application/json"
 *   NEG-02  Step 3  version-mismatch        version = "lattice-receipt/v2"
 *   NEG-03a Step 4  schema-version-too-low  version = "lattice-receipt/v1"
 *   NEG-03b Step 4  schema-version-too-low  version field absent (undefined)
 *   NEG-04  Step 5  key-not-found           signatures[0].keyid = "unknown-kid-12345"
 *   NEG-05  Step 6  key-revoked             valid envelope; KeySet must have state: "revoked"
 *   NEG-06  Step 7  canonicalization-mismatch  payload bytes tampered post-sign
 *   NEG-07  Step 8  signature-invalid       last byte of sig XOR'd with 0x01
 *   NEG-08  Step 9  signature-invalid       body.kid="wrong-kid", envelope keyid="spec-example-key-v0"
 *
 * EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION.
 * This Ed25519 keypair is committed to the repository solely for specification
 * and conformance-testing purposes. Copied from spec/generate-vector0.ts.
 */

import canonicalize from "canonicalize";
import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
} from "../../../packages/lattice/src/receipts/envelope.js";
import { createInMemorySigner } from "../../../packages/lattice/src/receipts/sign.js";
import type { CapabilityReceiptBody } from "../../../packages/lattice/src/receipts/types.js";

import {
  DEFAULT_REDACTION_POLICY_ID,
} from "../../../packages/lattice/src/receipts/redact.js";

import type { ConformanceVector, ReceiptEnvelope } from "./types.js";

// ---------------------------------------------------------------------------
// EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION
// Copied from spec/generate-vector0.ts with identical values.
// ---------------------------------------------------------------------------
const EXAMPLE_PRIVATE_KEY_JWK: JsonWebKey = {
  key_ops: ["sign"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  d: "U0lQtD0LB_4s1248jIAPfXB6_WDu6HOaaSvALETgFNg",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

const EXAMPLE_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ["verify"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

const KID = "spec-example-key-v0";

const WARNING_TEXT =
  "EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION. This keypair is committed for specification purposes only.";

// ---------------------------------------------------------------------------
// Helper: convert Uint8Array to lowercase hex string.
// ---------------------------------------------------------------------------
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Base negative body — used as the starting point for most mutations.
//
// v1.3 body with distinct receiptId/runId/issuedAt so negative vectors are
// distinguishable from positive vectors in audits.
// ---------------------------------------------------------------------------
const BASE_NEGATIVE_BODY: CapabilityReceiptBody = {
  version: "lattice-receipt/v1.3",
  receiptId: "00000000-0000-4000-a000-000000000010",
  runId: "spec-vector-neg-base",
  issuedAt: "2026-06-25T00:00:10.000Z",
  kid: KID,
  stepName: "neg-base-step",
  model: {
    requested: "claude-3-5-sonnet",
    observed: "claude-3-5-sonnet-20241022",
  },
  route: {
    providerId: "anthropic",
    capabilityId: "chat",
    attemptNumber: 1,
  },
  usage: {
    promptTokens: 10,
    completionTokens: 5,
    costUsd: "0.000100",
  },
  contractVerdict: "success",
  contractHash: null,
  inputHashes: [],
  outputHash: null,
  redactionPolicyId: DEFAULT_REDACTION_POLICY_ID,
  redactions: [],
};

// ---------------------------------------------------------------------------
// Pipeline helper: canonicalize → base64 → PAE → sign.
// Returns all the fields needed to construct a ConformanceVector.
// ---------------------------------------------------------------------------
async function signBody(
  body: CapabilityReceiptBody,
  signer: Awaited<ReturnType<typeof createInMemorySigner>>,
): Promise<{
  canonicalBytes: Uint8Array;
  canonicalBytesHex: string;
  payloadBase64: string;
  paeHex: string;
  sigBytes: Uint8Array;
  signatureHex: string;
}> {
  const canonicalBytes = canonicalizeReceiptBody(body);
  const canonicalBytesHex = toHex(canonicalBytes);
  const payloadBase64 = base64Encode(canonicalBytes);
  const paeBytes = buildPae(PAYLOAD_TYPE, payloadBase64);
  const paeHex = toHex(paeBytes);
  const sigBytes = await signer.sign(paeBytes);
  const signatureHex = toHex(sigBytes);
  return { canonicalBytes, canonicalBytesHex, payloadBase64, paeHex, sigBytes, signatureHex };
}

// ---------------------------------------------------------------------------
// generateNegativeVectors()
//
// Returns an array of exactly 9 ConformanceVector objects, one per adversarial
// construction, in the order NEG-01 through NEG-08 (NEG-03 produces two
// vectors: NEG-03a and NEG-03b).
//
// Convention for the `kid` top-level field in ConformanceVector:
//   - Positive vectors: kid = body.kid (they match by design).
//   - NEG-04 (key-not-found): kid = "unknown-kid-12345" — the harness must
//     present this kid to verifyReceipt. The KeySet has no entry for it.
//   - NEG-08 (kid mismatch): kid = "spec-example-key-v0" (the envelope keyid,
//     which IS in the KeySet). body.kid = "wrong-kid". The harness presents
//     "spec-example-key-v0" to verifyReceipt; Step 5 finds the key; Step 8
//     passes (valid Ed25519 sig); Step 9 fires on body.kid != entry.kid.
//   - All other negatives: kid = "spec-example-key-v0" (normal lookup).
// ---------------------------------------------------------------------------
export async function generateNegativeVectors(): Promise<ConformanceVector[]> {
  const signer = createInMemorySigner(EXAMPLE_PRIVATE_KEY_JWK, {
    kid: KID,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
  });

  // Compute base pipeline (valid v1.3 body) used by multiple negatives.
  const base = await signBody(BASE_NEGATIVE_BODY, signer);

  // =========================================================================
  // NEG-01: envelope-malformed (Step 1 — wrong payloadType)
  //
  // Start with a valid signed envelope. Mutation: set payloadType to
  // "application/json". decodeEnvelope() checks payloadType !== PAYLOAD_TYPE
  // and throws immediately (verify.ts line 92-96, envelope.ts line 108-112).
  //
  // The optional `envelope` field is set to the EXACT malformed ReceiptEnvelope
  // that Phase 52/53 harnesses must feed directly into verifyReceipt. The
  // payloadType field uses `as unknown as` cast because our ReceiptEnvelope
  // type constrains it to the valid MIME type, but NEG-01 intentionally
  // violates that constraint — this is by design for a negative test vector.
  // =========================================================================
  const neg01Envelope: ReceiptEnvelope = {
    payloadType: "application/json" as unknown as "application/vnd.lattice.receipt+json",
    payload: base.payloadBase64,
    signatures: [{ keyid: KID, sig: base.signatureHex }],
  };

  const neg01: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: BASE_NEGATIVE_BODY as unknown as Record<string, unknown>,
    canonicalBytesHex: base.canonicalBytesHex,
    payloadBase64: base.payloadBase64,
    paeHex: base.paeHex,
    signatureHex: base.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "envelope-malformed",
    // The malformed envelope object — harnesses submit this directly to verifyReceipt.
    // payloadType is "application/json" (not PAYLOAD_TYPE) — that's the single mutation.
    envelope: neg01Envelope,
  };

  // =========================================================================
  // NEG-02: version-mismatch (Step 3 — unknown version literal)
  //
  // Build a body with version "lattice-receipt/v2". asReceiptBody() in
  // verify.ts (line 43-51) returns undefined for any non-recognized non-empty
  // version string, triggering "version-mismatch" at Step 3. Steps 1-2 pass
  // (valid envelope format and JSON payload). Step 3 fires before Step 5, so
  // the key lookup is never reached even though the key IS in the KeySet.
  // =========================================================================
  const body02: CapabilityReceiptBody = {
    ...BASE_NEGATIVE_BODY,
    version: "lattice-receipt/v2" as unknown as "lattice-receipt/v1.3",
    receiptId: "00000000-0000-4000-a000-000000000011",
    issuedAt: "2026-06-25T00:00:11.000Z",
  };
  const neg02Pipeline = await signBody(body02, signer);

  const neg02: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body02 as unknown as Record<string, unknown>,
    canonicalBytesHex: neg02Pipeline.canonicalBytesHex,
    payloadBase64: neg02Pipeline.payloadBase64,
    paeHex: neg02Pipeline.paeHex,
    signatureHex: neg02Pipeline.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "version-mismatch",
  };

  // =========================================================================
  // NEG-03a: schema-version-too-low (Step 4 — literal "lattice-receipt/v1")
  //
  // Build a body with version "lattice-receipt/v1". asReceiptBody() ACCEPTS it
  // (line 43-51: v1 literal is in the allowed set). Then Step 4 (verify.ts
  // line 127) fires: body.version === "lattice-receipt/v1" → rejected.
  // =========================================================================
  const body03a: CapabilityReceiptBody = {
    ...BASE_NEGATIVE_BODY,
    version: "lattice-receipt/v1" as unknown as "lattice-receipt/v1.3",
    receiptId: "00000000-0000-4000-a000-000000000012",
    issuedAt: "2026-06-25T00:00:12.000Z",
  };
  const neg03aPipeline = await signBody(body03a, signer);

  const neg03a: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body03a as unknown as Record<string, unknown>,
    canonicalBytesHex: neg03aPipeline.canonicalBytesHex,
    payloadBase64: neg03aPipeline.payloadBase64,
    paeHex: neg03aPipeline.paeHex,
    signatureHex: neg03aPipeline.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "schema-version-too-low",
  };

  // =========================================================================
  // NEG-03b: schema-version-too-low (Step 4 — version field absent)
  //
  // Build a body WITHOUT the "version" key. asReceiptBody() checks
  // `v.version !== undefined` first — if undefined, the entire OR chain
  // short-circuits (falsy), so it does NOT return undefined. The body passes
  // asReceiptBody() shape validation (all other required fields are present).
  // Then Step 4 fires: body.version === undefined → "schema-version-too-low".
  //
  // Implementation: build as Record<string, unknown> without "version", then
  // cast for the signBody call. The canonical JSON will not contain "version".
  // =========================================================================
  const body03bBase = { ...BASE_NEGATIVE_BODY } as Record<string, unknown>;
  delete body03bBase["version"];
  body03bBase["receiptId"] = "00000000-0000-4000-a000-000000000013";
  body03bBase["issuedAt"] = "2026-06-25T00:00:13.000Z";

  const neg03bPipeline = await signBody(
    body03bBase as unknown as CapabilityReceiptBody,
    signer,
  );

  const neg03b: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body03bBase,
    canonicalBytesHex: neg03bPipeline.canonicalBytesHex,
    payloadBase64: neg03bPipeline.payloadBase64,
    paeHex: neg03bPipeline.paeHex,
    signatureHex: neg03bPipeline.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "schema-version-too-low",
  };

  // =========================================================================
  // NEG-04: key-not-found (Step 5 — unknown keyid in envelope)
  //
  // Use the base valid signed envelope. Single mutation: the vector's `kid`
  // field records "unknown-kid-12345". Phase 52/53 harnesses use this `kid`
  // as the envelope signatures[0].keyid when building the envelope for
  // verifyReceipt. Steps 1-4 all pass (valid envelope format, valid JSON,
  // valid body shape, accepted version). Step 5 fires: lookup("unknown-kid-12345")
  // returns undefined → "key-not-found".
  // =========================================================================
  const neg04: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: BASE_NEGATIVE_BODY as unknown as Record<string, unknown>,
    canonicalBytesHex: base.canonicalBytesHex,
    payloadBase64: base.payloadBase64,
    paeHex: base.paeHex,
    signatureHex: base.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    // The mutated keyid — harness must use this as envelope signatures[0].keyid.
    // The KeySet has no entry for "unknown-kid-12345" → Step 5 fires.
    kid: "unknown-kid-12345",
    expectedResult: "key-not-found",
  };

  // =========================================================================
  // NEG-05: key-revoked (Step 6 — KeySet registers key as revoked)
  //
  // Identical to a valid signed envelope (kid = "spec-example-key-v0", all
  // steps 1-5 pass). The "revoked" condition is external: the harness must
  // register the key with state: "revoked" before calling verifyReceipt.
  // The optional `verifyKeyState: "revoked"` field communicates this to the
  // Phase 52 TS harness and Phase 53 Python harness (locked decision D-01).
  // =========================================================================
  const body05: CapabilityReceiptBody = {
    ...BASE_NEGATIVE_BODY,
    receiptId: "00000000-0000-4000-a000-000000000014",
    issuedAt: "2026-06-25T00:00:14.000Z",
  };
  const neg05Pipeline = await signBody(body05, signer);

  const neg05: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body05 as unknown as Record<string, unknown>,
    canonicalBytesHex: neg05Pipeline.canonicalBytesHex,
    payloadBase64: neg05Pipeline.payloadBase64,
    paeHex: neg05Pipeline.paeHex,
    signatureHex: neg05Pipeline.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "key-revoked",
    // Locked decision D-01: the harness must register this kid with state "revoked".
    verifyKeyState: "revoked",
  };

  // =========================================================================
  // NEG-06: canonicalization-mismatch (Step 7 — tampered payload bytes)
  //
  // Start with a valid signed envelope. THEN tamper the payload bytes by
  // appending a single ASCII space (0x20) before the closing '}'. The tampered
  // bytes are still valid JSON (JSON.parse succeeds), and JSON.parse produces
  // the same object as the original canonical bytes. But the byte string
  // differs from the canonical form.
  //
  // On verify: Steps 1-2 pass (valid envelope format; tampered bytes parse as
  // JSON). Step 3 passes (parsed object has correct shape). Step 4 passes
  // (version is v1.3). Step 5 passes (keyid found). Step 6 passes (active).
  // Step 7: canonicalizeReceiptBody(parsedBody) = original canonical bytes,
  // but decoded.payloadBytes = tampered bytes → mismatch → "canonicalization-mismatch".
  //
  // signatureHex = ORIGINAL valid sig (over original PAE, not tampered bytes).
  // payloadBase64 = base64(TAMPERED bytes).
  // canonicalBytesHex = ORIGINAL canonical hex.
  // body = same body object (JSON.parse of either set produces the same result).
  // The inconsistency is intentional — it's what the vector tests.
  // =========================================================================
  const body06: CapabilityReceiptBody = {
    ...BASE_NEGATIVE_BODY,
    receiptId: "00000000-0000-4000-a000-000000000015",
    issuedAt: "2026-06-25T00:00:15.000Z",
  };
  const neg06Pipeline = await signBody(body06, signer);

  // Tamper: take the canonical JSON string, append a space before the final '}'
  // to produce valid-but-non-canonical JSON.
  const canonicalJsonStr = new TextDecoder().decode(neg06Pipeline.canonicalBytes);
  // Validate: must end with '}'
  if (!canonicalJsonStr.endsWith("}")) {
    throw new Error(
      `NEG-06: canonical JSON does not end with '}': ${canonicalJsonStr.slice(-20)}`,
    );
  }
  // Insert a space before the last '}' — result is still valid JSON, same object.
  const tamperedJsonStr = canonicalJsonStr.slice(0, -1) + " }";
  const tamperedBytes = new TextEncoder().encode(tamperedJsonStr);
  const tamperedPayloadBase64 = base64Encode(tamperedBytes);

  // Sanity-check: tampered bytes must parse as JSON and re-canonicalize to the
  // original canonical bytes (proving same logical content, different byte string).
  let parsedTampered: unknown;
  try {
    parsedTampered = JSON.parse(tamperedJsonStr);
  } catch (e) {
    throw new Error(
      `NEG-06: tampered JSON is invalid — must parse as JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  // Re-canonicalize the parsed result and compare to the ORIGINAL canonical hex.
  // If equal, the tampered bytes parse to the same logical object — construction is correct.
  const reCanonical = canonicalize(parsedTampered);
  if (reCanonical === undefined) {
    throw new Error("NEG-06: canonicalize(parsedTampered) returned undefined");
  }
  const reCanonicalHex = toHex(new TextEncoder().encode(reCanonical));
  if (reCanonicalHex !== neg06Pipeline.canonicalBytesHex) {
    throw new Error(
      `NEG-06: tampered JSON re-canonicalizes to different bytes than original\n` +
        `  original canonical: ${neg06Pipeline.canonicalBytesHex}\n` +
        `  re-canonical from tampered: ${reCanonicalHex}`,
    );
  }
  // Verify the tampered bytes differ from canonical (the whole point of the tamper)
  const tamperedHex = toHex(tamperedBytes);
  if (tamperedHex === neg06Pipeline.canonicalBytesHex) {
    throw new Error(
      "NEG-06: tampered bytes are identical to canonical bytes — tamper had no effect",
    );
  }

  // Note: signatureHex is the ORIGINAL sig (over the PAE of the original canonical bytes).
  // payloadBase64 is the TAMPERED bytes (not the canonical form).
  // This intentional inconsistency is what triggers Step 7 in verifyReceipt.
  const neg06: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body06 as unknown as Record<string, unknown>,
    canonicalBytesHex: neg06Pipeline.canonicalBytesHex,  // ORIGINAL canonical hex
    payloadBase64: tamperedPayloadBase64,                  // TAMPERED bytes (base64)
    paeHex: neg06Pipeline.paeHex,                         // PAE over ORIGINAL canonical bytes
    signatureHex: neg06Pipeline.signatureHex,             // ORIGINAL valid sig over ORIGINAL PAE
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "canonicalization-mismatch",
  };

  // =========================================================================
  // NEG-07: signature-invalid (Step 8 — corrupted Ed25519 signature)
  //
  // Start with a fully valid signed envelope (all steps 1-7 pass: payload IS
  // the canonical bytes). Mutation: XOR the last byte of sigBytes with 0x01
  // (one bit flip). This invalidates the Ed25519 signature without touching
  // the payload. Step 8: verifyEd25519Signature returns false → "signature-invalid".
  //
  // payloadBase64 = valid canonical bytes (base64).
  // signatureHex = CORRUPTED signature (128 hex chars, last byte XOR'd with 0x01).
  // =========================================================================
  const body07: CapabilityReceiptBody = {
    ...BASE_NEGATIVE_BODY,
    receiptId: "00000000-0000-4000-a000-000000000016",
    issuedAt: "2026-06-25T00:00:16.000Z",
  };
  const neg07Pipeline = await signBody(body07, signer);

  // Corrupt the signature: flip the last byte's LSB
  const corruptSigBytes = new Uint8Array(neg07Pipeline.sigBytes);
  const lastIdx = corruptSigBytes.length - 1;
  if (lastIdx < 0) throw new Error("NEG-07: signature is empty — cannot corrupt");
  corruptSigBytes[lastIdx] = (corruptSigBytes[lastIdx] ?? 0) ^ 0x01;
  const corruptSignatureHex = toHex(corruptSigBytes);

  const neg07: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body07 as unknown as Record<string, unknown>,
    canonicalBytesHex: neg07Pipeline.canonicalBytesHex,
    payloadBase64: neg07Pipeline.payloadBase64,  // VALID canonical bytes (base64)
    paeHex: neg07Pipeline.paeHex,
    signatureHex: corruptSignatureHex,            // CORRUPTED sig (one bit flipped)
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "signature-invalid",
  };

  // =========================================================================
  // NEG-08: signature-invalid (Step 9 — body.kid mismatch — LOCKED DECISION #2)
  //
  // Approach: Build a body with body.kid = "wrong-kid" (not "spec-example-key-v0").
  // Canonicalize and sign normally with the EXAMPLE Ed25519 keypair.
  // Build the envelope with signatures[0].keyid = "spec-example-key-v0" (the
  // REAL kid — the one in the KeySet).
  //
  // On verify:
  //   Step 5: lookup("spec-example-key-v0") → entry found (EXAMPLE key, active).
  //   Step 6: state is active → passes.
  //   Step 7: canonicalize(parsedBody) = the original signed canonical bytes
  //           (body.kid is "wrong-kid" in both the canonical bytes AND the
  //           parsed body — they match) → passes.
  //   Step 8: Ed25519 verify over PAE(payload) with publicKeyJwk → passes
  //           (the signature IS valid — we signed the "wrong-kid" body with
  //           the EXAMPLE keypair, and the EXAMPLE keypair is what entry has).
  //   Step 9: body.kid ("wrong-kid") !== entry.kid ("spec-example-key-v0")
  //           → "signature-invalid".
  //
  // The vector's `kid` field records "spec-example-key-v0" (the envelope keyid
  // that the harness presents to verifyReceipt for the KeySet lookup). The
  // vector's `body.kid` records "wrong-kid" (the actual body content). This
  // convention is documented here so the Phase 52/53 harness authors understand
  // that `kid` is the lookup key, NOT necessarily body.kid for NEG-08.
  // =========================================================================
  const body08: CapabilityReceiptBody = {
    ...BASE_NEGATIVE_BODY,
    kid: "wrong-kid",  // The single mutation: body.kid differs from envelope keyid
    receiptId: "00000000-0000-4000-a000-000000000017",
    issuedAt: "2026-06-25T00:00:17.000Z",
  };
  const neg08Pipeline = await signBody(body08, signer);
  // The signature is VALID over the PAE of the "wrong-kid" body.
  // The envelope keyid is "spec-example-key-v0" (the real EXAMPLE key).

  const neg08: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: body08 as unknown as Record<string, unknown>,
    canonicalBytesHex: neg08Pipeline.canonicalBytesHex,
    payloadBase64: neg08Pipeline.payloadBase64,
    paeHex: neg08Pipeline.paeHex,
    signatureHex: neg08Pipeline.signatureHex,  // VALID sig over wrong-kid body
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    // kid records the ENVELOPE keyid ("spec-example-key-v0") — the harness
    // uses this for the KeySet lookup. body.kid is "wrong-kid".
    kid: KID,
    expectedResult: "signature-invalid",
  };

  // Return all 9 negative vectors in NEG-01 through NEG-08 order.
  // (NEG-03 splits into NEG-03a and NEG-03b, giving 9 total.)
  return [neg01, neg02, neg03a, neg03b, neg04, neg05, neg06, neg07, neg08];
}
