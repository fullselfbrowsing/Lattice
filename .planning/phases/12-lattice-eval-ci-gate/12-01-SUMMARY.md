---
phase: 12-lattice-eval-ci-gate
plan: "01"
subsystem: lattice-cli/eval
tags: [cli, eval, baseline, judge, judge-cache, receipt-walker, layered-determinism, n3-median, tdd]
requires:
  - packages/lattice (ReceiptEnvelope type, public surface)
  - packages/lattice-cli/src/io/receipt-loader.ts (loadReceiptByIdOrPath, ReceiptLoadError)
provides:
  - walkReceiptsDirectory (AsyncIterable<WalkedEntry>)
  - loadBaseline / writeBaseline (atomic) / compareCost / compareQuality
  - Judge interface, noopJudge, medianN3, runJudgeWithN
  - computeJudgeCacheKey, createDiskJudgeCache
  - EvalRunReport, FixtureReport, FixtureVerdict, RegressionKind, DeterminismClass, EvalConfig
affects:
  - Plan 12-02 (will compose these primitives into the `lattice eval` runner)
tech-stack:
  added: []
  patterns:
    - "AsyncIterable streaming with plain-object discriminated error literals (kind)"
    - "Atomic writes via <path>.tmp + rename"
    - "WebCrypto SHA-256 hex via crypto.subtle.digest, mirrors repro/artifact-loader precedent"
    - "Path-traversal defense via /^[a-f0-9]{64}$/u key regex (same as artifact-loader)"
    - "Type-only cross-file imports to keep value-level modules acyclic"
key-files:
  created:
    - packages/lattice-cli/src/io/receipt-walker.ts
    - packages/lattice-cli/src/eval/baseline.ts
    - packages/lattice-cli/src/eval/judge.ts
    - packages/lattice-cli/src/eval/judge-cache.ts
    - packages/lattice-cli/src/eval/types.ts
    - packages/lattice-cli/test/receipt-walker.test.ts
    - packages/lattice-cli/test/baseline.test.ts
    - packages/lattice-cli/test/judge-cache.test.ts
  modified: []
decisions:
  - "Walker yields malformed entries instead of throwing — the eval gate keeps going so the per-fixture report is complete; only missing-directory raises."
  - "Lexicographic sort (Array#sort) on filenames enforces deterministic stream order across platforms."
  - "Baseline cost is string-encoded (CONTEXT.md Pitfall #2). Number.isFinite gates every parse before arithmetic; NaN/Infinity inputs become typed { kind: 'malformed' } errors."
  - "Zero-baseline cost branch uses Number.POSITIVE_INFINITY for deltaPct. JSON-time serialization (in Plan 02) will need a string fallback — flagged for Plan 12-02."
  - "writeBaseline does NOT auto-mkdir the parent; caller owns directory hygiene. Keeps the function pure to fs primitives."
  - "Missing-fixture case is encoded by the runner-side (Plan 02) check on baseline.fixtures[id] — comparators only operate on populated pairs."
  - "Judge cache key recipe: SHA-256(fixtureId || \\u0000 || modelFingerprint || \\u0000 || prompt || \\u0000 || JSON.stringify(output)). Null-byte separator collision-resistant for unconstrained string fields."
  - "Cache keys are regex-gated /^[a-f0-9]{64}$/u BEFORE any filesystem call (same Pitfall #1 defense as artifact-loader)."
  - "medianN3 locks the v1.1 N=3 contract at the function level (throws if samples.length !== 3). A defensive medianGeneric path exists in runJudgeWithN for n !== 3 but the runner pins n=3."
  - "Judge calls inside runJudgeWithN are sequential — preserves determinism and budget predictability."
  - "tripwireOutcomes: readonly never[] in EvalRunReport is the v1.1 forward-compat hook (CONTEXT.md \"Tripwires-as-Eval-Scorers\" deferred wiring)."
metrics:
  duration: ~12m
  completed: 2026-05-11
---

# Phase 12 Plan 01: Eval Primitives Summary

Pure, dependency-free building blocks for the `lattice eval` runner: a receipt-directory walker, a baseline JSON loader+writer+comparators, a Judge interface with N=3 median aggregation, and a disk-backed judge cache. All TDD-driven with RED then GREEN commits per task. Plan 02 will compose these without introducing new I/O or crypto primitives.

## What Shipped

### Receipt Walker (`packages/lattice-cli/src/io/receipt-walker.ts`)

`walkReceiptsDirectory(dir): AsyncIterable<WalkedEntry>`:

