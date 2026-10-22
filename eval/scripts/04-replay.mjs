// E4 offline replay determinism across the 7 first-party adapters.
// Record: ai.run against a provider-shaped recorded fixture (fake fetch) -> signed receipt.
// Persist receipt + content-addressed artifacts + outputs to disk as JSON fixtures.
// Replay: reload from disk, materializeReplayEnvelope (verify-first), replayOffline,
// recompute the output fingerprint, compare to the signed receipt's outputHash.
// Also: re-run live against the same recorded fixture and compare outputHash.
// Fixtures go to eval/results/fixtures/ (gitignored; regenerate with this script).
// The public keyset is written next to them as keyset.json (the KeyEntry[] shape
// that `lattice verify --key` reads), and verification below uses the keyset
// reloaded from disk, so any fixture can be re-verified offline. The private key
// is never written.
import { L, rng, randText, writeCSV, writeJSON, makeKeys, ADAPTERS, fakeFetch, fingerprintArtifactValue, RESULTS } from "./lib.mjs";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const M = +(process.env.RUNS ?? 50);
const r = rng(4); const K = await makeKeys();
const FIX = `${RESULTS}/fixtures`; mkdirSync(FIX, { recursive: true });
writeFileSync(`${FIX}/keyset.json`, JSON.stringify([{ kid: K.kid, publicKeyJwk: K.publicKeyJwk, state: "active" }], null, 2) + "\n");
const diskKeySet = L.createMemoryKeySet(JSON.parse(readFileSync(`${FIX}/keyset.json`, "utf8")));
const rows = [];
for (const ad of ADAPTERS) {
  for (let i = 0; i < M; i++) {
    const text = `${ad.id} reply ${i}: ${randText(r, 50 + Math.floor(r() * 2000))}`;
    const mkAi = () => L.createAI({ providers: [ad.build(fakeFetch(() => ad.body(text)))], signer: K.signer });
    const artifacts = [L.artifact.text(randText(r, 200)), ...(i % 3 === 0 ? [L.artifact.json({ k: i, v: randText(r, 30) })] : [])];
    const intent = { task: `task ${i}`, artifacts, outputs: { answer: "text" } };
    const res = await mkAi().run(intent);
    const row = { adapter: ad.id, run: i, recordOk: res.ok, receipt: !!res.receipt, verified: false, materialized: false, replayOk: false, outputHashMatch: false, liveRerunHashMatch: false, alteredOutputDetected: false, reloadedInputHashesMatch: false, err: "" };
    try {
      const body = JSON.parse(Buffer.from(res.receipt.payload, "base64"));
      // persist fixture
      const fx = { receipt: res.receipt, outputs: res.outputs, artifacts: Object.fromEntries(body.inputHashes.map((h, j) => [h, artifacts[j]])) };
      const path = `${FIX}/${ad.id}-${i}.json`; writeFileSync(path, JSON.stringify(fx));
      const loaded = JSON.parse(readFileSync(path, "utf8"));
      row.verified = (await L.verifyReceipt(loaded.receipt, diskKeySet)).ok;
      const byHash = loaded.artifacts; // loaded back from the on-disk fixture
      const envl = await L.materializeReplayEnvelope(loaded.receipt, { keySet: diskKeySet, artifactLoader: async (h) => { if (!byHash[h]) throw new Error("missing " + h); return byHash[h]; }, outputs: loaded.outputs, task: intent.task });
      row.materialized = true;
      const rep = await L.replayOffline(envl);
      row.replayOk = rep.ok;
      const fp = (await fingerprintArtifactValue(rep.outputs))?.value ?? null;
      row.outputHashMatch = fp === body.outputHash;
      // negative control: a one-character change to the recorded output must not match
      const alt = { answer: loaded.outputs.answer.slice(0, -1) + (loaded.outputs.answer.endsWith("x") ? "y" : "x") };
      row.alteredOutputDetected = ((await fingerprintArtifactValue(alt))?.value ?? null) !== body.outputHash;
      // artifact-identity check: the reloaded artifacts must re-hash to the signed inputHashes
      const ai2 = L.createAI({ providers: [ad.build(fakeFetch(() => ad.body(text)))], signer: K.signer });
      const res3 = await ai2.run({ ...intent, artifacts: body.inputHashes.map((h) => loaded.artifacts[h]) });
      row.reloadedInputHashesMatch = JSON.stringify(JSON.parse(Buffer.from(res3.receipt.payload, "base64")).inputHashes) === JSON.stringify(body.inputHashes);
      const res2 = await mkAi().run(intent);
      row.liveRerunHashMatch = JSON.parse(Buffer.from(res2.receipt.payload, "base64")).outputHash === body.outputHash;
    } catch (e) { row.err = String(e.message ?? e).slice(0, 200); }
    rows.push(row);
  }
}
const per = ADAPTERS.map((a) => { const xs = rows.filter((x) => x.adapter === a.id); const c = (k) => xs.filter((x) => x[k]).length;
  return { adapter: a.id, runs: xs.length, recorded: c("recordOk"), verified: c("verified"), materialized: c("materialized"), replayOk: c("replayOk"), outputHashMatch: c("outputHashMatch"), liveRerunHashMatch: c("liveRerunHashMatch"), alteredOutputDetected: c("alteredOutputDetected"), reloadedInputHashesMatch: c("reloadedInputHashesMatch"), errors: xs.filter((x) => x.err).length }; });
writeCSV("replay_raw.csv", rows); writeCSV("replay_summary.csv", per); writeJSON("replay.json", per);
console.table(per); const e = rows.find((x) => x.err); if (e) console.log(e);
