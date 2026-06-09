---
phase: 33
verified_at: 2026-06-08
status: passed
sc_pass_count: 3
d_pass_count: 18
caps_pass_count: 5
gate_pass_count: 5
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 33: Model Capability Registry (~200+ via OpenRouter feed) Verification Report

**Phase Goal:** Lattice ships a typed, build-time-baked registry of 200+ model capability profiles so consumers can query model-class behavior (training lineage, reasoning surface, tool-call shape, known failure modes, recommended prompt strategy) before constructing a request -- closing the structural gap surfaced by the gpt-oss-120b case study (session_1780792387779).

**Verified:** 2026-06-08T10:10:24Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| #   | Truth                                                                                                                          | Status     | Evidence                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-1 | `packages/lattice/src/capabilities/` exposes typed `ModelCapabilityProfile` + `getCapabilityProfile` + alias support           | VERIFIED   | `profile.ts:102` defines ModelCapabilityProfile with 9 readonly fields including all 7 ROADMAP-named fields plus `originFamily` and `id`; `lookup.ts:127` exports `getCapabilityProfile`. Alias resolution via `findCapabilityProfile` strips `:free`/`:thinking` then matches base id (verified live: `findCapabilityProfile("openai/gpt-oss-120b:free")` returns the base openrouter entry). |
| SC-2 | `scripts/refresh-model-registry.mjs` fetches OpenRouter, transforms via classifier, commits registry; CI fails on drift         | VERIFIED   | `scripts/refresh-model-registry.mjs` exists (205 lines) + `scripts/capabilities/classifier.mjs` (243 lines, 20 prefix rules + 20 family overrides); `--check` mode exits 0 with "OK -- registry matches upstream"; CI gate is `.github/workflows/registry-drift.yml` (weekly cron + workflow_dispatch); D-17 bit-exact diff + D-18 fetch-failure skip both implemented.            |
| SC-3 | Static supplemental profiles cover direct Anthropic, Gemini, xAI, LM Studio; >=200 distinct profiles at v1.3.0 cut             | VERIFIED   | `registry.static.ts` ships exactly 4 profiles: `anthropic:claude-opus-4`, `gemini:gemini-2.5-pro`, `xai:grok-4`, `lm-studio:local-template`. Total profile count = 333 generated + 4 static = 337 (well above >=200 threshold).                                                                                                                                |

**Score: 3/3 ROADMAP Success Criteria verified.**

### Required Artifacts

