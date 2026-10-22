// Shared helpers for the real-model evaluation. Provider calls go to a local
// Ollama server. Nothing in this directory is a mock of the model.
import * as L from "../../../packages/lattice/dist/index.js";
import { fingerprintArtifactValue } from "../../../packages/lattice/dist/storage.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";

export { L, fingerprintArtifactValue };
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RESULTS = resolve(ROOT, "results");
mkdirSync(RESULTS, { recursive: true });

export const OLLAMA = process.env.OLLAMA_BASE ?? "http://127.0.0.1:11434/v1";
export const MODEL = process.env.OLLAMA_MODEL ?? "llama3.2:3b";

export function writeJSON(name, obj) {
  writeFileSync(resolve(RESULTS, name), JSON.stringify(obj, null, 2));
}

export function stats(xs) {
  const s = [...xs].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!s.length) return { n: 0, mean: null, p50: null, p95: null, min: null, max: null };
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean, p50: q(0.5), p95: q(0.95), min: s[0], max: s[s.length - 1] };
}

export async function makeKeys(kid = "realworld-k1") {
  const { privateKeyJwk, publicKeyJwk } = await L.generateEd25519KeyPairJwk();
  const signer = L.createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk, kid, keySet: L.createMemoryKeySet([{ kid, publicKeyJwk, state: "active" }]) };
}

// The OpenAI-compatible adapter does not send temperature or max_tokens.
// This wrapper adds them on the wire so the direct arm and the Lattice arm
// sample the same way. live.json records that note.
export function samplingFetch(temperature, maxTokens, sink) {
  return async (url, init = {}) => {
    let body = init.body;
    let promptChars = 0;
    if (typeof body === "string") {
      const parsed = JSON.parse(body);
      parsed.temperature = temperature;
      parsed.max_tokens = maxTokens;
      body = JSON.stringify(parsed);
      promptChars = body.length;
    }
    const t0 = performance.now();
    const response = await fetch(url, { ...init, body });
    const httpMs = performance.now() - t0;
    sink?.push({ url: String(url), httpMs, promptChars, status: response.status });
    return response;
  };
}

export function provider(temperature, maxTokens, sink) {
  return L.createOpenAICompatibleProvider({
    id: "ollama",
    model: MODEL,
    baseUrl: OLLAMA,
    fetch: samplingFetch(temperature, maxTokens, sink),
  });
}

export async function directChat(task, temperature, maxTokens) {
  const body = {
    model: MODEL,
    temperature,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: task }],
  };
  const t0 = performance.now();
  const response = await fetch(`${OLLAMA}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const httpMs = performance.now() - t0;
  const json = await response.json();
  if (!response.ok) {
    throw new Error(`direct chat ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }
  const text = json.choices?.[0]?.message?.content ?? "";
  return { text, httpMs, usage: json.usage ?? null, model: json.model ?? null };
}

export function receiptBytes(receipt) {
  if (!receipt) return null;
  const envelope = Buffer.byteLength(JSON.stringify(receipt));
  let body = null;
  try {
    body = Buffer.from(receipt.payload, "base64").length;
  } catch { /* payload is not base64 on this shape */ }
  return { envelope, body };
}

export function containsMarker(value, markers) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const hits = markers.filter((m) => m && raw.includes(m));
  return { leak: hits.length > 0, hits };
}

export function hardware() {
  let ollama = null;
  try {
    ollama = execFileSync("ollama", ["--version"], { encoding: "utf8" }).trim();
  } catch (error) {
    ollama = String(error.message ?? error).slice(0, 200);
  }
  return {
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    cpu: os.cpus()[0]?.model ?? null,
    cores: os.cpus().length,
    totalMemGB: +(os.totalmem() / 2 ** 30).toFixed(2),
    freeMemGB: +(os.freemem() / 2 ** 30).toFixed(2),
    latticeVersion: L.latticeVersion,
    ollama,
    model: MODEL,
    baseUrl: OLLAMA,
    date: new Date().toISOString(),
  };
}
