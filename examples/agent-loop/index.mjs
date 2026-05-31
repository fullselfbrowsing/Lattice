/**
 * agent-loop showcase entry (v1.2 Phase 22).
 *
 * Runs the configured agent against the deterministic 3-iteration
 * fake-provider sequence, captures the per-iteration receipts that the
 * auto-registered checkpoint hook mints, writes them to a temp directory,
 * and prints a copy-pastable verify line.
 */

import { createAI, evalAgentRun, verifyReceipt } from "../../packages/lattice/dist/index.js";

import { createShowcase } from "./setup.mjs";

const ctx = await createShowcase();

const mintedEnvelopes = [];
const tracer = {
  kind: "tracer",
  event: (kind, payload) => {
    if (kind === "step.transition" && payload?.envelope !== undefined) {
      mintedEnvelopes.push(payload.envelope);
    }
  },
};

const ai = createAI({ providers: [ctx.fake], signer: ctx.signer });
const result = await ai.runAgent({
  task: "Compute pi + 0.86.",
  tools: ctx.tools,
  pipeline: ctx.pipeline,
  signer: ctx.signer,
  tracer,
});

if (result.kind !== "success") {
  process.stderr.write(`agent-loop FAILED: kind=${result.kind} reason=${result.reason ?? ""}\n`);
  process.exit(2);
}

// Verify each captured receipt under the ephemeral KeySet.
let allVerified = true;
const receiptPaths = [];
for (const envelope of mintedEnvelopes) {
  const v = await verifyReceipt(envelope, ctx.keySet);
  if (!v.ok) {
    allVerified = false;
    process.stderr.write(`verifyReceipt failed: ${v.error?.kind ?? "unknown"}\n`);
    continue;
  }
  // Receipt id can be derived from the envelope payload or we synthesize one.
  const receiptId = `agent-receipt-${receiptPaths.length}`;
  receiptPaths.push(ctx.writeReceipt(receiptId, envelope));
}

// Demonstrate the eval helper against a synthetic baseline.
const snapshot = {
  iterationsToGoal: result.iterations.length,
  usage: result.usage,
};
const evalReport = evalAgentRun(
  // Pretend the baseline was 3 iterations with slightly lower cost.
  { iterationsToGoal: 3, usage: { ...result.usage, costUsd: (result.usage.costUsd ?? 0) * 0.99 } },
  snapshot,
);

process.stdout.write(
  [
    `scenario=basic-agent iterations=${result.iterations.length} receipts=${receiptPaths.length} verified=${allVerified}`,
    `usage promptTokens=${result.usage.promptTokens} completionTokens=${result.usage.completionTokens} costUsd=${result.usage.costUsd ?? "null"}`,
    `cost-tracker total=${JSON.stringify(ctx.primitives.costTracker.total())}`,
    `goal-progress status=${ctx.primitives.goalProgress.status()}`,
    `eval ok=${evalReport.ok} regressions=${evalReport.regressions.length}`,
    `receipts-dir=${ctx.outputDir}`,
    receiptPaths.length > 0
      ? `next-step lattice verify ${receiptPaths[0]}`
      : "next-step no-receipts",
    "",
  ].join("\n"),
);
