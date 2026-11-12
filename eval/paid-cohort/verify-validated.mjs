// Fresh-process receipt verification for stages smoke, B and C.
// Usage: node verify-validated.mjs smoke|B|C   (writes results/verification-<stage>.json)
// Trusts only the stage's published public key and the stored request bodies, task/policy hashes and outputs.
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as L from "../../packages/lattice/dist/index.js";
import { fingerprintArtifactValue } from "../../packages/lattice/dist/storage.js";
import { paths, readJSON, writeJSON, jsonHash, sha } from "./common.mjs";

const MODE = process.argv[2];
if (!["smoke", "B", "C"].includes(MODE)) throw new Error("Usage: verify-validated.mjs smoke|B|C");
const STAGE = MODE === "smoke" ? "smoke-citations" : MODE;
const FILE = { "smoke-citations": "smoke-citations", B: "citations-live", C: "runtime" }[STAGE];
const dirs = paths();
const out = readJSON(join(dirs.out, FILE + ".json"));
const privateRows = readJSON(join(dirs.priv, FILE + "-private.json"));
const trust = readJSON(join(dirs.out, STAGE + "-public-key.json"));
if (out.trustAnchorHash !== jsonHash(trust)) throw new Error("Trust anchor differs from the stage output.");
const keys = L.createMemoryKeySet([trust]);

/** Receipts of successful signed runs are the ones the validity rule counts. */
const applicable = (row) => row.ok === true && row.arm !== "direct" && !(row.suite.startsWith("latency") && row.arm === "unsigned");

async function verifyRow(row, kept) {
  if (!kept) return { present: false, verified: false, reason: "no private record" };
  if (row.suite === "crew") {
    if (!Array.isArray(kept.receipts) || !kept.receipts.length) return { present: false, verified: false, reason: "no receipt chain" };
    const chain = await L.verifyChain(kept.receipts, keys, { requireClosure: true });
    return { present: true, verified: chain.ok === true, chainClosed: chain.ok === true };
  }
  if (!kept.receipt) return { present: false, verified: false, reason: "no receipt" };
  const options = { ...(kept.expectedTaskHash ? { expectedTaskHash: kept.expectedTaskHash } : {}),
    ...(kept.expectedPolicyHash ? { expectedPolicyHash: kept.expectedPolicyHash } : {}),
    ...(kept.requestBodies?.length ? { expectedProviderRequestHashes: kept.requestBodies.map(sha) } : {}) };
  const verified = await L.verifyReceipt(kept.receipt, keys, options);
  if (!verified.ok) return { present: true, verified: false, reason: verified.error.kind };
  const body = verified.body;
  let outputMatches = null;
  if (body.contractVerdict === "success" && body.outputHash !== null) {
    outputMatches = kept.outputs != null && (await fingerprintArtifactValue(kept.outputs))?.value === body.outputHash;
  }
  const bound = !!kept.expectedTaskHash && !!kept.expectedPolicyHash && !!kept.requestBodies?.length;
  return { present: true, verified: bound && outputMatches !== false, boundToExpectations: bound, outputMatches, verdict: body.contractVerdict };
}

const rows = [];
for (const row of out.rows) {
  if (row.status !== "finished") { rows.push({ id: row.id, model: row.model, suite: row.suite, arm: row.arm, status: row.status, runOk: false, applicable: false }); continue; }
  const kept = privateRows.find((p) => p.id === row.id && p.model === row.model && p.suite === row.suite && p.arm === row.arm);
  const result = applicable(row) || row.receipt?.present ? await verifyRow(row, kept) : { present: false, verified: null };
  rows.push({ id: row.id, model: row.model, suite: row.suite, arm: row.arm, status: row.status, runOk: row.ok === true, applicable: applicable(row), ...result });
}
const successful = rows.filter((r) => r.applicable);
const summary = { stage: STAGE, checkedAt: new Date().toISOString(), trustAnchorHash: out.trustAnchorHash, protocolHash: out.protocolHash,
  successful: successful.length, verified: successful.filter((r) => r.verified === true).length, rows };
if (!existsSync(dirs.out)) throw new Error("Output directory missing.");
writeJSON(join(dirs.out, "verification-" + STAGE + ".json"), summary);
console.log(JSON.stringify({ stage: STAGE, successful: summary.successful, verified: summary.verified }));
