// Read-only parity: with the model id swapped, every paid-cohort request body must be byte-identical to the
// body the free cohorts actually sent. Skipped (with a reason) when the private caches are not present.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { CASES } from "../public-refund/cases.mjs";
import { makeIntent } from "../public-refund/workflow.mjs";
import { captureBody, citationRequest } from "./requests.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const bundlesDir = join(ROOT, ".context/refund-public/bundles"), inputsPath = join(ROOT, ".context/refund-public/inputs.json");
const freeFull = join(ROOT, ".context/eval-cache/validated-free-full-private.json");
const freeSmoke = join(ROOT, ".context/eval-cache/validated-free-smoke-private.json");
const split = join(ROOT, ".context/eval-cache/citation-split");
const skip = (paths, what) => { const missing = paths.filter((p) => !existsSync(p)); return missing.length ? `private cache absent (${what}): ${missing.map((m) => m.replace(ROOT + "/", "")).join(", ")}` : false; };
const questions = (file, n) => readFileSync(join(split, file), "utf8").trim().split("\n").map(JSON.parse).slice(0, n);

test("stage A requests equal the free public-refund request bodies", { skip: skip([bundlesDir, inputsPath], "stage A") }, async () => {
  const inputs = read(inputsPath);
  let checked = 0;
  for (const name of readdirSync(bundlesDir).filter((f) => f.endsWith(".json"))) {
    const bundle = read(join(bundlesDir, name));
    const example = { ...CASES.find((c) => c.id === bundle.caseId), artifacts: inputs.find((c) => c.id === bundle.caseId).artifacts };
    assert.equal(bundle.requestBodies.length, 1, name);
    assert.equal(await captureBody(bundle.model, makeIntent(example), "openrouter"), bundle.requestBodies[0], name);
    checked++;
  }
  assert.equal(checked, 16);
});

test("all 60 stage B requests equal the free contract-arm bodies", { skip: skip([freeFull, join(split, "evaluation.jsonl")], "stage B") }, async () => {
  const rows = new Map(read(freeFull).filter((r) => r.suite === "citations" && r.arm === "contract").map((r) => [r.model + "|" + r.id, r]));
  const models = [...new Set([...rows.values()].map((r) => r.model))];
  let checked = 0;
  for (const question of questions("evaluation.jsonl", 60)) {
    for (const model of models) {
      const free = rows.get(model + "|" + question.id);
      assert.ok(free?.lastBody, "free body for " + model + " " + question.id);
      assert.equal(await captureBody(model, citationRequest(question).request), free.lastBody, question.id);
      checked++;
    }
  }
  assert.equal(checked, 60 * models.length);
});

test("the smoke development request equals the free smoke body", { skip: skip([freeSmoke, join(split, "dev.jsonl")], "smoke") }, async () => {
  const [dev] = questions("dev.jsonl", 1);
  const rows = read(freeSmoke).filter((r) => r.suite === "citations" && r.arm === "contract" && r.id === dev.id);
  assert.ok(rows.length > 0, "free smoke rows for the first development question");
  for (const free of rows) assert.equal(await captureBody(free.model, citationRequest(dev).request), free.lastBody);
});
