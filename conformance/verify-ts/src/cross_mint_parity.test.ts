import { readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import type { ReceiptEnvelope } from "../../../packages/lattice/src/receipts/types.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";

import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js";

const RUN_CROSS_MINT = process.env.LATTICE_RUN_CROSS_MINT === "1";

const REPO_ROOT = join(__dirname, "..", "..", "..");
const VECTOR_PATH = join(REPO_ROOT, "conformance", "vectors", "positive", "vec-00-v1.3.json");
const PYTHON_SRC = join(REPO_ROOT, "clients", "python", "src");

const EXAMPLE_PRIVATE_KEY_JWK: JsonWebKey = {
  key_ops: ["sign"],
  ext: true,
  alg: "Ed25519",
  crv: "Ed25519",
  d: "U0lQtD0LB_4s1248jIAPfXB6_WDu6HOaaSvALETgFNg",
  x: "SHJN4TARUeboPqG7lhz-jaB-4udQw_a-MextAQCyRU8",
  kty: "OKP",
};

interface PythonMintResult {
  readonly envelope: ReceiptEnvelope;
  readonly canonicalHex: string;
  readonly payloadBase64: string;
  readonly paeHex: string;
  readonly signatureHex: string;
}

describe.skipIf(!RUN_CROSS_MINT)("cross-mint parity", () => {
  it("TypeScript verifyReceipt accepts a Python-minted receipt", async () => {
    const vector = JSON.parse(readFileSync(VECTOR_PATH, "utf8")) as ConformanceVector;
    const python = process.env.PYTHON ?? "python3";
    const pythonPath =
      process.env.PYTHONPATH === undefined || process.env.PYTHONPATH === ""
        ? PYTHON_SRC
        : `${PYTHON_SRC}${delimiter}${process.env.PYTHONPATH}`;

    const child = spawnSync(python, ["-m", "lattice_receipt", "mint-json"], {
      cwd: REPO_ROOT,
      input: JSON.stringify({
        body: vector.body,
        privateKeyJwk: EXAMPLE_PRIVATE_KEY_JWK,
      }),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
      },
    });

    expect(child.status, child.stderr).toBe(0);
    const minted = JSON.parse(child.stdout) as PythonMintResult;

    expect(minted.canonicalHex).toBe(vector.canonicalBytesHex);
    expect(minted.payloadBase64).toBe(vector.payloadBase64);
    expect(minted.paeHex).toBe(vector.paeHex);
    expect(minted.signatureHex).toBe(vector.signatureHex);

    const result = await verifyReceipt(
      minted.envelope,
      createMemoryKeySet([
        {
          kid: vector.kid,
          publicKeyJwk: vector.publicKeyJwk,
          state: "active",
        },
      ]),
    );

    expect(result.ok).toBe(true);
  });
});

