// Real local-model runs through Lattice's OpenAI-compatible adapter.
// Ollama must already be serving MODEL (default llama3.2:3b).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  L, RESULTS, MODEL, directChat, hardware, makeKeys, provider, receiptBytes,
  containsMarker, stats, writeJSON, fingerprintArtifactValue,
} from "./lib.mjs";

// The answer cites the clause inline as [policy-refund] and carries no
// structured citation list. The default mustCite reads only such a list, so
// the inline marker counts only with inline: true.
const CITE_OPTIONS = { inline: true };

const keys = await makeKeys();
const httpLog = [];
const out = {
  env: {
    ...hardware(),
    mustCiteOptions: CITE_OPTIONS,
    latticeCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  },
  note: "temperature and max_tokens are injected by a fetch wrapper because createOpenAICompatibleProvider does not send them.",
  overhead: [],
  workloads: [],
  drift: [],
  replay: [],
  policy: [],
  agent: null,
  crew: null,
  sequential: null,
  multimodal: {
    ran: false,
    reason: "After llama3.2:3b was loaded, free memory was about 2 GiB. A second vision model was not loaded.",
  },
};

function ai(temp, maxTokens, signer) {
  return L.createAI({
    providers: [provider(temp, maxTokens, httpLog)],
    ...(signer ? { signer } : {}),
  });
}

async function timeRun(run) {
  const before = httpLog.length;
  const t0 = performance.now();
  const result = await run();
  const wallMs = performance.now() - t0;
  const calls = httpLog.slice(before);
  const httpMs = calls.reduce((s, c) => s + c.httpMs, 0);
  return { result, wallMs, httpMs, calls };
}

function summarizeResult(timed) {
  const { result, wallMs, httpMs } = timed;
  const receipt = result?.receipt ?? null;
  const err = result?.ok === false ? (result.error?.message ?? result.error?.kind ?? "not-ok") : null;
  return {
    ok: result?.ok === true,
    error: typeof err === "string" ? err.slice(0, 300) : null,
    errorKind: result?.error?.kind ?? null,
    wallMs: +wallMs.toFixed(3),
    httpMs: +httpMs.toFixed(3),
    outsideHttpMs: +Math.max(0, wallMs - httpMs).toFixed(3),
    outsideHttpPct: wallMs > 0 ? +((100 * (wallMs - httpMs)) / wallMs).toFixed(3) : null,
    promptChars: timed.calls.reduce((s, c) => s + (c.promptChars ?? 0), 0),
    usage: result?.usage ?? result?.plan?.usage ?? null,
    output: result?.ok ? result.outputs : null,
    receiptBytes: receiptBytes(receipt),
    receipt: receipt,
    contractVerdict: result?.plan?.contractVerdict ?? result?.contractVerdict ?? null,
  };
}

const SHORT = "Reply with the single word pong.";
console.log("overhead arm");
for (let i = 0; i < 5; i++) {
  const plain = await directChat(SHORT, 0, 8);
  const unsigned = summarizeResult(await timeRun(() => ai(0, 8, null).run({
    task: SHORT,
    artifacts: [],
    outputs: { answer: "text" },
  })));
  const signed = summarizeResult(await timeRun(() => ai(0, 8, keys.signer).run({
    task: SHORT,
    artifacts: [],
    outputs: { answer: "text" },
  })));
  out.overhead.push({
    i,
    plainMs: +plain.httpMs.toFixed(3),
    plainUsage: plain.usage,
    unsignedMs: unsigned.wallMs,
    unsignedHttpMs: unsigned.httpMs,
    unsignedOutsidePct: unsigned.outsideHttpPct,
    unsignedPromptChars: unsigned.promptChars,
    signedMs: signed.wallMs,
    signedHttpMs: signed.httpMs,
    signedOutsidePct: signed.outsideHttpPct,
    signedPromptChars: signed.promptChars,
    receiptBytes: signed.receiptBytes,
    unsignedOk: unsigned.ok,
    signedOk: signed.ok,
    signedError: signed.error,
  });
  console.log(`overhead ${i} plain ${plain.httpMs.toFixed(0)} unsigned ${unsigned.wallMs.toFixed(0)} signed ${signed.wallMs.toFixed(0)} ok ${signed.ok}`);
}

