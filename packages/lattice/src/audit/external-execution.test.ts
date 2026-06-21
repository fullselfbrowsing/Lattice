import { describe, expect, it } from "vitest";

import { artifact } from "../artifacts/artifact.js";
import { contract } from "../contract/contract.js";
import { createMemoryKeySet } from "../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import { verifyReceipt } from "../receipts/verify.js";
import { replayOffline } from "../replay/replay.js";
import { fingerprintArtifactValue } from "../storage/fingerprint.js";
import { createExternalExecutionAudit } from "./external-execution.js";

async function makeSigner(kid = "external-audit-test") {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  return {
    signer: createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk }),
    keySet: createMemoryKeySet([{ kid, publicKeyJwk, state: "active" }]),
  };
}

describe("createExternalExecutionAudit", () => {
  it("creates a signed receipt, compatible sidecar, and replay envelope for external calls", async () => {
    const { signer, keySet } = await makeSigner();
    const input = artifact.text("customer issue", { id: "artifact:external:1" });
    const outputs = { answer: "refund approved" };
    const result = await createExternalExecutionAudit(
      {
        runId: "external-run-1",
        receiptId: "external-receipt-1",
        issuedAt: "2026-06-20T00:00:00.000Z",
        task: "Classify customer issue",
        artifacts: [input],
        outputSpecs: { answer: "text" },
        outputs,
        policy: { privacy: "standard" },
        contract: contract(),
        model: { requested: "grok-4-1-fast-demo", observed: "grok-4-1-fast-demo" },
        route: {
          providerId: "xai",
          capabilityId: "grok-4-1-fast-demo",
          attemptNumber: 1,
        },
        usage: { promptTokens: 10, completionTokens: 4, costUsd: 0.001 },
        rawRequest: { model: "grok-4-1-fast-demo", messages: [{ role: "user", content: "..." }] },
        rawResponse: { id: "chatcmpl-test", choices: [{ message: { content: "refund approved" } }] },
        metadata: { executor: "gitfly" },
      },
      signer,
    );

    const verifyResult = await verifyReceipt(result.receipt, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      const artifactHash = await fingerprintArtifactValue(input.value);
      const outputHash = await fingerprintArtifactValue(outputs);
      expect(verifyResult.body.receiptId).toBe("external-receipt-1");
      expect(verifyResult.body.runId).toBe("external-run-1");
      expect(verifyResult.body.inputHashes).toEqual([artifactHash?.value]);
      expect(verifyResult.body.outputHash).toBe(outputHash?.value);
      expect(verifyResult.body.model.requested).toBe("grok-4-1-fast-demo");
      expect(verifyResult.body.route.providerId).toBe("xai");
    }

    expect(result.sidecar).toMatchObject({
      version: "lattice-sidecar/v1",
      task: "Classify customer issue",
      outputs: { answer: "text" },
      rawOutputs: outputs,
      externalExecution: {
        kind: "external-execution",
        inputHashes: result.inputHashes,
        outputHash: result.outputHash,
        metadata: { executor: "gitfly" },
      },
    });
    expect(result.sidecar.externalExecution.rawRequestHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.sidecar.externalExecution.rawResponseHash).toMatch(/^[a-f0-9]{64}$/u);

    const replayed = await replayOffline(result.replayEnvelope);
    expect(replayed.ok).toBe(true);
    if (replayed.ok) {
      expect(replayed.outputs).toEqual(outputs);
      expect(replayed.plan.status).toBe("completed");
      if (replayed.plan.kind === "execution-plan") {
        expect(replayed.plan.metadata).toMatchObject({
          externalExecution: true,
          runId: "external-run-1",
        });
      }
    }
  });

  it("can emit a failure receipt without raw outputs", async () => {
    const { signer, keySet } = await makeSigner("external-audit-failure");
    const result = await createExternalExecutionAudit(
      {
        task: "External call failed",
        policy: {},
        contract: contract(),
        model: { requested: "external-model", observed: null },
        route: { providerId: "external", capabilityId: "external-model", attemptNumber: 1 },
        usage: { promptTokens: 1, completionTokens: 0, costUsd: null },
        contractVerdict: "execution-failed",
        rawRequest: { model: "external-model" },
        rawResponse: { error: "timeout" },
      },
      signer,
    );

    const verifyResult = await verifyReceipt(result.receipt, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.contractVerdict).toBe("execution-failed");
      expect(verifyResult.body.outputHash).toBeNull();
    }
    expect(result.sidecar.rawOutputs).toBeUndefined();
    expect(result.replayEnvelope.outputs).toBeUndefined();
    expect(result.replayEnvelope.plan.status).toBe("failed");
    expect(result.replayEnvelope.plan.attempts[0]).toMatchObject({
      status: "failed",
      error: "execution-failed",
    });
    const replayed = await replayOffline(result.replayEnvelope);
    expect(replayed.ok).toBe(false);
  });

  it("keeps failed raw outputs auditable without making them replayable", async () => {
    const { signer, keySet } = await makeSigner("external-audit-validation-failure");
    const input = artifact.text("customer issue", { id: "artifact:external:validation" });
    const outputs = { answer: { valid: false, reason: "missing required citation" } };

    const result = await createExternalExecutionAudit(
      {
        task: "External validation failed",
        artifacts: [input],
        outputSpecs: { answer: "text" },
        outputs,
        policy: {},
        contract: contract(),
        model: { requested: "external-model", observed: "external-model" },
        route: { providerId: "external", capabilityId: "external-model", attemptNumber: 1 },
        usage: { promptTokens: 5, completionTokens: 3, costUsd: null },
        contractVerdict: "validation-failed",
        rawRequest: { model: "external-model" },
        rawResponse: { output: outputs },
      },
      signer,
    );

    const outputHash = await fingerprintArtifactValue(outputs);
    const verifyResult = await verifyReceipt(result.receipt, keySet);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) {
      expect(verifyResult.body.contractVerdict).toBe("validation-failed");
      expect(verifyResult.body.outputHash).toBe(outputHash?.value);
    }

    expect(result.sidecar.rawOutputs).toEqual(outputs);
    expect(result.outputHash).toBe(outputHash?.value);
    expect(result.replayEnvelope.outputs).toBeUndefined();
    expect(result.replayEnvelope.plan.status).toBe("failed");
    expect(result.replayEnvelope.plan.attempts[0]).toMatchObject({
      status: "failed",
      error: "validation-failed",
    });

    const replayed = await replayOffline(result.replayEnvelope);
    expect(replayed.ok).toBe(false);
  });
});
