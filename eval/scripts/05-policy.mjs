// E5 routing determinism + policy enforcement, tripwire (no-PII / must-cite) accuracy on a
// synthetic labeled set, and a secret-leakage scan of signed receipts.
import { L, rng, randText, writeCSV, writeJSON, makeKeys, ADAPTERS, fakeFetch } from "./lib.mjs";
import * as R from "../../packages/lattice/dist/routing.js";
const r = rng(5); const pick = (xs) => xs[Math.floor(r() * xs.length)];

// ---------- Routing ----------
const PROV = ["openai", "anthropic", "gemini", "xai", "openrouter", "lm-studio", "local"];
const caps = Array.from({ length: 40 }, (_, i) => ({ providerId: pick(PROV), modelId: `m${i}`,
  inputModalities: r() < 0.6 ? ["text", "json", "image"] : ["text", "json"], outputModalities: ["text", "json"], fileTransport: ["inline", "json", "base64"],
  contextWindow: pick([8000, 32000, 128000]), structuredOutput: true, toolUse: false, streaming: false,
  pricing: { inputPer1kTokens: +(r() * 0.01).toFixed(5), outputPer1kTokens: +(r() * 0.03).toFixed(5) }, latency: r() < 0.7 ? "interactive" : "batch",
  dataPolicy: { privacy: r() < 0.5 ? ["standard"] : r() < 0.7 ? ["standard", "sensitive"] : ["standard", "sensitive", "restricted"], supportsNoLogging: r() < 0.5, supportsNoTraining: true }, available: true }));
const catalog = { version: "eval", models: caps };
const satisfies = (c, req) => { const p = req.policy ?? {};
  if (p.providerAllowList && !p.providerAllowList.includes(c.providerId)) return false;
  if (p.providerDenyList?.includes(c.providerId)) return false;
  if (p.privacy && !c.dataPolicy.privacy.includes(p.privacy)) return false;
  if (p.noLogging && !c.dataPolicy.supportsNoLogging) return false;
  if (p.latency && c.latency !== p.latency) return false;
  if (req.needsImage && !c.inputModalities.includes("image")) return false;
  return true; };
const routeRows = []; let detRuns = 0, detSame = 0, permSame = 0, permN = 0, violations = 0, falseNoRoute = 0, routed = 0, noRoute = 0;
for (let q = 0; q < 1000; q++) {
  const policy = {};
  if (r() < 0.3) policy.providerAllowList = PROV.filter(() => r() < 0.4);
  if (r() < 0.3) policy.providerDenyList = PROV.filter(() => r() < 0.3);
  if (r() < 0.5) policy.privacy = pick(["standard", "sensitive", "restricted"]);
  if (r() < 0.3) policy.noLogging = true;
  if (r() < 0.3) policy.latency = pick(["interactive", "batch"]);
  const needsImage = r() < 0.3;
  const artifacts = [L.artifact.text(randText(r, 200)), ...(needsImage ? [L.artifact.image(new Blob([new Uint8Array(64)], { type: "image/png" }))] : [])];
  const req = { task: "t", artifacts, outputs: { answer: "text" }, policy };
  const d0 = R.routeDeterministically(catalog, req); const j0 = JSON.stringify(d0);
  for (let k = 0; k < 20; k++) { detRuns++; if (JSON.stringify(R.routeDeterministically(catalog, req)) === j0) detSame++; }
  const shuffled = { ...catalog, models: [...caps].sort(() => r() - 0.5) };
  const dp = R.routeDeterministically(shuffled, req); permN++; if ((dp.selected?.modelId ?? null) === (d0.selected?.modelId ?? null)) permSame++;
  const sel = d0.selected ? caps.find((c) => c.modelId === d0.selected.modelId) : undefined;
  const oracleAny = caps.some((c) => satisfies(c, { ...req, needsImage }));
  const viol = sel ? !satisfies(sel, { ...req, needsImage }) : false;
  if (sel) routed++; else noRoute++; if (viol) violations++; if (!sel && oracleAny) falseNoRoute++;
  routeRows.push({ q, policy: JSON.stringify(policy), needsImage, selected: sel?.modelId ?? "", oracleFeasible: oracleAny, violation: viol, falseNoRoute: !sel && oracleAny });
}
const routing = { requests: 1000, repeatedEvaluations: detRuns, identicalDecisionRate: detSame / detRuns, catalogPermutationSameSelectionRate: permSame / permN,
  routed, noRoute, selectedViolatingPolicy: violations, noRouteDespiteFeasibleCandidate: falseNoRoute };

// ---------- PII labeled set ----------
const d = (n) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");
function luhnComplete(prefix, len) { const ds = (prefix + d(len - prefix.length - 1)).split("").map(Number);
  let sum = 0; for (let i = ds.length - 1, dbl = true; i >= 0; i--, dbl = !dbl) { let x = ds[i]; if (dbl) { x *= 2; if (x > 9) x -= 9; } sum += x; }
  return ds.join("") + ((10 - (sum % 10)) % 10); }
