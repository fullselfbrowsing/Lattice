// Shared guards for the paid cohort: freezing, admission, scrubbing, atomic writes, transport.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { resolve, dirname, relative, join, isAbsolute } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { PaidBudget, CircuitBreaker, HARD_CAP_USD, maxPrices, stageCeiling, standardEndpoints } from "./budget.mjs";
import { TESTED_MODELS, JUDGE_MODELS, ALLOWED_MODELS, createPaidObserver } from "./observer.mjs";

export { TESTED_MODELS, JUDGE_MODELS, ALLOWED_MODELS };
export const ROOT = resolve(import.meta.dirname, "../..");
export const BASE = "https://openrouter.ai/api/v1";
export const DRY = process.env.PAID_DRY_RUN === "1";
export const LEDGER_LIMIT_USD = 17;
export const PROTOCOL_VERSION = "paid-cohort/v1";
export const KID = "paid-public-refund-20261112";
export const CAPS = { A: 4096, B: 4096, J: 2048, judgeReasoning: 1024, transport: 1024, privacy: 1024, latency: 1024, agent: 2048, crew: 2048 };
export const EXPECTED_PER_CALL_USD = { smoke: 0.02, A: 0.027, B: 0.0141, J: 0.0085, C: 0.004 };
/** Per-stage request timeouts (ms); frozen in the protocol. */
export const TIMEOUTS_MS = { smoke: 300000, A: 300000, B: 300000, J: 180000, C: 120000 };
const FULL_COUNTS = { repetitions: 2, questions: 60, transport: 40, privacy: 20, agents: 5, latency: 20, warmups: 2 };

export const sha = (value) => createHash("sha256").update(value).digest("hex");
export const jsonHash = (value) => sha(JSON.stringify(value));
export const readJSON = (path) => JSON.parse(readFileSync(path, "utf8"));

// ---- environment guards -------------------------------------------------------------------

function parseDryCounts() {
  const raw = process.env.PAID_DRY_COUNTS;
  if (raw === undefined) return null;
  if (!DRY) throw new Error("PAID_DRY_COUNTS is only valid in a dry run.");
  const value = JSON.parse(raw);
  for (const [k, v] of Object.entries(value)) {
    if (!(k in FULL_COUNTS) || !Number.isSafeInteger(v) || v < 0 || v > FULL_COUNTS[k]) throw new Error("Invalid PAID_DRY_COUNTS entry: " + k);
  }
  return value;
}
export const DRY_COUNTS = parseDryCounts();
export const COUNTS = { ...FULL_COUNTS, ...(DRY_COUNTS ?? {}) };

function realPathLoose(path) {
  // Resolve symlinks on the nearest existing ancestor (macOS maps /tmp to /private/tmp).
  const rest = [];
  let current = resolve(path);
  while (!existsSync(current) && dirname(current) !== current) { rest.unshift(current.slice(dirname(current).length + 1)); current = dirname(current); }
  return join(realpathSync(current), ...rest);
}
function underTemp(dir) {
  const real = realPathLoose(dir);
  return ["/tmp", tmpdir()].map(realPathLoose).some((base) => { const rel = relative(base, real); return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel); });
}

/** Output, private and ledger locations. Overrides exist only for a dry run into a temp dir. */
export function paths() {
  const overrides = ["PAID_OUT_DIR", "PAID_PRIVATE_DIR", "PAID_LEDGER"].filter((k) => process.env[k]);
  if (!DRY && overrides.length) throw new Error("Path overrides are only valid in a dry run: " + overrides.join(", "));
  if (DRY) {
    if (!process.env.PAID_OUT_DIR || !process.env.PAID_PRIVATE_DIR) throw new Error("A dry run needs PAID_OUT_DIR and PAID_PRIVATE_DIR in a temp directory.");
    for (const dir of [process.env.PAID_OUT_DIR, process.env.PAID_PRIVATE_DIR, process.env.PAID_LEDGER].filter(Boolean)) {
      if (!isAbsolute(dir) || !underTemp(resolve(dir))) throw new Error("Dry-run paths must be absolute and under /tmp: " + dir);
      if (!relative(ROOT, resolve(dir)).startsWith("..")) throw new Error("Dry-run paths must be outside the repository: " + dir);
    }
  }
  const out = DRY ? resolve(process.env.PAID_OUT_DIR) : resolve(ROOT, "eval/paid-cohort/results");
  const priv = DRY ? resolve(process.env.PAID_PRIVATE_DIR) : resolve(ROOT, ".context/paid-cohort");
  return { out, priv, ledger: DRY && process.env.PAID_LEDGER ? resolve(process.env.PAID_LEDGER) : resolve(priv, "budget.json") };
}

