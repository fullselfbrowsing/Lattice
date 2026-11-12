// End-to-end dry run: every stage and both reports against the offline mock, no network, no credential.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync, chmodSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { priceChanges } from "./common.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const here = (name) => join(import.meta.dirname, name);
const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));
const SENTINEL = "sk-or-v1-SENTINEL0123456789abcdef0123456789";

function sandbox() {
  const dir = mkdtempSync("/tmp/paid-cohort-test-");
  const keyFile = join(dir, "never-read.key");
  writeFileSync(keyFile, SENTINEL);
  chmodSync(keyFile, 0o000); // any attempt to read the credential would throw EACCES
  return { dir, out: join(dir, "out"), priv: join(dir, "priv"), keyFile, dispose: () => { chmodSync(keyFile, 0o600); rmSync(dir, { recursive: true, force: true }); } };
}
function run(box, script, args = [], extra = {}) {
  const env = { ...process.env, PAID_DRY_RUN: "1", PAID_OUT_DIR: box.out, PAID_PRIVATE_DIR: box.priv, OPENROUTER_KEY_FILE: box.keyFile, ...extra };
  for (const key of Object.keys(env)) if (env[key] === undefined) delete env[key];
  const result = spawnSync(process.execPath, [here(script), ...args], { env, encoding: "utf8", input: "", maxBuffer: 1 << 28 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}
const STEPS = [["validated-live.mjs", ["smoke"]], ["verify-validated.mjs", ["smoke"]], ["judge.mjs", ["probe"]], ["public-refund.mjs"], ["public-refund-report.mjs"],
  ["validated-live.mjs", ["B"]], ["verify-validated.mjs", ["B"]], ["judge.mjs", ["full"]], ["validated-live.mjs", ["C"]], ["verify-validated.mjs", ["C"]], ["report.mjs"]];
function runAll(box, extra) {
  return STEPS.map(([script, args]) => ({ script, args, ...run(box, script, args, extra) }));
}
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
// Listing of a directory (path, size, mtime) so a test can prove a run left it untouched; empty if absent.
const treeState = (dir) => existsSync(dir) ? walk(dir).sort().map((f) => [f, statSync(f).size, statSync(f).mtimeMs]) : [];
const REAL_RESULTS = join(ROOT, "eval/paid-cohort/results");
const allCosts = (box) => {
  let total = 0;
  const add = (rows) => { for (const row of rows) for (const call of row.calls ?? []) total += call.costUsd ?? 0; };
  for (const f of ["smoke-citations", "smoke-judge", "citations-live", "judge", "runtime"]) add(readJSON(join(box.out, f + ".json")).rows);
  add(readJSON(join(box.out, "public-refund/live.json")).rows);
  return total;
};

test("a full dry run completes every stage offline and reports VALID", { timeout: 600000 }, () => {
  const box = sandbox();
  const realBefore = treeState(REAL_RESULTS);
  try {
    const results = runAll(box);
    for (const r of results) assert.equal(r.status, 0, r.script + " " + (r.args ?? []).join(" ") + "\n" + r.stderr + r.stdout.slice(-400));
    assert.match(results.at(-1).stdout, /^VALID$/m);

    // Stage completion and counts.
    const stages = readJSON(join(box.out, "stages.json"));
    for (const [name, planned] of [["smoke-citations", 3], ["smoke-judge", 4], ["A", 24], ["B", 180], ["C", 528]]) {
      assert.equal(stages[name].complete, true, name);
      assert.equal(stages[name].planned, planned, name);
      assert.equal(stages[name].responded, planned, name);
    }
    assert.equal(stages.J.complete, true);
    assert.ok(stages.J.planned > 300 && stages.J.planned % 2 === 0);

    // Ledger: limit 17 at the paid path, settled spend equals the sum of mock costs and the account delta.
    const ledger = readJSON(join(box.priv, "budget.json"));
    assert.equal(ledger.limitUsd, 17);
    assert.equal(ledger.haltedReason, undefined);
    const confirmed = ledger.entries.filter((e) => e.settled).reduce((n, e) => n + e.chargedUsd, 0);
    assert.equal(ledger.entries.every((e) => e.settled), true);
    assert.ok(Math.abs(confirmed - allCosts(box)) < 1e-9);
    const usage = readJSON(join(box.priv, "mock-usage.json")).usage;
    assert.ok(Math.abs(usage - 0.13 - confirmed) < 1e-9);
    for (const s of Object.values(stages).filter((x) => x.admitted)) assert.ok(Math.abs(s.accountDeltaUsd - s.ledgerConfirmedUsd) < 1e-9);

    // Frozen protocol records the plan, never a live key.
    const protocol = readJSON(join(box.out, "protocol.json"));
    assert.equal(protocol.ledgerLimitUsd, 17);
    assert.deepEqual(protocol.testedModels, ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol", "google/gemini-4-carbon"]);
    assert.equal(protocol.kid, "paid-public-refund-20261112");
    assert.ok(Object.keys(protocol.codeHashes).some((k) => k.startsWith("packages/lattice/dist/")));

    // Stage A bundles pass the fresh-process verifier; summary files exist.
    const a = readJSON(join(box.out, "public-refund/summary.json"));
    assert.equal(a.evidenceComplete, 24);
    assert.equal(a.successfulRunsVerified, a.successfulRuns);
    assert.equal(a.controlsPassed, a.controlsTotal);
    const summary = readJSON(join(box.out, "summary.json"));
    assert.equal(summary.verdict, "VALID");
    assert.equal(summary.receipts.verified, summary.receipts.successful);
    assert.ok(existsSync(join(box.out, "summary.md")));

    // Files are 0600, no credential-like string anywhere, nothing written in the repository.
    for (const file of [...walk(box.out), ...walk(box.priv)]) {
      if (file.endsWith("mock-usage.json")) continue;
      assert.equal(statSync(file).mode & 0o777, 0o600, file);
      assert.equal(/sk-or-|SENTINEL/.test(readFileSync(file, "utf8")), false, file);
    }
    for (const r of results) assert.equal(/sk-or-|SENTINEL/.test(r.stdout + r.stderr), false);
    assert.equal(execFileSync("git", ["status", "--porcelain", "--", "eval/public-refund", "eval/realworld", "packages"], { cwd: ROOT, encoding: "utf8" }), "");
    assert.deepEqual(treeState(REAL_RESULTS), realBefore, "the dry run must not write the real results directory");

    // Fresh-process verification files drive the receipt counts; per-stage keys and richer private rows.
    assert.ok(protocol.timeoutsMs && protocol.timeoutsMs.A === 300000 && protocol.timeoutsMs.J === 180000 && protocol.timeoutsMs.C === 120000 && protocol.timeoutsMs.smoke === 300000 && protocol.timeoutsMs.B === 300000);
    let counted = a.successfulRuns;
    for (const name of ["B", "C"]) {
      const v = readJSON(join(box.out, `verification-${name}.json`));
      assert.ok(v.successful > 0 && v.verified === v.successful, name);
      counted += v.successful;
      assert.equal(statSync(join(box.priv, `${name}-signing-key.json`)).mode & 0o777, 0o600);
      assert.equal(readJSON(join(box.out, `${name}-public-key.json`)).kid, "paid-" + name);
      assert.equal(readJSON(join(box.out, name === "B" ? "citations-live.json" : "runtime.json")).trustAnchorHash.length, 64);
    }
    assert.equal(summary.receipts.successful, counted);
    assert.ok(existsSync(join(box.out, "verification-smoke-citations.json")));
    const signedRow = readJSON(join(box.priv, "runtime-private.json")).find((r) => r.suite === "transport" && r.arm === "signed");
    assert.ok(signedRow.receipt && signedRow.requestBodies.length === 1 && signedRow.outputs && signedRow.expectedTaskHash && signedRow.expectedPolicyHash);
    assert.ok(readJSON(join(box.out, "runtime.json")).rows.every((r) => r.status === "finished"));

    // The verdict takes no score as input: wipe every score and the verdict must not move.
    const live = join(box.out, "public-refund/summary.json");
    writeFileSync(live, JSON.stringify({ ...a, strictPassFrozen: 0, strictPassAudited: 0, models: a.models.map((m) => ({ ...m, strictPassFrozen: 0, strictPassAudited: 0, factualRuns: 0 })) }));
    const judgeFile = join(box.out, "judge.json");
    const judge = readJSON(judgeFile);
    for (const row of judge.rows) if (row.claims) { row.answerCorrect = false; for (const c of row.claims) c.supported = false; }
    writeFileSync(judgeFile, JSON.stringify(judge));
    const rerun = run(box, "report.mjs");
    assert.match(rerun.stdout, /^VALID$/m);
    const rescored = readJSON(join(box.out, "summary.json"));
    assert.equal(rescored.citations.perJudge[0].models[0].strictLiveContract, 0, "scores did change; the verdict did not");
    // An admitted stage without its verification file makes the verdict INVALID.
    rmSync(join(box.out, "verification-C.json"));
    const missing = run(box, "report.mjs");
    assert.match(missing.stdout, /^INVALID$/m);
    assert.match(readJSON(join(box.out, "summary.json")).validity.reasons.join(" "), /lack a fresh-process verification file/);
  } finally { box.dispose(); }
});

test("a 402 halts the stage and the report says INVALID", { timeout: 300000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"]).status, 0);
    assert.equal(run(box, "judge.mjs", ["probe"]).status, 0);
    const halted = run(box, "public-refund.mjs", [], { PAID_MOCK_402_AFTER: "5" });
    assert.notEqual(halted.status, 0);
    const stage = readJSON(join(box.out, "stages.json")).A;
    assert.equal(stage.complete, false);
    assert.match(stage.stopped, /HTTP 402/);
    assert.ok(stage.attempted < stage.planned && stage.attempted >= 5);
    // Failed rows stay in the record and later requests never left the process.
    const live = readJSON(join(box.out, "public-refund/live.json"));
    assert.ok(live.rows.some((r) => r.calls?.some((c) => c.status === 402)));
    assert.equal(live.rows.flatMap((r) => r.calls ?? []).filter((c) => c.status === 402).length, 1);
    assert.equal(run(box, "public-refund-report.mjs").status, 0);
    const report = run(box, "report.mjs");
    assert.match(report.stdout, /^INVALID$/m);
    assert.match(readJSON(join(box.out, "summary.json")).validity.reasons.join(" "), /did not complete/);
  } finally { box.dispose(); }
});

test("a second run cannot extend a changed protocol", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"]).status, 0);
    const changed = run(box, "judge.mjs", ["probe"], { PAID_DRY_COUNTS: JSON.stringify({ questions: 10 }) });
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /Frozen (counts|dryCounts) changed\. Existing cohort will not be extended/);
    // The same protocol resumes without repeating finished rows.
    const before = readJSON(join(box.priv, "budget.json")).entries.length;
    assert.equal(run(box, "validated-live.mjs", ["smoke"]).status, 0);
    assert.equal(readJSON(join(box.priv, "budget.json")).entries.length, before);
    // Hand-edited frozen fields are refused too.
    const path = join(box.out, "protocol.json");
    const protocol = readJSON(path);
    protocol.caps.A = 8192;
    writeFileSync(path, JSON.stringify(protocol));
    const edited = run(box, "judge.mjs", ["probe"]);
    assert.notEqual(edited.status, 0);
    assert.match(edited.stderr, /Frozen caps changed/);
  } finally { box.dispose(); }
});