| Artifact                                                                | Expected                                                                  | Status     | Details                                                                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/lattice/src/capabilities/profile.ts`                          | ModelCapabilityProfile + 6 closed unions + 2 const arrays                 | VERIFIED   | 189 lines; 6 `export type` lines, 1 `export interface ModelCapabilityProfile`, 2 `as const satisfies readonly` arrays; JSDoc cites D-IDs.                       |
| `packages/lattice/src/capabilities/lookup.ts`                           | getCapabilityProfile + findCapabilityProfile + stripOpenRouterVariant     | VERIFIED   | 160 lines; 4 `export function` (the 3 publics + `_resetLookupCacheForTests`); ADAPTER_ORDER literal matches D-10; OPENROUTER_VARIANT_RE matches D-11 exactly.   |
| `packages/lattice/src/capabilities/registry.static.ts`                  | 4 hand-edited supplemental profiles                                       | VERIFIED   | 88 lines; 4 profile entries (claude-opus-4 / gemini-2.5-pro / local-template / grok-4) with adapters anthropic / gemini / lm-studio / xai; typecheck clean.    |
| `packages/lattice/src/capabilities/registry.generated.ts`               | Live OpenRouter snapshot >=200 profiles, sorted, deterministic            | VERIFIED   | 118,127 bytes, 3672 lines, 333 row-opening lines; deterministic header; no ISO dates in body; ends with `] as const satisfies readonly ModelCapabilityProfile[];`. |
| `packages/lattice/src/capabilities/index.ts`                            | Local barrel re-exporting all capabilities surface                        | VERIFIED   | 20 lines; re-exports all 7 types + 2 const arrays + 3 lookup functions; mirrored under `packages/lattice/src/index.ts` Phase 33 section.                       |
| `packages/lattice/src/index.ts`                                          | Public surface re-exports all CAPS-01 + CAPS-02 symbols                   | VERIFIED   | Lines 224-245 carry `// Phase 33 -- Model Capability Registry (CAPS-01 / CAPS-02)` block; 7 types + 2 const arrays + 3 lookup functions exposed.               |
| `scripts/refresh-model-registry.mjs`                                    | Build-time generator with `--check` mode, deterministic, zero deps         | VERIFIED   | 205 lines; shebang + node: built-ins only; no Date.*/new Date; sort by (adapter, id) via localeCompare; A1 contextWindow precedence; CLI-entrypoint guard for tests. |
| `scripts/capabilities/classifier.mjs`                                   | Hybrid classifier: prefix heuristic + family overrides + permissive fallback | VERIFIED   | 243 lines; 20 PROVIDER_PREFIX_RULES + 20 FAMILY_OVERRIDES; `~` alias skip (Pitfall 3); stripVariant symmetric with lookup.ts; stderr WARN on unknown prefix.    |
| `scripts/capabilities/__fixtures__/openrouter-models-snapshot.json`     | Frozen 5-10 entry golden fixture                                          | VERIFIED   | 10 entries hand-curated; covers every classifier branch (anchor + variant symmetry + family override + reasoning override + prefix default + alias skip).      |
| `.github/workflows/registry-drift.yml`                                  | Weekly cron + workflow_dispatch + SHA-pinned actions + fixed branch       | VERIFIED   | 90 lines; trigger `schedule: '0 6 * * 1'` + `workflow_dispatch` only; 4 SHA-pinned actions; peter-evans pinned to v8.1.1; fixed branch `chore/refresh-model-registry`. |
| `.changeset/v1.3.0-capability-registry.md`                              | Minor bump documenting CAPS-* surface                                     | VERIFIED   | 33 lines; `@full-self-browsing/lattice: minor`; documents public surface + data + anchor case study + CAPS-01..03,05 traceability.                              |
| `packages/lattice/test-d/capabilities.test-d.ts`                        | Type-level tests including exhaustive KnownFailureMode coverage           | VERIFIED   | 128 lines; 12 `expectType` + 5 `expectError`; assertExhaustive switch with `_exhaustive: never` default; anchor case study compile-checked.                       |
| `packages/lattice/test/capabilities-lookup.test.ts`                     | Vitest lookup suite incl. adapter ordering + suffix-strip                 | VERIFIED   | 16 it blocks across 5 describes; suffix-strip + bootstrap-empty + adapter ordering via vi.doMock + 2 live-data assertions.                                        |
| `packages/lattice/test/capabilities-classifier.test.ts`                 | Vitest classifier suite + golden snapshot                                 | VERIFIED   | 16 it blocks across 3 describes; anchor case study + variant symmetry + family overrides + ~latest skip + unknown WARN + golden snapshot.                       |
| `packages/lattice/test/capabilities-registry-integration.test.ts`       | Integration suite >=15 it blocks proving end-to-end                       | VERIFIED   | 22 it blocks across 6 describes; coverage / static / anchor / fuzzy / closed-union invariants / canonical-key uniqueness; consumes public surface from src/index.ts. |

### Key Link Verification

| From                                                    | To                                                  | Via                                       | Status   | Details                                                                                            |
| ------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `packages/lattice/src/index.ts`                         | `./capabilities/index.js`                           | `export type {...} + export {...}`        | WIRED    | Lines 224-245 carry the full Phase 33 re-export block.                                              |
| `packages/lattice/src/capabilities/index.ts`            | `./profile.js`, `./lookup.js`                       | `export type` and `export` barrels         | WIRED    | All 7 types + 2 const arrays + 3 functions re-exported.                                            |
| `packages/lattice/src/capabilities/lookup.ts`           | `./registry.generated.js`, `./registry.static.js`   | `import { GENERATED_PROFILES, STATIC_PROFILES }` | WIRED    | Both imports present; iterated in `getLookupMap()` with widening to `readonly ModelCapabilityProfile[]`. |
| `scripts/refresh-model-registry.mjs`                    | `scripts/capabilities/classifier.mjs`               | `import { classify }`                     | WIRED    | Line 32; classifier output fed into `transformFeed`.                                                |
| `.github/workflows/registry-drift.yml`                  | `scripts/refresh-model-registry.mjs`                | `run: node scripts/refresh-model-registry.mjs` | WIRED    | Step "Regenerate model registry" at line 60.                                                        |
| `.github/workflows/registry-drift.yml`                  | `peter-evans/create-pull-request@5f6978fa...`       | `uses: peter-evans/create-pull-request@<sha>` | WIRED    | Line 65; SHA matches RESEARCH §Standard Stack (v8.1.1 verified live 2026-06-08).                   |
| `packages/lattice/test/capabilities-registry-integration.test.ts` | `packages/lattice/src/index.ts`             | `import { getCapabilityProfile, findCapabilityProfile, type ModelCapabilityProfile }` | WIRED | Test imports through the public surface, validating end-to-end wiring as a side effect. |

