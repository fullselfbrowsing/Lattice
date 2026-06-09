---
phase: 33-model-capability-registry-200-via-openrouter-feed
plan: 02
subsystem: capability-registry
tags: [typescript, sdk, capability-registry, lookup, public-surface, vitest, tsd]

# Dependency graph
requires:
  - phase: 33
    plan: 01
    provides: ModelCapabilityProfile interface + 6 closed string-literal unions on the public surface (CAPS-01)
  - phase: 14-public-surface-index
    provides: PKG-01 / INDEX-01 re-export discipline that every new public function lands in src/index.ts
provides:
  - getCapabilityProfile(canonicalKey) strict lookup (D-09) on the public surface (CAPS-02)
  - findCapabilityProfile(id) fuzzy multi-adapter lookup with deterministic ordering (D-10) on the public surface (CAPS-02)
  - stripOpenRouterVariant(id) pure helper for OpenRouter `vendor/model:variant` normalization (D-11) on the public surface (CAPS-02)
  - Bootstrap registry.static.ts (empty STATIC_PROFILES) so lookup.ts compiles before Plan 04 populates supplemental profiles
  - Bootstrap registry.generated.ts (empty GENERATED_PROFILES) so lookup.ts compiles before Plan 04 overwrites with the OpenRouter snapshot
  - Lazy Map cache built once on first lookup; test-only `_resetLookupCacheForTests` escape hatch kept internal to lookup.ts
affects:
  - 33-03 (classifier output object shape must match the 9 fields of ModelCapabilityProfile)
  - 33-04 (overwrites registry.generated.ts via the OpenRouter feed; appends 4 supplemental profiles to registry.static.ts; the bootstrap empty arrays from this plan are the only thing 33-04 needs to replace)
  - 33-05 (registry-drift workflow diffs against the registry.generated.ts shape established by this plan)
  - 34-adapter-quirks (Phase 34 quirk dispatch reuses stripOpenRouterVariant for `vendor/model:variant` normalization)
  - 35-prompt-scaffolds (Phase 35 prompt-scaffold dispatch reads the strict lookup return)
  - 36-output-sanitizers (Phase 36 sanitizer dispatch reuses stripOpenRouterVariant; reads knownFailureModes via the strict lookup)
  - 37-tool-call-validators (Phase 37 validator reads toolCallSurface via the strict lookup)
  - 38-receipt-v1.2-modelClass (Phase 38 receipts derive modelClass from trainingClass via the strict lookup)

# Tech tracking
tech-stack:
  added: []  # zero new dependencies; pure typed runtime lookup
  patterns:
    - "Lazy Map cache (RESEARCH §Pattern 1) — built once on first call, reused across calls"
    - "Map<string, ModelCapabilityProfile> over plain object — Map.get is SameValueZero so prototype-chain keys are safe (T-33-02-01 mitigation)"
    - "Anchored bounded OpenRouter variant regex `/^[^/]+\\/[^/]+:(?:free|thinking)$/` — linear-time worst case, no nested quantifiers (T-33-02-02 mitigation)"
    - "vi.doMock with vi.resetModules for adapter-ordering test (T-33-02-05 mitigation: mocks scoped to a single it block, no global mock leakage)"
    - "Iteration-variable widening `readonly ModelCapabilityProfile[]` to keep lookup.ts compiling against the bootstrap `[] as const` arrays from Task 1"

key-files:
  created:
    - packages/lattice/src/capabilities/lookup.ts
    - packages/lattice/src/capabilities/registry.static.ts
    - packages/lattice/src/capabilities/registry.generated.ts
    - packages/lattice/test/capabilities-lookup.test.ts
  modified:
    - packages/lattice/src/capabilities/index.ts
    - packages/lattice/src/index.ts
    - packages/lattice/test-d/capabilities.test-d.ts

key-decisions:
  - "Use `readonly ModelCapabilityProfile[]` widening on the loop variable in getLookupMap to keep lookup.ts compiling against the bootstrap `[] as const satisfies readonly ModelCapabilityProfile[]` arrays. Plan 04 will populate the arrays with real rows; the widening stays correct either way and documents the contract at the iteration site."
  - "Use bare `123` (number literal) in the `expectError(getCapabilityProfile(123))` tsd assertion rather than `123 as any` from the plan text. `as any` defeats the compile-time check (anything assignable from `any` passes); the bare literal preserves the actual rejection behavior. The plan's intent (only strings accepted) is enforced more strictly this way."
  - "Tests use `vi.doMock` + `vi.resetModules` in beforeEach for adapter-ordering and case-study cases. The simpler bootstrap-empty cases use direct imports from `../src/index.js` to validate public-surface wiring as a side effect (matches `public-surface.test.ts` convention)."
  - "_resetLookupCacheForTests is exported from lookup.ts but NOT re-exported from the public surface. Plan acceptance criterion `! grep -q _resetLookupCacheForTests packages/lattice/src/index.ts` passes."

