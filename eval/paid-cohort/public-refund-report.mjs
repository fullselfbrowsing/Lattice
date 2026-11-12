// Fresh-process verification and scoring of stage A. Adapted from eval/public-refund/report.mjs.
import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import * as L from "../../packages/lattice/dist/index.js";
import { CASES } from "../public-refund/cases.mjs";
import { gradeReview, verifyBundle, integrityControls } from "../public-refund/workflow.mjs";
import { ROOT, COUNTS, TESTED_MODELS, REFUND_INPUTS, paths, readJSON, writeJSON, atomicWrite, jsonHash, sha, codeHashes, frozenCodeHashes } from "./common.mjs";

const dirs = paths();
const OUT = join(dirs.out, "public-refund"), PRIVATE = join(dirs.priv, "public-refund");
const frozenAudit = (name) => readJSON(resolve(ROOT, "eval/public-refund/results", name));
const protocol = readJSON(join(dirs.out, "protocol.json")), live = readJSON(join(OUT, "live.json")), trust = readJSON(join(OUT, "public-key.json"));
const inputs = readJSON(REFUND_INPUTS);
assert.equal(jsonHash(protocol), live.protocolHash);
assert.equal(jsonHash(trust), live.trustAnchorHash);
assert.equal(jsonHash(inputs), protocol.inputs.refundInputHash);
assert.deepEqual(codeHashes(), frozenCodeHashes(paths().out, protocol), "frozen code changed");
const keys = L.createMemoryKeySet([trust]);
const checked = [];
let controlSource;
for (const row of live.rows) {
  if (!row.bundle) { checked.push({ id: row.id, signature: false, evidenceOkay: false, strict: false, reason: "interrupted-or-unavailable" }); continue; }
  const example = { ...CASES.find((c) => c.id === row.caseId), artifacts: inputs.find((c) => c.id === row.caseId).artifacts };
  const bundle = readJSON(join(PRIVATE, row.bundle));
  assert.equal(jsonHash(bundle), row.bundleHash);
  const published = readJSON(join(OUT, row.bundle));
  assert.equal(jsonHash(published), row.publicBundleHash);
  assert.deepEqual(published.outputs, bundle.outputs);
  assert.deepEqual(published.receipt, bundle.receipt);
  assert.deepEqual(published.requestBodyHashes, bundle.requestBodies.map(sha));
  for (const body of bundle.requestBodies) assert.equal(JSON.parse(body).model, row.model);
  const verification = await verifyBundle(bundle, keys, example);
  const grade = gradeReview(bundle.outputs?.answer ?? bundle.rawAnswer ?? "", example);
  assert.deepEqual(verification, row.verification);
  assert.deepEqual(grade, row.grade);
  const signed = await L.verifyReceipt(bundle.receipt, keys);
  if (signed.ok) assert.equal(signed.body.model.requested, row.model);
  checked.push({ id: row.id, ...verification, grade, strict: row.runtimeOkay && grade.strict, runtimeOkay: row.runtimeOkay });
  if (!controlSource && verification.evidenceOkay) controlSource = { row, bundle, example };
}
const controls = controlSource ? await integrityControls(controlSource.bundle, keys, controlSource.example) : [];
const count = (xs, test) => xs.filter(test).length;

