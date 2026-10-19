#!/usr/bin/env node
/**
 * Receipt cost and tamper-resistance benchmark backing the paper's
 * "Measured cost and tamper resistance" table (paper/main.tex).
 *
 * Runs against the BUILT package (packages/lattice/dist) through public
 * exports only, with the in-repo mocked provider and no network. Every
 * number in paper/bench/results.json comes from this script, so the paper
 * can be regenerated on any machine:
 *
 *   pnpm -r build && node scripts/bench-receipts.mjs [--out paper/bench/results.json]
 *
 * Not part of the CI gates: wall-clock numbers vary by machine. The sweep
 * and replay counts are deterministic and must always be 100 %.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outArg = process.argv.indexOf("--out");
const outPath = resolve(here, "..", outArg >= 0 ? process.argv[outArg + 1] : "paper/bench/results.json");

let lattice;
try {
  lattice = await import(new URL("../packages/lattice/dist/index.js", import.meta.url).href);
} catch (error) {
  console.error("[bench-receipts] built package not found; run `pnpm -r build` first.", error?.message ?? error);
  process.exit(2);
}
const {
  createAI,
  createFakeProvider,
  artifact,
  generateEd25519KeyPairJwk,
  createInMemorySigner,
  createMemoryKeySet,
  createReceipt,
  verifyReceipt,
  materializeReplayEnvelope,
  replayOffline,
  latticeVersion,
} = lattice;

// --- helpers ---------------------------------------------------------------

function stats(samplesMs) {
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return { n: sorted.length, median: round(at(0.5)), p95: round(at(0.95)), mean: round(mean) };
}
const round = (x) => Math.round(x * 1000) / 1000;

async function timeEach(iterations, fn) {
  const samples = [];
  for (let i = 0; i < iterations; i += 1) {
    const t0 = performance.now();
    await fn(i);
    samples.push(performance.now() - t0);
  }
  return samples;
}

const sha256Hex = (text) => createHash("sha256").update(text).digest("hex");

function decodePayload(envelope) {
  return JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8"));
}
function encodePayload(body) {
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}
function withPayloadBytes(envelope, mutate) {
  const bytes = Buffer.from(envelope.payload, "base64");
  mutate(bytes);
  return { ...envelope, payload: bytes.toString("base64") };
}
function withBody(envelope, mutate) {
  const body = decodePayload(envelope);
  const next = mutate(body) ?? body;
  return { ...envelope, payload: encodePayload(next) };
}

// Deterministic PRNG so the sweep is reproducible across runs.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- fixtures --------------------------------------------------------------

const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
const KID = "bench-key";
const signer = createInMemorySigner(privateKeyJwk, { kid: KID, publicKeyJwk });
const other = await generateEd25519KeyPairJwk();
const keySet = createMemoryKeySet([
  { kid: KID, publicKeyJwk, state: "active" },
  { kid: "bench-other", publicKeyJwk: other.publicKeyJwk, state: "active" },
]);

function minimalInput(overrides = {}) {
  return {
    runId: "bench-run",
    model: { requested: "fake:deterministic", observed: "fake:deterministic" },
    route: { providerId: "fake", capabilityId: "fake:deterministic", attemptNumber: 1 },
    usage: { promptTokens: 120, completionTokens: 40, costUsd: 0.00012 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: sha256Hex(JSON.stringify({ text: "benchmark output" })),
    ...overrides,
  };
}

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: here, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

const results = {
  generatedAt: new Date().toISOString(),
  lattice: latticeVersion,
  commit: gitCommit(),
  node: process.version,
  cpu: os.cpus()[0]?.model ?? "unknown",
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  provider: "mocked (createFakeProvider), no network",
};

// --- 1. sign and verify latency --------------------------------------------

{
  const input = minimalInput();
  await timeEach(100, () => createReceipt(input, signer)); // warmup
  const signSamples = await timeEach(1000, () => createReceipt(input, signer));
  const envelope = await createReceipt(input, signer);
  await timeEach(100, () => verifyReceipt(envelope, keySet));
  const verifySamples = await timeEach(1000, async () => {
    const r = await verifyReceipt(envelope, keySet);
    if (!r.ok) throw new Error("verify failed in latency loop");
  });
  results.signMs = stats(signSamples);
  results.verifyMs = stats(verifySamples);
}

// --- 2. issuance overhead with a 1 MiB image input -------------------------

{
  const bytes = new Uint8Array(1 << 20);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31) & 0xff;
  const image = () => artifact.image(new Blob([bytes], { type: "image/png" }), { id: "artifact:image:bench" });
  const run = async (ai) => {
    const result = await ai.run({ task: "describe", artifacts: [image()], outputs: { text: "text" } });
    if (!result.ok) throw new Error("run failed");
    return result;
  };
  // The mocked provider's default capability has a 16k-token context window,
  // which the router rejects for a 1 MiB input; widen it for this case only.
  const wide = () => {
    const base = createFakeProvider().capabilities[0];
    return createFakeProvider({ capabilities: [{ ...base, contextWindow: 4_000_000 }] });
  };
  const unsigned = createAI({ providers: [wide()] });
  const signed = createAI({ providers: [wide()], signer });
  await timeEach(5, () => run(unsigned));
  await timeEach(5, () => run(signed));
  const u = stats(await timeEach(40, () => run(unsigned)));
  const s = stats(await timeEach(40, () => run(signed)));
  const probe = await run(signed);
  if (probe.receipt === undefined) throw new Error("signed run produced no receipt");
  results.oneMiBImage = {
    runUnsignedMs: u,
    runSignedMs: s,
    issuanceOverheadMedianMs: round(s.median - u.median),
    inputHashes: decodePayload(probe.receipt).inputHashes.length,
  };
}

// --- 3. receipt size --------------------------------------------------------

{
  const sizes = [];
  for (const k of [0, 1, 2, 4, 8]) {
    const inputHashes = Array.from({ length: k }, (_, i) => sha256Hex(`input-${i}`));
    const env = await createReceipt(minimalInput({ inputHashes }), signer);
    sizes.push({
      inputs: k,
      envelopeBytes: Buffer.byteLength(JSON.stringify(env), "utf8"),
      bodyBytes: Buffer.from(env.payload, "base64").length,
    });
  }
  const first = sizes[0];
  const last = sizes[sizes.length - 1];
  results.receiptSize = {
    byInputs: sizes,
    baseEnvelopeBytes: first.envelopeBytes,
    baseBodyBytes: first.bodyBytes,
    perInputEnvelopeBytes: round((last.envelopeBytes - first.envelopeBytes) / last.inputs),
    perInputBodyBytes: round((last.bodyBytes - first.bodyBytes) / last.inputs),
  };
}

// --- 4. tamper sweep --------------------------------------------------------

{
  const rng = makeRng(0x5eed);
  const RECEIPTS = 72;
  const PAYLOAD_FLIPS = 30;
  const SIG_FLIPS = 10;
  const envelopes = [];
  for (let i = 0; i < RECEIPTS; i += 1) {
    envelopes.push(
      await createReceipt(
        minimalInput({
          runId: `bench-run-${i}`,
          audience: "bench-verifier",
          nonce: `nonce-${i}`,
          expiresAt: "2999-01-01T00:00:00.000Z",
          inputHashes: [sha256Hex(`input-${i}`)],
        }),
        signer,
      ),
    );
  }
  // Sanity: every unmutated receipt verifies.
  for (const env of envelopes) {
    const r = await verifyReceipt(env, keySet, { expectedAudience: "bench-verifier" });
    if (!r.ok) throw new Error(`baseline receipt failed: ${r.error.kind}`);
  }
  const classes = {};
  const bump = (name, rejected) => {
    classes[name] ??= { total: 0, rejected: 0 };
    classes[name].total += 1;
    if (rejected) classes[name].rejected += 1;
  };
  const check = async (name, mutated) => {
    let rejected;
    try {
      const r = await verifyReceipt(mutated, keySet, { expectedAudience: "bench-verifier" });
      rejected = !r.ok;
    } catch {
      rejected = false; // a throw would be a verifier bug; count it as not rejected
    }
    bump(name, rejected);
  };

  for (const [i, env] of envelopes.entries()) {
    const payloadLen = Buffer.from(env.payload, "base64").length;
    for (let f = 0; f < PAYLOAD_FLIPS; f += 1) {
      const pos = Math.floor(rng() * payloadLen);
      const bit = 1 << Math.floor(rng() * 8);
      await check("payload-bit-flip", withPayloadBytes(env, (b) => { b[pos] ^= bit; }));
    }
    const sig = env.signatures[0];
    const sigBytes = Buffer.from(sig.sig, "base64");
    for (let f = 0; f < SIG_FLIPS; f += 1) {
      const pos = Math.floor(rng() * sigBytes.length);
      const bit = 1 << Math.floor(rng() * 8);
      const flipped = Buffer.from(sigBytes);
      flipped[pos] ^= bit;
      await check("signature-bit-flip", { ...env, signatures: [{ ...sig, sig: flipped.toString("base64") }] });
    }
    await check("keyid-unknown", { ...env, signatures: [{ ...sig, keyid: "no-such-key" }] });
    await check("keyid-other-valid-key", { ...env, signatures: [{ ...sig, keyid: "bench-other" }] });
    await check("body-kid-swapped", withBody(env, (b) => { b.kid = "bench-other"; }));
    await check("version-downgrade-v1", withBody(env, (b) => { b.version = "lattice-receipt/v1"; }));
    await check("version-removed", withBody(env, (b) => { delete b.version; }));
    await check("output-hash-dropped", withBody(env, (b) => { delete b.outputHash; }));
    await check("audience-edited", withBody(env, (b) => { b.audience = "someone-else"; }));
    await check("nonce-edited", withBody(env, (b) => { b.nonce = "replayed"; }));
    await check("expiry-extended", withBody(env, (b) => { b.expiresAt = "2999-12-31T00:00:00.000Z"; }));
    await check("keys-reordered", withBody(env, (b) => Object.fromEntries(Object.entries(b).reverse())));
    await check("payload-base64url", { ...env, payload: env.payload.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") });
    await check("payload-swapped-between-receipts", { ...env, payload: envelopes[(i + 1) % envelopes.length].payload });
  }
  const total = Object.values(classes).reduce((a, c) => a + c.total, 0);
  const rejected = Object.values(classes).reduce((a, c) => a + c.rejected, 0);
  results.tamperSweep = { receipts: RECEIPTS, mutations: total, rejected, classes };
}

// --- 5. replay agreement ----------------------------------------------------

{
  const rng = makeRng(0x7e9);
  const RUNS = 350;
  let matched = 0;
  let verified = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const text = `answer-${i}-${Math.floor(rng() * 1e9)}`;
    const provider = createFakeProvider({
      response: { rawOutputs: { text }, normalizedUsage: { promptTokens: 3, completionTokens: 2, costUsd: 0 } },
    });
    const ai = createAI({ providers: [provider], signer });
    const inputs = [artifact.text(`context ${i}`), artifact.text(`more context ${i * 7}`)];
    const result = await ai.run({ task: `t-${i}`, artifacts: inputs, outputs: { text: "text" } });
    if (!result.ok || result.receipt === undefined) throw new Error("replay fixture run failed");
    const body = decodePayload(result.receipt);
    const byHash = new Map(body.inputHashes.map((h, idx) => [h, inputs[idx]]));
    const envelope = await materializeReplayEnvelope(result.receipt, {
      artifactLoader: async (hash) => {
        const found = byHash.get(hash);
        if (found === undefined) throw new Error(`unknown hash ${hash}`);
        return found;
      },
      keySet,
      task: `t-${i}`,
      // The recorded output values, not the output contract: replay re-hashes
      // these and compares against the signed outputHash.
      outputs: result.outputs,
    });
    verified += 1;
    const replayed = await replayOffline(envelope);
    if (replayed.ok && sha256Hex(JSON.stringify(replayed.outputs)) === body.outputHash) matched += 1;
  }
  results.replay = { runs: RUNS, verifiedBeforeReplay: verified, outputHashMatched: matched };
}

// --- report -----------------------------------------------------------------

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");

const r = results;
console.log(`lattice ${r.lattice} on ${r.node}, ${r.cpu} (${r.platform})`);
console.log(`createReceipt   median ${r.signMs.median} ms  p95 ${r.signMs.p95} ms  (n=${r.signMs.n})`);
console.log(`verifyReceipt   median ${r.verifyMs.median} ms  p95 ${r.verifyMs.p95} ms  (n=${r.verifyMs.n})`);
console.log(`1 MiB image     run unsigned ${r.oneMiBImage.runUnsignedMs.median} ms, signed ${r.oneMiBImage.runSignedMs.median} ms, overhead ${r.oneMiBImage.issuanceOverheadMedianMs} ms`);
console.log(`receipt size    envelope ${r.receiptSize.baseEnvelopeBytes} B (+${r.receiptSize.perInputEnvelopeBytes} B/input), body ${r.receiptSize.baseBodyBytes} B (+${r.receiptSize.perInputBodyBytes} B/input)`);
console.log(`tamper sweep    ${r.tamperSweep.rejected}/${r.tamperSweep.mutations} rejected over ${r.tamperSweep.receipts} receipts`);
for (const [name, c] of Object.entries(r.tamperSweep.classes)) console.log(`  ${name.padEnd(34)} ${c.rejected}/${c.total}`);
console.log(`replay          ${r.replay.outputHashMatched}/${r.replay.runs} output hashes matched`);
console.log(`wrote ${outPath}`);
if (r.tamperSweep.rejected !== r.tamperSweep.mutations || r.replay.outputHashMatched !== r.replay.runs) {
  console.error("[bench-receipts] FAIL: a mutation was accepted or a replay drifted");
  process.exit(1);
}
