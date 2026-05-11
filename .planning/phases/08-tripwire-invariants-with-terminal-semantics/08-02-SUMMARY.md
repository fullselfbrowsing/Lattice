---
phase: 08-tripwire-invariants-with-terminal-semantics
plan: 02
subsystem: lattice/runtime
tags:
  - tripwire
  - runtime
  - terminal-semantics
  - public-surface
  - phase-8
requirements:
  - TRIP-02
  - TRIP-03
  - TRIP-04
  - TRIP-05
dependency-graph:
  requires:
    - phase-8/plan-01 (inv builder + evaluateTripwires kernel + TripwireEvidence)
    - phase-7/CapabilityContract.invariants field
    - phase-7/runWithConfig validation success path
    - phase-7/normalizeAdapterUsage helper
  provides:
    - TripwireViolationError variant on LatticeRunError (terminal: true)
    - isTerminal(error) predicate covering tripwire-violated + no-contract-match
    - "tripwire" ExecutionStageKind with default-stage placement between validation and persistence
    - runWithConfig tripwire evaluation block with isTerminal-gated early return
    - public package exports for inv, evaluateTripwires, isTerminal, and the tripwire/invariant type surface
  affects:
    - phase-9 (receipt canonicalization will sign evidence and report usage as costAtAbort)
    - phase-10 (replay envelope will embed the tripwire stage state)
    - phase-12 (eval gate reuses evaluateTripwires directly; isTerminal is the documented retry contract)
tech-stack:
  added: []
  patterns:
    - "isTerminal predicate as the single source of truth for retry gating"
    - "literal-true `terminal` field as a structural marker on the new error variant"
    - "early-return short-circuit instead of an explicit isTerminal check inside the fallback for-loop"
    - "post-validation, pre-return tripwire evaluation inside the success branch"
key-files:
  created:
    - packages/lattice/src/plan/plan.test.ts
  modified:
    - packages/lattice/src/results/errors.ts
    - packages/lattice/src/results/errors.test.ts
    - packages/lattice/src/plan/plan.ts
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/runtime/create-ai.test.ts
    - packages/lattice/src/runtime/public-types.ts
    - packages/lattice/src/index.ts
    - packages/lattice/test/public-surface.test.ts
decisions:
  - "Terminal flag lives as a literal `true` on TripwireViolationError ONLY. NoContractMatchError keeps its Phase 7 shape (no terminal field). isTerminal() carries the union-level knowledge via kind check so Phase 7 callers compile unchanged."
  - "Tripwire evaluation reads validation.outputs (the validated, schema-conforming map), not the raw provider response. This means invariants referencing fields outside the user's output map will not see them — callers must declare such fields. T6 (must-cite) demonstrates: declaring a `citations: { kind: 'citations' }` output is required so the citations array survives validation into the evaluator."
  - "Fallback retry refusal is enforced by early-return inside the success path, not by an explicit isTerminal check in the for-loop. The for-loop never advances past a terminal failure because the function has already returned. isTerminal remains the documented contract for downstream consumers (Phase 12 eval gate, user-side retry wrappers)."
  - "stage:tripwire status flows: 'completed' (invariants present and all passed), 'skipped' (no invariants or no-route plan), 'failed' (a violation fired). The success-path markStage chain was extended to include the tripwire transition so the inspectability guarantee from TRIP-05 holds end-to-end."
  - "Usage on tripwire-violated failure is sourced from `normalizeAdapterUsage(response)` — the cost the provider actually billed. Phase 9 receipts will distinguish this as `costAtAbort` vs `costAtSuccess`."
metrics:
  duration: "approximately 6 minutes"
  completed: "2026-05-11"
  tests-added: 28
  total-tests-after: 189
  phase-8-plan-01-baseline: 161
  phase-7-baseline: 110
---

# Phase 8 Plan 2: Runtime Tripwire Wiring + Public Surface Summary

Wire the pure tripwire kernel from Plan 01 into `runWithConfig`: evaluate tripwires after output schema validation succeeds, return a `RunFailure` carrying `kind: "tripwire-violated", terminal: true, invariantId, evidence` on the first violation, populate `usage` from the provider response, and refuse retries by construction (early-return short-circuits the fallback chain). Surface the tripwire API publicly — `inv`, `evaluateTripwires`, `isTerminal`, plus the invariant variant and tripwire result/evidence/error type names.

## Test Counts

