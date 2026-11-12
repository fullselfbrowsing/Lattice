// Final report: summary.json and summary.md, plus the validity verdict. Writes under PAID_OUT_DIR in a dry run.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TESTED_MODELS, JUDGE_MODELS, paths, readJSON, writeJSON, atomicWrite, readStages, responded } from "./common.mjs";

const dirs = paths();
const OUT = dirs.out;
const maybe = (name) => existsSync(join(OUT, name)) ? readJSON(join(OUT, name)) : null;
const stages = readStages(OUT);
const A = maybe("public-refund/summary.json"), B = maybe("citations-live.json"), J = maybe("judge.json"), C = maybe("runtime.json");

/**
 * Validity. Inputs are completion and receipt counts only; no score, grade, correctness or
 * quality value is passed in, so none can influence the verdict.
 * Rule: every admitted stage completes, at least 95% of planned calls return a model response,
 * every successful run's receipt verifies. Stages A, B and J are required (they fit the ledger by design);
 * C is optional but must complete if it was admitted.
 */
export function validity({ stages: status, receipts }) {
  const reasons = [];
  for (const name of ["A", "B", "J"]) {
    if (!status[name]?.admitted) reasons.push(`stage ${name} was not admitted or never ran`);
  }
  for (const [name, s] of Object.entries(status)) {
    if (name.startsWith("smoke-") || !s.admitted) continue;
    if (!s.complete) reasons.push(`stage ${name} did not complete${s.stopped ? " (" + s.stopped + ")" : ""}`);
  }
  const admitted = Object.entries(status).filter(([name, s]) => !name.startsWith("smoke-") && s.admitted);
  const planned = admitted.reduce((n, [, s]) => n + (s.planned ?? 0), 0);
  const got = admitted.reduce((n, [, s]) => n + (s.responded ?? 0), 0);
  if (planned === 0 || got / planned < 0.95) reasons.push(`only ${got}/${planned} planned calls returned a model response (need 95%)`);
  if (receipts.missing.length) reasons.push(`admitted stage(s) ${receipts.missing.join(", ")} lack a fresh-process verification file`);
  if (receipts.verified < receipts.successful) reasons.push(`${receipts.successful - receipts.verified} successful runs have unverified receipts`);
  return { valid: reasons.length === 0, reasons, responseRate: planned ? got / planned : 0, planned, responded: got };
}

// ---- receipts of successful runs ----------------------------------------------------------
// Counts come from the fresh-process verification files, never from in-run receipt fields.
function receiptCounts() {
  const counts = { successful: 0, verified: 0, byStage: {}, missing: [] };
  const add = (stage, successful, verified) => {
    counts.successful += successful; counts.verified += verified;
    counts.byStage[stage] = { successful, verified };
  };
  if (stages.A?.admitted) { if (A) add("A", A.successfulRuns, A.successfulRunsVerified); else counts.missing.push("A"); }
  for (const name of ["B", "C"]) {
    if (!stages[name]?.admitted) continue;
    const v = maybe(`verification-${name}.json`);
    if (v) add(name, v.successful, v.verified); else counts.missing.push(name);
  }
  return counts;
}

// ---- statistics ---------------------------------------------------------------------------
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function cohensKappa(a, b) {
  if (a.length !== b.length || !a.length) return null;
  const n = a.length, agree = a.filter((x, i) => x === b[i]).length / n;
  const pa = a.filter(Boolean).length / n, pb = b.filter(Boolean).length / n;
  const chance = pa * pb + (1 - pa) * (1 - pb);
  return chance === 1 ? null : (agree - chance) / (1 - chance);
}
const strictLabel = (j) => !!(j?.judgeValid && j.answerCorrect && !j.abstained && j.claims.length > 0
  && j.claims.every((c) => c.supported && c.cited && c.citationCount > 0 && c.relevantCitations > 0));

