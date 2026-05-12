---
phase: 12-lattice-eval-ci-gate
plan: "03"
subsystem: lattice-cli/commands
tags: [cli, eval, citty, lazy-subcommand, exit-codes, init-baseline, stdout-json, stderr-human, tdd]
requires:
  - packages/lattice-cli/src/cli.ts (citty root; subCommands map)
  - packages/lattice-cli/src/eval/runner.ts (runEvalSession - Plan 12-02)
  - packages/lattice-cli/src/eval/baseline.ts (writeBaseline, isBaselineLoadError - Plan 12-01)
  - packages/lattice-cli/src/eval/types.ts (EvalConfig, EvalRunReport)
  - packages/lattice-cli/src/io/keyset-loader.ts (isKeysetLoadError - Phase 11)
  - packages/lattice-cli/src/io/receipt-loader.ts (isReceiptLoadError - Phase 11)
provides:
  - runEval(args, deps) handler (testable, mock-argv style)
  - buildEvalConfig(args) -> EvalConfig with CONTEXT.md defaults
  - default-exported defineCommand registered at cli.ts as a lazy subcommand
affects:
  - Phase 13 (showcase will invoke `lattice eval` end-to-end in CI)
tech-stack:
  added: []
  patterns:
    - "Lazy subcommand registration (CLI-04): `eval: () => import(...).then(m => m.default)` matches repro/verify"
    - "Handler split into testable `runEval(args, deps)` + default-exported `defineCommand` (same as repro.ts, verify.ts)"
    - "Dual-stream output contract: stdout = ONE JSON line; stderr = human-readable per-fixture + SUMMARY lines"
    - "Deterministic exit-code mapping from EvalRunReport.summary.regressed to process exit code 0/1/2"
    - "Discriminator wrapping in the runner so the handler can distinguish structurally-identical KeysetLoadError vs BaselineLoadError"
key-files:
  created:
    - packages/lattice-cli/src/commands/eval.ts
    - packages/lattice-cli/test/eval.test.ts
  modified:
    - packages/lattice-cli/src/cli.ts
    - packages/lattice-cli/src/eval/runner.ts
    - packages/lattice-cli/test/cli.test.ts
decisions:
  - "Runner wraps KeysetLoadError and BaselineLoadError with `source: 'keyset' | 'baseline'` before re-throwing. Both shapes carry `{ kind, path, message }` and are structurally indistinguishable. The handler reads `source` first; structural guards remain as a fallback for tests that bypass the wrapper."
  - "Single citty `args` declaration uses kebab-case keys (`init-baseline`, `cost-tolerance`, `judge-cache`, `quality-tolerance`, `judge-n`, `judge-prompt`) which the handler bridges to camelCase `RunEvalArgs` via conditional spread (exactOptionalPropertyTypes-friendly)."
  - "buildEvalConfig is exported as a named function so tests can assert defaults directly (Test 10) without going through the citty boundary."
  - "On --init-baseline write failure, FAIL kind=baseline-write-failed reason=<msg> on stderr, exit 2. The report is NOT emitted (no JSON on stdout) because the write side effect failed - keeping stdout/exit-code contract consistent."
  - "exitCode field on EvalRunReport is mutated to mirror the process exit code BEFORE JSON.stringify, so programmatic consumers reading stdout get an authoritative exit-code reflection without re-parsing the process result."
  - "Default judgePrompt: 'Rate the quality of this output from 0 to 1.' Tests-only judges (noopJudge) ignore it but the disk judge cache keys mix it in (Plan 12-01 recipe) so changing the prompt invalidates cached scores deterministically."
metrics:
  duration: ~15m
  completed: 2026-05-11
---

# Phase 12 Plan 03: lattice eval CLI Surface Summary

`lattice eval` is now a first-class citty lazy subcommand alongside `lattice repro` and `lattice verify`. The handler parses all 8 CONTEXT.md flags, runs `runEvalSession` from Plan 12-02, projects the returned `EvalRunReport` onto a deterministic exit-code matrix (0/1/2), and emits the structured JSON report on stdout with human-readable lines on stderr.

## What Shipped

### `packages/lattice-cli/src/commands/eval.ts`

Two exports + one default-exported `defineCommand`:

