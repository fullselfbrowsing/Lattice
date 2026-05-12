/**
 * Deterministic stub judge factory for the work-inbox showcase + Plan 02
 * eval-runner cases (EVAL-03 N=3 median, EVAL-04 cache reuse).
 *
 * NOTE: the closure with state (scores array, index, callCount) lives only in
 *       the test/showcase process — the receipt/sidecar never serialize this
 *       closure. The cyclic scoring schedule lets Plan 02 verify N=3 median
 *       ([0.6, 0.8, 0.7] -> 0.7) and cache-hit semantics (a second eval call
 *       on the same input must NOT advance the counter past the first call's
 *       3 calls). The `STUB_JUDGE_PROMPT` constant is the cache-key prompt so
 *       the showcase and Plan 02 tests share the same identity.
 */

/**
 * Stable prompt string used as the judge identity for cache-key hashing.
 * Both the showcase and Plan 02 tests must import this constant so the
 * cache key is byte-identical on both sides.
 *
 * @type {string}
 */
export const STUB_JUDGE_PROMPT = "lattice-stub-judge-v1";

/**
 * Build a deterministic cyclic-score Judge for showcase + Plan 02 tests.
 *
 * The factory closes over the `scores` array and a 0-based index. Each
 * `score()` call:
 *   1. Returns `scores[index % scores.length]` (cyclic).
 *   2. Increments `index`.
 *   3. Increments the `callCount` counter.
 *
 * The judge is intentionally stateless with respect to `input` — the
 * scoring schedule is determined only by call order, not by
 * `input.fixtureId` or `input.output`. This keeps the cache-key hash
 * stable across runs even when the schedule is reused for different
 * fixtures.
 *
 * @param {readonly number[]} scores - Cyclic sequence of scores to return.
 *   Must be non-empty; values should be finite numbers in 0..1.
 * @returns {{
 *   judge: { score: (input: unknown) => Promise<number> },
 *   readonly callCount: number,
 * }}
 */
export function stubScoringJudge(scores) {
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new Error("stubScoringJudge: scores must be a non-empty array");
  }
  for (const sample of scores) {
    if (typeof sample !== "number" || !Number.isFinite(sample)) {
      throw new Error(
        `stubScoringJudge: scores must be finite numbers, got ${String(sample)}`,
      );
    }
  }

  let index = 0;
  let callCount = 0;

  const judge = {
    score: async (_input) => {
      const value = scores[index % scores.length];
      index += 1;
      callCount += 1;
      return value;
    },
  };

  return {
    judge,
    get callCount() {
      return callCount;
    },
  };
}
