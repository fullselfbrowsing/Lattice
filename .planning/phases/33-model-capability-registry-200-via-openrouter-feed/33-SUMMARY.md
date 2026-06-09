# Phase 33 - Model Capability Registry (~200+ via OpenRouter feed) - SUMMARY

Status: COMPLETE (2026-06-08)
Verifier: VERIFICATION PASSED (5/5 must-haves, 3/3 SCs, 18/18 D-IDs, 5/5 CAPS, 5/5 gates)

## What landed

The foundation phase for the Phase 33-38 model-aware SDK surface. Lattice now ships a typed, build-time-baked registry of 337 model capability profiles (333 generated from OpenRouter + 4 hand-edited supplemental) and a runtime lookup module that consumers query before constructing a request -- closing the structural gap surfaced by the gpt-oss-120b case study (session_1780792387779).

## Outputs

### Typed surface (CAPS-01 / Plan 33-01)

- `packages/lattice/src/capabilities/profile.ts` (189 lines): `ModelCapabilityProfile` interface (9 readonly fields) plus 6 closed string-literal unions:
  - `CapabilityAdapter` (7 transports)
  - `TrainingClass` (5 lineage values)
  - `ReasoningSurface` (5 values)
  - `ToolCallSurface` (5 values)
  - `RecommendedPromptStrategy` (5 values, distinct from TrainingClass)
  - `KnownFailureMode` (7 modes)
- `packages/lattice/test-d/capabilities.test-d.ts` (115 lines): tsd type-level tests with exhaustive-switch enforcement on KnownFailureMode + dual-enum distinctness assertions + ModelCapabilityProfile literal compile-check matching the gpt-oss-120b shape

### Runtime lookup (CAPS-02 / Plan 33-02)

- `packages/lattice/src/capabilities/lookup.ts` (160 lines): `getCapabilityProfile(canonicalKey)` strict + `findCapabilityProfile(id)` fuzzy + `stripOpenRouterVariant(id)` helper
- Map-backed registry built lazily once on first lookup
- OpenRouter `:free` / `:thinking` variant suffix-strip scoped to OpenRouter shape only (D-11)
- `ADAPTER_ORDER` for deterministic fuzzy-lookup ordering
- 14 vitest unit tests with mocked profiles (later extended to 17 by Plan 33-04)

### Build-time codegen pipeline (CAPS-03 / Plan 33-03)

- `scripts/capabilities/classifier.mjs` (242 lines): hybrid classifier with `PROVIDER_PREFIX_RULES` (20 entries) + `FAMILY_OVERRIDES` (20 entries) + `FAILURE_MODE_DEFAULTS` + classify() / inferToolCallSurface()
- D-04 unknown-prefix policy: defaults to `open_weight_instruct` + WARN line (35 unknowns currently warn-only; candidates for Phase 34+ widening)
- Pitfall 3: skip `~`-prefixed `*-latest` aliases
- A1: `top_provider.context_length ?? context_length` precedence
- `scripts/refresh-model-registry.mjs` (204 lines): default-write + `--check` modes, D-17 bit-exact diff, D-18 fetch-failure skip-and-warn, 3-retry exponential backoff, 30s AbortController timeout, CLI-invocation guard for vitest dynamic-import
- `scripts/capabilities/__fixtures__/openrouter-models-snapshot.json` (10 frozen entries covering anchor case study + Pitfall 3 phantom)
- `packages/lattice/test/capabilities-classifier.test.ts` (16 tests across 3 describes + golden snapshot)

### Live data + static supplemental + integration (CAPS-05 / Plan 33-04)