const POLICY = [
  "Refunds are allowed within 30 days of delivery.",
  "The clause id is policy-refund.",
  "Exchanges need a receipt.",
].join(" ");

const ragTask = "Using only the policy text, answer in one sentence and cite it as [policy-refund]. What is the refund window?";

async function ragOnce(tag, temperature) {
  const timed = await timeRun(() => ai(temperature, 80, keys.signer).run({
    task: ragTask,
    artifacts: [L.artifact.text(POLICY, { label: "policy-refund" })],
    outputs: { answer: "text" },
    contract: L.contract({ invariants: [L.inv.mustCite("policy-refund", CITE_OPTIONS)] }),
    policy: { privacy: "standard", maxCostUsd: 1 },
  }));
  const row = summarizeResult(timed);
  const answer = row.output?.answer ?? "";
  const cited = typeof answer === "string" && answer.includes("policy-refund");
  return {
    tag,
    temperature,
    ok: row.ok,
    error: row.error,
    errorKind: row.errorKind,
    wallMs: row.wallMs,
    httpMs: row.httpMs,
    outsideHttpPct: row.outsideHttpPct,
    promptChars: row.promptChars,
    answer,
    cited,
    mustCitePassed: row.ok,
    receiptBytes: row.receiptBytes,
    usage: row.usage,
    receipt: row.receipt,
    artifacts: [L.artifact.text(POLICY, { label: "policy-refund" })],
  };
}

console.log("rag");
const rag0 = [];
for (let i = 0; i < 3; i++) rag0.push(await ragOnce(`rag-t0-${i}`, 0));
const ragHot = [];
for (let i = 0; i < 3; i++) ragHot.push(await ragOnce(`rag-t07-${i}`, 0.7));
out.workloads.push(...rag0.map(publicRow), ...ragHot.map(publicRow));

function norm(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}
function driftBlock(rows, temperature) {
  const answers = rows.map((r) => r.answer ?? "");
  const exact = answers.every((a) => a === answers[0]);
  const normalized = answers.every((a) => norm(a) === norm(answers[0]));
  return {
    temperature,
    n: rows.length,
    exactMatch: exact,
    normalizedMatch: normalized,
    uniqueExact: new Set(answers).size,
    cited: rows.filter((r) => r.cited).length,
    mustCitePassed: rows.filter((r) => r.mustCitePassed).length,
    answers,
  };
}
out.drift.push(driftBlock(rag0, 0), driftBlock(ragHot, 0.7));
console.log("drift", JSON.stringify(out.drift.map((d) => ({ t: d.temperature, exact: d.exactMatch, unique: d.uniqueExact, cited: d.cited }))));

const TICKET = [
  "Customer Jamie Lee wrote from jamie.lee@example.com.",
  "Phone 415-555-0134.",
  "SSN 219-09-9999 was read back from the form.",
  "Order id 100384 is not an SSN.",
  "Please confirm the refund. Marker ZWQ-MARKER-9c1e4b.",
].join(" ");
const MARKERS = ["jamie.lee@example.com", "415-555-0134", "219-09-9999", "ZWQ-MARKER-9c1e4b"];

const inputHits = L.defaultPiiDetectors.map((d) => ({ name: d.name, ...d.detect(TICKET) }));
console.log("ticket detectors", inputHits.filter((h) => h.matched).map((h) => h.name));

