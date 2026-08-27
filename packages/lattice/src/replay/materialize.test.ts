/**
 * Phase 10 — materializeReplayEnvelope tests (RED).
 *
 * Round-trip flow under test:
 *   createReceipt -> materializeReplayEnvelope(receipt, { artifactLoader, keySet, ... })
 *   -> replayOffline -> outputHash matches the receipt's outputHash.
 *
 * Verify-FIRST ordering is required: the artifact loader MUST NOT be called
 * when receipt verification fails. Without this guarantee a tampered receipt
 * could trigger artifact resolution side effects.
 */

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

import { artifact, toArtifactRef } from "../artifacts/artifact.js";
import type { ArtifactInput } from "../artifacts/artifact.js";
import { contract } from "../contract/contract.js";
import { createReceipt } from "../receipts/receipt.js";
import { PAYLOAD_TYPE } from "../receipts/envelope.js";
import { createMemoryKeySet } from "../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import type { ReceiptEnvelope } from "../receipts/types.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import { materializeReplayEnvelope } from "./materialize.js";
import type { MaterializationError } from "./materialize.js";
import { replayOffline } from "./replay.js";

interface MaterializationFixture {
  readonly receipt: ReceiptEnvelope;
  readonly artifactLoader: (hash: string) => Promise<ArtifactInput>;
  readonly keySet: ReturnType<typeof createMemoryKeySet>;
  readonly inputs: readonly ArtifactInput[];
  readonly outputs: { readonly text: string };
  readonly outputHash: string;
}

interface ProtocolVector {
  readonly payloadBase64: string;
  readonly signatureHex: string;
  readonly publicKeyJwk: JsonWebKey;
  readonly kid: string;
}

const sourceDir = dirname(fileURLToPath(import.meta.url));
const vectorsRoot = resolve(
  sourceDir,
  "..",
  "..",
  "..",
  "..",
  "conformance",
  "vectors",
);

function loadProtocolVector(
  profile: "legacy" | "standard",
  filename: string,
): ProtocolVector {
  return JSON.parse(
    readFileSync(join(vectorsRoot, profile, "positive", filename), "utf8"),
  ) as ProtocolVector;
}

function receiptFromVector(vector: ProtocolVector): ReceiptEnvelope {
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

function keySetFromVector(vector: ProtocolVector) {
  return createMemoryKeySet([
    {
      kid: vector.kid,
      publicKeyJwk: vector.publicKeyJwk,
      state: "active",
    },
  ]);
}

async function buildSignedFixture(): Promise<MaterializationFixture> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const kid = "test-kid-10-01";
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  const keySet = createMemoryKeySet([
    { kid, publicKeyJwk, state: "active" },
  ]);

  const a1 = artifact.text("first artifact value", { id: "art-1" });
  const a2 = artifact.text("second artifact value", { id: "art-2" });
  const inputs = [a1, a2] as const;

  const inputHashes = await Promise.all(
    inputs.map(async (input) => {
      const fp = await fingerprintArtifactValue(
        (input as { readonly value?: unknown }).value,
      );
      return fp?.value ?? "";
    }),
  );

  const outputs = { text: "materialized output payload" };
  const outputHash =
    (await fingerprintArtifactValue(JSON.stringify(outputs)))?.value ?? "";

  const receipt = await createReceipt(
    {
      runId: "run-mat-1",
      model: { requested: "fake-model", observed: "fake-model" },
      route: {
        providerId: "fake-provider",
        capabilityId: "fake-capability",
        attemptNumber: 1,
      },
      usage: { promptTokens: 1, completionTokens: 1, costUsd: null },
      contractVerdict: "success",
      contractHash: null,
      inputHashes,
      outputHash,
    },
    signer,
  );

  const byHash = new Map<string, ArtifactInput>();
  for (const [i, input] of inputs.entries()) {
    byHash.set(inputHashes[i]!, input);
  }

  const artifactLoader = async (hash: string): Promise<ArtifactInput> => {
    const found = byHash.get(hash);
    if (found === undefined) {
      throw new Error(`Unknown artifact hash ${hash}`);
    }
    return found;
  };

  return {
    receipt,
    artifactLoader,
    keySet,
    inputs,
    outputs,
    outputHash,
  };
}

describe("MaterializationError", () => {
  it("is exported and discriminated by kind", () => {
    const verifyFailed: MaterializationError = {
      kind: "verify-failed",
      message: "signature invalid",
    };
    const loaderFailed: MaterializationError = {
      kind: "artifact-load-failed",
      message: "missing fixture",
    };
    const malformed: MaterializationError = {
      kind: "envelope-malformed",
      message: "bad envelope",
    };
    expect(verifyFailed.kind).toBe("verify-failed");
    expect(loaderFailed.kind).toBe("artifact-load-failed");
    expect(malformed.kind).toBe("envelope-malformed");
  });
});

