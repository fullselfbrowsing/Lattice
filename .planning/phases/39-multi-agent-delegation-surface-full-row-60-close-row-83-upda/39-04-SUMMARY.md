---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 04
subsystem: providers
tags: [anthropic, prompt-caching, cache_control, provider-adapter, deleg-04]
requires: []
provides:
  - "ProviderRunRequest.cacheSystemPrefix additive optional field (provider.ts)"
  - "Anthropic cache_control ephemeral system-block emission gated on field presence (anthropic.ts)"
  - "Mocked-fetch shape tests + cache-counter fixture assertions (anthropic.test.ts)"
affects:
  - "39-05 crew dispatcher cache-prefix composition (consumes cacheSystemPrefix gated on quirks.promptCachingSupported)"
tech-stack:
  added: []
  patterns:
    - "Additive optional request field (Phase 37 toolCalls precedent; INV-03 adapter methods frozen)"
    - "Conditional system VALUE (not conditional key spread) — Messages API key always present (D-07)"
    - "Byte-identical golden-body characterization test for the absence path (T-39-11)"
key-files:
  created: []
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/providers/anthropic.ts
    - packages/lattice/src/providers/anthropic.test.ts
decisions:
  - "cacheSystemPrefix is advisory and adapter-local: Anthropic hoists it to a cache_control block; non-supporting adapters never see it (crew dispatcher gates on quirks.promptCachingSupported and folds the prefix into task instead)"
  - "Cache counters (cache_creation_input_tokens / cache_read_input_tokens) read via rawResponse only — Usage 3-field shape NOT widened"
  - "Live cache-hit verification is nightly/manual-only (A4); mocked-fetch shape tests are the PR-time proof (Pitfall 1)"
metrics:
  duration: "~5 min"
  completed: "2026-06-10"
  tasks: 2
  files: 3
requirements: [DELEG-04]
---

# Phase 39 Plan 04: Anthropic Prompt-Cache Path (cacheSystemPrefix) Summary

Additive optional `ProviderRunRequest.cacheSystemPrefix` emitted by the Anthropic adapter as a `cache_control: { type: "ephemeral" }` system content block, with a byte-identical absence path — unblocking crew cache-prefix sharing (DELEG-04) for 39-05.

## What Was Built

- **`provider.ts`** — `ProviderRunRequest` gains `readonly cacheSystemPrefix?: string` with a doc comment explaining the adapter-local contract: block-granular-caching adapters (Anthropic) hoist it to a `cache_control`-marked system block; callers targeting other adapters must fold the prefix into `task` (the crew dispatcher gates on `quirks.promptCachingSupported`). Advisory, additive, absent for all existing callers. No `ProviderAdapter` method/signature change (INV-03 intact).
- **`anthropic.ts`** — `execute()` computes a conditional `system` value: when `request.cacheSystemPrefix !== undefined`, `system: [{ type: "text", text: prefix, cache_control: { type: "ephemeral" } }]`; otherwise the literal `""` exactly as before. The `system` key is always present (conditional value, not conditional spread — Messages API contract D-07). `messages` untouched (`task` carries only the body). Stale "prompt caching deferred" JSDoc note refreshed.
- **`anthropic.test.ts`** — new `describe("cacheSystemPrefix (Phase 39)")` block with 3 tests:
  1. Presence: captured fetch body has `system` as a 1-element array with `cache_control.type === "ephemeral"` (literal asserted) and `messages[0].content === request.task` (prefix not duplicated).
  2. Absence: serialized request body byte-identical (`String(capture.init.body)` strict-equals the pre-change golden JSON) plus deep-equal of the parsed object; `system` is the empty STRING.
  3. Cache counters: fixtures with `cache_creation_input_tokens: 1200` / `cache_read_input_tokens: 1200` readable via `rawResponse`; `normalizedUsage` asserted to have exactly the existing 3 fields (no cache members leaked).

## TDD Gate Compliance

- RED commit `4208311` (`test(39-04)`): Test 1 failed pre-implementation (system was `""`, not an array); Tests 2 and 3 are characterization tests of existing behavior and passed at RED by design (absence path and rawResponse preservation already existed — they guard against regression, not new behavior).
- GREEN commit `b4f793d` (`feat(39-04)`): all 818 lattice tests pass; typecheck clean.
- No REFACTOR commit needed.

## Verification Results

- `vitest run src/providers` — 8 files, 154/154 passed
- Full lattice suite — 60 files, 818/818 passed
- `tsc --noEmit` (lattice) — clean
- Diff scope: only `provider.ts`, `anthropic.ts`, `anthropic.test.ts` (confirmed via `git diff --name-only` per task)
- `grep -c cacheSystemPrefix provider.ts` = 1; `grep -c cache_control anthropic.ts` = 3
- `Usage` type unmodified; zero other adapter files touched (OpenAI-family token-prefix caching needs no request change)

## Threat Model Outcomes

- **T-39-11 (Tampering, request body assembly) — mitigated:** absence path proven byte-identical via serialized golden-string assertion; presence path exact-shape asserted.
- **T-39-12 (Info disclosure, error/log paths) — mitigated:** no new logging; adapter error handling untouched (err.message-only rule preserved).
- **T-39-13 (DoS, cache-miss cost inflation) — transferred:** byte-stability of the prefix is the 39-05 crew dispatcher's contract; the adapter emits exactly what it is given.
- **T-39-SC — accepted:** zero package installs this plan (lockfile-only `pnpm install --frozen-lockfile` to hydrate the fresh worktree's node_modules).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree had no node_modules**
- **Found during:** Task 2 RED verification (vitest: command not found)
- **Fix:** `pnpm install --frozen-lockfile` (existing lockfile deps only — no new packages)
- **Files modified:** none (node_modules only)
- **Commit:** n/a

**2. [Rule 1 - Doc accuracy] Stale "prompt caching deferred" JSDoc in anthropic.ts**
- **Found during:** Task 1
- **Issue:** `AnthropicProviderOptions` doc comment still listed prompt caching as deferred to a follow-on phase
- **Fix:** Updated the note to reference the Phase 39 opt-in `cacheSystemPrefix` path
- **Files modified:** packages/lattice/src/providers/anthropic.ts
- **Commit:** b4f793d

Otherwise the plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, file access, or schema changes beyond the planned `<threat_model>` surface.

## Commits

| Task | Commit | Type | Description |
| ---- | ------ | ---- | ----------- |
| 2 (RED) | 4208311 | test | failing cacheSystemPrefix shape + cache-counter tests |
| 1 (GREEN) | b4f793d | feat | ProviderRunRequest.cacheSystemPrefix + Anthropic cache_control emission |

## Next Steps for 39-05

- Crew dispatcher composes the byte-stable prefix and sets `cacheSystemPrefix` only when `(adapter.quirks as AnthropicQuirks).promptCachingSupported === true`; otherwise folds the prefix into the head of `task` (OpenAI automatic token-prefix path).
- Prefix byte-stability snapshot test lives in 39-05 (T-39-13 transfer target).

## Self-Check: PASSED

- FOUND: packages/lattice/src/providers/provider.ts (cacheSystemPrefix present)
- FOUND: packages/lattice/src/providers/anthropic.ts (cache_control present)
- FOUND: packages/lattice/src/providers/anthropic.test.ts (Phase 39 describe block present)
- FOUND: commit 4208311
- FOUND: commit b4f793d
