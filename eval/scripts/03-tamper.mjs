// E3 tamper / attack suite. For each base receipt, apply systematic mutations and
// record whether verifyReceipt rejects (and with which error kind).
import { L, rng, writeCSV, writeJSON, makeKeys, ADAPTERS, fakeFetch } from "./lib.mjs";
import { buildChain, verifyChain } from "./02-chain.mjs";
// canonicalize@3 is ESM-only (`exports.import`); createRequire cannot load it.
const { default: canonicalize } = await import(
  "../../packages/lattice/node_modules/canonicalize/lib/canonicalize.js"
);
const r = rng(3);
const K = await makeKeys("k-active");
const OTHER = await makeKeys("k-other");      // a second legit key, also trusted
const RETIRED = await makeKeys("k-retired");
const REVOKED = await makeKeys("k-revoked");
const ATTACK = await makeKeys("k-attacker");  // not in the trusted keyset
const keySet = L.createMemoryKeySet([
  { kid: "k-active", publicKeyJwk: K.publicKeyJwk, state: "active" },
  { kid: "k-other", publicKeyJwk: OTHER.publicKeyJwk, state: "active" },
  { kid: "k-retired", publicKeyJwk: RETIRED.publicKeyJwk, state: "retired" },
  { kid: "k-revoked", publicKeyJwk: REVOKED.publicKeyJwk, state: "revoked" },
]);
const PT = "application/vnd.lattice.receipt+json";
const dec = (env) => JSON.parse(Buffer.from(env.payload, "base64").toString("utf8"));
const enc = (s) => Buffer.from(s, "utf8").toString("base64");
const pae = (payloadB64) => { const t = Buffer.from(PT), p = Buffer.from(payloadB64); return new Uint8Array(Buffer.concat([Buffer.from(`DSSEv1 ${t.length} `), t, Buffer.from(` ${p.length} `), p])); };
async function resign(body, signerKeys, kidOverride) {
  const payload = enc(canonicalize(body)); const sig = await signerKeys.signer.sign(pae(payload));
  return { payloadType: PT, payload, signatures: [{ keyid: kidOverride ?? signerKeys.kid, sig: Buffer.from(sig).toString("base64") }] };
}
const flipB64 = (s, i) => { const a = s.split(""); const c = a[i]; a[i] = c === "A" ? "B" : "A"; return a.join(""); };

// Base corpus: real ai.run receipts across adapters + a tripwire-violating run.
const base = [];
for (let i = 0; i < 70; i++) {
  const ad = ADAPTERS[i % ADAPTERS.length];
  const ai = L.createAI({ providers: [ad.build(fakeFetch(() => ad.body(`answer ${i}`)))], signer: K.signer });
  const res = await ai.run({ task: `task ${i}`, artifacts: [L.artifact.text(`case ${i} ${r()}`)], outputs: { answer: "text" } });
  base.push(res.receipt);
}
const sanity = await Promise.all(base.map((e) => L.verifyReceipt(e, keySet)));
if (!sanity.every((v) => v.ok)) throw new Error("base receipt failed to verify");

const editors = {
  "edit-outputHash": (b) => ({ ...b, outputHash: "f".repeat(64) }),
  "edit-inputHashes": (b) => ({ ...b, inputHashes: ["0".repeat(64)] }),
  "edit-route-provider": (b) => ({ ...b, route: { ...b.route, providerId: "evil-provider" } }),
  "edit-model": (b) => ({ ...b, model: { ...b.model, requested: "cheaper-model" } }),
  "edit-usage-cost": (b) => ({ ...b, usage: { ...b.usage, costUsd: "0" } }),
  "edit-verdict": (b) => ({ ...b, contractVerdict: b.contractVerdict === "success" ? "tripwire-violated" : "success" }),
  "edit-issuedAt": (b) => ({ ...b, issuedAt: "2020-01-01T00:00:00.000Z" }),
  "edit-runId": (b) => ({ ...b, runId: "run:forged" }),
  "drop-redactions": (b) => { const { redactions, ...rest } = b; return rest; },
  "edit-redactionPolicy": (b) => ({ ...b, redactionPolicyId: "none" }),
  "add-field": (b) => ({ ...b, injected: "x" }),
  "unicode-nfd": (b) => ({ ...b, runId: b.runId + "\u0065\u0301" }),
};
const cases = []; // {category, mutation, expectReject, rejected, kind}
async function check(category, mutation, env, expectReject = true) {
  let v; try { v = await L.verifyReceipt(env, keySet); } catch (e) { v = { ok: false, error: { kind: "THREW:" + e.message } }; }
  cases.push({ category, mutation, expectReject, rejected: !v.ok, kind: v.ok ? `accepted(${v.keyState})` : v.error.kind });
}
for (const env of base) {
  const body = dec(env);
  for (const [m, f] of Object.entries(editors)) {
    // (a) naive edit: re-serialize with JSON.stringify, keep original signature
    await check("body-edit-keep-sig", m, { ...env, payload: enc(JSON.stringify(f(body))) });
    // (b) edit + correct JCS re-canonicalization, keep original signature
    await check("body-edit-jcs-keep-sig", m, { ...env, payload: enc(canonicalize(f(body))) });
    // (c) edit + re-sign with untrusted attacker key but claim legit kid
    await check("body-edit-attacker-sig-legit-kid", m, await resign(f(body), ATTACK, "k-active"));
  }
  await check("encoding", "key-reorder", { ...env, payload: enc(JSON.stringify(Object.fromEntries(Object.entries(body).reverse()))) });
  await check("encoding", "whitespace", { ...env, payload: enc(JSON.stringify(body, null, 1)) });
  await check("signature", "sig-bitflip", { ...env, signatures: [{ ...env.signatures[0], sig: flipB64(env.signatures[0].sig, 5) }] });
  const other = base[(base.indexOf(env) + 1) % base.length];
  await check("signature", "sig-swap-same-key", { ...env, signatures: other.signatures });
  await check("signature", "sig-truncate", { ...env, signatures: [{ ...env.signatures[0], sig: env.signatures[0].sig.slice(0, 40) }] });
  await check("signature", "sig-empty-list", { ...env, signatures: [] });
  await check("signature", "payload-truncate", { ...env, payload: env.payload.slice(0, Math.floor(env.payload.length / 2)) });
  await check("signature", "payloadType-change", { ...env, payloadType: "application/json" });
  await check("key", "keyid-to-other-trusted", { ...env, signatures: [{ ...env.signatures[0], keyid: "k-other" }] });
  await check("key", "keyid-unknown", { ...env, signatures: [{ ...env.signatures[0], keyid: "nope" }] });
  await check("key", "forge-attacker-key-own-kid", await resign(body, ATTACK));
  await check("key", "resign-revoked-key", await resign({ ...body, kid: "k-revoked" }, REVOKED));
  await check("key", "resign-other-key-body-kid-mismatch", await resign(body, OTHER));
  await check("downgrade", "version-v1-resigned-valid-key", await resign({ ...body, version: "lattice-receipt/v1" }, K));
  { const { version, ...nov } = body; await check("downgrade", "version-absent-resigned-valid-key", await resign(nov, K)); }
  // Expected-accept controls (not attacks per se, but informative):
  await check("control-accept", "untouched", env, false);
  await check("control-accept", "retired-key-legit-signature", await resign({ ...body, kid: "k-retired" }, RETIRED), false);
  await check("control-accept", "version-v1.1-resigned-valid-key (key holder)", await resign({ ...body, version: "lattice-receipt/v1.1" }, K), false);
  await check("replay", "same-receipt-presented-again (no nonce/audience)", env, true);
}

