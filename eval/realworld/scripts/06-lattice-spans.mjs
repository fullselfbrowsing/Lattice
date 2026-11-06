// Emit Lattice noPII spans for the cached public datasets. Texts stay in the cache.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { finished } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { L, ROOT } from "./lib.mjs";
import { detectorSpans } from "./pii-spans.mjs";

const cache = process.env.REALWORLD_CACHE ?? "/tmp/realworld-data";
const outPath = process.env.LATTICE_SPANS ?? `${cache}/lattice-spans.jsonl`;
const out = createWriteStream(outPath);
const contextual = process.env.PII_CONTEXTUAL === "1";
const provenance = {
  commit: execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version,
  latticeVersion: L.latticeVersion,
};

async function* lines(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield JSON.parse(line);
}

async function dump(dataset, path, textOf) {
  let i = 0;
  for await (const raw of lines(path)) {
    const text = textOf(raw);
    const spans = [];
    const extraction = {};
    const t0 = performance.now();
    for (const detector of L.defaultPiiDetectors) {
      const context = contextual ? { contextual: true } : undefined;
      const found = detectorSpans(detector, text, context);
      extraction[detector.name] = found.mode;
      spans.push(...found.spans.map((span) => ({ type: detector.name, ...span })));
    }
    const ms = performance.now() - t0;
    out.write(JSON.stringify({
      dataset, i, ms: +ms.toFixed(4), spans,
      offsetUnit: "utf16", extraction, contextual, provenance,
      textHash: createHash("sha256").update(text).digest("hex"),
    }) + "\n");
    i += 1;
  }
  console.log(dataset, i);
}

if (process.env.PII_DATASET_FILE) {
  if (!process.env.PII_DATASET_NAME) throw new Error("PII_DATASET_NAME is required with PII_DATASET_FILE");
  await dump(process.env.PII_DATASET_NAME, process.env.PII_DATASET_FILE, (raw) => raw.text);
} else {
  await dump("ai4privacy", `${cache}/english_openpii_8k.jsonl`, (raw) => raw.source_text);
  await dump("gretel", `${cache}/gretel.jsonl`, (raw) => raw.text);
}
out.end();
await finished(out);