const ticketTimed = await timeRun(() => ai(0, 80, keys.signer).run({
  task: "Reply in one sentence. Do not repeat phone numbers, emails, or SSNs. Confirm whether a refund can be reviewed.",
  artifacts: [L.artifact.text(TICKET, { label: "ticket", privacy: "sensitive" })],
  outputs: { answer: "text" },
  contract: L.contract({ invariants: [L.inv.noPII("answer")] }),
  policy: { privacy: "sensitive", maxCostUsd: 1 },
}));
const ticket = summarizeResult(ticketTimed);
const ticketAnswer = ticket.output?.answer ?? "";
const answerHits = L.defaultPiiDetectors.map((d) => ({ name: d.name, ...d.detect(String(ticketAnswer)) }));
const signedScan = containsMarker(ticket.receipt ?? "", MARKERS);
out.policy.push({
  id: "support-ticket",
  inputDetectorHits: inputHits.filter((h) => h.matched).map((h) => h.name),
  ok: ticket.ok,
  errorKind: ticket.errorKind,
  error: ticket.error,
  answerHasInScopePII: answerHits.some((h) => h.matched),
  answerDetectors: answerHits.filter((h) => h.matched).map((h) => h.name),
  signedMarkerLeak: signedScan.leak,
  signedMarkerHits: signedScan.hits,
  wallMs: ticket.wallMs,
  httpMs: ticket.httpMs,
  outsideHttpPct: ticket.outsideHttpPct,
  receiptBytes: ticket.receiptBytes,
  // The answer is kept only as a length plus a boolean. The ticket text is
  // the script's synthetic fixture, not a public corpus.
  answerChars: String(ticketAnswer).length,
});
out.workloads.push({
  id: "support-ticket",
  kind: "pii-ticket",
  ok: ticket.ok,
  errorKind: ticket.errorKind,
  wallMs: ticket.wallMs,
  httpMs: ticket.httpMs,
  outsideHttpPct: ticket.outsideHttpPct,
  receiptBytes: ticket.receiptBytes,
  requestText: "Reply in one sentence. Do not repeat phone numbers, emails, or SSNs. Confirm whether a refund can be reviewed.",
  responseText: ticketAnswer,
  markers: MARKERS,
});
console.log("ticket", ticket.ok, ticket.errorKind, "answerPII", answerHits.filter((h) => h.matched).map((h) => h.name), "signedLeak", signedScan.leak);

console.log("agent");
const topicSchema = {
  "~standard": {
    version: 1,
    vendor: "lattice-realworld",
    validate(value) {
      if (value && typeof value === "object" && typeof value.topic === "string" && value.topic.length > 0) {
        return { value };
      }
      return { issues: [{ message: "topic string required" }] };
    },
  },
};
const lookup = L.defineTool({
  name: "lookup_policy",
  description: "Look up the refund policy. Call this before answering. Argument: {\"topic\":\"refunds\"}.",
  inputSchema: topicSchema,
  execute(input) {
    return { topic: input.topic, clause: "Refunds are allowed within 30 days. Cite [policy-refund]." };
  },
});
try {
  const timed = await timeRun(() => ai(0, 120, null).runAgent({
    task: "Call lookup_policy with topic refunds, then answer in one sentence citing [policy-refund].",
    tools: [lookup],
    signer: keys.signer,
    contract: L.contract({ budget: { maxIterations: 3, maxWallTimeMs: 180000 } }),
  }));
  const result = timed.result;
  const iterations = result.iterations ?? [];
  const toolCalls = iterations.reduce((n, it) => n + (it.toolCalls?.length ?? 0), 0);
  out.agent = {
    kind: result.kind,
    wallMs: +timed.wallMs.toFixed(3),
    httpMs: +timed.httpMs.toFixed(3),
    outsideHttpPct: timed.wallMs > 0 ? +((100 * (timed.wallMs - timed.httpMs)) / timed.wallMs).toFixed(3) : null,
    iterations: iterations.length,
    toolCalls,
    answer: result.kind === "success" ? result.output?.answer ?? null : null,
    error: result.kind === "success" ? null : (result.message ?? result.kind),
    receiptCount: (result.receipt ? 1 : 0) + iterations.filter((it) => it.receipt).length,
    receiptBytes: receiptBytes(result.receipt ?? iterations.find((it) => it.receipt)?.receipt ?? null),
  };
} catch (error) {
  out.agent = { kind: "threw", error: String(error?.message ?? error).slice(0, 400) };
}
console.log("agent", JSON.stringify(out.agent));

