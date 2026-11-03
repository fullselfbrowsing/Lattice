import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as L from "../../packages/lattice/dist/index.js";
import { CASES, PROTOCOL } from "./cases.mjs";
import { sha, jsonHash, gradeReview, verifyBundle, integrityControls } from "./workflow.mjs";

const root = resolve(import.meta.dirname, "../.."), dir = resolve(import.meta.dirname, "results");
const privateDir = resolve(root, ".context/refund-public");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const publicRead = (path) => read(resolve(dir, path));
const write = (name, data) => writeFileSync(resolve(dir, name), JSON.stringify(data, null, 2) + "\n");
const protocol = publicRead("protocol.json"), live = publicRead("live.json"), trust = publicRead("public-key.json");
const inputs = read(resolve(privateDir, "inputs.json"));
assert.equal(jsonHash(protocol), live.protocolHash);
assert.equal(jsonHash(trust), protocol.trustAnchorHash);
assert.equal(jsonHash(inputs), protocol.inputHash);
assert.equal(jsonHash(CASES), protocol.caseDefinitionHash);
assert.equal(sha(readFileSync(resolve(import.meta.dirname, "source-manifest.json"))), protocol.manifestHash);
for (const [path, hash] of Object.entries(protocol.codeHashes)) assert.equal(sha(readFileSync(resolve(root, path))), hash, path);
const keys = L.createMemoryKeySet([trust]), checked = [];
let controlSource;
for (const row of live.rows) {
  if (!row.bundle) { checked.push({ id: row.id, signature: false, evidenceOkay: false, strict: false, reason: "interrupted-or-unavailable" }); continue; }
  const example = { ...CASES.find((c) => c.id === row.caseId), artifacts: inputs.find((c) => c.id === row.caseId).artifacts };
  const bundle = read(resolve(privateDir, row.bundle));
  assert.equal(jsonHash(bundle), row.bundleHash);
  const published = publicRead(row.bundle);
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
  checked.push({ id: row.id, ...verification, grade, strict: row.runtimeOkay && grade.strict });
  if (!controlSource && verification.evidenceOkay) controlSource = { row, bundle, example };
}
const controls = controlSource ? await integrityControls(controlSource.bundle, keys, controlSource.example) : [];
const count = (xs, test) => xs.filter(test).length;
const metrics = PROTOCOL.models.map((model) => {
  const rows = live.rows.filter((r) => r.model === model), ids = new Set(rows.map((r) => r.id));
  const verifications = checked.filter((r) => ids.has(r.id));
  return { model, planned: CASES.length * PROTOCOL.repetitions, attempted: rows.length,
    runtimeSuccess: count(rows, (r) => r.runtimeOkay), factualRuns: count(rows, (r) => r.runtimeOkay && r.grade?.facts),
    citationRuns: count(rows, (r) => r.runtimeOkay && r.grade?.citations), strictPass: count(verifications, (r) => r.strict),
    factualAnswers: rows.reduce((n, r) => n + count(r.grade?.answers ?? [], (a) => a.fact), 0),
    citedAnswers: rows.reduce((n, r) => n + count(r.grade?.answers ?? [], (a) => a.citation), 0),
    plannedAnswers: CASES.reduce((n, c) => n + c.questions.length, 0) * PROTOCOL.repetitions,
    signatures: count(verifications, (r) => r.signature), evidenceComplete: count(verifications, (r) => r.evidenceOkay) };
});
const requests = live.rows.flatMap((r) => r.calls ?? []);
const failures = live.rows.filter((r) => !r.runtimeOkay || !r.grade?.strict).map((r) => ({ id: r.id, error: r.error,
  format: r.grade?.format ?? false, answers: r.grade?.answers?.filter((a) => !a.fact || !a.citation) ?? [] }));