- `runEval(args, deps): Promise<void>` - the testable handler. Pure with respect to `deps`; all output flows through `deps.stdout/stderr/exit`. Dependency-injects `runSession` (defaults to `runEvalSession`), `writeBaseline` (defaults to the atomic-rename writer from Plan 12-01), and `now` (defaults to `() => new Date().toISOString()`).
- `buildEvalConfig(args): EvalConfig` - constructs the EvalConfig with all CONTEXT.md defaults applied. Exposed so tests can assert defaults without going through the citty boundary.
- `default defineCommand({...})` - the citty surface. Declares all 10 flags (8 from CONTEXT.md + `--artifacts` for Phase 11 reuse + `--judge-prompt`) with descriptions, parses them, and forwards to `runEval`.

### Flag Surface

| Flag                  | Type      | Default                       | Purpose                                                |
| --------------------- | --------- | ----------------------------- | ------------------------------------------------------ |
| `--fixtures`          | string    | `.lattice/receipts`           | Directory of receipt JSON files to evaluate            |
| `--baseline`          | string    | `.lattice/baseline.json`      | Baseline file for cost/quality gating                  |
| `--key`               | string    | `~/.lattice/keyset.json`      | Keyset JSON path (verification)                        |
| `--judge-cache`       | string    | `.lattice/judge-cache`        | Disk cache for N=3 median judge scores                 |
| `--artifacts`         | string    | `.lattice/fixtures`           | Artifact bodies directory (Phase 11 ArtifactLoader)    |
| `--init-baseline`     | boolean   | false                         | Write this run as a new baseline + exit 0              |
| `--cost-tolerance`    | string -> number | 0.10                   | Fractional cost regression threshold                   |
| `--quality-tolerance` | string -> number | 0.05                   | Quality score regression threshold                     |
| `--judge-n`           | string -> number | 3                      | Judge repetitions for median aggregation               |
| `--judge-prompt`      | string    | `Rate the quality of...`      | Forwarded to `Judge.score` AND mixed into cache key    |