### Data-Flow Trace (Level 4)

| Artifact                                              | Data Variable        | Source                                       | Produces Real Data | Status   |
| ----------------------------------------------------- | -------------------- | -------------------------------------------- | ------------------ | -------- |
| `lookup.ts` (`getLookupMap`)                          | `_lookupCache: Map`  | `STATIC_PROFILES + GENERATED_PROFILES` arrays | Yes (337 entries)  | FLOWING  |
| `registry.generated.ts`                               | `GENERATED_PROFILES` | OpenRouter feed via `scripts/refresh-model-registry.mjs` | Yes (333 profiles) | FLOWING  |
| `registry.static.ts`                                  | `STATIC_PROFILES`    | Hand-edited                                  | Yes (4 profiles)   | FLOWING  |
| `getCapabilityProfile("openrouter:openai/gpt-oss-120b")` | return value         | Map lookup of canonical key                  | Yes (open_weight_instruct + internal_envelope_leak) | FLOWING  |

### Behavioral Spot-Checks

| Behavior                                                                                    | Command                                                                                                    | Result                                                                                                 | Status |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ |
| Anchor case study `openrouter:openai/gpt-oss-120b` classifies correctly                     | `node -e "const m = require('./dist/index.js'); console.log(m.getCapabilityProfile('openrouter:openai/gpt-oss-120b'))"` | `trainingClass: "open_weight_instruct"`, `knownFailureModes: ["internal_envelope_leak", ...]`         | PASS   |
| Variant symmetry: `:free` variant carries identical class to base                           | `node -e "...same comparing :free and base..."`                                                            | Both entries share `trainingClass` and `knownFailureModes`                                            | PASS   |
| `~`-prefixed alias returns null from classifier                                             | `node -e "...classify({id: '~anthropic/claude-sonnet-latest'})..."`                                       | `null`                                                                                                | PASS   |
| `stripOpenRouterVariant` strips `:free`, `:thinking`; passthrough on `:beta`                | inline node test on three inputs                                                                          | `:free`/`:thinking` stripped; `:beta` and direct-adapter keys passed through                          | PASS   |
| All 4 static profiles resolve via `getCapabilityProfile`                                    | inline node test on the 4 canonical keys                                                                  | All 4 DEFINED with expected fields                                                                    | PASS   |
| `node scripts/refresh-model-registry.mjs --check` exits 0 against live OpenRouter           | `node scripts/refresh-model-registry.mjs --check`                                                         | `[refresh-model-registry] OK -- registry matches upstream.` (exit 0)                                  | PASS   |
| `node scripts/check-workflow-safety.mjs` exits 0                                            | `node scripts/check-workflow-safety.mjs`                                                                  | `OK -- audited 3 workflow file(s), no pull_request_target triggers, no out-of-scope id-token: write declarations` | PASS   |
| `pnpm typecheck` (workspace) exits 0                                                        | `pnpm typecheck`                                                                                          | Both lattice and lattice-cli typecheck pass                                                            | PASS   |
| `cd packages/lattice && pnpm test:types` exits 0                                            | `pnpm test:types`                                                                                         | 67 test files, 773 tests, 0 type errors                                                               | PASS   |
| `cd packages/lattice && pnpm test` exits 0 (600+ tests)                                     | `pnpm test`                                                                                               | 54 test files, 645 tests passing                                                                       | PASS   |
| Capability-specific tests: classifier + lookup + integration                                | `pnpm test capabilities-classifier capabilities-lookup capabilities-registry-integration`                  | 3 test files, 53 tests passing                                                                         | PASS   |
| `pnpm build` succeeds and includes capability surface in dist/index.d.ts                    | `pnpm build` + grep                                                                                       | Build clean; `getCapabilityProfile`, `findCapabilityProfile`, `stripOpenRouterVariant`, `ModelCapabilityProfile`, all 6 unions + 2 const arrays present in `dist/index.d.ts` | PASS   |

### Requirements Coverage

