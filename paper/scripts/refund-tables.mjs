import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as L from "../../packages/lattice/dist/index.js";
import { CASES, PROTOCOL } from "../../eval/refund/fixtures.mjs";
import { sha, jsonHash, gradeRecommendation, verifyBundle, verifyApplicationRecord } from "../../eval/refund/workflow.mjs";
import { evidenceControls } from "../../eval/refund/controls.mjs";

// Presentation only: recheck saved evidence without running inference or rewriting results.
const root = resolve(import.meta.dirname, "../..");
const read = (name) => JSON.parse(readFileSync(resolve(root, "eval/refund/results", name), "utf8"));
const protocol = read("protocol.json"), live = read("live.json"), summary = read("summary.json");
const trust = read("public-key.json"), saved = read("verification.json"), controls = read("controls.json");
assert.equal(jsonHash(protocol), live.protocolHash, "Protocol changed");
assert.equal(jsonHash(trust), protocol.trustAnchorHash, "Trust anchor changed");
assert.equal(saved.trustAnchorHash, protocol.trustAnchorHash);
assert.equal(jsonHash(CASES), protocol.fixtureHash, "Fixtures changed");
for (const [file, hash] of Object.entries(protocol.codeHashes)) {
  assert.equal(sha(readFileSync(resolve(root, file))), hash, `Measured code changed: ${file}`);
}
assert.equal(live.rows.length, PROTOCOL.plannedRuns);
assert.equal(new Set(live.rows.map((r) => r.id)).size, live.rows.length, "Duplicate result IDs");
assert.equal(saved.rows.length, live.rows.length);
const keys = L.createMemoryKeySet([trust]);
const checked = [];
for (const row of live.rows) {
  const example = CASES.find((c) => c.id === row.caseId);
  assert.ok(example, `Unknown case ${row.caseId}`);
  assert.ok(PROTOCOL.models.includes(row.model));
  const bundle = read(row.bundle);
  assert.equal(jsonHash(bundle), row.bundleHash, `Changed bundle ${row.id}`);
  const verification = await verifyBundle(bundle, keys, example);
  const external = verifyApplicationRecord(bundle);
  const grade = gradeRecommendation(bundle.outputs?.answer ?? bundle.rawAnswer ?? "", example);
  assert.deepEqual(verification, row.verification, `Verification changed: ${row.id}`);
  assert.deepEqual(grade, row.grade, `Grade changed: ${row.id}`);
  const retained = saved.rows.find((r) => r.id === row.id);
  assert.deepEqual(retained, { id: row.id, ...verification, caseComplete: external.complete,
    strict: row.runtimeOkay && grade.strict, applicationProblems: external.problems });
  for (const body of bundle.requestBodies) assert.equal(JSON.parse(body).model, row.model);
  const receipt = await L.verifyReceipt(bundle.receipt, keys);
  assert.ok(receipt.ok);
  assert.equal(receipt.body.model.requested, row.model);
  checked.push({ ...row, grade, verification });
}
const count = (rows, predicate) => rows.filter(predicate).length;
const metrics = PROTOCOL.models.map((model) => {
  const rows = checked.filter((r) => r.model === model);
  for (const example of CASES) for (let repetition = 0; repetition < PROTOCOL.repetitions; repetition++) {
    assert.equal(rows.filter((r) => r.caseId === example.id && r.repetition === repetition).length, 1);
  }
  const m = { model, completed: count(rows, (r) => r.status === "finished"),
    planned: CASES.length * PROTOCOL.repetitions,
    decisions: count(rows, (r) => r.runtimeOkay && r.grade.format &&
      ["action", "amount_usd", "authority", "conflict", "rule"].every((k) => r.grade.fields[k])),
    strict: count(rows, (r) => r.runtimeOkay && r.grade.strict),
    evidence: count(rows, (r) => r.verification.evidenceOkay) };
  const s = summary.models.find((v) => v.model === model);
  assert.equal(m.planned, s.planned);
  assert.equal(rows.length, s.attempted);
  assert.equal(m.strict, s.strictPass);
  assert.equal(m.evidence, s.evidenceComplete);
  return m;
});
assert.equal(summary.attempted, checked.length);
assert.equal(summary.planned, PROTOCOL.plannedRuns);
assert.equal(summary.developmentCalls, live.development.length);
assert.equal(summary.strictPass, metrics.reduce((n, m) => n + m.strict, 0));
assert.equal(summary.evidenceComplete, metrics.reduce((n, m) => n + m.evidence, 0));
const omissions = checked.filter((r) => !r.grade.strict);
assert.ok(omissions.every((r) => r.grade.format && !r.grade.fields.requiredSources &&
  Object.entries(r.grade.fields).every(([k, v]) => k === "requiredSources" || v)));
for (const row of omissions) {
  const expected = CASES.find((c) => c.id === row.caseId).expected.sources;
  assert.deepEqual(expected.filter((id) => !row.grade.predicted.sources.includes(id)), ["request"]);
}
const requests = [...live.development, ...live.rows].flatMap((r) => r.calls ?? []);
assert.equal(requests.length, live.cohortRequests);
assert.equal(summary.cohortRequests, requests.length);
assert.ok(requests.every((r) => r.costUsd === 0), "Unknown or nonzero request cost");
assert.equal(summary.requestCosts.reportedZero, requests.length);
assert.equal(summary.addedAccountUsageUsd, live.addedAccountUsageUsd);
assert.equal(live.addedAccountUsageUsd, 0);
assert.equal(summary.mutationsTotal, controls.mutations.length);
assert.equal(summary.mutationsPassed, count(controls.mutations, (c) => c.passed));
const controlSource = live.rows.find((r) => r.id === controls.source);
assert.ok(controlSource);
assert.deepEqual(await evidenceControls(read(controlSource.bundle), keys,
  CASES.find((c) => c.id === controlSource.caseId)), controls.mutations);