- Live OpenRouter run: 341 raw -> 333 emitted (8 `~`-prefixed phantoms filtered)
- `packages/lattice/src/capabilities/registry.generated.ts` (118,127 bytes raw / ~4.7 KB gzipped) with 333 profiles
- `packages/lattice/src/capabilities/registry.static.ts` (3,562 bytes) with 4 hand-edited supplemental profiles:
  - `anthropic:claude-opus-4` (frontier_rlhf, 200K context)
  - `gemini:gemini-2.5-pro` (frontier_rlhf, structured_blocks reasoning, 1M context)
  - `xai:grok-4` (frontier_rlhf, telemetry_only reasoning, 256K context)
  - `lm-studio:local-template` (local_quantized, 8K conservative default)
- `packages/lattice/test/capabilities-registry-integration.test.ts` (6 describes / 22 tests): total-count assertion (>=200), anchor case study, variant symmetry, static-profile resolution, closed-union runtime invariants, no-duplicate-keys
- `.changeset/v1.3.0-capability-registry.md` (minor bump; changesets `fixed` config auto-couples lattice-cli)

### CI drift gate (CAPS-04 / Plan 33-05)

- `.github/workflows/registry-drift.yml` (89 lines): weekly Monday 06:00 UTC cron + `workflow_dispatch`
- `peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1` SHA-pinned per CI-02
- Permissions discipline: workflow `contents: read`; job `contents: write` + `pull-requests: write`; **never** `id-token: write`
- Passes `scripts/check-workflow-safety.mjs` (3 workflows audited)
- PR body references the anchor case study as the regression checklist item

## Verification (live, post-merge to main)

```
$ pnpm typecheck
packages/lattice typecheck: Done
packages/lattice-cli typecheck: Done

$ pnpm test:types
Test Files  67 passed (67)
Tests       773 passed (773)
Type Errors no errors

$ pnpm --filter @full-self-browsing/lattice test
Test Files  54 passed (54)
Tests       645 passed (645)

$ node scripts/check-workflow-safety.mjs
OK -- audited 3 workflow file(s), no pull_request_target triggers, no out-of-scope id-token: write declarations

$ node scripts/refresh-model-registry.mjs --check
[refresh-model-registry] OK -- registry matches upstream.
```

Aggregate test counts before/after Phase 33:
- Before Phase 33: 592 unit tests + 667 type tests
- After Phase 33: 645 unit tests (+53) + 773 type tests (+106)

## Anchor case study (session_1780792387779)

Verified end-to-end:
- `getCapabilityProfile("openrouter:openai/gpt-oss-120b")` -> profile with `trainingClass: "open_weight_instruct"` and `knownFailureModes` includes `"internal_envelope_leak"`
- `findCapabilityProfile("openai/gpt-oss-120b:free")` -> strips `:free` suffix, resolves to same profile via fuzzy lookup
- Future Phase 36 sanitizers will dispatch on `internal_envelope_leak` to auto-strip the envelope before the user sees it

## Goal-backward verification

| Dimension | Status |
|-----------|--------|
| ROADMAP Success Criterion 1 (typed surface + lookup + alias) | PASS |
| ROADMAP Success Criterion 2 (build-time generator + CI drift gate) | PASS |
| ROADMAP Success Criterion 3 (4 static profiles + >=200 total) | PASS (337 total) |
| CONTEXT.md D-01..D-14, D-16..D-19 (18 in-scope decisions) | PASS |
| CONTEXT.md D-15 (Receipt v1.2 modelClass) | Deferred to Phase 38 (TrainingClass typed surface ready) |
| CAPS-01..05 authored in REQUIREMENTS.md | PASS |
| Anchor case study regression bar | PASS |
| Build + test + lint gates | PASS |
| Cross-phase integration with v1.2 surface | PASS (no shadowing) |

## Phase 33 commits

