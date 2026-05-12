---
phase: 12-lattice-eval-ci-gate
verified: 2026-05-11T20:19:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Phase 12: lattice eval CI Gate Verification Report

**Phase Goal:** `lattice eval` walks a fixture directory of receipts, replays each via `replayOffline`, and gates baseline-relative cost-per-task and quality-floor regressions with judge caching, layered determinism classes, and a CI-friendly non-zero exit on regression.
**Verified:** 2026-05-11T20:19:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                              | Status     | Evidence                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `lattice eval` is a citty lazy subcommand registered in cli.ts alongside repro/verify                                              | VERIFIED   | `src/cli.ts:15` registers `eval: () => import("./commands/eval.js").then((m) => m.default)`; `node dist/cli.js eval --help` prints flag list; build produces separate `dist/eval-CP2IoXKG.js` chunk (28.46 kB)                                       |
| 2   | All 8 required flags parsed by citty (`--fixtures`, `--baseline`, `--key`, `--judge-cache`, `--cost-tolerance`, `--quality-tolerance`, `--judge-n`, `--init-baseline`) | VERIFIED   | `src/commands/eval.ts:285-333` declares all 8 (plus bonus `--artifacts`, `--judge-prompt`); `--help` output confirms all flags rendered; `buildEvalConfig` test case 10 asserts defaults                                                              |
| 3   | Layered determinism classes implemented: exact -> semantic-cheap (no-op v1.1) -> semantic-expensive (judge with N=3 median)        | VERIFIED   | `runner.ts:218-243` Stage 5 hash compare with short-circuit on mismatch; `runner.ts:245` comment confirms Stage 6 no-op; `runner.ts:247-265` Stage 7 invokes `runJudgeWithN` only when `qualityFloor !== null`; `judge.ts:67-78` locks N=3 median       |
| 4   | Baseline-relative cost/quality gating with configurable tolerances (defaults 0.10 / 0.05)                                         | VERIFIED   | `runner.ts:273-298` calls `compareCost`/`compareQuality` against `baselineEntry`; `commands/eval.ts:105-106` defaults `costTolerance: 0.1`, `qualityTolerance: 0.05`; `baseline.ts:142-160` uses `replay > baseline * (1+tolerance)` formula           |
| 5   | Judge cache keyed by SHA-256(fixtureId, modelFingerprint, judgePrompt, outputCanonical) and persists across runs                  | VERIFIED   | `judge-cache.ts:68-78` `computeJudgeCacheKey` joins fields with `\u0000` and digests via `crypto.subtle.digest("SHA-256", ...)`; `createDiskJudgeCache` reads/writes `<dir>/<key>.json`; eval-runner Test 7 asserts judge calls = 3 across 2 sessions |
| 6   | Receipt walker, baseline loader, judge cache, runEvalSession all present and wired                                                | VERIFIED   | Files exist: `io/receipt-walker.ts`, `eval/baseline.ts`, `eval/judge.ts`, `eval/judge-cache.ts`, `eval/runner.ts`, `eval/types.ts`; runner imports and composes all primitives                                                                         |
| 7   | stdout single-line JSON EvalRunReport with `tripwireOutcomes: []` forward-compat slot; exit codes 0/1/2                            | VERIFIED   | `commands/eval.ts:155` `deps.stdout(JSON.stringify(report))` single line; `types.ts:55` `tripwireOutcomes: readonly never[]`; `runner.ts:336` returns `[]`; `commands/eval.ts:273-276` maps `regressed > 0` to exit 1, else 0; `fail()` -> exit 2     |
| 8   | `--init-baseline` writes new baseline and exits 0; handler tests use mock argv; bin smoke test in cli.test.ts                     | VERIFIED   | `commands/eval.ts:241-270` skip-load-load-via-runner path then `writeBaselineFn` then `exit(0)`; `test/eval.test.ts` 10 mock-argv cases; `test/cli.test.ts:59-65` `runBin(["eval"])` asserts exit 2 + FAIL line shape                                  |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                              | Expected                                                                  | Status     | Details                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `packages/lattice-cli/src/commands/eval.ts`           | citty subcommand handler with runEval + defineCommand                     | VERIFIED   | 363 lines; exports `runEval`, `buildEvalConfig`, default `defineCommand`; declares all 10 flags                  |
| `packages/lattice-cli/src/cli.ts`                     | Registers eval as lazy subcommand                                         | VERIFIED   | Line 15: `eval: () => import("./commands/eval.js").then((m) => m.default)`                                       |
| `packages/lattice-cli/src/eval/runner.ts`             | `runEvalSession(config, deps)` composes pipeline                          | VERIFIED   | 339 lines; orchestrates walker + materialize + verify + replay + judge + baseline gates                          |
| `packages/lattice-cli/src/eval/baseline.ts`           | `loadBaseline`, `writeBaseline`, `compareCost`, `compareQuality`           | VERIFIED   | 183 lines; atomic write via `<path>.tmp` + rename; finite-cost guard via Number.isFinite                         |
| `packages/lattice-cli/src/eval/judge.ts`              | `Judge`, `noopJudge`, `medianN3`, `runJudgeWithN`                          | VERIFIED   | 122 lines; `noopJudge` returns 1.0; `medianN3` locks N=3 contract; sequential judge calls                        |
| `packages/lattice-cli/src/eval/judge-cache.ts`        | `computeJudgeCacheKey` (SHA-256), `createDiskJudgeCache`                  | VERIFIED   | 141 lines; key regex `/^[a-f0-9]{64}$/u`; atomic writes; null-byte separator in key recipe                       |
| `packages/lattice-cli/src/eval/types.ts`              | `EvalRunReport`, `FixtureReport`, `EvalConfig`, etc.                       | VERIFIED   | 80 lines; type-only module; `tripwireOutcomes: readonly never[]` forward-compat slot                             |
| `packages/lattice-cli/src/io/receipt-walker.ts`       | `walkReceiptsDirectory(dir): AsyncIterable<WalkedEntry>`                  | VERIFIED   | 101 lines; lexicographic sort; ENOENT -> throws missing; malformed -> yields error entry                         |
| `packages/lattice-cli/test/eval.test.ts`              | Mock argv tests (10 cases)                                                | VERIFIED   | All 10 cases pass; vitest run reports green                                                                       |
| `packages/lattice-cli/test/eval-runner.test.ts`       | 11 runner test cases (match/drift/regression/load-failed/init/cache)      | VERIFIED   | 11 cases pass per Plan 02 SUMMARY                                                                                |
| `packages/lattice-cli/test/cli.test.ts`               | Bin smoke test for `eval`                                                 | VERIFIED   | Smoke test passes after rebuild; asserts exit 2 + FAIL line shape                                                |

