// Presentation only: read saved measurements without running a model or benchmark.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const inputs = {};
function read(path) {
  const bytes = readFileSync(resolve(root, path));
  inputs[path] = createHash("sha256").update(bytes).digest("hex");
  return JSON.parse(bytes);
}
const free = read("eval/realworld/results/validated-free-summary.json");
const freeRaw = read("eval/realworld/results/validated-free-full.json");
const paid = read("eval/realworld/results/validated-summary.json");
const overhead = read("eval/results/overhead.json");
const latencyEnv = read("eval/results/env-latency.json");
const functionalEnv = read("eval/results/env-functional.json");
const tamper = read("eval/results/tamper.json");
const verifier = read("eval/results/v16.json");
const account = read("eval/realworld/results/accountability.json");
const publicControls = read("eval/public-refund/results/controls.json");
const publicSummary = read("eval/public-refund/results/summary.json");
const synthetic = read("eval/refund/results/controls.json");

const sum = (xs, key) => xs.reduce((n, x) => n + x[key], 0);
const num = (x, digits = 2) => x == null ? "unmeasured" : x.toFixed(digits);
const interval = (x) => x == null ? "unavailable" : x.map(v => num(v)).join("--");
const short = (s) => s.slice(0, 7);
const modelNames = { "nvidia/nemotron-3.5-super-vl:free": "Nemotron VL", "dots-studio/dots-3-note-preview:free": "Dots Note" };
const name = (m) => { assert.ok(modelNames[m], `Unmapped model: ${m}`); return modelNames[m]; };
const armName = { direct: "D", unsigned: "U", signed: "S", "prompt-only": "Prompt", contract: "Contract" };
const quantile = (xs, q) => {
  const a = [...xs].sort((x, y) => x - y), i = (a.length - 1) * q;
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1);
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `Saved statistic differs: ${a} vs ${b}`);

assert.equal(free.env.revision, freeRaw.env.revision);
const latency = free.groups.filter(g => g.suite === "latency");
assert.equal(latency.length, free.env.models.length * 3);
for (const g of latency) {
  const rows = freeRaw.rows.filter(r => r.suite === "latency" && r.model === g.model && r.arm === g.arm);
  assert.equal(rows.length, g.attempted);
  const eligible = rows.filter(r => r.ok === true && r.correct === true);
  for (const field of ["wallMs", "providerMs", "processingMs"]) {
    const values = eligible.map(r => r[field] - (field === "wallMs" ? (r.pacingMs ?? 0) : 0));
    assert.ok(values.every(v => Number.isFinite(v) && v >= 0));
    assert.equal(values.length, g.timing[field].n);
    close(quantile(values, 0.5), g.timing[field].p50);
    close(quantile(values, 0.95), g.timing[field].p95);
    const ci = g.timing[field].medianCI95;
    assert.ok(ci === null || (ci.length === 2 && ci.every(Number.isFinite) && ci[0] <= ci[1]));
  }
}
// Reuse the frozen bootstrap intervals; do not generate a new inferential result.
const citations = free.groups.filter(g => g.suite === "citations");
for (const g of citations) {
  const c = g.citations;
  assert.equal(c.expected, g.expected);
  assert.equal(c.expected, c.attempted + c.unattempted);
  assert.ok(c.strictSuccess <= c.usableAnswerCorrect && c.usableAnswerCorrect <= c.usableJudgeValid);
  assert.ok(c.usableJudgeValid <= c.usable && c.usable <= c.formatValid && c.formatValid <= c.expected);
  assert.equal(c.usableJudgeValid + c.unjudgedOrInvalidPerExpected, c.expected);
}
// Match the historical harness denominator; repeated presentation is excluded there.
const attacks = tamper.summary.filter(r => r.expectReject && r.category !== "replay");
assert.equal(sum(attacks, "n"), tamper.attackCases);
assert.equal(sum(attacks, "rejected"), tamper.attackRejected);
assert.equal(verifier.rows.length, verifier.checks);
assert.equal(verifier.rows.filter(r => r.ok).length, verifier.passed);
for (const [arm, categories] of Object.entries(account.summary)) {
  for (const [category, saved] of Object.entries(categories)) {
    const rows = account.probes.filter(p => p.category === category).map(p => p.outcomes[arm]);
    assert.equal(rows.length, saved.cases);
    assert.equal(rows.filter(r => r.applicable && r.accepted === true).length, saved.accepted);
    assert.equal(rows.filter(r => r.applicable && r.accepted === false).length, saved.rejected);
    assert.equal(rows.filter(r => !r.applicable).length, saved.unsupported);
  }
}
assert.ok(account.probes.every(p => p.outcomes["signed-canonical-log"].accepted === p.outcomes["lattice-receipt"].accepted));
assert.equal(publicControls.rows.length, publicSummary.controlsTotal);
assert.equal(publicControls.rows.filter(r => r.passed).length, publicSummary.controlsPassed);
assert.ok(synthetic.wrongSigned.verification.evidenceOkay && !synthetic.wrongSigned.grade.strict);

