---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 05
subsystem: agent
tags: [multi-agent, crew, dispatcher, receipts, prompt-cache, deleg-03, deleg-04, deleg-06]

# Dependency graph
requires:
  - phase: 39-03
    provides: AgentSpec/defineAgent, validateCrewPolicy, runAgentInternal dispatchToolUse seam, buildTaskBody byte-equality invariant, crew-budget-exceeded failure kind, AgentSnapshot.ancestry
  - phase: 39-01
    provides: receiptCid content-address helper + CreateReceiptInput.parentReceiptCid
  - phase: 39-04
    provides: ProviderRunRequest.cacheSystemPrefix + AnthropicQuirks.promptCachingSupported gate contract
provides:
  - "createCrewDispatcher(spec, ctx): the single crew chokepoint — child dispatch via the kind:\"agent\" branch, ancestry cycle/depth enforcement, per-child budget derivation, summary-return validation, classified failure routing with terminal-block semantics, per-agent receipt minting with parentReceiptCid chaining"
  - "CrewDispatchContext / CrewDispatcher / CrewDispatchError / DispatchToolUseFn interfaces for the 39-06 orchestrator"
  - "deriveChildBudget(specBudget, pool, maxIterationsPerAgent): per-dimension min with null-cost safety"
  - "classifyChildFailure(childId, failure): D-09/D-10 terminal mapping (exported for direct unit coverage)"
  - "composeCrewCachePrefix(tools): byte-stable describeForSystem() crew prefix"
  - "withCachePrefixHoist(sharedPrefix, inner?): quirks-gated AgentTransport wrapper (Anthropic hoist / OpenAI head-of-task pass-through)"
affects: [39-06 runAgentCrew orchestrator, 39-07 showcase, 39-08 public exports + tsd]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive dispatcher nodes share one crew state box (exhausted flag + runId) so the ceiling signal propagates from any depth"
    - "Survivability-adapter wrapper injects AgentSnapshot.ancestry without touching runtime.ts serialization"
    - "Transport-level prefix hoist: startsWith(prefix + '\\n') strip is byte-exact via the 39-03 buildTask/buildTaskBody invariant"
    - "Synthetic ToolDefinition declarations with throwing execute bodies — real registry members, never invoked (D-01/D-02)"

key-files:
  created:
    - packages/lattice/src/agent/crew/dispatcher.ts
    - packages/lattice/src/agent/crew/dispatcher.test.ts
    - packages/lattice/src/agent/crew/cache-prefix.test.ts
    - packages/lattice/src/agent/crew/__snapshots__/cache-prefix.test.ts.snap
  modified: []

key-decisions:
  - "Ancestry convention: ctx.ancestry = spec-id chain ABOVE the agent (exclusive of self; root dispatcher gets []) so the plan's literal `ancestry.length >= maxDepth` gate allows root dispatch at maxDepth 1; cycle check covers both `target ∈ ancestry` AND `target === spec.id` (self-dispatch)"
  - "Child snapshot ancestry persisted via a survivability-adapter wrapper (root-first chain INCLUDING the child) — no runtime.ts change needed, honoring the plan's files_modified scope"
  - "CrewDispatchContext gained `config: LatticeConfig` (child loops need providers) and CrewDispatcher gained `crewBudgetExhausted()` (the Task 2c orchestrator signal) — interface refinements the plan explicitly permitted"
  - "agent-iteration-denied classification: STUCK_REASONS substrings in reason → recoverable; all other SAFETY denials terminal (AgentDeniedError aligns with TripwireViolationError semantics)"
  - "no-contract-match (the loop's cost-budget-exceeded kind) is terminal per results/errors.ts isTerminal — child cost exhaustion is never re-dispatched"
  - "Completion-receipt minting is best-effort (checkpoint.ts D-07 precedent): a mint failure drops the CID from the summary but never destroys the child's completed work"

metrics:
  duration: ~11 min
  completed: 2026-06-10T16:49:00Z
  tasks: 3
  tests-after: 891 passed (66 files)

requirements: [DELEG-03, DELEG-04, DELEG-06]
---

# Phase 39 Plan 05: CrewDispatcher Chokepoint Summary

CrewDispatcher chokepoint with hybrid kind:"agent" dispatch through the 39-03 seam, schema-validated `{summary, artifacts, receipts}` re-entry, ancestry cycle/depth gates, terminal-block failure routing, parentReceiptCid receipt chaining to the crew-root CID, and byte-stable quirks-gated cache-prefix hoisting — all proven against fake providers (891/891 tests).