Numeric flags are declared as `type: "string"` in citty (citty's `type: "number"` exists but the kebab-case key bridge benefits from explicit `Number(...)` coercion); the handler converts at the spread step.

## Exit-Code Matrix (Locked)

| Input Scenario                                                  | stderr line(s)                                                          | stdout         | Exit |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------- | ---- |
| Session ran, `summary.regressed === 0` (any total, incl. 0)     | per-fixture lines + `SUMMARY total=... passed=... regressed=0 ...`      | 1 JSON line    | 0    |
| Session ran, `summary.regressed > 0`                            | per-fixture lines + `SUMMARY ... regressed=N`                           | 1 JSON line    | 1    |
| `--init-baseline` ran + writeBaseline succeeded                 | per-fixture lines + SUMMARY                                             | 1 JSON line    | 0    |
| KeysetLoadError (with `source: "keyset"`)                       | `FAIL kind=keyset-{kind} reason=<path>: <msg>`                          | (empty)        | 2    |
| BaselineLoadError (with `source: "baseline"`)                   | `FAIL kind=baseline-{kind} reason=<path>: <msg>`                        | (empty)        | 2    |
| ReceiptLoadError (from walker hitting ENOENT on fixtures dir)   | `FAIL kind=receipt-{kind} reason=<resolvedPath>: <msg>`                 | (empty)        | 2    |
| `--init-baseline` write failure                                 | `FAIL kind=baseline-write-failed reason=<msg>`                          | (empty)        | 2    |
| Any other thrown value                                          | `FAIL kind=session-failed reason=<msg>`                                 | (empty)        | 2    |

`summary.regressed === 0 && summary.total === 0` (empty fixtures directory) is **exit 0** per CONTEXT.md "no fixtures is not an error".

## Dual-Stream Output Contract

**stdout (programmatic consumers):**
```
{"version":"lattice-eval/v1","ranAt":"...","fixturesDir":"...","baselinePath":"...","fixtures":[...],"summary":{"total":N,"passed":N,"regressed":N,"newFixtures":N},"exitCode":0|1|2,"tripwireOutcomes":[]}
```
Exactly ONE line; trailing newline. `exitCode` mirrors the process exit code (set on the report BEFORE `JSON.stringify`).

**stderr (humans / CI logs):**
```
<fixtureId> verdict=<v> regressionKind=<k|none> deltaCostPct=<n|null> deltaQuality=<n|null>
...
SUMMARY total=<n> passed=<n> regressed=<n> newFixtures=<n>
```
On exit 2 (load failure), stderr emits ONLY the `FAIL kind=... reason=...` line - no fixture lines, no SUMMARY, no JSON on stdout. There is no report to render.

## --init-baseline Write Path

When `--init-baseline` is set:

1. `runEvalSession` is called with `config.initBaseline = true`. The runner skips baseline loading entirely.
2. The runner returns an `EvalRunReport` with every viable fixture as `verdict: "match"` and null deltas (no baseline to compare against).
3. The handler projects each `FixtureReport` whose `verdict !== "load-failed"` and `usage !== null` into a `BaselineEntry`:
   ```
   { usage: { costUsd, promptTokens, completionTokens },
     qualityFloor: qualityScore !== null ? { score: qualityScore } : null }
   ```
4. The Baseline is finalized with `version: "lattice-eval/v1"`, `recordedAt: deps.now()`, and the entries map.
5. `writeBaseline(path, baseline)` writes atomically (`<path>.tmp` -> `rename`) per Plan 12-01's atomic-write contract.
6. The full JSON report is emitted to stdout and exit 0 fires.
7. On write failure, no JSON is emitted; stderr gets `FAIL kind=baseline-write-failed reason=<msg>`, exit 2.

This bootstraps a baseline from a clean cwd: even with no baseline file at all, `lattice eval --init-baseline` succeeds and produces one.

## CLI-04 / CLI-06 Boundary Proofs

**CLI-04 (lazy subcommand loading):**

`cli.ts` has:
```typescript
subCommands: {
  repro: () => import("./commands/repro.js").then((m) => m.default),
  verify: () => import("./commands/verify.js").then((m) => m.default),
  eval: () => import("./commands/eval.js").then((m) => m.default),
}
```

The build confirms it lazily: `pnpm build` produces separate chunks - `dist/repro-vzUOi2oc.js` (6.97 kB), `dist/verify-Br_Hb6PS.js` (3.93 kB), `dist/eval-CP2IoXKG.js` (28.46 kB). Loading `lattice repro` does NOT pull the eval chunk; the dynamic import is invoked only when the user types `lattice eval`.

**CLI-06 (no private lattice imports):**

`commands/eval.ts` imports only from:
- `citty` (workspace dep)
- `../eval/baseline.js`, `../eval/runner.js`, `../eval/types.js` (Plan 12-01/02)
- `../io/keyset-loader.js`, `../io/receipt-loader.js` (Phase 11)

No `lattice/src/*` imports; no `node:` imports outside the standard `process.stdout.write` default deps surface.

`node packages/lattice/scripts/check-cli-deps.mjs` -> OK (no forbidden CLI deps in `packages/lattice/dist`).

## Discriminator Wrapping (Deviation Rule 3)

KeysetLoadError and BaselineLoadError have **identical structural shapes**:
```typescript
{ kind: "missing" | "malformed", path: string, message: string }
```

The handler's `isBaselineLoadError(err)` returns `true` for ANY error matching that shape - including a KeysetLoadError. With the obvious "check baseline first, fall through to keyset" order, the handler would always emit `FAIL kind=baseline-...` even for keyset failures.

**Fix:** the runner now wraps both error types with a `source: "keyset" | "baseline"` field before re-throwing:

```typescript
try {
  keySet = await loadKeySet(config.keyPath);
} catch (err) {
  throw { ...err, source: "keyset" };
}
```

The handler reads `source` first (`readErrorSource(err)`) and routes accordingly. The structural guards remain as fallback for tests that throw raw typed errors without the wrapper (e.g., a test that pre-dates the wrapping decision).

This is logged as `[Rule 3 - Blocker] structurally-identical typed errors at the boundary` below.

## Tests

### `packages/lattice-cli/test/eval.test.ts` (10 cases)

| # | Case                            | Asserts                                                                      |
| - | ------------------------------- | ---------------------------------------------------------------------------- |
| 1 | Pass run                        | exit 0, JSON exitCode=0, SUMMARY passed=2 regressed=0                        |
| 2 | Regression run                  | exit 1, JSON exitCode=1, SUMMARY regressed=1                                 |
| 3 | Empty fixtures dir              | exit 0, total=0 newFixtures=0                                                |
| 4 | BaselineLoadError (source=baseline) | exit 2, `FAIL kind=baseline-missing reason=...`, NO stdout                |
| 5 | KeysetLoadError (source=keyset) | exit 2, `FAIL kind=keyset-missing reason=...`                                |
| 6 | ReceiptLoadError                | exit 2, `FAIL kind=receipt-missing reason=...`                               |
| 7 | --init-baseline write succeeds  | exit 0, writeBaseline called with correct path + Baseline shape (locked `recordedAt`) |
| 8 | --init-baseline write fails     | exit 2, `FAIL kind=baseline-write-failed reason=...`                         |
| 9 | Stdout discipline               | JSON contains usage.costUsd, contains NO "fingerprint" or "outputHash" substrings |
| 10 | Defaults                       | buildEvalConfig produces all CONTEXT.md defaults verbatim                    |

All 10 use captured `stdout/stderr/exit` arrays + `deps.now = () => "2026-05-11T00:00:00.000Z"` for snapshot determinism. No `spawnSync` - the bin smoke test in `cli.test.ts` covers the spawn path.

### `packages/lattice-cli/test/cli.test.ts` (updated)

- `--help` smoke now asserts `stdout` contains `eval` (along with `repro` and `verify`).
- New case: `runBin(["eval"])` in an empty cwd asserts exit 2 + stderr matches `/^FAIL kind=(receipt|keyset|baseline|session)-(missing|malformed|failed)/m`. Mirrors the precedent set by the existing `repro` and `verify` smoke cases.

## TDD Commits

| Task | Phase | Commit  | Description                                                       |
| ---- | ----- | ------- | ----------------------------------------------------------------- |
| 1    | RED   | b6b913d | test(12-03): add failing tests for lattice eval subcommand handler |
| 1    | GREEN | d0dc1d1 | feat(12-03): implement lattice eval citty subcommand              |

## Verification

- `cd packages/lattice-cli && pnpm exec tsc --noEmit` exits 0
- `cd packages/lattice-cli && pnpm exec vitest run` -> **99 passed (10 files)** = 88 prior + 10 new eval.test.ts + 1 new cli.test.ts smoke case
- `cd packages/lattice-cli && pnpm build` exits 0; dist contains a separate `eval-*.js` chunk (lazy import target)
- `node packages/lattice/scripts/check-cli-deps.mjs` -> OK
- Manual: `node packages/lattice-cli/dist/cli.js eval --help` prints all 10 flag descriptions
- Manual: `node packages/lattice-cli/dist/cli.js --help` lists `eval` alongside `repro` and `verify`
- No new runtime dependencies in `packages/lattice-cli/package.json` (still `lattice` workspace + `citty`)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] Structurally-identical typed errors at the boundary**
- **Found during:** Task 1 GREEN phase first test run (Test 5 keyset-missing failed because the handler routed it as baseline-missing).
- **Issue:** `KeysetLoadError` and `BaselineLoadError` share the EXACT same structural shape (`{ kind: "missing" | "malformed", path: string, message: string }`). The handler's `isBaselineLoadError(err)` / `isKeysetLoadError(err)` guards both return `true` for either error type. With any check order, one of the two routes is broken.
- **Fix:** Updated `packages/lattice-cli/src/eval/runner.ts` to wrap both load errors with a `source: "keyset" | "baseline"` discriminator before re-throwing. Added a `readErrorSource(err)` helper in `commands/eval.ts` that reads the discriminator first; if present, routes to the correct typed branch. Structural guards remain as a fallback so tests that bypass the wrapper still work. Tests 4 and 5 were updated to include the `source` field on their throw-shaped errors, simulating real runner behavior.
- **Files modified:** `packages/lattice-cli/src/eval/runner.ts`, `packages/lattice-cli/src/commands/eval.ts`, `packages/lattice-cli/test/eval.test.ts`
- **Commit:** d0dc1d1

