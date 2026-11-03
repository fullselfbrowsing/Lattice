import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../../packages/lattice/dist/index.js";
import { CASES, taskFor } from "./cases.mjs";
import { makeIntent, gradeReview, parseReview, verifyBundle, integrityControls } from "./workflow.mjs";

const example = { ...CASES[0], artifacts: Array.from({ length: CASES[0].pages }, (_, i) => ({
  source_id: "moffatt-p" + (i + 1), page: i + 1, text: "Offline integrity-test page; not live evaluation data.",
})) };
const response = () => ({ case_id: example.id, currency: example.currency, execution_authority: "review_only",
  answers: Object.fromEntries(example.questions.map((q) => [q.id, { value: q.expected, source_ids: [example.id + "-p" + q.acceptablePages[0]] }])),
  review_note: "Offline test output; no payment execution." });

test("prompt excludes labels and preserves the public-record review scope", () => {
  const task = taskFor(example);
  assert.ok(task.includes("retrospective document review"));
  assert.ok(!task.includes('"expected"'));
  assert.ok(!task.includes('"acceptablePages"'));
  assert.ok(!task.includes("81202"));
});
test("format, factual value and supporting-page coverage are distinct", () => {
  const value = response();
  assert.equal(gradeReview(JSON.stringify(value), example).strict, true);
  value.answers.ordered_total_minor.value = 1;
  assert.equal(parseReview(JSON.stringify(value), example).valid, true);
  assert.equal(gradeReview(JSON.stringify(value), example).facts, false);
  value.answers.ordered_total_minor.value = 81202;
  value.answers.ordered_total_minor.source_ids = ["moffatt-p1"];
  assert.equal(gradeReview(JSON.stringify(value), example).facts, true);
  assert.equal(gradeReview(JSON.stringify(value), example).citations, false);
  value.answers.settlement_proven.value = false;
  assert.equal(gradeReview(JSON.stringify(value), example).facts, false);
});
test("real runtime signing can preserve an incorrect answer; alterations fail verification", async () => {
  const pair = await L.generateEd25519KeyPairJwk();
  const trust = { kid: "offline-test", publicKeyJwk: pair.publicKeyJwk, state: "active" };
  const signer = L.createInMemorySigner(pair.privateKeyJwk, { kid: trust.kid, publicKeyJwk: pair.publicKeyJwk });
  const keys = L.createMemoryKeySet([trust]), requests = [];
  const value = response(); value.answers.ordered_total_minor.value = 1;
  const ai = L.createAI({ signer, providers: [L.createOpenAICompatibleProvider({ id: "openrouter", model: "offline-fixture",
    baseUrl: "https://fixture.invalid/v1", fetch: async (_url, init) => {
      requests.push(init.body);
      return Response.json({ choices: [{ message: { content: JSON.stringify(value) }, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
    } })] });
  const intent = makeIntent(example), result = await ai.run(intent);
  assert.equal(result.ok, true);
  const bundle = { caseId: example.id, artifacts: example.artifacts, task: intent.task,
    executionPolicy: intent.policy, requestBodies: requests, receipt: result.receipt, outputs: result.outputs };
  assert.equal((await verifyBundle(bundle, keys, example)).evidenceOkay, true);
  assert.equal(gradeReview(result.outputs.answer, example).strict, false);
  const controls = await integrityControls(bundle, keys, example);
  assert.equal(controls.length, 10);
  assert.ok(controls.every((c) => c.passed));
});