assert.equal(summary.wrongSignedControlPassed, controls.wrongSigned.passed);
const wrong = controls.wrongSigned;
const disputed = CASES.find((c) => c.id === "disputed-promise");
assert.ok((await verifyBundle(wrong.bundle, L.createMemoryKeySet([wrong.trust]), disputed)).evidenceOkay);
assert.equal(gradeRecommendation(wrong.bundle.outputs.answer, disputed).strict, false);
assert.equal(wrong.bundle.application.status, "held");
assert.equal(wrong.bundle.application.paidUsd, 0);

const escape = (s) => String(s).replace(/[\\{}$&#_%~^]/g, (c) => ({
  "\\": "\\textbackslash{}", "~": "\\textasciitilde{}", "^": "\\textasciicircum{}",
}[c] ?? "\\" + c));
const names = ["Nemotron 3.5 Super VL", "Dots 3 Note Preview"];
const scenarioNames = { "disputed-promise": "disputed promise", "already-refunded": "already refunded", "customer-instruction": "customer instruction" };
const omissionGroups = PROTOCOL.models.flatMap((model, i) => [...new Set(omissions.filter((r) => r.model === model).map((r) => r.caseId))].map((caseId) => {
  const n = count(omissions, (r) => r.model === model && r.caseId === caseId);
  return `${escape(names[i])}, ${escape(scenarioNames[caseId] ?? caseId)} (${n} ${n === 1 ? "run" : "runs"})`;
}));
const row = (label, field) => `${label} & ${metrics.map((m) => `${m[field]}/${m.planned}`).join(" & ")} \\\\`;
const tex = String.raw`% Generated by paper/scripts/refund-tables.mjs from frozen eval/refund/results. Do not edit.
\begin{table}[htbp]
\centering
\caption{Live free-model results for the synthetic refund demonstration (separate from historical cohorts)}
\label{tab:refund-results}
\small
\begin{tabularx}{\textwidth}{@{}>{\raggedright\arraybackslash}X>{\centering\arraybackslash}p{35mm}>{\centering\arraybackslash}p{35mm}@{}}
\toprule
Measure & Nemotron 3.5 Super VL & Dots 3 Note Preview \\
\midrule
${row("Completed evaluation runs", "completed")}
${row("Decision and rule checks", "decisions")}
${row("Full rubric, including required references", "strict")}
${row("Verified run-evidence packages", "evidence")}
\bottomrule
\end{tabularx}
\begin{minipage}{\textwidth}
\footnotesize\setstretch{1.05}
\smallskip
\textit{Cohort.} ${CASES.length} synthetic scenarios $\times$ ${PROTOCOL.models.length} models $\times$ ${PROTOCOL.repetitions} repetitions = ${PROTOCOL.plannedRuns} planned runs; ${live.development.length} development calls excluded. Measured revision: \code{${escape(protocol.revision.slice(0, 7))}}. Temperature ${PROTOCOL.generation.temperature}, output cap ${PROTOCOL.generation.maxOutputTokens} tokens; reasoning settings omitted (provider defaults). Pinned OpenRouter IDs: \path{${PROTOCOL.models[0]}} and \path{${PROTOCOL.models[1]}}. No retries or post-freeze prompt repair.

\smallskip
\textit{Scoring.} Decision checks cover action, immediate amount, authority, conflict flag and decisive-rule inclusion. Full-rubric passes: ${summary.strictPass}/${PROTOCOL.plannedRuns}. All ${omissions.length} failures omitted the customer-request reference: ${omissionGroups.join("; ")}. The runtime format contract accepted these outputs; required-source coverage was scored separately. Explanation entailment was not systematically graded.

\smallskip
\textit{Verification and controls.} ${summary.evidenceComplete}/${PROTOCOL.plannedRuns} exported run-evidence packages verified in a fresh process (signature, input/output content and expected task, execution-policy and serialized-request bindings). ${summary.mutationsPassed}/${summary.mutationsTotal} scoped integrity/application checks passed on one routine bundle, including intact controls; these are not ${summary.mutationsTotal} distinct cryptographic attacks. A separate scripted offline wrong-but-signed control had valid evidence, failed decision scoring and was held by application rules.

\smallskip
\textit{Cost and scope.} All ${requests.length} inference requests reported USD 0 cost; added account usage was USD ${summary.addedAccountUsageUsd}. Recommendations used live models; approvals and payments were simulated. The cohort does not measure operational accuracy, human review outcomes or superiority over secured logging. Verification is of retained records, not model re-execution.
\end{minipage}
\end{table}
`;
const output = resolve(root, "paper/refund-results.tex");
if (process.argv.includes("--check")) assert.equal(readFileSync(output, "utf8"), tex, "Regenerate refund-results.tex");
else writeFileSync(output, tex);
console.log(JSON.stringify({ output, checked: checked.length, strict: summary.strictPass,
  evidence: summary.evidenceComplete, omissions: omissions.length, controls: summary.mutationsPassed,
  addedSpendUsd: live.addedAccountUsageUsd, mode: process.argv.includes("--check") ? "check" : "write" }));
