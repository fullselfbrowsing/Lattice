import test from "node:test";
import assert from "node:assert/strict";
import { parseJudge, createJudgePacer } from "./free-judge-utils.mjs";

const value = { claims: [{ supported: true, cited: true, citationCount: 1, relevantCitations: 1 }], answerCorrect: true, abstained: false };
test("judge normalization removes only one outer fence and preserves typed labels", () => {
  const raw = JSON.stringify(value);
  assert.deepEqual(parseJudge(raw), { judgeValid: true, judgeWrappedJson: false, ...value });
  assert.deepEqual(parseJudge("```json\n" + raw + "\n```"), { judgeValid: true, judgeWrappedJson: true, ...value });
  assert.equal(parseJudge("Here is the answer: " + raw).judgeValid, false);
  assert.equal(parseJudge(JSON.stringify({ ...value, answerCorrect: "true" })).judgeValid, false);
  assert.equal(parseJudge(JSON.stringify({ ...value, claims: [{ ...value.claims[0], relevantCitations: 2 }] })).judgeValid, false);
});

test("concurrent grading gets distinct paced slots and honors a server delay", async () => {
  let time = 10000;
  const pacer = createJudgePacer({ now: () => time, sleep: async (ms) => { time += ms; } });
  const starts = await Promise.all([pacer.pace(), pacer.pace(), pacer.pace(), pacer.pace()]);
  assert.deepEqual(starts, [10000, 13200, 16400, 19600]);
  pacer.defer(10000);
  assert.equal(await pacer.pace(), 29600);
});
