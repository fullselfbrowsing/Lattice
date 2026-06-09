---
phase: 33-model-capability-registry-200-via-openrouter-feed
plan: 01
subsystem: capability-registry
tags: [typescript, sdk, public-surface, capability-registry, tsd, closed-unions, type-design]

# Dependency graph
requires:
  - phase: 14-public-surface-index
    provides: PKG-01 / INDEX-01 re-export discipline that every new public type must follow
  - phase: 17-five-new-provider-adapters
    provides: the 7 closed CapabilityAdapter union members (Anthropic, OpenAI, Gemini, xAI, OpenRouter, LM Studio, openai-compat)
provides:
  - ModelCapabilityProfile interface (9 readonly fields) on the public surface
  - 6 closed string-literal unions covering adapter, lineage, prompt strategy, reasoning surface, tool-call surface, and known failure modes
  - 2 const arrays (ALL_KNOWN_FAILURE_MODES, ALL_TRAINING_CLASSES) for exhaustive iteration
  - tsd type-level enforcement of KnownFailureMode exhaustiveness (Phase 36 sanitizer pre-gate)
  - CAPS-01..05 REQ-ID entries in .planning/REQUIREMENTS.md (Phase 33 traceability)
affects:
  - 33-02 (lookup module reads these types; appends getCapabilityProfile, findCapabilityProfile, stripOpenRouterVariant to the same public-surface section)
  - 33-03 (refresh-model-registry generator emits objects typed as ModelCapabilityProfile)
  - 33-04 (registry.static.ts hand-edits supplemental profiles in the same shape)
  - 33-05 (registry-drift workflow validates the generated artifact stays bit-exact against the types here)
  - 34-adapter-quirks (Phase 34 quirk dispatch reads CapabilityAdapter)
  - 35-prompt-scaffolds (Phase 35 prompt-scaffold dispatch reads RecommendedPromptStrategy + originFamily)
  - 36-output-sanitizers (Phase 36 sanitizer dispatch exhaustively switches on KnownFailureMode)
  - 37-tool-call-validators (Phase 37 validator reads ToolCallSurface)
  - 38-receipt-v1.2-modelClass (Phase 38 receipt v1.2 carries TrainingClass verbatim via the modelClass field per D-15)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; pure typed surface authoring
  patterns:
    - "Closed string-literal unions with `_exhaustive: never` switch gate (D-13)"
    - "`as const satisfies readonly T[]` pattern for array-vs-union parity at compile time"
    - "Dual-enum split (TrainingClass for lineage / RecommendedPromptStrategy for tuning bucket) per research open question 2"
    - "Anchor case study (session_1780792387779 gpt-oss-120b) compiled as a concrete typed literal to validate the interface shape"

key-files:
  created:
    - packages/lattice/src/capabilities/profile.ts
    - packages/lattice/src/capabilities/index.ts
    - packages/lattice/test-d/capabilities.test-d.ts
  modified:
    - packages/lattice/src/index.ts
    - .planning/REQUIREMENTS.md

key-decisions:
  - "PLAN.md `<behavior>` block treated as authoritative for ReasoningSurface / ToolCallSurface members where the user's prompt objective text suggested different vocabulary (PLAN: `inlined_tags`, `interleaved_thinking`, `streamed_reasoning` for ReasoningSurface; `json_only`, `text_only` for ToolCallSurface)"
  - "RecommendedPromptStrategy and TrainingClass kept as TWO distinct closed unions (5 + 5 members, 3 names overlap) per research open question 2"
  - "ALL_KNOWN_FAILURE_MODES + ALL_TRAINING_CLASSES exported as `const ... as const satisfies readonly T[]` so adding a union member without updating the array fails compile"
  - "Phase 33 public-surface section in packages/lattice/src/index.ts left intentionally open under the comment header `// Phase 33 — Model Capability Registry (CAPS-01)` so Plans 33-02 / 33-04 can append lookup functions to the same block"
  - "tsd exhaustive-switch gate verified by manually removing `case \"premature_termination\"` and re-running `pnpm test:types` — confirmed compile failure `Type \"premature_termination\" is not assignable to type never.` at the documented line 76:12"

patterns-established:
  - "Capabilities module layout: packages/lattice/src/capabilities/{profile,index}.ts as the public-type spine; lookup.ts (Plan 02), registry.generated.ts (Plan 03), registry.static.ts (Plan 04) extend the directory without modifying profile.ts"
  - "tsd test-d for Phase 33 surfaces: at least one concrete literal asserting the anchor case study compiles + 1+ expectError per closed union proving rejection + an `assertExhaustive` function per exhaustively-handled union"

requirements-completed:
  - CAPS-01

# Metrics
duration: ~22 min
completed: 2026-06-08
---

# Phase 33 Plan 01: Capability Profile Types Summary