let activeKey = null;
/** The only place the credential is read, and never in a dry run. */
export function loadKey() {
  if (DRY) return null;
  const path = process.env.OPENROUTER_KEY_FILE ?? resolve(ROOT, ".context/attachments/y53fe4/openrouter.key");
  const key = readFileSync(path, "utf8").trim();
  if (!key || /\s/.test(key)) throw new Error("Invalid credential file.");
  activeKey = key;
  return key;
}

export function scrub(text, key = activeKey) {
  let value = String(text);
  if (key) value = value.split(key).join("[redacted]");
  return value.replace(/sk-or-[A-Za-z0-9_-]{8,}/g, "[redacted]").replace(/Bearer\s+[A-Za-z0-9._-]{20,}/g, "Bearer [redacted]");
}

export function atomicWrite(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = path + ".tmp";
  writeFileSync(temporary, scrub(text), { mode: 0o600 });
  renameSync(temporary, path);
}
export const writeJSON = (path, value) => atomicWrite(path, JSON.stringify(value, null, 2) + "\n");

export function acquireLock(dir) {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, "paid-cohort.lock");
  try { mkdirSync(lock); } catch { throw new Error("Another paid-cohort stage owns the lock; inspect before removing it."); }
  return () => rmSync(lock, { recursive: true, force: true });
}

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
const GUARDED = [":(glob)eval/paid-cohort/*.mjs", "eval/public-refund/cases.mjs", "eval/public-refund/workflow.mjs",
  "eval/realworld/scripts/free-judge-utils.mjs", "packages/lattice/src"];
/** Real runs must execute committed code; the dry run is for development. */
export function requireCleanTree() {
  if (DRY) return;
  if (git("status", "--porcelain", "--", ...GUARDED)) throw new Error("Commit the harness before live inference.");
}

export function codeHashes() {
  const files = [
    ...readdirSync(import.meta.dirname).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs")).map((f) => "eval/paid-cohort/" + f),
    "eval/public-refund/cases.mjs", "eval/public-refund/workflow.mjs", "eval/public-refund/source-manifest.json",
    "eval/realworld/scripts/free-judge-utils.mjs",
    ...readdirSync(resolve(ROOT, "packages/lattice/dist")).filter((f) => f.endsWith(".js")).map((f) => "packages/lattice/dist/" + f),
  ].sort();
  return Object.fromEntries(files.map((f) => [f, sha(readFileSync(resolve(ROOT, f)))]));
}

// ---- frozen inputs ------------------------------------------------------------------------

export const CACHE = process.env.REALWORLD_CACHE ?? resolve(ROOT, ".context/eval-cache");
export const REFUND_INPUTS = resolve(ROOT, ".context/refund-public/inputs.json");

/** Inputs must be identical to the free cohorts'; any mismatch refuses the run. */
export function inputHashes() {
  const refund = readJSON(REFUND_INPUTS);
  const freeRefund = readJSON(resolve(ROOT, "eval/public-refund/results/protocol.json"));
  if (jsonHash(refund) !== freeRefund.inputHash) throw new Error("Public-record inputs differ from the frozen free cohort.");
  const split = resolve(CACHE, "citation-split");
  const manifest = readJSON(resolve(split, "manifest.json"));
  const free = readJSON(resolve(ROOT, "eval/realworld/results/validated-free-full.json"));
  if (JSON.stringify(manifest) !== JSON.stringify(free.env.citationManifest)) throw new Error("Citation manifest differs from the free cohort's.");
  const evaluation = sha(readFileSync(resolve(split, "evaluation.jsonl")));
  const dev = sha(readFileSync(resolve(split, "dev.jsonl")));
  if (evaluation !== manifest.splits.evaluation.sha256 || dev !== manifest.splits.dev.sha256) throw new Error("Citation split files do not match their manifest.");
  return { refundInputHash: freeRefund.inputHash, citationManifestHash: jsonHash(manifest), evaluationSha256: evaluation, devSha256: dev };
}

export function strictFields() {
  return { version: PROTOCOL_VERSION, dryRun: DRY, dryCounts: DRY_COUNTS, kid: KID, testedModels: TESTED_MODELS, judgeModels: JUDGE_MODELS,
    ledgerLimitUsd: LEDGER_LIMIT_USD, caps: CAPS, timeoutsMs: TIMEOUTS_MS, counts: COUNTS, inputs: inputHashes(), codeHashes: codeHashes() };
}

