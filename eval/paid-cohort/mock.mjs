// Offline stand-in for OpenRouter, used only when PAID_DRY_RUN=1. It never touches the network and
// holds only fixture catalog, endpoint, account and completion data derived from the request body.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { CASES } from "../public-refund/cases.mjs";

const BASE = "https://openrouter.ai/api/v1";
const PRICES = {
  "anthropic/claude-sonnet-5.5": [2e-6, 1e-5], "openai/gpt-6.1-sol": [2e-6, 1e-5], "google/gemini-4-carbon": [2e-6, 1e-5],
  "x-ai/grok-4.7": [2e-6, 6e-6], "qwen/qwen3.8-max-0902": [2e-6, 6e-6],
};
const FIXTURE_CREDITS = 20, FIXTURE_USAGE = 0.13;
const env = (name) => process.env[name];
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
const usageFile = () => join(env("PAID_PRIVATE_DIR") ?? "/tmp", "mock-usage.json");
const readUsage = () => existsSync(usageFile()) ? JSON.parse(readFileSync(usageFile(), "utf8")).usage : FIXTURE_USAGE;
function addUsage(cost) {
  mkdirSync(env("PAID_PRIVATE_DIR") ?? "/tmp", { recursive: true });
  writeFileSync(usageFile() + ".tmp", JSON.stringify({ usage: readUsage() + cost }));
  renameSync(usageFile() + ".tmp", usageFile());
}
const hashNum = (text) => parseInt(createHash("sha256").update(text).digest("hex").slice(0, 8), 16);

function endpoints(id) {
  const [input, output] = PRICES[id];
  const bump = Number(env("PAID_MOCK_PRICE_FACTOR") ?? 1);
  const list = [
    { name: id + " | primary", provider_name: "Primary", tag: "primary", context_length: 1000000, max_completion_tokens: 65536,
      pricing: { prompt: String(input * bump), completion: String(output * bump), request: "0", image: "0", internal_reasoning: "0" } },
    { name: id + " | secondary", provider_name: "Secondary", tag: "secondary", context_length: 1000000, max_completion_tokens: 65536,
      pricing: { prompt: String(input), completion: String(output), request: "0", image: "0", internal_reasoning: "0" } },
  ];
  // A longer endpoint list at unchanged prices must not refuse a stage.
  if (env("PAID_MOCK_EXTRA_ENDPOINT") === "1") list.push({ ...list[1], name: id + " | tertiary", provider_name: "Tertiary", tag: "tertiary" });
  return list;
}

// ---- request understanding ----------------------------------------------------------------
const textOf = (body) => (body.messages ?? []).flatMap((m) => Array.isArray(m.content) ? m.content : [{ type: "text", text: String(m.content) }])
  .filter((p) => p.type === "text").map((p) => p.text).join("\n");

function artifactValues(body) {
  return (body.messages ?? []).flatMap((m) => Array.isArray(m.content) ? m.content : []).filter((p) => p.type === "text").map((p) => {
    try { const v = JSON.parse(p.text); return v?.artifactId ? v : null; } catch { return null; }
  }).filter(Boolean);
}

function pngColor(body) {
  const match = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(JSON.stringify(body));
  if (!match) return "red";
  const bytes = Buffer.from(match[1], "base64");
  let offset = 8;
  const idat = [];
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset), type = bytes.toString("latin1", offset + 4, offset + 8);
    if (type === "IDAT") idat.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const [r, g, b] = [raw[1], raw[2], raw[3]];
  return r === 255 ? "red" : g === 255 ? "green" : b === 255 ? "blue" : "red";
}

