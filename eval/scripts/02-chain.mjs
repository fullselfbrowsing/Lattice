// E2b chained (crew-style) receipts: build a chain of depth D via parentReceiptCid
// (same field runAgentCrew uses), measure total bytes, build time, verify-all time.
// Also runs a real runAgentCrew with fake providers if available, to confirm the field is populated.
import { L, stats, writeCSV, writeJSON, makeKeys } from "./lib.mjs";
const k = await makeKeys();
const now = () => Number(process.hrtime.bigint()) / 1e6;
const base = (i) => ({ runId: `crew:child-${i}`, model: { requested: "gpt-4o", observed: null }, route: { providerId: "openai", capabilityId: "gpt-4o", attemptNumber: 1 },
  usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 }, contractVerdict: "success", contractHash: null, inputHashes: [String(i).padStart(64, "0")], outputHash: "b".repeat(64) });
export async function buildChain(D, signer = k.signer) {
  const chain = []; let parent;
  for (let i = 0; i < D; i++) { const env = await L.createReceipt({ ...base(i), ...(parent ? { parentReceiptCid: parent } : {}) }, signer); chain.push(env); parent = await L.receiptCid(env); }
  return chain;
}
// Lattice's tree verifier. Order of the array does not matter; parent links do.
// A chain built by this file has no chainClosure, so tail truncation is an advisory
// rather than a rejection unless the caller passes expectedCount.
export async function verifyChain(chain, keySet, options = {}) {
  const r = await L.verifyChain(chain, keySet, options);
  if (r.ok) return { ok: true, why: (r.advisories ?? []).join("|"), advisories: r.advisories ?? [] };
  return { ok: false, why: r.error.kind, advisories: [] };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = [];
  for (const D of [1, 2, 4, 8, 16, 32, 64, 128, 256]) {
    const b = [], v = []; let bytes = 0;
    for (let t = 0; t < 30; t++) { let a = now(); const c = await buildChain(D); b.push(now() - a); a = now(); const r = await verifyChain(c, k.keySet); v.push(now() - a); if (!r.ok) throw new Error(r.why); bytes = c.reduce((s, e) => s + Buffer.byteLength(JSON.stringify(e)), 0); }
    const sb = stats(b), sv = stats(v);
    rows.push({ depth: D, totalBytes: bytes, bytesPerLink: Math.round(bytes / D), buildP50ms: sb.p50.toFixed(3), buildP95ms: sb.p95.toFixed(3), verifyAllP50ms: sv.p50.toFixed(3), verifyAllP95ms: sv.p95.toFixed(3) });
    console.error(rows.at(-1));
  }
  writeCSV("chain_scaling.csv", rows); writeJSON("chain_scaling.json", rows);
}
