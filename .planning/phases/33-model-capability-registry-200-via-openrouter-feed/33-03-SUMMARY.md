---
phase: 33-model-capability-registry-200-via-openrouter-feed
plan: 03
subsystem: capability-registry-codegen
tags: [codegen, node-esm, openrouter, classifier, vitest, golden-snapshot]

# Dependency graph
requires:
  - phase: 33-01
    provides: ModelCapabilityProfile type contract + 6 closed unions (CapabilityAdapter, TrainingClass, etc.) that the generator's emitted objects satisfy
  - phase: 24-atomic-scope-rename
    provides: scripts/verify-rename.mjs + scripts/check-workflow-safety.mjs Node-ESM zero-deps scaffold pattern this plan mirrors
provides:
  - scripts/capabilities/classifier.mjs (build-time hybrid classifier: 20 PROVIDER_PREFIX_RULES + 20 FAMILY_OVERRIDES + permissive FALLBACK)
  - scripts/capabilities/__fixtures__/openrouter-models-snapshot.json (frozen 10-entry golden fixture)
  - scripts/refresh-model-registry.mjs (Node ESM CLI; default = write registry.generated.ts; --check = D-17 bit-exact diff + D-18 fetch-failure skip)
  - packages/lattice/test/capabilities-classifier.test.ts (16-it vitest suite covering anchor, variant symmetry, family override, ~latest skip, unknown WARN, tool surface, contextWindow precedence, golden snapshot, deterministic render, drift detection)
  - packages/lattice/test/__snapshots__/capabilities-classifier.test.ts.snap (frozen classification snapshot: 9 keep + 1 phantom skipped from the 10-entry fixture)
affects:
  - 33-04 (live run: this plan ships the script; Plan 04 invokes it against api.openrouter.ai/api/v1/models to populate registry.generated.ts with ~337 real profiles)
  - 33-05 (drift workflow: weekly cron calls `node scripts/refresh-model-registry.mjs` write-mode, then peter-evans/create-pull-request opens a refresh PR; --check mode reserved for ad-hoc CI assertions)
  - 36-output-sanitizers (Phase 36 dispatch reads `knownFailureModes` that this classifier authors)

# Tech tracking
tech-stack:
  added: []  # zero new runtime dependencies; scripts/ uses node: built-ins only
  patterns:
    - "Pure Node ESM build-time scripts mirroring Phase 24/25 scaffold (zero npm deps, structured stderr, --check exit codes)"
    - "Hybrid classifier strategy (D-01): provider-prefix heuristic default + family-substring override table + permissive fallback with stderr WARN"
    - "Deterministic codegen: explicit key order, JSON.stringify per primitive, sort by (adapter, id) before emit, no Date.* anywhere, single trailing newline"
    - "Top-level entrypoint guard (`process.argv[1] === fileURLToPath(import.meta.url)`) so tests can import render() + transformFeed() without triggering main() and the live fetch"
    - "Vitest golden-snapshot test for classifier stability — first-run write commits the canonical 9-row classification"
    - "Per-attempt AbortController timeout (30s) on fetchWithRetry — caps OpenRouter slowness without leaking timers"

key-files:
  created:
    - scripts/capabilities/classifier.mjs
    - scripts/capabilities/__fixtures__/openrouter-models-snapshot.json
    - scripts/refresh-model-registry.mjs
    - packages/lattice/test/capabilities-classifier.test.ts
    - packages/lattice/test/__snapshots__/capabilities-classifier.test.ts.snap
  modified: []

