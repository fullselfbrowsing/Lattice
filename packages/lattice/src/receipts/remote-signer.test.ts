import { describe, expect, it } from "vitest";

import { PAYLOAD_TYPE, buildPae } from "./envelope.js";
import { createMemoryKeySet } from "./keyset.js";
import { createReceipt, type CreateReceiptInput } from "./receipt.js";
import { createRemoteReceiptSigner } from "./remote-signer.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "./sign.js";
import type { RemoteReceiptSignRequest } from "./remote-signer.js";
import type { ReceiptSigner } from "./types.js";
import { verifyReceipt } from "./verify.js";

function minimalInput(): CreateReceiptInput {
  return {
    runId: "remote-signer-run",
    model: { requested: "gpt-4o", observed: null },
    route: {
      providerId: "openai",
      capabilityId: "openai/gpt-4o",
      attemptNumber: 1,
    },
    usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  };
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("createRemoteReceiptSigner", () => {
  it("adapts remote callbacks to ReceiptSigner and verifies through KeySet", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const delegate = createInMemorySigner(privateKeyJwk, {
      kid: "remote-key",
      publicKeyJwk,
    });
    let captured: RemoteReceiptSignRequest | undefined;
    const signer: ReceiptSigner = createRemoteReceiptSigner({
      kid: "remote-key",
      publicKeyJwk,
      provider: "aws-kms",
      keyRef: "arn:aws:kms:us-east-1:111122223333:key/example",
      metadata: { region: "us-east-1" },
      async sign(request) {
        captured = request;
        return { signature: await delegate.sign(request.bytes) };
      },
    });

    const envelope = await createReceipt(minimalInput(), signer);
    const expectedPae = buildPae(PAYLOAD_TYPE, envelope.payload);

    expect(captured).toBeDefined();
    expect(captured?.payloadFormat).toBe("dsse-pae");
    expect(captured?.algorithm).toBe("Ed25519");
    expect(captured?.provider).toBe("aws-kms");
    expect(captured?.keyRef).toBe(
      "arn:aws:kms:us-east-1:111122223333:key/example",
    );
    expect(bytesEqual(captured!.bytes, expectedPae)).toBe(true);

    const keySet = createMemoryKeySet([
      { kid: "remote-key", publicKeyJwk, state: "active" },
    ]);
    expect(await verifyReceipt(envelope, keySet)).toMatchObject({ ok: true });
  });

  it("accepts callbacks that return raw signature bytes", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const delegate = createInMemorySigner(privateKeyJwk, {
      kid: "remote-key-raw",
      publicKeyJwk,
    });
    const signer = createRemoteReceiptSigner({
      kid: "remote-key-raw",
      publicKeyJwk,
      provider: "gcp-kms",
      keyRef: "projects/p/locations/global/keyRings/r/cryptoKeys/k",
      sign: (request) => delegate.sign(request.bytes),
    });

    const envelope = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([
      { kid: "remote-key-raw", publicKeyJwk, state: "active" },
    ]);
    expect(await verifyReceipt(envelope, keySet)).toMatchObject({ ok: true });
  });
});
