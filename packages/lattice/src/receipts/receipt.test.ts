import { describe, expect, it } from "vitest";

import { fingerprintArtifactValue } from "../storage/fingerprint.js";

import { receiptCid } from "./cid.js";
import { PAYLOAD_TYPE, base64Decode } from "./envelope.js";
import { createMemoryKeySet } from "./keyset.js";
import { inv, type InvariantDeclaration } from "../contract/invariants.js";
import { evaluateTripwires, type TripwireEvidence } from "../contract/tripwire.js";

import {
  DEFAULT_REDACTION_POLICY_ID,
  NO_PII_REDACTION_REASON,
  TRIPWIRE_MESSAGE_REDACTION_REASON,
  TRIPWIRE_OBSERVED_REDACTION_REASON,
  redactReceiptBody,
} from "./redact.js";
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
  it("mints v1.4 by default and omits modelClass when none is supplied", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect(body.version).toBe("lattice-receipt/v1.4");
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
  it("rewrites no-pii observed to a mask and records the manifest entry", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        contractVerdict: "tripwire-violated",
        tripwireEvidence: {
          invariantId: "inv-pii-1",
          kind: "no-pii",
          path: "data.text",
          observed: { detector: "email", substring: "alice@example.com" },
          message: "PII detected",
        },
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.redactions).toEqual([
      { path: "tripwireEvidence.message", reason: TRIPWIRE_MESSAGE_REDACTION_REASON },
      { path: "tripwireEvidence.observed", reason: NO_PII_REDACTION_REASON },
    ]);
    expect(body.tripwireEvidence?.observed).toEqual({
      detector: "email",
      length: 17,
      mask: "*****@*******.***",
    });
    expect(body.tripwireEvidence?.observed).not.toHaveProperty("substring");
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
    // The signed body MUST already contain the redactions[] manifest entries
    // (message template + observed mask).
    expect(signedBody.redactions.map((entry) => entry.path)).toEqual([
      "tripwireEvidence.message",
      "tripwireEvidence.observed",
    ]);

    // Re-running redactReceiptBody on the signed body produces a structurally
    // identical body — proof that the signed bytes already underwent redaction.
    const { body: reRedacted } = redactReceiptBody(
      signedBody,
      signedBody.redactionPolicyId,
    );
    expect(reRedacted).toEqual(signedBody);
  });
});