test("a price increase refuses the stage; a longer endpoint list at the same price does not", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"]).status, 0);
    const more = run(box, "judge.mjs", ["probe"], { PAID_MOCK_EXTRA_ENDPOINT: "1" });
    assert.equal(more.status, 0, more.stderr);
    const dearer = run(box, "public-refund.mjs", [], { PAID_MOCK_PRICE_FACTOR: "1.5" });
    assert.notEqual(dearer.status, 0);
    assert.match(dearer.stderr, /Price increased since the freeze/);
    assert.equal(readJSON(join(box.priv, "budget.json")).entries.length, 7, "no request was made");
  } finally { box.dispose(); }
  const frozen = { m: { prompt: 2e-6, completion: 1e-5, request: 0 } };
  assert.deepEqual(priceChanges(frozen, { m: { prompt: 2e-6, completion: 1e-5, request: 0 } }), { increases: [], decreases: [] });
  assert.equal(priceChanges(frozen, { m: { prompt: 1e-6, completion: 1e-5, request: 0 } }).decreases.length, 1);
  assert.equal(priceChanges(frozen, { m: { prompt: 2e-6, completion: 1e-5, request: 0, image: 1e-9 } }).increases.length, 1);
  assert.equal(priceChanges(frozen, {}).increases.length, 1);
});

