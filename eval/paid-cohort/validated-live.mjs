// Stages smoke, B (citations) and C (runtime checks). Adapted from eval/realworld/scripts/14-validated-live.mjs.
// Usage: node validated-live.mjs smoke|B|C
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import * as L from "../../packages/lattice/dist/index.js";
import { fingerprintArtifactValue } from "../../packages/lattice/dist/storage.js";
import { generation, intent, parseCited, captureBody, citationRequest } from "./requests.mjs";
import {
  BASE, CAPS, COUNTS, EXPECTED_PER_CALL_USD, TESTED_MODELS, CACHE, bootstrap, admitStage, finishStage, requireGates, ceilingFor, estimateTokens, accountSnapshot,
  newActive, readJSON, writeJSON, jsonHash, scrub, responded, smokeVerdict, directCall, NotAdmitted,
} from "./common.mjs";

const MODE = process.argv[2];
if (!["smoke", "B", "C"].includes(MODE)) throw new Error("Usage: validated-live.mjs smoke|B|C");
const STAGE = MODE === "smoke" ? "smoke-citations" : MODE;
const FILE = { "smoke-citations": "smoke-citations", B: "citations-live", C: "runtime" }[STAGE];
const ctx = await bootstrap(STAGE, { models: TESTED_MODELS, expectedPerCall: MODE === "smoke" ? EXPECTED_PER_CALL_USD.smoke : EXPECTED_PER_CALL_USD[MODE] });
const { dirs, control, key } = ctx;
const OUT = join(dirs.out, FILE + ".json"), PRIVATE = join(dirs.priv, FILE + "-private.json");
const schema = (validate) => ({ "~standard": { version: 1, vendor: "lattice-eval", validate } });
const accept = schema((value) => ({ value }));
let out, privateRows = [], keys, admittedOk = false, cSuites = null, cPlanned = 0;

function save() {
  if (!out) return;
  out.budget = ctx.budget.summary();
  out.stopped = control.stopped;
  writeJSON(OUT, out);
  writeJSON(PRIVATE, privateRows);
}

function ai(model, signed = true) {
  const runtime = L.createAI({
    providers: [L.createOpenAICompatibleProvider({ id: "openrouter", model, baseUrl: BASE, apiKey: key ?? undefined, fetch: ctx.observed })],
    ...(signed ? { signer: keys.signer } : {}),
  });
  return new Proxy(runtime, { get(target, name) {
    if (name === "run" || name === "runAgent") return async (request) => {
      control.active.expectedTaskHash = await L.hashCanonicalForReceipt(request.task);
      control.active.expectedPolicyHash = await L.hashCanonicalForReceipt(request.policy ?? {});
      return target[name](request);
    };
    return target[name];
  } });
}

async function receiptChecks(result, answer) {
  const active = control.active;
  if (!result?.receipt) return { present: false };
  const verified = await L.verifyReceipt(result.receipt, keys.keySet);
  if (!verified.ok) return { present: true, verified: false, errorKind: verified.error.kind };
  const body = verified.body;
  const hasOutput = body.contractVerdict === "success" && body.outputHash !== null;
  const outputs = result.outputs ?? result.output;
  const hash = outputs ? (await fingerprintArtifactValue(outputs))?.value ?? null : null;
  const edited = outputs ? (await fingerprintArtifactValue({ ...outputs, answer: answer + "!" }))?.value ?? null : null;
  const submitted = active.preparedBodies;
  const expected = await L.verifyReceipt(result.receipt, keys.keySet, {
    expectedTaskHash: active.expectedTaskHash, expectedPolicyHash: active.expectedPolicyHash,
    ...(submitted.length ? { expectedProviderRequestHashes: submitted } : {}),
  });
  return {
    present: true, verified: true, verdict: body.contractVerdict,
    outputBindingEligible: hasOutput, outputHashMatch: hasOutput ? hash === body.outputHash : null,
    editedOutputDetected: hasOutput ? edited !== body.outputHash : null,
    taskBound: body.taskHash === active.expectedTaskHash, policyBound: body.policyHash === active.expectedPolicyHash,
    expectedBindingsVerified: expected.ok,
    requestBound: Array.isArray(body.providerRequestHashes),
    submittedBodiesCovered: Array.isArray(body.providerRequestHashes) ? JSON.stringify(submitted) === JSON.stringify(body.providerRequestHashes) : null,
  };
}

