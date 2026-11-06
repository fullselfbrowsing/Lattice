// Shared helpers for the Lattice evaluation harness. Offline only: every
// provider call is served by an in-process fake fetch; no network, no keys.
import * as L from "../../packages/lattice/dist/index.js";
import { fingerprintArtifactValue } from "../../packages/lattice/dist/storage.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
export { L, fingerprintArtifactValue };
export const RESULTS = resolve(dirname(fileURLToPath(import.meta.url)), "../results");
mkdirSync(RESULTS, { recursive: true });

// Deterministic PRNG (mulberry32) so every run uses the same synthetic data.
export function rng(seed = 42) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function randText(r, n) { const c = "abcdefghijklmnopqrstuvwxyz     .,"; let s = ""; for (let i = 0; i < n; i++) s += c[Math.floor(r() * c.length)]; return s; }
export function randBytes(r, n) { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = Math.floor(r() * 256); return b; }

export function stats(xs) {
  const s = [...xs].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  return { n: s.length, mean, p50: q(0.5), p95: q(0.95), p99: q(0.99), min: s[0], max: s[s.length - 1] };
}
export function writeJSON(name, obj) { writeFileSync(resolve(RESULTS, name), JSON.stringify(obj, null, 2)); }
export function writeCSV(name, rows) {
  if (!rows.length) return writeFileSync(resolve(RESULTS, name), "");
  const keys = Object.keys(rows[0]);
  const esc = (v) => { const s = typeof v === "object" && v !== null ? JSON.stringify(v) : String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  writeFileSync(resolve(RESULTS, name), [keys.join(","), ...rows.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n") + "\n");
}
export async function makeKeys(kid = "eval-k1") {
  const { privateKeyJwk, publicKeyJwk } = await L.generateEd25519KeyPairJwk();
  const signer = L.createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk, kid, keySet: L.createMemoryKeySet([{ kid, publicKeyJwk, state: "active" }]) };
}

// Provider-shaped fake fetch bodies (same shapes as the repo's parity test).
export const oaiBody = (text) => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
export const antBody = (text) => ({ content: [{ type: "text", text }], usage: { input_tokens: 10, output_tokens: 5 } });
export const gemBody = (text) => ({ candidates: [{ content: { parts: [{ text }], role: "model" } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } });
export function fakeFetch(bodyFn) {
  return async (_url, init) => new Response(JSON.stringify(bodyFn(init)), { status: 200, headers: { "content-type": "application/json" } });
}
export const ADAPTERS = [
  { id: "openai", body: oaiBody, build: (f) => L.createOpenAIProvider?.({ model: "gpt-4o", baseUrl: "https://api.openai.com/v1", apiKey: "sk-fake", fetch: f }) },
  { id: "openai-compatible", body: oaiBody, build: (f) => L.createOpenAICompatibleProvider({ model: "any-model", baseUrl: "https://example.invalid/v1", apiKey: "sk-fake", fetch: f }) },
  { id: "anthropic", body: antBody, build: (f) => L.createAnthropicProvider({ model: "claude-3-opus", apiKey: "sk-ant-fake", fetch: f }) },
  { id: "gemini", body: gemBody, build: (f) => L.createGeminiProvider({ model: "gemini-1.5-flash", apiKey: "AIza-fake", fetch: f }) },
  { id: "xai", body: oaiBody, build: (f) => L.createXaiProvider({ model: "grok-4", apiKey: "xai-fake", fetch: f }) },
  { id: "openrouter", body: oaiBody, build: (f) => L.createOpenRouterProvider({ model: "openai/gpt-4o", apiKey: "sk-or-fake", fetch: f }) },
  { id: "lm-studio", body: oaiBody, build: (f) => L.createLmStudioProvider({ model: "qwen2.5-coder-32b-instruct", fetch: f }) },
];
export function envInfo() {
  return import("node:os").then((os) => ({
    node: process.version, v8: process.versions.v8, platform: `${os.platform()} ${os.release()}`, arch: os.arch(),
    cpu: os.cpus()[0]?.model, cores: os.cpus().length, totalMemGB: +(os.totalmem() / 2 ** 30).toFixed(1),
    latticeVersion: L.latticeVersion, date: new Date().toISOString(),
  }));
}