console.log("crew");
const accept = {
  "~standard": { version: 1, vendor: "lattice-realworld", validate: (value) => ({ value }) },
};
try {
  const researcher = L.defineAgent({
    id: "researcher",
    intent: "State the refund window in one sentence and cite [policy-refund].",
    tools: [],
    summaryReturnSchema: accept,
  });
  const root = L.defineAgent({
    id: "lead",
    intent: "Call the researcher agent, then answer in one sentence citing [policy-refund].",
    tools: [],
    childAgents: [researcher],
    summaryReturnSchema: accept,
  });
  const timed = await timeRun(() => ai(0, 80, null).runAgentCrew({
    root,
    hosts: { childHost: L.createNoopAgentHost() },
    signer: keys.signer,
    policy: { budget: { maxIterations: 4, maxWallTimeMs: 180000 } },
  }));
  const result = timed.result;
  const receipts = result.receipts ?? [];
  const chain = receipts.length
    ? await L.verifyChain(receipts, keys.keySet, { requireClosure: true })
    : null;
  out.crew = {
    wallMs: +timed.wallMs.toFixed(3),
    httpMs: +timed.httpMs.toFixed(3),
    parentKind: result.result?.kind ?? null,
    perAgent: result.perAgent ?? [],
    totalIterations: result.totalIterations ?? null,
    receiptCount: receipts.length,
    chainClosure: chain
      ? { ok: chain.ok === true, count: chain.ok ? chain.count : null, errorKind: chain.ok ? null : chain.error?.kind ?? null }
      : null,
    answer: result.result?.kind === "success" ? result.result.output?.answer ?? null : null,
    error: result.result?.kind === "success" ? null : (result.result?.message ?? result.result?.kind ?? null),
  };
} catch (error) {
  out.crew = { kind: "threw", error: String(error?.message ?? error).slice(0, 500) };
}
console.log("crew", JSON.stringify({ kind: out.crew.parentKind ?? out.crew.kind, iters: out.crew.totalIterations, receipts: out.crew.receiptCount, err: out.crew.error }));

console.log("sequential");
const step1 = summarizeResult(await timeRun(() => ai(0, 60, keys.signer).run({
  task: "Extract the refund window as one sentence and include [policy-refund].",
  artifacts: [L.artifact.text(POLICY, { label: "policy-refund" })],
  outputs: { answer: "text" },
})));
const step2 = summarizeResult(await timeRun(() => ai(0, 60, keys.signer).run({
  task: "Using the note, tell the customer the refund window in one sentence and cite [policy-refund].",
  artifacts: [L.artifact.text(String(step1.output?.answer ?? ""), { label: "note" })],
  outputs: { answer: "text" },
  contract: L.contract({ invariants: [L.inv.mustCite("policy-refund", CITE_OPTIONS)] }),
})));
out.sequential = {
  steps: [
    { ok: step1.ok, wallMs: step1.wallMs, httpMs: step1.httpMs, outsideHttpPct: step1.outsideHttpPct, answer: step1.output?.answer ?? null, receiptBytes: step1.receiptBytes },
    { ok: step2.ok, errorKind: step2.errorKind, wallMs: step2.wallMs, httpMs: step2.httpMs, outsideHttpPct: step2.outsideHttpPct, answer: step2.output?.answer ?? null, receiptBytes: step2.receiptBytes },
  ],
};
out.workloads.push({
  id: "sequential-support",
  kind: "sequential",
  requestText: ragTask,
  responseText: step2.output?.answer ?? step1.output?.answer ?? "",
  ok: step2.ok,
  wallMs: step1.wallMs + step2.wallMs,
  httpMs: step1.httpMs + step2.httpMs,
});

