import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { StandardConformanceVector } from "../../generate/src/types.js";
import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import { receiptCid } from "../../../packages/lattice/src/receipts/cid.js";
import {
  PAYLOAD_TYPE,
  base64Decode,
  buildPae,
} from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import {
  createReceipt,
  type CreateReceiptInput,
} from "../../../packages/lattice/src/receipts/receipt.js";
import { createInMemorySigner } from "../../../packages/lattice/src/receipts/sign.js";
import type {
  CapabilityReceiptBody,
  ReceiptEnvelope,
} from "../../../packages/lattice/src/receipts/types.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";

const runCrossMint = process.env.LATTICE_RUN_CROSS_MINT === "1";
const sourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(sourceDir, "..", "..", "..");
const pythonSource = join(repoRoot, "clients", "python", "src");
const positiveRoot = join(
  repoRoot,
  "conformance",
  "vectors",
  "standard",
  "positive",
);

const examplePrivateKeyJwk: JsonWebKey = {
  key_ops: ["sign"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  d: "U0lQtD0LB_4s1248jIAPfXB6_WDu6HOaaSvALETgFNg",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

const examplePublicKeyJwk: JsonWebKey = {
  key_ops: ["verify"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

interface PythonMintResult {
  readonly envelope: ReceiptEnvelope;
  readonly canonicalHex: string;
  readonly payloadBase64: string;
  readonly paeHex: string;
  readonly signatureHex: string;
  readonly receiptCid: string;
}

interface PythonVerifyResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly body?: CapabilityReceiptBody;
  readonly verificationProfile?: string;
  readonly deprecated?: boolean;
  readonly canonicalHex?: string;
  readonly paeHex?: string;
  readonly receiptCid?: string;
}

function loadVector(filename: string): StandardConformanceVector {
  return JSON.parse(
    readFileSync(join(positiveRoot, filename), "utf8"),
  ) as StandardConformanceVector;
}

function runPython<T>(command: "mint-json" | "verify-json", request: unknown): T {
  const python = process.env.PYTHON ?? "python3";
  const pythonPath =
    process.env.PYTHONPATH === undefined || process.env.PYTHONPATH === ""
      ? pythonSource
      : `${pythonSource}${delimiter}${process.env.PYTHONPATH}`;
  const child = spawnSync(python, ["-m", "lattice_receipt", command], {
    cwd: repoRoot,
    input: `${JSON.stringify(request)}\n`,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: pythonPath },
  });
  if (child.error !== undefined) {
    throw child.error;
  }
  if (child.status !== 0) {
    throw new Error(
      `${command} exited ${String(child.status)}: ${child.stderr.trim()}`,
    );
  }
  return JSON.parse(child.stdout) as T;
}

function keySet(vector: StandardConformanceVector) {
  return createMemoryKeySet([
    {
      kid: vector.kid,
      publicKeyJwk: vector.publicKeyJwk,
      state: "active",
    },
  ]);
}

function receiptInput(body: CapabilityReceiptBody): CreateReceiptInput {
  return {
    runId: body.runId,
    issuedAt: body.issuedAt,
    receiptId: body.receiptId,
    model: body.model,
    route: body.route,
    usage: {
      promptTokens: body.usage.promptTokens,
      completionTokens: body.usage.completionTokens,
      costUsd:
        body.usage.costUsd === null ? null : Number(body.usage.costUsd),
    },
    contractVerdict: body.contractVerdict,
    contractHash: body.contractHash,
    inputHashes: body.inputHashes,
    outputHash: body.outputHash,
    redactionPolicyId: body.redactionPolicyId,
  };
}

describe.skipIf(!runCrossMint)("reciprocal TypeScript/Python mint parity", () => {
  it("verifies a Python-minted standard receipt in TypeScript", async () => {
    const vector = loadVector("vec-00-v1.4-unicode-redaction.json");
    const minted = runPython<PythonMintResult>("mint-json", {
      body: vector.body,
      privateKeyJwk: examplePrivateKeyJwk,
    });

    expect(minted.canonicalHex).toBe(vector.canonicalBytesHex);
    expect(minted.payloadBase64).toBe(vector.payloadBase64);
    expect(minted.paeHex).toBe(vector.paeHex);
    expect(minted.signatureHex).toBe(vector.signatureHex);
    await expect(receiptCid(minted.envelope)).resolves.toBe(minted.receiptCid);

    const result = await verifyReceipt(minted.envelope, keySet(vector), {
      legacyPolicy: "reject",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body).toEqual(vector.body);
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.signatureProfile).toBe("dsse-v1");
      expect(result.body.kid).toBe(vector.kid);
      expect(result.verificationProfile).toBe("dsse-v1");
      expect(result.deprecated).toBe(false);
    }
  });

  it("verifies a TypeScript-minted standard receipt in Python", async () => {
    const vector = loadVector("vec-01-v1.4-minimal.json");
    const expectedBody = vector.body as unknown as CapabilityReceiptBody;
    const signer = createInMemorySigner(examplePrivateKeyJwk, {
      kid: vector.kid,
      publicKeyJwk: examplePublicKeyJwk,
    });
    const envelope = await createReceipt(receiptInput(expectedBody), signer);
    const canonical = base64Decode(envelope.payload);
    const body = JSON.parse(
      new TextDecoder().decode(canonical),
    ) as CapabilityReceiptBody;
    const pae = buildPae(PAYLOAD_TYPE, canonical);
    const cid = await receiptCid(envelope);

    expect(body).toEqual(vector.body);
    expect(Buffer.from(canonical).toString("hex")).toBe(vector.canonicalBytesHex);
    expect(Buffer.from(canonicalizeReceiptBody(body))).toEqual(
      Buffer.from(canonical),
    );
    expect(Buffer.from(pae).toString("hex")).toBe(vector.paeHex);
    expect(
      Buffer.from(envelope.signatures[0]?.sig ?? "", "base64").toString("hex"),
    ).toBe(vector.signatureHex);

    const verified = runPython<PythonVerifyResult>("verify-json", {
      envelope,
      publicKeyJwk: examplePublicKeyJwk,
      keyState: "active",
      legacyPolicy: "reject",
    });
    expect(verified).toMatchObject({
      ok: true,
      body,
      verificationProfile: "dsse-v1",
      deprecated: false,
      canonicalHex: vector.canonicalBytesHex,
      paeHex: vector.paeHex,
      receiptCid: cid,
    });
    expect(verified.body?.version).toBe("lattice-receipt/v1.4");
    expect(verified.body?.signatureProfile).toBe("dsse-v1");
    expect(verified.body?.kid).toBe(vector.kid);
  });
});
