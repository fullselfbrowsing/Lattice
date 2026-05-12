# Phase 12: lattice eval CI Gate - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

`lattice eval` walks a fixture directory of receipts, replays each via `replayOffline`, and gates baseline-relative cost-per-task and quality-floor regressions with judge caching, layered determinism classes, and a CI-friendly non-zero exit on regression. Output is a structured JSON report on stdout for programmatic consumers.

Out of scope: full milestone showcase wiring (Phase 13). Cross-platform CI matrix deferred to v1.2. The eval gate is a CLI subcommand inside `packages/lattice-cli` — adds to the existing Phase 11 surface.
</domain>

<decisions>
## Implementation Decisions

### `lattice eval` Subcommand Shape
- Add `lattice eval [--fixtures <dir>] [--baseline <path>] [--key <keyset-path>] [--judge-cache <dir>]` to the `lattice-cli` package.
- Default `--fixtures` is `.lattice/receipts/` (same convention as `lattice repro`).
- Default `--baseline` is `.lattice/baseline.json` — the recorded "last green main" snapshot.
- Default `--judge-cache` is `.lattice/judge-cache/`.
- Default `--key` is `~/.lattice/keyset.json` (same as repro/verify).
- Exit codes: 0 if all fixtures pass and no regression; 1 if any regression detected; 2 if eval can't run (keyset missing, fixtures dir missing, malformed baseline).
- Output: ONE JSON object on stdout describing the run (see Output Format below). Human-readable summary lines on stderr.

### Layered Determinism Classes (Gate Order)
For each fixture, evaluation proceeds through ordered classes; the first class to flag a regression short-circuits the gate:
1. **Exact** — receipt outputHash equality between fixture and replay result. Cheap, no LLM. Failure: `kind: "output-hash-mismatch"`.
2. **Semantic-cheap** — output schema validation roundtrip + structural diff against the fixture's redacted outputs (when present in the receipt body — note: receipt body does NOT embed full outputs in v1.1; this class is a no-op in v1.1 unless callers attach a `--outputs <schema-path>` flag with a Standard Schema spec for fixture-side validation). Failure: `kind: "schema-mismatch"`.
3. **Semantic-expensive (LLM judge)** — only runs when `qualityFloor` was declared in the original contract. Re-runs the judge against the replay output and compares to fixture-recorded judge score within a tolerance. v1.1 implements an N=3 median aggregation with deterministic temperature=0 calls.

### Judge Caching
- Cache key: `hash(fixtureId, model_fingerprint, judge_prompt, output_canonicalized)`.
- Cache directory: `.lattice/judge-cache/` by default; one JSON file per hash.
- When a cache entry exists, reuse it. On a fresh judge call, compute median over N=3 invocations (configurable via `--judge-n`, default 3).
- The judge call itself is provider-pluggable — v1.1 ships a "stub judge" interface; concrete judge implementations are caller-provided. Wire a built-in `noopJudge` that always returns score 1.0 for tests; users override in their CI config.

### Baseline-Relative Gating
- Baseline file structure (JSON): `{ version: "lattice-eval/v1", recordedAt: ISO, fixtures: { [fixtureId]: { usage: { costUsd: string, promptTokens, completionTokens }, qualityFloor: { score: number } | null } } }`.
- For each replay result, compare against `baseline.fixtures[fixtureId]`:
  - Cost regression: replay `costUsd` > `baselineCostUsd * 1.10` (configurable via `--cost-tolerance`, default 1.10 = 10%) → flag.
  - Quality regression: replay `qualityScore` < `baselineQualityScore - 0.05` (configurable via `--quality-tolerance`, default 0.05) → flag.
