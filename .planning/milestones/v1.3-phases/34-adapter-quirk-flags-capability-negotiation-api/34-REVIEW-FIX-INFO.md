---
phase: 34
phase_name: adapter-quirk-flags-capability-negotiation-api
status: applied
applied: 2026-06-08
fixer: gsd-code-fixer
review_source: 34-REVIEW.md
fix_scope: info_only
include_info: true
findings_applied: 4
findings_skipped_already_done: 5
verification:
  typecheck: pass
  per_file_tests: pass
  full_suite: 731 lattice + 144 lattice-cli = 875 passed, 0 failed
---

# Phase 34: Code Review Fix Report (Info Pass)

Applied the 4 remaining Info-level findings from `34-REVIEW.md`. The 5
Warning-level findings (WR-01..WR-05) were already landed in the first
fix pass (`34-REVIEW-FIX.md`, commits 25fdd6b / 4d214df / 61fe817 / f7ec6b8
/ 841a92d) and are not re-applied here.

## Applied Fixes

| Finding | Commit | Files | Description |
|---------|--------|-------|-------------|
| IN-01 | `95d5d20` | `packages/lattice/src/providers/gemini.ts`, `packages/lattice/src/providers/openrouter.ts` | Added top-level `providerId` and `modelId` to the `createRunEvent(...)` call in `emitFallbackEvent` so consumers filtering `event.providerId === "openrouter"` / `event.modelId === ...` capture Gemini/OpenRouter fallback events (matching Anthropic at `anthropic.ts:119-129` and xAI at `xai.ts:67-79`). Gemini reuses its existing closure-scoped `const id`; OpenRouter uses `options.id ?? "openrouter"` inline since there is no top-level `const id` binding. |
| IN-02 | `364f28b` | `packages/lattice/src/providers/adapters.ts`, `packages/lattice/src/providers/xai.ts` | Replaced `"authorization": \`Bearer ${options.apiKey ?? ""}\`` with conditional spread `...(options.apiKey !== undefined ? { authorization: \`Bearer ${options.apiKey}\` } : {})` on both OpenAI and xAI negotiate paths. Mirrors the OpenAI-compat execute path at `adapters.ts:137`. No more empty Bearer tokens hitting upstream when apiKey is absent. |
| IN-03 | `2d62c2e` | `packages/lattice/src/capabilities/negotiate.ts` | Changed the not-found stub `streaming: true` to `streaming: adapter !== "lm-studio"`, matching `mapProfileToNegotiatedCapabilities` line 198. Consumers querying an unknown lm-studio model now get `streaming: false` consistent with the documented LM Studio conservative default. |
| IN-04 | `4b3a20a` | `packages/lattice/src/capabilities/profile.ts`, `packages/lattice/src/capabilities/negotiate.ts` | Added `CAPABILITY_ADAPTERS` runtime list and `isCapabilityAdapter(id)` type guard to `capabilities/profile.ts`. Replaced the unsafe `as CapabilityAdapter` cast in `negotiateCapabilities` (negotiate.ts:110) with a runtime guard: unknown adapter ids route to the empty-stub path explicitly (passing `"openai"` to drive the not-found branch with `streaming: true`). Same observable behavior, but the graceful-degradation contract is now explicit at the type level. |

## Verification

- **Tier 2 typecheck:** `pnpm -r typecheck` clean across `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli` after every commit.
- **Tier 3 per-file tests:**
  - IN-01: `gemini.test.ts` + `openrouter.test.ts` -- 37/37 pass.
  - IN-02: `adapters.test.ts` + `xai.test.ts` -- 40/40 pass.
  - IN-03: `capabilities-negotiate-helper.test.ts` + `capabilities-negotiate-integration.test.ts` + `lm-studio.test.ts` -- 28/28 pass.
  - IN-04: `capabilities-negotiate-helper.test.ts` + `capabilities-negotiate-integration.test.ts` -- 13/13 pass.
- **Full suite:** `pnpm -r test` -- 731 lattice + 144 lattice-cli = 875 tests pass, 0 fail. Matches the pre-Info-pass baseline exactly.

## Logic-Bug Exposure Notes

- **IN-01:** Pure additive. Adds two existing optional fields (`providerId`, `modelId`) at the top level of `RunEvent`; `metadata.providerId` / `metadata.modelId` already carried the values. No existing test asserts absence of these top-level fields, so no test broke. The fallback semantics are unchanged.
- **IN-02:** Behavior change is observable only when `options.apiKey` is `undefined`: the request now omits `Authorization` entirely instead of sending `Bearer `. Upstream still returns 401 in that case (no apiKey), so the auth-error branch still fires identically. Test fixtures pass `apiKey: "test-key"` explicitly, so the conditional spread always evaluates truthy in tests and existing assertions are unaffected.
- **IN-03:** Behavior change: when `synthesizeNegotiatedCapabilitiesFromRegistry("lm-studio", <unknown-model>, ...)` is invoked, `supports.streaming` is now `false` (was `true`). No existing test in `lm-studio.test.ts` or the integration test asserted `streaming: true` for an unknown lm-studio model (verified via `grep "streaming" lm-studio.test.ts` -- only references line 211-212 which is a quirk-level assertion, not registry-stub). Test 2 in `capabilities-negotiate-integration.test.ts` (`unknown modelId` -> empty stub) does not assert `supports.streaming`, so it passes.
- **IN-04:** Behavior unchanged for all valid adapter ids -- the new `if (!isCapabilityAdapter(...))` branch is only taken when the id is NOT in the closed union, in which case both old (unsafe cast -> registry not-found -> empty stub) and new (runtime guard -> registry not-found with `"openai"` adapter -> empty stub) paths return the same shape. Test 3 (`returns empty-stub with source 'registry' when registry has no matching profile`) uses `id: "openai"` (a valid adapter), so it takes the existing path and passes.

## Skipped (Already Applied in Prior Pass)

`WR-01` -- OpenAI fetchAndNegotiate `AbortSignal.timeout(30_000)` (commit `4d214df`).
`WR-02` -- xAI fetchAndNegotiate `AbortSignal.timeout(30_000)` (commit `61fe817`).
`WR-03` -- `mergeOpenAIModelsWithRegistry` source: "live" inline stub (commit `25fdd6b`).
`WR-04` -- Anthropic missing-model fallback event emission (commit `f7ec6b8`).
`WR-05` -- Anthropic Test 7 same-modelId rewrite for inflight invariant (commit `841a92d`).

## Touched Files

- `packages/lattice/src/providers/gemini.ts`
- `packages/lattice/src/providers/openrouter.ts`
- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/capabilities/negotiate.ts`
- `packages/lattice/src/capabilities/profile.ts`