console.log("replay");
const replaySources = [...rag0, ...ragHot].filter((r) => r.receipt);
for (const src of replaySources) {
  const row = { tag: src.tag, verified: false, materialized: false, replayOk: false, outputHashMatch: false, alteredDetected: false, error: null };
  try {
    const body = JSON.parse(Buffer.from(src.receipt.payload, "base64"));
    row.verified = (await L.verifyReceipt(src.receipt, keys.keySet)).ok === true;
    const byHash = {};
    const artifacts = src.artifacts ?? [];
    for (let i = 0; i < body.inputHashes.length; i++) {
      if (artifacts[i]) byHash[body.inputHashes[i]] = artifacts[i];
    }
    const envl = await L.materializeReplayEnvelope(src.receipt, {
      keySet: keys.keySet,
      artifactLoader: async (h) => {
        if (!byHash[h]) throw new Error("missing " + h);
        return byHash[h];
      },
      outputs: src.answer !== undefined ? { answer: src.answer } : {},
      task: ragTask,
    });
    row.materialized = true;
    const rep = await L.replayOffline(envl);
    row.replayOk = rep.ok === true;
    const fp = (await fingerprintArtifactValue(rep.outputs))?.value ?? null;
    row.outputHashMatch = fp === body.outputHash;
    const alt = { answer: String(src.answer ?? "x").slice(0, -1) + "Q" };
    row.alteredDetected = ((await fingerprintArtifactValue(alt))?.value ?? null) !== body.outputHash;
  } catch (error) {
    row.error = String(error?.message ?? error).slice(0, 300);
  }
  delete src.receipt;
  delete src.artifacts;
  out.replay.push(row);
  console.log("replay", row.tag, row.verified, row.outputHashMatch, row.error);
}

// Persist one signed receipt from the first successful RAG run for the
// comparison harness. Rebuild it: the receipt object was deleted after replay
// only on the in-memory row. Re-read is unnecessary; comparison uses workloads.
out.overheadSummary = {
  n: out.overhead.length,
  plain: stats(out.overhead.map((r) => r.plainMs)),
  unsigned: stats(out.overhead.map((r) => r.unsignedMs)),
  signed: stats(out.overhead.map((r) => r.signedMs)),
  signedOutsidePct: stats(out.overhead.map((r) => r.signedOutsidePct)),
  unsignedOutsidePct: stats(out.overhead.map((r) => r.unsignedOutsidePct)),
  receiptEnvelope: stats(out.overhead.map((r) => r.receiptBytes?.envelope).filter((n) => n != null)),
};

// A canonical payload every other tool wraps. Synthetic ticket text is included
// so leakage scans see the same bytes. It is not a public corpus.
const canonical = [];
const firstRag = rag0[0];
if (firstRag) {
  canonical.push({
    id: "rag",
    requestText: `${ragTask}\n\n${POLICY}`,
    responseText: firstRag.answer ?? "",
  });
}
canonical.push({
  id: "support-ticket",
  requestText: TICKET,
  responseText: ticketAnswer || "Refund review can proceed.",
  markers: MARKERS,
});
if (out.sequential?.steps?.[1]?.answer) {
  canonical.push({
    id: "sequential",
    requestText: POLICY,
    responseText: out.sequential.steps[1].answer,
  });
}
writeFileSync(resolve(RESULTS, "payloads.json"), JSON.stringify({ model: MODEL, markers: MARKERS, runs: canonical }, null, 2));

// Drop bulky receipt objects before writing the public results file.
for (const row of rag0.concat(ragHot)) {
  delete row.receipt;
  delete row.artifacts;
}
writeJSON("live.json", out);
console.log("LIVE_DONE", JSON.stringify(out.overheadSummary));

function publicRow(row) {
  return {
    id: row.tag,
    kind: "rag",
    temperature: row.temperature,
    ok: row.ok,
    errorKind: row.errorKind,
    wallMs: row.wallMs,
    httpMs: row.httpMs,
    outsideHttpPct: row.outsideHttpPct,
    promptChars: row.promptChars,
    cited: row.cited,
    mustCitePassed: row.mustCitePassed,
    receiptBytes: row.receiptBytes,
    answer: row.answer,
  };
}