patterns-established:
  - "Lookup module layout: lookup.ts as the public lookup surface; bootstrap registry.static.ts + registry.generated.ts as the cache inputs. Plan 04 replaces both array contents without touching lookup.ts."
  - "Test pattern: 14 vitest cases across 4 describe blocks (D-11 suffix-strip, D-09 strict against bootstrap, D-10 fuzzy against bootstrap, D-10 adapter-ordering via vi.doMock injection). Mocked-profile pattern lets Wave 2 prove the D-10 contract before Plan 04 ships real data."
  - "tsd pattern: replace the Plan 01 placeholder shim with real lookup imports; assert narrowing for strict (`Profile | undefined`), fuzzy (`Profile[]`), helper (`string`), and reject non-string args via `expectError`."

requirements-completed:
  - CAPS-02

# Metrics
duration: ~25 min
completed: 2026-06-08
---

# Phase 33 Plan 02: Lookup Surface + Bootstrap Registries Summary

**getCapabilityProfile + findCapabilityProfile + stripOpenRouterVariant shipped on the public surface with lazy Map cache, deterministic adapter ordering (anthropic, openai, gemini, xai, openai-compat, lm-studio, openrouter), and OpenRouter `:free | :thinking` suffix-strip discipline; bootstrap registry.static.ts and registry.generated.ts ship as empty `as const satisfies readonly ModelCapabilityProfile[]` arrays awaiting Plan 04; 14 new vitest cases including the session_1780792387779 anchor case study + 4 new tsd assertions; 606 total package tests passing.**

## Performance

- **Duration:** ~25 min (Task 1 commit 2026-06-08T09:31:42Z, Task 2 commit 2026-06-08T09:36:54Z)
- **Started:** 2026-06-08T09:13:00Z (worktree branch verification + Plan 33-01 file inspection)
- **Completed:** 2026-06-08T09:38:00Z (final verification sweep)
- **Tasks:** 2 (Task 1 bootstrap files; Task 2 TDD-style lookup surface + tests + public re-exports + tsd extension)
- **Files modified:** 7 (4 created + 3 modified)
- **Lines added:** 559 across 5 files + small modifications to 3 existing files

## Accomplishments

- **`packages/lattice/src/capabilities/lookup.ts`** (160 lines) — the CAPS-02 lookup surface:
  - `getCapabilityProfile(canonicalKey: string): ModelCapabilityProfile | undefined` strict lookup via `Map.get` (D-09)
  - `findCapabilityProfile(id: string): ModelCapabilityProfile[]` fuzzy lookup walking the deterministic `ADAPTER_ORDER` and returning all matches in direct-first order (D-10)
  - `stripOpenRouterVariant(id: string): string` pure helper using the anchored bounded regex `/^[^/]+\/[^/]+:(?:free|thinking)$/` to strip `:free | :thinking` suffixes on OpenRouter-shaped ids ONLY (D-11)
  - `_resetLookupCacheForTests(): void` test-only escape hatch — internal to lookup.ts; NOT re-exported from src/index.ts (acceptance criterion passes)
  - Lazy `Map<string, ModelCapabilityProfile>` cache built once on first call from STATIC_PROFILES + GENERATED_PROFILES; reused across all subsequent calls