**ModelCapabilityProfile interface + 6 closed string-literal unions (CapabilityAdapter, TrainingClass, RecommendedPromptStrategy, KnownFailureMode, ReasoningSurface, ToolCallSurface) shipped to the public surface, with tsd exhaustive-switch enforcement and CAPS-01..05 REQ-IDs authored in REQUIREMENTS.md.**

## Performance

- **Duration:** ~22 min (Task 1 commit 2026-06-08T04:14:42-05:00, Task 2 commit 2026-06-08T04:19:21-05:00 plus the metadata commit that follows this summary)
- **Started:** 2026-06-08T04:11:00-05:00 (approximate; worktree branch verification + context load)
- **Completed:** 2026-06-08T04:19:21-05:00 (Task 2 commit)
- **Tasks:** 2 (one REQ-ID authoring, one TDD-style typed surface authoring)
- **Files modified:** 5 (3 created + 2 modified)

## Accomplishments

- `ModelCapabilityProfile` typed interface with 9 readonly fields (id, adapter, originFamily, trainingClass, reasoningSurface, toolCallSurface, contextWindow, knownFailureModes, recommendedPromptStrategy) exported from the public surface
- 6 closed string-literal unions covering every dispatch axis for Phases 34-38:
  - `CapabilityAdapter` (7 transports, closed per D-06)
  - `TrainingClass` (5 lineage buckets per D-14)
  - `RecommendedPromptStrategy` (5 tuning buckets, distinct from lineage per research open question 2)
  - `KnownFailureMode` (7 modes per D-12)
  - `ReasoningSurface` (5 shapes)
  - `ToolCallSurface` (5 shapes)
- `ALL_KNOWN_FAILURE_MODES` + `ALL_TRAINING_CLASSES` const arrays (typed via `as const satisfies readonly T[]`) for exhaustive iteration in downstream tests and registration tables
- tsd exhaustiveness gate proven real: deleting one `KnownFailureMode` case from the switch causes `tsd` to fail with `Type "X" is not assignable to type never.` at the documented line — Phase 36's sanitizer breaking-change gate is in place
- CAPS-01..05 REQ-IDs authored in `.planning/REQUIREMENTS.md` with spec text aligned to locked D-01..D-19, total count incremented 54 -> 59, traceability table extended with 5 new rows mapping each CAPS to its plan (33-01..05; CAPS-04 -> 33-05 and CAPS-05 -> 33-04 swap per plan)

## Task Commits

Each task was committed atomically (sub-repos: none; this is the standard single-repo Lattice flow):

1. **Task 1: Author CAPS-01..05 REQ-ID entries in REQUIREMENTS.md** -- `a72fddd` (docs)
2. **Task 2: Author ModelCapabilityProfile + 6 closed string-literal unions in profile.ts** -- `b37acab` (feat; TDD-style: types + tsd assertions landed together because the assertions ARE the RED check for typed surfaces)

**Plan metadata commit:** captured by the worktree merge flow (orchestrator owns STATE.md / ROADMAP.md updates, per execution prompt).

## Files Created/Modified

Created:
- `packages/lattice/src/capabilities/profile.ts` (6932 bytes, ~190 lines) -- the typed spine: 6 closed unions + interface + 2 const arrays + JSDoc citing each D-ID
- `packages/lattice/src/capabilities/index.ts` (582 bytes, 16 lines) -- local barrel re-exporting all public symbols from profile.ts; left a comment hook for Plans 02 / 04 to append lookup symbols
- `packages/lattice/test-d/capabilities.test-d.ts` (4717 bytes, 114 lines) -- 12 `expectType`, 5 `expectError`, 10 `expectAssignable` assertions, plus the `assertExhaustive` function with `_exhaustive: never` default branch and the gpt-oss-120b anchor-case-study literal

Modified:
- `packages/lattice/src/index.ts` -- appended a new `// Phase 33 — Model Capability Registry (CAPS-01)` section re-exporting the 7 types + 2 const arrays from `./capabilities/index.js`. The block sits below the existing Phase 20 survivability exports, matching the file's chronological ordering. Comment header explicitly notes Plans 33-02 / 33-04 will append `getCapabilityProfile`, `findCapabilityProfile`, `stripOpenRouterVariant`.
- `.planning/REQUIREMENTS.md` -- added Model Capability Registry section with CAPS-01..05 entries, updated total count 54 -> 59, added CAPS row to category table (Phase 33), appended 5 traceability rows, updated Coverage footer to 59 / 59, updated phase range note from "Phases 24-32" to "Phases 24-33"

## Decisions Made

