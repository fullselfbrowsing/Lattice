// Stage A: public-record refund review on the three paid models. Adapted from eval/public-refund/run.mjs.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as L from "../../packages/lattice/dist/index.js";
import { CASES } from "../public-refund/cases.mjs";
import { makeIntent, gradeReview, verifyBundle } from "../public-refund/workflow.mjs";
import {
  BASE, CAPS, COUNTS, KID, EXPECTED_PER_CALL_USD, TESTED_MODELS, REFUND_INPUTS, bootstrap, admitStage, finishStage, requireGates,
  ceilingFor, estimateTokens, newActive, readJSON, writeJSON, jsonHash, sha, scrub, responded, NotAdmitted,
} from "./common.mjs";

const ctx = await bootstrap("A", { models: TESTED_MODELS, expectedPerCall: EXPECTED_PER_CALL_USD.A });
const { dirs, control } = ctx;
const OUT = join(dirs.out, "public-refund"), PRIVATE = join(dirs.priv, "public-refund");
const statePath = join(OUT, "live.json");
let state, admittedOk = false;
const save = () => { if (state) { state.stopped = control.stopped; state.ledgerAfter = ctx.budget.summary(); writeJSON(statePath, state); } };

try {
  requireGates(ctx, ["smoke-citations", "smoke-judge"]);
  // The inputs are the free cohort's, read-only; they never leave .context.
  const inputs = readJSON(REFUND_INPUTS);
  const examples = CASES.map((c) => ({ ...c, artifacts: inputs.find((x) => x.id === c.id).artifacts }));
  if (jsonHash(inputs) !== readJSON(join(import.meta.dirname, "../public-refund/results/protocol.json")).inputHash) throw new Error("Public-record inputs changed.");

  // Exact request sizes come from a local, non-networked capture of each prompt.
  const sizes = [];
  for (const example of examples) {
    let captured = "";
    const provider = L.createOpenAICompatibleProvider({ id: "openrouter", model: TESTED_MODELS[0], baseUrl: BASE,
      fetch: async (_url, init) => { captured = init.body; return new Response("{}", { status: 500 }); } });
    await L.createAI({ providers: [provider] }).run(makeIntent(example));
    sizes.push(Buffer.byteLength(captured));
  }
  const calls = examples.length * COUNTS.repetitions;
  const planned = calls * TESTED_MODELS.length;
  const ceiling = ceilingFor(ctx.snapshot, TESTED_MODELS.map((model) => ({ model, calls, inputTokens: estimateTokens(Math.max(...sizes)), cap: CAPS.A })));
  await admitStage(ctx, ceiling, { planned, maxRequestBytes: Math.max(...sizes) });
  admittedOk = true;

  // Signing material: new kid, private key under .context/paid-cohort only.
  const keyPath = join(PRIVATE, "signing-key.json");
  let signing;
  if (existsSync(keyPath)) signing = readJSON(keyPath);
  else {
    const pair = await L.generateEd25519KeyPairJwk();
    signing = { kid: KID, ...pair };
    writeJSON(keyPath, signing);
  }
  const trustPath = join(OUT, "public-key.json");
  if (!existsSync(trustPath)) writeJSON(trustPath, { kid: signing.kid, publicKeyJwk: signing.publicKeyJwk, state: "active" });
  const trust = readJSON(trustPath);
  if (trust.kid !== KID || jsonHash(trust.publicKeyJwk) !== jsonHash(signing.publicKeyJwk)) throw new Error("Trust anchor differs from the signing key.");
  const signer = L.createInMemorySigner(signing.privateKeyJwk, { kid: signing.kid, publicKeyJwk: signing.publicKeyJwk });
  const keys = L.createMemoryKeySet([trust]);

  state = existsSync(statePath) ? readJSON(statePath)
    : { version: "paid-public-refund/v1", protocolHash: ctx.protocolHash, trustAnchorHash: jsonHash(trust), rows: [], resumes: [] };
  if (state.protocolHash !== ctx.protocolHash || state.trustAnchorHash !== jsonHash(trust)) throw new Error("Protocol hash mismatch.");
  if (state.rows.length) {
    state.resumes.push({ at: new Date().toISOString(), priorStop: state.stopped ?? null });
    for (const row of state.rows) if (row.status === "started") { row.status = "interrupted"; row.error = "Interrupted after start; retained without retry."; }
  }
  save();

  async function execute(example, model, repetition) {
    const id = example.id + ":" + model + ":" + repetition;
    if (state.rows.some((r) => r.id === id) || control.stopped) return;
    control.active = newActive();
    const active = control.active;
    const row = { id, caseId: example.id, model, repetition, status: "started", startedAt: new Date().toISOString() };
    state.rows.push(row);
    save();
    const intent = makeIntent(example), start = performance.now();
    let result, error = null;
    try {
      const ai = L.createAI({ signer, providers: [L.createOpenAICompatibleProvider({ id: "openrouter", model, baseUrl: BASE, apiKey: ctx.key ?? undefined, fetch: ctx.observed })] });
      result = await ai.run(intent);
    } catch (e) { error = scrub(e.message).slice(0, 400); }
    const wallMs = performance.now() - start;
    const text = result?.outputs?.answer ?? active.lastOutput ?? "";
    const bundle = { caseId: example.id, model, task: intent.task, executionPolicy: intent.policy, artifacts: example.artifacts,
      requestBodies: active.requestBodies, outputs: result?.outputs ?? null, rawAnswer: active.lastOutput, receipt: result?.receipt ?? null,
      runtimeOkay: result?.ok ?? false, error: error ?? result?.error?.kind ?? null, receiptError: result?.receiptError ?? null };
    const verification = await verifyBundle(bundle, keys, example);
    const bundleName = example.id + "-" + TESTED_MODELS.indexOf(model) + "-" + repetition + ".json";
    writeJSON(join(PRIVATE, "bundles", bundleName), bundle);
    const publicBundle = { caseId: bundle.caseId, model, task: bundle.task, executionPolicy: bundle.executionPolicy, outputs: bundle.outputs,
      rawAnswer: bundle.rawAnswer, receipt: bundle.receipt, runtimeOkay: bundle.runtimeOkay, error: bundle.error, receiptError: bundle.receiptError,
      sourcePages: example.artifacts.map(({ source_id, source_url, pdf_sha256, page, text: t }) => ({ source_id, source_url, pdf_sha256, page, textSha256: sha(t) })),
      requestBodyHashes: bundle.requestBodies.map(sha),
      retention: "Exact source pages and serialized requests retained locally under .context/paid-cohort; full decisions are not redistributed in this bundle." };
    writeJSON(join(OUT, "bundles", bundleName), publicBundle);
    Object.assign(row, { status: "finished", runtimeOkay: result?.ok ?? false, error: bundle.error, grade: gradeReview(text, example), verification,
      calls: active.calls, wallMs, httpMs: active.calls.reduce((s, c) => s + c.httpMs, 0),
      bundle: "bundles/" + bundleName, bundleHash: jsonHash(bundle), publicBundleHash: jsonHash(publicBundle) });
    save();
    console.log(JSON.stringify({ case: example.id, model, repetition, runtimeOkay: row.runtimeOkay, facts: row.grade.facts,
      citations: row.grade.citations, strict: row.grade.strict, verified: verification.evidenceOkay, spentUsd: +ctx.budget.confirmedUsd.toFixed(4) }));
  }

  for (let repetition = 0; repetition < COUNTS.repetitions; repetition++) {
    for (const example of examples) {
      const order = repetition % 2 ? [...TESTED_MODELS].reverse() : TESTED_MODELS;
      for (const model of order) await execute(example, model, repetition);
    }
  }
  save();
} catch (error) {
  if (!(error instanceof NotAdmitted)) control.stopped ??= scrub(error.message);
  save();
  console.error(scrub(error.message));
  process.exitCode = error instanceof NotAdmitted ? 3 : 1;
} finally {
  if (admittedOk) {
    const rows = state?.rows ?? [];
    const finished = await finishStage(ctx, { planned: CASES.length * COUNTS.repetitions * TESTED_MODELS.length,
      attempted: rows.filter((r) => r.status === "finished").length, respondedCount: rows.filter(responded).length });
    if (state) { state.accountAfter = finished.sessions.at(-1)?.accountAfter ?? null; state.addedAccountUsageUsd = finished.accountDeltaUsd; save(); }
    if (finished.stopped && !process.exitCode) process.exitCode = 1;
    console.log(JSON.stringify({ stage: "A", complete: finished.complete, planned: finished.planned, attempted: finished.attempted, responded: finished.responded, stopped: finished.stopped }));
  }
  ctx.release();
}