// Audited scores: the free cohort's complete two-directional source audit (source-audit.json; the superseded one-sided rubric-audit.json is not used), applied by the same rules to the saved per-answer grades.
const sourceAudit = frozenAudit("source-audit.json");
function reGrade(entry) {
  const caseId = entry.id.split(":")[0];
  const answers = (entry.grade?.answers ?? []).map((answer) => {
    const fix = sourceAudit.corrections.find((c) => c.caseId === caseId && c.question === answer.id);
    if (!fix) return answer;
    const accepted = fix.auditedAccepted.filter((a) => a.value === answer.value);
    return { ...answer, fact: accepted.length > 0, citation: accepted.some((a) => a.pages.some((p) => answer.sources.includes(`${caseId}-p${p}`))) };
  });
  return entry.grade?.format && answers.every((a) => a.fact) && answers.every((a) => a.citation);
}
const rows = live.rows.map((row, i) => ({ row, check: checked[i] }));
const metrics = TESTED_MODELS.map((model) => {
  const mine = rows.filter(({ row }) => row.model === model);
  return { model, planned: CASES.length * COUNTS.repetitions, attempted: mine.length,
    runtimeSuccess: count(mine, ({ row }) => row.runtimeOkay),
    factualRuns: count(mine, ({ row }) => row.runtimeOkay && row.grade?.facts),
    citationRuns: count(mine, ({ row }) => row.runtimeOkay && row.grade?.citations),
    strictPassFrozen: count(mine, ({ check }) => check.strict),
    strictPassAudited: count(mine, ({ row, check }) => row.runtimeOkay && reGrade(row) && check.signature),
    factualAnswers: mine.reduce((n, { row }) => n + count(row.grade?.answers ?? [], (a) => a.fact), 0),
    citedAnswers: mine.reduce((n, { row }) => n + count(row.grade?.answers ?? [], (a) => a.citation), 0),
    plannedAnswers: CASES.reduce((n, c) => n + c.questions.length, 0) * COUNTS.repetitions,
    signatures: count(mine, ({ check }) => check.signature), evidenceComplete: count(mine, ({ check }) => check.evidenceOkay) };
});
const requests = live.rows.flatMap((r) => r.calls ?? []);
const successful = checked.filter((c) => c.runtimeOkay);
const summary = {
  planned: CASES.length * COUNTS.repetitions * TESTED_MODELS.length, attempted: live.rows.length, models: metrics,
  strictPassFrozen: metrics.reduce((n, m) => n + m.strictPassFrozen, 0), strictPassAudited: metrics.reduce((n, m) => n + m.strictPassAudited, 0),
  evidenceComplete: metrics.reduce((n, m) => n + m.evidenceComplete, 0),
  successfulRuns: successful.length, successfulRunsVerified: count(successful, (c) => c.evidenceOkay),
  controlsPassed: count(controls, (c) => c.passed), controlsTotal: controls.length,
  requestCount: requests.length, nonzeroCost: count(requests, (r) => r.costUsd > 0), unknownCost: count(requests, (r) => r.costUsd === null),
  spentUsd: requests.reduce((n, r) => n + (r.costUsd ?? 0), 0), addedAccountUsageUsd: live.addedAccountUsageUsd ?? null, stopped: live.stopped ?? null,
  scope: "Actual public records; retrospective source-grounded extraction with three paid models. Complete decisions (including outcomes) provided. Not outcome prediction, adjudication, a production deployment or a representative benchmark. Not pooled with the free cohort.",
};
writeJSON(join(OUT, "summary.json"), summary);
writeJSON(join(OUT, "verification.json"), { checkedAt: new Date().toISOString(), rows: checked });
writeJSON(join(OUT, "controls.json"), { source: controlSource?.row.id ?? null, rows: controls });
const md = ["# Paid-model cohort: actual public refund disputes", "", summary.scope, "",
  `${summary.attempted}/${summary.planned} planned reviews attempted; no development inference, retries or post-freeze repairs.`, "",
  "| Model | Factual runs | Supporting-page runs | Full rubric (frozen) | Full rubric (audited) | Verified packages |", "| --- | --- | --- | --- | --- | --- |",
  ...metrics.map((m) => `| ${m.model} | ${m.factualRuns}/${m.planned} | ${m.citationRuns}/${m.planned} | ${m.strictPassFrozen}/${m.planned} | ${m.strictPassAudited}/${m.planned} | ${m.evidenceComplete}/${m.planned} |`),
  "", `Run-evidence packages reverified in a fresh process: ${summary.evidenceComplete}/${summary.planned}. Scoped integrity checks: ${summary.controlsPassed}/${summary.controlsTotal}.`,
  `Inference requests: ${summary.requestCount}; nonzero cost: ${summary.nonzeroCost}; unknown cost: ${summary.unknownCost}. Stop reason: ${summary.stopped}.`, ""];
atomicWrite(join(OUT, "summary.md"), md.join("\n"));
console.log(JSON.stringify(summary, null, 2));