| Requirement | Source Plan         | Description                                                                                       | Status     | Evidence                                                                                                                              |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CAPS-01     | 33-01-PLAN.md       | Typed ModelCapabilityProfile + 6 closed unions + 2 const arrays; re-exported per PKG-01           | SATISFIED  | `profile.ts:102` interface; 6 closed unions exported; `ALL_KNOWN_FAILURE_MODES` + `ALL_TRAINING_CLASSES`; tsd exhaustiveness gate via assertExhaustive switch. |
| CAPS-02     | 33-02-PLAN.md       | `getCapabilityProfile` + `findCapabilityProfile` + `stripOpenRouterVariant` lookup surface         | SATISFIED  | `lookup.ts` exports all 3 functions; adapter order anthropic → openrouter; regex `/^[^/]+\/[^/]+:(?:free\|thinking)$/`; lazy Map cache; 16 vitest cases. |
| CAPS-03     | 33-03-PLAN.md       | Build-time generator + classifier with `--check` mode + frozen fixture + tests                    | SATISFIED  | `scripts/refresh-model-registry.mjs` (D-17 bit-exact diff + D-18 fetch-failure skip); `scripts/capabilities/classifier.mjs` (D-01 hybrid); 16 vitest classifier tests + golden snapshot. |
| CAPS-04     | 33-05-PLAN.md       | `.github/workflows/registry-drift.yml` weekly cron + auto-PR + SHA-pinned actions                  | SATISFIED  | Workflow file 90 lines; trigger schedule + workflow_dispatch only; 4 SHA-pinned actions; peter-evans v8.1.1; fixed branch + delete-branch; `check-workflow-safety.mjs` passes. |
| CAPS-05     | 33-04-PLAN.md       | Static supplemental profiles for 4 direct-adapter models + >=200 distinct profiles                | SATISFIED  | 4 static profiles + 333 generated = 337 total; all 4 direct-adapter canonical keys resolve via `getCapabilityProfile`; closed-union runtime invariants pass. |

**5 of 5 CAPS-* requirements satisfied. No orphaned requirements.**

### CONTEXT.md Decision Coverage (19 D-IDs, D-15 deferred to Phase 38)

