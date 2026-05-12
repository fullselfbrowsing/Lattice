---
phase: 12-lattice-eval-ci-gate
plan: "02"
subsystem: lattice-cli/eval
tags: [cli, eval, runner, layered-determinism, baseline-relative, judge, n3-median, replay, materialize, tdd]
requires:
  - packages/lattice-cli/src/io/receipt-walker.ts (Plan 12-01)
  - packages/lattice-cli/src/io/artifact-loader.ts (Phase 11)
  - packages/lattice-cli/src/io/keyset-loader.ts (Phase 11)
  - packages/lattice-cli/src/eval/baseline.ts (Plan 12-01)
  - packages/lattice-cli/src/eval/judge.ts (Plan 12-01)
  - packages/lattice-cli/src/eval/judge-cache.ts (Plan 12-01)
  - packages/lattice-cli/src/eval/types.ts (Plan 12-01)
  - packages/lattice (materializeReplayEnvelope, replayOffline, verifyReceipt)
provides:
  - runEvalSession(config, deps): Promise<EvalRunReport>
  - EvalRunnerDeps (judge / now / loadKeySet / buildArtifactLoader injection points)
  - EvalConfig.artifactsDir, EvalConfig.judgePrompt (added to Plan 12-01 types)
affects:
  - Plan 12-03 (will wire runEvalSession to citty + filesystem defaults + exit-code mapping)
tech-stack:
  added: []
  patterns:
    - "Per-fixture pipeline mirrors Phase 11 repro.ts (6-stage flow); short-circuit on Stage 5 mismatch skips Stages 6+7"
    - "Forward-compat structural probe on body.qualityFloor (v1.1 receipt body doesn't carry it; tests inject via verifyReceipt mock)"
    - "Defensive inline sha256Hex helper duplicates the 10-LOC formula from repro.ts (CONTEXT.md Receipt Loader Reuse — duplication preferred over private-import reach)"
    - "Dependency injection (judge / now / loadKeySet / buildArtifactLoader) keeps the runner test-driveable without subprocess spawning"
    - "Mock replayOffline via vi.doMock — same precedent as repro.test.ts Test 1"
key-files:
  created:
    - packages/lattice-cli/src/eval/runner.ts
    - packages/lattice-cli/test/eval-runner.test.ts
  modified:
    - packages/lattice-cli/src/eval/types.ts
decisions:
  - "Receipt body qualityFloor is read defensively via structural probe. v1.1 CapabilityReceiptBody has no qualityFloor field (it lives on the contract); future v1.2 receipts may carry it. Reading via probe keeps the runner forward-compat without touching the lattice package."
  - "body.model.observed is `string | null` (not `{ fingerprint }`). modelFingerprint for the judge cache key uses `body.model.observed ?? body.model.requested` — corrected from the plan's `body.model.observed?.fingerprint ?? body.model.requested`."
  - "Per-fixture try/catch around materializeReplayEnvelope, verifyReceipt re-call, and replayOffline collapses verify-failed / artifact-load-failed / envelope-malformed / replay-execution-unavailable into one `load-failed` verdict — the runner never aborts the whole walk over one bad fixture."
  - "EvalConfig extended with `artifactsDir: string` and `judgePrompt: string` fields. Plan 12-01 omitted these from the type; Plan 12-02 added them per the plan's <interfaces> spec (Rule 3 — required to compile the runner)."
  - "Cost regression fires independently of Exact verdict. `verdict === 'match'` guard inside the cost gate ensures a Stage-5 drift never overwrites its regressionKind, but a Stage-5 match can transition to verdict=regression on cost."
  - "qualityFloor probe checks body.qualityFloor first; if the body declares one, Stage 7 runs with N=3 and disk cache. If absent, qualityScore stays null and the quality gate is skipped."
  - "initBaseline mode: baseline is never loaded. Every fixture comes out verdict=match with deltaCostPct=null, deltaQuality=null. Plan 12-03 will write the new baseline from the report."
  - "Test 8 (init-baseline) does NOT increment newFixtures because the runner is recording a fresh baseline — newFixtures is reserved for the 'in baseline-relative mode, fixture is unknown to baseline' case."
  - "outputHash null branch (failure receipts) collapses to load-failed — same semantics as Phase 11 repro.ts which exits 2 with kind=receipt-had-no-outputhash."
  - "Inline sha256Hex helper is duplicated rather than extracted to eval/util.ts (CONTEXT.md allows duplication of this 10-LOC formula to keep the plan small)."
