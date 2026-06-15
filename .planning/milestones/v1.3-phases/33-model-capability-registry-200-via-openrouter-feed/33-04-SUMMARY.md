---
phase: 33-model-capability-registry-200-via-openrouter-feed
plan: 04
subsystem: capability-registry
tags: [codegen-run, registry-data, integration-tests, capability-registry, live-snapshot, changeset]

# Dependency graph
requires:
  - phase: 33-02
    provides: lookup module + bootstrap registry.static.ts + bootstrap registry.generated.ts that this plan populates with real data
  - phase: 33-03
    provides: scripts/refresh-model-registry.mjs + classifier.mjs build-time pipeline that this plan invokes against the live OpenRouter feed
provides:
  - 333-row OpenRouter snapshot in registry.generated.ts (CAPS-05 >=200 success criterion met)
  - 4 hand-edited supplemental profiles in registry.static.ts (CAPS-05 direct-adapter coverage)
  - 22-it integration test suite proving end-to-end registry behavior via the public surface
  - vi.doMock conversion of Plan 02 bootstrap-empty lookup tests (still asserting empty-registry contract under mocked conditions)
  - 2 live-data lookup-test cases anchoring session_1780792387779 against the populated registry
  - .changeset/v1.3.0-capability-registry.md minor bump entry for @full-self-browsing/lattice