- **`packages/lattice/src/capabilities/registry.static.ts`** (13 lines) — bootstrap empty `STATIC_PROFILES = [] as const satisfies readonly ModelCapabilityProfile[]` with BOOTSTRAP STATE header naming Plan 33-04 as the populator
- **`packages/lattice/src/capabilities/registry.generated.ts`** (12 lines) — bootstrap empty `GENERATED_PROFILES = [] as const satisfies readonly ModelCapabilityProfile[]` with the standard AUTO-GENERATED + DO-NOT-EDIT header and a BOOTSTRAP STATE callout that Plan 33-04 will overwrite with the live OpenRouter snapshot
- **`packages/lattice/src/capabilities/index.ts`** modified — re-exports the 3 lookup functions alongside the existing CAPS-01 type re-exports; comment header updated to CAPS-01 / CAPS-02
- **`packages/lattice/src/index.ts`** modified — extended the Phase 33 CAPS-01 block in place to publicly re-export `findCapabilityProfile`, `getCapabilityProfile`, `stripOpenRouterVariant` (acceptance criterion: `grep -E '(getCapabilityProfile|findCapabilityProfile|stripOpenRouterVariant)' packages/lattice/src/index.ts | wc -l` returns 3)
- **`packages/lattice/test/capabilities-lookup.test.ts`** (246 lines) — 14 vitest cases:
  - 5 stripOpenRouterVariant cases (D-11 suffix-strip + Pitfall 4 regression)
  - 3 strict getCapabilityProfile cases against bootstrap (undefined / bogus key / case-sensitivity)
  - 2 fuzzy findCapabilityProfile cases against bootstrap (empty + case-study with variant)
  - 4 adapter-ordering / case-study cases via `vi.doMock` injection (direct-first ordering + anchor case study session_1780792387779 + non-OpenRouter id passthrough + strict-lookup positive case)
- **`packages/lattice/test-d/capabilities.test-d.ts`** modified — replaced the Plan 01 placeholder shim with real lookup imports; 4 new assertions:
  - `expectType<ModelCapabilityProfile | undefined>(getCapabilityProfile("openrouter:openai/gpt-oss-120b"))`
  - `expectType<ModelCapabilityProfile[]>(findCapabilityProfile("openai/gpt-oss-120b:free"))`
  - `expectType<string>(stripOpenRouterVariant("openai/gpt-oss-120b:free"))`
  - `expectError(getCapabilityProfile(123))` (non-string argument rejected at compile time)

## Task Commits

Each task was committed atomically (single-repo Lattice flow; no sub-repos):

1. **Task 1: Author bootstrap registry.static.ts + registry.generated.ts** — `98da9d7` (feat)
2. **Task 2: Ship CAPS-02 lookup surface + vitest suite + tsd extension** — `92136b0` (feat; TDD: RED phase confirmed 14 failing tests pre-implementation, GREEN phase passes all 14)