metrics:
  duration: ~25m
  completed: 2026-05-11
---

# Phase 12 Plan 02: Eval Runner Summary

`runEvalSession(config, deps): Promise<EvalRunReport>` composes the Plan 12-01 primitives into one sequential per-fixture pipeline: walker → materialize+verify → replay → Exact hash compare → (Semantic-cheap no-op) → Semantic-expensive judge (only when qualityFloor declared) → baseline-relative cost gate → baseline-relative quality gate → aggregate. Each fixture produces one `FixtureReport` whose `verdict` and `regressionKind` map deterministically onto CONTEXT.md's "match vs drift vs regression" taxonomy.

## What Shipped

### `packages/lattice-cli/src/eval/runner.ts`

The single entry point: `runEvalSession(config, deps)` returns an `EvalRunReport`. All file I/O is path-isolated through `config` — no module-level singletons, no global state, fully reusable in the same process.

Dependency injection surface (`EvalRunnerDeps`):

- `judge?: Judge` — default `noopJudge`.
- `now?: () => string` — default `() => new Date().toISOString()`.
- `loadKeySet?` — default `loadKeySetFromPath` (Phase 11).
- `buildArtifactLoader?` — default `createFilesystemArtifactLoader` (Phase 11).

### `packages/lattice-cli/test/eval-runner.test.ts`

11 vitest cases covering the full verdict / regression matrix. Each case uses an isolated `mkdtemp` sandbox; no test pollutes the project tree. Drift / cost / quality cases use `vi.doMock("lattice", ...)` to swap `replayOffline` and/or `verifyReceipt`, the same precedent established by `repro.test.ts`.

### `packages/lattice-cli/src/eval/types.ts` (modified)

Added two fields to `EvalConfig`:

- `artifactsDir: string` — root for `<sha256>.bin` artifact bodies (Phase 11 loader).
- `judgePrompt: string` — forwarded into `runJudgeWithN` so the judge-cache key is stable across runs.

## Verdict Matrix (Locked)

| Stage 5 Exact | Stage 7 Judge (only if qualityFloor) | Stage 8 Cost | Stage 9 Quality | Baseline State | Verdict | RegressionKind |
| ------------- | ------------------------------------ | ------------ | --------------- | -------------- | --------------- | ----------------------- |
| mismatch | (skipped — SHORT-CIRCUIT) | (skipped) | (skipped) | any | `drift` | `output-hash-mismatch` |
| match | n/a (no qualityFloor) | within tol. | n/a | present | `match` | null |
| match | n/a (no qualityFloor) | regressed | n/a | present | `regression` | `cost-regression` |
| match | within tol. (score ≥ baseline-tol) | within tol. | within tol. | present | `match` | null |
| match | regressed | within tol. | regressed | present | `regression` | `quality-regression` |
| match | within tol. | regressed | within tol. | present | `regression` | `cost-regression` |
| match | any | n/a | n/a | missing entry | `match` | null (newFixtures++) |
| (envelope load or verify or replay fails) | (skipped) | (skipped) | (skipped) | any | `load-failed` | null |
| (body.outputHash === null) | (skipped) | (skipped) | (skipped) | any | `load-failed` | null |

## Short-Circuit Proof (Test 9)

Test 9 seeds a receipt whose body is mocked to declare `qualityFloor: { score: 0.5 }`. `replayOffline` is mocked to return drifted outputs (Stage 5 must fail). The judge mock increments a counter on every call.

```
Drift detected at Stage 5 -> verdict=drift, regressionKind=output-hash-mismatch
                          -> SHORT-CIRCUIT before Stage 6/7
                          -> judge.score() invocations: 0
```

The assertion `expect(judgeCalls).toBe(0)` passes. This confirms Stage 7 (judge) runs ONLY when Stages 5+6 pass — drift cases never invoke the (expensive) judge.

## New-Fixture Semantics (Test 5)

When `baseline.fixtures[fixtureId]` is absent:

- `verdict: "match"` (not flagged)
- `regressionKind: null`
- `deltaCostPct: null` (no baseline to compare against)
- `deltaQuality: null`
- `summary.newFixtures += 1`
- `summary.regressed` is NOT incremented

This matches CONTEXT.md "If `baseline.fixtures[fixtureId]` is missing, treat as a NEW fixture (record but don't flag)."