## Tasks Completed

| # | Task | Commits | Key Changes |
|---|------|---------|-------------|
| 1 | Dispatch branch, child execution, summary validation | 391550c (RED), e2ec08a (GREEN) | createCrewDispatcher, deriveChildBudget, childToolDeclarations synthesis |
| 2 | Cycle/depth, failure routing, receipt chaining | 5672c15 (RED), 314b0a6 (GREEN) | ancestry gates, classifyChildFailure, terminal-block set, crew ceiling + flag, completion receipts |
| 3 | Cache-prefix composition + quirks-gated hoist | 8093001 (RED), 898cd9a (GREEN) | composeCrewCachePrefix, withCachePrefixHoist, childHost transport wrapping |

## What Was Built

- **`createCrewDispatcher(spec, ctx)`** (`packages/lattice/src/agent/crew/dispatcher.ts`): returns `{ dispatchToolUse, childToolDeclarations, crewBudgetExhausted }`. On each `ToolUseRequest` whose name matches a `childAgents[].id`, the full child pipeline runs at the chokepoint: terminal-block short-circuit → cycle check (self or ancestry) → depth gate (`ancestry.length >= policy.maxDepth`) → crew-ceiling check (null-cost-safe) → `{ task: string }` args guard → per-dimension budget derivation (`min(spec.contract?.budget, ctx.remainingBudget())`, iterations also capped by `maxIterationsPerAgent`) → `runAgentInternal` child loop (recursive dispatcher node + extended ancestry when the child has its own children) → exactly-once `ctx.recordUsage` → success: receipt mint + envelope validation + `{ content: JSON }` re-entry; failure: classified `{"error":{"kind","reason","terminal"}}`.
- **Failure routing (D-09/D-10):** `classifyChildFailure` maps tripwire-violated / no-contract-match / crew-budget-exceeded → terminal; agent-max-iterations / wall-time / STUCK_REASONS stalls → recoverable; non-stuck SAFETY denials → terminal. Terminal failures cache into a per-dispatcher block set — a second dispatch of the same child returns the cached error with the child loop provably NOT invoked (provider-call-counter assertion).
- **Receipt chain (DELEG-06):** with a signer, child completion mints via `createReceipt` with `parentReceiptCid = ctx.crewRootCid`, synthetic route `lattice-crew` / `lattice-crew/agent-completion` (checkpoint DEFAULT_ROUTE precedent); the envelope flows through `ctx.mintedReceipts` and `await receiptCid(envelope)` lands in the summary's `receipts` array. Verified: `JSON.parse(atob(payload)).parentReceiptCid === crewRootCid` and `verifyReceipt` ok with an ephemeral test KeySet. No signer → no mint, `receipts: []`, run still succeeds. Checkpoint per-iteration receipts untouched.
- **Cache-prefix sharing (DELEG-04 crew half):** `composeCrewCachePrefix` emits the deterministic `describeForSystem()` block (compose-twice byte equality + declaration-purity tests; zero `Date.now`/`Math.random` in the file). `withCachePrefixHoist` wraps the childHost transport: quirked adapters get `cacheSystemPrefix` + body-only `task` (strip is byte-exact via the 39-03 invariant; reconstruction asserted `prefix + "\n" + task === buildTask`); non-quirked adapters receive the request untouched — no `cacheSystemPrefix` own-property, prefix at head of `task`.
- **Snapshot ancestry (D-05):** a survivability-adapter wrapper injects the root-first chain (including the child) into `AgentSnapshot.ancestry` whenever the childHost captures snapshots — asserted `["lead", "researcher"]` on a storage-backed childHost.

## Verification Results

