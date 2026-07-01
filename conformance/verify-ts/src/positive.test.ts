/**
 * conformance/verify-ts/src/positive.test.ts
 *
 * TSCONF-01 — positive vector 4-step byte-identity re-derivation.
 *
 * For each of the 3 committed positive vectors (conformance/vectors/positive/),
 * re-derives every pipeline output using the SAME reference-implementation
 * functions the Phase 51 generator called, and asserts byte-identity/verdict
 * match at every step:
 *   1. canonicalizeReceiptBody(body)      === vector.canonicalBytesHex
 *   2. buildPae(PAYLOAD_TYPE, payload)    === vector.paeHex
 *   3. verifyEd25519Signature(...)        === true
 *   4. verifyReceipt(envelope, keySet)    === { ok: true }
 *
 * All 4 reference-implementation calls import directly from
 * packages/lattice/src/receipts/*.ts source (never dist/published) — this
 * package never reimplements canonicalization, PAE, or signature logic.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import { PAYLOAD_TYPE, buildPae } from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import { verifyEd25519Signature } from "../../../packages/lattice/src/receipts/sign.js";
import type {
  CapabilityReceiptBody,
  ReceiptEnvelope,
} from "../../../packages/lattice/src/receipts/types.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";

import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js";

const POSITIVE_DIR = join(__dirname, "..", "..", "vectors", "positive");

/** Copied verbatim from conformance/generate/src/positive.ts lines 83-85. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface LoadedVector {
  readonly id: string;
  readonly vector: ConformanceVector;
}

const vectors: LoadedVector[] = readdirSync(POSITIVE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    id: f,
    vector: JSON.parse(readFileSync(join(POSITIVE_DIR, f), "utf8")) as ConformanceVector,
  }));

describe.each(vectors)("positive vector: $id", ({ vector }: LoadedVector) => {
  it("Step 1 — canonicalizeReceiptBody(body) matches canonicalBytesHex", () => {
    const bytes = canonicalizeReceiptBody(vector.body as unknown as CapabilityReceiptBody);
    expect(toHex(bytes)).toBe(vector.canonicalBytesHex);
  });

  it("Step 2 — buildPae(PAYLOAD_TYPE, payloadBase64) matches paeHex", () => {
    const paeBytes = buildPae(PAYLOAD_TYPE, vector.payloadBase64);
    expect(toHex(paeBytes)).toBe(vector.paeHex);
  });

  it("Step 3 — verifyEd25519Signature(publicKeyJwk, pae, sig) === true", async () => {
    const paeBytes = buildPae(PAYLOAD_TYPE, vector.payloadBase64);
    const sigBytes = Buffer.from(vector.signatureHex, "hex");
    const valid = await verifyEd25519Signature(vector.publicKeyJwk, paeBytes, sigBytes);
    expect(valid).toBe(true);
  });

  it("Step 4 — verifyReceipt(envelope, keySet) verdict === 'ok'", async () => {
    const envelope: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload: vector.payloadBase64,
      signatures: [
        {
          keyid: vector.kid,
          sig: Buffer.from(vector.signatureHex, "hex").toString("base64"),
        },
      ],
    };
    const keySet = createMemoryKeySet([
      { kid: vector.kid, publicKeyJwk: vector.publicKeyJwk, state: "active" },
    ]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.kid).toBe(vector.kid);
    }
  });
});
