import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import * as L from "../../packages/lattice/dist/index.js";
import { FreeRequestLedger, assertFreeModel } from "../realworld/scripts/free-eval.mjs";
import { createObservedFetch } from "../realworld/scripts/live-observer.mjs";
import { CASES, DEVELOPMENT_CASE, PROTOCOL } from "./fixtures.mjs";
import { sha, jsonHash, makeIntent, gradeRecommendation, verifyBundle, applicationWorkflow } from "./workflow.mjs";

const ROOT = resolve(import.meta.dirname, "../.."), OUT = resolve(import.meta.dirname, "results");
const PRIVATE = resolve(ROOT, ".context/refund-live"), BASE = "https://openrouter.ai/api/v1";
const LEDGER = resolve(ROOT, ".context/free-request-ledger.json"), LOCK = LEDGER + ".lock";
const KEY = readFileSync(process.env.OPENROUTER_KEY_FILE ?? resolve(ROOT, ".context/attachments/y53fe4/openrouter.key"), "utf8").trim();
if (!KEY || /\s/.test(KEY)) throw new Error("Invalid credential file.");
const scrub = (value) => String(value).split(KEY).join("[redacted]");
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + ".tmp", scrub(JSON.stringify(value, null, 2)) + "\n", { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
async function get(path, auth = false) {
  const response = await fetch(BASE + path, { headers: auth ? { authorization: "Bearer " + KEY } : {}, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Metadata request failed: " + path + " HTTP " + response.status);
  return (await response.json()).data;
}
async function account() {
  const data = await get("/key", true);
  return { usage: data.usage, usageDaily: data.usage_daily, quota: data.free_model_daily_requests };
}
function codeHashes() {
  const files = [
    ...readdirSync(import.meta.dirname).filter((p) => p.endsWith(".mjs")).map((p) => "eval/refund/" + p),
    ...["free-eval.mjs", "live-observer.mjs", "budget.mjs"].map((p) => "eval/realworld/scripts/" + p),
    ...readdirSync(resolve(ROOT, "packages/lattice/dist")).filter((p) => p.endsWith(".js")).map((p) => "packages/lattice/dist/" + p),
  ].sort();
  return Object.fromEntries(files.map((p) => [p, sha(readFileSync(resolve(ROOT, p)))]));
}

mkdirSync(PRIVATE, { recursive: true });
try { mkdirSync(LOCK); } catch { throw new Error("A free evaluation holds the ledger lock. Do not run concurrently."); }
let state, budget, stopped = null, active = null, signing;
const statePath = resolve(OUT, "live.json");
function save() { if (state) { state.stopped = stopped; state.ledgerAfter = budget?.summary() ?? null; write(statePath, state); } }
try {
  const hashes = codeHashes();
  const dirty = git("status", "--porcelain", "--", "eval/refund/*.mjs", "packages/lattice/src", "eval/realworld/scripts/free-eval.mjs", "eval/realworld/scripts/live-observer.mjs");
  if (dirty) throw new Error("Commit protocol/harness/runtime changes before live inference.");
  const before = await account();
  if (!Number.isSafeInteger(before.quota?.remaining)) throw new Error("Daily free quota unavailable.");
  const catalog = new Map((await get("/models")).map((m) => [m.id, m]));
  const endpoints = {};
  for (const model of PROTOCOL.models) {
    endpoints[model] = (await get("/models/" + model + "/endpoints")).endpoints;
    assertFreeModel(catalog.get(model), endpoints[model]);
  }
  const oldLedger = read(LEDGER);
  const cohortPath = resolve(OUT, "protocol.json");
  let protocol;
  if (existsSync(cohortPath)) {
    protocol = read(cohortPath);
    if (jsonHash(protocol.codeHashes) !== jsonHash(hashes) || protocol.fixtureHash !== jsonHash(CASES)) throw new Error("Frozen code/fixtures changed. Existing cohort will not be extended.");
  } else {
    if (before.quota.remaining < 34 || oldLedger.maxRequests - oldLedger.entries.length < 34) throw new Error("Insufficient quota for the planned cohort.");
    const pair = await L.generateEd25519KeyPairJwk();
    signing = { kid: "refund-demo-20261103", ...pair };
    write(resolve(PRIVATE, "signing-key.json"), signing);
    const trust = { kid: signing.kid, publicKeyJwk: pair.publicKeyJwk, state: "active" };
    write(resolve(OUT, "public-key.json"), trust);
    protocol = { ...PROTOCOL, frozenAt: new Date().toISOString(), revision: git("rev-parse", "HEAD"),
      node: process.version, codeHashes: hashes, fixtureHash: jsonHash(CASES),
      trustAnchorHash: jsonHash(trust), ledgerStart: oldLedger.entries.length,
      accountBefore: before, paidLedgerHash: sha(readFileSync(resolve(ROOT, ".context/hosted-budget.json"))),
      models: PROTOCOL.models.map((id) => ({ id, pricing: catalog.get(id).pricing, endpoints: endpoints[id] })),
      scoring: "Exact declared action, amount, authority, conflict, decisive rule inclusion and required source inclusion. Narrative explanation not graded for entailment. All 32 planned runs in the denominator.",
      controls: "No retries, paid fallback, extensions or model replacement. Two development calls excluded; no prompt repair after freeze. Simulated human/payment events are not model actions.",
      timing: "Wall includes HTTP and free-tier pacing. Residual also includes harness/ledger work and is not pure SDK overhead.",
    };
    write(cohortPath, protocol);
  }
  signing ??= read(resolve(PRIVATE, "signing-key.json"));
  const trust = read(resolve(OUT, "public-key.json"));
  if (jsonHash(trust) !== protocol.trustAnchorHash) throw new Error("Trust anchor differs from frozen protocol.");
  const signer = L.createInMemorySigner(signing.privateKeyJwk, { kid: signing.kid, publicKeyJwk: signing.publicKeyJwk });
  const keys = L.createMemoryKeySet([trust]);
  budget = new FreeRequestLedger(LEDGER, { remainingToday: before.quota.remaining });
  const guardedBudget = {
    pace: () => budget.pace(),
    reserve(model) {
      if (budget.state.entries.length - protocol.ledgerStart >= PROTOCOL.maxCohortRequests) throw new Error("Refund cohort request cap reached.");
      return budget.reserve(model);
    },
    settle: (id, cost) => budget.settle(id, cost),
  };
  state = existsSync(statePath) ? read(statePath) : { version: PROTOCOL.version, protocolHash: jsonHash(protocol), development: [], rows: [], resumes: [] };
  if (state.protocolHash !== jsonHash(protocol)) throw new Error("Protocol hash mismatch.");
  if (state.rows.length || state.development.length) {
    state.resumes.push({ at: new Date().toISOString(), priorStop: state.stopped ?? null, account: before });
    for (const row of [...state.development, ...state.rows]) if (row.status === "started") {
      row.status = "interrupted"; row.error = "Interrupted after start; retained without retry.";
    }
  }
  const observer = createObservedFetch({ BASE, MODELS: PROTOCOL.models, modelCatalog: catalog, endpointCatalog: endpoints,
    budget: guardedBudget, freeOnly: true, scrub, getActive: () => active, getStopped: () => stopped, setStopped: (s) => { stopped = s; } });
  const capturedFetch = async (url, init) => {
    active.requestBodies.push(init.body);
    return observer(url, init);
  };

  async function execute(example, model, repetition, development = false) {
    const rows = development ? state.development : state.rows;
    const id = example.id + ":" + model + ":" + repetition;
    if (rows.some((r) => r.id === id) || stopped) return;
    active = { calls: [], preparedBodies: [], requestBodies: [], backoffMs: 0, pacingMs: 0, lastOutput: "" };
    const row = { id, caseId: example.id, model, repetition, status: "started", startedAt: new Date().toISOString() };
    rows.push(row); save();
    const intent = makeIntent(example), start = performance.now();
    let result, error = null;
    try {
      const ai = L.createAI({ signer, providers: [L.createOpenAICompatibleProvider({
        id: "openrouter", model, baseUrl: BASE, apiKey: KEY, fetch: capturedFetch,
      })] });
      result = await ai.run(intent);
    } catch (e) { error = scrub(e.message).slice(0, 400); }
    const wallMs = performance.now() - start;
    const text = result?.outputs?.answer ?? active.lastOutput ?? "";
    const bundle = { caseId: example.id, model, task: intent.task, executionPolicy: intent.policy,
      artifacts: example.artifacts, requestBodies: active.requestBodies, outputs: result?.outputs ?? null,
      rawAnswer: active.lastOutput, receipt: result?.receipt ?? null,
      runtimeOkay: result?.ok ?? false, error: error ?? result?.error?.kind ?? null,
      receiptError: result?.receiptError ?? null };
    const verification = await verifyBundle(bundle, keys, example);
    const application = applicationWorkflow(example, text, verification.evidenceOkay && !!result?.ok);
    const bundleName = (development ? "development-" : "") + example.id + "-" + PROTOCOL.models.indexOf(model) + "-" + repetition + ".json";
    write(resolve(OUT, "bundles", bundleName), { ...bundle, application });
    Object.assign(row, { status: "finished", runtimeOkay: result?.ok ?? false, error: bundle.error,
      grade: gradeRecommendation(text, example), verification, application,
      calls: active.calls, wallMs, pacingMs: active.pacingMs,
      httpMs: active.calls.reduce((s, c) => s + c.httpMs, 0),
      bundle: "bundles/" + bundleName, bundleHash: jsonHash({ ...bundle, application }) });
    save();
    console.log(JSON.stringify({ case: example.id, model, repetition, runtimeOkay: row.runtimeOkay,
      strict: row.grade.strict, verified: verification.evidenceOkay, application: application.status }));
    if (development && (!verification.signature || !verification.requestBound)) {
      stopped = "Development transport/binding check failed. No evaluation cases sent."; save();
    }
  }
  for (const model of PROTOCOL.models) await execute(DEVELOPMENT_CASE, model, 0, true);
  for (let repetition = 0; repetition < PROTOCOL.repetitions; repetition++) {
    for (const example of CASES) {
      const order = repetition % 2 ? [...PROTOCOL.models].reverse() : PROTOCOL.models;
      for (const model of order) await execute(example, model, repetition);
    }
  }
  state.accountAfter = await account();
  state.addedAccountUsageUsd = state.accountAfter.usage - protocol.accountBefore.usage;
  state.cohortRequests = budget.state.entries.length - protocol.ledgerStart;
  state.paidLedgerUnchanged = sha(readFileSync(resolve(ROOT, ".context/hosted-budget.json"))) === protocol.paidLedgerHash;
  state.finishedAt = new Date().toISOString();
  save();
} catch (error) {
  stopped = scrub(error.message);
  save(); console.error(stopped); process.exitCode = 1;
} finally { rmSync(LOCK, { recursive: true }); }