describe("receipt.ts — signed bytes never contain the matched value (issue #21 F1)", () => {
  const SENTINEL = "SENTINEL-7731-PII";

  const cases: ReadonlyArray<{
    readonly kind: TripwireEvidence["kind"];
    readonly observed: unknown;
    readonly message: string;
    readonly reasons: readonly string[];
  }> = [
    // Every kind plants the sentinel in `observed` AND `message`; no-pii also
    // plants it in `observed.foundAt`, the concrete location that can carry
    // model-produced object keys (review follow-up).
    {
      kind: "no-pii",
      observed: { detector: "us-ssn", substring: SENTINEL, foundAt: `text.${SENTINEL}` },
      message: `no-pii: detector "us-ssn" flagged content at "text.${SENTINEL}".`,
      reasons: [TRIPWIRE_MESSAGE_REDACTION_REASON, NO_PII_REDACTION_REASON],
    },
    {
      kind: "must-cite",
      observed: [SENTINEL, { source: SENTINEL }],
      message: `must-cite: no citation found for "${SENTINEL}".`,
      reasons: [TRIPWIRE_MESSAGE_REDACTION_REASON, TRIPWIRE_OBSERVED_REDACTION_REASON],
    },
    {
      kind: "field-from-table",
      observed: SENTINEL,
      message: `field-from-table: value "${SENTINEL}" not in allowedValues.`,
      reasons: [TRIPWIRE_MESSAGE_REDACTION_REASON, TRIPWIRE_OBSERVED_REDACTION_REASON],
    },
    {
      kind: "matches",
      observed: { nested: [SENTINEL] },
      message: `Invalid input ${SENTINEL}: expected pattern`,
      reasons: [TRIPWIRE_MESSAGE_REDACTION_REASON, TRIPWIRE_OBSERVED_REDACTION_REASON],
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.kind}: the canonical payload bytes do not contain the sentinel`, async () => {
      const { signer } = await makeSigner();
      const env = await createReceipt(
        minimalInput({
          contractVerdict: "tripwire-violated",
          tripwireEvidence: {
            invariantId: "inv-1",
            kind: testCase.kind,
            path: "text",
            observed: testCase.observed,
            message: testCase.message,
          },
        }),
        signer,
      );
      const rawJson = new TextDecoder().decode(base64Decode(env.payload));
      expect(rawJson).not.toContain(SENTINEL);
      const body = decodeBody(env.payload);
      expect(body.redactions.map((entry) => entry.reason)).toEqual(testCase.reasons);
      expect(body.redactions.every((entry) => entry.path.startsWith("tripwireEvidence."))).toBe(true);
    });
  }
});

describe("receipt.ts — must-cite evidence signs only developer-owned values", () => {
  // The nested fallback finds lists under model-produced keys (a z.record or
  // loose-object output). Their dotted location must never reach the signed
  // body, neither as `path` nor through the templated message.
  const cases: ReadonlyArray<{
    readonly label: string;
    readonly output: unknown;
    readonly declaration: () => InvariantDeclaration;
    readonly leaked: readonly string[];
  }> = [
    {
      label: "a missing citation under a model-produced key",
      output: { sections: { "Jane Roe SSN 123-45-6789": { text: "Refund denied.", citations: ["other-doc"] } } },
      declaration: () => inv.mustCite("policy-refund"),
      leaked: ["Jane Roe", "123-45-6789", "sections"],
    },
    {
      label: "a rejectUncited failure in a list under a model-produced key",
      output: {
        sections: { "patient jane.roe@example.com": { text: "Refund per [Smith 1999].", citations: ["policy-refund"] } },
      },
      declaration: () => inv.mustCite("policy-refund", { rejectUncited: true }),
      leaked: ["jane.roe", "example.com", "Smith 1999", "sections"],
    },
    {
      label: "a list inside an array of answers",
      output: { answers: [{ text: "x", evidence: ["other-doc"] }] },
      declaration: () => inv.mustCite("policy-refund"),
      leaked: ["answers", "[0]"],
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.label}: the signed body carries the default key only`, async () => {
      const tripwire = await evaluateTripwires(testCase.output, [testCase.declaration()]);
      expect(tripwire.ok).toBe(false);
      if (tripwire.ok) return;
      const key = tripwire.evidence.path;
      expect(["citations", "evidence"]).toContain(key);

      const { signer } = await makeSigner();
      const env = await createReceipt(
        minimalInput({ contractVerdict: "tripwire-violated", tripwireEvidence: tripwire.evidence }),
        signer,
      );
      const rawJson = new TextDecoder().decode(base64Decode(env.payload));
      for (const fragment of testCase.leaked) expect(rawJson).not.toContain(fragment);
      const body = decodeBody(env.payload);
      expect(body.tripwireEvidence).toEqual({
        invariantId: tripwire.evidence.invariantId,
        kind: "must-cite",
        path: key,
        observed: { valueType: "array" },
        message: `must-cite: no matching citation at "${key}".`,
      });
    });
  }
});

describe("receipt.ts — v1.4 binding fields (issue #21 F2)", () => {
  it("embeds audience, nonce, and expiresAt when supplied", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        audience: "billing-svc",
        nonce: "n-123",
        expiresAt: "2026-12-31T00:00:00.000Z",
      }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.version).toBe("lattice-receipt/v1.4");
    expect(body.audience).toBe("billing-svc");
    expect(body.nonce).toBe("n-123");
    expect(body.expiresAt).toBe("2026-12-31T00:00:00.000Z");
  });

  it("omits the binding keys entirely from the canonical JSON when not supplied", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect("audience" in body).toBe(false);
    expect("nonce" in body).toBe(false);
    expect("expiresAt" in body).toBe(false);
    const rawJson = new TextDecoder().decode(base64Decode(env.payload));
    expect(rawJson).not.toContain("audience");
    expect(rawJson).not.toContain("nonce");
    expect(rawJson).not.toContain("expiresAt");
  });

  it("is deterministic with the binding fields set", async () => {
    const { signer } = await makeSigner("det-kid");
    const input = minimalInput({
      receiptId: "11111111-1111-4111-8111-111111111111",
      issuedAt: "2026-05-11T00:00:00Z",
      audience: "a",
      nonce: "n",
      expiresAt: "2026-05-11T01:00:00Z",
    });
    const env1 = await createReceipt(input, signer);
    const env2 = await createReceipt(input, signer);
    expect(env1.payload).toBe(env2.payload);
    expect(env1.signatures[0]?.sig).toBe(env2.signatures[0]?.sig);
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
    expect(body.version).toBe("lattice-receipt/v1.4");
    expect(body.modelClass).toBe("local_quantized");
  });
});