const chain = id => {
  const r = tamper.chainSummary.find(r => r.mutation === id);
  assert.ok(r, `Missing chain scenario: ${id}`);
  return `${Math.round(r.n * r.chainVerifierRejectRate)}/${r.n}`;
};
const accountCell = (arm, category, field) => {
  const r = account.summary[arm][category];
  return `${r[field]}/${r.cases}`;
};
const publicCell = (names) => {
  const rows = names.map(n => publicControls.rows.find(r => r.name === n));
  assert.ok(rows.every(Boolean));
  return `${rows.filter(r => r.passed).length}/${rows.length}`;
};
const paidLatency = paid.groups.filter(g => g.suite === "latency");
// The two named configurations are not the extremes, so report the full range too.
const signDeltas = overhead.summary.filter(r => r.measure === "run").map(r => {
  const signed = overhead.summary.find(s => s.config === r.config && s.measure === "runSig");
  assert.ok(signed, `Missing signed arm: ${r.config}`);
  return signed.p50 - r.p50;
});
const texRow = cells => cells.join(" & ") + " \\\\";
const table = (caption, label, columns, header, rows, note) => String.raw`\begin{table}[!htbp]
\centering
\caption{${caption}}
\label{${label}}
\begingroup\footnotesize\setstretch{1.05}\setlength{\tabcolsep}{4pt}
\begin{tabularx}{\textwidth}{${columns}}
\toprule
${texRow(header)}
\midrule
${rows.join("\n\\addlinespace[3pt]\n")}
\bottomrule
\end{tabularx}
\par\smallskip\noindent\begin{minipage}{\textwidth}${note}\end{minipage}
\endgroup
\end{table}`;

const costTable = table(
  "Hosted timing distributions from the separate free cohort (milliseconds)", "tab:c4-cost",
  "@{}>{\\raggedright\\arraybackslash}p{25mm}r*{4}{>{\\raggedright\\arraybackslash}X}@{}",
  ["Model / arm", "Eligible / tried", "Wall p50 / p95", "HTTP p50", "Residual p50 [95\\% CI]", "Residual p95"],
  latency.map(g => texRow([`${name(g.model)} / ${armName[g.arm]}`, `${g.timing.wallMs.n}/${g.attempted}`,
    `${num(g.timing.wallMs.p50, 1)} / ${num(g.timing.wallMs.p95, 1)}`, num(g.timing.providerMs.p50, 1),
    `${num(g.timing.processingMs.p50)} [${interval(g.timing.processingMs.medianCI95)}]`, num(g.timing.processingMs.p95)])),
  String.raw`D/U/S: direct HTTP, unsigned runtime, signed runtime. Revision \code{${short(free.env.revision)}}, Node ${free.env.node}; host CPU/OS are not recorded in this cohort's environment. Each arm planned ${latency[0].expected} measured cases; ${free.warmupRows} warmups across the cohort are excluded. Eligibility requires runtime success and the expected answer; the excluded Dots/U case remains in coverage and was the recorded HTTP-200 error-envelope defect. Wall removes pacing from elapsed time; HTTP includes transport/remote service time, not isolated model compute. Residual removes HTTP, pacing and backoff from elapsed time, and includes harness hashing, ledger and JSON work. Columns summarize separate distributions and need not add. Intervals reuse the saved percentile bootstrap of the median (10,000 resamples within model/arm); p95 is sample variability, not a confidence limit. Paid-cohort latency remains unmeasured (${sum(paidLatency, "attempted")}/${sum(paidLatency, "expected")} attempted). Small free-tier samples do not estimate production latency or a causal signing increment.`);

