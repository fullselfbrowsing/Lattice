/**
 * agent-crew showcase entry (v1.3 Phase 39).
 *
 * Runs a deterministic parent + 3 children crew against the built Lattice
 * package, writes all crew receipts, verifies every signature, asserts the
 * parentReceiptCid chain, and prints the crew eval gate result.
 */

import {
  createAI,
  evalAgentRun,
  verifyReceipt,
} from "../../packages/lattice/dist/index.js";

import { createShowcase } from "./setup.mjs";

function decodeReceipt(envelope) {
  return JSON.parse(atob(envelope.payload));
}

const ctx = await createShowcase();
const ai = createAI({ providers: [ctx.fake] });

const result = await ai.runAgentCrew({
  root: ctx.root,
  hosts: { childHost: ctx.childHost },
  policy: {
    budget: { maxIterations: 10, maxCostUsd: 0.05 },
    maxTotalIterations: 10,
    maxIterationsPerAgent: 5,
    limits: {
      "agent-crew-showcase-fake": {
        requestsPerMinute: 100,
        tokensPerMinute: 100_000,
      },
    },
  },
  signer: ctx.signer,
});

if (result.result.kind !== "success") {
  process.stderr.write(
    `agent-crew FAILED: kind=${result.result.kind} reason=${result.result.reason ?? ""}\n`,
  );
  process.exit(2);
}

const receiptPaths = [];
let allVerified = true;
for (let i = 0; i < result.receipts.length; i += 1) {
  const envelope = result.receipts[i];
  const receiptId = `crew-receipt-${i}`;
  const verifyResult = await verifyReceipt(envelope, ctx.keySet);
  if (!verifyResult.ok) {
    allVerified = false;
    process.stderr.write(
      `verifyReceipt failed for ${receiptId}: ${verifyResult.error?.kind ?? "unknown"}\n`,
    );
    continue;
  }
  receiptPaths.push(ctx.writeReceipt(receiptId, envelope));
  process.stdout.write(`receipt ${receiptId} verified=true\n`);
}

if (!allVerified) {
  process.exit(3);
}

const bodies = result.receipts.map(decodeReceipt);
const rootBody = bodies[0];
if (rootBody?.parentReceiptCid !== undefined || result.crewRootCid === undefined) {
  process.stderr.write("agent-crew receipt chain invalid: root anchor malformed\n");
  process.exit(4);
}

for (const body of bodies.slice(1)) {
  if (body.parentReceiptCid !== result.crewRootCid) {
    process.stderr.write(
      `agent-crew receipt chain invalid: ${body.receiptId} parentReceiptCid mismatch\n`,
    );
    process.exit(4);
  }
}

const snapshot = {
  iterationsToGoal: result.totalIterations,
  usage: result.usage,
};
const baseline = {
  iterationsToGoal: 7,
  usage: { promptTokens: 84, completionTokens: 28, costUsd: 0.0021 },
};
const evalReport = evalAgentRun(baseline, snapshot);
if (!evalReport.ok) {
  process.stderr.write(
    `agent-crew eval FAILED: ${evalReport.regressions.map((r) => r.kind).join(",")}\n`,
  );
  process.exit(5);
}

process.stdout.write(
  [
    `scenario=agent-crew agents=${result.perAgent.length} iterations=${result.totalIterations} receipts=${receiptPaths.length}`,
    `usage promptTokens=${result.usage.promptTokens} completionTokens=${result.usage.completionTokens} costUsd=${result.usage.costUsd ?? "null"}`,
    `crew-root-cid=${result.crewRootCid}`,
    `eval ok=${evalReport.ok} regressions=${evalReport.regressions.length}`,
    `receipts-dir=${ctx.outputDir}`,
    "",
  ].join("\n"),
);