- If `baseline.fixtures[fixtureId]` is missing, treat as a NEW fixture (record but don't flag). Print to stderr.
- If `--baseline` file doesn't exist, fail with exit 2 unless `--init-baseline` is passed (which writes the current run as the new baseline and exits 0).

### Output Format (JSON on stdout)
```json
{
  "version": "lattice-eval/v1",
  "ranAt": "ISO",
  "fixturesDir": ".lattice/receipts",
  "baselinePath": ".lattice/baseline.json",
  "fixtures": [
    {
      "fixtureId": "abc123",
      "verdict": "match" | "drift" | "regression" | "load-failed",
      "regressionKind": null | "output-hash-mismatch" | "schema-mismatch" | "cost-regression" | "quality-regression",
      "usage": { "costUsd": "0.000125", "promptTokens": 100, "completionTokens": 50 },
      "qualityScore": 0.95 | null,
      "deltaCostPct": 0.05,
      "deltaQuality": -0.02
    }
  ],
  "summary": {
    "total": 5,
    "passed": 4,
    "regressed": 1,
    "newFixtures": 0
  },
  "exitCode": 0 | 1 | 2
}
```

### Tripwires-as-Eval-Scorers (Deferred Hook)
- The `Invariant` interface from Phase 8 (`evaluateTripwires`) is reusable as a binary scorer (pass/fail). v1.1 defers this wiring to a future task — the eval gate evaluates layered classes but does NOT yet plug tripwires in as additional gates. Phase 13 showcase explicitly tests a tripwire-bearing fixture flowing through eval. Forward-compat hook: the JSON report has a `tripwireOutcomes` slot reserved (always empty in v1.1).

### Receipt Loader Reuse
- Reuse `loadReceiptByIdOrPath` from Phase 11. For directory walking, add new helper `walkReceiptsDirectory(dir): AsyncIterable<{ id, envelope }>` in `packages/lattice-cli/src/io/receipt-walker.ts`.

### Claude's Discretion
- Internal module layout: `commands/eval.ts`, `eval/runner.ts` (per-fixture replay + scoring), `eval/baseline.ts` (load/compare), `eval/judge-cache.ts`, `io/receipt-walker.ts`.
- Whether to bundle vitest into the CLI dist or peer-depend it: do NOT bundle (CONTEXT-stated). The judge implementation is user-supplied at runtime.
- Internal report typing: a single TypeScript interface `EvalRunReport` covering the stdout JSON shape.

### Limitations (v1.1 scope)
- No vitest-compatible reporter in v1.1 (deferred per REQUIREMENTS.md).
- Tripwires-as-eval-scorers wiring deferred.
- Cost histogram (mean/p50/p95/max) deferred — v1.1 records mean only.
- Cross-platform CI matrix deferred (unix only).
- Cost tolerance and quality tolerance are scalar — multi-tier configurable thresholds defer to v1.2.
- Provider fingerprint drift is reported in the per-fixture object but does not (yet) fail the gate — informational only in v1.1.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice-cli/src/io/receipt-loader.ts` — `loadReceiptByIdOrPath`. Reuse pattern; add directory walker.
- `packages/lattice-cli/src/io/artifact-loader.ts` — filesystem artifact loader. Reuse.
- `packages/lattice-cli/src/io/keyset-loader.ts` — keyset loader. Reuse.
- `packages/lattice/src/replay/materialize.ts` — `materializeReplayEnvelope`. Eval's per-fixture flow uses it identically to repro.
- `packages/lattice/src/replay/replay.ts` — `replayOffline`. Same.
- `packages/lattice/src/receipts/verify.ts` — `verifyReceipt`. Same.
- `packages/lattice/src/storage/fingerprint.ts` — SHA-256 helpers for output diff.

### Integration Points
- `packages/lattice-cli/src/cli.ts`: register a new lazy subcommand `eval: () => import("./commands/eval.js").then(m => m.default)`.
- `packages/lattice-cli/package.json`: no new dependencies (vitest is dev-only; judge framework is caller-supplied).
- New module under `packages/lattice-cli/src/eval/`.

### Established Patterns
- Subcommand handler tests use mock argv with dependency-injection. Smoke test spawns the bin.
- Exit codes 0 / 1 / 2 are deterministic.
- Plain-text human output on stderr; structured JSON on stdout.
</code_context>

<specifics>
## Specific Ideas

- The "stub judge" interface: `interface Judge { score(input: { fixtureId, output, modelFingerprint }): Promise<number> }`. Built-in `noopJudge` for tests + future caller pluggability. v1.1 ships this interface but doesn't pluck a real judge.
- Walker iterates `.json` files in fixtures dir; skips files that don't deserialize as ReceiptEnvelopes (reports load-failed).
- The "match vs drift vs regression" distinction: `match` = outputHash equal, no cost/quality flag; `drift` = outputHash differs (Exact class flagged); `regression` = cost or quality threshold crossed even though Exact class matched.
- For the eval handler tests, build an in-memory keyset + in-memory receipt + in-memory artifact loader; spawn the eval handler directly with mock argv. Use a temp dir for the baseline file.
</specifics>

<deferred>
## Deferred Ideas

- Vitest-compatible JSON/JUnit reporter (deferred to v1.2).
- Cost histogram (mean/p50/p95/max) in reports (deferred to v1.2).
- Tripwires-as-eval-scorers concrete wiring (shape reserved; deferred to v1.2).
- Cross-platform CI matrix + published-tarball smoke test (deferred to v1.2).
- Multi-tier cost/quality thresholds (deferred to v1.2).
- Provider fingerprint drift as a hard regression gate (informational only in v1.1).
- Real LLM judge implementations (caller-supplied; deferred).
- Batched judge calls / parallel fixture replay (sequential in v1.1).
</deferred>