const threatTable = table(
  "Threat coverage and boundaries of the recorded integrity checks", "tab:c4-threats",
  "@{}>{\\raggedright\\arraybackslash}p{32mm}>{\\raggedright\\arraybackslash}p{58mm}>{\\raggedright\\arraybackslash}X@{}",
  ["Threat / control", "Recorded evidence", "Boundary"],
  [
    texRow(["Intact records", `${tamper.summary.find(r => r.mutation === "untouched").n} untouched historical receipts accepted; matched signed log and Lattice each accept ${accountCell("lattice-receipt", "positive-control", "accepted")} controls.`, "Controls are separate from attacks. Valid signatures do not establish truth."]),
    texRow(["Committed content / signatures", `${tamper.attackRejected}/${tamper.attackCases} defined historical attacks rejected on ${tamper.baseReceipts} receipts. Matched signed log and Lattice each reject ${accountCell("lattice-receipt", "integrity-mutation", "rejected")} content mutations and ${accountCell("lattice-receipt", "key-mismatch", "rejected")} key mismatches.`, "Same-record signed-log parity; no cryptographic superiority or coverage of all attacks."]),
    texRow(["Retained files / request binding", `C2: ${publicCell(["changed-page", "missing-page", "changed-output", "changed-request", "changed-task", "wrong-case", "missing-receipt", "forged-signature", "untrusted-key"])} mutation/trust checks plus ${publicCell(["intact-control"])} intact control on one live bundle. Matched arms each reject ${accountCell("lattice-receipt", "expectation-check", "rejected")} expectation mismatches.`, "Local bytes and trusted expectations are needed; valid signatures can accompany missing or mismatched content."]),
    texRow(["Missing / reordered chain links", `Historical rejection: missing middle ${chain("drop-middle-link")}; foreign splice ${chain("splice-foreign-link")}; tail rejection ${chain("truncate-tail")} without expected count, ${chain("truncate-tail-expectedCount")} with it. Reordering rejection ${chain("swap-adjacent-links")}.`, "Link order is structural, not array order. Tail completeness requires a count or enforced closure; released 1.6.0 ignores newer closure fields."]),
    texRow(["Repeated presentation / verifier options", `${tamper.summary.find(r => r.category === "replay").n} repeated unbound receipts accepted; excluded from the historical attack denominator. ${verifier.passed}/${verifier.checks} separate mixed behavioral checks passed (Table~\\ref{tab:v16}).`, "No replay cache. Freshness, closure and mint-failure handling depend on options; mixed checks are not an attack-rejection rate."]),
    texRow(["Wrong but signed answer", "A separate scripted synthetic control verifies yet fails business-rule grading (Appendix~\\ref{sec:synthetic-refund-case}).", "No live dishonesty attack or observed payment. Issuer honesty, source truth and external effects remain unproven."]),
  ],
  String.raw`Historical functional revision \code{${short(functionalEnv.libraryCommit)}}; matched-record probes \code{${short(account.provenance.codeRevision)}}; actual-record C2 revision \code{${short(publicSummary.measuredRevision)}}. Denominators belong to different experiments and are not pooled. The matched unsigned JSON record accepted ${accountCell("json-log", "integrity-mutation", "accepted")} content mutations, rejected ${accountCell("json-log", "expectation-check", "rejected")} expectation mismatches, and does not authenticate keys. It is not a secured append-only logging service. The separate synthetic refund checks and live case are retained in their own tables.`);