const byCase = CASES.map((c) => { const rows = live.rows.filter((r) => r.caseId === c.id); return {
  caseId: c.id, planned: PROTOCOL.models.length * PROTOCOL.repetitions, attempted: rows.length,
  strictPass: count(rows, (r) => r.runtimeOkay && r.grade?.strict),
}; });
const summary = { measuredRevision: protocol.revision, planned: PROTOCOL.plannedRuns, attempted: live.rows.length,
  models: metrics, byCase, strictPass: metrics.reduce((n, m) => n + m.strictPass, 0),
  evidenceComplete: metrics.reduce((n, m) => n + m.evidenceComplete, 0), failures,
  controlsPassed: count(controls, (c) => c.passed), controlsTotal: controls.length,
  requestCount: requests.length, cohortRequests: live.cohortRequests ?? null,
  reportedZeroCost: count(requests, (r) => r.costUsd === 0), unknownCost: count(requests, (r) => r.costUsd === null),
  nonzeroCost: count(requests, (r) => r.costUsd > 0), addedAccountUsageUsd: live.addedAccountUsageUsd ?? null,
  paidLedgerUnchanged: live.paidLedgerUnchanged ?? null, stopped: live.stopped ?? null,
  scope: "Actual public records; retrospective source-grounded extraction. Complete decisions (including outcomes) provided. Not outcome prediction, adjudication, a production deployment or a representative benchmark.",
};
write("summary.json", summary);
write("verification.json", { checkedAt: new Date().toISOString(), rows: checked,
  retention: "Fresh-process verification uses exact local sources/request bodies. Published bundles omit source page text and raw requests; retained outputs/receipts/hash manifests are public. Source PDFs can be retrieved and matched to the manifest. No original company exhibit authenticity or issuer honesty established." });
write("controls.json", { source: controlSource?.row.id ?? null, rows: controls, scope: "One intact control and nine mutations/trust checks, on one eligible live bundle. Not ten independent live cases." });
const md = ["# Actual public refund disputes: retrospective Lattice evaluation", "",
  "**Real published case records and live model calls. No invented booking, policy, approval or payment events.**", "",
  summary.scope, "", "Measured revision: `" + protocol.revision + "`. Four cases, two pinned free models, two repetitions; " + summary.attempted + "/" + summary.planned + " planned reviews attempted. No development inference, retries or post-freeze repairs.", "",
  "| Model | Factual runs | Supporting-page runs | Full rubric | Factual answers | Verified packages |",
  "| --- | --- | --- | --- | --- | --- |",
  ...metrics.map((m) => `| ${m.model} | ${m.factualRuns}/${m.planned} | ${m.citationRuns}/${m.planned} | ${m.strictPass}/${m.planned} | ${m.factualAnswers}/${m.plannedAnswers} | ${m.evidenceComplete}/${m.planned} |`),
  "", "Five prespecified questions per case distinguish currencies, paid/claimed/ordered amounts, temporary credit status, and absence of settlement evidence. Supporting-page coverage checks an accepted page ID for each answer; it does not grade every sentence in the free-text review note. Source-based labels were prepared with Codex and await independent author validation. All planned runs remain in denominators.",
  "", "| Actual dispute | Full rubric | Source |", "| --- | --- | --- |",
  ...byCase.map((c) => `| ${c.caseId} | ${c.strictPass}/${c.planned} | [published decision](${CASES.find((x) => x.id === c.caseId).url}) |`),
  "", "## Failures retained", "", failures.length ? "```json\n" + JSON.stringify(failures, null, 2) + "\n```" : "No full-rubric failures in this small cohort. This does not establish unseen-case generalization or legal correctness.",
  "", "## Evidence and cost", "",
  summary.evidenceComplete + "/" + summary.planned + " locally retained run-evidence packages reverified in a fresh process. Signatures, full page inputs, outputs, expected tasks/execution policies and exact serialized requests were checked. Published bundles retain outputs, receipts and source/request fingerprints; full source pages and request bodies remain local rather than republishing complete decisions.",
  "", summary.controlsPassed + "/" + summary.controlsTotal + " scoped checks passed on one live bundle. Includes an intact control; separate from the live-run denominator. See [controls](controls.json).", "",
  "Inference requests: " + summary.requestCount + "; reported zero cost: " + summary.reportedZeroCost + "; unknown cost: " + summary.unknownCost + "; nonzero cost: " + summary.nonzeroCost + ". Account usage delta: " + summary.addedAccountUsageUsd + " USD. Paid ledger unchanged: " + summary.paidLedgerUnchanged + ". Stop reason: " + summary.stopped + ".", "",
  "## Boundaries", "", "The source documents are published decisions, not original airline/bank files. The full decisions include their outcomes, so the experiment measures retrospective record review rather than forecasting an adjudicator. Selection is purposive, cases are public and may have appeared in model training, repeated runs are dependent, and four cases do not establish operational accuracy. Model recommendations did not authorize or execute anything. Human review effectiveness, savings, fairness, legal entitlement, provider honesty and superiority over secured logging remain untested.", "",
  "Reproduction and source retention: [README](../README.md), [source manifest](../source-manifest.json), [questions and labels](../cases.mjs). The earlier [synthetic cohort](../../refund/results/summary.md) remains a separate technical control, not evidence of actual customer-case performance.", "",
];
writeFileSync(resolve(dir, "summary.md"), md.join("\n"));
console.log(JSON.stringify(summary, null, 2));
