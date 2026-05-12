/**
 * Success scenario — drives the v1.0 customer-support fixture through
 * `ai.run` with a permissive contract attached, expects a `RunSuccess`
 * with a signed receipt whose decoded body has `contractVerdict: "success"`.
 *
 * NOTE: the runtime's `ContractVerdict` union uses the literal "success"
 * (NOT "pass") — the 13-01 plan text said "pass" but the actual API in
 * packages/lattice/src/receipts/types.ts uses "success". This module
 * asserts against the real verdict.
 */

import { readFile } from "node:fs/promises";

import {
  artifact,
  contract,
  output,
} from "../../../packages/lattice/dist/index.js";

import { buildScenarioAI, writeArtifactContentAddressed, writeReceipt } from "../setup.mjs";

const actionSchema = {
  "~standard": {
    version: 1,
    vendor: "work-inbox-fixture",
    validate(value) {
      const valid =
        typeof value === "object" &&
        value !== null &&
        ["refund", "replace", "escalate", "clarify"].includes(value.kind) &&
        typeof value.reason === "string" &&
        ["normal", "urgent"].includes(value.priority);
      return valid
        ? { value }
        : { issues: [{ message: "Expected a work-inbox action object." }] };
    },
  },
};

async function readFixture(name) {
  return readFile(new URL(`../fixtures/${name}`, import.meta.url), "utf8");
}

export async function run(ctx) {
  // Load all v1.0 fixtures as text bytes so the runtime hashes the
  // actual content (not the path). The same bytes are written content-
  // addressed under .lattice/fixtures/ so `lattice repro` rehydrates.
  const messageText = await readFixture("message.txt");
  const photoText = await readFixture("package-photo.txt");
  const transcriptText = await readFixture("call-transcript.txt");
  const policyText = await readFixture("return-policy.pdf.txt");

  await writeArtifactContentAddressed(ctx.fixturesDir, messageText);
  await writeArtifactContentAddressed(ctx.fixturesDir, photoText);
  await writeArtifactContentAddressed(ctx.fixturesDir, transcriptText);
  await writeArtifactContentAddressed(ctx.fixturesDir, policyText);

  const artifacts = [
    artifact.text(messageText, {
      id: "artifact:text:message",
      label: "Customer message",
    }),
    artifact.text(photoText, {
      id: "artifact:image:package-photo",
      label: "Package photo fixture",
      mediaType: "text/plain",
    }),
    artifact.text(transcriptText, {
      id: "artifact:audio:call-transcript",
      label: "Call recording transcript fixture",
      mediaType: "text/plain",
      privacy: "sensitive",
    }),
    artifact.text(policyText, {
      id: "artifact:document:return-policy",
      label: "Return policy excerpt fixture",
      mediaType: "text/plain",
    }),
  ];

  const ai = buildScenarioAI({
    signer: ctx.signer,
    sessionId: "success",
    fakeRawOutputs: {
      answer:
        "Approve a replacement and escalate billing review because the package photo and policy excerpt conflict.",
      action: {
        kind: "replace",
        reason: "Photo evidence shows damage while the policy excerpt allows replacement before refund.",
        priority: "normal",
      },
      evidence: [
        { artifactId: "artifact:text:message", label: "customer message" },
        { artifactId: "artifact:image:package-photo", label: "visual evidence" },
        { artifactId: "artifact:document:return-policy", label: "policy excerpt" },
      ],
      generated: [],
    },
  });

  const intent = {
    task: "Resolve this work-inbox case. Return a concise answer and an action object.",
    session: ai.session("showcase-success"),
    artifacts,
    outputs: {
      answer: "text",
      action: actionSchema,
      evidence: output.citations(),
      generated: output.artifacts(),
    },
    policy: { privacy: "sensitive" },
    contract: contract({ budget: { maxCostUsd: 0.05 } }),
  };

  const result = await ai.run(intent);

  if (!result.ok) {
    throw new Error(
      `success scenario expected ok=true, got ok=false error=${result.error?.kind ?? "unknown"}`,
    );
  }
  if (result.receipt === undefined) {
    throw new Error("success scenario expected result.receipt to be present (signer is wired)");
  }

  const payloadJson = Buffer.from(result.receipt.payload, "base64url").toString("utf8");
  const body = JSON.parse(payloadJson);
  if (body.contractVerdict !== "success") {
    throw new Error(
      `success scenario expected contractVerdict="success", got "${body.contractVerdict}"`,
    );
  }

  await writeReceipt(ctx.receiptsDir, result.receipt);

  return {
    scenario: "success",
    receiptId: body.receiptId,
    verdict: body.contractVerdict,
    ok: true,
  };
}
