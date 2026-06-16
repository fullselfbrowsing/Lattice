---
phase: 34
phase_name: adapter-quirk-flags-capability-negotiation-api
status: applied
applied: 2026-06-08
fixer: gsd-code-fixer
review_source: 34-REVIEW.md
fix_scope: critical_and_warning
include_info: false
findings_applied: 5
findings_skipped_out_of_scope: 4
verification:
  typecheck: pass
  per_file_tests: pass
  full_suite: 731 lattice + 144 lattice-cli = 875 passed, 0 failed
---

# Phase 34: Code Review Fix Report

Applied all 5 Warning-level findings from `34-REVIEW.md`. Skipped 4 Info-level findings (`IN-01..IN-04`) per `--fix` default scope.

## Applied Fixes

| Finding | Commit | Files | Description |
|---------|--------|-------|-------------|
| WR-03 | `25fdd6b` | `packages/lattice/src/providers/adapters.ts` | Inline empty-stub returned with `source: "live"` when /v1/models confirms model but registry has no profile. Matches comment intent. |
| WR-01 | `4d214df` | `packages/lattice/src/providers/adapters.ts` | Added `signal: AbortSignal.timeout(30_000)` to OpenAI negotiate `fetchImpl` call. |
| WR-02 | `61fe817` | `packages/lattice/src/providers/xai.ts` | Added `signal: AbortSignal.timeout(30_000)` to xAI negotiate `fetchImpl` call. |
| WR-04 | `f7ec6b8` | `packages/lattice/src/providers/anthropic.ts` | Added `emitFallbackEvent({ ..., errorReason: "model not found in /v1/models response" })` before falling back to registry when 200 response omits modelId. Matches OpenAI/Gemini/OpenRouter parity. |
| WR-05 | `841a92d` | `packages/lattice/src/providers/anthropic.test.ts` | Reworked Test 7 (inflight cleanup on rejection): all 6 calls use the same modelId `claude-opus-4` so the assertion `fetchCallCount === 2` only passes if `.finally` cleared the inflight Map. |

## Verification

- **Tier 2 typecheck:** `pnpm -r typecheck` clean across `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli`.
- **Tier 3 per-file tests:** `anthropic.test.ts` (23/23), `adapters.test.ts` (24/24), `xai.test.ts` (16/16) all pass.
- **Full suite:** `pnpm -r test` — 731 lattice + 144 lattice-cli = 875 tests pass, 0 fail.

## Logic-Bug Exposure Notes

- **WR-01 / WR-02:** Pure additive guard (no behavior change to test fixtures since fake fetch resolves synchronously). No logic-bug risk.
- **WR-03:** Changes returned `source` from `"registry-fallback"` to `"live"` in one narrow path. Existing assertion `expect(["live","registry-fallback"]).toContain(result.source)` in `adapters.test.ts` Test 3 already tolerated both — passes after fix. No other test asserts the exact source value for this path.
- **WR-04:** Additive event emission. Merge function return value unchanged. No existing test asserts "fallback event was NOT emitted in this scenario", so no test broke.
- **WR-05:** Test logic itself was wrong; rewrite verifies the intended invariant (`fetchCallCount === 2` proves inflight Map cleared). Still passes against current implementation, confirming `.finally` cleanup in `negotiate()` does run.

## Skipped (Out of Scope)

`IN-01` — Gemini/OpenRouter `emitFallbackEvent` missing top-level `providerId`/`modelId` (Info; UX inconsistency, not a bug).
`IN-02` — OpenAI/xAI send `Authorization: Bearer ` (empty token) when apiKey is undefined (Info; observable as 401, not exploitable).
`IN-03` — `synthesizeNegotiatedCapabilitiesFromRegistry` empty stub hardcodes `streaming: true` even for `lm-studio` (Info; latent, untested).
`IN-04` — Unsafe `as CapabilityAdapter` cast in `negotiate.ts:110` hides consumer adapter typos (Info; documented graceful degradation).

Re-run with `--all` to include these.

## Touched Files

- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/anthropic.test.ts`