/** One recorded measurement. A failure is a row too; nothing is retried. */
async function runCase(id, model, suite, arm, work, grade = () => ({})) {
  const prior = out.rows.find((row) => row.id === id && row.model === model && row.suite === suite && row.arm === arm);
  if (prior) return prior;
  if (control.stopped) return null;
  control.active = newActive();
  const active = control.active;
  // Recorded before the call so a crash leaves an interrupted row in the denominator, never a silent gap.
  const placeholder = { id, model, suite, arm, status: "started", startedAt: new Date().toISOString() };
  out.rows.push(placeholder);
  save();
  const started = performance.now();
  let result, error = null;
  try { result = await work(); } catch (caught) { error = scrub(caught.message).slice(0, 250); }
  const wallMs = performance.now() - started;
  const httpMs = active.calls.reduce((sum, call) => sum + call.httpMs, 0);
  const ok = result?.ok === true || result?.kind === "success" || result?.result?.kind === "success";
  const answer = String(result?.outputs?.answer ?? result?.output?.answer ?? result?.result?.output?.answer ?? result?.text ?? "");
  const row = {
    id, model, suite, arm, status: "finished", ok, errorKind: error ? "threw" : result?.error?.kind ?? (ok ? null : result?.kind ?? result?.result?.kind ?? "failed"),
    error, wallMs, providerMs: httpMs, backoffMs: active.backoffMs, processingMs: Math.max(0, wallMs - httpMs - active.backoffMs),
    calls: active.calls, receipt: await receiptChecks(result, answer),
    ...await grade({ result, answer, rawAnswer: String(active.lastOutput ?? ""), ok }),
  };
  out.rows[out.rows.indexOf(placeholder)] = row;
  // Everything a fresh process needs to re-verify this row (verify-validated.mjs).
  privateRows.push({ id, model, suite, arm, answer, rawAnswer: active.lastOutput, lastBody: active.lastBody,
    requestBodies: active.requestBodies, receipt: result?.receipt ?? null, receipts: result?.receipts ?? null,
    outputs: result?.outputs ?? result?.output ?? null, expectedTaskHash: active.expectedTaskHash ?? null, expectedPolicyHash: active.expectedPolicyHash ?? null });
  save();
  console.log(JSON.stringify({ suite, model, arm, id, ok, spentUsd: +ctx.budget.confirmedUsd.toFixed(4) }));
  return row;
}

