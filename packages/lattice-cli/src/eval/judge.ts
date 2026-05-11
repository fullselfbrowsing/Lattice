/**
 * Judge interface, the v1.1 default `noopJudge`, the N=3 median primitive,
 * and the cache-aware `runJudgeWithN` runner (Plan 12-01).
 *
 * CONTEXT.md "Judge implementation is user-supplied at runtime" — `noopJudge`
 * ships only so the eval gate can run end-to-end in tests without a real
 * judge. Real judges are caller-pluggable.
 *
 * Determinism:
 *   - N is pinned at 3 in v1.1 (`medianN3` locks the contract at the function
 *     level — passing any other length throws). `runJudgeWithN` also supports
 *     a defensive fallback for n!==3 (plain median over an odd-length sample),
 *     never used by the runner but kept so the signature is total.
 *   - Judge calls run SEQUENTIALLY inside `runJudgeWithN`. Parallel calls
 *     would make budget unpredictable and break determinism for stateful
 *     judges.
 *
 * Caching:
 *   - Key recipe: SHA-256(fixtureId || NUL || modelFingerprint || NUL ||
 *                          prompt || NUL || JSON.stringify(output))
 *   - Cache hit returns the original samples + score; the judge is NOT
 *     invoked.
 */

import { computeJudgeCacheKey } from "./judge-cache.js";

export interface JudgeInput {
  readonly fixtureId: string;
  readonly output: unknown;
  readonly modelFingerprint: string;
  readonly prompt: string;
}

export interface Judge {
  score(input: JudgeInput): Promise<number>;
}

export interface JudgeRunResult {
  readonly score: number;
  readonly cached: boolean;
  readonly samples: readonly number[];
}

export interface JudgeCache {
  get(
    key: string,
  ): Promise<{ readonly samples: readonly number[]; readonly score: number } | undefined>;
  set(
    key: string,
    value: { readonly samples: readonly number[]; readonly score: number },
  ): Promise<void>;
}

export interface JudgeAggregationError {
  readonly kind: "invalid-samples";
  readonly message: string;
}

function failAgg(message: string): JudgeAggregationError {
  return { kind: "invalid-samples", message };
}

export const noopJudge: Judge = {
  score: async () => 1.0,
};

export function medianN3(samples: readonly number[]): number {
  if (samples.length !== 3) {
    throw failAgg(`medianN3 requires exactly 3 samples; got ${samples.length}`);
  }
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      throw failAgg(`medianN3 samples must be finite numbers; got ${sample}`);
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[1]!;
}

function medianGeneric(samples: readonly number[]): number {
  if (samples.length === 0) {
    throw failAgg("median over empty sample list is undefined");
  }
  for (const sample of samples) {
    if (!Number.isFinite(sample)) {
      throw failAgg(`median samples must be finite numbers; got ${sample}`);
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export async function runJudgeWithN(
  judge: Judge,
  input: JudgeInput,
  n: number,
  cache: JudgeCache,
): Promise<JudgeRunResult> {
  const key = await computeJudgeCacheKey(
    input.fixtureId,
    input.modelFingerprint,
    input.prompt,
    JSON.stringify(input.output),
  );

  const cached = await cache.get(key);
  if (cached !== undefined) {
    return { score: cached.score, cached: true, samples: cached.samples };
  }

  const samples: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const sample = await judge.score(input);
    samples.push(sample);
  }
  const score = n === 3 ? medianN3(samples) : medianGeneric(samples);
  await cache.set(key, { samples, score });
  return { score, cached: false, samples };
}
