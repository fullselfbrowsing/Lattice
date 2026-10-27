import assert from "node:assert/strict";
import { test } from "node:test";
import { detectorSpans, toCodePointSpans, matchedCount } from "./pii-spans.mjs";

test("all matches preserve actual context-dependent offsets", () => {
  const text = "ref 219-09-9999; SSN 219-09-9999";
  const item = { start: 21, end: 32, substring: "219-09-9999" };
  const detector = { findAll: () => [item, item] };
  assert.deepEqual(detectorSpans(detector, text), { mode: "all-matches", spans: [{ start: 21, end: 32 }] });
});

test("legacy custom detection is visibly first-match and refuses ambiguous offsets", () => {
  const detector = { detect: () => ({ matched: true, substring: "secret" }) };
  assert.deepEqual(detectorSpans(detector, "a secret"), {
    mode: "first-match", spans: [{ start: 2, end: 8 }],
  });
  assert.throws(() => detectorSpans(detector, "secret secret"), /ambiguous offsets/);
  assert.throws(() => detectorSpans(detector, "none"), /absent/);
});

test("UTF-16 conversion handles non-BMP text and rejects split surrogate pairs", () => {
  assert.deepEqual(toCodePointSpans("😀abc", [{ start: 2, end: 5 }]), [{ start: 1, end: 4 }]);
  assert.throws(() => toCodePointSpans("😀abc", [{ start: 1, end: 5 }]), /surrogate/);
});

test("overlap matching is one-to-one and finds non-greedy assignments", () => {
  assert.equal(matchedCount([{ start: 0, end: 4 }, { start: 0, end: 5 }],
    [{ start: 0, end: 5 }, { start: 10, end: 15 }]), 1);
  assert.equal(matchedCount([{ start: 0, end: 10 }, { start: 0, end: 3 }],
    [{ start: 0, end: 3 }, { start: 7, end: 10 }]), 2);
});
