import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { StandardConformanceVector } from "../../generate/src/types.js";
import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import { receiptCid } from "../../../packages/lattice/src/receipts/cid.js";
import {
  PAYLOAD_TYPE,
  buildPae,
} from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import { verifyEd25519Signature } from "../../../packages/lattice/src/receipts/sign.js";
import type {
  CapabilityReceiptBody,
  ReceiptEnvelope,
  VerifyErrorKind,
} from "../../../packages/lattice/src/receipts/types.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";

interface LegacyConformanceVector {
  readonly WARNING: string;
  readonly body: Record<string, unknown>;
  readonly canonicalBytesHex: string;
  readonly payloadBase64: string;
  readonly paeHex: string;
  readonly signatureHex: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
  readonly expectedResult: "ok" | VerifyErrorKind;
}

interface LoadedVector<T> {
  readonly id: string;
  readonly vector: T;
}

interface EnvelopeFields {
  readonly payloadBase64: string;
  readonly signatureHex: string;
  readonly kid: string;
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

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

function buildHistoricalPae(payloadType: string, payloadBase64: string): Uint8Array {
  const typeBytes = Buffer.from(payloadType, "utf8");
  const transportBytes = Buffer.from(payloadBase64, "utf8");
  return Buffer.concat([
    Buffer.from(`DSSEv1 ${typeBytes.byteLength} `, "utf8"),
    typeBytes,
    Buffer.from(` ${transportBytes.byteLength} `, "utf8"),
    transportBytes,
  ]);
}

function buildEnvelope(vector: EnvelopeFields): ReceiptEnvelope {
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

function buildKeySet(vector: {
  readonly kid: string;
  readonly publicKeyJwk: JsonWebKey;
}) {
  return createMemoryKeySet([
    { kid: vector.kid, publicKeyJwk: vector.publicKeyJwk, state: "active" },
  ]);
}

const legacyVectors = loadVectors<LegacyConformanceVector>(
  join(vectorsRoot, "legacy", "positive"),
);
const standardVectors = loadVectors<StandardConformanceVector>(
  join(vectorsRoot, "standard", "positive"),
);

describe("explicit positive corpus profiles", () => {
  it("loads three immutable legacy and three current standard vectors", () => {
    expect(legacyVectors).toHaveLength(3);
    expect(standardVectors).toHaveLength(3);
  });
});

describe.each(legacyVectors)("legacy positive: $id", ({ vector }) => {
  it("matches canonical bytes and historical PAE bytes", async () => {
    const canonical = canonicalizeReceiptBody(
      vector.body as unknown as CapabilityReceiptBody,
    );
    expect(toHex(canonical)).toBe(vector.canonicalBytesHex);

    const historicalPae = buildHistoricalPae(PAYLOAD_TYPE, vector.payloadBase64);
    expect(toHex(historicalPae)).toBe(vector.paeHex);
    await expect(
      verifyEd25519Signature(
        vector.publicKeyJwk,
        historicalPae,
        Buffer.from(vector.signatureHex, "hex"),
      ),
    ).resolves.toBe(true);
  });

  it("selects the deprecated profile by default and rejects it strictly", async () => {
    const envelope = buildEnvelope(vector);
    const keySet = buildKeySet(vector);
    const allowed = await verifyReceipt(envelope, keySet);
    expect(allowed.ok).toBe(true);
    if (allowed.ok) {
      expect(allowed.body.kid).toBe(vector.kid);
      expect(allowed.verificationProfile).toBe("lattice-legacy-base64-pae");
      expect(allowed.deprecated).toBe(true);
    }

    const rejected = await verifyReceipt(envelope, keySet, {
      legacyPolicy: "reject",
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.error.kind).toBe("legacy-profile-rejected");
    }
  });
});

describe.each(standardVectors)("standard positive: $id", ({ vector }) => {
  it("rederives canonical bytes, raw-byte PAE, signature, and CID", async () => {
    expect(vector).toMatchObject({
      corpusProfile: "standard",
      schema: "spec/schema/v1.4.json",
      expectedSchemaResult: "valid",
      expectedVerificationProfile: "dsse-v1",
      expectedDeprecated: false,
      expectedResult: "ok",
    });

    const canonical = canonicalizeReceiptBody(
      vector.body as unknown as CapabilityReceiptBody,
    );
    expect(toHex(canonical)).toBe(vector.canonicalBytesHex);
    expect(Buffer.from(vector.payloadBase64, "base64")).toEqual(
      Buffer.from(canonical),
    );

    const pae = buildPae(PAYLOAD_TYPE, canonical);
    expect(toHex(pae)).toBe(vector.paeHex);
    await expect(
      verifyEd25519Signature(
        vector.publicKeyJwk,
        pae,
        Buffer.from(vector.signatureHex, "hex"),
      ),
    ).resolves.toBe(true);

    const envelope = buildEnvelope(vector);
    const expectedCid = `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
    await expect(receiptCid(envelope)).resolves.toBe(expectedCid);
  });

  it("verifies only as current dsse-v1 under strict policy", async () => {
    const result = await verifyReceipt(buildEnvelope(vector), buildKeySet(vector), {
      legacyPolicy: "reject",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.verificationProfile).toBe("dsse-v1");
      expect(result.deprecated).toBe(false);
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.signatureProfile).toBe("dsse-v1");
      expect(result.body.kid).toBe(vector.kid);
    }
  });
});