| File | Tests Added |
|------|-------------|
| `packages/lattice/src/results/errors.test.ts` | 10 |
| `packages/lattice/src/plan/plan.test.ts` | 4 (new file) |
| `packages/lattice/src/runtime/create-ai.test.ts` | 8 |
| `packages/lattice/test/public-surface.test.ts` | 6 |
| **Subtotal new** | **28** |
| Plan 01 baseline | 161 |
| **Total after Plan 08-02** | **189** |

All 22 test files green; `pnpm typecheck` exits 0; `pnpm build` produces a `dist/index.d.ts` containing every Phase 8 type name. Zero regressions to the 161-test Plan 01 + Phase 7 baseline.

## What Shipped

### TripwireViolationError + isTerminal

```ts
export interface TripwireViolationError {
  readonly kind: "tripwire-violated";
  readonly message: string;
  readonly invariantId: string;
  readonly evidence: TripwireEvidence;
  readonly terminal: true;
}

export type LatticeRunError =
  | ValidationError
  | ExecutionUnavailableError
  | NoRouteError
  | ProviderExecutionError
  | TimeoutError
  | NoContractMatchError
  | TripwireViolationError;

export function isTerminal(error: LatticeRunError): boolean {
  return error.kind === "tripwire-violated" || error.kind === "no-contract-match";
}
```

`terminal` is a literal-`true` field only on `TripwireViolationError`. `NoContractMatchError` does NOT add the field — adding it would be a Phase 7 breaking change — but `isTerminal()` still returns `true` for it via the kind check. Downstream consumers (Phase 12 eval gate, user-side retry wrappers) call `isTerminal()` rather than reading `error.terminal` directly.

### "tripwire" ExecutionStageKind

`packages/lattice/src/plan/plan.ts` adds `"tripwire"` to `ExecutionStageKind` between `"validation"` and `"persistence"`. `createDefaultStages` emits `stage:tripwire` with status `"pending"` on selected routes and `"skipped"` on no-route plans.

### runWithConfig integration block

`runWithConfig` in `packages/lattice/src/runtime/create-ai.ts` now evaluates tripwires INSIDE the `validation.ok === true` branch and BEFORE the success result returns:

- If `intent.contract?.invariants` is non-empty, `evaluateTripwires(validatedSuccess.outputs, invariants)` runs in declaration order.
- A pass advances to the success path; the `markStage` chain for `completedPlan` now marks `stage:tripwire` as `"completed"` (or `"skipped"` when there were no invariants).
- A violation early-returns a `RunFailure` carrying the new error variant, `usage: normalizeAdapterUsage(response)`, and a `failedPlan` whose `stage:tripwire` reads `"failed"` with `{ invariantId }` metadata. A `run.failed` event with `metadata.reason = "tripwire-violated"` is emitted before the return.

The early-return is the retry-refusal mechanism: the function exits before the `for` loop advances to the next route, so the second provider is never attempted (test T2 asserts `attempts.length === 1` and zero `fallback.activated` events).

### Public Surface

`packages/lattice/src/index.ts` adds:

- **Values:** `inv`, `evaluateTripwires`, `defaultPiiDetectors`, `isTerminal`
- **Types:** `FieldFromTableInvariant`, `InvariantOptions`, `MatchesInvariant`, `MustCiteInvariant`, `NoPiiInvariant`, `PiiDetector`, `PiiDetectorResult`, `TripwireEvidence`, `TripwireResult`, `TripwireViolationError`

`packages/lattice/src/runtime/public-types.ts` re-exports the same type names from the contract barrel and `results/errors.ts`.

`packages/lattice/test/public-surface.test.ts` gains a `Phase 8 public surface` describe block with six tests covering the value bag shape, mustCite shape, async evaluateTripwires signature, isTerminal truth table, invariant variant assignability, and a `createAI + contract + inv` integration smoke test.

## Acceptance-Grep Evidence