## Cost-vs-Quality Independence (Test 3)

Test 3 verifies that cost regression fires on an Exact match:

- Stage 5: match (outputs hash equals body.outputHash)
- Body cost: "0.001" (mocked into the verified body)
- Baseline cost: "0.0001", tolerance: 0.10 → threshold = 0.00011
- 0.001 > 0.00011 → cost regression
- Result: `verdict: "regression"`, `regressionKind: "cost-regression"`, `deltaCostPct: 9.0`

The Stage-5 match would have produced `verdict: "match"`, but the Stage-8 cost gate overrides to `regression`. This is CONTEXT.md's "match vs drift vs regression" distinction made concrete.

## Judge Cache Persistence Across Sessions (Test 7)

Test 7 calls `runEvalSession(config)` twice over the same fixture (qualityFloor declared, judgeN=3). The judge mock counts `score()` invocations.

- After run 1: judge calls === 3 (N=3 fresh samples).
- After run 2: judge calls === 3 (cache hit — Stage 7 returns the cached score; no judge invocation).

The disk-backed `createDiskJudgeCache(judgeCacheDir)` from Plan 12-01 outlives `runEvalSession` calls because it's keyed by the directory path, not by the runner instance. This is what makes the eval gate cheap to re-run in CI when nothing has changed.

## Per-Fixture Pipeline (Locked)

```
walker -> WalkedEntry
   isWalkedReceiptError? -> push load-failed; continue.

materializeReplayEnvelope(envelope, { artifactLoader, keySet })
   throw (verify-failed | artifact-load-failed | envelope-malformed) -> load-failed.

verifyReceipt(envelope, keySet)
   !ok -> load-failed (defensive; materialize already verified).
   ok  -> body: CapabilityReceiptBody.

replayOffline(envelopeReplay)
   !ok -> load-failed.

body.outputHash === null -> load-failed (no diff target).

sha256(JSON.stringify(replay.outputs)) !== body.outputHash
   -> verdict: drift, regressionKind: output-hash-mismatch
   -> SHORT-CIRCUIT (skip Stages 6/7).

body.qualityFloor !== null
   -> runJudgeWithN(judge, { fixtureId, output, modelFingerprint, prompt }, judgeN, cache)
   -> qualityScore = result.score.

baseline && baselineEntry
   -> compareCost(body.usage.costUsd ?? "0", baselineEntry.usage.costUsd, costTolerance)
   -> compareQuality(qualityScore, baselineEntry.qualityFloor.score, qualityTolerance) when both sides scored
   -> first regression wins (verdict === 'match' guard prevents cost-then-quality overrides)
baseline && !baselineEntry
   -> newFixtures++ (record but don't flag).
!baseline (init-baseline mode)
   -> verdict stays match; deltas remain null.

push FixtureReport.
```

## Aggregate Semantics (Test 10)

Test 10 seeds a directory with 4 entries:

| Fixture ID | Type | Expected verdict |
| ---------- | ---- | ---------------- |
| `a-match` | valid receipt, in baseline | `match` |
| `b-drift` | valid receipt, replay mocked to drift | `drift` |
| `c-new` | valid receipt, NOT in baseline | `match` |
| `d-bad` | malformed JSON | `load-failed` |

Final summary:

```
{ total: 4, passed: 2, regressed: 1, newFixtures: 1 }
```

- `total = 4` includes load-failed entries.
- `passed = 2` (`a-match` + `c-new`).
- `regressed = 1` (only `b-drift`; load-failures are NOT regressions).
- `newFixtures = 1` (`c-new`).

## TDD Commits

| Task | Phase | Commit  | Description                                                                          |
| ---- | ----- | ------- | ------------------------------------------------------------------------------------ |
| 1    | RED   | c6ef9ac | test(12-02): add failing tests for runEvalSession orchestrator                       |
| 1    | GREEN | faf94b3 | feat(12-02): implement runEvalSession orchestrator with layered determinism         |

## Verification

- `cd packages/lattice-cli && pnpm exec tsc --noEmit` exits 0
- `cd packages/lattice-cli && pnpm exec vitest run` -> **88 passed (9 files)** = 77 Plan 12-01 baseline + 11 new eval-runner cases
- `cd packages/lattice-cli && pnpm exec tsdown` exits 0
- `node packages/lattice/scripts/check-cli-deps.mjs` -> OK (no forbidden CLI deps in lattice/dist)
- No new runtime dependencies in `packages/lattice-cli/package.json` (still `lattice` workspace + `citty` + `@types/node`)

