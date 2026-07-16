import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { StandardConformanceVector } from "../../generate/src/types.js";
import { PAYLOAD_TYPE } from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import type {
  KeyState,
  ReceiptEnvelope,
  VerifyErrorKind,
} from "../../../packages/lattice/src/receipts/types.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";

interface VectorEnvelopeInput {
  readonly payloadType: string;
  readonly payload: string;
  readonly signatures: ReadonlyArray<{
    readonly keyid: string;
    readonly sig: string;
  }>;
}

interface LegacyConformanceVector {
  readonly body: Record<string, unknown>;
  readonly payloadBase64: string;
  readonly signatureHex: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
  readonly expectedResult: VerifyErrorKind;
  readonly verifyKeyState?: KeyState;
  readonly envelope?: VectorEnvelopeInput;
}

interface NegativeVectorFields {
  readonly payloadBase64: string;
  readonly signatureHex: string;
  readonly kid: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly expectedResult: "ok" | VerifyErrorKind;
  readonly verifyKeyState?: KeyState;
  readonly envelope?: VectorEnvelopeInput;
}

interface LoadedVector<T> {
  readonly id: string;
  readonly vector: T;
}

const sourceDir = dirname(fileURLToPath(import.meta.url));
const vectorsRoot = resolve(sourceDir, "..", "..", "vectors");

function loadVectors<T>(directory: string): Array<LoadedVector<T>> {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => ({
      id: name,
      vector: JSON.parse(readFileSync(join(directory, name), "utf8")) as T,
    }));
}

function buildEnvelope(vector: NegativeVectorFields): ReceiptEnvelope {
  if (vector.envelope !== undefined) {
    return vector.envelope as ReceiptEnvelope;
  }
  return {
    payloadType: PAYLOAD_TYPE,
    payload: vector.payloadBase64,
    signatures: [
      {
        keyid: vector.kid,
        sig: Buffer.from(vector.signatureHex, "hex").toString("base64"),
      },
    ],
  };
}

function buildKeySet(vector: NegativeVectorFields) {
  return createMemoryKeySet(
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
}

const legacyVectors = loadVectors<LegacyConformanceVector>(
  join(vectorsRoot, "legacy", "negative"),
);
const standardVectors = loadVectors<StandardConformanceVector>(
  join(vectorsRoot, "standard", "negative"),
);

describe("explicit negative corpus profiles", () => {
  it("loads nine immutable legacy and twelve current standard vectors", () => {
    expect(legacyVectors).toHaveLength(9);
    expect(standardVectors).toHaveLength(12);
  });
});

describe.each(legacyVectors)("legacy negative: $id", ({ vector }) => {
  it(`returns exact historical error ${vector.expectedResult}`, async () => {
    const result = await verifyReceipt(buildEnvelope(vector), buildKeySet(vector));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(vector.expectedResult);
    }
  });
});

describe.each(standardVectors)("standard negative: $id", ({ vector }) => {
  it(`returns exact standard error ${vector.expectedResult}`, async () => {
    expect(vector.corpusProfile).toBe("standard");
    expect(vector.schema).toBe("spec/schema/v1.4.json");
    expect(vector.expectedResult).not.toBe("ok");
    expect(vector.expectedVerificationProfile).toBeNull();
    expect(vector.expectedDeprecated).toBeNull();

    const result = await verifyReceipt(buildEnvelope(vector), buildKeySet(vector), {
      legacyPolicy: "reject",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(vector.expectedResult);
    }
  });
});

describe("standard adversarial ordering", () => {
  it("never falls back from v1.4 historical PAE under either policy", async () => {
    const vector = standardVectors.find(
      ({ vector: candidate }) => candidate.adversarialAxis === "legacy-pae-on-v1.4",
    )?.vector;
    expect(vector).toBeDefined();
    if (vector === undefined) return;

    for (const legacyPolicy of ["allow", "reject"] as const) {
      const result = await verifyReceipt(buildEnvelope(vector), buildKeySet(vector), {
        legacyPolicy,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("signature-invalid");
      }
    }
  });

  it("classifies noncanonical transport base64 as envelope-malformed", async () => {
    for (const axis of [
      "payload-base64-noncanonical",
      "signature-base64-noncanonical",
    ] as const) {
      const vector = standardVectors.find(
        ({ vector: candidate }) => candidate.adversarialAxis === axis,
      )?.vector;
      expect(vector).toBeDefined();
      if (vector === undefined) continue;

      const result = await verifyReceipt(buildEnvelope(vector), buildKeySet(vector), {
        legacyPolicy: "reject",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("envelope-malformed");
      }
    }
  });
});
