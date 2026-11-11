import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import * as L from "../../packages/lattice/dist/index.js";
import { CASES, PROTOCOL } from "./fixtures.mjs";
import { jsonHash, sha, verifyBundle, verifyApplicationRecord, gradeRecommendation } from "./workflow.mjs";
import { evidenceControls, wrongSignedControl } from "./controls.mjs";

const DIR = resolve(import.meta.dirname, "results"), ROOT = resolve(import.meta.dirname, "../..");
const read = (p) => JSON.parse(readFileSync(resolve(DIR, p), "utf8"));
const write = (p, v) => writeFileSync(resolve(DIR, p), JSON.stringify(v, null, 2) + "\n");
const protocol = read("protocol.json"), live = read("live.json"), trust = read("public-key.json");
if (jsonHash(protocol) !== live.protocolHash || jsonHash(trust) !== protocol.trustAnchorHash
    || jsonHash(CASES) !== protocol.fixtureHash) throw new Error("Protocol, fixture or key mismatch.");
for (const [file, digest] of Object.entries(protocol.codeHashes)) {
  if (sha(readFileSync(resolve(ROOT, file))) !== digest) throw new Error("Measured code changed: " + file);
}
const keys = L.createMemoryKeySet([trust]), verified = [];
let controlSource;
for (const row of live.rows) {
  if (!row.bundle) { verified.push({ id: row.id, signature: false, evidenceOkay: false, caseComplete: false, strict: false, problems: ["interrupted-or-unavailable"] }); continue; }
  const b = read(row.bundle);
  if (jsonHash(b) !== row.bundleHash) throw new Error("Export bundle changed: " + row.id);
  const c = CASES.find((x) => x.id === row.caseId);
  const verification = await verifyBundle(b, keys, c), external = verifyApplicationRecord(b);
  const grade = gradeRecommendation(b.outputs?.answer ?? b.rawAnswer ?? "", c);
  if (jsonHash(verification) !== jsonHash(row.verification) || jsonHash(grade) !== jsonHash(row.grade)) throw new Error("Fresh-process checks disagree: " + row.id);
  verified.push({ id: row.id, ...verification, caseComplete: external.complete,
    strict: row.runtimeOkay && grade.strict, applicationProblems: external.problems });
  if (!controlSource && c.id === "routine" && verification.evidenceOkay) controlSource = { row, b, c };
}
const mutations = controlSource ? await evidenceControls(controlSource.b, keys, controlSource.c) : [];
const wrong = await wrongSignedControl(CASES.find((c) => c.id === "disputed-promise"));
write("controls.json", { source: controlSource?.row.id ?? null, mutations, wrongSigned: wrong });
write("verification.json", { verifiedAt: new Date().toISOString(), trustAnchorHash: protocol.trustAnchorHash, rows: verified,
  scope: "Fresh process, saved public key and retained content. Issuer self-attestation; external records are simulated and not signed by real employees." });
const count = (rows, predicate) => rows.filter(predicate).length;
const median = (xs) => { const a = xs.filter(Number.isFinite).sort((a, b) => a - b); return a.length ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2 : null; };
const models = PROTOCOL.models.map((model) => {
  const rows = live.rows.filter((r) => r.model === model), v = verified.filter((r) => rows.some((x) => x.id === r.id));
  return { model, planned: CASES.length * PROTOCOL.repetitions, attempted: rows.length,
    runtimeSuccess: count(rows, (r) => r.runtimeOkay), strictPass: count(v, (r) => r.strict),
    signatures: count(v, (r) => r.signature), evidenceComplete: count(v, (r) => r.evidenceOkay),
    caseRecordsComplete: count(v, (r) => r.caseComplete),
    simulatedPayments: count(rows, (r) => r.application?.status === "simulated-paid"),
    held: count(rows, (r) => r.application?.status === "held"),
    medianWallExcludingPacingMs: median(rows.map((r) => r.wallMs - r.pacingMs)),
  };
});
const byCase = CASES.map((c) => ({ caseId: c.id, expectedAction: c.expected.action,
  planned: PROTOCOL.models.length * PROTOCOL.repetitions,
  strictPass: count(verified, (v) => v.id.startsWith(c.id + ":") && v.strict) }));
