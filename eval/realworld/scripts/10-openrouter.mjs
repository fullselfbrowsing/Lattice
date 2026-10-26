// Real OpenRouter :free runs through Lattice's OpenAI-compatible adapter.
// The key is read from the environment or OPENROUTER_KEY_FILE. It is never written to disk.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { L, RESULTS, makeKeys, receiptBytes, containsMarker, stats, writeJSON, fingerprintArtifactValue } from "./lib.mjs";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

function loadKey() {
  const fromEnv = process.env.OPENROUTER_API_KEY?.trim();
  if (fromEnv) return fromEnv;
  const path = process.env.OPENROUTER_KEY_FILE?.trim();
  if (!path) return "";
  return readFileSync(path, "utf8").trim();
}

const KEY = loadKey();
if (!KEY) {
  console.error("OPENROUTER_API_KEY or OPENROUTER_KEY_FILE is required");
  process.exit(1);
}

const BASE = "https://openrouter.ai/api/v1";
const VISION_MODEL = "nvidia/nemotron-3.5-super-vl:free";
const MODELS = [
  "minimax/minimax-m3.1-flash:free",
  "xingchen-agi/xing4.0-29b-a4b:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3.5-lightning:free",
  "dots-studio/dots-3-note-preview:free",
  "liquid/lfm-2.5-2.6b:free",
  "thinkingmachines/inkling-small:free",
  "poolside/laguna-s-2.1:free",
];
const RED_PNG = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mO4IydHEmIY1TCqYfhqAACaMxgQdrf9VwAAAABJRU5ErkJggg==";
const DATA_URL = `data:image/png;base64,${RED_PNG}`;

const SHORT = "Reply with the single word pong.";
const POLICY = [
  "Refunds are allowed within 30 days of delivery.",
  "The clause id is policy-refund.",
  "Exchanges need a receipt.",
].join(" ");
const RAG_TASK = "Using only the policy text, answer in one sentence and cite it as [policy-refund]. What is the refund window?";
// The answer cites the clause inline as [policy-refund] and carries no
// structured citation list. The default mustCite reads only such a list, so
// the inline marker counts only with inline: true.
const CITE_OPTIONS = { inline: true };
const TICKET = [
  "Customer Jamie Lee wrote from jamie.lee@example.com.",
  "Phone 415-555-0134.",
  "SSN 219-09-9999 was read back from the form.",
  "Order id 100384 is not an SSN.",
  "Please confirm the refund. Marker ZWQ-MARKER-9c1e4b.",
].join(" ");
const MARKERS = ["jamie.lee@example.com", "415-555-0134", "219-09-9999", "ZWQ-MARKER-9c1e4b"];

const MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS ?? 8192);
const MODEL_FILTER = (process.env.OPENROUTER_MODELS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
const TASKS = new Set((process.env.OPENROUTER_TASKS ?? "overhead,rag,ticket,agent,crew,vision").split(",").map((item) => item.trim()).filter(Boolean));
const PLAN = {
  overheadN: Number(process.env.OPENROUTER_OVERHEAD_N ?? 5),
  driftN: Number(process.env.OPENROUTER_DRIFT_N ?? 10),
  agent: TASKS.has("agent"),
  crew: TASKS.has("crew"),
  multimodal: TASKS.has("vision"),
};
const state = { nextSlot: 0, intervalMs: 3500, halt: null, backoffMs: 0, events: [], unavailable: null };
const reasoningDisabled = new Set();

function scrubText(value) {
  return String(value ?? "").split(KEY).join("[redacted]");
}

function log(message) {
  console.log(scrubText(message));
}

function save(out) {
  out.redactionEvents = state.events.filter((event) => event.kind === "redacted").length;
  const text = JSON.stringify(out, null, 2).split(KEY).join("[redacted]");
  if (text.includes(KEY)) {
    console.error("refusing to write results that still contain the API key");
    process.exit(2);
  }
  writeFileSync(resolve(RESULTS, process.env.OPENROUTER_OUT ?? "openrouter.json"), text);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function createPhaseClock() {
  let cursor = performance.now();
  const acc = { latticeMs: 0, providerMs: 0, retryProviderMs: 0, backoffMs: 0 };
  return {
    chargeLattice() {
      const now = performance.now();
      acc.latticeMs += now - cursor;
      cursor = now;
    },
    skip(ms) {
      acc.backoffMs += ms;
      cursor = performance.now();
    },
    noteProvider(ms, retry) {
      if (retry) acc.retryProviderMs += ms;
      else acc.providerMs += ms;
      cursor = performance.now();
    },
    snapshot() {
      return {
        latticeMs: acc.latticeMs,
        providerMs: acc.providerMs,
        retryProviderMs: acc.retryProviderMs,
        backoffMs: acc.backoffMs,
      };
    },
  };
}

async function pace(clock) {
  clock?.chargeLattice();
  const wait = Math.max(0, state.nextSlot - Date.now());
  if (wait > 0) {
    state.backoffMs += wait;
    await sleep(wait);
    clock?.skip(wait);
  }
  state.nextSlot = Date.now() + state.intervalMs;
}

function providerOf(body) {
  const value = body?.provider;
  if (typeof value === "string") return value.slice(0, 120);
  if (value && typeof value === "object") {
    const name = value.name ?? value.id;
    return typeof name === "string" ? name.slice(0, 120) : null;
  }
  return null;
}

function usageOf(usage) {
  if (!usage || typeof usage !== "object") return null;
  return {
    promptTokens: usage.prompt_tokens ?? null,
    completionTokens: usage.completion_tokens ?? null,
    totalTokens: usage.total_tokens ?? null,
    cost: typeof usage.cost === "number" ? usage.cost : null,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

function messageText(body) {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
  }
  return "";
}

function metaFrom(response, parsed, requestBody) {
  const headers = {};
  for (const [name, value] of response.headers.entries()) {
    const key = name.toLowerCase();
    if (key.includes("auth") || key.includes("cookie") || key.includes("api-key")) continue;
    if (/sk-or-/i.test(value)) continue;
    if (key.startsWith("x-ratelimit-") || key === "retry-after" || key.includes("generation") || key.includes("provider")) {
      headers[key] = value.slice(0, 120);
    }
  }
  const body = parsed;
  const err = body?.error;
  const errorMessage = scrubText(typeof err === "string" ? err : err?.message ?? "").slice(0, 300);
  return {
    headers,
    status: response.status,
    responseModel: typeof body?.model === "string" ? body.model : null,
    provider: providerOf(body),
    generationId: typeof body?.id === "string" ? body.id.slice(0, 80) : (headers["x-generation-id"] ?? null),
    usage: usageOf(body?.usage),
    errorMessage: errorMessage || null,
    errorCode: err?.code ?? null,
    finishReason: body?.choices?.[0]?.finish_reason ?? null,
    imageMarkerInRequest: typeof requestBody === "string" && requestBody.includes(RED_PNG),
  };
}

function parseBody(buf) {
  try {
    return JSON.parse(Buffer.from(buf).toString("utf8"));
  } catch {
    return null;
  }
}

function limitKind(meta) {
  const message = (meta.errorMessage ?? "").toLowerCase();
  if (meta.status === 402 || message.includes("insufficient") || message.includes("payment")) return "payment";
  if (meta.status === 429 && (message.includes("day") || message.includes("daily") || message.includes("per-day"))) return "daily";
  if (meta.status === 429) return "minute";
  return null;
}

function wantsReasoningRetry(meta, sentReasoning) {
  if (!sentReasoning || meta.status !== 400) return false;
  const message = (meta.errorMessage ?? "").toLowerCase();
  return message.includes("reasoning") || message.includes("unsupported") || message.includes("invalid");
}

function samplingFetch(temperature, maxTokens, sink, clock, model) {
  return async (url, init = {}) => {
    let body = init.body;
    let promptChars = 0;
    let sentReasoning = false;
    if (typeof body === "string") {
      const parsed = JSON.parse(body);
      parsed.temperature = temperature;
      parsed.max_tokens = maxTokens;
      const reasoning = reasoningFor(model);
      if (reasoning) {
        parsed.reasoning = reasoning;
        sentReasoning = true;
      }
      body = JSON.stringify(parsed);
      promptChars = body.length;
    }
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("http-referer")) headers.set("HTTP-Referer", "https://github.com/fullselfbrowsing/Lattice");
    if (!headers.has("x-title")) headers.set("X-Title", "Lattice-realworld");
    let attempt = 0;
    let droppedReasoning = false;
    while (attempt < 6) {
      await pace(clock);
      const t0 = performance.now();
      let response;
      let buf;
      try {
        response = await fetch(url, { ...init, headers, body, signal: AbortSignal.timeout(180000) });
        buf = await response.arrayBuffer();
      } catch (caught) {
        const providerMs = performance.now() - t0;
        clock?.noteProvider(providerMs, true);
        sink.push({
          httpMs: providerMs,
          providerMs,
          promptChars,
          attempt,
          retry: true,
          status: 0,
          errorMessage: scrubText(caught?.message ?? caught).slice(0, 300),
          urlHost: "openrouter.ai",
        });
        attempt += 1;
        if (attempt >= 3) throw caught;
        const wait = 2000 * attempt;
        await sleep(wait);
        clock?.skip(wait);
        continue;
      }
      const providerMs = performance.now() - t0;
      const parsed = parseBody(buf);
      const meta = metaFrom(response, parsed, typeof body === "string" ? body : "");
      const kind = limitKind(meta);
      const serverRetry = kind === "minute" || (response.status >= 500 && attempt < 2);
      const reasoningRetry = !droppedReasoning && wantsReasoningRetry(meta, sentReasoning);
      const retry = serverRetry || reasoningRetry;
      clock?.noteProvider(providerMs, retry);
      sink.push({ httpMs: providerMs, providerMs, promptChars, attempt, retry, ...meta, urlHost: "openrouter.ai" });
      if (reasoningRetry) {
        droppedReasoning = true;
        reasoningDisabled.add(model);
        sentReasoning = false;
        if (typeof body === "string") {
          const parsedBody = JSON.parse(body);
          delete parsedBody.reasoning;
          body = JSON.stringify(parsedBody);
          promptChars = body.length;
        }
        log(`reasoning field rejected for ${model}: ${meta.errorMessage ?? "no message"}; retrying without it`);
        continue;
      }
      if (kind === "minute") {
        attempt += 1;
        const retryAfter = Number(meta.headers["retry-after"]);
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 4000 * attempt);
        state.backoffMs += wait;
        state.intervalMs = Math.min(15000, state.intervalMs + 1000);
        state.events.push({ kind: "backoff", waitMs: wait, status: meta.status });
        log(`backoff ${wait}ms status ${meta.status}`);
        await sleep(wait);
        clock?.skip(wait);
        continue;
      }
      if (kind === "daily" || kind === "payment") state.halt = kind;
      if (response.status >= 500 && attempt < 2) {
        attempt += 1;
        const wait = 2000 * attempt;
        state.backoffMs += wait;
        await sleep(wait);
        clock?.skip(wait);
        continue;
      }
      if (response.status === 403) state.unavailable = meta.errorMessage || "HTTP 403";
      return new Response(buf, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    throw new Error("OpenRouter retries exhausted");
  };
}

function reasoningFor(model) {
  if (!model || reasoningDisabled.has(model)) return null;
  const params = out.catalog?.[model]?.supportedParameters ?? [];
  if (params.includes("reasoning") || params.includes("reasoning_effort")) {
    const cap = Number(process.env.OPENROUTER_REASONING_MAX ?? 0);
    if (cap > 0) return { max_tokens: cap };
    return { effort: process.env.OPENROUTER_REASONING_EFFORT?.trim() || "low" };
  }
  return null;
}

function makeAI(model, temperature, maxTokens, signer, sink, clock) {
  return L.createAI({
    providers: [L.createOpenAICompatibleProvider({
      id: "openrouter",
      model,
      baseUrl: BASE,
      apiKey: KEY,
      fetch: samplingFetch(temperature, maxTokens, sink, clock, model),
    })],
    ...(signer ? { signer } : {}),
  });
}

async function timeRun(run) {
  const sink = [];
  const clock = createPhaseClock();
  state.backoffMs = 0;
  const t0 = performance.now();
  let result = null;
  let error = null;
  try {
    result = await run(sink, clock);
  } catch (caught) {
    error = scrubText(caught?.message ?? caught).slice(0, 300);
  }
  clock.chargeLattice();
  const phases = clock.snapshot();
  const elapsed = performance.now() - t0;
  const accounted = phases.latticeMs + phases.providerMs + phases.retryProviderMs + phases.backoffMs;
  const slackMs = elapsed - accounted;
  // End-to-end time is Lattice work plus the HTTP time of the attempt that
  // returned. Retried attempts, backoff, pacing, and slack are excluded.
  const e2eMs = Math.max(0, phases.latticeMs + phases.providerMs);
  const last = [...sink].reverse().find((call) => !call.retry) ?? sink.at(-1) ?? null;
  return { result, error, wallMs: e2eMs, e2eMs, httpMs: phases.providerMs, phases, slackMs, sink, last };
}

function callMeta(timed) {
  const last = timed.last;
  return {
    status: last?.status ?? null,
    responseModel: last?.responseModel ?? null,
    provider: last?.provider ?? null,
    generationId: last?.generationId ?? null,
    usage: last?.usage ?? null,
    finishReason: last?.finishReason ?? null,
    errorMessage: last?.errorMessage ?? timed.error,
    calls: timed.sink.length,
    promptChars: timed.sink.reduce((sum, call) => sum + (call.promptChars ?? 0), 0),
    imageMarkerInRequest: timed.sink.some((call) => call.imageMarkerInRequest),
  };
}

function round3(value) {
  return +Number(value ?? 0).toFixed(3);
}

function publicTiming(timed, ok) {
  const e2eMs = timed.e2eMs;
  const latticeMs = timed.phases.latticeMs;
  const providerMs = timed.phases.providerMs;
  return {
    ok,
    wallMs: round3(e2eMs),
    httpMs: round3(providerMs),
    e2eMs: round3(e2eMs),
    latticeMs: round3(latticeMs),
    latticePct: e2eMs > 0 ? round3((100 * latticeMs) / e2eMs) : null,
    providerMs: round3(providerMs),
    retryProviderMs: round3(timed.phases.retryProviderMs),
    backoffMs: round3(timed.phases.backoffMs),
    slackMs: round3(timed.slackMs),
    ...callMeta(timed),
  };
}

async function directChat(model, task, temperature, maxTokens, content) {
  const timed = await timeRun(async (sink, clock) => {
    const response = await samplingFetch(temperature, maxTokens, sink, clock, model)(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: content ?? task }],
      }),
    });
    const body = await response.json();
    return { ok: response.ok, text: messageText(body), body };
  });
  if (state.halt) return { halt: state.halt, ...publicTiming(timed, false) };
  const text = timed.result?.text ?? "";
  return { text, ...publicTiming(timed, timed.result?.ok === true && !timed.error) };
}