function answerFor(body) {
  const text = textOf(body), model = body.model;
  const art = artifactValues(body);
  if (text.includes("Prepare a source-grounded review packet")) {
    const id = /Case: (\S+)/.exec(text)[1];
    const example = CASES.find((c) => c.id === id);
    const answers = Object.fromEntries(example.questions.map((q) => {
      let value = q.expected;
      // One deterministic wrong answer so the scoring path sees a failure.
      if (model === "google/gemini-4-carbon" && id === "moffatt" && q.id === "settlement_proven") value = false;
      return [q.id, { value, source_ids: [id + "-p" + q.acceptablePages.at(-1)] }];
    }));
    return { content: JSON.stringify({ case_id: id, currency: example.currency, execution_authority: "review_only", answers,
      review_note: "Mock review note about evidence limits." }), reasoning: 200 };
  }
  if (text.includes("Answer using only the supplied passages")) {
    const question = /Question: (.*)$/s.exec(text)?.[1] ?? "";
    const ids = art.filter((a) => a.kind === "text").map((a) => a.artifactId);
    // One model fails the format on a fraction of non-development questions; failures stay in denominators.
    if (model === "openai/gpt-6.1-sol" && hashNum(question) % 11 === 0 && !question.startsWith("DEV")) return { content: "I cannot cite the sources.", reasoning: 50 };
    return { content: JSON.stringify({ answer: "The passages state the answer [" + ids[0] + "].", citations: [{ source: ids[0] }] }), reasoning: 100 };
  }
  if (text.includes("Evaluate the answer using only the supplied sources")) {
    const payload = JSON.parse(text.slice(text.indexOf('{"question"')));
    const answer = payload.candidate.answer ?? "";
    const contradicted = answer.includes("90 days");
    const disagree = model === "qwen/qwen3.8-max-0902" && hashNum(answer + payload.question) % 5 === 0;
    return { content: JSON.stringify({ claims: [{ supported: !contradicted, cited: true, citationCount: 1, relevantCitations: contradicted ? 0 : 1 }],
      answerCorrect: !contradicted && !disagree, abstained: false }), reasoning: 300 };
  }
  if (text.includes("Name the solid color")) return { content: pngColor(body), reasoning: 10 };
  if (text.includes("Read shipment.tracking")) return { content: /parcel-\d+/.exec(text)?.[0] ?? "unknown", reasoning: 10 };
  if (text.includes("Reply only pong")) return { content: "pong", reasoning: 5 };
  if (text.includes("Confirm that a refund can be reviewed")) return { content: "Yes, a refund can be reviewed.", reasoning: 10 };
  if (text.includes("single-agent loop")) {
    const task = /USER:\n([\s\S]*?)\n\nASSISTANT:/.exec(text)?.[1] ?? "";
    const toolResult = text.includes("TOOL_RESULT");
    if (task.startsWith("Call lookup_policy")) return { content: toolResult ? "The refund window is 30 days [policy-refund]." : '{"tool_calls":[{"id":"c1","name":"lookup_policy","args":{}}]}', reasoning: 20 };
    if (task.startsWith("Delegate to researcher")) return { content: toolResult ? "The refund window is 30 days [policy-refund]." : '{"tool_calls":[{"id":"d1","name":"researcher","args":{"task":"State the refund window."}}]}', reasoning: 20 };
    return { content: "Refunds are available within 30 days [policy-refund].", reasoning: 20 };
  }
  return { content: "pong", reasoning: 1 };
}

let chatCalls = 0;
export async function mockFetch(url, init = {}) {
  const path = String(url).replace(BASE, "");
  if (!String(url).startsWith(BASE)) throw new Error("Mock refuses unknown host: " + url);
  const method = init.method ?? "GET";
  if (method === "GET") {
    if (path === "/key") return json({ data: { label: "mock", usage: readUsage(), limit: null, is_free_tier: false } });
    if (path === "/credits") return json({ data: { total_credits: Number(env("PAID_MOCK_CREDITS") ?? FIXTURE_CREDITS), total_usage: readUsage() } });
    if (path === "/models") return json({ data: Object.keys(PRICES).map((id) => ({ id, context_length: 1000000, pricing: { prompt: String(PRICES[id][0]), completion: String(PRICES[id][1]) } })) });
    const m = /^\/models\/(.+)\/endpoints$/.exec(path);
    if (m && PRICES[m[1]]) return json({ data: { id: m[1], endpoints: endpoints(m[1]) } });
    return json({ error: { code: 404, message: "not found" } }, 404);
  }
  if (path !== "/chat/completions") return json({ error: { code: 404, message: "not found" } }, 404);
  const body = JSON.parse(init.body);
  chatCalls++;
  const failAfter = env("PAID_MOCK_402_AFTER");
  if (failAfter !== undefined && chatCalls > Number(failAfter)) return json({ error: { code: 402, message: "Insufficient credits" } }, 402);
  const { content, reasoning } = answerFor(body);
  const [inputPrice, outputPrice] = PRICES[body.model];
  const promptTokens = Math.ceil(Buffer.byteLength(init.body) / 4);
  const completionTokens = Math.min(body.max_tokens, Math.ceil(content.length / 4) + reasoning);
  const cost = promptTokens * inputPrice + completionTokens * outputPrice;
  addUsage(cost);
  return json({ id: "gen-mock-" + chatCalls, model: body.model, provider: "MockProvider",
    choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, completion_tokens_details: { reasoning_tokens: reasoning }, cost } });
}