test("admission checks the account balance through the transport", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"]).status, 0);
    assert.equal(run(box, "judge.mjs", ["probe"]).status, 0);
    const before = readJSON(join(box.priv, "budget.json")).entries.length;
    const poor = run(box, "public-refund.mjs", [], { PAID_MOCK_CREDITS: "1" });
    assert.equal(poor.status, 3);
    assert.match(poor.stderr, /not admitted/);
    assert.equal(readJSON(join(box.priv, "budget.json")).entries.length, before);
    const stage = readJSON(join(box.out, "stages.json")).A;
    assert.equal(stage.admitted, false);
    assert.ok(Math.abs(stage.admission.balanceUsd - (1 - readJSON(join(box.priv, "mock-usage.json")).usage)) < 1e-12);
    assert.match(run(box, "report.mjs").stdout, /^INVALID$/m);
  } finally { box.dispose(); }
});

test("later stages require the smoke gates", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    const blocked = run(box, "public-refund.mjs");
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /Smoke gate smoke-citations has not passed/);
    assert.equal(readJSON(join(box.priv, "budget.json")).entries.length, 0);
  } finally { box.dispose(); }
});

test("path overrides and counts are rejected outside a dry run or outside /tmp", { timeout: 60000 }, () => {
  const box = sandbox();
  try {
    const live = spawnSync(process.execPath, [here("report.mjs")], { env: { ...process.env, PAID_DRY_RUN: undefined, PAID_OUT_DIR: box.out, OPENROUTER_KEY_FILE: box.keyFile }, encoding: "utf8", input: "" });
    assert.notEqual(live.status, 0);
    assert.match(live.stderr, /only valid in a dry run/);
    const inRepo = run(box, "report.mjs", [], { PAID_OUT_DIR: join(ROOT, "eval/paid-cohort/results-dry"), PAID_PRIVATE_DIR: join(ROOT, ".context/paid-cohort-dry") });
    assert.notEqual(inRepo.status, 0);
    assert.match(inRepo.stderr, /under \/tmp|outside the repository/);
    assert.equal(existsSync(join(ROOT, "eval/paid-cohort/results-dry")), false);
    const counts = spawnSync(process.execPath, [here("report.mjs")], { env: { ...process.env, PAID_DRY_RUN: undefined, PAID_DRY_COUNTS: "{}" }, encoding: "utf8", input: "" });
    assert.notEqual(counts.status, 0);
    assert.match(counts.stderr, /PAID_DRY_COUNTS is only valid in a dry run/);
  } finally { box.dispose(); }
});