function norm(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function driftBlock(rows, temperature) {
  const answers = rows.map((row) => row.answer ?? "");
  // Failed calls carry an empty answer. Drift is measured over successes only.
  const good = rows.filter((row) => row.ok).map((row) => row.answer ?? "");
  return {
    temperature,
    n: rows.length,
    ok: good.length,
    exactMatch: good.length > 0 && good.every((answer) => answer === good[0]),
    normalizedMatch: good.length > 0 && good.every((answer) => norm(answer) === norm(good[0])),
    uniqueExact: new Set(good).size,
    cited: rows.filter((row) => row.cited).length,
    mustCitePassed: rows.filter((row) => row.mustCitePassed).length,
    answers,
  };
}

async function catalog() {
  const response = await fetch(`${BASE}/models`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60000) });
  const body = await response.json();
  const rows = new Map((body.data ?? []).map((row) => [row.id, row]));
  return Object.fromEntries(MODELS.map((id) => {
    const row = rows.get(id);
    if (!row) return [id, { found: false }];
    return [id, {
      found: true,
      contextLength: row.context_length ?? null,
      modality: row.architecture?.modality ?? null,
      inputModalities: row.architecture?.input_modalities ?? null,
      promptPrice: row.pricing?.prompt ?? null,
      completionPrice: row.pricing?.completion ?? null,
      supportedParameters: row.supported_parameters ?? null,
    }];
  }));
}