### Key Link Verification

| From                                            | To                                                       | Via                                                            | Status   | Details                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `src/cli.ts`                                    | `src/commands/eval.ts`                                   | lazy `import("./commands/eval.js")`                            | WIRED    | Build emits separate `dist/eval-CP2IoXKG.js` chunk confirming lazy split                         |
| `src/commands/eval.ts`                          | `src/eval/runner.ts`                                     | `runSession ?? runEvalSession` in `runEval`                    | WIRED    | Line 50, 168, 181 import and invoke `runEvalSession`                                             |
| `src/commands/eval.ts`                          | `src/eval/baseline.ts`                                   | `writeBaseline` in --init-baseline branch                      | WIRED    | Line 257 `await writeBaselineFn(config.baselinePath, baseline)`                                  |
| `src/eval/runner.ts`                            | `src/io/receipt-walker.ts`                               | `for await (... of walkReceiptsDirectory)`                     | WIRED    | Line 179 iterates `walkReceiptsDirectory(config.fixturesDir)`                                    |
| `src/eval/runner.ts`                            | `lattice` (public surface)                               | `materializeReplayEnvelope`, `replayOffline`, `verifyReceipt`  | WIRED    | Lines 192, 204, 212 invoke all three                                                              |
| `src/eval/runner.ts`                            | `src/eval/judge.ts`                                      | `runJudgeWithN(judge, input, n, cache)`                        | WIRED    | Line 253 invokes `runJudgeWithN` with `qualityFloor` gate                                        |
| `src/eval/judge-cache.ts`                       | `crypto.subtle.digest`                                   | `computeJudgeCacheKey` (SHA-256 hex)                            | WIRED    | Line 76 `crypto.subtle.digest("SHA-256", bytes)`                                                  |

### Data-Flow Trace (Level 4)

| Artifact                            | Data Variable      | Source                                                                          | Produces Real Data    | Status    |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------- | --------------------- | --------- |
| `src/commands/eval.ts` (handler)    | `report`           | `await runSession(config, runnerDeps)`                                          | Yes (real EvalRunReport from runner; tests verify pass/regression/load-failed shapes) | FLOWING   |
| `src/eval/runner.ts` (runEvalSession) | `fixtures` array  | `walkReceiptsDirectory` + per-fixture pipeline                                  | Yes (each fixture goes through verify+replay+judge+baseline compare)                  | FLOWING   |
| `src/eval/baseline.ts`              | `Baseline`         | `readFile(path)` -> `JSON.parse` -> shape validation                            | Yes (real fs read with typed errors)                                                  | FLOWING   |
| `src/eval/judge-cache.ts`           | cached entry       | `readFile(<dir>/<key>.json)` -> JSON parse -> shape validation                  | Yes (real disk cache; eval-runner Test 7 confirms cross-session persistence)          | FLOWING   |