affects:
  - 33-05 (drift workflow now has a populated registry to diff against; --check mode reserved for ad-hoc CI assertions, NOT PR-time ci.yml per D-19)
  - 34-adapter-quirks (Phase 34 quirk dispatch reads the populated registry's adapter field)
  - 35-prompt-scaffolds (Phase 35 prompt-scaffold dispatch reads recommendedPromptStrategy from the populated registry)
  - 36-output-sanitizers (Phase 36 sanitizer dispatch reads knownFailureModes from the populated registry; anchor case study now resolved)
  - 37-tool-call-validators (Phase 37 validator reads toolCallSurface from the populated registry)
  - 38-receipt-v1.2-modelClass (Phase 38 receipts derive modelClass from trainingClass via the populated registry)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; pure data + tests + changeset
  patterns:
    - "Live OpenRouter API snapshot committed via build-time codegen (D-16 / D-17 / D-19)"
    - "vi.doMock + vi.resetModules + vi.doUnmock in beforeEach for test isolation across live-data and mocked-empty test groups in the same file"
    - "Closed-union runtime invariants defensive sweep across the merged 337-row registry (belt + suspenders to typed `as const satisfies`)"
    - "Disjoint adapter sets between static (anthropic / gemini / lm-studio / xai) and generated (openrouter only) — no canonical-key collisions possible"

key-files:
  created:
    - packages/lattice/test/capabilities-registry-integration.test.ts (289 lines, 6 describes, 22 it blocks)
    - .changeset/v1.3.0-capability-registry.md (32 lines, minor bump)
  modified:
    - packages/lattice/src/capabilities/registry.generated.ts (bootstrap empty -> 333 profiles, 118127 bytes, 3672 lines)
    - packages/lattice/src/capabilities/registry.static.ts (bootstrap empty -> 4 supplemental profiles, 88 lines)
    - packages/lattice/test/capabilities-lookup.test.ts (14 tests preserved + 2 new live-data tests; bootstrap-empty describes converted to vi.doMock)

key-decisions:
  - "Followed PLAN.md values for static-profile fields over the alternative values in the executor prompt. PLAN.md is the authoritative spec per the orchestrator prompt: gemini-2.5-pro contextWindow = 2097152 (2M), grok-4 contextWindow = 131072 (128K), grok-4 toolCallSurface = native_lenient. PLAN.md's Task 3 integration test (Suite 2) explicitly asserts `expect(p!.contextWindow).toBe(2097152)` for gemini, confirming the PLAN value over the prompt's 1000000 value."
  - "Source-file order in registry.static.ts is alphabetical by canonical key (anthropic, gemini, lm-studio, xai) for human review ease. Runtime lookup order is governed by ADAPTER_ORDER in lookup.ts and is INDEPENDENT of source-file order."
  - "File size 118KB raw exceeds the 100KB advisory threshold from CONTEXT.md by ~18KB. Documented as a Phase 34+ candidate for split-by-adapter optimization but NOT a blocker: tsdown gzips it to a single-digit-percent uptick on the published tarball."
  - "Live-data describe block placed FIRST in capabilities-lookup.test.ts so the vi.doMock calls from subsequent describes cannot pollute its module cache. beforeEach uses vi.resetModules + explicit vi.doUnmock to defend against any future test ordering changes."
  - "Integration test suite uses 6 describes (one above PLAN.md's 5) — added a separate uniqueness-of-canonical-keys describe to surface duplicate key detection as a single, narrow assertion the reviewer can scan."

patterns-established:
  - "Live OpenRouter snapshot regeneration: `node scripts/refresh-model-registry.mjs` writes; `--check` mode diffs. Re-runs are byte-identical (Pitfall 1 sort discipline holds)."
  - "Static profile authoring shape: file header comment cites the published context window source per profile; explicit key order matches the generator's renderRow output for diff legibility."
  - "Integration test layout: 6 describes covering (1) coverage / size, (2) static profile resolution, (3) anchor case study, (4) fuzzy lookup against real data, (5) closed-union runtime invariants, (6) canonical-key uniqueness. Each describe carries a CAPS-* reference in its name string."
  - "Live-data + mocked-empty cohabitation in the same vitest file: place live-data describe FIRST with vi.doUnmock in beforeEach; subsequent describes use vi.doMock without affecting earlier tests."

requirements-completed:
  - CAPS-05  # >=200 distinct profiles at v1.3.0 cut
  - CAPS-02  # second time touched in Phase 33; first was 33-02 lookup surface; this plan exercises against real data

# Metrics
duration: ~25 min
completed: 2026-06-08
---

# Phase 33 Plan 04: Live OpenRouter Snapshot + 4 Static Supplemental Profiles + Integration Suite + Changeset Summary

**Live OpenRouter snapshot (333 profiles, 118127 bytes) committed to registry.generated.ts; 4 hand-edited supplemental profiles (anthropic:claude-opus-4, gemini:gemini-2.5-pro, xai:grok-4, lm-studio:local-template) committed to registry.static.ts; 22-it integration suite proves end-to-end behavior including the session_1780792387779 anchor case study; Plan 02 lookup tests converted to vi.doMock for empty-registry assertions and extended with 2 live-data cases; .changeset/v1.3.0-capability-registry.md minor-bump entry shipped. 645 / 645 lattice tests passing; typecheck clean; --check mode confirms upstream match.**

## Performance

- **Started:** 2026-06-08T04:46:00Z (worktree branch verification + plan + context load)
- **Completed:** 2026-06-08T04:58:00Z (final verification sweep)
- **Duration:** ~25 min wall clock (5 atomic task commits)
- **Tasks:** 5 (live run, static profiles, integration suite, lookup-test conversion, changeset)
- **Files modified:** 5 (2 created + 3 modified)

## Accomplishments

### 1. Live OpenRouter snapshot (Task 1) — `registry.generated.ts`

- Ran `node scripts/refresh-model-registry.mjs` against `https://openrouter.ai/api/v1/models` — one HTTP GET, ~407 KB response on a single attempt (no retries needed)
- 341 raw models in the OpenRouter feed; 8 tilde-prefixed `*-latest` aliases filtered out (Pitfall 3); 333 profiles emitted
- File size 118127 bytes (~115 KB raw, ~6 KB gzipped) — modestly above the 100 KB advisory threshold from CONTEXT.md (line 155). Flagged for Phase 34+ split-by-adapter optimization but NOT a blocker (gzip ratio is acceptable for the published tarball)
- 3672 lines, 333 row-opening `^  {$` lines (CAPS-05 success criterion: >=200, ACHIEVED)
- Anchor case study present in both forms: `id: "openai/gpt-oss-120b"` (base) and `id: "openai/gpt-oss-120b:free"` (variant)
- Sort discipline verified: `localeCompare` sort by (adapter, id) holds; all 333 rows have `adapter: "openrouter"`; ids are alphabetically increasing within the adapter block
- Determinism verified: re-running the generator produces byte-identical output (`/tmp/registry-run1.ts` diffed against re-written file = empty)
- `--check` mode exits 0 with `OK — registry matches upstream.`

### 2. Static supplemental profiles (Task 2) — `registry.static.ts`

4 hand-edited profiles, alphabetical source order (anthropic, gemini, lm-studio, xai):

| Canonical key | adapter | originFamily | trainingClass | reasoningSurface | toolCallSurface | contextWindow | knownFailureModes | recommendedPromptStrategy |
|----|----|----|----|----|----|----|----|----|
| anthropic:claude-opus-4 | anthropic | anthropic | frontier_rlhf | none | native_strict | 200000 | [] | frontier |
| gemini:gemini-2.5-pro | gemini | google | frontier_rlhf | none | native_strict | 2097152 | [] | frontier |
| lm-studio:local-template | lm-studio | unknown | local_quantized | none | none | 8192 | [all 5 local_quantized defaults] | local |
| xai:grok-4 | xai | xai | frontier_rlhf | none | native_lenient | 131072 | [] | frontier |

- All 3 frontier profiles have empty `knownFailureModes` (matches `FAILURE_MODE_DEFAULTS.frontier_rlhf` which is `[]`)
- `lm-studio:local-template` carries the full `FAILURE_MODE_DEFAULTS.local_quantized` set per D-14: `internal_envelope_leak`, `system_prompt_echo`, `template_artifact_leak`, `malformed_tool_arguments`, `premature_termination`
- `as const satisfies readonly ModelCapabilityProfile[]` proves shape correctness at compile time; pnpm typecheck clean
- Disjoint adapter sets verified: no `openrouter` adapter in static; no `anthropic | gemini | lm-studio | xai` adapter in generated

### 3. Integration test suite (Task 3) — `capabilities-registry-integration.test.ts`

289 lines, 6 describes, 22 it blocks covering:

| Describe | it count | Coverage |
|----------|----------|----------|
| Phase 33 registry — coverage (CAPS-05) | 4 | total >=200 distinct keys; exactly 4 static; >=200 generated; merged size equals sum (no collisions) |
| Phase 33 registry — static direct-adapter coverage (CAPS-05) | 4 | each of the 4 supplemental profiles resolves via getCapabilityProfile with expected contextWindow / trainingClass / recommendedPromptStrategy |
| Phase 33 registry — anchor case study session_1780792387779 (CAPS-02 + CAPS-03) | 4 | base id -> open_weight_instruct + internal_envelope_leak; :free variant -> identical class (Pitfall 4 symmetry); findCapabilityProfile strips :free; findCapabilityProfile on base id returns openrouter entry |
| Phase 33 registry — fuzzy lookup against real data (D-10) | 2 | bare claude-opus-4 returns only the anthropic direct profile; openai/gpt-4o returns at least the openrouter profile |
| Phase 33 registry — closed-union runtime invariants | 7 | every adapter / trainingClass / reasoningSurface / toolCallSurface / recommendedPromptStrategy / knownFailureMode across the merged 337-row registry sits in its closed union; contextWindow is finite non-negative |
| Phase 33 registry — uniqueness of canonical keys | 1 | every `${adapter}:${id}` is unique across the merged set (no duplicates) |

### 4. Plan 02 lookup-test conversion (Task 4) — `capabilities-lookup.test.ts`

- 2 bootstrap-empty describes converted to vi.doMock + vi.resetModules: now assert "documented behavior under an empty registry" rather than relying on bootstrap state
- 1 NEW describe added FIRST: `populated registry end-to-end (CAPS-02 + CAPS-05)` with 2 live-data assertions (getCapabilityProfile + findCapabilityProfile against the populated registry, anchor case study session_1780792387779)
- Live-data describe placed FIRST + uses vi.doUnmock in beforeEach so subsequent vi.doMock calls cannot pollute its module cache
- 5 stripOpenRouterVariant describes untouched (pure helper, no registry dependency)
- 4 adapter-ordering vi.doMock cases untouched (already use vi.doMock)
- Test count: 5 + 2 + 3 + 2 + 4 = 16 (was 14 in Plan 02; +2 live-data cases)

### 5. Changeset (Task 5) — `.changeset/v1.3.0-capability-registry.md`

- YAML frontmatter: `"@full-self-browsing/lattice": minor`
- Markdown body documents: public surface (ModelCapabilityProfile + 6 closed unions + 3 lookup functions + 2 const arrays), data (337 profiles total = 333 OpenRouter + 4 static), anchor case study session_1780792387779, CAPS-01 / CAPS-02 / CAPS-03 / CAPS-05 traceability
- Auto-couples `@full-self-browsing/lattice-cli` via the changesets `fixed` config (same minor bump), but the registry surface itself does NOT ship in the CLI tarball
- No `@full-self-browsing/lattice-cli` entry in the frontmatter — the fixed-version sibling bump happens automatically

## Task Commits

Each task committed atomically (single-repo Lattice flow; no `sub_repos` configured):

1. **Task 1: Live OpenRouter snapshot** — `c6203ad` (feat)
2. **Task 2: 4 static supplemental profiles** — `596293d` (feat)
3. **Task 3: Integration test suite (22 it blocks)** — `6b8449a` (test)
4. **Task 4: Plan 02 lookup-test vi.doMock conversion + 2 live-data cases** — `5249ba7` (test)
5. **Task 5: Changeset minor bump** — `a1e5f04` (chore)

## Unknown-Prefix WARN Summary (D-04 follow-up signal)

The live OpenRouter feed contains 35 distinct provider prefixes the classifier did NOT recognize. All defaulted to `trainingClass: "open_weight_instruct"` per D-04 permissive policy and emitted a stderr WARN line. **68 total WARN occurrences across the 333 emitted profiles** (some prefixes appear multiple times because OpenRouter ships multiple models per provider).

### Unknown prefixes by occurrence count (top 10)

| Prefix | WARN count | Example model | Suggested PROVIDER_PREFIX_RULES entry |
|--------|------------|---------------|---------------------------------------|
| nousresearch | 5 | nousresearch/hermes-4-405b | open_weight_instruct, originFamily=nousresearch |
| arcee-ai | 5 | arcee-ai/maestro-reasoning | open_weight_instruct, originFamily=arcee |
| thedrummer | 4 | thedrummer/cydonia-24b-v4.1 | open_weight_instruct, originFamily=thedrummer (fine-tunes) |
| sao10k | 4 | sao10k/l3.1-euryale-70b | open_weight_instruct, originFamily=sao10k (fine-tunes) |
| aion-labs | 4 | aion-labs/aion-2.0 | open_weight_instruct, originFamily=aion |
| xiaomi | 3 | xiaomi/mimo-v2.5-pro | open_weight_instruct, originFamily=xiaomi |
| microsoft | 3 | microsoft/phi-4 | mid_tier_rlhf, originFamily=microsoft (phi is RLHF-tuned) |
| liquid | 3 | liquid/lfm-2-24b-a2b | open_weight_instruct, originFamily=liquid |
| inclusionai | 3 | inclusionai/ling-2.6-1t | open_weight_instruct, originFamily=inclusionai |
| tencent | 2 | tencent/hy3-preview | open_weight_instruct, originFamily=tencent |

### Complete unknown-prefix list (35 entries)

aion-labs, allenai, anthracite-org, arcee-ai, baidu, bytedance, cognitivecomputations, deepcogito, essentialai, gryphe, ibm-granite, inception, inclusionai, inflection, kwaipilot, liquid, mancer, microsoft, morph, nex-agi, nousresearch, perceptron, poolside, prime-intellect, rekaai, relace, sao10k, stepfun, switchpoint, tencent, thedrummer, undi95, upstage, writer, xiaomi

### Recommended follow-up

A future plan (33-05 maintenance pass, or Phase 34+ when adapter quirks ship) should:

1. **Add the top-occurrence prefixes** to `PROVIDER_PREFIX_RULES` in `scripts/capabilities/classifier.mjs`. Most are open-weight families (nousresearch fine-tunes, arcee-ai, etc.); microsoft phi is the one notable mid-tier candidate.
2. **Add family overrides** for the "thinking" / "reasoning" subtypes (e.g., `allenai/olmo-3-32b-think`, `arcee-ai/trinity-large-thinking`, `arcee-ai/maestro-reasoning`) to set `reasoningSurface: "inlined_tags"` + `knownFailureModesAdd: ["reasoning_tag_leak"]` per D-14.
3. **Add an explicit `microsoft` prefix rule** to bump phi-class models to `mid_tier_rlhf` (closer to the published Microsoft positioning) rather than the FALLBACK default.

The 35 unknown prefixes do NOT block this plan because the FALLBACK default is permissive and the WARN-line signal is preserved for the next regeneration PR.

## Anchor Case Study Verification

`session_1780792387779` — gpt-oss-120b on FSB autopilot emitting `{"summary": "Greeted the user."}` as the user-visible reply for the task "hi".

The integration test suite asserts:

```typescript
const p = getCapabilityProfile("openrouter:openai/gpt-oss-120b");
// p.trainingClass === "open_weight_instruct"  ✓
// p.knownFailureModes.includes("internal_envelope_leak")  ✓
// p.recommendedPromptStrategy === "open_weight"  ✓

const variant = getCapabilityProfile("openrouter:openai/gpt-oss-120b:free");
// variant.trainingClass === p.trainingClass  ✓ (Pitfall 4 symmetry)
// variant.knownFailureModes === p.knownFailureModes  ✓

const results = findCapabilityProfile("openai/gpt-oss-120b:free");
// results.length >= 1  ✓
// results[0].adapter === "openrouter" && results[0].id === "openai/gpt-oss-120b"  ✓
```

All 4 anchor case study assertions pass against the live OpenRouter snapshot. The case study is now systematically queryable via the public registry surface — Phase 36 can dispatch on `knownFailureModes.includes("internal_envelope_leak")` to strip the `summary` envelope before user-visible rendering.

## Direct-Adapter Coverage Outcomes

All 4 static supplemental profiles resolve cleanly via `getCapabilityProfile`:

| Canonical key | Result | trainingClass | contextWindow |
|--------------|--------|---------------|---------------|
| anthropic:claude-opus-4 | DEFINED | frontier_rlhf | 200000 |
| gemini:gemini-2.5-pro | DEFINED | frontier_rlhf | 2097152 |
| xai:grok-4 | DEFINED | frontier_rlhf | 131072 |
| lm-studio:local-template | DEFINED | local_quantized | 8192 |

Fuzzy lookup against the bare direct-adapter id (`findCapabilityProfile("claude-opus-4")`) returns ONLY the anthropic direct profile because the OpenRouter routing equivalent uses the vendor-prefixed shape (`openrouter:anthropic/claude-opus-4`) which doesn't suffix-match the bare id. This confirms the direct-first adapter ordering is real but does not force any specific adapter to appear when not actually registered for that id.

## Plan 02 Lookup-Test Status

| Describe | Status | Cases |
|----------|--------|-------|
| stripOpenRouterVariant (D-11) | UNCHANGED | 5 |
| populated registry end-to-end (CAPS-02 + CAPS-05) | NEW | 2 (live data) |
| getCapabilityProfile against an empty registry (mocked) | CONVERTED to vi.doMock | 3 (was 3) |
| findCapabilityProfile against an empty registry (mocked) | CONVERTED to vi.doMock | 2 (was 2) |
| adapter ordering (D-10) via vi.doMock injection | UNCHANGED | 4 |

Total: 16 cases (Plan 02 was 14; +2 live-data). All green.

## Deviations from Plan

The PLAN.md combined the integration suite (Task 3) and Plan 02 lookup-test conversion into a single Task 3. The executor prompt splits them into Task 3 and Task 4. I committed them as separate atomic commits (one for each) per the executor prompt's "Commit each task atomically" instruction.

**Rule 2 (auto-add missing critical functionality) — single small instance:**

- The PLAN.md Task 3 integration test code sample uses `findCapabilityProfile("anthropic/claude-3.5-sonnet")` for the "openrouter-only fallback" case. The live OpenRouter snapshot does NOT contain a `claude-3.5-sonnet` row (Anthropic retired it before 2026-06-08). I substituted `findCapabilityProfile("openai/gpt-4o")` which DOES exist in the snapshot and exercises the same contract (no direct openai static profile, so only the openrouter entry comes back). The assertion shape is identical — the change is data-driven, not contract-driven.

No other deviations.

## Issues Encountered

- **vi.doMock pollution across describe blocks.** Initial implementation placed the new live-data assertions AFTER the mocked-empty describes. The mocks remained registered across describe boundaries (vi.doMock affects the module registry; vi.resetModules only resets the cache), so the live-data describes saw the mocked-empty registry and failed. **Fix:** moved the live-data describe to be FIRST in the file (before any vi.doMock fires) and added `vi.doUnmock` calls in its `beforeEach` as belt-and-suspenders for future test additions. All 16 cases pass.
- **Worktree starting commit was NOT the prompt's expected base.** The worktree HEAD was at `28d6c3b` (pre-Phase-33) but the `<worktree_branch_check>` snippet expected base `4b487c5` (post-Phase-33-02/03). Resolved via `git reset --hard 4b487c5` per the check's fallback logic; subsequent `pnpm install --frozen-lockfile` succeeded.
- **File size 118KB exceeds 100KB advisory threshold.** Not a blocker — gzips to ~6 KB so the tarball impact is modest. Flagged for Phase 34+ split-by-adapter optimization.

## User Setup Required

None — Phase 33-04 is pure data + tests + changeset. No env vars, no API keys (OpenRouter `/api/v1/models` requires no auth for read-only listing), no dashboard steps.

## Handoff to Plan 33-05 (drift workflow)

The drift workflow `.github/workflows/registry-drift.yml` (Plan 33-05) consumes the surface this plan exercises:

- **Default mode (no flag)** — write the file in-place. Plan 33-05's workflow uses this mode, then `peter-evans/create-pull-request@<sha>` opens a refresh PR (D-19 fixed branch name `chore/refresh-model-registry` per Pitfall 5).
- **`--check` mode** — D-17 bit-exact diff (exit 1 on drift) and D-18 fetch-failure skip (exit 0 + WARN). Reserved for ad-hoc CI assertions, **NOT** wired into PR-time `ci.yml` (D-19 keeps the PR loop fast and OpenRouter-free).
- **First weekly run after Plan 33-05 lands will produce a NO-OP PR** because this plan already brought the committed registry up to date with the upstream feed at 2026-06-08. The drift workflow's first real diff PR will land when OpenRouter ships new models or retires existing ones (realistically 1-2 weeks after Plan 33-05 merges).
- **Manual baton step Plan 33-05 cannot automate:** the "Allow GitHub Actions to create and approve pull requests" repository setting must be enabled before `peter-evans/create-pull-request` can open a PR. Surface this as a hand-off note in 33-05's plan — single-click setting on the repo's Actions -> General page.

## File size / tarball impact advisory

- `registry.generated.ts`: 118127 bytes raw (~115 KB), ~6 KB gzipped (estimated). Modestly above the 100 KB CONTEXT.md advisory threshold (line 155).
- The build's `dist/index.js` grew from `<200 KB` to 228.97 KB (gzip 34.16 kB) — under 250 KB which is a comfortable margin for the published tarball.
- `dist/index.d.ts` grew to 110.61 KB (gzip 30.75 kB) reflecting the full closed-union type emission for the registry.
- No `sideEffects: false` change needed; tsdown tree-shaking would already pull the entire registry array into any consumer that imports `getCapabilityProfile`. This is intentional per RESEARCH §Pitfall 6 — consumers querying the registry WANT the whole thing.

**Recommendation for Phase 34+:** consider splitting `registry.generated.ts` into per-adapter files (`registry.openrouter.ts`, etc.) IF a Phase 34+ change pushes the file past ~200 KB OR a consumer credibly complains about bundle size growth. Until then, single-file is simpler.

## Next Phase Readiness

- Plan 33-04 complete; Plan 33-05 (drift workflow) is unblocked.
- The phase is materially done after this plan. Plan 33-05 adds the drift workflow as the only remaining piece (weekly cron + auto-PR via peter-evans/create-pull-request@<SHA>).
- Phase 33 ships the Model Capability Registry surface — Phases 34-38 will build atop it without changing CAPS-* requirements.

## Self-Check: PASSED

- `packages/lattice/src/capabilities/registry.generated.ts` populated (118127 bytes, 333 profile rows)
- `packages/lattice/src/capabilities/registry.static.ts` populated (4 profile rows, 88 lines)
- `packages/lattice/test/capabilities-registry-integration.test.ts` created (289 lines, 6 describes, 22 it blocks)
- `packages/lattice/test/capabilities-lookup.test.ts` modified (5 describes, 16 it blocks; was 14)
- `.changeset/v1.3.0-capability-registry.md` created (32 lines, minor bump for @full-self-browsing/lattice)
- Commit `c6203ad` present in `git log` (Task 1: live OpenRouter snapshot)
- Commit `596293d` present in `git log` (Task 2: 4 static profiles)
- Commit `6b8449a` present in `git log` (Task 3: integration suite)
- Commit `5249ba7` present in `git log` (Task 4: lookup-test conversion)
- Commit `a1e5f04` present in `git log` (Task 5: changeset)
- `cd packages/lattice && pnpm typecheck` exits 0
- `cd packages/lattice && pnpm build` produces non-empty dist/ with new exports (dist/index.js 228.97 kB, dist/index.d.ts 110.61 kB)
- `cd packages/lattice && pnpm test -- --run` exits 0 — 54 test files, 645 tests passing
- `cd packages/lattice && pnpm test:types` exits 0 — 67 test files, 773 tests, no type errors
- `node scripts/refresh-model-registry.mjs --check` exits 0 with `OK — registry matches upstream.`
- Re-running the generator produces byte-identical output (verified via /tmp/registry-run1.ts diff)
- Anchor case study assertions pass against live data (gpt-oss-120b base + variant both resolve to open_weight_instruct + internal_envelope_leak)
- All 4 static profiles resolve via getCapabilityProfile with expected fields
- Closed-union runtime invariants pass across all 337 merged profiles
- No canonical-key duplicates in the merged registry
- 35 unique unknown-prefix WARN lines captured for future PROVIDER_PREFIX_RULES widening
- No modifications to STATE.md or ROADMAP.md (verified via `git diff 4b487c5..HEAD --name-only -- .planning/STATE.md .planning/ROADMAP.md` returns empty)

---
*Phase: 33-model-capability-registry-200-via-openrouter-feed*
*Completed: 2026-06-08*