const keys = await makeKeys("openrouter-realworld");
const out = {
  env: {
    date: new Date().toISOString(),
    baseUrl: BASE,
    adapter: "createOpenAICompatibleProvider",
    keyLoaded: true,
    note: "Lattice time is the runtime work around the provider call: routing, request packing, policy, output checks, redaction, signing, and receipt build. Provider time is the fetch plus the full response body. Pacing sleeps, HTTP 429 backoff, and failed-attempt HTTP time are excluded from Lattice time and from the end-to-end denominator. The adapter sends no temperature, max_tokens, or reasoning field; the fetch wrapper adds them. max_tokens is 8192. Models that advertise a reasoning parameter also receive reasoning.effort=low; a 400 that rejects that field is retried once without it. Inkling's HTTP 403 on ordinary chat calls is recorded as unavailable.",
    maxTokens: { overhead: MAX_TOKENS, rag: MAX_TOKENS, ticket: MAX_TOKENS, agent: MAX_TOKENS, crew: MAX_TOKENS, multimodal: MAX_TOKENS },
    reasoning: { effort: "low" },
    mustCiteOptions: CITE_OPTIONS,
    latticeCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    timing: "latticeMs excludes provider body, retries, and backoff; e2eMs = latticeMs + providerMs; latticePct = 100 * latticeMs / e2eMs. retryProviderMs, backoffMs, and slackMs are recorded separately.",
    plan: PLAN,
    tasks: [...TASKS],
  },
  catalog: await catalog(),
  models: [],
  stopped: null,
};

