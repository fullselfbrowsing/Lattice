// E1 overhead + E2 receipt size. Compares, per payload configuration:
//  plain   : direct provider.execute() on the OpenAI adapter (fake fetch) = "plain SDK call"
//  run     : ai.run() with the same adapter, no signer
//  runSig  : ai.run() with an Ed25519 signer (receipt issued)
//  verify  : verifyReceipt() on the issued receipt
//  and isolated createReceipt() / verifyReceipt() micro-timings.
import { L, rng, randText, randBytes, stats, writeCSV, writeJSON, makeKeys, ADAPTERS, fakeFetch, envInfo } from "./lib.mjs";
const N = +(process.env.TRIALS ?? 1000), WARM = 100;
const r = rng(1);
const k = await makeKeys();
const oai = ADAPTERS[0];
const fetchF = fakeFetch(() => oai.body("The duplicate charge should be refunded."));
// Large payloads exceed the adapter's default 16k-token context window, so we widen it
// (routing-only metadata; execution path unchanged).
const wide = (p) => ({ ...p, capabilities: p.capabilities.map((c) => ({ ...c, contextWindow: 1e9 })) });
const provider = oai.build(fetchF);
const aiPlain = L.createAI({ providers: [wide(oai.build(fetchF))] });
const aiSig = L.createAI({ providers: [wide(oai.build(fetchF))], signer: k.signer });

const configs = [];
for (const kb of [1, 10, 100, 1000]) configs.push({ name: `text-${kb}KB`, mk: () => [L.artifact.text(randText(r, kb * 1024))], bytes: kb * 1024 });
for (const kb of [100, 1000]) configs.push({ name: `image-${kb}KB`, mk: () => [L.artifact.text("describe"), L.artifact.image(new Blob([randBytes(r, kb * 1024)], { type: "image/png" }))], bytes: kb * 1024 });
configs.push({ name: "multimodal-5art", mk: () => [L.artifact.text(randText(r, 4096)), L.artifact.json({ rows: Array.from({ length: 200 }, (_, i) => ({ i, v: randText(r, 20) })) }),
  L.artifact.image(new Blob([randBytes(r, 200 * 1024)], { type: "image/png" })), L.artifact.audio(new Blob([randBytes(r, 300 * 1024)], { type: "audio/wav" })),
  L.artifact.document(new Blob([randBytes(r, 100 * 1024)], { type: "application/pdf" }))], bytes: 4096 + 600 * 1024 });
for (const n of [1, 10, 50]) configs.push({ name: `text-x${n}`, mk: () => Array.from({ length: n }, () => L.artifact.text(randText(r, 1024))), bytes: n * 1024 });

const now = () => Number(process.hrtime.bigint()) / 1e6;
const rows = [], summary = [], sizes = [];
for (const c of configs) {
  const artifacts = c.mk();
  const intent = { task: "Resolve this support case", artifacts, outputs: { answer: "text" } };
  const req = { task: intent.task, artifacts, outputs: ["answer"] };
  const t = { plain: [], run: [], runSig: [], verify: [] };
  let receipt;
  for (let i = 0; i < N + WARM; i++) {
    let a = now(); await provider.execute(req); const p = now() - a;
    a = now(); const r1 = await aiPlain.run(intent); const q = now() - a; if (!r1.ok) throw new Error(JSON.stringify(r1.error));
    a = now(); const r2 = await aiSig.run(intent); const s = now() - a; if (!r2.receipt) throw new Error("no receipt");
    a = now(); const v = await L.verifyReceipt(r2.receipt, k.keySet); const vt = now() - a; if (!v.ok) throw new Error("verify fail");
    receipt = r2.receipt;
    if (i >= WARM) { t.plain.push(p); t.run.push(q); t.runSig.push(s); t.verify.push(vt); }
  }
  for (const [m, xs] of Object.entries(t)) { const st = stats(xs); summary.push({ config: c.name, payloadBytes: c.bytes, artifacts: artifacts.length, measure: m, ...st }); xs.forEach((x, i) => rows.push({ config: c.name, measure: m, trial: i, ms: x.toFixed(5) })); }
  const envBytes = Buffer.byteLength(JSON.stringify(receipt));
  sizes.push({ config: c.name, payloadBytes: c.bytes, artifacts: artifacts.length, receiptEnvelopeBytes: envBytes, payloadCanonicalBytes: Buffer.from(receipt.payload, "base64").length, ratio: +(envBytes / c.bytes).toFixed(5) });
  console.error(c.name, summary.slice(-4).map((s) => `${s.measure}:p50=${s.p50.toFixed(3)}`).join(" "));
}

// Isolated createReceipt / verifyReceipt micro-benchmark.
const base = { runId: "run:x", model: { requested: "gpt-4o", observed: null }, route: { providerId: "openai", capabilityId: "gpt-4o", attemptNumber: 1 },
  usage: { promptTokens: 10, completionTokens: 5, costUsd: 0.001 }, contractVerdict: "success", contractHash: null, inputHashes: ["a".repeat(64)], outputHash: "b".repeat(64) };
const micro = { createReceipt: [], verifyReceipt: [], receiptCid: [] };
for (let i = 0; i < N * 5 + WARM; i++) {
  let a = now(); const env = await L.createReceipt(base, k.signer); const c1 = now() - a;
  a = now(); await L.verifyReceipt(env, k.keySet); const v1 = now() - a;
  a = now(); await L.receiptCid(env); const d1 = now() - a;
  if (i >= WARM) { micro.createReceipt.push(c1); micro.verifyReceipt.push(v1); micro.receiptCid.push(d1); }
}
for (const [m, xs] of Object.entries(micro)) summary.push({ config: "micro", payloadBytes: 0, artifacts: 1, measure: m, ...stats(xs) });

// Memory: heap delta per signed run (rough, GC-sensitive).
let mem = null;
if (global.gc) {
  const intent = { task: "t", artifacts: [L.artifact.text(randText(r, 10240))], outputs: { answer: "text" } };
  const measure = async (ai) => { global.gc(); const h0 = process.memoryUsage().heapUsed; const keep = []; for (let i = 0; i < 2000; i++) keep.push(await ai.run(intent)); global.gc(); return (process.memoryUsage().heapUsed - h0) / 2000; };
  mem = { retainedBytesPerRunNoSigner: Math.round(await measure(aiPlain)), retainedBytesPerRunWithSigner: Math.round(await measure(aiSig)), note: "heap retained per RunResult (2000 results kept alive, 10KB text artifact); includes plan/events, not just receipt" };
}
writeCSV("overhead_raw.csv", rows);
writeCSV("overhead_summary.csv", summary.map((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" && !Number.isInteger(v) ? v.toFixed(5) : v]))));
writeCSV("receipt_sizes.csv", sizes);
writeJSON("overhead.json", { env: await envInfo(), trials: N, warmup: WARM, summary, sizes, memory: mem });