// Chain attacks: verifyReceipt checks links individually; we report both per-receipt
// verification and the library's verifyChain (via 02-chain.mjs, no expectedCount
// unless the mutation name says so). Accepted chains record their advisory codes.
const chainRows = [];
for (let t = 0; t < 50; t++) {
  const c = await buildChain(8, K.signer), c2 = await buildChain(8, K.signer);
  const muts = {
    "swap-adjacent-links": () => { const x = [...c]; [x[3], x[4]] = [x[4], x[3]]; return x; },
    "drop-middle-link": () => c.filter((_, i) => i !== 4),
    "splice-foreign-link": () => { const x = [...c]; x[4] = c2[4]; return x; },
    "truncate-tail": () => c.slice(0, 5),
    "replace-root": () => [c2[0], ...c.slice(1)],
  };
  for (const [m, f] of Object.entries(muts)) {
    const x = f();
    const perReceipt = (await Promise.all(x.map((e) => L.verifyReceipt(e, keySet)))).some((v) => !v.ok);
    const chain = await verifyChain(x, keySet);
    chainRows.push({ mutation: m, rejectedByPerReceiptVerify: perReceipt, rejectedByChainVerifier: !chain.ok, chainWhy: chain.why ?? (chain.advisories ?? []).map((a) => a.code).join("|") });
    if (m === "truncate-tail") {
      const counted = await verifyChain(x, keySet, { expectedCount: 8 });
      chainRows.push({ mutation: "truncate-tail-expectedCount", rejectedByPerReceiptVerify: perReceipt, rejectedByChainVerifier: !counted.ok, chainWhy: counted.why ?? "" });
    }
  }
}

// Summaries
const groups = {};
for (const c of cases) { const key = `${c.category}|${c.mutation}`; (groups[key] ??= { category: c.category, mutation: c.mutation, expectReject: c.expectReject, n: 0, rejected: 0, kinds: {} });
  const g = groups[key]; g.n++; if (c.rejected) g.rejected++; g.kinds[c.kind] = (g.kinds[c.kind] ?? 0) + 1; }
const summary = Object.values(groups).map((g) => ({ ...g, rate: +(g.rejected / g.n).toFixed(4), kinds: Object.entries(g.kinds).map(([k, v]) => `${k}:${v}`).join(";") }));
const cg = {};
for (const c of chainRows) { (cg[c.mutation] ??= { mutation: c.mutation, n: 0, perReceipt: 0, chain: 0, why: new Set() }); const g = cg[c.mutation]; g.n++; g.perReceipt += c.rejectedByPerReceiptVerify; g.chain += c.rejectedByChainVerifier; g.why.add(c.chainWhy); }
const chainSummary = Object.values(cg).map((g) => ({ mutation: g.mutation, n: g.n, perReceiptRejectRate: g.perReceipt / g.n, chainVerifierRejectRate: g.chain / g.n, chainVerifierReason: [...g.why].join(";") }));
const attacks = cases.filter((c) => c.expectReject && c.category !== "replay");
writeCSV("tamper_raw.csv", cases); writeCSV("tamper_summary.csv", summary); writeCSV("chain_attacks.csv", chainSummary);
writeJSON("tamper.json", { baseReceipts: base.length, attackCases: attacks.length, attackRejected: attacks.filter((c) => c.rejected).length, summary, chainSummary });
console.log(summary.map((s) => `${s.category}/${s.mutation}: ${s.rejected}/${s.n} [${s.kinds}]`).join("\n")); console.log(chainSummary);