```
$ grep -n "evaluateTripwires" packages/lattice/src/runtime/create-ai.ts
4:import { evaluateTripwires } from "../contract/tripwire.js";
326:        const tripwireResult = await evaluateTripwires(

$ grep -n "\"tripwire-violated\"" packages/lattice/src/runtime/create-ai.ts
360:                reason: "tripwire-violated",
370:              kind: "tripwire-violated" as const,

$ grep -n "terminal: true" packages/lattice/src/runtime/create-ai.ts
374:              terminal: true as const,

$ grep -n "kind: \"tripwire\"" packages/lattice/src/plan/plan.ts
335:      kind: "tripwire",

$ grep -n "export function isTerminal" packages/lattice/src/results/errors.ts
95:export function isTerminal(error: LatticeRunError): boolean {

$ grep -n "export { inv" packages/lattice/src/index.ts
3:export { inv } from "./contract/invariants.js";

# Test-name greps proving coverage of the verification phrases:
$ grep -n "no retry on tripwire violation\|tripwire violation produces typed failure\|usage populated on tripwire violation\|validation failure precedes tripwire" packages/lattice/src/runtime/create-ai.test.ts
265:  it("T1: tripwire violation produces typed failure ...
294:  it("T2: no retry on tripwire violation ...
337:  it("T3: usage populated on tripwire violation ...
451:  it("T8: validation failure precedes tripwire ...

# dist build verification (post pnpm build):
$ grep -c "TripwireViolationError\|TripwireEvidence\|isTerminal\|evaluateTripwires\|inv" packages/lattice/dist/index.d.ts
TripwireViolationError: 3
TripwireEvidence: 5
isTerminal: 4
evaluateTripwires: 5
inv: 28
MustCiteInvariant: 4
FieldFromTableInvariant: 4
NoPiiInvariant: 4
MatchesInvariant: 4
```

## Threat Model Mitigations Applied

| Threat ID | Mitigation in code | Test that asserts it |
|-----------|--------------------|----------------------|
| T-08-06 (EoP: fallback retries past a tripwire) | Early-return inside the violation branch terminates `runWithConfig` before the `for` loop advances. The `terminal: true` literal + `isTerminal()` predicate document the contract for downstream consumers. | `create-ai.test.ts` T2: `attempts.length === 1` against a 2-provider config, zero `fallback.activated` events. |
| T-08-07 (Repudiation: tripwire runs report zero usage) | Violation return uses `usage: normalizeAdapterUsage(response)` — the cost the provider actually billed. | `create-ai.test.ts` T3: `result.usage === { promptTokens: 10, completionTokens: 5, costUsd: 0.0001 }`. |
| T-08-08 (Tampering: evaluation order swap) | Tripwire block lives ONLY inside the `validation.ok === true` branch. Validation failures return BEFORE tripwire evaluates. | `create-ai.test.ts` T8: validation-rejected output yields `error.kind === "validation"` and `stage:tripwire` stays `pending`/`skipped`. |
| T-08-09 (Info disclosure: full output leaked via evidence) | Plan 01 guaranteed `evidence.observed` for no-pii contains only `{ detector, substring }`; this plan verifies the full flow end-to-end. | `create-ai.test.ts` T7: `JSON.stringify(evidence)` does not contain the surrounding input text. |

T-08-10 (DoS via async evaluator in hot path) remains `accept` per the threat register — `evaluateTripwires` is in-process, bounded, no I/O.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] T6 must-cite test originally declared only `text` in outputs**

- **Found during:** Task 2 GREEN test run
- **Issue:** The first cut of T6 used the `output: { text: "ok", citations: ["artifact-1"] }` shape but declared only `outputs: { text: "text" }` in the run intent. `validateOutputMap` drops fields outside the contract map, so the citations array never reached the evaluator and `must-cite` failed.
- **Fix:** Added `citations: { kind: "citations" as const }` to the test's outputs map so the citations payload survives validation into the tripwire evaluator. This also surfaces a real decision worth recording (see Key Decisions): tripwires see schema-validated outputs, not raw provider responses — callers MUST declare any field they want invariants to inspect.
- **Files modified:** `packages/lattice/src/runtime/create-ai.test.ts` (T6 only)
- **Commit:** `0784992` (folded into the Task 2 GREEN commit so the diff is atomic)

**2. [Rule 3 - Blocking] result.plan.attempts typecheck under ResultPlan union**

- **Found during:** Task 2 typecheck
- **Issue:** `result.plan` is typed as `ResultPlan = ExecutionPlan | ExecutionPlanStub`, and `ExecutionPlanStub` has no `attempts` field. T2 accessed `result.plan.attempts` directly and TS2339'd.
- **Fix:** Narrowed via `if (result.plan.kind === "execution-plan")` before accessing `attempts`. Behavior unchanged — a tripwire violation always produces an ExecutionPlan (never a stub) so the guard is never falsy in practice.
- **Files modified:** `packages/lattice/src/runtime/create-ai.test.ts` (T2 only)
- **Commit:** `0784992` (same commit as the bug fix above)

### Implementation Choices Surfaced