- **Vocabulary alignment with PLAN.md, not prompt objective:** The user's prompt objective text suggested `ReasoningSurface = none | hidden_cot | structured_blocks | telemetry_only | inlined_tags` and `ToolCallSurface = native_strict | native_lenient | json_mode_coerced | free_text | none`. PLAN.md `<behavior>` block (the authoritative spec per the execution prompt) instead specifies `ReasoningSurface = none | hidden_cot | inlined_tags | interleaved_thinking | streamed_reasoning` and `ToolCallSurface = none | native_strict | native_lenient | json_only | text_only`. Followed PLAN.md per the explicit precedence note in the prompt ("treat it as the authoritative spec"). The vocabulary divergence is documented here so a future planner reviewing Phase 36 doesn't get tripped up by the gap between prompt-objective and plan-spec text.
- **Dual-enum split kept:** `TrainingClass` (5 lineage strings ending in `_rlhf` / `_instruct` / `_base` / `_quantized`) and `RecommendedPromptStrategy` (5 tuning-bucket strings: `frontier | mid_tier | open_weight | reasoning | local`) — research open question 2 recommendation. `reasoning` is orthogonal to lineage; `local` vs `local_quantized` is the granularity boundary; the two enums share the strings `frontier_rlhf`/`frontier`, etc. as substring overlap but the cast in either direction must fail at compile time. Tested explicitly via `expectError<TrainingClass>(aStrategy)` and `expectError<RecommendedPromptStrategy>(aClass)`.
- **`as const satisfies readonly T[]` for the two `ALL_*` arrays:** the `satisfies` clause enforces parity between the union and the array at compile time — adding `"new_mode"` to `KnownFailureMode` without adding it to `ALL_KNOWN_FAILURE_MODES` fails compile, and vice versa. This is the same gate as the `assertExhaustive` switch in the tsd test, applied at the source level.
- **Forward-reference shim for Plan 02's `getCapabilityProfile`:** Used `declare function getCapabilityProfilePlaceholder` so this plan stays self-contained. Plan 02 will replace the shim with the real lookup function via the public-surface import. The placeholder still exercises the return-type narrowing `ModelCapabilityProfile | undefined`.
- **`@full-self-browsing/lattice` (not `..`) as the tsd import path:** matches the existing `package-types.test-d.ts` convention and the tsd `paths` config in `packages/lattice/package.json` (which maps `@full-self-browsing/lattice` to `./dist/index.d.ts`). The plan's example used `..` but the existing tsd convention is the package-name path; verified by reading the other test-d files. tsd resolution worked end-to-end.

## tsd Test Coverage

The 114-line `capabilities.test-d.ts` exercises every CAPS-01 acceptance criterion:

| Coverage area | Assertions | Lines |
|---------------|-----------|-------|
| 9-field anchor case study (session_1780792387779 gpt-oss-120b) compiles | 9 `expectType` per-field | 26-47 |
| Closed `CapabilityAdapter` rejects unknown value | 1 `expectError` | 49-53 |
| Closed `TrainingClass` rejects unknown value | 1 `expectError` | 55-59 |
| Exhaustive `KnownFailureMode` switch with `_exhaustive: never` default | 1 function + 1 `expectType<"covered">` | 61-81 |
| `TrainingClass` vs `RecommendedPromptStrategy` distinctness (both directions) | 2 `expectError` | 83-90 |
| `TrainingClass` 5 literal members assignable | 5 `expectAssignable` | 92-99 |
| `RecommendedPromptStrategy` 5 literal members assignable | 5 `expectAssignable` | 100-104 |
| Plan 02 lookup placeholder narrows to `ModelCapabilityProfile \| undefined` | 1 `expectType` | 106-114 |

Total: 12 `expectType`, 5 `expectError`, 10 `expectAssignable` -- exceeds plan's "at least 6 expectType + at least 2 expectError" threshold.

## CAPS-01..05 REQ-ID Entries Added

The 5 CAPS-* requirements added to `.planning/REQUIREMENTS.md` (lines 107-111 of the updated file):

| REQ-ID | Plan | One-line scope |
|--------|------|----------------|
| CAPS-01 | 33-01 | ModelCapabilityProfile typed interface + 6 closed unions + tsd exhaustiveness gate (this plan) |
| CAPS-02 | 33-02 | getCapabilityProfile + findCapabilityProfile + stripOpenRouterVariant with lazy Map build |
| CAPS-03 | 33-03 | scripts/refresh-model-registry.mjs build-time generator with --check mode |
| CAPS-04 | 33-05 | .github/workflows/registry-drift.yml weekly cron auto-PR |
| CAPS-05 | 33-04 | registry.static.ts hand-edited supplemental profiles (anthropic / gemini / xai / lm-studio) |

The CAPS-04 / 33-05 and CAPS-05 / 33-04 swap is intentional per PLAN.md Task 1 action step 3.

## Anchor Case Study Verified

`session_1780792387779` (gpt-oss-120b on FSB autopilot emitting `{"summary": "Greeted the user."}` instead of replying to "hi") compiles as a concrete `ModelCapabilityProfile`:

