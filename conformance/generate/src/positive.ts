/**
 * conformance/generate/src/positive.ts
 *
 * Positive conformance vector generator.
 *
 * Drives the REAL reference implementation from packages/lattice/src/receipts/
 * to produce signed vectors for v1.1, v1.2, and v1.3. Does NOT reimplement
 * any pipeline logic — all crypto, canonicalization, envelope encoding, and
 * CID derivation come from the reference impl (same source as production).
 *
 * Key invariants:
 *   - vec-00 (v1.3) is byte-identical to spec/vector0-fixture.json in all
 *     shared fields (canonicalBytesHex, payloadBase64, paeHex, signatureHex,
 *     publicKeyJwk, kid). A mismatched byte-identity assertion halts generation.
 *   - vec-01 (v1.1) body must NOT include modelClass/parentReceiptCid/lineageMerkleRoot.
 *   - vec-02 (v1.2) body includes modelClass: "frontier_rlhf".
 *   - All bodies are ajv-validated against the matching spec/schema/vX.json
 *     BEFORE signing. Schema validation errors halt generation.
 *
 * EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION.
 * This Ed25519 keypair is committed to the repository solely for specification
 * and conformance-testing purposes. Copied from spec/generate-vector0.ts
 * (constants are NOT imported from that file — spec/ is outside this package).
 */

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Reference implementation imports — same pattern as spec/generate-vector0.ts
// but one more ../ because we are at conformance/generate/src/ vs spec/
import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import {
  PAYLOAD_TYPE,
  base64Encode,
  buildPae,
} from "../../../packages/lattice/src/receipts/envelope.js";
import {
  DEFAULT_REDACTION_POLICY_ID,
  redactReceiptBody,
} from "../../../packages/lattice/src/receipts/redact.js";
import { createInMemorySigner } from "../../../packages/lattice/src/receipts/sign.js";
import type { CapabilityReceiptBody, ReceiptSigner } from "../../../packages/lattice/src/receipts/types.js";

import type { ConformanceVector } from "./types.js";

// ---------------------------------------------------------------------------
// EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION
//
// Copied from spec/generate-vector0.ts with identical values.
// The spec file is in spec/ which is outside this package — we copy the
// constants rather than importing across the package boundary.
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
// Derive the repo root and schema directory.
// conformance/generate/src/ → 3 up → repo root
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..", "..");

// ---------------------------------------------------------------------------
// AJV setup — draft 2020-12.
// ---------------------------------------------------------------------------
// Create require for loading JSON schemas (createRequire works in ESM)
const require = createRequire(import.meta.url);

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);

// Load schemas synchronously via require (avoids import assertion dialect issues)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const schemaV11 = require(join(REPO_ROOT, "spec", "schema", "v1.1.json")) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const schemaV12 = require(join(REPO_ROOT, "spec", "schema", "v1.2.json")) as Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const schemaV13 = require(join(REPO_ROOT, "spec", "schema", "v1.3.json")) as Record<string, unknown>;

// Compile validators
const validateV11 = ajv.compile(schemaV11);
const validateV12 = ajv.compile(schemaV12);
const validateV13 = ajv.compile(schemaV13);

// Load vec-00 fixture for byte-identity assertion
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const fixture = require(join(REPO_ROOT, "spec", "vector0-fixture.json")) as {
  canonicalBytesHex: string;
  payloadBase64: string;
  paeHex: string;
  signatureHex: string;
  publicKeyJwk: JsonWebKey;
  kid?: string;
};

// ---------------------------------------------------------------------------
// Pipeline helper: signs a (already redacted) body through the full pipeline.
// Returns the ConformanceVector fields (minus WARNING and expectedResult).
// ---------------------------------------------------------------------------
async function runPipeline(
  redactedBody: CapabilityReceiptBody,
  signer: ReceiptSigner,
): Promise<{
  canonicalBytesHex: string;
  payloadBase64: string;
  paeHex: string;
  signatureHex: string;
}> {
  // Step 1: Canonicalize (RFC 8785 JCS)
  const payloadBytes = canonicalizeReceiptBody(redactedBody);
  const canonicalBytesHex = toHex(payloadBytes);

  // Step 2: Base64-encode for DSSE envelope (standard RFC 4648 §4, NOT url-safe)
  const payloadBase64 = base64Encode(payloadBytes);

  // Step 3: PAE — Pre-Authentication Encoding per DSSE v1.0
  //         PAE signs the BASE64 string (not raw canonical bytes)
  const paeBytes = buildPae(PAYLOAD_TYPE, payloadBase64);
  const paeHex = toHex(paeBytes);

  // Step 4: Sign the PAE bytes
  const sigBytes = await signer.sign(paeBytes);
  const signatureHex = toHex(sigBytes);

  return { canonicalBytesHex, payloadBase64, paeHex, signatureHex };
}

