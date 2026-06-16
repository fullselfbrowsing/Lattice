---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 02
subsystem: agent-infra
tags: [rate-limiting, token-bucket, lease, agent-transport, fake-timers, vitest]

# Dependency graph
requires:
  - phase: 20 (v1.2 AgentHost)
    provides: AgentTransport seam (host.ts) that withRateLimit wraps
  - phase: 21 (v1.2 agent infra primitives)
    provides: CostTracker module-shape precedent (doc header, kind-tagged closure factory, type-only imports)
provides:
  - createRateLimitGroup — standalone dual-dimension (RPM + input-TPM) token-bucket primitive with lease-based acquire/release
  - withRateLimit — AgentTransport wrapper sharing one bucket across every caller holding the same group instance
  - Burn-on-failure refund policy decided + documented (resolves research Open Question 5)
affects: [39-06 crew dispatcher, 39 package-root exports, runAgent consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Lazy continuous-drain token bucket (per-ms refill from now() delta, single deficit setTimeout, no setInterval)
    - Lease-based reservation/reconciliation as future cross-process seam (D-17)
    - Transport-seam composition without touching ProviderAdapter (INV-03)

key-files:
  created:
    - packages/lattice/src/agent/infra/rate-limit-group.ts
    - packages/lattice/src/agent/infra/rate-limit-group.test.ts
  modified: []

key-decisions:
  - "Burn-on-failure: on provider throw, lease releases with the ORIGINAL estimate (no refund) — quota may have been consumed despite the error"
  - "Oversized estimates (> bucket capacity) proceed at full bucket and debit into debt rather than deadlocking"
  - "FLOAT_EPSILON (1e-6) absorbs IEEE-754 drift in bucket comparisons and deficit-wait ceil so fake-timer tests resolve at exact boundaries"
  - "Constants kept module-private (DEFAULT_REQUESTS_PER_MINUTE = 50, DEFAULT_TOKENS_PER_MINUTE = 30_000, Anthropic Tier 1 fetched 2026-06-10)"

patterns-established:
  - "Rate gating via withRateLimit(group, inner?) — nests over consumer transports; falls through to provider.execute with the noop-host guard (provider id only in errors)"
  - "Estimate-then-reconcile: chars/4 reservation, release() against actual Usage.promptTokens; non-finite usage falls back to the estimate"

requirements-completed: [DELEG-05]

# Metrics
duration: 12min
completed: 2026-06-10
---

# Phase 39 Plan 02: Rate-Limit Group Primitive Summary

**Dual-dimension (50 RPM / 30k input-TPM) lazy-drain token-bucket with FIFO lease interface plus the withRateLimit AgentTransport wrapper, deterministic under vitest fake timers**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-10T16:12:43Z
- **Completed:** 2026-06-10T16:24:30Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 2

## Accomplishments

- `createRateLimitGroup` ships the standalone, zero-dependency rate-limit primitive (D-12..D-17): two closure-state buckets (requests + input tokens) refilled lazily from the `now()` delta, at most one pending `setTimeout` (exact head-waiter deficit), FIFO waiter queue, and lease reconciliation that refunds under-use / debits over-use on the token bucket only.
- `withRateLimit(group, inner?)` wraps the `AgentTransport` seam so every caller holding the same group instance shares one bucket — the structural guarantee 39-06's crew dispatcher composes on. `ProviderAdapter` is untouched (INV-03 intact; `git diff` contains only the two infra files).
- Refund policy locked and tested: on provider throw the lease releases with the original estimate (burn — no refund), and the same error instance propagates unchanged with provider-id-only messages (never apiKey/header content).
- 11 fake-timer tests (6 bucket + 5 wrapper) run in ~7ms; full lattice suite 826/826 green; typecheck green.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: createRateLimitGroup dual-dimension lease bucket** — `78f2179` (test, RED) → `99b7358` (feat, GREEN)
2. **Task 2: withRateLimit AgentTransport wrapper** — `78c6c66` (test, RED) → `f340b21` (feat, GREEN)

## Files Created/Modified

- `packages/lattice/src/agent/infra/rate-limit-group.ts` — `createRateLimitGroup` + `withRateLimit` + `RateLimitGroupOptions`/`RateLimitLease`/`RateLimitGroup` types; CostTracker-style doc header documenting the drain model, zero-dep statement (D-17/D-18), and burn-on-failure caller contract
- `packages/lattice/src/agent/infra/rate-limit-group.test.ts` — 11 behaviors: Tier-1 defaults (51st request waits 1200ms; 30k-token cap), dual-dimension independence, half-minute continuous-drain refill (research skeleton), lease refund/debit reconciliation, FIFO fairness, injectable `now` without fake timers, execute routing + actual-usage release, inner-transport nesting, shared-bucket coordination across two wrapped transports, burn-on-failure + same-error propagation + secret-free messages, estimate fallback on missing/null usage

## Decisions Made

- **Burn-on-failure (research Open Question 5):** on throw, `lease.release({ promptTokens: estimate })` — net-zero reconciliation, nothing refunded. Conservative because the provider may have consumed quota despite the error. Tested by asserting exactly `capacity - estimate` remains acquirable afterward.
- **Float-drift hardening:** `FLOAT_EPSILON = 1e-6` in capacity comparisons and subtracted before `Math.ceil` on deficit waits, so a 60_000ms refill of exactly 1 request resolves at `advanceTimersByTimeAsync(60_000)` rather than 60_001 (IEEE-754 `1/60000` rounding).
- **Oversized-estimate clamp:** availability checks clamp the token requirement to bucket capacity but debit the full amount (bucket goes into debt and recovers via drain) — prevents a deadlocked waiter whose estimate exceeds capacity.
- **Release pumps waiters:** a refund re-evaluates the FIFO queue immediately (and reschedules the deficit timer), so reconciliation can unblock pending acquires without waiting for the previously scheduled timeout.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed workspace dependencies in fresh worktree**
- **Found during:** Task 1 (RED verification run)
- **Issue:** The parallel-executor worktree had no `node_modules`; `vitest` was not on PATH so the test command failed with `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`
- **Fix:** `pnpm install --frozen-lockfile` (lockfile-pinned workspace install — no new packages added)
- **Files modified:** none (node_modules only, gitignored)
- **Verification:** test suite runs; lockfile unchanged in `git status`
- **Committed in:** n/a (no tracked-file changes)

**2. [Rule 1 - Bug] Reworded doc header to satisfy the setInterval grep gate**
- **Found during:** Task 1 (acceptance criteria verification)
- **Issue:** The module doc header mentioned `setInterval` literally ("NO `setInterval`"), tripping the acceptance gate `grep -c 'setInterval' ... returns 0`
- **Fix:** Reworded to "No interval timers, no recurring background timers"
- **Files modified:** packages/lattice/src/agent/infra/rate-limit-group.ts
- **Verification:** grep count 0; tests still green
- **Committed in:** `99b7358` (Task 1 feat commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were mechanical; no scope change.

## Issues Encountered

None beyond the deviations above.

## TDD Gate Compliance

Both tasks followed RED → GREEN with verified gate commits: `test` commits (`78f2179`, `78c6c66`) precede their `feat` commits (`99b7358`, `f340b21`). RED runs failed for the expected reason (missing module / missing export); no REFACTOR commits were needed.

## Known Stubs

None — both exports are fully implemented; no placeholder values, TODOs, or unwired data paths.

## Threat Flags

None — all surface introduced is covered by the plan's threat model (T-39-04 conservative Tier-1 defaults, T-39-05 lazy refill + no interval timers, T-39-06 provider-id-only errors tested, T-39-07 lease always released incl. burn path, T-39-SC zero installs of new packages).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 39-06 (crew dispatcher) can construct one shared group per adapter instance and wrap parent + child host transports via `withRateLimit` — the public names locked here (`createRateLimitGroup`, `withRateLimit`, `RateLimitGroupOptions`, `RateLimitLease`, `RateLimitGroup`) match the interfaces block downstream plans depend on.
- Package-root export of the primitive (`packages/lattice/src/index.ts`) is intentionally NOT done in this plan (verification required no changes outside `src/agent/infra/`); the export lands with the public-surface plan that owns index.ts/publint/attw/tsd gates.

---
*Phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda*
*Completed: 2026-06-10*

## Self-Check: PASSED

- FOUND: packages/lattice/src/agent/infra/rate-limit-group.ts (309 lines, min 80)
- FOUND: packages/lattice/src/agent/infra/rate-limit-group.test.ts (369 lines, min 80)
- FOUND commits: 78f2179, 99b7358, 78c6c66, f340b21
