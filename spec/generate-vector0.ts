/**
 * spec/generate-vector0.ts — Throwaway vector #0 generator.
 *
 * Generates the committed worked-example bytes for SPEC.md §4.9 and Phase 51
 * conformance vector #0. Imports the REAL reference-implementation functions
 * directly (never hand-authors canonical bytes — D-03).
 *
 * Run from the repo root:
 *   pnpm exec tsx spec/generate-vector0.ts
 *
 * Exit 0 on success, 1 on any assertion failure.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { canonicalizeReceiptBody } from "../packages/lattice/src/receipts/canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
  encodeEnvelope,
} from "../packages/lattice/src/receipts/envelope.js";
import {
  DEFAULT_REDACTION_POLICY_ID,
  redactReceiptBody,
} from "../packages/lattice/src/receipts/redact.js";
import { createInMemorySigner } from "../packages/lattice/src/receipts/sign.js";
import { receiptCid } from "../packages/lattice/src/receipts/cid.js";
import type { CapabilityReceiptBody } from "../packages/lattice/src/receipts/types.js";

// ---------------------------------------------------------------------------
// EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION
//
// This Ed25519 keypair is committed to the repository solely for specification
// and conformance-testing purposes. It is NOT a production key. Any receipt
// signed with this keypair should be treated as a test artifact only.
//
// Generated once via:
//   node --input-type=module -e "
//     const p = await crypto.subtle.generateKey('Ed25519', true, ['sign','verify']);
//     const [priv, pub] = await Promise.all([
//       crypto.subtle.exportKey('jwk', p.privateKey),
//       crypto.subtle.exportKey('jwk', p.publicKey),
//     ]);
//     console.log(JSON.stringify({priv,pub},null,2));
//   "
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

// EXAMPLE/TEST-ONLY KEY MATERIAL — public component
const EXAMPLE_PUBLIC_KEY_JWK: JsonWebKey = {
  key_ops: ["verify"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

// Helper: convert Uint8Array to lowercase hex string.
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  let failed = false;

  // -------------------------------------------------------------------------
  // Step 0: Create the in-memory signer using the committed EXAMPLE keypair.
  // -------------------------------------------------------------------------
  const KID = "spec-example-key-v0";
  const signer = createInMemorySigner(EXAMPLE_PRIVATE_KEY_JWK, {
    kid: KID,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
  });
  console.log(`[Step 0] Signer created: kid=${KID}`);

  // -------------------------------------------------------------------------
  // Step 1: Assemble the fixed raw body.
  //
  // Fixed inputs per D-03/D-04/50-PATTERNS.md:
  //   - receiptId: fixed UUID (never crypto.randomUUID())
  //   - issuedAt: fixed timestamp
  //   - stepName: "分析-step" — non-ASCII JCS edge case (D-04 REQUIRED)
  //   - tripwireEvidence: kind "no-pii" — triggers the only redaction rule
  //     in the default "lattice.default.v1" policy (redact.ts lines 49-56),
  //     satisfying the D-04 requirement of ≥1 redaction.
  //   - usage.costUsd: I-JSON string (not a raw float)
  //   - outputHash: null (avoids object-serialization ambiguity in example)
  // -------------------------------------------------------------------------
  const body0: CapabilityReceiptBody = {
    version: "lattice-receipt/v1.3",
    receiptId: "00000000-0000-4000-a000-000000000001",
    runId: "spec-vector-0",
    issuedAt: "2026-06-25T00:00:00.000Z",
    kid: KID,
    stepName: "分析-step",
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
      promptTokens: 100,
      completionTokens: 42,
      costUsd: "0.001250",
    },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: DEFAULT_REDACTION_POLICY_ID,
    redactions: [], // populated by redactReceiptBody
    tripwireEvidence: {
      invariantId: "spec-tripwire-example",
      kind: "no-pii",
      path: "tripwireEvidence.observed",
      observed: "spec-example-tripwire",
      message: "no-pii detector triggered (spec example only)",
    },
  };
  console.log(
    `[Step 1] Body assembled: receiptId=${body0.receiptId} stepName="${body0.stepName}"`,
  );

  // -------------------------------------------------------------------------
  // Step 2: Redact BEFORE canonicalize (INVARIANT: redact → canonicalize → …)
  //
  // The default "lattice.default.v1" policy checks tripwireEvidence.kind ===
  // "no-pii" and pushes { path: "tripwireEvidence.observed", reason:
  // "no-pii-detector-substring-only" } into redactions[]. This guarantees
  // ≥1 redaction entry as required by D-04.
  // -------------------------------------------------------------------------
  const { body: redactedBody } = redactReceiptBody(body0, DEFAULT_REDACTION_POLICY_ID);
  console.log(
    `[Step 2] Redacted body: redactions.length=${redactedBody.redactions.length}`,
  );
  if (redactedBody.redactions.length > 0) {
    console.log(
      `         redactions[0]: path="${redactedBody.redactions[0]!.path}" reason="${redactedBody.redactions[0]!.reason}"`,
    );
  }

  // Assertion: ≥1 redaction MUST have fired (D-04 requirement).
  if (redactedBody.redactions.length < 1) {
    console.error(
      "ASSERTION FAILED: redactedBody.redactions.length must be >= 1 (D-04). " +
        "The tripwireEvidence.kind='no-pii' trigger in redact.ts must have fired.",
    );
    failed = true;
  }

  // -------------------------------------------------------------------------
  // Step 3: Canonicalize the redacted body (RFC 8785 JCS).
  // -------------------------------------------------------------------------
  const payloadBytes = canonicalizeReceiptBody(redactedBody);
  const canonicalBytesHex = toHex(payloadBytes);
  console.log(
    `[Step 3] Canonical bytes: ${payloadBytes.byteLength} bytes, hex prefix="${canonicalBytesHex.slice(0, 16)}..."`,
  );

  // -------------------------------------------------------------------------
  // Step 4: Base64-encode for the DSSE envelope (standard RFC 4648 §4, NOT url-safe).
  // -------------------------------------------------------------------------
  const payloadBase64 = base64Encode(payloadBytes);
  console.log(
    `[Step 4] Base64 payload: ${payloadBase64.length} chars, prefix="${payloadBase64.slice(0, 20)}..."`,
  );

  // -------------------------------------------------------------------------
  // Step 5: Build PAE — Pre-Authentication Encoding per DSSE v1.0.
  //         PAE signs the BASE64 string (not raw canonical bytes).
  // -------------------------------------------------------------------------
  const paeBytes = buildPae(PAYLOAD_TYPE, payloadBase64);
  const paeHex = toHex(paeBytes);
  console.log(
    `[Step 5] PAE: ${paeBytes.byteLength} bytes, hex prefix="${paeHex.slice(0, 16)}..."`,
  );

  // -------------------------------------------------------------------------
  // Step 6: Sign the PAE bytes with the committed Ed25519 keypair.
  // -------------------------------------------------------------------------
  const sigBytes = await signer.sign(paeBytes);
  const signatureHex = toHex(sigBytes);
  console.log(`[Step 6] Signature: ${sigBytes.byteLength} bytes, hex="${signatureHex}"`);

  // -------------------------------------------------------------------------
  // Step 7: Encode the DSSE envelope.
  // -------------------------------------------------------------------------
  const envelope = encodeEnvelope({
    payloadBytes,
    signatures: [{ keyid: KID, sig: sigBytes }],
  });
  console.log(
    `[Step 7] Envelope: payloadType="${envelope.payloadType}" signatures[0].keyid="${envelope.signatures[0]!.keyid}"`,
  );

  // -------------------------------------------------------------------------
  // Step 8: Derive CID — sha256:<hex> over the DSSE payload bytes.
  // -------------------------------------------------------------------------
  const cid = await receiptCid(envelope);
  console.log(`[Step 8] CID: "${cid}"`);

  // -------------------------------------------------------------------------
  // Structural sanity assertions before writing.
  // -------------------------------------------------------------------------

  // Assert: canonicalBytesHex is valid lowercase hex
  if (
    typeof canonicalBytesHex !== "string" ||
    canonicalBytesHex.length === 0 ||
    canonicalBytesHex.length % 2 !== 0 ||
    !/^[0-9a-f]+$/.test(canonicalBytesHex)
  ) {
    console.error(
      "ASSERTION FAILED: canonicalBytesHex must be a non-empty even-length lowercase hex string.",
    );
    failed = true;
  }

  // Assert: signatureHex is exactly 128 hex chars (64 bytes * 2)
  if (signatureHex.length !== 128) {
    console.error(
      `ASSERTION FAILED: signatureHex.length must be 128 (64 bytes * 2 hex chars). Got ${signatureHex.length}.`,
    );
    failed = true;
  }

  // Assert: cid starts with "sha256:" and is exactly 71 chars
  if (!cid.startsWith("sha256:") || cid.length !== 71) {
    console.error(
      `ASSERTION FAILED: cid must start with "sha256:" and be 71 chars. Got "${cid}" (len=${cid.length}).`,
    );
    failed = true;
  }

  // Assert: ≥1 redaction was produced (D-04)
  if (redactedBody.redactions.length < 1) {
    // Already logged above, just set failed
    failed = true;
  }

  if (failed) {
    console.error("\nOne or more assertions FAILED. Aborting fixture write.");
    process.exitCode = 1;
    return;
  }

  // -------------------------------------------------------------------------
  // Step 9: Write spec/vector0-fixture.json (relative to repo root).
  // -------------------------------------------------------------------------
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // spec/generate-vector0.ts → one level up is repo root
  const repoRoot = dirname(__dirname);
  const fixturePath = join(repoRoot, "spec", "vector0-fixture.json");

  const fixture = {
    WARNING:
      "EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION. This keypair is committed for specification purposes only.",
    body: redactedBody,
    canonicalBytesHex,
    payloadBase64,
    paeHex,
    signatureHex,
    envelope,
    cid,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
  };

  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + "\n", "utf8");
  console.log(`\n[Step 9] Wrote fixture: ${fixturePath}`);
  console.log(
    `         Fields: body, canonicalBytesHex (${canonicalBytesHex.length / 2}B), ` +
      `payloadBase64, paeHex, signatureHex (128 hex), envelope, cid="${cid}", publicKeyJwk`,
  );
  console.log("\nAll assertions PASSED. Exit 0.");
  process.exitCode = 0;
}

main().catch((err: unknown) => {
  console.error("Unhandled error in generate-vector0.ts:", err);
  process.exitCode = 1;
});
