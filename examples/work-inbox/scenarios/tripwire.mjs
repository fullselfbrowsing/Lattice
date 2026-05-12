/**
 * Tripwire scenario — fake provider returns an `answer` field containing
 * the email `j.doe@example.com`. The contract attaches `inv.noPII("answer")`,
 * the default PII detectors (Luhn + email regex) fire on the answer, and
 * the run terminates with `RunFailure { kind: "tripwire-violated" }`.
 *
 * The terminating receipt is signed (RECEIPT-10) and carries
 * `contractVerdict: "tripwire-violated"` plus the tripwire evidence.
 *
 * The email `j.doe@example.com` is NOT a real address — it matches the
 * email regex without identifying anyone. See 13-01-PLAN.md "the email
 * used is `j.doe@example.com` — NOT a real address".
 */

import { readFile } from "node:fs/promises";

import {
  artifact,
  contract,
  inv,
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
  const privacyText = await readFixture("adversarial-privacy-case.txt");
  await writeArtifactContentAddressed(ctx.fixturesDir, privacyText);

  const artifacts = [
    artifact.text(privacyText, {
      id: "artifact:text:privacy-case",
      label: "Adversarial privacy fixture",
      privacy: "sensitive",
    }),
  ];

  const ai = buildScenarioAI({
    signer: ctx.signer,
    sessionId: "tripwire",
    fakeRawOutputs: {
      // The email j.doe@example.com is intentionally embedded so the
      // default email-regex PII detector trips.
      answer: "Refund approved for j.doe@example.com per ticket review.",
      action: {
        kind: "refund",
        reason: "duplicate",
        priority: "normal",
      },
    },
  });

  const intent = {
    task: "Process the privacy-sensitive customer case and return an answer plus action.",
    session: ai.session("showcase-tripwire"),
    artifacts,
    outputs: {
      answer: "text",
      action: actionSchema,
    },
    policy: { privacy: "sensitive" },
    contract: contract({
      budget: { maxCostUsd: 0.05 },
      invariants: [inv.noPII("answer")],
    }),
  };

  const result = await ai.run(intent);

  if (result.ok !== false) {
    throw new Error("tripwire scenario expected ok=false, got ok=true");
  }
  if (result.error?.kind !== "tripwire-violated") {
    throw new Error(
      `tripwire scenario expected error.kind="tripwire-violated", got "${result.error?.kind ?? "unknown"}"`,
    );
  }
  if (result.receipt === undefined) {
    throw new Error("tripwire scenario expected result.receipt to be present (signer is wired)");
  }

  const payloadJson = Buffer.from(result.receipt.payload, "base64url").toString("utf8");
  const body = JSON.parse(payloadJson);
  if (body.contractVerdict !== "tripwire-violated") {
    throw new Error(
      `tripwire scenario expected contractVerdict="tripwire-violated", got "${body.contractVerdict}"`,
    );
  }

  await writeReceipt(ctx.receiptsDir, result.receipt);

  return {
    scenario: "tripwire",
    receiptId: body.receiptId,
    verdict: body.contractVerdict,
    ok: false,
    error: result.error.kind,
    invariantId: result.error.invariantId,
  };
}