test("the judge rubric is identical to the free cohort's", () => {
  const literal = (file) => /const RUBRIC = ('(?:[^'\\]|\\.)*');/.exec(readFileSync(file, "utf8"))[1];
  assert.equal(literal(here("judge.mjs")), literal(resolve(ROOT, "eval/realworld/scripts/20-free-judge.mjs")));
});

test("the validity function is not given any score", () => {
  const source = readFileSync(here("report.mjs"), "utf8");
  const body = source.slice(source.indexOf("export function validity"), source.indexOf("// ---- receipts of successful runs"));
  assert.ok(body.length > 200);
  assert.doesNotMatch(body, /strict|answerCorrect|factual|correct\b|kappa|grade|score|quality/i);
});

const FEW = { PAID_DRY_COUNTS: JSON.stringify({ questions: 2 }) };

test("answer format is measured, never gated; array content is extracted as text", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    const bad = run(box, "validated-live.mjs", ["smoke"], { PAID_MOCK_BAD_FORMAT: "1", PAID_MOCK_ARRAY_CONTENT: "1" });
    assert.equal(bad.status, 0, bad.stderr);
    const gate = readJSON(join(box.out, "smoke-citations.json"));
    assert.equal(gate.pass, true);
    assert.ok(gate.rows.every((r) => r.formatValid === false));
    const kept = readJSON(join(box.priv, "smoke-citations-private.json"));
    assert.ok(kept.every((r) => r.rawAnswer === "I cannot cite the sources." && !r.rawAnswer.includes("[object Object]")));
  } finally { box.dispose(); }
});