function citationQuality() {
  if (!B || !J) return null;
  const judged = (judge, model, id) => J.rows.find((r) => r.judge === judge && r.id === model + ":" + id);
  const perJudge = JUDGE_MODELS.map((judge) => ({ judge, models: TESTED_MODELS.map((model) => {
    const rows = B.rows.filter((r) => r.model === model && r.suite === "citations");
    const live = rows.filter((r) => r.usableAnswer && strictLabel(judged(judge, model, r.id))).length;
    const derived = rows.filter((r) => r.promptOnlyFormatValid && strictLabel(judged(judge, model, r.id))).length;
    return { model, planned: rows.length, formatValidContract: rows.filter((r) => r.usableAnswer).length,
      formatValidPromptOnly: rows.filter((r) => r.promptOnlyFormatValid).length,
      judged: rows.filter((r) => judged(judge, model, r.id)?.judgeValid).length, strictLiveContract: live, strictDerivedPromptOnly: derived };
  }) }));
  const ids = [...new Set(J.rows.map((r) => r.id))];
  const both = ids.filter((id) => JUDGE_MODELS.every((j) => J.rows.find((r) => r.judge === j && r.id === id)?.judgeValid));
  const labels = (j, f) => both.map((id) => f(J.rows.find((r) => r.judge === j && r.id === id)));
  return { perJudge, kappa: { items: both.length,
    strictLabel: cohensKappa(labels(JUDGE_MODELS[0], strictLabel), labels(JUDGE_MODELS[1], strictLabel)),
    answerCorrect: cohensKappa(labels(JUDGE_MODELS[0], (r) => r.answerCorrect), labels(JUDGE_MODELS[1], (r) => r.answerCorrect)) } };
}

function latency() {
  if (!C) return null;
  return TESTED_MODELS.map((model) => {
    const arms = Object.fromEntries(["direct", "unsigned", "signed"].map((arm) => {
      const rows = C.rows.filter((r) => r.suite === "latency" && r.model === model && r.arm === arm && responded(r));
      return [arm, { n: rows.length, medianWallMs: median(rows.map((r) => r.wallMs)), medianProcessingMs: median(rows.map((r) => r.processingMs)) }];
    }));
    return { model, arms, signedMinusDirectWallMs: arms.signed.medianWallMs != null && arms.direct.medianWallMs != null ? arms.signed.medianWallMs - arms.direct.medianWallMs : null };
  });
}

function completion() {
  const perStage = {};
  for (const [name, s] of Object.entries(stages)) {
    perStage[name] = { admitted: !!s.admitted, complete: !!s.complete, planned: s.planned ?? 0, attempted: s.attempted ?? 0, responded: s.responded ?? 0, stopped: s.stopped ?? null };
  }
  const byModel = (rows, key, universe) => Object.fromEntries(universe.map((m) => [m, { attempted: rows.filter((r) => r[key] === m).length, responded: rows.filter((r) => r[key] === m && responded(r)).length }]));
  return { perStage, perModel: { A: A ? Object.fromEntries(A.models.map((m) => [m.model, { attempted: m.attempted, responded: m.runtimeSuccess }])) : null,
    B: B ? byModel(B.rows, "model", TESTED_MODELS) : null, J: J ? byModel(J.rows, "judge", JUDGE_MODELS) : null, C: C ? byModel(C.rows, "model", TESTED_MODELS) : null } };
}

function spend() {
  return Object.fromEntries(Object.entries(stages).filter(([, s]) => s.admitted).map(([name, s]) => [name, {
    ledgerConfirmedUsd: s.ledgerConfirmedUsd ?? null, ledgerChargedUsd: s.ledgerChargedUsd ?? null, accountDeltaUsd: s.accountDeltaUsd ?? null,
    discrepancyUsd: s.accountDeltaUsd != null && s.ledgerConfirmedUsd != null ? s.accountDeltaUsd - s.ledgerConfirmedUsd : null }]));
}

