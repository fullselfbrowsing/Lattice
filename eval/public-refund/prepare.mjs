import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { CASES } from "./cases.mjs";

const root = resolve(import.meta.dirname, "../.."), dir = resolve(root, ".context/refund-public/sources");
const sha = (v) => createHash("sha256").update(v).digest("hex");
mkdirSync(dir, { recursive: true });
const cases = [], sources = [];
for (const example of CASES) {
  const path = resolve(dir, example.id + ".pdf");
  assert.equal(sha(readFileSync(path)), example.pdfSha256, "Source PDF differs: " + example.id);
  const text = execFileSync("pdftotext", ["-layout", path, "-"], { encoding: "utf8" });
  const pages = text.split("\f").filter((p) => p.trim().length).map((p) => p.trim());
  assert.equal(pages.length, example.pages);
  const artifacts = pages.map((text, i) => ({ source_id: example.id + "-p" + (i + 1),
    source_url: example.url, pdf_sha256: example.pdfSha256, page: i + 1, text }));
  cases.push({ id: example.id, artifacts });
  sources.push({ id: example.id, title: example.title, url: example.url, pdfSha256: example.pdfSha256,
    pdfBytes: readFileSync(path).length, pages: artifacts.map(({ source_id, page, text }) => ({ source_id, page, textSha256: sha(text), characters: text.length })) });
}
writeFileSync(resolve(root, ".context/refund-public/inputs.json"), JSON.stringify(cases, null, 2) + "\n", { mode: 0o600 });
writeFileSync(resolve(import.meta.dirname, "source-manifest.json"), JSON.stringify({
  retrievedOn: "2026-11-03", extraction: "Poppler pdftotext 26.06.0 -layout, form-feed page split, trim page boundaries; no paraphrase or invented fields in page text.",
  scope: "Actual published decisions; not original company exhibits or complete operational files. PDFs and extracted pages retained locally; public manifest carries source fingerprints rather than redistributing full decisions.", sources,
}, null, 2) + "\n");
console.log(JSON.stringify({ cases: cases.length, pages: sources.reduce((n, s) => n + s.pages.length, 0), inputs: "private exact page text prepared", manifest: "eval/public-refund/source-manifest.json" }));