describe("receipt.ts — parentReceiptCid (Phase 39 / DELEG-06)", () => {
  it("mints a v1.4 body containing parentReceiptCid when supplied", async () => {
    const { signer } = await makeSigner();
    const parentCid = `sha256:${"ab".repeat(32)}`;
    const env = await createReceipt(
      minimalInput({ parentReceiptCid: parentCid }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.version).toBe("lattice-receipt/v1.4");
    expect(body.parentReceiptCid).toBe(parentCid);
  });

  it("omits parentReceiptCid entirely from the canonical JSON when not supplied", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    // Absent — NOT present-with-undefined. JCS canonicalization would throw
    // on a literal undefined; the conditional-spread keeps the key out.
    expect("parentReceiptCid" in body).toBe(false);
    const rawJson = new TextDecoder().decode(base64Decode(env.payload));
    expect(rawJson).not.toContain("parentReceiptCid");
  });

  it("chains: child receipt carries the real CID of its parent envelope and round-trips DSSE/JCS byte-stably", async () => {
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, {
      kid: "chain-key",
      publicKeyJwk,
    });

    // Mint the crew-root receipt (no parentReceiptCid).
    const rootEnv = await createReceipt(
      minimalInput({ runId: "crew-root" }),
      signer,
    );
    const rootCid = await receiptCid(rootEnv);
    expect(rootCid).toMatch(/^sha256:[0-9a-f]{64}$/);

    // Mint a child receipt chained to the root.
    const childEnv = await createReceipt(
      minimalInput({ runId: "crew-child", parentReceiptCid: rootCid }),
      signer,
    );

    // Serialize -> deserialize -> verify (byte stability across the wire).
    const wire = JSON.stringify(childEnv);
    const revived = JSON.parse(wire) as typeof childEnv;
    expect(revived.payload).toBe(childEnv.payload);

    const keySet = createMemoryKeySet([
      { kid: "chain-key", publicKeyJwk, state: "active" },
    ]);
    const result = await verifyReceipt(revived, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.parentReceiptCid).toBe(rootCid);
    }

    // CID of the revived envelope equals CID of the original (byte-stable).
    expect(await receiptCid(revived)).toBe(await receiptCid(childEnv));
  });
});

describe("receipt.ts — lineageMerkleRoot (Phase 46 / REC-01)", () => {
  it("embeds lineageMerkleRoot when supplied", async () => {
    const { signer } = await makeSigner();
    const lineageMerkleRoot = `sha256:${"cd".repeat(32)}`;
    const env = await createReceipt(
      minimalInput({ lineageMerkleRoot }),
      signer,
    );
    const body = decodeBody(env.payload);
    expect(body.version).toBe("lattice-receipt/v1.4");
    expect(body.lineageMerkleRoot).toBe(lineageMerkleRoot);
  });

  it("omits lineageMerkleRoot entirely from the canonical JSON when not supplied", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(minimalInput(), signer);
    const body = decodeBody(env.payload);
    expect("lineageMerkleRoot" in body).toBe(false);
    const rawJson = new TextDecoder().decode(base64Decode(env.payload));
    expect(rawJson).not.toContain("lineageMerkleRoot");
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
  it("mints v1.4 receipt when step-marker fields are set", async () => {
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
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.stepName).toBe("click-link");
      expect(result.body.stepIndex).toBe(3);
      expect(result.body.sessionId).toBe("session-1");
      expect(result.body.timestamp).toBe("2026-05-24T18:00:00.000Z");
    }
  });

  it("mints v1.4 receipt by default even when no step-marker fields are set", async () => {
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
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.stepName).toBeUndefined();
      expect(result.body.stepIndex).toBeUndefined();
      expect(result.body.sessionId).toBeUndefined();
    }
  });

  it("mints v1.4 receipt with a single stepName field", async () => {
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
      expect(result.body.version).toBe("lattice-receipt/v1.4");
      expect(result.body.stepName).toBe("single-field-bump");
    }
  });
});

describe("receipt.ts — shape mimicry and non-ASCII matches never reach the signed bytes (review follow-up round 2)", () => {
  it("field-from-table: a raw value mimicking the redacted shape loses its number", async () => {
    const { signer } = await makeSigner();
    const NUMERIC_SENTINEL = 7731773177317731;
    const env = await createReceipt(
      minimalInput({
        contractVerdict: "tripwire-violated",
        tripwireEvidence: {
          invariantId: "inv-1",
          kind: "field-from-table",
          path: "card",
          observed: { valueType: "number", length: NUMERIC_SENTINEL },
          message: 'field-from-table: value at "card" not in allowedValues.',
        },
      }),
      signer,
    );
    const rawJson = new TextDecoder().decode(base64Decode(env.payload));
    expect(rawJson).not.toContain(String(NUMERIC_SENTINEL));
    expect(decodeBody(env.payload).tripwireEvidence?.observed).toEqual({ valueType: "object" });
  });

  it("no-pii: a non-ASCII match from a custom detector is masked in the signed bytes", async () => {
    const { signer } = await makeSigner();
    const env = await createReceipt(
      minimalInput({
        contractVerdict: "tripwire-violated",
        tripwireEvidence: {
          invariantId: "inv-1",
          kind: "no-pii",
          path: "text",
          observed: { detector: "name", substring: "José-7731-Müller", foundAt: "text" },
          message: 'no-pii: detector "name" flagged content at "text".',
        },
      }),
      signer,
    );
    const rawJson = new TextDecoder().decode(base64Decode(env.payload));
    expect(rawJson).not.toContain("José");
    expect(rawJson).not.toContain("Müller");
    expect(rawJson).not.toContain("7731");
    expect(decodeBody(env.payload).tripwireEvidence?.observed).toEqual({
      detector: "name",
      length: 16,
      mask: "****-****-******",
    });
  });
});

