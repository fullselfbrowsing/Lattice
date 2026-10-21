// Score Lattice noPII and mustCite on public datasets cached under
// REALWORLD_CACHE. Texts are not written into the repo.
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { L, writeJSON } from "./lib.mjs";

const CACHE = process.env.REALWORLD_CACHE ?? "/tmp/realworld-data";
const meta = JSON.parse(readFileSync(`${CACHE}/dataset-meta.json`, "utf8"));

const TYPE_MAP = {
  EMAIL: "email",
  SOCIALNUMBER: "us-ssn",
  TEL: "us-phone",
  CREDITCARD: "credit-card",
  CREDITCARDNUMBER: "credit-card",
  CREDIT_CARD: "credit-card",
  email: "email",
  "e-mail": "email",
  phone: "us-phone",
  phone_number: "us-phone",
  telephone: "us-phone",
  ssn: "us-ssn",
  social_security_number: "us-ssn",
  social_security: "us-ssn",
  credit_card: "credit-card",
  creditcard: "credit-card",
  card_number: "credit-card",
};

function overlaps(start, end, spans) {
  return spans.some((span) => start < span.end && end > span.start);
}

function locate(text, substring) {
  const spots = [];
  let from = 0;
  while (substring && from <= text.length) {
    const at = text.indexOf(substring, from);
    if (at < 0) break;
    spots.push({ start: at, end: at + substring.length });
    from = at + 1;
  }
  return spots;
}

async function* lines(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line) yield JSON.parse(line);
  }
}

function emptyCounts() {
  return { tp: 0, fp: 0, fn: 0, docs: 0, goldDocs: 0 };
}

function pr(c) {
  const precision = c.tp + c.fp === 0 ? null : c.tp / (c.tp + c.fp);
  const recall = c.tp + c.fn === 0 ? null : c.tp / (c.tp + c.fn);
  return { ...c, precision, recall };
}

async function scorePii(path, adapt) {
  const byType = {};
  const labelCounts = {};
  const falsePositiveOverlap = {};
  let docs = 0;
  let outOfScopeOnlyFlagged = 0;
  let outOfScopeOnly = 0;
  for await (const raw of lines(path)) {
    const { text, spans } = adapt(raw);
    docs += 1;
    const gold = {};
    let inScope = false;
    for (const span of spans) {
      const label = String(span.label ?? "");
      labelCounts[label] = (labelCounts[label] ?? 0) + 1;
      const mapped = TYPE_MAP[label] ?? TYPE_MAP[label.toLowerCase()] ?? null;
      if (!mapped) continue;
      inScope = true;
      (gold[mapped] ??= []).push(span);
    }
    const hits = [];
    for (const detector of L.defaultPiiDetectors) {
      const found = detector.detect(text);
      if (!found.matched) continue;
      const spots = locate(text, found.substring);
      hits.push({ name: detector.name, spots });
    }
    if (!inScope) {
      outOfScopeOnly += 1;
      if (hits.length) outOfScopeOnlyFlagged += 1;
    }
    for (const detector of L.defaultPiiDetectors) {
      const bucket = (byType[detector.name] ??= emptyCounts());
      bucket.docs += 1;
      const goldSpans = gold[detector.name] ?? [];
      if (goldSpans.length) bucket.goldDocs += 1;
      const hit = hits.find((item) => item.name === detector.name);
      const matchedGold = hit ? hit.spots.some((spot) => overlaps(spot.start, spot.end, goldSpans)) : false;
      if (hit && matchedGold) bucket.tp += 1;
      else if (hit) {
        bucket.fp += 1;
        const spot = hit.spots[0];
        const covering = (spans ?? [])
          .filter((span) => spot && spot.start < span.end && spot.end > span.start)
          .map((span) => String(span.label))
          .sort();
        const key = covering.join("+") || "(no gold span)";
        const bag = (falsePositiveOverlap[detector.name] ??= {});
        bag[key] = (bag[key] ?? 0) + 1;
      }
      if (goldSpans.length && !matchedGold) bucket.fn += 1;
    }
  }
  const types = Object.fromEntries(Object.entries(byType).map(([name, counts]) => [name, pr(counts)]));
  return { docs, labelCounts, types, falsePositiveOverlap, outOfScopeOnly, outOfScopeOnlyFlagged };
}

function ai4Spans(raw) {
  return {
    text: raw.source_text,
    spans: (raw.privacy_mask ?? []).map((span) => ({
      label: span.label,
      start: span.start,
      end: span.end,
    })),
  };
}

const ai4 = await scorePii(`${CACHE}/english_openpii_8k.jsonl`, ai4Spans);
const gretel = await scorePii(`${CACHE}/gretel.jsonl`, (raw) => ({
  text: raw.text,
  spans: (raw.spans ?? []).map((span) => ({ label: span.label, start: span.start, end: span.end })),
}));

let asqa = { n: 0, withBracket: 0, titleSubstring: 0, mustCiteAnyGold: 0, mustCiteFabricatedWhenBrackets: 0, bracketed: 0 };
const fabricated = "not-a-real-source-zzz";
for await (const row of lines(`${CACHE}/asqa.jsonl`)) {
  asqa.n += 1;
  const answer = String(row.answer ?? "");
  const bracketed = /\[[^\]\n]{1,80}\]/.test(answer);
  if (bracketed) asqa.withBracket += 1;
  const titles = row.titles ?? [];
  if (titles.some((title) => answer.includes(title))) asqa.titleSubstring += 1;
  let any = false;
  for (const title of titles) {
    const result = await L.evaluateTripwires({ answer }, [L.inv.mustCite(title)]);
    if (result.ok) any = true;
  }
  if (any) asqa.mustCiteAnyGold += 1;
  if (bracketed) {
    asqa.bracketed += 1;
    const fake = await L.evaluateTripwires({ answer }, [L.inv.mustCite(fabricated)]);
    if (fake.ok) asqa.mustCiteFabricatedWhenBrackets += 1;
  }
}

