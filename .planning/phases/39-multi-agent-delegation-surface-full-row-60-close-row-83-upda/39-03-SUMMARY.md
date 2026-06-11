---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 03
subsystem: agent
tags: [multi-agent, crew, defineAgent, crew-policy, dispatch-seam, prompt-cache, typescript]

# Dependency graph
requires:
  - phase: 19-22 (v1.2 agent capability)
    provides: runAgent loop, formatToolsForProvider, AgentHost/AgentSnapshot, AgentFailureKind taxonomy
  - phase: 07 (v1.1 contracts)
    provides: BudgetInvariant + contract() frozen conditional-spread factory template
provides:
  - defineAgent + AgentSpec crew spec factory (kind:"agent" sibling of defineTool, tree composition by value)
  - CrewPolicy type + validateCrewPolicy normalizer (frozen defaults maxDepth 1, serial children, managed coordination)
  - AgentFailureKind extended with "crew-budget-exceeded"
  - AgentSnapshot optional ancestry field (agent-snapshot/v1 backward compatible)
  - runAgentInternal injectable dispatchToolUse seam (in-package only, default = runTool path)
  - format-tools buildTaskBody body-only variant for cache-prefix hoisting
affects: [39-05 crew dispatcher, 39-06 runAgentCrew public surface, 39-08 tsd type tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Omit<Spec, 'kind'> spread factory mirrored from defineTool for defineAgent"
    - "contract()-style frozen conditional-spread normalizer for validateCrewPolicy"
    - "Internal seam via runAgentInternal extra options param; public runAgent stays a thin wrapper"
    - "assembleTask(conversation, includeSystemBlock) factoring keeps buildTask/buildTaskBody byte-consistent"

key-files:
  created:
    - packages/lattice/src/agent/crew/agent-spec.ts
    - packages/lattice/src/agent/crew/agent-spec.test.ts
    - packages/lattice/src/agent/crew/crew-policy.ts
    - packages/lattice/src/agent/crew/crew-policy.test.ts
  modified:
    - packages/lattice/src/agent/types.ts
    - packages/lattice/src/agent/host.ts
    - packages/lattice/src/agent/runtime.ts
    - packages/lattice/src/agent/format-tools.ts
    - packages/lattice/src/agent/runtime.test.ts
    - packages/lattice/src/agent/format-tools.test.ts

key-decisions:
  - "validateCrewPolicy REJECTS maxConcurrentChildren > 1 with TypeError (not clamp) — fail-fast per D-11 and the project's explicit-config stance"
  - "Dispatch seam shape: exported runAgentInternal(intent, config, internalOptions) in runtime.ts, NOT re-exported from src/index.ts; runAgent delegates with no options so the public signature is byte-identical"
  - "Dispatched tool results record resultHash = stableHash(content); argsHash unchanged via existing stableHash"
  - "AgentSnapshot.ancestry is optional on the existing agent-snapshot/v1 literal (no version bump) — absent = root agent (Pitfall 8)"
  - "buildTaskBody is a sibling handle method (research recommendation) rather than a buildTask option flag"

patterns-established:
  - "Crew module layout: packages/lattice/src/agent/crew/ with colocated tests"
  - "Seam invariant: describeForSystem() + '\\n' + buildTaskBody(conv) === buildTask(conv) byte-for-byte"

requirements-completed: [DELEG-01, DELEG-02, DELEG-03]

# Metrics
duration: 9min
completed: 2026-06-10
---

# Phase 39 Plan 03: Crew Type Foundation + Dispatch Seam Summary

**defineAgent/AgentSpec, CrewPolicy + validateCrewPolicy, crew-budget-exceeded failure kind, AgentSnapshot ancestry, and the injectable runAgentInternal dispatchToolUse seam + buildTaskBody cache-prefix variant — all additive, with single-agent behavior bit-for-bit unchanged (834/834 tests, zero expectation edits).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-06-10T16:13:12Z
- **Completed:** 2026-06-10T16:22:00Z
- **Tasks:** 3 (all TDD: RED → GREEN, no refactor commits needed)
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- `defineAgent(spec)` ships as a literal sibling of `defineTool`: `Omit<AgentSpec, "kind">` spread factory returning the `kind: "agent"` discriminant, with `childAgents` composing by value as a tree and an optional per-agent `contract` sub-budget (D-03, D-07).
- `CrewPolicy` carries `BudgetInvariant` verbatim plus structural caps; `validateCrewPolicy` returns a frozen normalized policy (defaults `maxDepth: 1`, `maxConcurrentChildren: 1`, `coordination: "managed"`) and throws `TypeError` naming the field for `maxConcurrentChildren > 1` and any non-integer/< 1 structural cap (D-06, D-11, D-16).
- `AgentFailureKind` gains `"crew-budget-exceeded"` (D-10); `AgentSnapshot` gains optional `ancestry?: readonly string[]` while the `"agent-snapshot/v1"` version literal stays unchanged — v1 snapshots without the field round-trip cleanly (D-05, Pitfall 8).
- runtime.ts step 4g now routes every `ToolUseRequest` through an injectable `dispatchToolUse` seam on `runAgentInternal`'s third (in-package-only) options parameter: `{ content }` lands verbatim in the `role:"tool"` turn with the original toolCallId/toolName; `undefined` falls through to the existing lookup/runTool path verbatim. Public `runAgent(intent, config)` signature and behavior unchanged; `src/index.ts` untouched (T-39-10 mitigation).
- `buildTaskBody` sibling on `FormattedToolsHandle` emits the turn rendering minus the leading system block; byte-equality test proves `describeForSystem() + "\n" + buildTaskBody(conv) === buildTask(conv)` — the non-duplicating body builder for the 39-05 cache-prefix hoist.

## Task Commits

Each task was committed atomically (TDD: test → feat):

1. **Task 1: defineAgent + AgentSpec** - `621c847` (test), `4998e0c` (feat)
2. **Task 2: CrewPolicy + validation, crew-budget-exceeded, AgentSnapshot ancestry** - `30d0708` (test), `29e6986` (feat)
3. **Task 3: runtime dispatch seam + format-tools body-only option** - `6fcc3aa` (test), `8fbb469` (feat)

## Files Created/Modified

- `packages/lattice/src/agent/crew/agent-spec.ts` - AgentSpec interface + defineAgent factory (D-03)
- `packages/lattice/src/agent/crew/agent-spec.test.ts` - 4 behaviors: kind literal, tree-by-value, no undefined keys, ~standard stub schema
- `packages/lattice/src/agent/crew/crew-policy.ts` - CrewPolicy/CrewRateLimitOverride/ValidatedCrewPolicy + validateCrewPolicy normalizer (D-06, D-11, D-16)
- `packages/lattice/src/agent/crew/crew-policy.test.ts` - 8 tests covering behaviors 1-6 incl. failure-kind and snapshot-ancestry compat
- `packages/lattice/src/agent/types.ts` - AgentFailureKind + "crew-budget-exceeded" (D-10)
- `packages/lattice/src/agent/host.ts` - AgentSnapshot optional ancestry with Phase 39 doc comment
- `packages/lattice/src/agent/runtime.ts` - runAgentInternal + RunAgentInternalOptions/DispatchToolUseContext; runAgent now a thin wrapper; step 4g dispatch-first restructure
- `packages/lattice/src/agent/format-tools.ts` - assembleTask factoring + buildTaskBody on FormattedToolsHandle
- `packages/lattice/src/agent/runtime.test.ts` - 3 seam tests (intercept, fall-through, no-options parity)
- `packages/lattice/src/agent/format-tools.test.ts` - 3 buildTaskBody tests incl. byte-equality reconstruction

## Decisions Made

- **Reject, not clamp**, for `maxConcurrentChildren > 1` — TypeError with message naming the field and the serial-only v1.3 limit (research Pattern 5, D-16 explicit-config stance).
- **Seam shape (a)** from research Pattern 1: exported `runAgentInternal` in runtime.ts consumed in-package only; named-export style of `src/index.ts` means nothing leaks without an explicit re-export (acceptance gate held: index.ts diff empty).
- **No runtime.ts snapshot-serialization change** for ancestry in this plan — the serialization site builds the object literal without a chain in loop context; 39-05 threads the chain. Type + compat tests only, exactly as the plan scoped it.
- `resultHash` for dispatched results = `stableHash(content)` (deterministic, consistent with existing argsHash convention; receipt-grade sha256 CIDs are 39-04/39-05 scope per research anti-pattern note).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The fresh worktree had no `node_modules`; ran `pnpm install --frozen-lockfile` before the first test run (environment setup, not a code deviation).

## TDD Gate Compliance

All three tasks followed RED → GREEN with verified-failing tests before implementation:
- Task 1: `621c847` (test, RED: module missing) → `4998e0c` (feat, GREEN: 819/819)
- Task 2: `30d0708` (test, RED: module missing) → `29e6986` (feat, GREEN: 828/828)
- Task 3: `6fcc3aa` (test, RED: 6 failed / 828 passed) → `8fbb469` (feat, GREEN: 834/834)
No refactor commits were needed (implementations landed clean on first GREEN).

## Known Stubs

None — no placeholder values, TODOs, or unwired data paths were introduced.

## Threat Flags

None — no new surface beyond the plan's `<threat_model>`. T-39-08 (fail-fast frozen policy validation), T-39-09 (optional ancestry, v1 compat tested), and T-39-10 (seam in-package only, index.ts untouched) mitigations are all implemented and tested. Zero package installs (T-39-SC).

## Next Phase Readiness

- 39-05 (CrewDispatcher) and 39-06 (runAgentCrew public surface) can build directly against `AgentSpec`, `validateCrewPolicy`, `runAgentInternal.dispatchToolUse`, and `buildTaskBody` without renegotiation.
- Package-root exports + tsd coverage for the new public types are deliberately deferred to 39-06/39-08 per the plan's done criteria.

## Self-Check: PASSED

All 4 created files exist on disk; all 6 task commits (621c847, 4998e0c, 30d0708, 29e6986, 6fcc3aa, 8fbb469) verified in git log.