function png(rgb) {
  const crc = (data) => {
    let value = 0xffffffff;
    for (const byte of data) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind, data) => {
    const type = Buffer.from(kind);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const check = Buffer.alloc(4); check.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, check]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.concat(Array.from({ length: 16 }, () => Buffer.from([0, ...Array.from({ length: 16 }, () => rgb).flat()])));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

// ---- stage C items -------------------------------------------------------------------------

async function transportItem(model, i) {
  const isImage = i % 2 === 0;
  const color = ["red", "green", "blue"][Math.floor(i / 2) % 3];
  const bytes = png({ red: [255, 0, 0], green: [0, 255, 0], blue: [0, 0, 255] }[color]);
  const token = "parcel-" + (1000 + i);
  const artifact = isImage
    ? L.artifact.image(i % 4 === 0 ? new Blob([bytes], { type: "image/png" }) : "data:image/png;base64," + bytes.toString("base64"), { id: "fixture", mediaType: "image/png" })
    : L.artifact.json({ shipment: { tracking: token }, quantity: i }, { id: "fixture" });
  const task = isImage ? "Name the solid color in the attached image. Reply only red, green, or blue." : "Read shipment.tracking from the JSON artifact. Reply only with its exact value.";
  const request = intent(task, [artifact], CAPS.transport);
  const expected = isImage ? color : token;
  const directBody = await captureBody(model, request);
  for (const arm of i % 2 ? ["direct", "signed"] : ["signed", "direct"]) {
    await runCase(String(i), model, "transport", arm,
      () => { control.active.expectedBody = directBody; return arm === "direct" ? directCall(ctx, directBody) : ai(model).run(request); },
      ({ answer, ok }) => ({ correct: ok && answer.trim().toLowerCase().replace(/[.!]$/, "") === expected, modality: isImage ? "image" : "json" }));
  }
}

async function privacyItem(model, i) {
  const email = "customer" + i + "@example.com";
  const record = { email, phone: "+14155550134", ssn: "219099999", question: "Can my refund be reviewed?" };
  const request = { ...intent("Confirm that a refund can be reviewed. Do not repeat any personal identifiers.", [L.artifact.json(record, { id: "ticket" })], CAPS.privacy),
    contract: L.contract({ invariants: [L.inv.noPII("answer", { contextual: true })] }) };
  await runCase(String(i), model, "privacy", "signed", () => ai(model).run(request), ({ result, answer, rawAnswer, ok }) => ({
    answerAvailable: ok, answerContainsMarker: ok ? [email, record.phone, record.ssn].some((s) => answer.includes(s)) : null,
    rawOutputContainsMarker: [email, record.phone, record.ssn].some((s) => rawAnswer.includes(s)),
    signedMarkerLeak: result?.receipt ? [email, record.phone, record.ssn].some((s) => Buffer.from(result.receipt.payload, "base64").toString("utf8").includes(s)) : null,
  }));
}

async function agentItem(model, i) {
  const lookup = L.defineTool({ name: "lookup_policy", description: "Read the refund policy.", inputSchema: accept,
    execute: () => ({ window: "30 days", source: "policy-refund" }) });
  await runCase(String(i), model, "agent", "signed", () => ai(model, false).runAgent({
    task: "Call lookup_policy with {}, then state its refund window and cite [policy-refund].", tools: [lookup],
    signer: keys.signer, generation: generation(CAPS.agent), contract: L.contract({ budget: { maxIterations: 4, maxWallTimeMs: 180000 } }),
  }), ({ result, answer, ok }) => ({ toolCalls: (result?.iterations ?? []).reduce((sum, row) => sum + row.toolCalls.length, 0),
    correct: ok && (result?.iterations ?? []).some((row) => row.toolCalls.length > 0) && answer.includes("30") && answer.includes("[policy-refund]") }));
}

async function crewItem(model, i) {
  const child = L.defineAgent({ id: "researcher", intent: "State this supplied policy: refunds within 30 days. Cite [policy-refund].", tools: [], summaryReturnSchema: accept });
  const root = L.defineAgent({ id: "lead", intent: "Delegate to researcher, then report its refund window with [policy-refund].", tools: [], childAgents: [child], summaryReturnSchema: accept });
  await runCase(String(i), model, "crew", "signed", () => ai(model, false).runAgentCrew({
    root, hosts: { childHost: L.createNoopAgentHost() }, signer: keys.signer, generation: generation(CAPS.crew),
    policy: { budget: { maxIterations: 5, maxWallTimeMs: 180000 } },
  }), async ({ result, answer, ok }) => {
    const receipts = result?.receipts ?? [];
    const chain = receipts.length ? await L.verifyChain(receipts, keys.keySet, { requireClosure: true }) : null;
    return { receiptCount: receipts.length, chainClosed: (chain?.ok ?? false) && !result?.receiptError,
      childExecuted: (result?.perAgent ?? []).some((row) => row.id === "researcher"),
      correct: ok && (result?.perAgent ?? []).some((row) => row.id === "researcher") && answer.includes("30") && answer.includes("[policy-refund]") };
  });
}

const latencyBodies = new Map();
async function latencyItem(model, i) {
  const request = intent("Reply only pong.", [], CAPS.latency);
  if (!latencyBodies.has(model)) latencyBodies.set(model, await captureBody(model, request));
  const directBody = latencyBodies.get(model);
  const arms = ["direct", "unsigned", "signed"];
  const rotation = (i + COUNTS.warmups) % 3;
  for (const arm of [...arms.slice(rotation), ...arms.slice(0, rotation)]) {
    await runCase(String(i), model, i < 0 ? "latency-warmup" : "latency", arm,
      () => { control.active.expectedBody = directBody; return arm === "direct" ? directCall(ctx, directBody) : ai(model, arm === "signed").run(request); },
      ({ answer, ok }) => ({ correct: ok && answer.trim().toLowerCase() === "pong" }));
  }
}

// ---- stage B / smoke -----------------------------------------------------------------------

function citationRows(file, count) {
  return readFileSync(resolve(CACHE, "citation-split", file), "utf8").trim().split("\n").map(JSON.parse).slice(0, count);
}
// Only the contract arm runs live. The prompt-only arm sends an identical request, so its
// outcome is derived offline from the same retained raw answer (promptOnlyFormatValid).
async function citationItem(model, row, idPrefix = "") {
  const { ids, request } = citationRequest(row);
  await runCase(idPrefix + row.id, model, "citations", "contract", () => ai(model).run(request), ({ answer, rawAnswer, ok }) => {
    const parsed = parseCited(ok ? answer : rawAnswer, ids);
    return { formatValid: parsed.valid, parsed: parsed.valid, usableAnswer: ok && parsed.valid, citationCount: parsed.value?.citations?.length ?? 0,
      promptOnlyFormatValid: parseCited(rawAnswer, ids).valid };
  });
}

try {
  if (MODE !== "smoke") requireGates(ctx, ["smoke-citations", "smoke-judge"]);
  if (MODE === "C") requireGates(ctx, ["smoke-citations"]);
  // One signing key per stage, reused on resume; the public trust anchor is published with the results.
  const keyPath = join(dirs.priv, STAGE + "-signing-key.json"), trustPath = join(dirs.out, STAGE + "-public-key.json");
  if (!existsSync(keyPath) || !existsSync(trustPath)) {
    const pair = await L.generateEd25519KeyPairJwk();
    writeJSON(keyPath, { kid: "paid-" + STAGE, ...pair });
    writeJSON(trustPath, { kid: "paid-" + STAGE, publicKeyJwk: pair.publicKeyJwk, state: "active" });
  }
  const signing = readJSON(keyPath), trust = readJSON(trustPath);
  if (jsonHash(trust.publicKeyJwk) !== jsonHash(signing.publicKeyJwk)) throw new Error("Trust anchor differs from the signing key.");
  keys = { signer: L.createInMemorySigner(signing.privateKeyJwk, { kid: signing.kid, publicKeyJwk: signing.publicKeyJwk }),
    keySet: L.createMemoryKeySet([trust]) };

  // Plan the stage: row counts and the worst-case ceiling.
  let planned, items;
  if (MODE === "C") {
    const T = COUNTS.transport, P = COUNTS.privacy, A = COUNTS.agents, Lt = COUNTS.latency + COUNTS.warmups;
    const imageBody = await captureBody(TESTED_MODELS[0], intent("Name the solid color in the attached image.", [L.artifact.image("data:image/png;base64," + png([255, 0, 0]).toString("base64"), { id: "fixture", mediaType: "image/png" })], CAPS.transport));
    const small = estimateTokens(Buffer.byteLength(imageBody)) + 1000;
    const per = (calls, inputTokens, cap) => TESTED_MODELS.map((model) => ({ model, calls, inputTokens, cap }));
    // Suites run in a fixed order. Each starts only if its own worst case fits what remains; once
    // one is not admitted, no later suite runs. An admitted suite must complete.
    cSuites = [
      { name: "transport", planned: TESTED_MODELS.length * 2 * T, items: per(2 * T, small, CAPS.transport),
        run: async () => { for (let i = 0; i < T; i++) for (const model of TESTED_MODELS) if (!control.stopped) await transportItem(model, i); } },
      { name: "privacy", planned: TESTED_MODELS.length * P, items: per(P, small, CAPS.privacy),
        run: async () => { for (let i = 0; i < P; i++) for (const model of TESTED_MODELS) if (!control.stopped) await privacyItem(model, i); } },
      { name: "agents", planned: TESTED_MODELS.length * 2 * A, items: [...per(4 * A, 3000, CAPS.agent), ...per(6 * A, 3000, CAPS.crew)],
        run: async () => { for (let i = 0; i < A; i++) for (const model of TESTED_MODELS) if (!control.stopped) { await agentItem(model, i); await crewItem(model, i); } } },
      { name: "latency", planned: TESTED_MODELS.length * 3 * Lt, items: per(3 * Lt, small, CAPS.latency),
        run: async () => { for (let i = -COUNTS.warmups; i < COUNTS.latency; i++) for (const model of TESTED_MODELS) if (!control.stopped) await latencyItem(model, i); } },
    ];
    planned = cSuites[0].planned;
    items = cSuites[0].items;
  } else {
    const rows = MODE === "smoke" ? citationRows("dev.jsonl", 1) : citationRows("evaluation.jsonl", COUNTS.questions);
    planned = rows.length * TESTED_MODELS.length;
    const bytes = Math.max(...await Promise.all(rows.map(async (row) => Buffer.byteLength(await captureBody(TESTED_MODELS[0], citationRequest(row).request)))));
    items = TESTED_MODELS.map((model) => ({ model, calls: rows.length, inputTokens: estimateTokens(bytes), cap: CAPS.B }));
  }
  await admitStage(ctx, ceilingFor(ctx.snapshot, items), { planned, ...(cSuites ? { suite: cSuites[0].name } : {}) });
  admittedOk = true;

  out = existsSync(OUT) ? readJSON(OUT) : { version: "paid-validated/v1", stage: STAGE, protocolHash: ctx.protocolHash, trustAnchorHash: jsonHash(trust), rows: [] };
  if (out.protocolHash !== ctx.protocolHash || out.trustAnchorHash !== jsonHash(trust)) throw new Error("Protocol or trust anchor mismatch; archive the old results first.");
  for (const row of out.rows) if (row.status === "started") Object.assign(row, { status: "interrupted", error: "Interrupted after start; retained without retry." });
  if (existsSync(PRIVATE)) privateRows = readJSON(PRIVATE);
  save();

  if (MODE === "smoke") {
    for (const row of citationRows("dev.jsonl", 1)) for (const model of TESTED_MODELS) await citationItem(model, row, "dev-");
  } else if (MODE === "B") {
    for (const row of citationRows("evaluation.jsonl", COUNTS.questions)) for (const model of TESTED_MODELS) if (!control.stopped) await citationItem(model, row);
  } else {
    for (const [index, suite] of cSuites.entries()) {
      if (control.stopped) break;
      if (index > 0) {
        const ceilingUsd = ceilingFor(ctx.snapshot, suite.items);
        const account = await accountSnapshot(ctx.transport, ctx.key);
        suite.admission = { at: account.at, ceilingUsd, remainingUsd: ctx.budget.remainingUsd, balanceUsd: account.balanceUsd, admitted: ctx.budget.admit(ceilingUsd, account.balanceUsd) };
        if (!suite.admission.admitted) break;
      } else suite.admission = { admitted: true, admittedWithStage: true };
      cPlanned += suite.planned;
      await suite.run();
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
    const rows = out?.rows ?? [];
    // Stage C's denominator is the admitted suites; suites never admitted are recorded, not failed.
    const planned = MODE === "C" ? Math.max(cPlanned, cSuites[0].planned)
      : (MODE === "smoke" ? 1 : COUNTS.questions) * TESTED_MODELS.length;
    const extra = MODE === "C" ? { suites: cSuites.map(({ name, planned: p, admission }) => ({ name, planned: p, admission: admission ?? { admitted: false, reason: "an earlier suite was not admitted or the stage stopped" } })) } : {};
    const finished = await finishStage(ctx, { planned, attempted: rows.length, respondedCount: rows.filter(responded).length, extra });
    if (MODE === "smoke" && out) {
      const verdict = smokeVerdict(out.rows);
      const receiptProblems = out.rows.filter((r) => !r.receipt?.verified).map((r) => r.id + ": receipt did not verify");
      const problems = [...verdict.problems, ...receiptProblems, ...(finished.complete ? [] : ["smoke did not complete"])];
      writeJSON(join(dirs.out, "smoke-citations.json"), { ...out, pass: problems.length === 0, problems, protocolHash: ctx.protocolHash });
      console.log(JSON.stringify({ smoke: "citations", pass: problems.length === 0, problems }));
    }
    if (finished.stopped && !process.exitCode) process.exitCode = 1;
    console.log(JSON.stringify({ stage: STAGE, complete: finished.complete, planned: finished.planned, attempted: finished.attempted, responded: finished.responded, stopped: finished.stopped }));
    if (MODE === "smoke" && out && !finished.complete) process.exitCode = 1;
  }
  ctx.release();
}