### Behavioral Spot-Checks

| Behavior                                                              | Command                                                                              | Result                                                                                              | Status |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------ |
| TypeScript typecheck clean                                            | `cd packages/lattice-cli && pnpm tsc --noEmit`                                       | Exit 0, no output                                                                                   | PASS   |
| Full vitest suite green                                               | `cd packages/lattice-cli && pnpm vitest run`                                         | 99 tests passed in 10 files                                                                         | PASS   |
| Production build succeeds                                             | `cd packages/lattice-cli && pnpm build`                                              | Exit 0; emits `dist/eval-CP2IoXKG.js` (28.46 kB) as separate lazy chunk                             | PASS   |
| `lattice eval --help` prints all 8 required flags                     | `node dist/cli.js eval --help`                                                       | Renders all of `--fixtures`, `--baseline`, `--key`, `--judge-cache`, `--init-baseline`, `--cost-tolerance`, `--quality-tolerance`, `--judge-n` plus `--artifacts` and `--judge-prompt` | PASS   |
| Bin smoke (eval against empty cwd) returns exit 2 + FAIL line          | `node dist/cli.js eval` (via `runBin` in cli.test.ts)                                | Exit 2, stderr matches `/^FAIL kind=(receipt|keyset|baseline|session)-(missing|malformed|failed)/m` | PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                                                                                  | Status     | Evidence                                                                                                                              |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| EVAL-01     | 12-01,12-03 | `lattice eval [--fixtures <dir>]` discovers receipts under `.lattice/receipts/`, replays each via `replayOffline`, emits structured report                                  | SATISFIED  | Walker discovers `.json` receipts; runner replays via `replayOffline`; handler emits JSON report on stdout                            |
| EVAL-02     | 12-01,12-02 | Baseline-relative regression on `usage.costUsd` and `qualityFloor` score; exits non-zero on regression                                                                       | SATISFIED  | `compareCost`/`compareQuality` with configurable tolerances; handler maps `regressed > 0` to exit 1                                   |
| EVAL-03     | 12-01,12-02 | LLM judge with N=3 repetitions aggregated via median                                                                                                                         | SATISFIED  | `medianN3` locks N=3 contract; `runJudgeWithN` invokes judge sequentially 3 times and aggregates                                       |
| EVAL-04     | 12-01       | Judge outputs cached on disk by `hash(fixtureId, model_fingerprint, judge_prompt)` (plus output canonical)                                                                   | SATISFIED  | `computeJudgeCacheKey` SHA-256(fixtureId NUL modelFingerprint NUL judgePrompt NUL outputCanonical); `createDiskJudgeCache` round-trips |
| EVAL-05     | 12-02       | Layered: exact -> semantic-cheap -> semantic-expensive; cheaper-layer failures short-circuit                                                                                | SATISFIED  | Stage 5 exact short-circuits Stages 6/7 on mismatch (eval-runner Test 9 asserts judge calls = 0 on drift)                              |
| EVAL-06     | 12-03       | Non-zero exit on regression; JSON report on stdout for programmatic consumers                                                                                                | SATISFIED  | Exit code matrix 0/1/2 wired in handler; stdout = single JSON line; stderr = human                                                    |

### Anti-Patterns Found

None. Scanned all created files for TODO/FIXME/placeholder/empty-implementations: no occurrences. The `tripwireOutcomes: readonly never[]` slot is documented forward-compat (not a stub). The `noopJudge` returning 1.0 is the documented v1.1 default per CONTEXT.md.

### Human Verification Required

None. All checks are automated. The eval gate is exercised end-to-end by the bin smoke test plus 21 unit tests across the three plans.

### Gaps Summary

No gaps. Phase 12 ships the complete `lattice eval` CI gate matching CONTEXT.md and all six EVAL-* requirements. The verification commands (`pnpm tsc --noEmit`, `pnpm vitest run`, `pnpm build`) all exit 0 after rebuild; the dist was stale before the build step but the source code is correct and the rebuilt artifacts pass all tests.

Notable strengths confirmed:
- Lazy subcommand registration produces a separate dist chunk so `lattice repro` doesn't load eval code (CLI-04 boundary preserved)
- Discriminator wrapping (`source: "keyset" | "baseline"`) correctly distinguishes structurally-identical typed errors at the handler boundary
- Judge cache persists across sessions (eval-runner Test 7); cost regression fires independently of Exact verdict (eval-runner Test 3)
- All file I/O is path-isolated via `EvalConfig`; no global state in the runner

---

_Verified: 2026-05-11T20:19:00Z_
_Verifier: Claude (gsd-verifier)_