// ---- transport, catalog, account ----------------------------------------------------------

export async function getTransport() {
  if (!DRY) return globalThis.fetch;
  const { mockFetch } = await import("./mock.mjs");
  // Any accidental use of the real network stack in a dry run fails loudly.
  globalThis.fetch = () => { throw new Error("Real network access is forbidden in a dry run."); };
  return mockFetch;
}

export async function apiGet(transport, path, key) {
  const response = await transport(BASE + path, { headers: key ? { authorization: "Bearer " + key } : {}, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error("Metadata request failed: " + path + " HTTP " + response.status);
  return (await response.json()).data;
}

export async function accountSnapshot(transport, key) {
  const keyData = await apiGet(transport, "/key", key);
  const credits = await apiGet(transport, "/credits", key);
  const balanceUsd = Number(credits.total_credits) - Number(credits.total_usage);
  if (!Number.isFinite(balanceUsd)) throw new Error("Account balance unavailable.");
  return { at: new Date().toISOString(), keyUsage: keyData.usage ?? null, keyLimit: keyData.limit ?? null,
    totalCredits: credits.total_credits, totalUsage: credits.total_usage, balanceUsd };
}

export async function snapshotPrices(transport, key, models = ALLOWED_MODELS) {
  const catalog = new Map((await apiGet(transport, "/models", key)).map((m) => [m.id, m]));
  const snapshot = { at: new Date().toISOString(), catalogPricing: {}, endpoints: {}, max: {}, standardMax: {} };
  for (const id of models) {
    if (!catalog.has(id)) throw new Error("Required model is unavailable: " + id);
    const endpoints = (await apiGet(transport, "/models/" + id + "/endpoints", key)).endpoints;
    snapshot.catalogPricing[id] = catalog.get(id).pricing ?? null;
    snapshot.endpoints[id] = endpoints.map(({ name, provider_name, tag, pricing, context_length, max_completion_tokens }) =>
      ({ name, provider_name, tag, pricing, context_length, max_completion_tokens }));
    snapshot.max[id] = maxPrices(endpoints);
    snapshot.standardMax[id] = maxPrices(standardEndpoints(endpoints));
  }
  return snapshot;
}

/** Prices may stay equal or fall; any increase on a frozen model refuses the stage. */
export function priceChanges(frozenMax, currentMax) {
  const increases = [], decreases = [];
  for (const [model, frozen] of Object.entries(frozenMax)) {
    const now = currentMax[model];
    if (!now) { increases.push({ model, field: "model", frozen: "listed", now: "missing" }); continue; }
    for (const field of Object.keys({ ...frozen, ...now })) {
      const a = frozen[field] ?? 0, b = now[field] ?? 0;
      if (b > a) increases.push({ model, field, frozen: a, now: b });
      else if (b < a) decreases.push({ model, field, frozen: a, now: b });
    }
  }
  return { increases, decreases };
}

export function freezeProtocol(outDir, snapshot, accountBefore) {
  const fields = strictFields();
  const path = join(outDir, "protocol.json");
  if (existsSync(path)) {
    const protocol = readJSON(path);
    for (const key of Object.keys(fields)) {
      if (jsonHash(protocol[key] ?? null) !== jsonHash(fields[key] ?? null)) throw new Error("Frozen " + key + " changed. Existing cohort will not be extended.");
    }
    const changes = priceChanges(protocol.priceSnapshot, snapshot.max);
    const standard = priceChanges(protocol.standardPriceSnapshot ?? {}, snapshot.standardMax ?? {});
    changes.increases.push(...standard.increases.map((c) => ({ ...c, tier: "standard" })));
    if (changes.increases.length) throw new Error("Price increased since the freeze; refusing: " + JSON.stringify(changes.increases));
    return { protocol, created: false, priceCheck: { at: snapshot.at, increases: 0, decreases: changes.decreases } };
  }
  const protocol = { ...fields, frozenAt: new Date().toISOString(), revision: git("rev-parse", "HEAD"), node: process.version,
    priceSnapshot: snapshot.max, standardPriceSnapshot: snapshot.standardMax, endpointSnapshot: snapshot.endpoints, catalogPricing: snapshot.catalogPricing, accountBefore,
    rules: {
      requests: "One attempt per request; no retries, fallbacks, routing fields, plugins or server-side tools. Reservation before send, settled to usage.cost; an unknown cost keeps the reservation; a charge above it halts the cohort.",
      prices: "Re-snapshotted at each stage start. A price increase on a frozen model refuses the stage; equal or lower prices are recorded and allowed.",
      tiers: "Per-request reservations use the most expensive listed endpoint. Stage admission uses the most expensive standard endpoint, excluding the opt-in priority, fast and ultrafast service tiers, which no request asks for. A call billed above 1.5 times its usage at standard prices pauses the stage for inspection.",
      pooling: "Never pooled with the free cohorts. Failed rows stay in denominators.",
      determinism: "OpenRouter ignores temperature for the Claude and GPT models, so these runs are not deterministic. Reasoning uses each provider's default; max_tokens is the hard cap.",
      validity: "Valid iff every admitted stage completes, at least 95% of planned calls return a model response, and every successful run's receipt verifies. No score is an input.",
    } };
  writeJSON(path, protocol);
  return { protocol, created: true, priceCheck: { at: snapshot.at, increases: 0, decreases: [] } };
}

// ---- stage bookkeeping --------------------------------------------------------------------

export function recordStage(outDir, name, patch) {
  const path = join(outDir, "stages.json");
  const all = existsSync(path) ? readJSON(path) : {};
  all[name] = { ...(all[name] ?? {}), ...patch };
  writeJSON(path, all);
  return all[name];
}
export const readStages = (outDir) => existsSync(join(outDir, "stages.json")) ? readJSON(join(outDir, "stages.json")) : {};

export class NotAdmitted extends Error {}

export const estimateTokens = (bytes) => Math.ceil(bytes / 3);

/** Sum of per-model worst cases from the current price snapshot. */
export function ceilingFor(snapshot, items) {
  return items.reduce((total, { model, calls, inputTokens, cap }) => {
    const max = snapshot.standardMax?.[model] ?? snapshot.max[model];
    if (!max) throw new Error("No price snapshot for " + model);
    return total + stageCeiling(calls, inputTokens, Math.max(max.prompt, max.input_cache_write), cap, Math.max(max.completion, max.internal_reasoning))
      + calls * max.request;
  }, 0);
}

/** Everything a stage needs before its first request. */
export async function bootstrap(stage, { models, expectedPerCall }) {
  const dirs = paths(); // validates overrides before anything else, including the credential read
  requireCleanTree();
  const key = loadKey();
  const transport = await getTransport();
  const release = acquireLock(dirs.priv);
  try {
    const snapshot = await snapshotPrices(transport, key);
    const accountStart = await accountSnapshot(transport, key);
    const { protocol, priceCheck } = freezeProtocol(dirs.out, snapshot, accountStart);
    const budget = new PaidBudget(dirs.ledger, LEDGER_LIMIT_USD);
    if (budget.state.limitUsd > HARD_CAP_USD) throw new Error("Ledger above the hard cap.");
    const breaker = new CircuitBreaker({ expectedPerCall });
    const endpointCatalog = Object.fromEntries(ALLOWED_MODELS.map((id) => [id, snapshot.endpoints[id]]));
    const session = { startedAt: new Date().toISOString(), accountBefore: accountStart, confirmedBeforeUsd: budget.confirmedUsd, chargedBeforeUsd: budget.chargedUsd };
    const control = { stopped: null, active: null };
    const observed = createPaidObserver({ BASE, MODELS: models, endpointCatalog, budget, breaker, fetch: transport,
      timeoutMs: TIMEOUTS_MS[stage.startsWith("smoke") ? "smoke" : stage],
      scrub: (text) => scrub(text, key), getActive: () => control.active, getStopped: () => control.stopped, setStopped: (v) => { control.stopped = v; } });
    const context = { stage, key, transport, dirs, release, snapshot, protocol, priceCheck, budget, breaker, endpointCatalog,
      session, control, observed, protocolHash: jsonHash(protocol) };
    recordStage(dirs.out, stage, { priceChecks: [...(readStages(dirs.out)[stage]?.priceChecks ?? []), priceCheck] });
    return context;
  } catch (error) { release(); throw error; }
}

/** Worst-case admission against the ledger and the live account balance. */
export async function admitStage(ctx, ceilingUsd, detail = {}) {
  const account = await accountSnapshot(ctx.transport, ctx.key);
  const admitted = ctx.budget.admit(ceilingUsd, account.balanceUsd);
  const admission = { at: account.at, ceilingUsd, remainingUsd: ctx.budget.remainingUsd, balanceUsd: account.balanceUsd, admitted, ...detail };
  ctx.session.accountBefore = account;
  recordStage(ctx.dirs.out, ctx.stage, { admission, ...(admitted ? { admitted: true } : { admitted: false, complete: false, planned: 0, attempted: 0, responded: 0, stopped: "Not admitted: worst case exceeds ledger or balance." }) });
  if (!admitted) throw new NotAdmitted("Stage " + ctx.stage + " not admitted: ceiling " + ceilingUsd.toFixed(2) + " USD, ledger remaining " + ctx.budget.remainingUsd.toFixed(2) + " USD, balance " + account.balanceUsd.toFixed(2) + " USD.");
  return account;
}

/** The model returned an answer (HTTP 200 with a finish reason), whatever its quality. */
export const responded = (row) => (row.calls ?? []).some((c) => c.status === 200 && c.finishReason);

export async function finishStage(ctx, { planned, attempted, respondedCount, extra = {} }) {
  let accountAfter = null;
  try { accountAfter = await accountSnapshot(ctx.transport, ctx.key); } catch { /* recorded as null */ }
  const previous = readStages(ctx.dirs.out)[ctx.stage] ?? {};
  const session = { ...ctx.session, endedAt: new Date().toISOString(), accountAfter, confirmedAfterUsd: ctx.budget.confirmedUsd, chargedAfterUsd: ctx.budget.chargedUsd,
    ledgerConfirmedDeltaUsd: ctx.budget.confirmedUsd - ctx.session.confirmedBeforeUsd, ledgerChargedDeltaUsd: ctx.budget.chargedUsd - ctx.session.chargedBeforeUsd,
    accountDeltaUsd: accountAfter ? ctx.session.accountBefore.balanceUsd - accountAfter.balanceUsd : null };
  const sessions = [...(previous.sessions ?? []), session];
  const stopped = ctx.control.stopped;
  return recordStage(ctx.dirs.out, ctx.stage, { planned, attempted, responded: respondedCount, stopped, complete: !stopped && attempted >= planned,
    sessions, ledgerConfirmedUsd: sessions.reduce((n, s) => n + s.ledgerConfirmedDeltaUsd, 0),
    ledgerChargedUsd: sessions.reduce((n, s) => n + s.ledgerChargedDeltaUsd, 0),
    accountDeltaUsd: sessions.every((s) => s.accountDeltaUsd !== null) ? sessions.reduce((n, s) => n + s.accountDeltaUsd, 0) : null,
    ...extra });
}

// ---- gates --------------------------------------------------------------------------------

/** Smoke acceptance is infrastructure only (answer format is a measured outcome, never gated): HTTP 200, cost present, tokens within cap, cost within reservation. */
export function smokeVerdict(rows) {
  const problems = [];
  for (const row of rows) {
    if (!row.calls?.length) problems.push(row.id + ": no call recorded");
    for (const c of row.calls ?? []) {
      if (c.status !== 200) problems.push(row.id + ": HTTP " + c.status);
      if (typeof c.costUsd !== "number") problems.push(row.id + ": usage.cost missing");
      if (c.completionTokens != null && c.completionTokens > c.maxTokens) problems.push(row.id + ": completion tokens above cap");
      if (typeof c.costUsd === "number" && c.costUsd > c.reservedUsd) problems.push(row.id + ": cost above reservation");
    }
  }
  return { pass: rows.length > 0 && problems.length === 0, problems };
}

export function requireGates(ctx, names) {
  for (const name of names) {
    const path = join(ctx.dirs.out, name + ".json");
    const gate = existsSync(path) ? readJSON(path) : null;
    if (!gate?.pass || gate.protocolHash !== ctx.protocolHash) throw new Error("Smoke gate " + name + " has not passed for this protocol; run it first.");
  }
}
export const itemPlural = (n, word) => n + " " + word + (n === 1 ? "" : "s");

export function newActive() {
  return { calls: [], preparedBodies: [], requestBodies: [], backoffMs: 0, pacingMs: 0, lastBody: null, lastOutput: "" };
}

/** Direct chat call through the observer; the body is submitted byte for byte. */
export async function directCall(ctx, body) {
  const response = await ctx.observed(BASE + "/chat/completions", { method: "POST",
    headers: { "content-type": "application/json", ...(ctx.key ? { authorization: "Bearer " + ctx.key } : {}) }, body });
  const parsed = await response.json();
  return { ok: response.ok && !parsed?.error, text: parsed?.choices?.[0]?.message?.content ?? "" };
}
