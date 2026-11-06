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
// Cue words and digit adjustments below never call r(), so they do not shift the
// random stream: each label draws the same digits and surrounding random text.
const SSN_CUES = ["SSN", "SSN:", "social security number", "SS#"];
/** Make a 10-digit string NANP-valid (NXX-NXX-XXXX, no N11) without drawing new randomness. */
function nanp(s) {
  const a = s.split("").map(Number);
  for (const k of [0, 3]) { a[k] = 2 + (a[k] % 8); if (a[k + 1] === 1 && a[k + 2] === 1) a[k + 2] = 0; }
  return a.join("");
}
const gens = {
  // label: [inScope, isPII, generator]
  "email": [true, true, () => `${pick(["john.doe", "a_b+tag", "x9"])}@${pick(["gmail.com", "utdallas.edu", "corp.co.uk"])}`],
  "email-obfuscated": [false, true, () => `${pick(["john", "raj"])} at ${pick(["gmail", "utd"])} dot com`],
  "ssn-dashed": [true, true, () => `${d(3)}-${d(2)}-${d(4)}`],
  "ssn-nodash": [true, true, () => `SSN ${d(9)}`],
  "ssn-spaced": [true, true, (i) => `${SSN_CUES[i % SSN_CUES.length]} ${d(3)} ${d(2)} ${d(4)}`],
  "cc-plain": [true, true, () => luhnComplete(pick(["4", "51", "55"]), 16)],
  "cc-spaced": [true, true, () => grp(luhnComplete("4", 16), [4, 4, 4, 4]).join(" ")],
  "cc-dashed": [true, true, () => grp(luhnComplete("52", 16), [4, 4, 4, 4]).join("-")],
  "cc-amex": [true, true, () => grp(luhnComplete("37", 15), [4, 6, 5]).join(" ")],
  "phone-dashed": [true, true, () => `${d(3)}-${d(3)}-${d(4)}`],
  "phone-paren": [true, true, () => `(${d(3)}) ${d(3)}-${d(4)}`],
  "phone-dotted": [true, true, () => `${d(3)}.${d(3)}.${d(4)}`],
  "phone-+1": [true, true, () => `+1 ${d(3)} ${d(3)} ${d(4)}`],
  "phone-plain10": [true, true, () => `call ${nanp(d(10))}`],
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
async function scorePii(label, inScope, isPII, set, frag, text) {
  const res = await L.evaluateTripwires({ answer: text }, [L.inv.noPII("answer")]);
  pii.push({ label, set, inScope, isPII, flagged: !res.ok, detector: res.ok ? "" : res.evidence.observed.detector, evidenceEqualsRawPII: !res.ok && frag.includes(res.evidence.observed.substring), text });
}
for (const [label, [inScope, isPII, g]] of Object.entries(gens)) for (let i = 0; i < 100; i++) {
  const frag = g(i); const text = `${randText(r, 30)} ${frag} ${randText(r, 30)}`;
  await scorePii(label, inScope, isPII, "original", frag, text);
}
// non-string field: PII inside an object at the checked path
for (let i = 0; i < 100; i++) { const res = await L.evaluateTripwires({ answer: { note: `mail ${pick(["a@b.com", "x@y.org"])}` } }, [L.inv.noPII("answer")]);
  pii.push({ label: "nested-object-email", set: "original", inScope: true, isPII: true, flagged: !res.ok, detector: res.ok ? "" : res.evidence.observed.detector, evidenceEqualsRawPII: false, text: "{answer:{note:...email}}" }); }

// ---------- Added PII labels ----------
// Appended after every original draw, so the data above does not depend on them.
// These were not written alongside the detector: real PII in support and CRM prose
// with no SSN/phone cue word or with a non-label word (customer, account, patient,
// ID) in front, card networks beyond Visa/Mastercard/Amex, and bare numbers that
// are not PII and carry no identifier label. Generators return either a
// fragment (wrapped in random text like the original set) or { text, frag } for a
// full sentence, table, or CSV row.
function luhnValid(s) {
  const ds = s.replace(/\D/g, "").split("").map(Number); let sum = 0;
  for (let i = ds.length - 1, dbl = false; i >= 0; i--, dbl = !dbl) { let x = ds[i]; if (dbl) { x *= 2; if (x > 9) x -= 9; } sum += x; }
  return sum % 10 === 0;
}
const card = (prefix, len) => { const n = luhnComplete(prefix, len); if (!luhnValid(n) || n.length !== len) throw new Error(`generated card ${prefix}/${len} is not Luhn-valid`); return n; };
const spaced = (n) => (n.length === 14 ? grp(n, [4, 6, 4]) : n.length === 15 ? grp(n, [4, 6, 5]) : n.length === 19 ? grp(n, [4, 4, 4, 4, 3]) : grp(n, [4, 4, 4, 4])).join(" ");
const cardForm = (n, i) => (i % 2 ? spaced(n) : n);
const ssnD = () => `${d(3)}-${d(2)}-${d(4)}`;
const phoneD = () => `${nanp(d(10)).replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3")}`;
const nz = (n) => String(1 + Math.floor(r() * 9)) + d(n - 1);
const full = (text, frag) => ({ text, frag });
function aba() { const ds = (pick(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32"]) + d(6)).split("").map(Number);
  const w = [3, 7, 1, 3, 7, 1, 3, 7]; const s = ds.reduce((a, x, k) => a + x * w[k], 0); return ds.join("") + ((10 - (s % 10)) % 10); }
const gens2 = {
  // label: [inScope, isPII, generator]
  "crm-customer-ssn": [true, true, () => { const v = ssnD(); return full(`Customer SSN ${v} on file.`, v); }],
  "crm-customer-ssn-nodash": [true, true, () => { const v = d(9); return full(`Customer SSN ${v} verified by the agent.`, v); }],
  "crm-account-holder-ssn-spaced": [true, true, () => { const v = `${d(3)} ${d(2)} ${d(4)}`; return full(`Account holder SSN ${v}.`, v); }],
  "crm-patient-id-ssn": [true, true, () => { const v = ssnD(); return full(`Patient ID ${v} (SSN) added to the chart.`, v); }],
  "crm-customer-phone": [true, true, () => { const v = phoneD(); return full(`Customer phone ${v}.`, v); }],
  "crm-customer-phone-plain10": [true, true, () => { const v = nanp(d(10)); return full(`Customer phone ${v}.`, v); }],
  "crm-call-customer": [true, true, () => { const v = phoneD(); return full(`Please call the customer at ${v} today.`, v); }],
  "crm-call-customer-plain10": [true, true, () => { const v = nanp(d(10)); return full(`Please call the customer at ${v} today.`, v); }],
  "crm-customer-card": [true, true, (i) => { const v = cardForm(card(pick(["4", "51", "55"]), 16), i); return full(`customer card ${v} was declined`, v); }],
  "crm-multiline-ticket": [true, true, () => { const p = nanp(d(10)); const v = `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}`; return full(`Ticket #${d(5)}\nCustomer: ${pick(names)}\nPhone: ${v}\nIssue: refund not received`, v); }],
  "crm-csv-ssn": [true, true, () => { const v = ssnD(); return full(`ticket,customer,ssn\n${d(6)},${pick(names)},${v}`, v); }],
  "crm-csv-phone": [true, true, () => { const v = phoneD(); return full(`ticket,customer,phone\n${d(6)},${pick(names)},${v}`, v); }],
  "crm-csv-ssn-undashed": [true, true, () => { const v = d(9); return full(`customer_id,ssn\n${d(6)},${v}`, v); }],
  "crm-markdown-row": [true, true, () => { const v = ssnD(); return full(`| Customer | SSN | Notes |\n|---|---|---|\n| ${pick(names)} | ${v} | callback requested |`, v); }],
  "crm-markdown-card": [true, true, (i) => { const v = cardForm(card(pick(["4", "52"]), 16), i); return full(`| Customer | Card |\n|---|---|\n| ${pick(names)} | ${v} |`, v); }],
  // card networks without an issuer allowlist (wrapped in random text)
  "cc-unionpay": [true, true, (i) => cardForm(card("62", 16), i)],
  "cc-maestro": [true, true, (i) => cardForm(card(pick(["5018", "5020", "5038", "6304", "6759", "6761", "6763"]), pick([16, 19])), i)],
  "cc-mir": [true, true, (i) => cardForm(card(pick(["2200", "2201", "2202", "2203", "2204"]), 16), i)],
  "cc-diners-309": [true, true, (i) => cardForm(card("309", 14), i)],
  "cc-diners-39": [true, true, (i) => cardForm(card("39", 14), i)],
  "cc-rupay": [true, true, (i) => cardForm(card(pick(["60", "65", "81", "82", "508"]), 16), i)],
  // uncued numeric negatives
  "neg-epoch-seconds": [null, false, () => { const v = String(1600000000 + Math.floor(r() * 400000000)); return full(pick([`Job finished at unix time ${v}.`, `created_at: ${v}`, `ts=${v} level=info`]), v); }],
  "neg-epoch-ms": [null, false, () => { const v = String(1600000000000 + Math.floor(r() * 400000000000)); return full(pick([`created_at_ms: ${v}`, `event timestamp ${v} ms`]), v); }],
  "neg-bytes-9digit": [null, false, () => { const v = nz(9); return full(`The file is ${v} bytes.`, v); }],
  "neg-bytes-10digit": [null, false, () => { const v = nz(10); return full(`Upload size ${v} bytes`, v); }],
  "neg-population": [null, false, () => { const v = String(100000000 + Math.floor(r() * 900000000)); return full(`Population was ${v} in 2020.`, v); }],
  "neg-aba-routing": [null, false, () => { const v = aba(); return full(pick([`Routing number ${v} for the wire.`, `ABA ${v}`]), v); }],
  "neg-spaced-triple": [null, false, () => { const v = `${nz(3)} ${nz(2)} ${nz(4)}`; return full(pick([`tensor shape ${v}`, `buffer sizes ${v}`, `grid ${v} cells`]), v); }],
  "neg-decimal": [null, false, () => { const v = pick([`${d(1)}.${d(10)}`, `0.${d(9)}`]); return full(`ratio ${v}`, v); }],
  "neg-zip4-nodash": [null, false, () => { const v = `75080${d(4)}`; return full(`Ship to Richardson TX ${v}`, v); }],
  "neg-build-id": [null, false, () => { const v = pick([`20${d(8)}`, nz(10)]); return full(pick([`build ${v}`, `Build #${v} passed`, `release ${v}`]), v); }],
};
for (const [label, [inScope, isPII, g]] of Object.entries(gens2)) for (let i = 0; i < 100; i++) {
  const out = g(i);
  if (typeof out === "string") await scorePii(label, inScope, isPII, "new", out, `${randText(r, 30)} ${out} ${randText(r, 30)}`);
  else await scorePii(label, inScope, isPII, "new", out.frag, out.text);
}

const prf = (xs) => { const tp = xs.filter((x) => x.isPII && x.flagged).length, fp = xs.filter((x) => !x.isPII && x.flagged).length, fn = xs.filter((x) => x.isPII && !x.flagged).length, tn = xs.filter((x) => !x.isPII && !x.flagged).length;
  return { n: xs.length, tp, fp, fn, tn, precision: tp + fp ? +(tp / (tp + fp)).toFixed(4) : null, recall: tp + fn ? +(tp / (tp + fn)).toFixed(4) : null }; };
const negs = pii.filter((x) => !x.isPII);
const origNegs = negs.filter((x) => x.set === "original"), newNegs = negs.filter((x) => x.set === "new");
const posIn = pii.filter((x) => x.isPII && x.inScope === true), posOut = pii.filter((x) => x.isPII && x.inScope === false), posAll = pii.filter((x) => x.isPII);
const allLabels = Object.keys(gens).concat("nested-object-email", Object.keys(gens2));
const piiSummary = {
  // Headline keys (read by 06-report.py). They include the added labels and negatives.
  overall_allPII: prf(pii), inScopeOnly: prf([...posIn, ...negs]), outOfScopeOnly: prf([...posOut, ...negs]),
  byLabel: allLabels.map((l) => { const xs = pii.filter((x) => x.label === l); return { label: l, set: xs[0].set, isPII: xs[0].isPII, inScope: xs[0].inScope, n: xs.length, flaggedRate: xs.filter((x) => x.flagged).length / xs.length }; }),
  evidenceContainsRawPIIRate: pii.filter((x) => x.flagged).length ? pii.filter((x) => x.evidenceEqualsRawPII).length / pii.filter((x) => x.flagged).length : null,
  // Variants, so the headline is not read only on the set written alongside the detector.
  overall_originalNegatives: prf([...posAll, ...origNegs]),
  inScopeOnly_originalNegatives: prf([...posIn, ...origNegs]),
  originalLabels_inScope: prf(pii.filter((x) => x.set === "original" && (x.inScope === true || !x.isPII))),
  originalLabels_all: prf(pii.filter((x) => x.set === "original")),
  newLabels_inScope: prf(pii.filter((x) => x.set === "new")),
  newNegatives: { n: newNegs.length, fp: newNegs.filter((x) => x.flagged).length, tn: newNegs.filter((x) => !x.flagged).length, falsePositiveRate: newNegs.length ? +(newNegs.filter((x) => x.flagged).length / newNegs.length).toFixed(4) : null },
  originalNegatives: { n: origNegs.length, fp: origNegs.filter((x) => x.flagged).length, tn: origNegs.filter((x) => !x.flagged).length, falsePositiveRate: origNegs.length ? +(origNegs.filter((x) => x.flagged).length / origNegs.length).toFixed(4) : null },
  labelSets: { original: Object.keys(gens).concat("nested-object-email"), new: Object.keys(gens2), relabeled: ["ssn-spaced", "phone-plain10"] },
};

// ---------- must-cite labeled set ----------
// Default matching is case-sensitive and reads `source` (or a string). `caseInsensitive`
// and `keys` are explicit options, so a case variant or an `id` field is a miss unless opted in.
// The default never reads prose: `inline`, `rejectUncited`, and `textPath` are opt-ins.
// The first 15 cases are the original set. Two of them are labeled for the default, which
// does not read prose (CITE_COMMITTED_LABELS holds their prose-by-default labels), and
// their opt-in twins are appended at the end.
const citeCases = [
  ["string-cite", true, { answer: "a", citations: ["doc-a"] }], ["object-cite", true, { answer: "a", citations: [{ source: "doc-a" }] }],
  ["evidence-key", true, { answer: "a", evidence: ["doc-a"] }], ["multi-cite", true, { answer: "a", citations: ["doc-b", "doc-a"] }],
  ["missing", false, { answer: "a" }], ["empty", false, { answer: "a", citations: [] }], ["wrong-doc", false, { answer: "a", citations: ["doc-b"] }],
  ["case-variant", false, { answer: "a", citations: ["Doc-A"] }],
  ["case-variant-opt-in", true, { answer: "a", citations: ["Doc-A"] }, { caseInsensitive: true }],
  ["nested-citations", true, { answer: { text: "a", citations: ["doc-a"] } }],
  // Default: prose is not read, so an inline marker alone is not a citation.
  ["inline-text-only", false, { answer: "per [doc-a], refund" }],
  ["object-other-key", false, { answer: "a", citations: [{ id: "doc-a" }] }],
  ["object-id-key", true, { answer: "a", citations: [{ id: "doc-a" }] }, { keys: ["id"] }],
  // Default: the list names the artifact and prose is not read, so a competing bracket does not fail it.
  ["hallucinated-cite-string", true, { answer: "Refund per [Smith 1999].", citations: ["doc-a"] }],
  // A named array with no contradictory bracket is accepted: support is not a syntactic property.
  ["named-without-brackets", true, { answer: "a", citations: ["doc-a"] }],
  // ---- appended: default behavior (no inline / rejectUncited / textPath) ----
  ["numeric-marker-with-list", true, { answer: "Refunds take 5 days [1].", citations: ["doc-a"] }],
  ["numeric-markers-multi", true, { answer: "See [1][2] for details.", citations: ["doc-a", "doc-b"] }],
  ["numeric-marker-without-list", false, { answer: "Refunds take 5 days [1]." }],
  ["markdown-link-with-list", true, { answer: "See [the refund policy](https://example.com/policy).", citations: ["doc-a"] }],
  ["sic-with-list", true, { answer: 'The customer wrote "recieved" [sic].', citations: ["doc-a"] }],
  ["path-scoped-title-brackets", true, { title: "Refund policy [Smith 1999] notes", answer: "a", refs: ["doc-a"] }, { path: "refs" }],
  ["path-scoped-list-omits", false, { title: "Notes [doc-a]", answer: "a", refs: ["doc-b"] }, { path: "refs" }],
  // ---- appended: opt-in prose checks ----
  ["inline-text-only-opt-in", true, { answer: "per [doc-a], refund" }, { inline: true }],
  ["inline-paren-locator-opt-in", true, { answer: "Refund allowed (doc-a, p. 4)." }, { inline: true }],
  ["inline-near-miss-opt-in", false, { answer: "per [doc-a.v2], refund" }, { inline: true }],
  ["inline-link-text-opt-in", false, { answer: "See [doc-a](https://example.com/a)." }, { inline: true }],
  ["inline-list-omits-opt-in", false, { answer: "per [doc-a], refund", citations: ["doc-b"] }, { inline: true }],
  ["inline-textPath-other-field-opt-in", false, { answer: "Refund approved.", note: "[doc-a]" }, { inline: true, textPath: "answer" }],
  ["hallucinated-cite-string-opt-in", false, { answer: "Refund per [Smith 1999].", citations: ["doc-a"] }, { rejectUncited: true }],
  ["rejectUncited-numeric-label-key", true, { answer: "Refunds take 5 days [1].", citations: [{ source: "doc-b", label: "2" }, { source: "doc-a", label: "1" }] }, { rejectUncited: true }],
  ["rejectUncited-numeric-position", true, { answer: "Refunds take 5 days [2].", citations: ["doc-b", "doc-a"] }, { rejectUncited: true }],
  ["rejectUncited-numeric-other-entry", false, { answer: "Refunds take 5 days [1].", citations: ["doc-b", "doc-a"] }, { rejectUncited: true }],
  ["rejectUncited-numeric-out-of-range", false, { answer: "Refunds take 5 days [3].", citations: ["doc-a"] }, { rejectUncited: true }],
  ["rejectUncited-ignores-link-and-sic", true, { answer: 'See [policy](https://example.com/p); the customer wrote "recieved" [sic].', citations: ["doc-a"] }, { rejectUncited: true }],
  ["rejectUncited-textPath-scopes-scan", true, { answer: "Refund approved.", title: "Notes on [Smith 1999]", citations: ["doc-a"] }, { rejectUncited: true, textPath: "answer" }],
  ["rejectUncited-without-textPath-reads-title", false, { answer: "Refund approved.", title: "Notes on [Smith 1999]", citations: ["doc-a"] }, { rejectUncited: true }],
];
// Prose-by-default labels for the original 15 cases, for an agreement figure against
// labels that expect prose to be read by default. Only these two differ from the labels above.
const CITE_COMMITTED_LABELS = { "inline-text-only": true, "hallucinated-cite-string": false };
const ORIGINAL_CITE_CASES = 15;
const cite = [];
for (const [idx, [label, shouldPass, out, options]] of citeCases.entries()) {
  const res = await L.evaluateTripwires(out, [L.inv.mustCite("doc-a", options)]);
  const mode = options?.inline || options?.rejectUncited || options?.textPath !== undefined ? "opt-in" : "default";
  cite.push({ label, set: idx < ORIGINAL_CITE_CASES ? "original" : "new", mode, labeledSatisfies: shouldPass, passed: res.ok, agree: res.ok === shouldPass });
}
const agreeOf = (xs, key = "labeledSatisfies") => ({ cases: xs.length, agree: xs.filter((c) => c.passed === c[key]).length });
const mustCiteSummary = {
  cases: cite.length, agree: cite.filter((c) => c.agree).length, rows: cite,
  byMode: { default: agreeOf(cite.filter((c) => c.mode === "default")), optIn: agreeOf(cite.filter((c) => c.mode === "opt-in")) },
  original: agreeOf(cite.filter((c) => c.set === "original")),
  originalCommittedLabels: { ...agreeOf(cite.filter((c) => c.set === "original").map((c) => ({ ...c, committed: CITE_COMMITTED_LABELS[c.label] ?? c.labeledSatisfies })), "committed"), relabeled: Object.keys(CITE_COMMITTED_LABELS) },
  new: agreeOf(cite.filter((c) => c.set === "new")),
};

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
writeJSON("policy.json", { routing, pii: piiSummary, mustCite: mustCiteSummary, leakage: leakRows });
console.log(routing);
console.log(JSON.stringify({ o: piiSummary.overall_allPII, oOrigNeg: piiSummary.overall_originalNegatives, i: piiSummary.inScopeOnly, iOrigNeg: piiSummary.inScopeOnly_originalNegatives,
  orig: piiSummary.originalLabels_inScope, new: piiSummary.newLabels_inScope, newNeg: piiSummary.newNegatives, ev: piiSummary.evidenceContainsRawPIIRate }));
console.table(piiSummary.byLabel); console.table(cite); console.log(JSON.stringify({ byMode: mustCiteSummary.byMode, original: mustCiteSummary.original, originalCommittedLabels: mustCiteSummary.originalCommittedLabels, new: mustCiteSummary.new })); console.table(leakRows);
