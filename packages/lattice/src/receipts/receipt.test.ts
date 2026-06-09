import { describe, expect, it } from "vitest";

import { fingerprintArtifactValue } from "../storage/fingerprint.js";

import { PAYLOAD_TYPE, base64Decode } from "./envelope.js";
import { createMemoryKeySet } from "./keyset.js";
import { DEFAULT_REDACTION_POLICY_ID, redactReceiptBody } from "./redact.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "./sign.js";
import type {
  CapabilityReceiptBody,
  ContractVerdict,
  ReceiptSigner,
} from "./types.js";
import { verifyReceipt } from "./verify.js";

import { createReceipt, type CreateReceiptInput } from "./receipt.js";

// Helper: build a fresh signer + return its publicKeyJwk for downstream verify
// tests. Returns the same signer surface verify.test.ts will rely on.
async function makeSigner(
  kid = "test-key-1",
): Promise<{ signer: ReceiptSigner; publicKeyJwk: JsonWebKey }> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk };
}

function decodeBody(payloadB64: string): CapabilityReceiptBody {
  const bytes = base64Decode(payloadB64);
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as CapabilityReceiptBody;
}

function minimalInput(
  overrides: Partial<CreateReceiptInput> = {},
): CreateReceiptInput {
  const base: CreateReceiptInput = {
    runId: "run-abc",
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
  return { ...base, ...overrides };
}

describe("receipt.ts — createReceipt envelope shape", () => {
  it("returns an envelope whose payloadType is the receipt media type", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    expect(env.payloadType).toBe(PAYLOAD_TYPE);
    expect(typeof env.payload).toBe("string");
    expect(env.signatures.length).toBe(1);
  });
});

describe("receipt.ts — defaults", () => {
  it("mints v1.2 by default and omits modelClass when none is supplied", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.version).toBe("lattice-receipt/v1.2");
    expect(body.modelClass).toBeUndefined();
  });

  it("defaults receiptId to a uuid v4 (matches /^[0-9a-f-]{36}$/)", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.receiptId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("defaults issuedAt to an ISO 8601 UTC timestamp", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.issuedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    );
  });

  it("defaults redactionPolicyId to DEFAULT_REDACTION_POLICY_ID", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.redactionPolicyId).toBe(DEFAULT_REDACTION_POLICY_ID);
    expect(body.redactionPolicyId).toBe("lattice.default.v1");
  });
});

describe("receipt.ts — kid defense in depth", () => {
  it("body.kid equals signer.kid (caller cannot mismatch)", async () => {
    const { signer } = await makeSigner("my-kid");
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.kid).toBe("my-kid");
    expect(env.signatures[0]?.keyid).toBe("my-kid");
  });

  it("CreateReceiptInput has no kid field (compile-time guard)", async () => {
    const { signer } = await makeSigner("real-kid");
    // @ts-expect-error - kid is not part of CreateReceiptInput
    const _bad: CreateReceiptInput = { ...minimalInput(), kid: "fake" };
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.kid).toBe("real-kid");
  });
});

describe("receipt.ts — usage.costUsd canonicalization", () => {
  it("serializes costUsd as STRING in the signed body", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.000125 },
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(typeof body.usage.costUsd).toBe("string");
    expect(body.usage.costUsd).toBe("0.000125");
    expect(body.usage.promptTokens).toBe(10);
    expect(body.usage.completionTokens).toBe(5);
  });

  it("serializes costUsd as null when input.usage.costUsd is null", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.usage.costUsd).toBeNull();
  });
});

describe("receipt.ts — redactions manifest", () => {
  it("populates redactions[] when tripwireEvidence.kind === 'no-pii'", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        contractVerdict: "tripwire-violated",
        tripwireEvidence: {
          invariantId: "inv-pii-1",
          kind: "no-pii",
          path: "data.text",
          observed: { detector: "email", substring: "***@***" },
          message: "PII detected",
        },
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.redactions.length).toBe(1);
    expect(body.redactions[0]?.path).toBe("tripwireEvidence.observed");
  });

  it("redactions[] is empty when tripwireEvidence is absent", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.redactions.length).toBe(0);
  });

  it("REDACT-THEN-SIGN: re-redacting the signed body is idempotent (the body was already redacted before signing)", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        contractVerdict: "tripwire-violated",
        tripwireEvidence: {
          invariantId: "inv-pii-1",
          kind: "no-pii",
          path: "data.text",
          observed: { detector: "email", substring: "x@y.z" },
          message: "PII",
        },
      }),
      signer,
    );
    const signedBody = decodeBody(env.payload);
    // The signed body MUST already contain the redactions[] manifest entry.
    expect(signedBody.redactions.length).toBe(1);
    expect(signedBody.redactions[0]?.path).toBe("tripwireEvidence.observed");

    // Re-running redactReceiptBody on the signed body produces a structurally
    // identical body — proof that the signed bytes already underwent redaction.
    const { body: reRedacted } = redactReceiptBody(
      signedBody,
      signedBody.redactionPolicyId,
    );
    expect(reRedacted.redactions.length).toBe(signedBody.redactions.length);
    expect(reRedacted.redactions[0]?.path).toBe(
      signedBody.redactions[0]?.path,
    );
    expect(reRedacted.redactionPolicyId).toBe(signedBody.redactionPolicyId);
  });
});

describe("receipt.ts — contractVerdict variants", () => {
  const verdicts: readonly ContractVerdict[] = [
    "success",
    "tripwire-violated",
    "no-contract-match",
    "execution-failed",
    "validation-failed",
  ];

  for (const verdict of verdicts) {
    it(`accepts contractVerdict === "${verdict}"`, async () => {
      const { signer } = await makeSigner();
      const env = await createReceipt(
        minimalInput({ contractVerdict: verdict }),
        signer,
      );
      const body = decodeBody(env.payload);
      expect(body.contractVerdict).toBe(verdict);
    });
  }
});