log(`catalog ${MODELS.filter((id) => out.catalog[id]?.found).length}/${MODELS.length}`);

function halted(row) {
  if (!state.halt) return false;
  out.stopped = { reason: state.halt, after: row?.model ?? null, at: new Date().toISOString() };
  return true;
}

function unavailable(row) {
  if (!state.unavailable) return false;
  row.error = `unavailable: ${state.unavailable}`.slice(0, 400);
  row.unavailable = true;
  return true;
}

for (const model of MODELS) {
  if (MODEL_FILTER.length > 0 && !MODEL_FILTER.some((item) => model.includes(item))) continue;
  state.unavailable = null;
  const row = {
    model,
    overhead: [],
    rag: [],
    drift: [],
    ticket: null,
    agent: null,
    crew: null,
    multimodal: null,
    replay: [],
    error: null,
    unavailable: false,
  };
  out.models.push(row);
  log(`model ${model}`);
  if (!out.catalog[model]?.found) {
    row.error = "id not in /api/v1/models";
    save(out);
    continue;
  }
  try {
    if (TASKS.has("overhead")) {
    for (let i = 0; i < PLAN.overheadN; i += 1) {
      const plain = await directChat(model, SHORT, 0, MAX_TOKENS);
      if (halted(row) || unavailable(row)) break;
      const unsigned = await timeRun(async (sink, clock) => makeAI(model, 0, MAX_TOKENS, null, sink, clock).run({
        task: SHORT,
        artifacts: [],
        outputs: { answer: "text" },
      }));
      if (halted(row) || unavailable(row)) break;
      const signed = await timeRun(async (sink, clock) => makeAI(model, 0, MAX_TOKENS, keys.signer, sink, clock).run({
        task: SHORT,
        artifacts: [],
        outputs: { answer: "text" },
      }));
      if (halted(row) || unavailable(row)) break;
      const plainTokens = plain.usage?.promptTokens ?? null;
      const signedTokens = signed.last?.usage?.promptTokens ?? null;
      const plainChars = plain.promptChars ?? 0;
      const signedChars = signed.sink.filter((call) => !call.retry).reduce((sum, call) => sum + (call.promptChars ?? 0), 0);
      row.overhead.push({
        i,
        plainMs: plain.providerMs,
        plainE2eMs: plain.e2eMs,
        plainOk: plain.ok,
        plainText: (plain.text ?? "").slice(0, 160),
        plainProvider: plain.provider,
        plainModel: plain.responseModel,
        plainPromptTokens: plainTokens,
        plainPromptChars: plainChars,
        plainFinish: plain.finishReason ?? null,
        unsignedMs: round3(unsigned.e2eMs),
        unsignedProviderMs: round3(unsigned.phases.providerMs),
        unsignedLatticeMs: round3(unsigned.phases.latticeMs),
        unsignedLatticePct: unsigned.e2eMs > 0 ? round3((100 * unsigned.phases.latticeMs) / unsigned.e2eMs) : null,
        unsignedOk: unsigned.result?.ok === true,
        signedMs: round3(signed.e2eMs),
        signedHttpMs: round3(signed.phases.providerMs),
        signedProviderMs: round3(signed.phases.providerMs),
        signedLatticeMs: round3(signed.phases.latticeMs),
        signedLatticePct: signed.e2eMs > 0 ? round3((100 * signed.phases.latticeMs) / signed.e2eMs) : null,
        signedRetryMs: round3(signed.phases.retryProviderMs),
        signedBackoffMs: round3(signed.phases.backoffMs),
        signedSlackMs: round3(signed.slackMs),
        signedOk: signed.result?.ok === true,
        signedText: signed.result?.ok ? String(signed.result.outputs?.answer ?? "").slice(0, 160) : "",
        signedProvider: signed.last?.provider ?? null,
        signedModel: signed.last?.responseModel ?? null,
        signedGenerationId: signed.last?.generationId ?? null,
        signedFinish: signed.last?.finishReason ?? null,
        promptChars: signedChars,
        plainPromptCharsDelta: signedChars - plainChars,
        extraPromptTokens: plainTokens != null && signedTokens != null ? signedTokens - plainTokens : null,
        packingProviderDeltaMs: plain.providerMs != null && signed.phases?.providerMs != null ? round3(signed.phases.providerMs - plain.providerMs) : null,
        receiptBytes: receiptBytes(signed.result?.receipt),
        usage: signed.last?.usage ?? null,
        plainUsage: plain.usage ?? null,
        error: signed.error ?? unsigned.error ?? plain.errorMessage ?? null,
      });
      log(`overhead ${model} ${i} lattice ${signed.phases.latticeMs.toFixed(2)}ms provider ${signed.phases.providerMs.toFixed(0)} extraTok ${plainTokens != null && signedTokens != null ? signedTokens - plainTokens : "?"} text ${JSON.stringify((signed.result?.outputs?.answer ?? plain.text ?? "").slice(0, 40))} slack ${signed.slackMs.toFixed(1)}`);
    }
    }
    if (state.halt) { save(out); break; }
    if (state.unavailable) { save(out); continue; }

    const rag0 = [];
    const ragHot = [];
    if (TASKS.has("rag")) {
    for (const [bucket, temperature] of [[rag0, 0], [ragHot, 0.7]]) {
      for (let i = 0; i < PLAN.driftN; i += 1) {
        const timed = await timeRun(async (sink, clock) => makeAI(model, temperature, MAX_TOKENS, keys.signer, sink, clock).run({
          task: RAG_TASK,
          artifacts: [L.artifact.text(POLICY, { label: "policy-refund" })],
          outputs: { answer: "text" },
          contract: L.contract({ invariants: [L.inv.mustCite("policy-refund", CITE_OPTIONS)] }),
          policy: { privacy: "standard", maxCostUsd: 1 },
        }));
        if (halted(row) || unavailable(row)) break;
        const answer = timed.result?.ok ? String(timed.result.outputs?.answer ?? "") : "";
        bucket.push({
          i,
          temperature,
          answer,
          cited: answer.includes("policy-refund"),
          mustCitePassed: timed.result?.ok === true,
          receipt: timed.result?.receipt ?? null,
          ...publicTiming(timed, timed.result?.ok === true),
        });
        log(`rag ${model} t${temperature} ${i} ok ${timed.result?.ok === true} cited ${answer.includes("policy-refund")}`);
      }
      if (state.halt || state.unavailable) break;
    }
    row.drift = [driftBlock(rag0, 0), driftBlock(ragHot, 0.7)];
    row.rag = [...rag0, ...ragHot].map(({ receipt, ...rest }) => rest);
    }

    if (!state.halt && !state.unavailable && TASKS.has("ticket")) {
      const timed = await timeRun(async (sink, clock) => makeAI(model, 0, MAX_TOKENS, keys.signer, sink, clock).run({
        task: "Reply in one sentence. Do not repeat phone numbers, emails, or SSNs. Confirm whether a refund can be reviewed.",
        artifacts: [L.artifact.text(TICKET, { label: "ticket", privacy: "sensitive" })],
        outputs: { answer: "text" },
        contract: L.contract({ invariants: [L.inv.noPII("answer")] }),
        policy: { privacy: "sensitive", maxCostUsd: 1 },
      }));
      if (!halted(row)) {
        const answer = timed.result?.ok ? String(timed.result.outputs?.answer ?? "") : "";
        const answerHits = L.defaultPiiDetectors.filter((detector) => detector.detect(answer).matched).map((detector) => detector.name);
        const signedScan = containsMarker(timed.result?.receipt ?? "", MARKERS);
        row.ticket = {
          inputDetectorHits: L.defaultPiiDetectors.filter((detector) => detector.detect(TICKET).matched).map((detector) => detector.name),
          answerHasInScopePII: answerHits.length > 0,
          answerDetectors: answerHits,
          signedMarkerLeak: signedScan.leak,
          signedMarkerHits: signedScan.hits,
          answerChars: answer.length,
          receiptBytes: receiptBytes(timed.result?.receipt),
          ...publicTiming(timed, timed.result?.ok === true),
        };
        log(`ticket ${model} ok ${row.ticket.ok} leak ${row.ticket.signedMarkerLeak} answerPII ${row.ticket.answerHasInScopePII}`);
      }
    }

    if (!state.halt && !state.unavailable && PLAN.agent) await runAgent(model, row);
    if (!state.halt && !state.unavailable && PLAN.crew) await runCrew(model, row);
    if (!state.halt && !state.unavailable && model === VISION_MODEL && PLAN.multimodal) await runVision(model, row);

    if (!state.halt && !state.unavailable && TASKS.has("rag")) {
      for (const src of [...rag0, ...ragHot]) {
        const replay = { i: src.i, temperature: src.temperature, verified: false, materialized: false, replayOk: false, outputHashMatch: false, alteredDetected: false, error: null };
        try {
          if (!src.receipt) throw new Error("no receipt");
          const body = JSON.parse(Buffer.from(src.receipt.payload, "base64"));
          replay.verified = (await L.verifyReceipt(src.receipt, keys.keySet)).ok === true;
          const artifact = L.artifact.text(POLICY, { label: "policy-refund" });
          const byHash = { [body.inputHashes[0]]: artifact };
          await L.materializeReplayEnvelope(src.receipt, {
            keySet: keys.keySet,
            artifactLoader: async (hash) => {
              if (!byHash[hash]) throw new Error("missing artifact");
              return byHash[hash];
            },
            outputs: { answer: src.answer },
            task: RAG_TASK,
          });
          replay.materialized = true;
          const envelope = await L.materializeReplayEnvelope(src.receipt, {
            keySet: keys.keySet,
            artifactLoader: async (hash) => byHash[hash],
            outputs: { answer: src.answer },
            task: RAG_TASK,
          });
          const replayed = await L.replayOffline(envelope);
          replay.replayOk = replayed.ok === true;
          const fingerprint = (await fingerprintArtifactValue(replayed.outputs))?.value ?? null;
          replay.outputHashMatch = fingerprint === body.outputHash;
          const altered = { answer: `${src.answer}Q` };
          replay.alteredDetected = ((await fingerprintArtifactValue(altered))?.value ?? null) !== body.outputHash;
        } catch (error) {
          replay.error = scrubText(error?.message ?? error).slice(0, 240);
        }
        delete src.receipt;
        row.replay.push(replay);
      }
      const ok = row.replay.filter((item) => item.verified && item.outputHashMatch && item.alteredDetected).length;
      log(`replay ${model} ${ok}/${row.replay.length}`);
    }
  } catch (error) {
    row.error = scrubText(error?.message ?? error).slice(0, 400);
    log(`model error ${model} ${row.error}`);
  }
  save(out);
  if (state.halt) break;
}