const summary = { planned: PROTOCOL.plannedRuns, attempted: live.rows.length,
  developmentCalls: live.development.length, models, byCase,
  strictPass: count(verified, (v) => v.strict), signatures: count(verified, (v) => v.signature),
  evidenceComplete: count(verified, (v) => v.evidenceOkay),
  mutationsPassed: count(mutations, (m) => m.passed), mutationsTotal: mutations.length,
  wrongSignedControlPassed: wrong.passed, cohortRequests: live.cohortRequests,
  addedAccountUsageUsd: live.addedAccountUsageUsd, paidLedgerUnchanged: live.paidLedgerUnchanged,
  stopped: live.stopped, requestCosts: { reportedZero: 0, unknown: 0, nonzero: 0 },
};
for (const row of [...live.development, ...live.rows]) for (const c of row.calls ?? []) {
  summary.requestCosts[c.costUsd === 0 ? "reportedZero" : c.costUsd === null ? "unknown" : "nonzero"]++;
}
write("summary.json", summary);
const lines = [
  "# Live free-model travel refund demonstration", "",
  "**Synthetic business cases; live model recommendations; simulated approvals and payments.**",
  "", "Measured revision: " + protocol.revision + ". Frozen protocol and prompts: [protocol](protocol.json), [fixtures](../fixtures.mjs).",
  "", "Completed/attempted " + live.rows.length + " of " + PROTOCOL.plannedRuns + " planned evaluation runs. Two development calls are excluded from evaluation denominators.",
  "", "| Model | Strict decision fields / planned | Runtime success | Valid signatures | Complete run evidence | Simulated payments | Held | Median wall time without pacing |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ...models.map((m) => "| " + m.model + " | " + m.strictPass + "/" + m.planned + " | " + m.runtimeSuccess + "/" + m.planned + " | " + m.signatures + "/" + m.planned + " | " + m.evidenceComplete + "/" + m.planned + " | " + m.simulatedPayments + " | " + m.held + " | " + (m.medianWallExcludingPacingMs === null ? "n/a" : (m.medianWallExcludingPacingMs / 1000).toFixed(2) + " s") + " |"),
  "", "Strict scoring checks action, immediate amount, approval authority, conflict flag, decisive rule inclusion and required source inclusion against frozen labels. It does not grade the explanation's entailment or legal correctness. No model judge was used.",
  "", "| Scenario | Expected recommendation | Strict passes / planned |", "| --- | --- | --- |",
  ...byCase.map((c) => "| " + c.caseId + " | " + c.expectedAction + " | " + c.strictPass + "/" + c.planned + " |"),
  "", "## Observed walkthroughs", "",
  "The first repetition for each model is shown without selecting the best run. Full recommendations and exact requests are in the linked evidence bundles.",
  "", "| Scenario | Model | Observed recommendation | Application outcome | Evidence |", "| --- | --- | --- | --- | --- |",
  ...live.rows.filter((r) => r.repetition === 0 && ["routine", "disputed-promise"].includes(r.caseId)).map((r) =>
    "| " + r.caseId + " | " + r.model + " | " + (r.grade?.predicted?.action ?? r.error ?? "unavailable") + " | " + (r.application?.status ?? "unavailable") + "; USD " + (r.application?.paidUsd ?? 0) + " simulated | [" + (r.verification?.evidenceOkay ? "verified" : "incomplete") + "](" + r.bundle + ") |"),
  "", "The prior denial in the disputed case is explicitly supplied synthetic backstory. The new review recommendation is live. Employee and manager approval records and payment events are simulator outputs, not human observations or real transactions.",
  "", "## Integrity and application controls", "",
  summary.mutationsPassed + "/" + summary.mutationsTotal + " scoped checks passed on " + (controlSource?.row.id ?? "no eligible live bundle") + ". See [control details](controls.json). Content edits and missing records are distinguished from signature failures. Missing approval/payment records can leave the Lattice receipt valid while making the case record incomplete.",
  "", "The separate offline wrong-answer control " + (wrong.passed ? "passed" : "FAILED") + ": a deliberately incorrect, well-formed recommendation had valid run evidence, failed the decision score and was held by the application. This is a scripted mechanism control, not an observed live-model error.",
  "", "A fresh process rechecked exported receipts, task/execution-policy/request commitments, input/output content and simulated case-record links: [verification](verification.json). The saved public key is the demonstration trust anchor; this does not prove issuer honesty or actual employee authority. Two ordinary ai.run calls do not provide a complete signed business history.",
  "", "## Cost and boundaries", "",
  "Cohort HTTP requests: " + live.cohortRequests + ". Account usage delta: USD " + live.addedAccountUsageUsd + ". Reported-zero request costs: " + summary.requestCosts.reportedZero + "; unreported: " + summary.requestCosts.unknown + "; nonzero: " + summary.requestCosts.nonzero + ". Paid ledger unchanged: " + live.paidLedgerUnchanged + ". Catalog/endpoint prices and before-account snapshot are in the protocol; after-account snapshot is in [live results](live.json).",
  "", "Only pinned :free models with zero catalog and endpoint prices were allowed. No retries, paid fallback, repair pass or post-freeze prompt tuning. Unstarted runs, failures and empty responses do not count as successes. Stop reason: " + (live.stopped ?? "none") + ".",
  "", "These eight authored scenarios and two repetitions per model form a small illustrative demonstration, not a representative refund benchmark or a model ranking. Structured fields make the cases tractable; one embedded customer instruction is not a general prompt-injection evaluation. The application rules are separate demo code, not a built-in Lattice refund engine.",
  "", "Latency includes hosted-model work, networking and harness/storage/ledger work. The reported median removes explicit pacing only and is not SDK signing overhead. Historical experiments remain separate. No secured-log comparator, real-company integration, practitioner study, savings estimate, compliance finding or actual payment is claimed.",
  "", "## Reproduction", "",
  "Build Lattice; run node --test eval/refund/workflow.test.mjs; use node eval/refund/run.mjs with OPENROUTER_KEY_FILE pointing to a private credential file. The runner requires committed measured code, current zero prices and sufficient quota, preserves existing terminal rows, and refuses a changed frozen cohort. It shares the existing 900-request ledger and limits this cohort to 40 requests. Run node eval/refund/report.mjs to verify and regenerate the report without inference.",
  "",
];
writeFileSync(resolve(DIR, "summary.md"), lines.join("\n"));
console.log(JSON.stringify(summary, null, 2));