describe("createReceipt — timestamps must carry an explicit UTC offset (review follow-up round 5)", () => {
  it.each([
    ["offset-less issuedAt", { issuedAt: "2026-01-01T00:00:00" }],
    ["non-ISO issuedAt", { issuedAt: "Jan 1 2026" }],
    ["offset-less expiresAt", { expiresAt: "2999-01-01T00:00:00" }],
    ["date-only expiresAt", { expiresAt: "2999-01-01" }],
    ["impossible expiresAt that Date.parse would roll into March", { expiresAt: "2999-02-31T00:00:00Z" }],
    ["issuedAt at hour 24", { issuedAt: "2026-10-18T24:00:00Z" }],
  ])("refuses to issue a receipt with an %s (caller error, not a verdict)", async (_label, overrides) => {
    const { signer } = await makeSigner();
    await expect(createReceipt(minimalInput(overrides), signer)).rejects.toThrow(TypeError);
    await expect(createReceipt(minimalInput(overrides), signer)).rejects.toThrow(/UTC offset/u);
  });

  it("accepts toISOString output and numeric offsets, embedding them verbatim", async () => {
    const { signer } = await makeSigner();
    const issuedAt = "2026-01-01T00:00:00.000Z";
    const expiresAt = "2026-01-01T02:00:00+05:30";
    const env = await createReceipt(minimalInput({ issuedAt, expiresAt }), signer);
    const body = decodeBody(env.payload);
    expect(body.issuedAt).toBe(issuedAt);
    expect(body.expiresAt).toBe(expiresAt);
  });
});

describe("createReceipt — chain-closure fields", () => {
  const cidA = `sha256:${"a".repeat(64)}`;
  const cidB = `sha256:${"b".repeat(64)}`;

  it("embeds chainClosure and a sorted chainMemberCids list", async () => {
    const { signer } = await makeSigner();
    const root = await createReceipt(minimalInput({ chainClosure: "member-cids" }), signer);
    expect(decodeBody(root.payload).chainClosure).toBe("member-cids");
    const closer = await createReceipt(minimalInput({ chainMemberCids: [cidA, cidB] }), signer);
    expect(decodeBody(closer.payload).chainMemberCids).toEqual([cidA, cidB]);
    const empty = await createReceipt(minimalInput({ chainMemberCids: [] }), signer);
    expect(decodeBody(empty.payload).chainMemberCids).toEqual([]);
  });

  it.each([
    ["an unknown chainClosure mode", { chainClosure: "merkle-v2" }, /chainClosure must be "member-cids"/u],
    ["a boolean chainClosure", { chainClosure: true }, /chainClosure must be "member-cids"/u],
    ["a string chainMemberCids", { chainMemberCids: cidA }, /must be an array/u],
    ["a null chainMemberCids", { chainMemberCids: null }, /must be an array/u],
    ["a non-string member", { chainMemberCids: [cidA, 7] }, /chainMemberCids\[1\]/u],
    ["a member that is not a sha256 CID", { chainMemberCids: ["sha256:abc"] }, /chainMemberCids\[0\]/u],
    ["an uppercase-hex member", { chainMemberCids: [`sha256:${"A".repeat(64)}`] }, /chainMemberCids\[0\]/u],
    ["a duplicate member", { chainMemberCids: [cidA, cidA] }, /more than once/u],
    ["an unsorted list", { chainMemberCids: [cidB, cidA] }, /must be sorted/u],
    [
      "chainClosure on a non-root receipt",
      { chainClosure: "member-cids", parentReceiptCid: cidA },
      /chainClosure is only valid on a root receipt/u,
    ],
  ])("refuses to issue a receipt with %s", async (_label, overrides, pattern) => {
    const { signer } = await makeSigner();
    const input = { ...minimalInput(), ...overrides } as unknown as CreateReceiptInput;
    await expect(createReceipt(input, signer)).rejects.toThrow(TypeError);
    await expect(createReceipt(input, signer)).rejects.toThrow(pattern);
  });
});