key-decisions:
  - "Top-level entrypoint guard added to refresh-model-registry.mjs so the vitest suite can dynamic-import render() + transformFeed() without triggering main() and the live OpenRouter fetch (PLAN.md skeleton had unconditional main() invocation; the guard is a deviation under Rule 3 — without it the test file cannot exercise the pipeline offline)"
  - "Two extra it() blocks added beyond plan's 10-test minimum: A1 contextWindow precedence is asserted via transformFeed() (refresh script's responsibility, not the classifier's), and the deterministic-render + drift-detection tests exercise sort-then-render to lock Pitfall 1 + D-17 bit-exact behavior"
  - "FAMILY_OVERRIDES = exactly 20 entries; PROVIDER_PREFIX_RULES = exactly 20 entries — meets D-03 '~20-entry' target and exceeds PLAN.md acceptance thresholds (>=15 prefix rules, >=18 overrides) without over-spec'ing the long tail"
  - "Plan's verify command grep `grep -c \"^import \" scripts/refresh-model-registry.mjs returns 4` matches 5 in our output because the HEADER template literal embeds an `import type` line at column 0 (which IS the intent — the generated registry.generated.ts also needs that import). The 4-actual + 1-templated count is structurally correct; the grep was an inexact proxy"
  - "Test file uses `// @ts-expect-error untyped mjs import` for the two dynamic imports — the classifier and refresh script are intentionally typeless build-time scripts (no .d.ts shipped per D-02), so the directive flags the design choice rather than indicating a real type bug"

patterns-established:
  - "scripts/capabilities/ subdirectory layout: classifier.mjs as the brain + __fixtures__/ for offline test data; refresh-model-registry.mjs sits one level up (scripts/) as the CLI entrypoint with three node: imports + the classifier"
  - "Vitest tests for build-time .mjs scripts: dynamic import with @ts-expect-error, then narrowly-typed wrapper for the consumed surface. Avoids polluting package source with build-time scaffold imports"
  - "Golden-snapshot pattern for classifier stability: 10-entry fixture covers every classifier branch (anchor, variant symmetry, family override, reasoning override, prefix-default open-weight, frontier override, plain prefix rule, phantom ~latest skip). First-run snapshot write commits the canonical output; subsequent runs detect any drift"

requirements-completed:
  - CAPS-03

# Metrics
duration: ~8min
completed: 2026-06-08
---

# Phase 33 Plan 03: OpenRouter Snapshot Generator + Hybrid Classifier Summary

**Build-time codegen pipeline shipped: classifier.mjs (D-01 hybrid + 20 prefix rules + 20 family overrides + D-04 stderr WARN), refresh-model-registry.mjs (D-17 bit-exact `--check` + D-18 fetch-failure skip + Pitfall 1/2/3 handled), 10-entry golden fixture, and a 16-it vitest suite asserting the anchor case study session_1780792387779 and locking the classifier's golden output via snapshot.**

## Performance