**Plan metadata commit:** owned by the worktree merge flow (orchestrator merges then updates STATE.md / ROADMAP.md per the execution prompt's worktree directive).

## Files Created/Modified

Created:
- `packages/lattice/src/capabilities/lookup.ts` (6926 bytes, 160 lines)
- `packages/lattice/src/capabilities/registry.static.ts` (651 bytes, 13 lines)
- `packages/lattice/src/capabilities/registry.generated.ts` (653 bytes, 12 lines)
- `packages/lattice/test/capabilities-lookup.test.ts` (9805 bytes, 246 lines)

Modified:
- `packages/lattice/src/capabilities/index.ts` — added 5-line `export { findCapabilityProfile, getCapabilityProfile, stripOpenRouterVariant } from "./lookup.js"` block alongside the existing CAPS-01 re-exports
- `packages/lattice/src/index.ts` — extended the Phase 33 CAPS-01 value-export block in place with the 3 lookup functions; comment header updated to CAPS-01 / CAPS-02
- `packages/lattice/test-d/capabilities.test-d.ts` (5211 bytes, 128 lines) — replaced the placeholder `getCapabilityProfilePlaceholder` shim with real lookup imports; added 4 CAPS-02 assertions

## Decisions Made

- **Loop-variable widening in getLookupMap:** Iterating an `[] as const satisfies readonly ModelCapabilityProfile[]` produces a `readonly never[]` (empty tuple narrows the element type to `never`). The fix is a one-line widening: `const staticProfiles: readonly ModelCapabilityProfile[] = STATIC_PROFILES;` (and the same for generated). This keeps lookup.ts compiling against the Task 1 bootstrap arrays AND against Plan 04's populated arrays — the widening is correct either way. Documented inline with a comment explaining why the widening is needed.
- **`expectError(getCapabilityProfile(123))` over the plan's `expectError(getCapabilityProfile(123 as any))`:** The plan text used `123 as any`, but `as any` is assignable to `string` so the `expectError` would not actually find a compile error. Using bare `123` (a `number` literal not assignable to `string`) preserves the intent — only strings accepted at the canonical-key surface — and made the tsd assertion actually pass (it failed when I tried the `123 as never` variant from my first pass). Documented as a key-decision because future planners reviewing this assertion should understand why we deviated from the plan's literal sample.
- **Test imports via the public surface (`../src/index.js`) for bootstrap cases:** The 9 bootstrap-empty + suffix-strip cases import the lookup functions from `../src/index.js`. This validates the export wiring through the full public-surface path (matches `packages/lattice/test/public-surface.test.ts` convention). The 5 vi.doMock cases import from `../src/capabilities/lookup.js` directly because vi.doMock needs the exact resolved module path; importing through `index.js` would not intercept the inner `./registry.static.js` / `./registry.generated.js` imports.
- **No `_resetLookupCacheForTests` export from the public surface:** The escape hatch stays internal to lookup.ts. vi.doMock + vi.resetModules in beforeEach gives the test isolation we need; the reset helper is belt-and-suspenders for future tests that mutate the underlying arrays in place. Acceptance criterion `! grep -q _resetLookupCacheForTests packages/lattice/src/index.ts` is satisfied.
- **OpenRouter variant regex matches `:free | :thinking` only:** Per RESEARCH §Pitfall 4 and the live OpenRouter feed verification on 2026-06-08, those are the only variant suffixes shipping today. `:beta` and other speculative suffixes are passthrough — adding them would silently change the registry contract. If OpenRouter introduces a new variant the regex must be updated AND the new variant must be added to the classifier in Plan 33-03 (single source of truth coordination via the explicit regex).
- **Adapter order anthropic > openai > gemini > xai > openai-compat > lm-studio > openrouter:** Per D-10 — direct adapters first, OpenRouter last. Direct adapters win when both shapes are registered (Plan 04 ships direct profiles for claude-opus-4 / gemini-2.5-pro / grok-4; the OpenRouter feed ships the routed equivalents). The order is documented in lookup.ts as a literal constant array and asserted via the adapter-ordering vitest case.

## Test Coverage

The 14-case vitest suite (`packages/lattice/test/capabilities-lookup.test.ts`) maps to the D-IDs:

| Coverage area | D-ID | Assertions | Lines |
|---------------|------|-----------|-------|
| stripOpenRouterVariant — :free suffix strip | D-11 | 1 | 21-26 |
| stripOpenRouterVariant — :thinking suffix strip | D-11 | 1 | 28-33 |
| stripOpenRouterVariant — passthrough on bare id | D-11 | 1 | 35-40 |
| stripOpenRouterVariant — does NOT strip direct-adapter shape | D-11 | 1 | 42-48 |
| stripOpenRouterVariant — does NOT strip unrecognized `:beta` | D-11 / Pitfall 4 | 1 | 50-57 |
| getCapabilityProfile — undefined on empty registry | D-09 | 1 | 61-66 |
| getCapabilityProfile — undefined on bogus key (no throw) | D-09 | 1 | 68-71 |
| getCapabilityProfile — case-sensitive on canonical key | D-09 | 1 | 73-81 |
| findCapabilityProfile — [] on empty registry | D-10 | 1 | 85-88 |
| findCapabilityProfile — [] with variant on empty registry | D-10 + anchor | 1 | 90-95 |
| findCapabilityProfile — adapter ordering anthropic > openrouter | D-10 | 1 | 104-141 |
| findCapabilityProfile — anchor case study session_1780792387779 | D-10 / D-11 / case study | 4 | 143-180 |
| findCapabilityProfile — does NOT strip non-OpenRouter id | D-11 scope | 1 | 182-220 |
| getCapabilityProfile — strict lookup on injected profile | D-09 | 3 | 222-243 |

Total: 14 vitest cases, exceeds the plan's `>=8` threshold.

The 4-assertion extension to `packages/lattice/test-d/capabilities.test-d.ts` covers CAPS-02 type narrowing:

| Assertion | D-ID | Surface |
|-----------|------|---------|
| `expectType<ModelCapabilityProfile \| undefined>(getCapabilityProfile(...))` | D-09 | strict lookup return |
| `expectType<ModelCapabilityProfile[]>(findCapabilityProfile(...))` | D-10 | fuzzy lookup return |
| `expectType<string>(stripOpenRouterVariant(...))` | D-11 | helper return |
| `expectError(getCapabilityProfile(123))` | D-08 / D-09 | non-string rejected |

## Anchor Case Study Verification

`session_1780792387779` — gpt-oss-120b on FSB autopilot emitting `{"summary": "Greeted the user."}` instead of replying to "hi". The lookup test asserts:

```typescript
findCapabilityProfile("openai/gpt-oss-120b:free")
  // -> [{ id: "openai/gpt-oss-120b", adapter: "openrouter", knownFailureModes: [..., "internal_envelope_leak", ...] }]
```

Plan 33-04 will replace the mocked profile in the test with the real OpenRouter-classified row and assert the same shape against the live snapshot.

## Deviations from Plan

**None — plan executed exactly as written, with two clarifying refinements documented above:**

1. **Loop-variable widening in `getLookupMap`** — not a deviation from the plan's intent (the plan said "build the Map from STATIC + GENERATED"), but the bootstrap empty arrays produce a `readonly never[]` element type that requires explicit widening. The fix is the standard pattern for iterating over `as const satisfies` empty arrays.
2. **`expectError(getCapabilityProfile(123))` over `expectError(getCapabilityProfile(123 as any))`** — the plan text used `as any`, but that silently passes the type check. Bare `123` is what actually triggers the error and matches the plan's stated intent ("only strings accepted").

Neither refinement changes the public-surface shape, the D-09 / D-10 / D-11 contracts, or the success criteria. The decisions are documented under "Decisions Made" for future-planner clarity.

## Issues Encountered

- **`node_modules` missing in worktree on first typecheck run.** Standard symptom (same as Plan 33-01). Resolved by `pnpm install --frozen-lockfile`; typecheck then passed cleanly.
- **Initial Write-tool absolute-path resolution to the main repo, not the worktree.** First Write call wrote to `/Users/.../FSB/lattice/packages/...` (main repo path from the prompt's `<files_to_read>`) rather than `/Users/.../FSB/lattice/.claude/worktrees/agent-a3e9b3c122d8438cd/packages/...` (worktree path). Recovered by deleting the misplaced files and re-running Write with the explicit worktree path from `git rev-parse --show-toplevel`. Documented because the worktree-path-safety reference (`@$HOME/.claude/get-shit-done/references/worktree-path-safety.md`) explicitly warns about this trap.
- **Initial typecheck after lookup.ts authoring:** `error TS2339: Property 'adapter' does not exist on type 'never'`. Root cause: `[] as const satisfies readonly ModelCapabilityProfile[]` produces a `readonly []` (empty tuple), and iterating yields `never`. Fixed by widening the loop variable explicitly (documented under "Decisions Made"). Initial tsd `expectError(getCapabilityProfile(123 as never))` did not catch the type error because `never` is assignable to `string`; fixed by using bare `123` literal.

## User Setup Required

None — Phase 33-02 is pure SDK code authoring; no env vars, API keys, or dashboard steps.

## Handoff Notes for Plans 03 / 04 / 05

- **Plan 33-03 (classifier + generator):**
  - Classifier emits plain objects; the generator wraps them with the `ModelCapabilityProfile` type annotation. The 9 fields and their types are locked by Plan 33-01.
  - Generator emits to `packages/lattice/src/capabilities/registry.generated.ts`. The header format from this plan's bootstrap file is the canonical shape — DO NOT change the comment header lines or the lookup tests' import paths break.
  - The `as const satisfies readonly ModelCapabilityProfile[]` suffix MUST be preserved exactly so the Plan 04 array shape stays compatible with the loop-variable widening in `getLookupMap`.

- **Plan 33-04 (registry.static.ts + populated registry.generated.ts):**
  - Append the 4 supplemental profiles (anthropic:claude-opus-4, gemini:gemini-2.5-pro, xai:grok-4, lm-studio:&lt;local-template&gt;) to `STATIC_PROFILES` in registry.static.ts. The empty array becomes a populated readonly array; the loop-variable widening already handles both shapes.
  - Run `node scripts/refresh-model-registry.mjs` (Plan 03 output) to overwrite registry.generated.ts with the live OpenRouter snapshot (~337 profiles).
  - The vitest case at `test/capabilities-lookup.test.ts` line 143-180 (anchor case study) should be extended to ALSO assert against the public surface after registry population:
    ```typescript
    const { findCapabilityProfile } = await import("../src/index.js");
    const profiles = findCapabilityProfile("openai/gpt-oss-120b:free");
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.knownFailureModes).toContain("internal_envelope_leak");
    ```
  - Keep the existing mocked-profile anchor case as a regression guard for the Plan 02 lookup contract; the new live-registry case verifies Plan 04's classifier wiring.

- **Plan 33-05 (registry-drift workflow):**
  - Drift workflow diffs `node scripts/refresh-model-registry.mjs --check` output against the committed registry.generated.ts. The header format and `as const satisfies readonly ModelCapabilityProfile[]` suffix from this plan are part of the bit-exact diff (D-17); the generator output MUST match exactly.

- **Phases 34-38 reusing lookup.ts:**
  - `stripOpenRouterVariant` is exported from the public surface; Phases 34 (quirks) and 36 (sanitizers) can import it directly without duplicating the regex.
  - `getCapabilityProfile` is the strict lookup; Phases 34 / 35 / 36 / 37 dispatch on the returned profile's `adapter`, `recommendedPromptStrategy`, `knownFailureModes`, `toolCallSurface` fields respectively.
  - `findCapabilityProfile` is the fuzzy lookup for pre-routing inspection; the deterministic adapter order (direct-first, OpenRouter-last) means "I have a direct adapter wired but OpenRouter is the fallback" can iterate the result and pick the first compatible profile.

## Next Phase Readiness

- Plan 33-02 is complete; Plan 33-03 (classifier + generator) is unblocked.
- The lookup contract is locked. Adding a new helper or changing the strict/fuzzy return shape in v1.4+ is a typed breaking change requiring a changeset entry.
- The bootstrap arrays will be replaced by Plan 33-04 without touching lookup.ts; the loop-variable widening keeps the iteration shape stable across the bootstrap-empty -> populated transition.

## Self-Check: PASSED

- `packages/lattice/src/capabilities/lookup.ts` exists (6926 bytes, 160 lines)
- `packages/lattice/src/capabilities/registry.static.ts` exists (651 bytes, 13 lines)
- `packages/lattice/src/capabilities/registry.generated.ts` exists (653 bytes, 12 lines)
- `packages/lattice/test/capabilities-lookup.test.ts` exists (9805 bytes, 246 lines)
- `packages/lattice/src/capabilities/index.ts` modified (lookup re-exports added)
- `packages/lattice/src/index.ts` modified (3 lookup functions on public surface)
- `packages/lattice/test-d/capabilities.test-d.ts` modified (4 CAPS-02 assertions added; Plan 01 shim removed)
- Commit `98da9d7` present in `git log` (Task 1: bootstrap registries)
- Commit `92136b0` present in `git log` (Task 2: lookup surface + tests)
- `pnpm typecheck` exits 0 (workspace-wide)
- `pnpm test:types` exits 0 — 695 type tests, 0 type errors; tsd assertions all green
- `pnpm test` exits 0 — 52 test files, 606 tests passing (was 592 before Plan 02; +14 lookup cases)
- `pnpm test -- --run capabilities-lookup` exits 0 — 14 / 14 lookup cases green
- `grep -c "^export function " packages/lattice/src/capabilities/lookup.ts` returns 4 (stripOpenRouterVariant, _resetLookupCacheForTests, getCapabilityProfile, findCapabilityProfile)
- `grep -E '(getCapabilityProfile|findCapabilityProfile|stripOpenRouterVariant)' packages/lattice/src/index.ts | wc -l` returns 3 (acceptance criterion met)
- `! grep -q _resetLookupCacheForTests packages/lattice/src/index.ts` (the test-only escape hatch stays internal)
- ADAPTER_ORDER literal contains the 7 strings in the order anthropic, openai, gemini, xai, openai-compat, lm-studio, openrouter (verified by grep)
- OPENROUTER_VARIANT_RE = `/^[^/]+\/[^/]+:(?:free|thinking)$/` exactly (verified by grep)
- No emojis in any new or modified source / test file (Python emoji-range scan: 0 hits across 6 files)
- Pitfall 5 regex linear-time sanity: `node -e "const re = /^[^/]+\\/[^/]+:(?:free|thinking)$/; console.time('x'); for (let i = 0; i < 100000; i++) re.test('openai/gpt-oss-120b:free'); console.timeEnd('x')"` returns in ~2.5ms (well under 100ms threshold)

---
*Phase: 33-model-capability-registry-200-via-openrouter-feed*
*Completed: 2026-06-08*