## Known Stubs

None. All flags are parsed; all defaults are concrete; no UI components rendering placeholder data; no TODO/FIXME left in shipped code paths. The `--judge-prompt` default is a generic rating string by design (CONTEXT.md leaves judge implementations caller-supplied; the default judge is `noopJudge`).

The `tripwireOutcomes: readonly never[]` slot in `EvalRunReport` is intentionally always `[]` in v1.1 - documented as a v1.2 forward-compat hook in Plan 12-01 and CONTEXT.md "Tripwires-as-Eval-Scorers (Deferred Hook)".

## Self-Check: PASSED

Verified files:
- FOUND: packages/lattice-cli/src/commands/eval.ts
- FOUND: packages/lattice-cli/src/cli.ts (modified)
- FOUND: packages/lattice-cli/src/eval/runner.ts (modified)
- FOUND: packages/lattice-cli/test/eval.test.ts
- FOUND: packages/lattice-cli/test/cli.test.ts (modified)

Verified commits (TDD pair):
- FOUND: b6b913d (test 12-03 RED)
- FOUND: d0dc1d1 (feat 12-03 GREEN)

Tests: 99 passed (10 files) = 88 Plan 12-01/02 + 10 new eval.test.ts + 1 new cli.test.ts smoke case. Typecheck: 0. Build: 0. CLI-dep check: OK.