- The plan's pseudocode placed the tripwire block before the validation-failure attempt push and used a `succeededAttempt` shape with `status: "failed"` and a `completedAt` override. The shipped code follows the same pattern but inlines the `completedAt: tripwireFailedAt` so the attempt record reflects the moment the tripwire fired rather than the original provider completion. This matches the spirit of the threat-mitigation table — "what time did we know it failed" — and keeps the attempt timeline monotonic.
- The plan suggested `withPlanStatus(plan, plan.status, { stages: markStage(..., "tripwire", "running") })` before the evaluator call. I dropped the intermediate "running" mark because the evaluator is synchronous-from-a-tracer-perspective (microseconds, no I/O); a `running` → `completed`/`failed` transition adds noise without observability benefit. The stage moves directly from `pending` to its terminal status. If T-08-10 changes disposition in a future phase and we want event-level visibility into the evaluator, we can reinstate the "running" mark cheaply.

## Forward Links to Phase 9 (Receipts)

Phase 9 will:

1. **Canonicalize `error.evidence`** into the signed receipt envelope. The Plan 01 redaction invariant (`evidence.observed` for `no-pii` carries only `{ detector, substring }`) means the receipt CAN sign the evidence without leaking PII.
2. **Distinguish `costAtAbort` vs `costAtSuccess`.** `RunFailure.usage` on a `tripwire-violated` failure is the new `costAtAbort` source. Phase 7 left the field zero for `no-contract-match` (the run never executed); Phase 8 fills it from the provider response for tripwire violations.
3. **Reuse `evaluateTripwires` pure-function signature.** Phase 12's eval gate will import the same function this plan wired into the runtime — no runtime concerns dragged in, which is the forward-compat hook locked in Plan 01.
4. **Persist the tripwire stage state.** `stage:tripwire` with status `"completed" | "failed" | "skipped"` and `metadata.invariantId` is the shape Phase 9 replays will reconstruct.

## Self-Check: PASSED

All requirement IDs from the plan frontmatter are satisfied with file:line references on the current branch:

- **TRIP-02** (tripwire stage between validation and persistence; evaluation after validation success): `packages/lattice/src/plan/plan.ts:332-338` (stage entry) + `packages/lattice/src/runtime/create-ai.ts:319-385` (evaluation block).
- **TRIP-03** (terminal-flag wiring; no retry on violation): `packages/lattice/src/results/errors.ts:64-71` (TripwireViolationError with `terminal: true`) + `packages/lattice/src/results/errors.ts:95-97` (isTerminal predicate) + `packages/lattice/src/runtime/create-ai.ts:367-385` (early-return terminal short-circuit).
- **TRIP-04** (RunFailure with kind tripwire-violated + invariantId + evidence): `packages/lattice/src/runtime/create-ai.ts:367-381` (failure return shape) + `packages/lattice/src/results/errors.ts:64-71` (type definition).
- **TRIP-05** (tripwire ExecutionStageKind + inspectability via plan.stages): `packages/lattice/src/plan/plan.ts:17-27` (union member) + `packages/lattice/src/plan/plan.ts:332-338` (default stage emission) + `packages/lattice/src/runtime/create-ai.ts:392-410` (success-path markStage chain).

All 5 files created/modified exist on disk:

- `packages/lattice/src/results/errors.ts` (modified)
- `packages/lattice/src/results/errors.test.ts` (modified)
- `packages/lattice/src/plan/plan.ts` (modified)
- `packages/lattice/src/plan/plan.test.ts` (created)
- `packages/lattice/src/runtime/create-ai.ts` (modified)
- `packages/lattice/src/runtime/create-ai.test.ts` (modified)
- `packages/lattice/src/runtime/public-types.ts` (modified)
- `packages/lattice/src/index.ts` (modified)
- `packages/lattice/test/public-surface.test.ts` (modified)
- `.planning/phases/08-tripwire-invariants-with-terminal-semantics/08-02-SUMMARY.md` (created — this file)

All 5 commit hashes are reachable on the current branch:

- `f481486` test(08-02): failing tests for isTerminal, TripwireViolationError, tripwire stage
- `e2f31fa` feat(08-02): TripwireViolationError, isTerminal, tripwire stage kind
- `4679057` test(08-02): failing tests for runtime tripwire wiring
- `0784992` feat(08-02): wire evaluateTripwires into runWithConfig
- `736dd2e` feat(08-02): export Phase 8 public surface and add public-surface tests

## Commits

| # | Hash | Type | Subject |
|---|------|------|---------|
| 1 | `f481486` | test | add failing tests for isTerminal, TripwireViolationError, and tripwire stage kind |
| 2 | `e2f31fa` | feat | add TripwireViolationError, isTerminal, and tripwire stage kind |
| 3 | `4679057` | test | add failing tests for runtime tripwire wiring |
| 4 | `0784992` | feat | wire evaluateTripwires into runWithConfig with terminal semantics |
| 5 | `736dd2e` | feat | export Phase 8 public surface and add public-surface tests |