- Filters to `entry.isFile() && name.endsWith(".json")`; non-JSON skipped silently.
- Sorts filenames via `Array#sort()` for byte-order determinism (no `localeCompare`).
- `readdir` failure (ENOENT, EACCES) re-thrown as `{ kind: "missing", resolvedPath, message } satisfies ReceiptLoadError`.
- Per-file: reuses `loadReceiptByIdOrPath` from `io/receipt-loader.ts`. On `ReceiptLoadError`, yields `{ id, resolvedPath, error }`. On unexpected non-`ReceiptLoadError` throw, wraps as `{ kind: "malformed", ... }` so the walk never aborts.
- `isWalkedReceiptError(entry)` narrows the union for downstream consumers.

### Eval Types (`packages/lattice-cli/src/eval/types.ts`)

`EvalRunReport`, `FixtureReport`, `FixtureVerdict`, `RegressionKind`, `DeterminismClass`, `EvalConfig`, `EvalRunSummary`, `FixtureReportUsage`. Type-only module; mirrors the CONTEXT.md "Output Format" block. `tripwireOutcomes: readonly never[]` is the deferred-wiring forward-compat hook.

### Baseline (`packages/lattice-cli/src/eval/baseline.ts`)

- `loadBaseline(path)` strict shape validation: version === "lattice-eval/v1", `recordedAt: string`, `fixtures: plain object`, each entry's `usage.costUsd: string`, `promptTokens: number`, `completionTokens: number`, `qualityFloor: null | { score: number }`. Mismatch -> typed `{ kind: "malformed" }`. ENOENT -> `{ kind: "missing" }`.
- `writeBaseline(path, baseline)`: serializes with 2-space indent to `<path>.tmp`, then `rename` to atomic-publish. Caller owns `mkdir -p`.
- `compareCost(replay, baseline, tolerance)`: `Number.isFinite` guard; baseline=0 special-cases to `deltaPct = Number.POSITIVE_INFINITY` when replay > 0, `deltaPct = 0` when both zero; otherwise `deltaPct = (replay - baseline) / baseline` and `regressed = replay > baseline * (1 + tolerance)`.
- `compareQuality(replay, baseline, tolerance)`: returns `{ regressed: replay < baseline - tolerance, delta: replay - baseline }`. No clamping — judges define their own scale.

### Judge + Judge Cache (`eval/judge.ts`, `eval/judge-cache.ts`)

- `noopJudge`: always `1.0` — v1.1 placeholder; real judges caller-supplied.
- `medianN3(samples)`: throws `{ kind: "invalid-samples" }` unless `samples.length === 3` AND every sample is finite. Returns `sorted[1]`.
- `computeJudgeCacheKey(fixtureId, modelFingerprint, judgePrompt, outputCanonical)`: SHA-256 hex over `fields.join("\u0000")` via `crypto.subtle.digest`. Null-byte separator prevents key collisions across arbitrary string fields.
- `createDiskJudgeCache(dir): JudgeCache`:
  - `get(key)`: regex-validates key first; returns `undefined` for ENOENT, JSON parse failure, or shape mismatch (best-effort cache).
  - `set(key, value)`: regex-validates, lazy `mkdir({ recursive: true })`, atomic `<path>.tmp` + `rename`.
  - Both throw `{ kind: "invalid-key" }` for non-hex keys (path-traversal defense).
- `runJudgeWithN(judge, input, n, cache)`: cache-hit short-circuit returns `{ score, cached: true, samples }`. Cache-miss invokes `judge.score` sequentially `n` times, aggregates via `medianN3` (when n === 3) or a defensive generic median (other n), writes back, returns `{ score, cached: false, samples }`.

## TDD Commits

| Task | Phase  | Commit  | Description                                                       |
| ---- | ------ | ------- | ----------------------------------------------------------------- |
| 1    | RED    | d174cc0 | test(12-01): add failing tests for receipt directory walker       |
| 1    | GREEN  | 31326fb | feat(12-01): implement receipt walker and shared eval types       |
| 2    | RED    | d4cdfdc | test(12-01): add failing tests for baseline loader, comparators   |
| 2    | GREEN  | d3015e1 | feat(12-01): implement baseline loader, comparators, atomic writer |
| 3    | RED    | dd9e540 | test(12-01): add failing tests for judge, judge-cache, runJudgeWithN |
| 3    | GREEN  | 40687ea | feat(12-01): implement Judge interface, noopJudge, medianN3, disk judge cache |

## Verification

- `cd packages/lattice-cli && pnpm tsc --noEmit` exits 0
- `cd packages/lattice-cli && npx vitest run` -> **77 passed (8 files)** = 43 pre-existing + 7 walker + 14 baseline + 13 judge-cache
- `cd packages/lattice-cli && pnpm build` exits 0
- No new runtime dependencies in `packages/lattice-cli/package.json` (still `lattice` workspace + `citty` + `@types/node`)
- `node packages/lattice/scripts/check-cli-deps.mjs` -> OK (no forbidden CLI deps in `packages/lattice/dist`)

