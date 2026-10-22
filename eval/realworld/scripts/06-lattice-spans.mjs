// Emit Lattice noPII spans for the cached public datasets. Texts stay in the cache.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createWriteStream } from "node:fs";
import { L } from "./lib.mjs";

const cache = process.env.REALWORLD_CACHE ?? "/tmp/realworld-data";
const outPath = process.env.LATTICE_SPANS ?? `${cache}/lattice-spans.jsonl`;
const out = createWriteStream(outPath);

async function* lines(path) {
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) if (line) yield JSON.parse(line);
}

async function dump(dataset, path, textOf) {
  let i = 0;
  for await (const raw of lines(path)) {
    const text = textOf(raw);
    const spans = [];
    const t0 = performance.now();
    for (const detector of L.defaultPiiDetectors) {
      const found = detector.detect(text);
      if (!found.matched || !found.substring) continue;
      // Same rule as 02-score.mjs locate(): every occurrence of the one returned substring.
      let from = 0;
      while (from <= text.length) {
        const at = text.indexOf(found.substring, from);
        if (at < 0) break;
        spans.push({ type: detector.name, start: at, end: at + found.substring.length });
        from = at + 1;
      }
    }
    const ms = performance.now() - t0;
    out.write(JSON.stringify({ dataset, i, ms: +ms.toFixed(4), spans }) + "\n");
    i += 1;
  }
  console.log(dataset, i);
}

await dump("ai4privacy", `${cache}/english_openpii_8k.jsonl`, (raw) => raw.source_text);
await dump("gretel", `${cache}/gretel.jsonl`, (raw) => raw.text);
out.end();