test("anomalous usage halts the cohort permanently", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    const result = run(box, "validated-live.mjs", ["smoke"], { PAID_MOCK_OVERUSE: "1" });
    assert.notEqual(result.status, 0);
    const ledger = readJSON(join(box.priv, "budget.json"));
    assert.match(ledger.haltedReason, /Anomaly: completion_tokens/);
    assert.equal(ledger.entries.length, 1, "later requests never left the process");
    assert.match(readJSON(join(box.out, "stages.json"))["smoke-citations"].stopped, /Anomaly/);
    const again = run(box, "judge.mjs", ["probe"]);
    assert.notEqual(again.status, 0);
  } finally { box.dispose(); }
});

test("a failed judge is excluded; started rows become interrupted and are never retried", { timeout: 300000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"], FEW).status, 0);
    assert.equal(run(box, "judge.mjs", ["probe"], { ...FEW, PAID_MOCK_JUDGE_BAD: "qwen/qwen3.8-max-0902" }).status, 0);
    const probe = readJSON(join(box.out, "smoke-judge.json"));
    assert.deepEqual(probe.passedJudges, ["x-ai/grok-4.7"]);
    assert.deepEqual(probe.excludedJudges, ["qwen/qwen3.8-max-0902"]);
    assert.equal(probe.pass, true);
    assert.equal(run(box, "validated-live.mjs", ["B"], FEW).status, 0);
    // Simulate a crash: the first row was started and never finished.
    const file = join(box.out, "citations-live.json");
    const live = readJSON(file);
    const { id, model, suite, arm } = live.rows[0];
    live.rows[0] = { id, model, suite, arm, status: "started" };
    writeFileSync(file, JSON.stringify(live));
    const entries = readJSON(join(box.priv, "budget.json")).entries.length;
    assert.equal(run(box, "validated-live.mjs", ["B"], FEW).status, 0);
    assert.equal(readJSON(join(box.priv, "budget.json")).entries.length, entries, "no request was repeated");
    const after = readJSON(file);
    assert.equal(after.rows[0].status, "interrupted");
    assert.equal(after.rows.length, 6);
    const verify = run(box, "verify-validated.mjs", ["B"], FEW);
    assert.equal(verify.status, 0, verify.stderr);
    assert.ok(readJSON(join(box.out, "verification-B.json")).rows[0].status === "interrupted");
    // Stage J uses only the judge that passed.
    const judged = run(box, "judge.mjs", ["full"], FEW);
    assert.equal(judged.status, 0, judged.stderr);
    const judge = readJSON(join(box.out, "judge.json"));
    assert.ok(judge.rows.length > 0 && judge.rows.every((r) => r.judge === "x-ai/grok-4.7" && r.status === "finished"));
    assert.equal(readJSON(join(box.out, "stages.json")).J.planned, judge.rows.length);
  } finally { box.dispose(); }
});

test("one failed judge leaves the judge gate passing", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"]).status, 0);
    const none = run(box, "judge.mjs", ["probe"], { PAID_MOCK_JUDGE_BAD: "x-ai/grok-4.7" });
    assert.equal(none.status, 0, "one judge still passes");
    assert.deepEqual(readJSON(join(box.out, "smoke-judge.json")).excludedJudges, ["x-ai/grok-4.7"]);
  } finally { box.dispose(); }
});

test("tampered stored request bodies fail fresh-process verification", { timeout: 120000 }, () => {
  const box = sandbox();
  try {
    assert.equal(run(box, "validated-live.mjs", ["smoke"], FEW).status, 0);
    assert.equal(run(box, "judge.mjs", ["probe"], FEW).status, 0);
    assert.equal(run(box, "validated-live.mjs", ["B"], FEW).status, 0);
    assert.equal(run(box, "verify-validated.mjs", ["B"], FEW).status, 0);
    const clean = readJSON(join(box.out, "verification-B.json"));
    assert.equal(clean.verified, clean.successful);
    const path = join(box.priv, "citations-live-private.json");
    const kept = readJSON(path);
    kept[0].requestBodies[0] += " ";
    writeFileSync(path, JSON.stringify(kept));
    assert.equal(run(box, "verify-validated.mjs", ["B"], FEW).status, 0);
    const tampered = readJSON(join(box.out, "verification-B.json"));
    assert.equal(tampered.verified, tampered.successful - 1);
  } finally { box.dispose(); }
});