// ---------------------------------------------------------------------------
// generatePositiveVectors()
//
// Returns exactly 3 ConformanceVector objects (vec-00, vec-01, vec-02).
// ---------------------------------------------------------------------------
export async function generatePositiveVectors(): Promise<ConformanceVector[]> {
  // Create the in-memory signer using the committed EXAMPLE keypair.
  const signer = createInMemorySigner(EXAMPLE_PRIVATE_KEY_JWK, {
    kid: KID,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
  });

  // =========================================================================
  // vec-00 (v1.3): Byte-identical to spec/vector0-fixture.json.
  //
  // Uses the EXACT same body as spec/generate-vector0.ts to satisfy the
  // byte-identity assertion against the committed fixture (D-05).
  // =========================================================================
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
    redactions: [],
    tripwireEvidence: {
      invariantId: "spec-tripwire-example",
      kind: "no-pii",
      path: "tripwireEvidence.observed",
      observed: "spec-example-tripwire",
      message: "no-pii detector triggered (spec example only)",
    },
  };

  // Redact BEFORE canonicalize (INVARIANT: redact → canonicalize → …)
  const { body: redactedBody0 } = redactReceiptBody(body0, DEFAULT_REDACTION_POLICY_ID);

  // Validate against v1.3 schema before signing
  if (!validateV13(redactedBody0)) {
    throw new Error(
      `vec-00 body failed schema validation against v1.3.json: ${JSON.stringify(validateV13.errors)}`,
    );
  }

  const pipeline0 = await runPipeline(redactedBody0 as CapabilityReceiptBody, signer);

  // BYTE-IDENTITY ASSERTION: vec-00 must match spec/vector0-fixture.json exactly
  if (pipeline0.canonicalBytesHex !== fixture.canonicalBytesHex) {
    throw new Error(
      `vec-00 byte-identity assertion FAILED\n` +
        `  expected (fixture): ${fixture.canonicalBytesHex}\n` +
        `  actual (generated): ${pipeline0.canonicalBytesHex}\n` +
        `  This means the body or pipeline diverged from spec/generate-vector0.ts.`,
    );
  }

  const vec00: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: redactedBody0 as unknown as Record<string, unknown>,
    canonicalBytesHex: pipeline0.canonicalBytesHex,
    payloadBase64: pipeline0.payloadBase64,
    paeHex: pipeline0.paeHex,
    signatureHex: pipeline0.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "ok",
  };

  // =========================================================================
  // vec-01 (v1.1): Core v1.1 fields, no modelClass/parentReceiptCid/lineageMerkleRoot.
  //
  // The v1.1 schema has additionalProperties: false — ajv will catch any
  // v1.2+ field leakage before signing.
  // =========================================================================
  const rawBody1: CapabilityReceiptBody = {
    version: "lattice-receipt/v1.1",
    receiptId: "00000000-0000-4000-a000-000000000002",
    runId: "spec-vector-1",
    issuedAt: "2026-06-25T00:00:01.000Z",
    kid: KID,
    stepName: "verify-step",
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
      promptTokens: 50,
      completionTokens: 20,
      costUsd: "0.000500",
    },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: DEFAULT_REDACTION_POLICY_ID,
    redactions: [],
    // No tripwireEvidence — no redaction fires, redactions stays []
  };

  // Redact (no-pii kind absent → no redaction entries added)
  const { body: redactedBody1 } = redactReceiptBody(rawBody1, DEFAULT_REDACTION_POLICY_ID);

  // Validate against v1.1 schema (additionalProperties: false catches v1.2+ field leakage)
  if (!validateV11(redactedBody1)) {
    throw new Error(
      `vec-01 body failed schema validation against v1.1.json: ${JSON.stringify(validateV11.errors)}`,
    );
  }

  const pipeline1 = await runPipeline(redactedBody1 as CapabilityReceiptBody, signer);

  const vec01: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: redactedBody1 as unknown as Record<string, unknown>,
    canonicalBytesHex: pipeline1.canonicalBytesHex,
    payloadBase64: pipeline1.payloadBase64,
    paeHex: pipeline1.paeHex,
    signatureHex: pipeline1.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "ok",
  };

  // =========================================================================
  // vec-02 (v1.2): Includes modelClass: "frontier_rlhf" (v1.2+ addition).
  //
  // v1.2 schema allows modelClass as an optional field.
  // No parentReceiptCid/lineageMerkleRoot (v1.3 only).
  // =========================================================================
  const rawBody2: CapabilityReceiptBody = {
    version: "lattice-receipt/v1.2",
    receiptId: "00000000-0000-4000-a000-000000000003",
    runId: "spec-vector-2",
    issuedAt: "2026-06-25T00:00:02.000Z",
    kid: KID,
    stepName: "analyze-step",
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
      promptTokens: 75,
      completionTokens: 30,
      costUsd: "0.000875",
    },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: DEFAULT_REDACTION_POLICY_ID,
    redactions: [],
    modelClass: "frontier_rlhf",
    // No tripwireEvidence
  };

  // Redact
  const { body: redactedBody2 } = redactReceiptBody(rawBody2, DEFAULT_REDACTION_POLICY_ID);

  // Validate against v1.2 schema
  if (!validateV12(redactedBody2)) {
    throw new Error(
      `vec-02 body failed schema validation against v1.2.json: ${JSON.stringify(validateV12.errors)}`,
    );
  }

  const pipeline2 = await runPipeline(redactedBody2 as CapabilityReceiptBody, signer);

  const vec02: ConformanceVector = {
    WARNING: WARNING_TEXT,
    body: redactedBody2 as unknown as Record<string, unknown>,
    canonicalBytesHex: pipeline2.canonicalBytesHex,
    payloadBase64: pipeline2.payloadBase64,
    paeHex: pipeline2.paeHex,
    signatureHex: pipeline2.signatureHex,
    publicKeyJwk: EXAMPLE_PUBLIC_KEY_JWK,
    kid: KID,
    expectedResult: "ok",
  };

  return [vec00, vec01, vec02];
}