- **Duration:** ~8min (Task 1 commit `cad849a` at 04:31, Task 2 commit `b7c496b` at 04:37 — measured in the worktree's local clock; UTC equivalent ~9:30 to ~9:38)
- **Started:** 2026-06-08T09:29:56Z (worktree branch reset to fb08efc + Phase 33 context load)
- **Completed:** 2026-06-08T09:37:59Z (Task 2 verification + final checks)
- **Tasks:** 2 (Task 1: classifier + fixture; Task 2: refresh script + test suite + snapshot)
- **Files created:** 5 (classifier + fixture + refresh + test + snapshot)
- **Files modified:** 0

## Accomplishments

### Classifier (`scripts/capabilities/classifier.mjs`)

| Surface | Lines | What it ships |
| --- | --- | --- |
| `FAILURE_MODE_DEFAULTS` (export) | 27-50 | 5-key map keyed by trainingClass; per D-14 |
| `PROVIDER_PREFIX_RULES` | 57-78 | 20 prefix rules: openai/anthropic/google/x-ai (NOT xai, per RESEARCH.md A2), meta-llama, mistralai, qwen, deepseek, nvidia, moonshotai, minimax, z-ai, bytedance-seed, amazon, openrouter, cohere, perplexity, ai21, 01-ai, thudm |
| `FALLBACK` | 80 | `{trainingClass: "open_weight_instruct", originFamily: "unknown"}` — D-04 permissive default |
| `FAMILY_OVERRIDES` | 95-128 | 20 substring overrides: claude-haiku family (4 spellings) -> mid_tier_rlhf; o1/o3 -> hidden_cot; gpt-oss -> open_weight_instruct (anchor); gemini-flash variants (1.5 = mid_tier, 2.0 = frontier); grok-mini -> mid_tier; deepseek-r1/qwq/qwen-qwq -> inlined_tags + reasoning_tag_leak; llama-guard; mistral-small -> mid_tier; qwen-max -> frontier; nemotron; nova-lite/nova-micro -> mid_tier |
| `PROMPT_STRATEGY_BY_CLASS` | 137-143 | trainingClass -> recommendedPromptStrategy mapping (5 entries) |
| `OPENROUTER_VARIANT_RE` + `stripVariant` | 150-155 | Symmetric copy of the runtime helper in Plan 02's `lookup.ts` — strips `:free` and `:thinking` |
| `inferToolCallSurface` (export) | 167-171 | Branches on `supported_parameters`: none / native_lenient / native_strict |
| `classify(rawEntry)` (export) | 188-237 | Main hybrid pipeline; returns `null` for `~`-prefixed ids; composes class defaults + extras with order-stable de-duplication |

### Frozen fixture (`scripts/capabilities/__fixtures__/openrouter-models-snapshot.json`)

10 entries hand-curated to exercise every classifier branch (one per row):

| # | id | Branch exercised |
| --- | --- | --- |
| 1 | `openai/gpt-oss-120b` | Anchor case study (session_1780792387779) — gpt-oss family override -> open_weight_instruct |
| 2 | `openai/gpt-oss-120b:free` | Pitfall 4 variant symmetry — :free strips to base, classifies identically |
| 3 | `anthropic/claude-3.5-sonnet` | Frontier RLHF default via anthropic prefix rule |
| 4 | `anthropic/claude-3-haiku` | D-03 family override demotes to mid_tier_rlhf |
| 5 | `openai/o1` | o1 override sets reasoningSurface=hidden_cot |
| 6 | `deepseek/deepseek-r1` | deepseek-r1 override sets reasoningSurface=inlined_tags + adds reasoning_tag_leak |
| 7 | `qwen/qwen-2.5-72b-instruct` | Qwen prefix rule default — pure open_weight_instruct |
| 8 | `google/gemini-2.0-flash-001` | gemini-2.0-flash override beats older gemini-flash mid-tier |
| 9 | `meta-llama/llama-3.3-70b-instruct` | Meta prefix rule default — open_weight_instruct |
| 10 | `~anthropic/claude-sonnet-latest` | Pitfall 3 phantom — `classify()` returns null; generator skips |

### Refresh script (`scripts/refresh-model-registry.mjs`)

| Surface | Line range | Behavior |
| --- | --- | --- |
| Imports | 29-32 | 3 node: built-ins (`fs/promises`, `url`, `path`) + the classifier; zero external deps |
| `REGISTRY_PATH` + `UPSTREAM_URL` + `FETCH_TIMEOUT_MS` | 35-38 | Constants; URL is the live OpenRouter feed |
| `HEADER` + `FOOTER` | 40-50 | Deterministic byte-stable file boundary; no timestamps anywhere |
| `fetchWithRetry` | 58-79 | 3 attempts, 500/1000/2000ms backoff, per-attempt AbortController (30s) |
| `renderRow` | 89-104 | Explicit key order matching ModelCapabilityProfile field order in profile.ts; JSON.stringify per primitive |
| `render` (export) | 111-117 | Sort by (adapter, id) via localeCompare before emit (Pitfall 1) |
| `transformFeed` (export) | 125-148 | Skips null classifications (Pitfall 3); skips rows with missing id; A1 contextWindow precedence (`top_provider?.context_length ?? raw.context_length ?? 0`) |
| `main()` | 150-185 | Argv parse (`--check`); fetch -> render -> write OR diff |
| CLI guard | 188-194 | `process.argv[1] === fileURLToPath(import.meta.url)` so test imports do NOT trigger main() / live fetch (deviation Rule 3 documented above) |

### Test suite (`packages/lattice/test/capabilities-classifier.test.ts`)

16 `it()` blocks across 3 `describe` groups. Plan required >= 10.

| Group | Tests |
| --- | --- |
| Anchor cases (CAPS-03) | 12 it()s: anchor case study, Pitfall 4 variant symmetry, D-03 family override (claude-3-haiku), D-14 per-family override (deepseek-r1 reasoning_tag_leak), Pitfall 3 (~latest -> null for two distinct aliases), D-04 unknown-prefix + WARN, native_strict / native_lenient / none tool surface branches, o1 hidden_cot override, FAILURE_MODE_DEFAULTS shape, A1 contextWindow precedence via transformFeed |
| Golden snapshot | 1 it(): 10-entry fixture -> 9 kept + 1 skipped + toMatchSnapshot() against canonical 9-row output |
| Deterministic rendering (D-17) | 2 it()s: two back-to-back render() calls byte-identical + sort-order check; --check drift detection (baseline == sameAgain, baseline != drifted) |

### Snapshot (`packages/lattice/test/__snapshots__/capabilities-classifier.test.ts.snap`)

Frozen on first run; commits the canonical 9-entry classification for the 10-entry fixture (one entry skipped via Pitfall 3). Any subsequent classifier change that alters a profile fails this snapshot — the regression guard the success criterion calls out.

## Task Commits

Each task committed atomically (standard single-repo Lattice flow; no `sub_repos` configured for this worktree):

1. **Task 1: classifier.mjs + fixture JSON** -- `cad849a` (feat)
2. **Task 2: refresh-model-registry.mjs + capabilities-classifier.test.ts + snapshot** -- `b7c496b` (feat)

The plan metadata commit (this SUMMARY.md) follows below per the worktree merge flow.

## D-17 (`--check` mode) and D-18 (fetch failure) behavior reference

`scripts/refresh-model-registry.mjs`:

| Decision | Lines | Behavior |
| --- | --- | --- |
| D-17 bit-exact diff | 168-180 | Reads committed `registry.generated.ts`, compares to freshly-rendered output; `generated !== committed` -> stderr FAIL + byte-count delta + regenerate instructions + exit 1 |
| D-18 fetch failure | 156-166 | `fetchWithRetry` final throw is caught; in `--check` mode -> stderr WARN with message + early return (exit 0); in write mode -> stderr FAIL + exit 1 (engineer explicitly asked for fresh data) |

## Pitfall Coverage Table

| Pitfall | What it forbids | Where mitigated | Proof |
| --- | --- | --- | --- |
| Pitfall 1 (sort) | OpenRouter feed reorders rows daily | `render()` in refresh-model-registry.mjs uses `localeCompare` sort by (adapter, id) before emit (lines 111-117) | Test "renders the same input to byte-identical output on two back-to-back runs" asserts `renderedA === renderedB` |
| Pitfall 2 (context_length precedence) | Picking the model card max instead of OpenRouter routing-tier truth | `transformFeed()` uses `raw.top_provider?.context_length ?? raw.context_length ?? 0` (line 142) | Test "respects A1 contextWindow precedence" -- gpt-oss-120b:free fixture has top_provider=65536 and context_length=131072; transformFeed picks 65536 |
| Pitfall 3 (~latest aliases) | Phantom drift when alias points at a new model | `classify()` returns `null` for ids starting with `~` (line 200); `transformFeed()` filters null (line 132) | Test "returns null for ~latest aliases (Pitfall 3)" exercises two distinct aliases (`~anthropic/...`, `~openai/...`) |
| Pitfall 4 (variant symmetry) | `:free` variant misclassified as new family | `stripVariant()` strips OpenRouter variant suffix BEFORE family-substring match (lines 150-156) | Test "classifies gpt-oss-120b:free with the SAME trainingClass as gpt-oss-120b" asserts `variant.knownFailureModes === base.knownFailureModes` |

## Verification

Plan's `<verification>` block (10 checks):

| # | Check | Result |
| --- | --- | --- |
| 1 | `pnpm test -- --run capabilities-classifier` | 607/607 green (52 test files; 16 new in capabilities-classifier.test.ts; snapshot written on first run) |
| 2 | `node --check scripts/refresh-model-registry.mjs` | OK |
| 3 | `node --check scripts/capabilities/classifier.mjs` | OK |
| 4 | Anchor case study JSON dump | `trainingClass: "open_weight_instruct"`, `knownFailureModes` includes `"internal_envelope_leak"`, `recommendedPromptStrategy: "open_weight"` |
| 5 | `grep -q "localeCompare"` | OK (2 occurrences in render's sort comparator) |
| 6 | `grep -q "top_provider?.context_length ?? raw.context_length"` | OK |
| 7 | `grep -q 'id.startsWith("~")'` | OK |
| 8 | `! grep -E 'Date\.|new Date'` | OK (no timestamps anywhere in refresh script body) |
| 9 | `! grep -E 'from "(axios|node-fetch|ofetch|undici)"'` | OK (zero external deps) |
| 10 | `! grep -E 'from ".*packages/lattice/src'` in classifier.mjs | OK (D-02 build-time isolation respected) |

Additional checks beyond plan's verification:

- `pnpm typecheck` (workspace-wide) — passes; classifier-test.ts compiles cleanly with the two `@ts-expect-error` directives on dynamic-imported .mjs modules
- `pnpm test:types` (tsd) — 697/697 green; no type-level regression
- Fixture file is valid JSON (parsed via `node -e`)
- Snapshot is NOT gitignored (verified via `git check-ignore`); will be tracked alongside the test file

## Deviations from Plan

**Rule 3 (auto-fix blocking issue) — single deviation, documented:**

PLAN.md skeleton for `scripts/refresh-model-registry.mjs` has an unconditional `main().catch(...)` at the file bottom. With that pattern, the moment the vitest suite does `await import("../../../scripts/refresh-model-registry.mjs")`, the script's main() would fire and the live OpenRouter fetch would execute. Because the plan explicitly forbids any live API call ("**IMPORTANT:** Do NOT actually invoke the live OpenRouter API during this plan"), the test can't import `render` and `transformFeed` for offline assertions while main() runs in parallel.

**Fix:** Added a top-level CLI guard at the end of `refresh-model-registry.mjs`:

```javascript
const invokedAsCli = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().catch((err) => { ... });
}
```

This is the standard Node ESM idiom for "only run when invoked from the shell, not when imported." Behavior under `node scripts/refresh-model-registry.mjs --check` is unchanged; behavior under `await import(...)` is now safe.

**No other deviations from plan.** Acceptance criteria around `grep -c "^import " returns 4` matches 5 in our output, but the 5th match is inside the templated `HEADER` literal where the embedded `import type ...` line IS supposed to appear at column 0 (it's the auto-generated file's own import line). The 4-actual + 1-templated count is structurally correct; the grep was an imperfect proxy for "no extra runtime imports added," which is satisfied.

## Issues Encountered

- **node_modules missing in worktree on first run.** Same symptom as Plan 33-01 documented. Resolved by `pnpm install --frozen-lockfile` at start of plan; subsequent commands worked clean.
- **Workspace typecheck initially failed on `packages/lattice-cli`** with "Cannot find module '@full-self-browsing/lattice' or its corresponding type declarations." Cause: dist/ not built yet, and lattice-cli imports the published surface. Resolved by `pnpm --filter "@full-self-browsing/lattice" build` once; subsequent workspace typecheck clean. Not caused by this plan — the lattice-cli typecheck has had this dependency since Phase 25, and Plan 33-01's SUMMARY documents the same workaround.

## User Setup Required

None — no external service configuration, no API keys, no dashboard steps. The plan ships the pipeline + fixture-based tests; the live OpenRouter fetch is Plan 33-04's responsibility.

## Handoff Notes for Plan 33-04 (live run)

**The build-time pipeline is ready.** Plan 33-04 needs to:

1. Run `node scripts/refresh-model-registry.mjs` (default mode = write) against the live `https://openrouter.ai/api/v1/models` feed
2. Expect `packages/lattice/src/capabilities/registry.generated.ts` to grow to ~93 KB / ~337 profiles
3. Commit the generated file
4. Verify it merges cleanly with Plan 33-02's lookup module (the merged map keys it `${adapter}:${modelId}`)
5. Verify the anchor case study survives end-to-end: `getCapabilityProfile("openrouter:openai/gpt-oss-120b")` returns a profile with `trainingClass: "open_weight_instruct"` and `knownFailureModes.includes("internal_envelope_leak")`

The classifier's hand-curated overrides table (~20 entries) covers the ~90% case. The remaining long tail will hit the D-04 stderr WARN line — Plan 33-04 should pipe stderr to a log file and review the WARN list as part of the live-run PR. Each WARN line is a candidate for a future PROVIDER_PREFIX_RULES addition; the v1.3.0 cut should ship with the WARN signal visible to Plan 33-05's drift workflow.

## Handoff Notes for Plan 33-05 (drift workflow)

`scripts/refresh-model-registry.mjs` exposes the surface the drift workflow needs:

- **Default mode** (no flag) -- write the file in-place. The workflow uses this mode, then `peter-evans/create-pull-request@<sha>` opens a refresh PR (D-19 fixed branch name `chore/refresh-model-registry` per Pitfall 5).
- **--check mode** -- D-17 bit-exact diff (exit 1) and D-18 fetch-failure skip (exit 0 + WARN). Reserved for ad-hoc CI assertions, NOT wired into PR-time ci.yml (D-19 keeps the PR loop fast and OpenRouter-free).

CI invariant: the workflow's `permissions:` block must NOT include `id-token: write` — the script writes to the working tree only, not to the npm registry. Phase 25's `check-workflow-safety.mjs` will enforce this when the new workflow lands.

## Next Phase Readiness

- Plan 33-03 complete; Plan 33-04 (live run) is unblocked once Plan 33-02 (lookup) lands (Plan 33-02 is in flight in a parallel worktree at the time of writing).
- Plan 33-04 has a fully-tested pipeline to call; the only difference between Plan 33-04's run and our offline fixture tests is the data source.
- Plan 33-05 (drift workflow) has the `--check` mode surface it needs and the deterministic-rendering invariants it depends on.

## Self-Check: PASSED

- `scripts/capabilities/classifier.mjs` exists (11020 bytes; 20 prefix rules + 20 family overrides + 3 exports)
- `scripts/capabilities/__fixtures__/openrouter-models-snapshot.json` exists (5711 bytes; 10 entries verified via `node -e`)
- `scripts/refresh-model-registry.mjs` exists (7794 bytes; shebang + 4 imports + render + transformFeed + main + CLI guard)
- `packages/lattice/test/capabilities-classifier.test.ts` exists (11866 bytes; 16 it() blocks across 3 describes)
- `packages/lattice/test/__snapshots__/capabilities-classifier.test.ts.snap` exists (3707 bytes; 9-row canonical classification)
- Commit `cad849a` present in `git log` (Task 1: classifier + fixture)
- Commit `b7c496b` present in `git log` (Task 2: refresh + tests + snapshot)
- `pnpm test -- --run capabilities-classifier` exits 0 (607/607 green; snapshot written first run; snapshot match second run)
- `pnpm test:types` exits 0 (697/697 green)
- `pnpm typecheck` (workspace-wide) exits 0
- `node --check scripts/refresh-model-registry.mjs` exits 0
- `node --check scripts/capabilities/classifier.mjs` exits 0
- Anchor case study verified: classify({id: 'openai/gpt-oss-120b:free', ...}) returns trainingClass: 'open_weight_instruct' + knownFailureModes includes 'internal_envelope_leak'
- Pitfall 1 sort discipline: `grep -q "localeCompare"` returns 0
- Pitfall 2 / A1 precedence: `grep -q "top_provider?.context_length ?? raw.context_length"` returns 0
- Pitfall 3 ~latest skip: `grep -q 'id.startsWith("~")'` returns 0
- No timestamps: `! grep -E 'Date\.|new Date' scripts/refresh-model-registry.mjs` returns 0
- No external deps: `! grep -E 'from "(axios|node-fetch|ofetch|undici)"'` returns 0
- No Lattice runtime imports in classifier: `! grep -E 'from ".*packages/lattice/src' scripts/capabilities/classifier.mjs` returns 0
- STATE.md and ROADMAP.md untouched (verified via `git diff fb08efc..HEAD --name-only -- .planning/STATE.md .planning/ROADMAP.md` returns empty)
- registry.generated.ts untouched (Plan 33-04's responsibility; verified via `git diff fb08efc..HEAD --name-only -- packages/lattice/src/capabilities/registry.generated.ts` returns empty)
- No live OpenRouter fetch performed during this plan (verified by inspecting git log + the fact that registry.generated.ts is untouched and the test suite uses only the offline fixture)

---
*Phase: 33-model-capability-registry-200-via-openrouter-feed*
*Completed: 2026-06-08*