| D-ID | Decision                                                              | Status     | Evidence                                                                                                                |
| ---- | --------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| D-01 | Hybrid classifier (prefix heuristic + family overrides + fallback)    | SATISFIED  | classifier.mjs lines 60-83 (PROVIDER_PREFIX_RULES + FALLBACK) + 97-129 (FAMILY_OVERRIDES); 20 + 20 entries.            |
| D-02 | Classifier lives at scripts/capabilities/classifier.mjs (build-time only) | SATISFIED  | File exists; no `from "..*packages/lattice/src` imports; not in dist tarball.                                            |
| D-03 | Family-substring → trainingClass overrides                            | SATISFIED  | 20 FAMILY_OVERRIDES entries; substring match against id after prefix strip; first hit wins (line 211 `break`).         |
| D-04 | Unknown policy: open_weight_instruct + stderr WARN                    | SATISFIED  | Line 216-220: `console.warn` emitted on unknown prefix; FALLBACK defaults to open_weight_instruct.                     |
| D-05 | Two-field identity: `adapter` + `originFamily`                        | SATISFIED  | profile.ts lines 115-123 both fields present; classifier emits both; static profiles set both explicitly.              |
| D-06 | Closed CapabilityAdapter union (7 values)                             | SATISFIED  | profile.ts lines 17-24: 7 string literals.                                                                              |
| D-07 | originFamily open extensible string                                   | SATISFIED  | profile.ts line 123: typed as plain `string`, not a union.                                                                |
| D-08 | Canonical key `${adapter}:${modelId}`                                 | SATISFIED  | lookup.ts lines 91, 94, 156 use template literal; both `:free` and base have separate entries.                          |
| D-09 | Strict `getCapabilityProfile(canonicalKey)` lookup                    | SATISFIED  | lookup.ts line 127-131; returns `Map.get(canonicalKey)`.                                                                  |
| D-10 | Fuzzy `findCapabilityProfile(id)` with adapter order                  | SATISFIED  | lookup.ts line 151-160; ADAPTER_ORDER constant lines 26-34 anthropic→openrouter.                                       |
| D-11 | Suffix-strip OpenRouter-shape-only                                    | SATISFIED  | lookup.ts line 47 regex; line 59-63 stripOpenRouterVariant; direct-adapter keys pass through.                          |
| D-12 | 7-mode KnownFailureMode vocabulary                                    | SATISFIED  | profile.ts lines 60-67: exactly 7 string literals; tsd exhaustiveness gate verified.                                    |
| D-13 | Closed string-literal union shape                                     | SATISFIED  | All 6 unions in profile.ts use `\|` syntax; tsd `expectError` proves rejection of out-of-band values.                  |
| D-14 | Class-derived defaults + per-family overrides                         | SATISFIED  | classifier.mjs lines 29-51 (FAILURE_MODE_DEFAULTS 5-key map); FAMILY_OVERRIDES carry `knownFailureModesAdd`.            |
| D-15 | Receipt v1.2 modelClass carries trainingClass                         | DEFERRED   | Per phase boundary; verified that `TrainingClass` is exported from src/index.ts so Phase 38 can consume it. `modelClass` is NOT yet in receipts module (correct — Phase 38's job). |
| D-16 | Generator `--check` mode regenerates + diffs                          | SATISFIED  | refresh-model-registry.mjs lines 153-188; `process.argv.includes("--check")`.                                            |
| D-17 | Bit-exact diff                                                        | SATISFIED  | refresh-model-registry.mjs line 178 `generated !== committed` exits 1.                                                  |
| D-18 | Fetch failure → skip + WARN                                           | SATISFIED  | refresh-model-registry.mjs lines 159-167: `checkMode` returns 0 with WARN on fetch failure.                            |
| D-19 | `.github/workflows/registry-drift.yml` weekly cron + workflow_dispatch | SATISFIED  | Workflow file exists; cron `'0 6 * * 1'` Monday 06:00 UTC; no PR-event triggers.                                       |

**18 of 18 in-scope decisions satisfied (D-15 deferred to Phase 38 as designed).**

### Anti-Patterns Found

None. All modified files were scanned for:
- `TODO`, `FIXME`, `XXX`, `HACK`, `PLACEHOLDER`: none in Phase 33 surface.
- Empty returns/handlers: none in lookup.ts or generator; const arrays in static.ts are typed and intentional.
- Hardcoded empty data: only the bootstrap state of registry.generated.ts and registry.static.ts (Plan 33-02) and these were correctly overwritten in Plan 33-04.
- `console.log` stub implementations: none — only structured `[refresh-model-registry] OK/FAIL` and `[classifier] WARN` lines.
- Emojis: zero matches anywhere in Phase 33 surface (per user's global CLAUDE.md rule).

### Cross-Phase Integration

| Check                                                                              | Status     | Evidence                                                                                                       |
| ---------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `ModelCapability` (v1.0 providers/) coexists with `ModelCapabilityProfile` (Phase 33) | PASS       | Both `interface ModelCapability` and `interface ModelCapabilityProfile` present in dist/index.d.ts; documented as siblings in profile.ts:4-10 and CONTEXT.md:110-112. |
| v1.2 exports (ResumePolicy, AgentHost, RunEventKind) still exported                | PASS       | grep finds all three in src/index.ts; build emits them in dist/index.d.ts.                                     |
| Phase 33 exports do NOT shadow `ModelCapability` from `providers/provider.ts`      | PASS       | New types are in `capabilities/` namespace; both types coexist; v1.0 router still reads ModelCapability, Phase 33 surface reads ModelCapabilityProfile (orthogonal). |
| Forward-compat for Phase 38 receipt v1.2 `modelClass`                              | PASS       | `TrainingClass` exported from src/index.ts; `modelClass` field NOT yet in receipts module (correct — Phase 38's job per D-15). |

## Build + Test + Lint Gates

| Gate                                                  | Command                                                                | Result                                                                                | Status |
| ----------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| Workspace typecheck                                   | `pnpm typecheck`                                                       | Both packages pass                                                                    | PASS   |
| Lattice type tests (vitest typecheck + tsd)           | `cd packages/lattice && pnpm test:types`                               | 67 test files, 773 tests, 0 type errors                                               | PASS   |
| Lattice unit tests                                    | `cd packages/lattice && pnpm test`                                     | 54 test files, 645 tests passing (well above the 600+ threshold)                      | PASS   |
| Workflow safety gate                                  | `node scripts/check-workflow-safety.mjs`                               | OK — audited 3 workflow file(s)                                                       | PASS   |
| Live drift check                                      | `node scripts/refresh-model-registry.mjs --check`                       | OK — registry matches upstream (exit 0); zero live drift                              | PASS   |

**5 of 5 gates pass.**

## Non-Blocking Observations

These are noteworthy but do NOT block Phase 33 acceptance:

1. **`registry.generated.ts` raw size 118,127 bytes (~115 KB) -- 18 KB above 100 KB advisory threshold from CONTEXT.md:155.** Gzipped to 4,748 bytes (well below any meaningful tarball impact). Plan 33-04's SUMMARY (lines 49, 258-265) and Plan 33-04's "File size / tarball impact advisory" explicitly flag this for Phase 34+ split-by-adapter optimization. The published `dist/index.js` (228.97 KB / 34.16 KB gzipped) and `dist/index.d.ts` (110.61 KB / 30.75 KB gzipped) are well below any concerning threshold. This is documented, intentional, and forwarded as a Phase 34+ optimization candidate.

2. **35 unknown-prefix WARN lines emitted during the live `--check` run.** Each represents a new OpenRouter provider prefix not yet covered by `PROVIDER_PREFIX_RULES` (nousresearch, arcee-ai, thedrummer, microsoft phi, ibm-granite, tencent, xiaomi, etc.). All defaulted to `open_weight_instruct` per D-04 permissive policy. Plan 33-04's SUMMARY (lines 148-179) lists the top-10 by count + recommended classifier extensions. **Not a Phase 33 blocker** -- D-04 permissive default is by design, and the WARN signal is the documented mechanism for surfacing them.

3. **REQUIREMENTS.md CAPS-04 references "Phase 27 prerequisite handoff" but Plan 33-05 (and PLAN.md) reference "Phase 29 prerequisite".** The substantive setting ("Allow GitHub Actions to create and approve pull requests") is identical and correctly documented in Plan 33-05's SUMMARY. The discrepancy is a small wording inconsistency in REQUIREMENTS.md's spec text only. Not a verification blocker — both phases acknowledge the same manual prerequisite, and the workflow correctly documents the setting in its header comment (line 21-24 of registry-drift.yml).

4. **CAPS-* checkboxes in REQUIREMENTS.md remain unchecked `[ ]`.** These flip from pending → complete via the orchestrator's post-verification step; not the verifier's responsibility. Traceability table still shows `pending` status. This is the expected pre-merge state.

5. **Repo setting "Allow GitHub Actions to create and approve pull requests" is a manual prerequisite** for the auto-PR step to succeed. Plan 33-05's SUMMARY (lines 188-210) thoroughly documents this. If Phase 29 has not yet enabled the setting, the first cron run after merge will fail at the create-PR step with HTTP 403; the fix is one click in repo settings.

## Deferred Items

None. All items in scope for Phase 33 are verified; D-15 (receipt v1.2 modelClass) is explicitly deferred to Phase 38 by phase boundary and is correctly NOT implemented in this phase (verified that `TrainingClass` is exported as the dependency Phase 38 will consume).

## Anchor Case Study (session_1780792387779) -- Regression Bar Met

The single most important verification: does the registry systematically flag the gpt-oss-120b envelope-leak failure mode that motivated Phase 33?

```typescript
// strict lookup against the live registry
getCapabilityProfile("openrouter:openai/gpt-oss-120b")
// => {
//   trainingClass: "open_weight_instruct",                     ✓
//   knownFailureModes: ["internal_envelope_leak", ...],         ✓
//   recommendedPromptStrategy: "open_weight",                    ✓
// }

// :free variant (Pitfall 4 symmetry)
getCapabilityProfile("openrouter:openai/gpt-oss-120b:free")
// trainingClass + knownFailureModes IDENTICAL to base entry ✓

// fuzzy lookup with suffix strip
findCapabilityProfile("openai/gpt-oss-120b:free")
// => [openrouter:openai/gpt-oss-120b]                          ✓

// classifier output (build-time)
classify({id: "openai/gpt-oss-120b", supported_parameters: ["tools", "tool_choice"]})
// => trainingClass: "open_weight_instruct" + knownFailureModes including "internal_envelope_leak" ✓
```

All four anchor-case-study assertions pass against live data. Phase 36 sanitizer dispatch will be able to read `knownFailureModes.includes("internal_envelope_leak")` and strip the `{"summary": "..."}` envelope before user-visible rendering. **The Phase 33 regression bar is met.**

## Gaps Summary

No gaps identified. All 3 ROADMAP Success Criteria, 18 in-scope CONTEXT.md decisions (D-15 deferred by design), 5 CAPS-* requirements, and 5 build/test/lint gates pass. The anchor case study is correctly classified end-to-end. Phase 33 is a clean foundation for Phases 34-38.

---

_Verified: 2026-06-08T10:10:24Z_
_Verifier: Claude (gsd-verifier)_