- `vitest run` (full lattice suite) — 66 files, 891/891 passed (was 861 pre-plan; +30 from this plan's 24 dispatcher + 6 cache-prefix tests)
- `pnpm --filter @full-self-browsing/lattice typecheck` — clean
- `grep -c 'runTool(' packages/lattice/src/agent/crew/dispatcher.ts` — 0 (children never route through tool closures)
- `grep -n 'Date\.now\|Math\.random' dispatcher.ts` — no matches (prefix composition deterministic)
- Diff scope vs wave base `d4c7c81`: exactly dispatcher.ts + 2 test files + 1 snapshot; `src/index.ts` untouched (no public-surface change — exports land in 39-06/39-08)
- D-09 exact shape asserted by parse: top-level key `["error"]`, inner keys `["kind","reason","terminal"]`

## TDD Gate Compliance

All three tasks followed RED → GREEN with verified-failing tests before implementation:
- Task 1: `391550c` (test, RED: module not found) → `e2ec08a` (feat, GREEN: 10/10)
- Task 2: `5672c15` (test, RED: 12 failed) → `314b0a6` (feat, GREEN: 24/24 + receipts suites 138/138)
- Task 3: `8093001` (test, RED: 6 failed) → `898cd9a` (feat, GREEN: 30/30 crew tests)
No REFACTOR commits needed.

## Deviations from Plan

### Auto-fixed / refined

**1. [Interface refinement] `CrewDispatchContext.config` + `CrewDispatcher.crewBudgetExhausted()`**
- **Found during:** Task 1/2 design
- **Issue:** child loops need a `LatticeConfig` (providers) to execute, and Task 2(c) requires an orchestrator-readable ceiling signal — neither was in the plan's interface sketch
- **Fix:** added both; the plan explicitly permits member refinement ("Member names may be refined during implementation")
- **Commits:** e2ec08a, 314b0a6

**2. [Convention precision] Ancestry chain semantics (D-05)**
- **Found during:** Task 2
- **Issue:** the plan's literal `[...ctx.ancestry, childId]` threading conflicts with its own `ancestry.length >= maxDepth` gate when the root chain includes the root id (root dispatch would self-reject at maxDepth 1)
- **Fix:** `ctx.ancestry` = chain ABOVE the agent (exclusive; root = `[]`); child dispatch context threads `[...ctx.ancestry, spec.id]`; cycle check additionally rejects `target === spec.id`; snapshots persist the full chain including the child. Both plan tests (cycle rejection + depth-1 rejection of a child's own delegation) pass under this convention
- **Commit:** 314b0a6

**3. [Rule 2 - Input validation] `invalid-dispatch-args` structured error**
- **Found during:** Task 1
- **Issue:** dispatch args cross the untrusted model→runtime boundary (T-39-14); a non-string `task` would otherwise throw raw
- **Fix:** malformed args return a recoverable `{"error":{"kind":"invalid-dispatch-args",...}}` tool result so the parent model can correct itself
- **Commit:** e2ec08a

Otherwise the plan executed as written.

## Threat Model Outcomes

- **T-39-14 (EoP, child→parent re-entry) — mitigated:** only the schema-validated envelope re-enters; failures are structured kind/reason objects, never raw child transcripts.
- **T-39-15 (Tampering, parentReceiptCid chain) — mitigated:** CID = sha256 of signed payload bytes; anchor minted before children run; verifyReceipt round-trip asserted.
- **T-39-16 (DoS, runaway delegation) — mitigated:** cycle rejection + maxDepth gate + crew-budget-exceeded terminal kind + maxIterationsPerAgent cap, all at the chokepoint.
- **T-39-17 (EoP, terminal re-dispatch) — mitigated:** per-dispatcher terminal-block set, counter-asserted that the child loop is not re-invoked.
- **T-39-18 (Info disclosure) — mitigated:** error bodies carry kind/reason strings only; no request options/headers/keys serialized.
- **T-39-SC — accepted:** zero package installs (lockfile-only `pnpm install --frozen-lockfile` to hydrate the fresh worktree).

## Known Stubs

None — no placeholder values, TODOs, or unwired data paths introduced.

## Threat Flags

None — no new surface beyond the plan's `<threat_model>`.

## Next Phase Readiness

- 39-06 consumes exactly: `createCrewDispatcher` (seam-compatible `dispatchToolUse` + `childToolDeclarations` + `crewBudgetExhausted`), `composeCrewCachePrefix` (compose once at crew start → `ctx.sharedPrefix`), `withCachePrefixHoist` (wrap the PARENT's transport too — the dispatcher only wraps child loops), and the usage/receipt callbacks.
- The orchestrator must mint the crew-root receipt BEFORE creating the dispatcher context (Pitfall 2) and pass `crewRootCid` + the same signer.
- Public exports + tsd coverage deferred to 39-06/39-08 per plan scope.

## Self-Check: PASSED

All 4 created files exist on disk; all 6 task commits (391550c, e2ec08a, 5672c15, 314b0a6, 8093001, 898cd9a) verified in git log.