const receipts = receiptCounts();
const verdict = validity({ stages: Object.fromEntries(Object.entries(stages).map(([k, s]) => [k, { admitted: s.admitted, complete: s.complete, planned: s.planned, responded: s.responded, stopped: s.stopped }])), receipts });
const summary = { generatedAt: new Date().toISOString(), verdict: verdict.valid ? "VALID" : "INVALID", validity: verdict,
  completion: completion(), publicRecord: A, citations: citationQuality(), receipts, latency: latency(), spend: spend(),
  priceChecks: Object.fromEntries(Object.entries(stages).map(([k, s]) => [k, s.priceChecks ?? []])),
  note: "Paid cohort, separate from and never pooled with the free cohorts. Judges are not human validated. Validity depends on completion and receipts only." };
writeJSON(join(OUT, "summary.json"), summary);

const f = (x, d = 3) => x == null ? "n/a" : Number(x).toFixed(d);
const md = ["# Paid-model cohort summary", "", `**Verdict: ${summary.verdict}.** ${verdict.reasons.length ? verdict.reasons.join("; ") + "." : "All admitted stages completed, " + (100 * verdict.responseRate).toFixed(1) + "% of planned calls returned a response, and every successful run's receipt verified."}`, "",
  "## Completion", "", "| Stage | Admitted | Complete | Planned | Attempted | Responded |", "| --- | --- | --- | --- | --- | --- |",
  ...Object.entries(summary.completion.perStage).map(([k, s]) => `| ${k} | ${s.admitted} | ${s.complete} | ${s.planned} | ${s.attempted} | ${s.responded} |`), ""];
if (A) md.push("## Public-record review", "", "| Model | Full rubric (frozen) | Full rubric (audited) | Verified packages |", "| --- | --- | --- | --- |",
  ...A.models.map((m) => `| ${m.model} | ${m.strictPassFrozen}/${m.planned} | ${m.strictPassAudited}/${m.planned} | ${m.evidenceComplete}/${m.planned} |`), "");
if (summary.citations) {
  md.push("## Citation quality (strict: correct, not abstained, every claim supported and cited)", "");
  for (const j of summary.citations.perJudge) md.push(`Judge ${j.judge}`, "", "| Model | Planned | Judged | Strict, live contract | Strict, derived prompt-only |", "| --- | --- | --- | --- | --- |",
    ...j.models.map((m) => `| ${m.model} | ${m.planned} | ${m.judged} | ${m.strictLiveContract} | ${m.strictDerivedPromptOnly} |`), "");
  md.push(`Cohen's kappa between judges over ${summary.citations.kappa.items} items: strict label ${f(summary.citations.kappa.strictLabel)}, answer correct ${f(summary.citations.kappa.answerCorrect)}.`, "");
}
md.push("## Receipts", "", `Successful runs with verified receipts: ${receipts.verified}/${receipts.successful}.`, "");
if (summary.latency) md.push("## Latency (median wall ms)", "", "| Model | Direct | Unsigned | Signed | Signed minus direct |", "| --- | --- | --- | --- | --- |",
  ...summary.latency.map((l) => `| ${l.model} | ${f(l.arms.direct.medianWallMs, 0)} | ${f(l.arms.unsigned.medianWallMs, 0)} | ${f(l.arms.signed.medianWallMs, 0)} | ${f(l.signedMinusDirectWallMs, 0)} |`), "");
md.push("## Spend (USD)", "", "| Stage | Ledger confirmed | Ledger incl. reservations | Account delta | Account minus ledger |", "| --- | --- | --- | --- | --- |",
  ...Object.entries(summary.spend).map(([k, s]) => `| ${k} | ${f(s.ledgerConfirmedUsd, 4)} | ${f(s.ledgerChargedUsd, 4)} | ${f(s.accountDeltaUsd, 4)} | ${f(s.discrepancyUsd, 4)} |`), "", summary.note, "");
atomicWrite(join(OUT, "summary.md"), md.join("\n"));
console.log(summary.verdict);
console.log(JSON.stringify({ verdict: summary.verdict, reasons: verdict.reasons, responseRate: verdict.responseRate }));
