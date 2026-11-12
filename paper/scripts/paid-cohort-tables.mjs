// Presentation only: read the saved paid-cohort measurements; no model call, no network, no clock.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const R = "eval/paid-cohort/results/";
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

const summary = read(R + "summary.json");
const publicSummary = read(R + "public-refund/summary.json");
const publicLive = read(R + "public-refund/live.json");
const citations = read(R + "citations-live.json");
const judge = read(R + "judge.json");
const runtime = read(R + "runtime.json");
const stages = read(R + "stages.json");
const protocol = read(R + "protocol.json");
const amendments = read(R + "amendments.json");
const accounting = read(R + "accounting.json");
const manifest = read("eval/public-refund/source-manifest.json");

const need = (value, what) => { assert.ok(value !== undefined && value !== null, `Missing field: ${what}`); return value; };
const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);

// Every data string that reaches TeX goes through this.
const tex = (s) => String(s).replace(/[\\{}$&#^_%~]/g, (c) => ({
  "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "$": "\\$", "&": "\\&", "#": "\\#",
  "^": "\\textasciicircum{}", "_": "\\_", "%": "\\%", "~": "\\textasciitilde{}",
})[c]);

const names = { "anthropic/claude-sonnet-5.5": "Claude Sonnet 5.5", "openai/gpt-6.1-sol": "GPT-6.1 Sol", "google/gemini-4-carbon": "Gemini 4 Carbon" };
const JUDGE = "qwen/qwen3.8-max-0902";
const JUDGE_NAME = "Qwen 3.8 Max";
const models = need(protocol.testedModels, "protocol.testedModels");
assert.deepEqual(models, Object.keys(names));
const name = (m) => { assert.ok(names[m], `Unmapped model: ${m}`); return names[m]; };
const short = (s) => { assert.ok(/^[0-9a-f]{40}$/.test(s), "Bad revision"); return s.slice(0, 7); };
const responded = (row) => (row.calls ?? []).some((c) => c.status === 200 && c.finishReason);

// ---- numbers ---------------------------------------------------------------------------------
const stageList = ["A", "B", "J", "C"];
const planned = sum(stageList, (s) => need(stages[s]?.planned, `stages.${s}.planned`));
const respondedCount = sum(stageList, (s) => need(stages[s]?.responded, `stages.${s}.responded`));
assert.equal(planned, summary.validity.planned);
assert.equal(respondedCount, summary.validity.responded);

const judgeRows = judge.rows.filter((r) => r.judge === JUDGE);
assert.equal(judgeRows.length, need(stages.J.planned, "stages.J.planned"));
assert.deepEqual(summary.amendments.find((a) => a.id === "A1")?.changes.activeJudges, [JUDGE]);
const judged = judgeRows.filter((r) => r.parsed && r.judgeValid);
const strictRow = (cite, j) => cite.usableAnswer === true && j && j.judgeValid && j.answerCorrect === true && j.abstained === false
  && Array.isArray(j.claims) && j.claims.length > 0
  && j.claims.every((c) => c.supported === true && c.cited === true && c.citationCount > 0 && c.relevantCitations === c.citationCount);

const perModel = models.map((model) => {
  const rows = citations.rows.filter((r) => r.model === model);
  const js = judgeRows.filter((r) => r.targetModel === model);
  const saved = summary.citations.perJudge.find((p) => p.judge === JUDGE).models.find((m) => m.model === model);
  const strict = js.filter((j) => strictRow(rows.find((r) => `${r.model}:${r.id}` === j.id), j)).length;
  const out = {
    model, questions: rows.length, formatValid: rows.filter((r) => r.formatValid).length,
    usable: rows.filter((r) => r.usableAnswer).length, judged: js.filter((j) => j.parsed && j.judgeValid).length,
    correct: js.filter((j) => j.judgeValid && j.answerCorrect === true).length,
    abstained: js.filter((j) => j.judgeValid && j.abstained === true).length, strict,
  };
  assert.equal(out.questions, saved.planned);
  assert.equal(out.formatValid, saved.formatValidContract);
  assert.equal(out.judged, saved.judged);
  assert.equal(strict, saved.strictLiveContract, `Recomputed strict count differs for ${model}`);
  return out;
});
const total = (f) => sum(perModel, (m) => m[f]);
assert.equal(judged.length, total("judged"));