function shapeOf(label, text) {
  if (label === "us-ssn") return /^\d{3}-\d{2}-\d{4}$/.test(text) || /^\d{3} \d{2} \d{4}$/.test(text) || /^\d{9}$/.test(text);
  if (label === "us-phone") return /^(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]\d{3}[\s.-]\d{4}$/.test(text) || /^\d{10}$/.test(text);
  if (label === "email") return text.includes("@");
  if (label === "credit-card") return /^\d[\d -]{11,22}\d$/.test(text);
  return false;
}

async function scoreInScopeShapes(path, adapt) {
  const byType = {};
  for (const detector of L.defaultPiiDetectors) byType[detector.name] = { tp: 0, fp: 0, fn: 0, goldSpans: 0 };
  for await (const raw of lines(path)) {
    const { text, spans } = adapt(raw);
    const gold = {};
    for (const span of spans) {
      const mapped = TYPE_MAP[span.label] ?? TYPE_MAP[String(span.label).toLowerCase()] ?? null;
      if (!mapped) continue;
      const surface = text.slice(span.start, span.end);
      if (!shapeOf(mapped, surface)) continue;
      (gold[mapped] ??= []).push(span);
    }
    for (const detector of L.defaultPiiDetectors) {
      const bucket = byType[detector.name];
      const goldSpans = gold[detector.name] ?? [];
      bucket.goldSpans += goldSpans.length;
      const found = detector.detect(text);
      const spots = found.matched ? locate(text, found.substring) : [];
      const matched = spots.some((spot) => overlaps(spot.start, spot.end, goldSpans));
      if (found.matched && matched) bucket.tp += 1;
      else if (found.matched) bucket.fp += 1;
      for (const span of goldSpans) {
        if (!spots.some((spot) => overlaps(spot.start, spot.end, [span]))) bucket.fn += 1;
      }
    }
  }
  return Object.fromEntries(Object.entries(byType).map(([name, counts]) => [name, {
    ...counts,
    precision: counts.tp + counts.fp === 0 ? null : counts.tp / (counts.tp + counts.fp),
    spanRecall: counts.goldSpans === 0 ? null : (counts.goldSpans - counts.fn) / counts.goldSpans,
  }]));
}

const ai4Shapes = await scoreInScopeShapes(`${CACHE}/english_openpii_8k.jsonl`, ai4Spans);
const gretelShapes = await scoreInScopeShapes(`${CACHE}/gretel.jsonl`, (raw) => ({
  text: raw.text,
  spans: (raw.spans ?? []).map((span) => ({ label: span.label, start: span.start, end: span.end })),
}));

let ssnGold = 0; let ssnHit = 0; let ssnMissElsewhere = 0; let ssnMissNone = 0;
const ssnDet = L.defaultPiiDetectors.find((d) => d.name === "us-ssn");
for await (const raw of lines(`${CACHE}/english_openpii_8k.jsonl`)) {
  const text = raw.source_text;
  for (const span of raw.privacy_mask ?? []) {
    if (span.label !== "SOCIALNUMBER") continue;
    const surface = text.slice(span.start, span.end);
    if (!(/^\d{3}-\d{2}-\d{4}$/.test(surface) || /^\d{3} \d{2} \d{4}$/.test(surface) || /^\d{9}$/.test(surface))) continue;
    ssnGold += 1;
    const found = ssnDet.detect(text);
    const at = found.matched ? text.indexOf(found.substring) : -1;
    const ok = found.matched && at < span.end && at + found.substring.length > span.start;
    if (ok) ssnHit += 1;
    else if (found.matched) ssnMissElsewhere += 1;
    else ssnMissNone += 1;
  }
}

const report = {
  datasets: meta,
  unit: "One prediction per document per detector. The detector returns a single match. A match is a true positive when that substring overlaps a gold span of the mapped type. A gold document with no overlapping match is a false negative. A match that overlaps no gold span of that type is a false positive.",
  inScopeMap: ["EMAIL/email -> email", "SOCIALNUMBER/ssn -> us-ssn", "TEL/phone -> us-phone", "credit card labels -> credit-card"],
  ai4privacy: ai4,
  ai4privacy_in_scope_shapes: ai4Shapes,
  gretel_english_test: gretel,
  gretel_in_scope_shapes: gretelShapes,
  shapeRule: "Second pass keeps only gold spans whose surface form matches the detector's stated format (US SSN 9-digit/dashed/spaced, US phone 10-digit or grouped, email containing @). Recall here is span-level. Precision is still one prediction per document.",
  asqa_dev: asqa,
  usSsnSingleMatch: { goldUsShaped: ssnGold, overlappedByTheOneMatch: ssnHit, missedBecauseMatchWasElsewhere: ssnMissElsewhere, noMatch: ssnMissNone },
};
writeJSON("datasets.json", report);
console.log(JSON.stringify({
  ai4: Object.fromEntries(Object.entries(ai4.types).map(([k, v]) => [k, { p: v.precision, r: v.recall, tp: v.tp, fp: v.fp, fn: v.fn, gold: v.goldDocs }])),
  gretel: Object.fromEntries(Object.entries(gretel.types).map(([k, v]) => [k, { p: v.precision, r: v.recall, tp: v.tp, fp: v.fp, fn: v.fn, gold: v.goldDocs }])),
  asqa,
}, null, 2));