## Forward-Compat Hooks

- `tripwireOutcomes: []` reserved field; v1.2 will populate when tripwires-as-eval-scorers wiring lands (CONTEXT.md "Tripwires-as-Eval-Scorers (Deferred Hook)").
- `body.qualityFloor` probe: when v1.2 extends `CapabilityReceiptBody` with a `qualityFloor` field, the runner starts gating quality with zero code changes.
- Semantic-cheap class (Stage 6): no-op in v1.1; future Standard Schema validation hook lives here (CONTEXT.md "Layered Determinism Classes #2").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] EvalConfig missing artifactsDir and judgePrompt fields**
- **Found during:** Task 1 GREEN phase (runner needed `config.artifactsDir` and `config.judgePrompt`).
- **Issue:** Plan 12-01's `types.ts` defined `EvalConfig` without these fields, but Plan 12-02's `<interfaces>` spec includes both. Without them, `runner.ts` couldn't compile against `config: EvalConfig`.
- **Fix:** Added `artifactsDir: string` and `judgePrompt: string` (both required) to `EvalConfig` in `types.ts`, with JSDoc explaining each role.
- **Files modified:** `packages/lattice-cli/src/eval/types.ts`
- **Commit:** faf94b3

**2. [Rule 1 - Bug in plan] body.model.observed is `string | null`, not `{ fingerprint }`**
- **Found during:** Task 1 GREEN phase (compiling the modelFingerprint expression).
- **Issue:** Plan 12-02 specified `body.model.observed?.fingerprint ?? body.model.requested`, but `ReceiptModel.observed: string | null` per `packages/lattice/src/receipts/types.ts`. The `?.fingerprint` field does not exist.
- **Fix:** Use `body.model.observed ?? body.model.requested` (both are strings).
- **Files modified:** `packages/lattice-cli/src/eval/runner.ts`
- **Commit:** faf94b3

**3. [Rule 2 - Forward-compat] qualityFloor not in v1.1 CapabilityReceiptBody**
- **Found during:** Task 1 GREEN phase (reading body.qualityFloor).
- **Issue:** Plan 12-02 specified `if (verdict === "match" && body.qualityFloor !== undefined && body.qualityFloor !== null)`, but `CapabilityReceiptBody` in v1.1 has NO `qualityFloor` field — it lives on `CapabilityContract`.
- **Fix:** Added a forward-compat structural probe (`readQualityFloor(body)`) that reads the field defensively via a `ReceiptBodyMaybeQualityFloor` extension type. v1.1 receipts always return null; v1.2 receipts that add the field start gating quality with zero code change. Tests inject `qualityFloor` via `verifyReceipt` mocks.
- **Files modified:** `packages/lattice-cli/src/eval/runner.ts`
- **Commit:** faf94b3

**4. [Rule 1 - Bug in test plan] Match-path tests need replayOffline mock**
- **Found during:** Task 1 GREEN phase first test run (all match-path tests failed with verdict=load-failed).
- **Issue:** The Phase 10 `materializeReplayEnvelope` does NOT pass `outputs` to the materialized `ReplayEnvelope` (the receipt body alone has no way to recover the outputs). Consequently `replayOffline` returns `execution_unavailable`, which the runner maps to `load-failed`. Same problem `repro.test.ts` Test 1 solved by mocking `replayOffline`.
- **Fix:** Added a `mockReplayWithOutputs(outputs)` helper and applied it to Tests 1, 3, 4, 5, 7, 8 (every test that needs a Stage-5 match). Tests 2 (drift), 6 (load-failed), 9 (short-circuit), 11 (empty) do NOT need the mock by design.
- **Files modified:** `packages/lattice-cli/test/eval-runner.test.ts`
- **Commit:** faf94b3

## Self-Check: PASSED

Verified files:
- FOUND: packages/lattice-cli/src/eval/runner.ts
- FOUND: packages/lattice-cli/test/eval-runner.test.ts
- FOUND: packages/lattice-cli/src/eval/types.ts (modified)

Verified commits (TDD pair):
- FOUND: c6ef9ac (test 12-02 runner RED)
- FOUND: faf94b3 (feat 12-02 runner GREEN)

Tests: 88 passed (9 files) = 77 Plan 12-01 + 11 new. Typecheck: 0. Build: 0.