```
2fbbe16 docs(33): tracking after wave 3
9eae8cb chore: merge executor worktree -- Plan 33-05
304ee43 chore: merge executor worktree -- Plan 33-04
4fcbae7 docs(33-04): complete live OpenRouter snapshot + static profiles + integration suite + changeset plan
a1e5f04 chore(33-04): add changeset for v1.3.0 capability registry surface
5249ba7 test(33-04): convert lookup-test empty-registry assertions to vi.doMock + add live-data cases
6b8449a test(33-04): add integration test suite for populated registry (CAPS-05 + CAPS-02)
c86b64b docs(33-05): complete registry-drift CI workflow plan
596293d feat(33-04): populate registry.static.ts with 4 supplemental profiles (CAPS-05)
c6203ad feat(33-04): populate registry.generated.ts from live OpenRouter feed (CAPS-05)
635686c feat(33-05): add registry-drift workflow for weekly OpenRouter snapshot refresh (CAPS-04)
4b487c5 docs(33): tracking after wave 2
620a34f chore: merge executor worktree -- Plan 33-03
4dbdfe8 chore: merge executor worktree -- Plan 33-02
167a513 docs(33-03): complete OpenRouter snapshot generator + hybrid classifier plan
b7c496b feat(33-03): add OpenRouter refresh script + classifier vitest suite (CAPS-03)
cad849a feat(33-03): add hybrid classifier + frozen golden fixture (CAPS-03)
e462e4e docs(33-02): complete lookup surface plan
92136b0 feat(33-02): ship CAPS-02 lookup surface (getCapabilityProfile + findCapabilityProfile + stripOpenRouterVariant)
98da9d7 feat(33-02): add bootstrap registry.static.ts + registry.generated.ts (CAPS-02)
fb08efc docs(33): tracking after wave 1
52aaae7 chore: merge executor worktree -- Plan 33-01
c5f064f docs(33-01): complete capability profile types plan
b37acab feat(33-01): add ModelCapabilityProfile + 6 closed unions (CAPS-01)
a72fddd docs(33-01): author CAPS-01..05 REQ-IDs in REQUIREMENTS.md
21335cb chore(33): orchestrator pre-wave state (begin phase 33)
```

## Non-blocking observations

1. **35 unknown-prefix WARN lines** during the live `--check` run. The classifier defaults them to `open_weight_instruct` (D-04 policy). Candidates for Phase 34+ widening of `PROVIDER_PREFIX_RULES` include: `microsoft/`, `mancer/`, `undi95/`, `gryphe/`, and ~30 others. None are blockers; D-04 is the documented policy.

2. **`registry.generated.ts` is 118 KB raw** (above the 100 KB advisory in RESEARCH.md) but 4.7 KB gzipped. Tarball impact is fine for v1.3.0. Phase 34+ may want to split per adapter for tree-shaking ergonomics.

3. **Minor REQUIREMENTS.md wording inconsistency** -- CAPS-04 entry was authored saying "Phase 27 prerequisite handoff" but Plan 33-05's SUMMARY correctly says "Phase 29 prerequisite". The substantive repo setting ("Allow GitHub Actions to create and approve pull requests") is identical and correctly documented in the workflow file's header comment. Cosmetic; can fix in a follow-up.

## Hand-off to Phase 34 (Adapter Quirk Flags + Capability Negotiation API)

Phase 33 ships the typed surface that Phase 34 consumes. Phase 34 will:
- Add a `quirks` field to each of the 7 real provider adapters (anthropic, openai, openai-compat, xai, gemini, openrouter, lm-studio)
- Expose `negotiateCapabilities()` runtime method that intersects provider-reported truth with the static registry from Phase 33
- Dispatch on `profile.adapter` (the closed 7-value enum) for per-transport quirks

Phase 33 unblocks Phases 34, 35, 36, 37, and 38 in parallel. Phase 38 (Receipt v1.2 schema bump) will populate `modelClass` from `profile.trainingClass`.

## Repo setting prerequisite (user action required)

The `registry-drift.yml` workflow's auto-PR step needs:

  Repo Settings -> Actions -> General -> Workflow permissions:
  [x] Allow GitHub Actions to create and approve pull requests

This is the **same** setting Phase 29's changesets/action flow needs. If Phase 29 has already enabled it, no separate action is required. If not, the first cron run after merge (next Monday) will fail at the create-PR step with HTTP 403; the fix is one click in repo settings.