const qualityTable = table(
  "Separate format, answer and citation outcomes in the free cohort", "tab:c4-quality",
  "@{}>{\\raggedright\\arraybackslash}p{25mm}l*{6}{>{\\raggedright\\arraybackslash}X}@{}",
  ["Model", "Arm", "Format", "Usable", "Judged", "Judged correct", "Strict support", "Abstained"],
  citations.map(g => {
    const c = g.citations, fraction = v => v == null ? "unmeasured" : `${v}/${c.expected}`;
    return texRow([name(g.model), armName[g.arm], fraction(c.formatValid), fraction(c.usable),
      fraction(c.usableJudgeValid), fraction(c.usableAnswerCorrect), fraction(c.strictSuccess), fraction(c.judgeAbstained)]);
  }),
  String.raw`Each column retains all ${citations[0].expected} planned questions per arm; unavailable/unjudged answers are not silently removed, and their quality is unknown. Strict support requires a usable, correct, non-abstaining answer with nonempty claims, every claim supported/cited and every listed citation relevant. Abstention is a judge label, not validated evidence that abstaining was justified; empty citation lists and filtered outputs are different outcomes. The fixed ${free.judgeModel.includes("nemotron") ? "Nemotron 3 Ultra" : free.judgeModel} judge is exploratory, without human calibration; these are not official ALCE scores. ${free.citationRequestPairs.identicalBodyHashes}/${free.citationRequestPairs.bothArmsSubmitted} completed prompt/contract pairs had identical request bodies. Post-generation format enforcement does not establish improved generation or semantic support. Revision \code{${short(free.env.revision)}}; full diagnostics, judge provenance and paid-cohort missing judgments remain in Appendix~\ref{app:hosted-details}.`);

const macros = {
  CfourFreeRecorded: free.recorded, CfourFreeExpected: free.expected,
  CfourPaidAttempted: paid.collection.attempted, CfourPaidExpected: paid.collection.expected,
  CfourPublicSignatures: sum(publicSummary.models, "signatures"), CfourPublicPackages: publicSummary.evidenceComplete,
  CfourPublicPlanned: publicSummary.planned, CfourFreeStrict: sum(citations.map(g => g.citations), "strictSuccess"),
  CfourFreeCitationPlanned: sum(citations, "expected"),
  CfourPublicFrozen: publicSummary.strictPass,
  CfourSignDeltaConfigs: signDeltas.length, CfourSignDeltaMinMs: Math.min(...signDeltas).toFixed(3),
  CfourSignDeltaMaxMs: Math.max(...signDeltas).toFixed(3),
};
const out = "% Generated by paper/scripts/c4-tables.mjs from saved results. Do not edit.\n"
  + Object.entries(macros).map(([k, v]) => `\\newcommand{\\${k}}{${v}}`).join("\n") + "\n\n"
  + [["CfourCostTable", costTable], ["CfourThreatTable", threatTable], ["CfourQualityTable", qualityTable]]
    .map(([k, v]) => `\\newcommand{\\${k}}{%\n${v}\n}\n`).join("\n");
const data = {
  version: "c4-presentation/v1", inputs,
  controlled: { env: latencyEnv, trials: overhead.trials, warmup: overhead.warmup,
    summary: overhead.summary, sizes: overhead.sizes, uncertainty: "Saved percentiles only; no CI for signing delta." },
  hosted: { revision: free.env.revision, node: free.env.node, hostRecorded: false, latency,
    intervals: "Reused saved 95% bootstrap median intervals, 10000 resamples; no recomputation.",
    paidLatencyAttempted: sum(paidLatency, "attempted"), paidLatencyPlanned: sum(paidLatency, "expected") },
  quality: { revision: free.env.revision, citations, judge: free.judgeModel, requestPairs: free.citationRequestPairs },
  integrity: { historicalRevision: functionalEnv.libraryCommit, attackCases: tamper.attackCases,
    attackRejected: tamper.attackRejected, chainSummary: tamper.chainSummary, matchedRevision: account.provenance.codeRevision,
    matched: account.summary, signedArmDecisionParity: account.signedArmDecisionParity, publicControls: publicControls.rows,
    scriptedWrongButSigned: { signature: synthetic.wrongSigned.verification.signature, evidenceOkay: synthetic.wrongSigned.verification.evidenceOkay, strict: synthetic.wrongSigned.grade.strict } },
  macros, noNewExperiments: true,
};
for (const [path, value] of [["paper/c4-evidence.tex", out], ["paper/c4-evidence.json", JSON.stringify(data, null, 2) + "\n"]]) {
  if (process.argv.includes("--check")) assert.equal(readFileSync(resolve(root, path), "utf8"), value, `Stale presentation: ${path}`);
  else writeFileSync(resolve(root, path), value);
}
console.log(JSON.stringify({ mode: process.argv.includes("--check") ? "check" : "render", sources: Object.keys(inputs).length,
  latencyRows: latency.length, citationRows: citations.length, signedLogParity: account.signedArmDecisionParity }));