out.summary = summarize(out);
save(out);
log(`OPENROUTER_DONE models ${out.models.length} stopped ${out.stopped?.reason ?? "no"}`);

function summarize(report) {
  return report.models.map((row) => ({
    model: row.model,
    overheadN: row.overhead.length,
    signedLatticeMs: stats(row.overhead.filter((item) => item.signedOk).map((item) => item.signedLatticeMs)),
    signedLatticePct: stats(row.overhead.filter((item) => item.signedOk).map((item) => item.signedLatticePct)),
    extraPromptTokens: stats(row.overhead.filter((item) => item.signedOk).map((item) => item.extraPromptTokens)),
    packingProviderDeltaMs: stats(row.overhead.filter((item) => item.signedOk).map((item) => item.packingProviderDeltaMs)),
    signedMs: stats(row.overhead.filter((item) => item.signedOk).map((item) => item.signedMs)),
    plainMs: stats(row.overhead.filter((item) => item.plainOk).map((item) => item.plainMs)),
    unavailable: row.unavailable === true,
    drift: row.drift?.map((item) => ({ temperature: item.temperature, n: item.n, uniqueExact: item.uniqueExact, cited: item.cited, mustCitePassed: item.mustCitePassed })),
    replayOk: row.replay.filter((item) => item.verified && item.outputHashMatch && item.alteredDetected).length,
    replayN: row.replay.length,
    ticketLeak: row.ticket?.signedMarkerLeak ?? null,
    agentKind: row.agent?.kind ?? null,
    crewReceipts: row.crew?.receiptCount ?? null,
    multimodal: row.multimodal ? { latticeColor: row.multimodal.latticeNamesRed, directColor: row.multimodal.directNamesRed, imageInLatticeRequest: row.multimodal.imageMarkerInRequest } : null,
  }));
}