const lat = [];
for (const model of models) for (const arm of ["direct", "unsigned", "signed"]) {
  const rows = runtime.rows.filter((r) => r.suite === "latency" && r.model === model && r.arm === arm);
  assert.equal(rows.length, need(protocol.counts.latency, "protocol.counts.latency"));
  assert.ok(rows.every((r) => r.backoffMs === 0), "Backoff present; wall would need adjustment");
  lat.push({ model, arm, tried: rows.length, rows: rows.filter(responded) });
}

// ---- statistics: p50/p95 by linear interpolation, percentile bootstrap of the median ----------
const quantile = (xs, q) => {
  const a = [...xs].sort((x, y) => x - y), i = (a.length - 1) * q;
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1);
};
const DRAWS = 10000, SEED = 20261027;
function bootstrapCI(values, key) {
  if (values.length < 2) return null;
  let state = parseInt(createHash("sha256").update(`${SEED}:${key}`).digest("hex").slice(0, 8), 16) >>> 0;
  const next = () => { // mulberry32
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const medians = new Float64Array(DRAWS);
  const draw = new Array(values.length);
  for (let d = 0; d < DRAWS; d++) {
    for (let i = 0; i < values.length; i++) draw[i] = values[Math.floor(next() * values.length)];
    medians[d] = quantile(draw, 0.5);
  }
  const m = [...medians];
  return [quantile(m, 0.025), quantile(m, 0.975)];
}
const num = (x, digits = 2) => x.toFixed(digits);
const armName = { direct: "D", unsigned: "U", signed: "S" };

// ---- tables ----------------------------------------------------------------------------------
const texRow = (cells) => cells.join(" & ") + " \\\\";
const GEN = String.raw`Generated by \code{paper/scripts/paid-cohort-tables.mjs} from \code{eval/paid-cohort/results}; prepared with Claude Code (Claude Opus 5.5); author review pending.`;
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
\par\smallskip\noindent\begin{minipage}{\textwidth}${note} ${GEN}\end{minipage}
\endgroup
\end{table}`;

const pm = models.map((id) => need(publicSummary.models.find((m) => m.model === id), `public model ${id}`));
const cell = (field, denom = "planned") => pm.map((x) => `${need(x[field], field)}/${x[denom]}`);
const failures = publicLive.rows.filter((r) => !r.runtimeOkay).map((r) => {
  const status = (r.calls ?? []).find((c) => c.status != null)?.status;
  return `${tex(name(r.model))}, ${tex(r.caseId)}, repetition ${Number(r.repetition) + 1} (${tex(r.error)}${status != null ? `, HTTP ${status}` : ""})`;
});
assert.equal(failures.length, publicSummary.planned - sum(pm, (x) => x.runtimeSuccess));
const caseIds = [...new Set(publicLive.rows.map((r) => r.caseId))];
const pages = sum(manifest.sources.filter((s) => caseIds.includes(s.id)), (s) => s.pages.length);
assert.equal(caseIds.length, 4);
assert.equal(pages, 18);
const answers = sum(pm, (x) => x.plannedAnswers);
const reps = need(protocol.counts.repetitions, "repetitions");
assert.equal(caseIds.length * models.length * reps, publicSummary.planned);

const publicTable = table(
  "Retrospective review of actual public refund-dispute decisions, paid models", "tab:paid-public-refund-results",
  "@{}>{\\raggedright\\arraybackslash}X*{3}{>{\\centering\\arraybackslash}p{27mm}}@{}",
  ["Measure", ...models.map((m) => name(m))],
  [
    ["Attempted reviews", cell("attempted")],
    ["Usable structured responses", cell("runtimeSuccess")],
    ["All answer values match the frozen rubric", cell("factualRuns")],
    ["All supporting-page checks, frozen whitelist", cell("citationRuns")],
    ["Full rubric, frozen page whitelist", cell("strictPassFrozen")],
    ["Full rubric, complete source audit", cell("strictPassAudited")],
    ["Individual answer values matching the frozen rubric", cell("factualAnswers", "plannedAnswers")],
    ["Valid terminal receipt signatures", cell("signatures")],
    ["Locally reverified evidence packages", cell("evidenceComplete")],
  ].map(([label, cells]) => texRow([label, ...cells])),
  String.raw`${caseIds.length} published decisions (${pages} pages), ${models.length} models, ${reps} repetitions: ${publicSummary.planned} planned reviews and ${answers} answer instances. Measured at revision \code{${short(protocol.revision)}}. One attempt per request, with no retries or post-freeze repairs. The task, token caps (${protocol.caps.A} output tokens) and rubric are the frozen ones used for the free cohort, and requests are byte-identical apart from the model identifier. OpenRouter ignores the temperature setting for the Claude and GPT models, so the repetitions sample run-to-run variation. Failed reviews: ${failures.join("; ")}. They count as nonpassing with no partial credit. Audited scores apply the same complete two-way source audit as the free cohort (\code{eval/public-refund/results/source-audit.json}). ${publicSummary.controlsPassed}/${publicSummary.controlsTotal} scoped integrity checks passed on one eligible bundle, separate from the case denominator. This is retrospective document review of public records that may have appeared in training, not outcome prediction, and the paid cohort is never pooled with the free cohort.`);

const qualityTable = table(
  `Citation answers from the paid models, judged by ${JUDGE_NAME}`, "tab:paid-quality",
  "@{}>{\\raggedright\\arraybackslash}p{30mm}*{7}{>{\\raggedright\\arraybackslash}X}@{}",
  ["Model", "Questions", "Format-valid", "Usable", "Judged", "Judged correct", "Abstained", "Strict"],
  perModel.map((m) => texRow([tex(name(m.model)), m.questions, ...["formatValid", "usable", "judged", "correct", "abstained", "strict"].map((f) => `${m[f]}/${m.questions}`)])),
  String.raw`Every column keeps all planned questions in its denominator. Strict requires a usable answer that the judge marked correct and not abstained, with at least one claim, every claim supported and cited, and every listed citation relevant. This is the free cohort's definition; amendment A2 corrected the cohort report, which had required only one relevant citation per claim. The judge is ${JUDGE_NAME} alone: disclosed amendment ${tex(amendments.amendments[0].id)} excluded Grok 4.7 for infrastructure reasons (${amendments.amendments[0].evidence.grokTimeouts} of its first ${amendments.amendments[0].evidence.grokCalls} calls timed out at 180 s, and one returned ${amendments.amendments[0].evidence.capViolation.completionTokens.toLocaleString("en-US")} completion tokens against a ${amendments.amendments[0].evidence.capViolation.maxTokens.toLocaleString("en-US")}-token cap), and its partial rows are unused. There is no inter-judge agreement, and the judges are not human-validated. The prompt-only arm is derived from the same answers, so it equals the contract arm by construction and arm differences are not reported. The free cohort used a different judge, so strict rates are not comparable across cohorts.`);

const costTable = table(
  "Hosted timing distributions from the paid cohort (milliseconds)", "tab:paid-cost",
  "@{}>{\\raggedright\\arraybackslash}p{34mm}r*{4}{>{\\raggedright\\arraybackslash}X}@{}",
  ["Model / arm", "Eligible / tried", "Wall p50 / p95", "HTTP p50", "Residual p50 [95\\% CI]", "Residual p95"],
  lat.map((g) => {
    const wall = g.rows.map((r) => r.wallMs), http = g.rows.map((r) => r.providerMs), res = g.rows.map((r) => r.processingMs);
    assert.ok([...wall, ...http, ...res].every((v) => Number.isFinite(v) && v >= 0));
    const ci = bootstrapCI(res, `${g.model}:${g.arm}`);
    return texRow([`${tex(name(g.model))} / ${armName[g.arm]}`, `${g.rows.length}/${g.tried}`,
      `${num(quantile(wall, 0.5), 1)} / ${num(quantile(wall, 0.95), 1)}`, num(quantile(http, 0.5), 1),
      `${num(quantile(res, 0.5))} [${ci ? ci.map((v) => num(v)).join("--") : "unavailable"}]`, num(quantile(res, 0.95))]);
  }),
  String.raw`D/U/S: direct HTTP, unsigned runtime, signed runtime. Eligible means the model responded (HTTP 200 with a finish reason); all tried attempts stay in the denominator. ${protocol.counts.latency} trials per arm after ${protocol.counts.warmups} warm-ups per arm per model, run sequentially with the models interleaved. Network and provider time were not controlled. Wall is elapsed time and HTTP is transport and remote service time, not isolated model compute. Residual is elapsed time minus HTTP and backoff; it includes harness hashing, ledger and JSON work and is not pure SDK overhead. Intervals are a ${DRAWS.toLocaleString("en-US")}-draw percentile bootstrap of the median within model and arm (seeded; computed here in Node, not reused from a saved result); p95 is sample variability, not a confidence limit. Small samples do not estimate production latency or a causal signing increment. Revision \code{${short(protocol.revision)}}.`);

// ---- macros ----------------------------------------------------------------------------------
const pubSig = sum(pm, (x) => x.signatures);
const macros = {
  PaidPlannedCalls: planned, PaidRespondedCalls: respondedCount, PaidResponseRate: (100 * respondedCount / planned).toFixed(1),
  PaidReceiptsVerified: need(summary.receipts.verified, "receipts.verified"), PaidReceiptsSuccessful: need(summary.receipts.successful, "receipts.successful"),
  PaidPublicPlanned: publicSummary.planned, PaidPublicStrictFrozen: publicSummary.strictPassFrozen,
  PaidPublicStrictAudited: publicSummary.strictPassAudited, PaidPublicPackages: publicSummary.evidenceComplete,
  PaidPublicSignatures: pubSig, PaidPublicControlsPassed: publicSummary.controlsPassed, PaidPublicControlsTotal: publicSummary.controlsTotal,
  PaidCitationPlanned: total("questions"), PaidFormatValid: total("formatValid"), PaidJudged: total("judged"),
  PaidJudgedCorrect: total("correct"), PaidJudgeAbstained: total("abstained"), PaidStrictTotal: total("strict"),
  PaidStrictSonnet: perModel[0].strict, PaidStrictSol: perModel[1].strict, PaidStrictCarbon: perModel[2].strict,
  PaidRuntimePlanned: stages.C.planned, PaidRuntimeResponded: stages.C.responded,
  PaidBilledUsd: need(accounting.openRouter.billedSinceTopUpUsd, "billedSinceTopUpUsd").toFixed(2),
  PaidLedgerConfirmedUsd: need(accounting.ledger.confirmedUsd, "confirmedUsd").toFixed(2),
  PaidUnknownCostCalls: need(accounting.ledger.unknownCostCalls, "unknownCostCalls"),
  PaidHeldUsd: need(accounting.ledger.heldForUnknownCostsUsd, "heldForUnknownCostsUsd").toFixed(2),
  PaidLimitUsd: accounting.ledger.limitUsd, PaidRevision: short(protocol.revision),
  PaidAmendmentRevision: short(need(amendments.amendments.find((a) => a.id === "A1")?.codeRevision, "A1.codeRevision")),
};
const out = "% Generated by paper/scripts/paid-cohort-tables.mjs from eval/paid-cohort/results. Do not edit.\n"
  + Object.entries(macros).map(([k, v]) => `\\providecommand{\\${k}}{${v}}`).join("\n") + "\n\n"
  + [["PaidPublicRefundTable", publicTable], ["PaidQualityTable", qualityTable], ["PaidCostTable", costTable]]
    .map(([k, v]) => `\\providecommand{\\${k}}{%\n${v}\n}\n`).join("\n");

const path = "paper/paid-cohort-evidence.tex";
if (process.argv.includes("--check")) assert.equal(readFileSync(resolve(root, path), "utf8"), out, `Stale presentation: ${path}`);
else writeFileSync(resolve(root, path), out);
console.log(JSON.stringify({ mode: process.argv.includes("--check") ? "check" : "render", output: path, macros }));