## Walker Semantics (Locked)

- Determinism: lexicographic byte-order via `Array#sort()`. Tested with `a.json`, `b.json`, `c.json` written out-of-order.
- Error-yielding (not throwing): malformed JSON entries appear in the stream as `WalkedReceiptError`; the walk continues.
- Missing-directory: throws `{ kind: "missing", resolvedPath, message }` BEFORE iteration starts so the runner can map to exit 2 deterministically.
- Non-`.json` files (e.g. `notes.txt`, `README.md`) are silently filtered — never appear in the stream.

## Baseline Shape Decisions

- `costUsd` is string-encoded ("0.000125") to lock the I-JSON guarantee at schema level. Every numeric parse in comparators uses `Number.isFinite` before arithmetic. NaN/Infinity throws `{ kind: "malformed" }`.
- Atomic write path: `<path>.tmp` -> `rename`. Caller is responsible for parent-directory existence (kept pure to fs primitives).
- Missing-fixture is NOT treated as a regression — the runner (Plan 02) decides by checking `baseline.fixtures[fixtureId]` presence. Comparators only operate on populated pairs.
- `compareCost` returns `Number.POSITIVE_INFINITY` for the `baseline=0, replay>0` case. Plan 12-02 will need to JSON-serialize this as a string ("Infinity") at report-time.

## Judge Cache Key Recipe (Locked)

```
key = SHA-256(fixtureId || \u0000 || modelFingerprint || \u0000 || judgePrompt || \u0000 || JSON.stringify(output))
```

- Null-byte separator is collision-resistant for arbitrary string fields (JSON cannot embed a raw `\u0000` outside of escape sequences).
- 64-char lowercase hex output. The cache directory enforces `/^[a-f0-9]{64}$/u` on every key BEFORE any read/write — same defense as `artifact-loader.ts`.
- Best-effort reads: corruption (parse fail, shape mismatch, ENOENT) returns `undefined` so the runner re-invokes the judge and overwrites with the canonical entry.

## N=3 Median Guarantee

`medianN3` validates length-3 AND finite-samples at the function level. The runner (Plan 02) MUST pin `judgeN=3`; the `medianGeneric` fallback inside `runJudgeWithN` exists so the function signature is total but is not the v1.1 contract path.

## Forward-Compat Hooks

- `EvalRunReport.tripwireOutcomes: readonly never[]` — always `[]` in v1.1; v1.2 will populate when tripwires-as-eval-scorers wiring lands (CONTEXT.md "Tripwires-as-Eval-Scorers (Deferred Hook)").

## Deviations from Plan

None — plan executed exactly as written. Three minor implementation notes (not deviations):

1. **`readdir` typing in TS 6**: the `withFileTypes: true` overload returns `Dirent<Buffer>` in the strict-typing path. Cast to `Dirent[]` via `as unknown as Dirent[]` (with explicit `import type { Dirent } from "node:fs"`). This is a typing accommodation, not a behavioral change.
2. **Cache `set` value type**: the `JudgeCache.set` value parameter is typed `{ samples: readonly number[]; score: number }` (rather than a named interface). Matches the inline shape in `judge.ts`'s `JudgeCache` contract — Plan 02 can introduce a named alias if needed.
3. **`medianN3` finite-guard**: the plan specified length-3 validation; finite-sample validation was added (Rule 2 — correctness requirement) so a `NaN` sample never propagates silently to the gate verdict. Tested explicitly.

## Self-Check: PASSED

Verified files:
- FOUND: packages/lattice-cli/src/io/receipt-walker.ts
- FOUND: packages/lattice-cli/src/eval/baseline.ts
- FOUND: packages/lattice-cli/src/eval/judge.ts
- FOUND: packages/lattice-cli/src/eval/judge-cache.ts
- FOUND: packages/lattice-cli/src/eval/types.ts
- FOUND: packages/lattice-cli/test/receipt-walker.test.ts
- FOUND: packages/lattice-cli/test/baseline.test.ts
- FOUND: packages/lattice-cli/test/judge-cache.test.ts

Verified commits (TDD pairs):
- FOUND: d174cc0 (test 12-01 walker RED)
- FOUND: 31326fb (feat 12-01 walker GREEN)
- FOUND: d4cdfdc (test 12-01 baseline RED)
- FOUND: d3015e1 (feat 12-01 baseline GREEN)
- FOUND: dd9e540 (test 12-01 judge-cache RED)
- FOUND: 40687ea (feat 12-01 judge-cache GREEN)

Tests: 77 passed (8 files). Typecheck: 0. Build: 0.