```typescript
const sample: ModelCapabilityProfile = {
  id: "openai/gpt-oss-120b",
  adapter: "openrouter",
  originFamily: "openai",
  trainingClass: "open_weight_instruct",
  reasoningSurface: "none",
  toolCallSurface: "native_lenient",
  contextWindow: 131072,
  knownFailureModes: ["internal_envelope_leak"],
  recommendedPromptStrategy: "open_weight",
};
```

Phase 36's sanitizer will dispatch on `knownFailureModes.includes("internal_envelope_leak")` to strip the `summary` envelope before user-visible rendering. The Phase 33-01 typed surface is the contract that gate reads from.

## Deviations from Plan

None - plan executed exactly as written.

The vocabulary difference between the user's prompt objective and PLAN.md `<behavior>` text (documented under "Decisions Made") is not a deviation -- the prompt itself instructed "Plan file...has the full task breakdown — treat it as the authoritative spec", so following PLAN.md is the prescribed behavior.

## Issues Encountered

- **node_modules missing in worktree on first typecheck run.** Initial `pnpm typecheck` reported "Cannot find global type 'Array'" / "Cannot find type definition file for 'node'" — the standard symptom of missing `node_modules`. Resolved by `pnpm install --frozen-lockfile`; typecheck then passed cleanly. Not a code issue; the worktree was created without dependencies pre-installed.

## User Setup Required

None - no external service configuration required. Phase 33-01 is pure typed-surface authoring; no env vars, no API keys, no dashboard steps.

## Handoff Notes for Plans 02-05

- **Plan 33-02 (lookup):** types are ready. Append `getCapabilityProfile`, `findCapabilityProfile`, `stripOpenRouterVariant` to the bottom of `packages/lattice/src/index.ts` under the same `// Phase 33 — Model Capability Registry (CAPS-01)` comment header. Re-export them from `packages/lattice/src/capabilities/index.ts` next to the existing type re-exports. Plan 02's tsd file can drop the `declare function getCapabilityProfilePlaceholder` shim and import the real function — replace lines 106-114 of `capabilities.test-d.ts` (or add a `lookup.test-d.ts` sibling).
- **Plan 33-03 (classifier + generator):** classifier emits plain objects; generator wraps them with the `ModelCapabilityProfile` type annotation. The const arrays `ALL_KNOWN_FAILURE_MODES` and `ALL_TRAINING_CLASSES` from `profile.ts` are useful for the classifier's failure-mode default table (see D-14).
- **Plan 33-04 (registry.static.ts):** must export a `STATIC_PROFILES` const array typed `as const satisfies readonly ModelCapabilityProfile[]` — the same shape as the generated array. Lookup module (Plan 02) merges generated + static at Map-build time.
- **Plan 33-05 (registry-drift workflow):** consumes the generator from Plan 03; does not touch the types from this plan. Wire the action SHA pin to `peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1` per CI-02 + CAPS-04.

## Next Phase Readiness

- Plan 33-01 is complete; Plan 33-02 (lookup) is unblocked and ready to start.
- Phase 33 types are locked. Any change to the closed unions in v1.4+ is a typed breaking change and requires a changeset entry per Lattice's release discipline.
- Phase 36's eventual sanitizer dispatch already has a compile-time gate against `KnownFailureMode` drift (proven via the manual case-deletion exercise in the verification step).

## Self-Check: PASSED

- `packages/lattice/src/capabilities/profile.ts` exists (6932 bytes)
- `packages/lattice/src/capabilities/index.ts` exists (582 bytes)
- `packages/lattice/test-d/capabilities.test-d.ts` exists (4717 bytes)
- `packages/lattice/src/index.ts` modified (new Phase 33 section)
- `.planning/REQUIREMENTS.md` modified (5 CAPS entries + traceability + counts)
- Commit `a72fddd` present in `git log` (Task 1: REQ-ID authoring)
- Commit `b37acab` present in `git log` (Task 2: typed surface)
- `pnpm typecheck` (workspace-wide) exits 0
- `pnpm test:types` (vitest typecheck + tsd) exits 0 — 61 test files, 667 tests, 0 type errors
- `pnpm test` (unit suite, packages/lattice) exits 0 — 51 test files, 592 tests passing
- Plan acceptance criteria greps all pass: 5 unchecked CAPS entries, 5 traceability rows, total 59 REQ-IDs, 6 `^export type ` lines in profile.ts, 1 `^export interface ModelCapabilityProfile` line, 7+ KnownFailureMode literal occurrences, 7+ CapabilityAdapter literal occurrences, "// Phase 33 — Model Capability Registry (CAPS-01)" present in src/index.ts, 12 `expectType` calls in tsd file, 5 `expectError` calls in tsd file

---
*Phase: 33-model-capability-registry-200-via-openrouter-feed*
*Completed: 2026-06-08*