const grp = (s, g) => { const out = []; let i = 0; for (const n of g) { out.push(s.slice(i, i + n)); i += n; } return out; };
const names = ["Alice Moreno", "Raj Patel", "Chen Wei", "Maria Lopez"];
const gens = {
  // label: [inScope, isPII, generator]
  "email": [true, true, () => `${pick(["john.doe", "a_b+tag", "x9"])}@${pick(["gmail.com", "utdallas.edu", "corp.co.uk"])}`],
  "email-obfuscated": [false, true, () => `${pick(["john", "raj"])} at ${pick(["gmail", "utd"])} dot com`],
  "ssn-dashed": [true, true, () => `${d(3)}-${d(2)}-${d(4)}`],
  "ssn-nodash": [true, true, () => `SSN ${d(9)}`],
  "ssn-spaced": [true, true, () => `${d(3)} ${d(2)} ${d(4)}`],
  "cc-plain": [true, true, () => luhnComplete(pick(["4", "51", "55"]), 16)],
  "cc-spaced": [true, true, () => grp(luhnComplete("4", 16), [4, 4, 4, 4]).join(" ")],
  "cc-dashed": [true, true, () => grp(luhnComplete("52", 16), [4, 4, 4, 4]).join("-")],
  "cc-amex": [true, true, () => grp(luhnComplete("37", 15), [4, 6, 5]).join(" ")],
  "phone-dashed": [true, true, () => `${d(3)}-${d(3)}-${d(4)}`],
  "phone-paren": [true, true, () => `(${d(3)}) ${d(3)}-${d(4)}`],
  "phone-dotted": [true, true, () => `${d(3)}.${d(3)}.${d(4)}`],
  "phone-+1": [true, true, () => `+1 ${d(3)} ${d(3)} ${d(4)}`],
  "phone-plain10": [true, true, () => `call ${d(10)}`],
  "name-address": [false, true, () => `${pick(names)}, ${d(3)} Main St, Richardson TX 75080`],
  "iban": [false, true, () => `DE${d(2)} ${d(4)} ${d(4)} ${d(4)} ${d(4)} ${d(2)}`],
  "uk-phone": [false, true, () => `+44 20 ${d(4)} ${d(4)}`],
  "ipv4": [false, true, () => `${1 + Math.floor(r() * 254)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}.${Math.floor(r() * 255)}`],
  "dob": [false, true, () => `born ${1950 + Math.floor(r() * 50)}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`],
  // negatives
  "neg-date": [null, false, () => `on 2026-10-${10 + Math.floor(r() * 18)}`],
  "neg-version": [null, false, () => `v${d(1)}.${d(2)}.${d(1)}`],
  "neg-order-id-3-2-4": [null, false, () => `order ${d(3)}-${d(2)}-${d(4)}`],
  "neg-sku-3-3-4": [null, false, () => `SKU ${d(3)}-${d(3)}-${d(4)}`],
  "neg-16digit-random": [null, false, () => `ref ${d(16)}`],
  "neg-sha": [null, false, () => Array.from({ length: 40 }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("")],
  "neg-amount": [null, false, () => `$${d(4)}.${d(2)} total`],
  "neg-isbn13": [null, false, () => `ISBN 978${d(10)}`],
  "neg-plain-text": [null, false, () => randText(r, 80)],
  "neg-decorator": [null, false, () => `use @${pick(["Override", "Test"])} on line ${d(3)}`],
};
const pii = [];
for (const [label, [inScope, isPII, g]] of Object.entries(gens)) for (let i = 0; i < 100; i++) {
  const frag = g(); const text = `${randText(r, 30)} ${frag} ${randText(r, 30)}`;
  const res = await L.evaluateTripwires({ answer: text }, [L.inv.noPII("answer")]);
  pii.push({ label, inScope, isPII, flagged: !res.ok, detector: res.ok ? "" : res.evidence.observed.detector, evidenceEqualsRawPII: !res.ok && frag.includes(res.evidence.observed.substring), text });
}
// non-string field: PII inside an object at the checked path
for (let i = 0; i < 100; i++) { const res = await L.evaluateTripwires({ answer: { note: `mail ${pick(["a@b.com", "x@y.org"])}` } }, [L.inv.noPII("answer")]);
  pii.push({ label: "nested-object-email", inScope: true, isPII: true, flagged: !res.ok, detector: res.ok ? "" : res.evidence.observed.detector, evidenceEqualsRawPII: false, text: "{answer:{note:...email}}" }); }
const prf = (xs) => { const tp = xs.filter((x) => x.isPII && x.flagged).length, fp = xs.filter((x) => !x.isPII && x.flagged).length, fn = xs.filter((x) => x.isPII && !x.flagged).length, tn = xs.filter((x) => !x.isPII && !x.flagged).length;
  return { n: xs.length, tp, fp, fn, tn, precision: tp + fp ? +(tp / (tp + fp)).toFixed(4) : null, recall: tp + fn ? +(tp / (tp + fn)).toFixed(4) : null }; };
const negs = pii.filter((x) => !x.isPII);
const piiSummary = { overall_allPII: prf(pii), inScopeOnly: prf([...pii.filter((x) => x.inScope === true), ...negs]), outOfScopeOnly: prf([...pii.filter((x) => x.inScope === false), ...negs]),
  byLabel: Object.keys(gens).concat("nested-object-email").map((l) => { const xs = pii.filter((x) => x.label === l); return { label: l, isPII: xs[0].isPII, inScope: xs[0].inScope, n: xs.length, flaggedRate: xs.filter((x) => x.flagged).length / xs.length }; }),
  evidenceContainsRawPIIRate: pii.filter((x) => x.flagged).length ? pii.filter((x) => x.evidenceEqualsRawPII).length / pii.filter((x) => x.flagged).length : null };

// ---------- must-cite labeled set ----------
// Default matching is case-sensitive and reads `source` (or a string). `caseInsensitive`
// and `keys` are explicit options, so a case variant or an `id` field is a miss unless opted in.
const citeCases = [
  ["string-cite", true, { answer: "a", citations: ["doc-a"] }], ["object-cite", true, { answer: "a", citations: [{ source: "doc-a" }] }],
  ["evidence-key", true, { answer: "a", evidence: ["doc-a"] }], ["multi-cite", true, { answer: "a", citations: ["doc-b", "doc-a"] }],
  ["missing", false, { answer: "a" }], ["empty", false, { answer: "a", citations: [] }], ["wrong-doc", false, { answer: "a", citations: ["doc-b"] }],
  ["case-variant", false, { answer: "a", citations: ["Doc-A"] }],
  ["case-variant-opt-in", true, { answer: "a", citations: ["Doc-A"] }, { caseInsensitive: true }],
  ["nested-citations", true, { answer: { text: "a", citations: ["doc-a"] } }],
  ["inline-text-only", true, { answer: "per [doc-a], refund" }],
  ["object-other-key", false, { answer: "a", citations: [{ id: "doc-a" }] }],
  ["object-id-key", true, { answer: "a", citations: [{ id: "doc-a" }] }, { keys: ["id"] }],
  // Bracket prose that names a different work, while the array names the artifact, is a fabricated citation.
  ["hallucinated-cite-string", false, { answer: "Refund per [Smith 1999].", citations: ["doc-a"] }],
  // A named array with no contradictory bracket is accepted: support is not a syntactic property.
  ["named-without-brackets", true, { answer: "a", citations: ["doc-a"] }],
];
const cite = [];
for (const [label, shouldPass, out, options] of citeCases) {
  const res = await L.evaluateTripwires(out, [L.inv.mustCite("doc-a", options)]);
  cite.push({ label, labeledSatisfies: shouldPass, passed: res.ok, agree: res.ok === shouldPass });
}

// ---------- Secret leakage scan of signed receipts ----------
const K = await makeKeys(); const SECRETS = { task: "TASKSECRET-7f3a", artifact: "ARTSECRET-91bc", apiKey: "sk-LEAKCHECK-0042", output: "OUTSECRET-55de", ssn: "123-45-6789", email: "victim@example.com" };
const leakRows = [];
for (const ad of ADAPTERS) {
  const prov = ad.id === "lm-studio" ? ad.build(fakeFetch(() => ad.body(`${SECRETS.output} ${SECRETS.ssn}`))) :
    ({ ...ad.build(fakeFetch(() => ad.body(`${SECRETS.output} ${SECRETS.ssn}`))) });
  const ai = L.createAI({ providers: [prov], signer: K.signer });
  for (const withContract of [false, true]) {
    const res = await ai.run({ task: `do it ${SECRETS.task}`, artifacts: [L.artifact.text(`${SECRETS.artifact} ${SECRETS.email}`, { privacy: "sensitive" })], outputs: { answer: "text" },
      ...(withContract ? { contract: L.contract({ invariants: [L.inv.noPII("answer")] }) } : {}) });
    const payload = res.receipt ? Buffer.from(res.receipt.payload, "base64").toString() : "";
    const found = Object.entries(SECRETS).filter(([, v]) => payload.includes(v)).map(([k]) => k);
    leakRows.push({ adapter: ad.id, noPiiContract: withContract, verdict: res.receipt ? JSON.parse(payload).contractVerdict : "no-receipt", leakedFields: found.join(";") || "none", redactionsManifest: res.receipt ? JSON.stringify(JSON.parse(payload).redactions) : "" });
  }
}

writeCSV("routing_raw.csv", routeRows); writeCSV("pii_raw.csv", pii); writeCSV("pii_by_label.csv", piiSummary.byLabel); writeCSV("mustcite.csv", cite); writeCSV("leakage.csv", leakRows);
writeJSON("policy.json", { routing, pii: piiSummary, mustCite: { cases: cite.length, agree: cite.filter((c) => c.agree).length, rows: cite }, leakage: leakRows });
console.log(routing); console.log(JSON.stringify({ o: piiSummary.overall_allPII, i: piiSummary.inScopeOnly, ev: piiSummary.evidenceContainsRawPIIRate })); console.table(piiSummary.byLabel); console.table(cite); console.table(leakRows);
