/**
 * conformance/verify-ts/src/negative.test.ts
 *
 * TSCONF-01 — negative vector exact VerifyErrorKind assertion.
 *
 * For each of the 9 committed negative vectors (conformance/vectors/negative/),
 * calls verifyReceipt(envelope, keySet) and asserts result.ok === false AND
 * result.error.kind === vector.expectedResult EXACTLY (strict toBe match,
 * never a loose "verification failed" check). Together the 9 vectors cover
 * all 7 VerifyErrorKind values (schema-version-too-low appears twice via
 * neg-03a/neg-03b; signature-invalid appears twice via neg-07/neg-08).
 *
 * Two special-case branches (T-52-03 mitigation, per CONTEXT.md locked
 * decision and RESEARCH.md Pitfalls 1-2):
 *   - neg-01 (envelope-malformed): vector.envelope is used VERBATIM as the
 *     input to verifyReceipt — its payloadType is intentionally
 *     "application/json", not PAYLOAD_TYPE. Reconstructing "correctly" from
 *     the vector's standard fields would silently defeat this vector.
 *   - neg-04 (key-not-found): the KeySet registers ZERO entries — vector.kid
 *     ("unknown-kid-12345") must NEVER be registered, or the vector's entire
 *     premise (a keyid absent from the KeySet) is defeated.
 *
 * All other 8 vectors reconstruct the envelope from standard fields exactly
 * as in positive.test.ts's Step 4 pattern (hex-decode signatureHex then
 * base64-encode for the sig field — never assign the raw hex string
 * directly, per RESEARCH.md Pitfall 1).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PAYLOAD_TYPE } from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import type { ReceiptEnvelope } from "../../../packages/lattice/src/receipts/types.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";

import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js";

const NEGATIVE_DIR = join(__dirname, "..", "..", "vectors", "negative");

interface LoadedVector {
  readonly id: string;
  readonly vector: ConformanceVector;
}

const vectors: LoadedVector[] = readdirSync(NEGATIVE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => ({
    id: f,
    vector: JSON.parse(readFileSync(join(NEGATIVE_DIR, f), "utf8")) as ConformanceVector,
  }));

/**
 * Builds the ReceiptEnvelope submitted to verifyReceipt for a given vector.
 *
 * neg-01 only: vector.envelope is defined and MUST be used verbatim (it IS
 * the malformed input — reconstructing from standard fields would silently
 * defeat the vector). All other vectors: reconstruct from standard fields.
 * Respects exactOptionalPropertyTypes: true — never assigns envelope:
 * undefined; the branch either returns vector.envelope directly or builds a
 * fresh object literal.
 */
function buildEnvelope(vector: ConformanceVector): ReceiptEnvelope {
  if (vector.envelope !== undefined) {
    return vector.envelope;
  }
  return {
    payloadType: PAYLOAD_TYPE,
    payload: vector.payloadBase64,
    signatures: [
      {
        // NOT necessarily body.kid — see neg-08, where vector.kid is the
        // envelope keyid ("spec-example-key-v0") but body.kid is "wrong-kid".
        keyid: vector.kid,
        sig: Buffer.from(vector.signatureHex, "hex").toString("base64"),
      },
    ],
  };
}

describe.each(vectors)("negative vector: $id", ({ vector }: LoadedVector) => {
  it(`verdict matches expectedResult "${vector.expectedResult}"`, async () => {
    const envelope = buildEnvelope(vector);

    const keySet = createMemoryKeySet(
      // neg-04 (key-not-found): the KeySet must NOT contain vector.kid
      // ("unknown-kid-12345") — register zero entries so the lookup for
      // vector.kid genuinely returns undefined.
      vector.expectedResult === "key-not-found"
        ? []
        : [
            {
              kid: vector.kid,
              publicKeyJwk: vector.publicKeyJwk,
              state: vector.verifyKeyState ?? "active",
            },
          ],
    );

    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(vector.expectedResult);
    }
  });
});