describe("receipt.ts — noRouteReasons embedding", () => {
  it("embeds noRouteReasons when contractVerdict === 'no-contract-match'", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        contractVerdict: "no-contract-match",
        noRouteReasons: [
          { code: "contract-budget-exceeded", message: "over budget" },
        ],
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.noRouteReasons).toBeDefined();
    expect(body.noRouteReasons?.length).toBe(1);
    expect(body.noRouteReasons?.[0]?.code).toBe("contract-budget-exceeded");
  });
});

describe("receipt.ts — model.observed", () => {
  it("supports model.observed === null", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({ model: { requested: "gpt-4o", observed: null } }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.model.observed).toBeNull();
  });

  it("supports model.observed as a fingerprint string", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        model: {
          requested: "gpt-4o",
          observed: "gpt-4o-2024-08-06-fp:abc",
        },
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.model.observed).toBe("gpt-4o-2024-08-06-fp:abc");
  });
});

describe("receipt.ts — modelClass", () => {
  it("preserves a supplied modelClass in the signed body", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({ modelClass: "local_quantized" }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.version).toBe("lattice-receipt/v1.2");
    expect(body.modelClass).toBe("local_quantized");
  });
});

describe("receipt.ts — contractHash", () => {
  it("carries a SHA-256 hex contractHash when supplied", async () => {
    const { signer } = await makeSigner();
    const fingerprint = await fingerprintArtifactValue({
      kind: "capability-contract",
      budget: { maxCostUsd: 1 },
    });
    expect(fingerprint).toBeDefined();
    const env = await createReceipt(
      minimalInput({ contractHash: fingerprint?.value ?? null }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.contractHash).toBe(fingerprint?.value);
    expect(body.contractHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("supports contractHash === null", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({ contractHash: null }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.contractHash).toBeNull();
  });
});

describe("receipt.ts — determinism", () => {
  it("produces byte-equal envelopes given fixed receiptId + issuedAt + kid + signer", async () => {
    const { signer } = await makeSigner("det-kid");
    const input = minimalInput({
      receiptId: "11111111-1111-4111-8111-111111111111",
      issuedAt: "2026-05-11T00:00:00Z",
      modelClass: "frontier_rlhf",
    });
    const env1 = await createReceipt(input, signer);
    const env2 = await createReceipt(input, signer);
    const body = decodeBody(env1.payload);
    expect(body.modelClass).toBe("frontier_rlhf");
    expect(env1.payload).toBe(env2.payload);
    // Ed25519 is deterministic per RFC 8032 — signatures byte-equal too.
    expect(env1.signatures[0]?.sig).toBe(env2.signatures[0]?.sig);
    expect(env1.signatures[0]?.keyid).toBe(env2.signatures[0]?.keyid);
  });
});

describe("receipt.ts — v1.2 step-marker fields", () => {
  it("mints v1.2 receipt when step-marker fields are set", async () => {
    const { privateKeyJwk: pk, publicKeyJwk: vk } =
      await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(pk, {
      kid: "phase-2-test-key",
      publicKeyJwk: vk,
    });
    const envelope = await createReceipt(
      {
        runId: "phase-2-test-run-v11",
        model: { requested: "test-model", observed: null },
        route: {
          providerId: "test",
          capabilityId: "test/v11",
          attemptNumber: 1,
        },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        stepName: "click-link",
        stepIndex: 3,
        sessionId: "session-1",
        timestamp: "2026-05-24T18:00:00.000Z",
      },
      signer,
    );
    const keySet = createMemoryKeySet([
      { kid: "phase-2-test-key", publicKeyJwk: vk, state: "active" },
    ]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.2");
      expect(result.body.stepName).toBe("click-link");
      expect(result.body.stepIndex).toBe(3);
      expect(result.body.sessionId).toBe("session-1");
      expect(result.body.timestamp).toBe("2026-05-24T18:00:00.000Z");
    }
  });

  it("mints v1.2 receipt by default even when no step-marker fields are set", async () => {
    const { privateKeyJwk: pk, publicKeyJwk: vk } =
      await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(pk, {
      kid: "phase-2-test-key",
      publicKeyJwk: vk,
    });
    const envelope = await createReceipt(
      {
        runId: "phase-2-test-run-v1",
        model: { requested: "test-model", observed: null },
        route: {
          providerId: "test",
          capabilityId: "test/v1",
          attemptNumber: 1,
        },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
      },
      signer,
    );
    const keySet = createMemoryKeySet([
      { kid: "phase-2-test-key", publicKeyJwk: vk, state: "active" },
    ]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.2");
      expect(result.body.stepName).toBeUndefined();
      expect(result.body.stepIndex).toBeUndefined();
      expect(result.body.sessionId).toBeUndefined();
    }
  });

  it("mints v1.2 receipt with a single stepName field", async () => {
    const { privateKeyJwk: pk, publicKeyJwk: vk } =
      await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(pk, {
      kid: "phase-2-test-key",
      publicKeyJwk: vk,
    });
    const envelope = await createReceipt(
      {
        runId: "phase-2-test-run-single",
        model: { requested: "test-model", observed: null },
        route: {
          providerId: "test",
          capabilityId: "test/single",
          attemptNumber: 1,
        },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        stepName: "single-field-bump",
      },
      signer,
    );
    const keySet = createMemoryKeySet([
      { kid: "phase-2-test-key", publicKeyJwk: vk, state: "active" },
    ]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.2");
      expect(result.body.stepName).toBe("single-field-bump");
    }
  });
});