describe("materializeReplayEnvelope", () => {
  it("preserves default compatibility for frozen legacy evidence", async () => {
    const vector = loadProtocolVector("legacy", "vec-00-v1.3.json");
    const loader = vi.fn(async () => artifact.text("unused"));
    const envelope = await materializeReplayEnvelope(receiptFromVector(vector), {
      artifactLoader: loader,
      keySet: keySetFromVector(vector),
    });

    expect(envelope.receipt).toEqual(receiptFromVector(vector));
    expect(envelope.plan.metadata?.["receiptId"]).toBe(
      "00000000-0000-4000-a000-000000000001",
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it("rejects frozen legacy evidence strictly before artifact loading", async () => {
    const vector = loadProtocolVector("legacy", "vec-00-v1.3.json");
    const loader = vi.fn(async () => artifact.text("must-not-load"));

    await expect(
      materializeReplayEnvelope(receiptFromVector(vector), {
        artifactLoader: loader,
        keySet: keySetFromVector(vector),
        legacyPolicy: "reject",
      }),
    ).rejects.toMatchObject({
      kind: "verify-failed",
      message: expect.stringContaining("legacy-profile-rejected"),
    });
    expect(loader).not.toHaveBeenCalled();
  });

  it("accepts standard v1.4 evidence under strict policy", async () => {
    const vector = loadProtocolVector(
      "standard",
      "vec-00-v1.4-unicode-redaction.json",
    );
    const loader = vi.fn(async () => artifact.text("unused"));
    const envelope = await materializeReplayEnvelope(receiptFromVector(vector), {
      artifactLoader: loader,
      keySet: keySetFromVector(vector),
      legacyPolicy: "reject",
    });

    expect(envelope.plan.metadata?.["runId"]).toBe(
      "standard-unicode-redaction",
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it("verifies the receipt BEFORE invoking the artifact loader", async () => {
    const { receipt, keySet } = await buildSignedFixture();

    // Tamper the receipt: flip the last byte of the signature so verification fails.
    const tampered: ReceiptEnvelope = {
      ...receipt,
      signatures: receipt.signatures.map((sig) => ({
        ...sig,
        sig: sig.sig.slice(0, -2) + (sig.sig.endsWith("A=") ? "B=" : "A="),
      })),
    };

    let loaderCalls = 0;
    const loader = async (): Promise<ArtifactInput> => {
      loaderCalls += 1;
      return artifact.text("should-not-be-loaded");
    };

    await expect(
      materializeReplayEnvelope(tampered, {
        artifactLoader: loader,
        keySet,
      }),
    ).rejects.toMatchObject({ kind: "verify-failed" });
    expect(loaderCalls).toBe(0);
  });

  it("returns a ReplayEnvelope that round-trips through replayOffline with matching outputHash", async () => {
    const { receipt, artifactLoader, keySet, outputs, outputHash } =
      await buildSignedFixture();

    const envelope = await materializeReplayEnvelope(receipt, {
      artifactLoader,
      keySet,
      task: "round-trip-task",
      outputs,
      policy: { privacy: "standard" },
    });

    expect(envelope.kind).toBe("replay-envelope");
    expect(envelope.receipt).toBeDefined();
    expect(envelope.artifacts.length).toBe(2);

    const replayResult = await replayOffline(envelope);
    expect(replayResult.ok).toBe(true);

    if (replayResult.ok) {
      const replayedOutputHash =
        (await fingerprintArtifactValue(JSON.stringify(replayResult.outputs)))
          ?.value ?? "";
      expect(replayedOutputHash).toBe(outputHash);
    }
  });

  it("propagates artifact-load failures as MaterializationError with kind 'artifact-load-failed'", async () => {
    const { receipt, keySet } = await buildSignedFixture();
    const loader = async (): Promise<ArtifactInput> => {
      throw new Error("disk read failed");
    };

    await expect(
      materializeReplayEnvelope(receipt, {
        artifactLoader: loader,
        keySet,
      }),
    ).rejects.toMatchObject({ kind: "artifact-load-failed" });
  });

  it("attaches the contract to the envelope when provided", async () => {
    const { receipt, artifactLoader, keySet } = await buildSignedFixture();
    const c = contract({ budget: { maxCostUsd: 0.5 } });
    const envelope = await materializeReplayEnvelope(receipt, {
      artifactLoader,
      keySet,
      task: "with-contract",
      contract: c,
    });
    expect(envelope.contract?.kind).toBe("capability-contract");
    expect(envelope.contract?.budget?.maxCostUsd).toBe(0.5);
  });

  it("defaults task to empty string and outputs to undefined when not supplied (v1.1 limitation)", async () => {
    const { receipt, artifactLoader, keySet } = await buildSignedFixture();
    const envelope = await materializeReplayEnvelope(receipt, {
      artifactLoader,
      keySet,
    });
    expect(envelope.plan.task).toBe("");
    expect(envelope.outputs).toBeUndefined();
  });
});

// Reference toArtifactRef so type-only artifacts import lint stays clean for
// the materialize implementation (which uses toArtifactRef internally).
void toArtifactRef;
