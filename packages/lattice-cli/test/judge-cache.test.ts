/**
 * Tests for the Judge interface, noopJudge, medianN3, computeJudgeCacheKey,
 * createDiskJudgeCache, and runJudgeWithN.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  medianN3,
  noopJudge,
  runJudgeWithN,
  type Judge,
  type JudgeCache,
  type JudgeInput,
} from "../src/eval/judge.js";
import {
  computeJudgeCacheKey,
  createDiskJudgeCache,
  isJudgeCacheError,
} from "../src/eval/judge-cache.js";

function input(over: Partial<JudgeInput> = {}): JudgeInput {
  return {
    fixtureId: over.fixtureId ?? "fx1",
    output: over.output ?? { text: "hello" },
    modelFingerprint: over.modelFingerprint ?? "model-xyz",
    prompt: over.prompt ?? "Rate this:",
  };
}

describe("judge primitives", () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = await mkdtemp(join(tmpdir(), "lattice-judge-"));
  });

  afterEach(() => {});

  it("Test 1: noopJudge.score(input) resolves to 1.0 for arbitrary input", async () => {
    const score = await noopJudge.score(input());
    expect(score).toBe(1.0);
  });

  it("Test 2: medianN3([0.8, 0.9, 0.7]) returns 0.8", () => {
    expect(medianN3([0.8, 0.9, 0.7])).toBe(0.8);
  });

  it("Test 3: medianN3([0.8, NaN, 0.9]) throws { kind: 'invalid-samples' }", () => {
    let thrown: unknown;
    try {
      medianN3([0.8, NaN, 0.9]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { kind: string }).kind).toBe("invalid-samples");
  });

  it("Test 4: medianN3([0.8]) throws (wrong length)", () => {
    let thrown: unknown;
    try {
      medianN3([0.8]);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeDefined();
    expect((thrown as { kind: string }).kind).toBe("invalid-samples");
  });

  it("Test 5: computeJudgeCacheKey is a 64-char lowercase hex string", async () => {
    const key = await computeJudgeCacheKey("fx1", "model-xyz", "Rate this:", '{"x":1}');
    expect(key).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("Test 6: same four inputs produce a stable key across runs", async () => {
    const a = await computeJudgeCacheKey("fx1", "model-xyz", "Rate this:", '{"x":1}');
    const b = await computeJudgeCacheKey("fx1", "model-xyz", "Rate this:", '{"x":1}');
    expect(a).toBe(b);
  });

  it("Test 7: different inputs produce different keys (vary one field at a time)", async () => {
    const base = await computeJudgeCacheKey("fx1", "model-xyz", "Rate this:", '{"x":1}');
    const altFx = await computeJudgeCacheKey("fx2", "model-xyz", "Rate this:", '{"x":1}');
    const altFp = await computeJudgeCacheKey("fx1", "model-OTHER", "Rate this:", '{"x":1}');
    const altPr = await computeJudgeCacheKey("fx1", "model-xyz", "Other prompt", '{"x":1}');
    const altOu = await computeJudgeCacheKey("fx1", "model-xyz", "Rate this:", '{"x":2}');
    expect(altFx).not.toBe(base);
    expect(altFp).not.toBe(base);
    expect(altPr).not.toBe(base);
    expect(altOu).not.toBe(base);
  });

  it("Test 8: createDiskJudgeCache round-trips set/get cleanly", async () => {
    const cache = createDiskJudgeCache(sandbox);
    const key = await computeJudgeCacheKey("fx1", "m", "p", "{}");
    await cache.set(key, { samples: [0.8, 0.9, 0.7], score: 0.8 });
    const loaded = await cache.get(key);
    expect(loaded).toEqual({ samples: [0.8, 0.9, 0.7], score: 0.8 });
  });

  it("Test 9: get on a missing file returns undefined", async () => {
    const cache = createDiskJudgeCache(sandbox);
    const key = await computeJudgeCacheKey("fx1", "m", "p", "{}");
    const loaded = await cache.get(key);
    expect(loaded).toBeUndefined();
  });

  it("Test 10: get on a malformed JSON file returns undefined (best-effort)", async () => {
    const cache = createDiskJudgeCache(sandbox);
    const key = await computeJudgeCacheKey("fx1", "m", "p", "{}");
    await writeFile(join(sandbox, `${key}.json`), "{not-json", "utf8");
    const loaded = await cache.get(key);
    expect(loaded).toBeUndefined();
  });

  it("Test 11: get/set with an invalid key (non-hex) throws { kind: 'invalid-key' }", async () => {
    const cache = createDiskJudgeCache(sandbox);
    let thrownGet: unknown;
    try {
      await cache.get("../../etc/passwd");
    } catch (err) {
      thrownGet = err;
    }
    expect(isJudgeCacheError(thrownGet)).toBe(true);
    expect((thrownGet as { kind: string }).kind).toBe("invalid-key");

    let thrownSet: unknown;
    try {
      await cache.set("NOTHEX", { samples: [1, 1, 1], score: 1 });
    } catch (err) {
      thrownSet = err;
    }
    expect(isJudgeCacheError(thrownSet)).toBe(true);
    expect((thrownSet as { kind: string }).kind).toBe("invalid-key");
  });

  it("Test 12: runJudgeWithN — first call invokes judge 3 times; second call invokes 0 times and returns cached samples", async () => {
    const cache = createDiskJudgeCache(sandbox);
    let calls = 0;
    const counting: Judge = {
      score: async () => {
        calls += 1;
        return 0.9;
      },
    };
    const first = await runJudgeWithN(counting, input(), 3, cache);
    expect(calls).toBe(3);
    expect(first.cached).toBe(false);
    expect(first.samples).toEqual([0.9, 0.9, 0.9]);

    const second = await runJudgeWithN(counting, input(), 3, cache);
    expect(calls).toBe(3); // unchanged
    expect(second.cached).toBe(true);
    expect(second.samples).toEqual([0.9, 0.9, 0.9]);
    expect(second.score).toBe(first.score);
  });

  it("Test 13: runJudgeWithN — when judge produces [0.8, 0.9, 0.7], runJudgeWithN returns score=0.8", async () => {
    const cache = createDiskJudgeCache(sandbox);
    const samples = [0.8, 0.9, 0.7];
    let idx = 0;
    const j: Judge = {
      score: async () => {
        const v = samples[idx]!;
        idx += 1;
        return v;
      },
    };
    const r = await runJudgeWithN(j, input(), 3, cache);
    expect(r.score).toBe(0.8);
    expect(r.samples).toEqual([0.8, 0.9, 0.7]);
    expect(r.cached).toBe(false);
  });
});