async function runAgent(model, row) {
  const topicSchema = {
    "~standard": {
      version: 1,
      vendor: "lattice-realworld",
      validate(value) {
        if (value && typeof value === "object" && typeof value.topic === "string" && value.topic.length > 0) return { value };
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
  const timed = await timeRun(async (sink, clock) => makeAI(model, 0, MAX_TOKENS, null, sink, clock).runAgent({
    task: "Call lookup_policy with topic refunds, then answer in one sentence citing [policy-refund].",
    tools: [lookup],
    signer: keys.signer,
    contract: L.contract({ budget: { maxIterations: 3, maxWallTimeMs: 180000 } }),
  }));
  if (halted(row)) return;
  const result = timed.result;
  const iterations = result?.iterations ?? [];
  row.agent = {
    kind: result?.kind ?? (timed.error ? "threw" : null),
    iterations: iterations.length,
    toolCalls: iterations.reduce((sum, iteration) => sum + (iteration.toolCalls?.length ?? 0), 0),
    answerChars: typeof result?.output?.answer === "string" ? result.output.answer.length : 0,
    cited: typeof result?.output?.answer === "string" && result.output.answer.includes("policy-refund"),
    receiptCount: (result?.receipt ? 1 : 0) + iterations.filter((iteration) => iteration.receipt).length,
    error: timed.error ?? (result?.kind === "success" ? null : (result?.message ?? result?.kind ?? null)),
    ...publicTiming(timed, result?.kind === "success"),
  };
  log(`agent ${model} ${row.agent.kind} tools ${row.agent.toolCalls} receipts ${row.agent.receiptCount}`);
}

async function runCrew(model, row) {
  const accept = { "~standard": { version: 1, vendor: "lattice-realworld", validate: (value) => ({ value }) } };
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
  const timed = await timeRun(async (sink, clock) => makeAI(model, 0, MAX_TOKENS, null, sink, clock).runAgentCrew({
    root,
    hosts: { childHost: L.createNoopAgentHost() },
    signer: keys.signer,
    policy: { budget: { maxIterations: 4, maxWallTimeMs: 180000 } },
  }));
  if (halted(row)) return;
  const result = timed.result;
  const receipts = result?.receipts ?? [];
  const chain = receipts.length
    ? await L.verifyChain(receipts, keys.keySet, { requireClosure: true })
    : null;
  row.crew = {
    parentKind: result?.result?.kind ?? null,
    totalIterations: result?.totalIterations ?? null,
    receiptCount: receipts.length,
    chainClosure: chain
      ? { ok: chain.ok === true, count: chain.ok ? chain.count : null, errorKind: chain.ok ? null : chain.error?.kind ?? null }
      : null,
    perAgent: (result?.perAgent ?? []).map((agent) => ({ id: agent.id, iterations: agent.iterations, receiptCount: agent.receiptCids?.length ?? 0 })),
    answerChars: typeof result?.result?.output?.answer === "string" ? result.result.output.answer.length : 0,
    cited: typeof result?.result?.output?.answer === "string" && result.result.output.answer.includes("policy-refund"),
    error: timed.error ?? (result?.result?.kind === "success" ? null : (result?.result?.message ?? result?.result?.kind ?? null)),
    ...publicTiming(timed, result?.result?.kind === "success"),
  };
  log(`crew ${model} ${row.crew.parentKind} receipts ${row.crew.receiptCount}`);
}

async function runVision(model, row) {
  const prompt = "The attached image is one solid color. Reply with exactly one of these words: red, green, or blue.";
  const lattice = await timeRun(async (sink, clock) => makeAI(model, 0, MAX_TOKENS, keys.signer, sink, clock).run({
    task: prompt,
    artifacts: [L.artifact.image(DATA_URL, { mediaType: "image/png", label: "square" })],
    outputs: { answer: "text" },
  }));
  if (halted(row)) return;
  const direct = await directChat(model, prompt, 0, MAX_TOKENS, [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: DATA_URL } },
  ]);
  const latticeAnswer = lattice.result?.ok ? String(lattice.result.outputs?.answer ?? "") : "";
  const names = (text) => /\bred\b/i.test(text);
  row.multimodal = {
    ran: true,
    image: "16x16 solid red PNG, no text",
    latticeAnswer: latticeAnswer.slice(0, 160),
    directAnswer: String(direct.text ?? "").slice(0, 160),
    latticeNamesRed: names(latticeAnswer),
    directNamesRed: names(direct.text ?? ""),
    imageMarkerInRequest: lattice.sink.some((call) => call.imageMarkerInRequest),
    lattice: publicTiming(lattice, lattice.result?.ok === true),
    direct: { ok: direct.ok, httpMs: direct.httpMs, provider: direct.provider, responseModel: direct.responseModel, errorMessage: direct.errorMessage ?? null },
    note: "Lattice's OpenAI-compatible adapter places artifact values in text JSON. The direct arm sends an image_url content part. imageMarkerInRequest is true when the PNG base64 appears in the Lattice request body.",
  };
  log(`vision latticeRed ${row.multimodal.latticeNamesRed} directRed ${row.multimodal.directNamesRed} inBody ${row.multimodal.imageMarkerInRequest}`);
}
