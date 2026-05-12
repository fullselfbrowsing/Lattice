/**
 * No-contract-match scenario — the contract declares a budget of
 * `maxCostUsd: 0.0000001`, far below the provider's effective per-token
 * pricing. Pre-flight rejects every candidate route with
 * `code: "contract-budget-exceeded"`, the router has no satisfying
 * route, and `ai.run` short-circuits with
 * `RunFailure { kind: "no-contract-match", noRouteReasons: [...] }`.
 *
 * Because the refusal happens before any provider invocation, the
 * receipt carries `usage = { promptTokens: 0, completionTokens: 0,
 * costUsd: 0 }` (the canonical form normalizes the number to the string
 * "0" — but the showcase asserts the body's contractVerdict only). The
 * scenario's response field is set to "(unreachable)" placeholders to
 * make it crystal clear the fake provider is never invoked.
 *
 * The fake provider is constructed with a non-zero `inputPer1kTokens`
 * pricing hint so `estimateRouteCost` returns a positive number that
 * exceeds the tiny budget. The DEFAULT fake provider has pricing 0,
 * which would NOT trip a sub-cent budget — that's why this scenario
 * needs an explicit capability override.
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

// Custom capability with non-zero pricing so estimateRouteCost
// produces a positive number that the sub-cent budget rejects.
function buildPricedCapability(providerId) {
  return {
    providerId,
    modelId: `${providerId}:priced`,
    inputModalities: ["text", "json", "image", "audio", "document", "file", "url", "tool"],
    outputModalities: ["text", "json"],
    fileTransport: ["inline", "json", "url", "base64", "extracted-text", "transcript"],
    contextWindow: 16_000,
    structuredOutput: true,
    toolUse: false,
    streaming: false,
    pricing: {
      // 1 USD per 1k input tokens — any non-trivial prompt blows past
      // the 0.0000001 budget. The exact value does not matter as long
      // as estimated cost > 1e-7.
      inputPer1kTokens: 1,
      outputPer1kTokens: 1,
    },
    latency: "interactive",
    dataPolicy: {
      privacy: ["standard", "sensitive"],
      uploadRetention: "none",
      supportsNoLogging: true,
      supportsNoTraining: true,
    },
    available: true,
  };
}

export async function run(ctx) {
  const privacyText = await readFixture("adversarial-privacy-case.txt");
  await writeArtifactContentAddressed(ctx.fixturesDir, privacyText);

  const artifacts = [
    artifact.text(privacyText, {
      id: "artifact:text:privacy-case",
      label: "Adversarial privacy fixture",
      privacy: "sensitive",
    }),
  ];

  const providerId = "showcase-refusal";
  const ai = buildScenarioAI({
    signer: ctx.signer,
    sessionId: "refusal",
    fakeRawOutputs: {
      answer: "(unreachable)",
      action: {
        kind: "clarify",
        reason: "(unreachable)",
        priority: "normal",
      },
    },
    capabilities: [buildPricedCapability(providerId)],
  });

  const intent = {
    task: "Resolve the case but only on a near-zero-cost route.",
    session: ai.session("showcase-refusal"),
    artifacts,
    outputs: {
      answer: "text",
      action: actionSchema,
    },
    policy: { privacy: "sensitive" },
    contract: contract({ budget: { maxCostUsd: 0.0000001 } }),
  };

  const result = await ai.run(intent);

  if (result.ok !== false) {
    throw new Error("no-contract-match scenario expected ok=false, got ok=true");
  }
  if (result.error?.kind !== "no-contract-match") {
    throw new Error(
      `no-contract-match scenario expected error.kind="no-contract-match", got "${result.error?.kind ?? "unknown"}"`,
    );
  }
  if (result.receipt === undefined) {
    throw new Error("no-contract-match scenario expected result.receipt (refusal receipt) to be present");
  }

  const payloadJson = Buffer.from(result.receipt.payload, "base64url").toString("utf8");
  const body = JSON.parse(payloadJson);
  if (body.contractVerdict !== "no-contract-match") {
    throw new Error(
      `no-contract-match scenario expected contractVerdict="no-contract-match", got "${body.contractVerdict}"`,
    );
  }

  // Refusal: no provider invoked, no tokens consumed. The canonical
  // form coerces costUsd to a string ("0") under I-JSON rules.
  if (body.usage.promptTokens !== 0 || body.usage.completionTokens !== 0) {
    throw new Error(
      `no-contract-match scenario expected zero token usage, got ${JSON.stringify(body.usage)}`,
    );
  }

  await writeReceipt(ctx.receiptsDir, result.receipt);

  return {
    scenario: "no-contract-match",
    receiptId: body.receiptId,
    verdict: body.contractVerdict,
    ok: false,
    error: result.error.kind,
  };
}
