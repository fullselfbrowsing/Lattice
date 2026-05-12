---
phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting
plan: 04
subsystem: runtime-and-public-surface
tags:
  - capability-contract
  - runtime
  - no-contract-match
  - usage
  - public-surface
  - phase-7
dependency_graph:
  requires:
    - phase: 07-01
      provides: CapabilityContract types, contract() factory, Usage shape
    - phase: 07-02
      provides: RouteRequest.contract, contract-* reject codes in noRouteReasons
    - phase: 07-03
      provides: NoContractMatchError, RunSuccess/RunFailure.usage required, normalizedUsage on ProviderRunResponse
  provides:
    - RunIntent.contract optional top-level field
    - runWithConfig no-route classifier emits no-contract-match when contract-* reasons are present
    - Every RunSuccess/RunFailure return path populates usage
    - Public exports: contract, estimateRouteCost, evaluateContractAgainstRoute
    - Public type exports: BudgetInvariant, CapabilityContract, CapabilityContractInput, ContractRejectReasonCode, InvariantDeclaration, QualityFloorInvariant, Usage
    - normalizeAdapterUsage helper (prefers ProviderRunResponse.normalizedUsage; falls back to legacy UsageRecord)
    - public-surface test asserting the package root from outside src/
  affects:
    - Phase 8 (tripwires) - will populate usage on tripwire-violated RunFailure return paths using the same pattern
    - Phase 9 (receipts) - canonicalizes RunResult.usage into the signed envelope and consumes evaluateContractAgainstRoute for verdict reconstruction
tech_stack:
  added: []
  patterns:
    - "Contract-reason classifier: filter noRouteReasons by code list to discriminate no-contract-match from generic no_route"
    - "Usage normalization helper: prefer ProviderRunResponse.normalizedUsage over legacy UsageRecord"
    - "Zero-usage on refused execution (no-contract-match, execution_unavailable, no_route): { promptTokens: 0, completionTokens: 0, costUsd: 0 }"
    - "Unmeasured-usage on attempted-then-failed provider execution: { promptTokens: 0, completionTokens: 0, costUsd: null } (distinguishes 'free' from 'we don't know what was billed')"
key_files:
  created:
    - packages/lattice/src/runtime/create-ai.test.ts
    - packages/lattice/test/public-surface.test.ts
  modified:
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/outputs/validate.ts
    - packages/lattice/src/replay/replay.ts
    - packages/lattice/src/index.ts
decisions:
  - Closed Plan 07-03's 7 deferred tsc errors in this plan by populating usage at every RunSuccess/RunFailure return site across create-ai.ts (4 sites), validate.ts (2 sites), and replay.ts (2 sites)
  - no-contract-match, no_route, and execution_unavailable all carry zero usage { 0, 0, 0 } because pre-flight refused execution; provider_execution failure carries unmeasured usage { 0, 0, null } because the runtime attempted execution and cannot be certain whether the provider billed before failure
  - validate.ts return paths populate usage with costUsd: null as a type-satisfying default — runtime callers always spread { ...validation } and then override usage with adapter-derived values, so the validate.ts defaults are never actually surfaced to callers in normal flow
  - Exposed estimateRouteCost and evaluateContractAgainstRoute as public exports because Phase 9 receipts will reuse the evaluator for deterministic verdict reconstruction and external callers may want to compute cost estimates without running ai.plan
  - Kept the four contract reject codes in the runtime classifier as an exhaustive literal list (contract-budget-exceeded, contract-quality-floor, contract-modality-missing, contract-privacy-mismatch) — preferred over startsWith("contract-") because the closed taxonomy is the source of truth
  - Public surface test lives at packages/lattice/test/public-surface.test.ts (outside src/) to exercise the same import path an external consumer uses; vitest config already globs **/*.test.ts so no config change was needed
metrics:
  duration: ~11 minutes
  completed_date: "2026-05-11"
requirements:
  - CONTRACT-01
  - CONTRACT-04
  - CONTRACT-05
  - CONTRACT-06
  - COST-01
  - COST-02
---

# Phase 07 Plan 04: Runtime contract wiring and public surface Summary

RunIntent gains an optional top-level contract carrier, runWithConfig classifies no-route as no-contract-match when contract-* reasons appear in noRouteReasons, every RunSuccess and RunFailure return path now populates usage, and the contract factory plus its type family land on the public package surface.

## What Shipped

### RunIntent contract wiring (`packages/lattice/src/runtime/create-ai.ts`)

```typescript
export interface RunIntent<TOutputs extends OutputContractMap> {
  readonly task: string;
  readonly artifacts?: readonly ArtifactInput[];
  readonly outputs: TOutputs;
  readonly policy?: PolicySpec;
  readonly session?: SessionRef;
  readonly signal?: AbortSignal;
  readonly overrides?: RuntimeOverrides;
  readonly tools?: readonly ToolDefinition<any>[];
  readonly toolInputs?: Record<string, unknown>;
  readonly contract?: CapabilityContract;
}
```

`contract` is a top-level optional field (NOT nested inside `policy`) per CONTEXT.md. `buildPlan` forwards `intent.contract` into `routeDeterministically` via the exact-optional spread pattern already used for other optional inputs.

### no-contract-match classification

In `runWithConfig`, the `selected === undefined` branch now inspects `plan.route.noRouteReasons` for any of the four contract reject codes and emits `NoContractMatchError` with the full `noRouteReasons[]` array when at least one is present. The legacy `no_route` path is preserved exactly for the non-contract case.

```typescript
const contractReasons = plan.route.noRouteReasons.filter(
  (r) =>
    r.code === "contract-budget-exceeded" ||
    r.code === "contract-quality-floor" ||
    r.code === "contract-modality-missing" ||
    r.code === "contract-privacy-mismatch",
);
const isContractFailure = contractReasons.length > 0;
```

### Usage population at every return site

| File                                        | Return site (line)      | Branch                                              | Usage value |
| ------------------------------------------- | ----------------------- | --------------------------------------------------- | ----------- |
| `src/runtime/create-ai.ts` line ~152        | no-route classifier     | no-contract-match OR generic no-route               | `{ 0, 0, 0 }` |
| `src/runtime/create-ai.ts` line ~306        | validation-failed       | last route exhausted                                | `normalizeAdapterUsage(response)` |
| `src/runtime/create-ai.ts` line ~361        | success                 | provider succeeded + validation passed              | `normalizeAdapterUsage(response)` |
| `src/runtime/create-ai.ts` line ~382        | execution-unavailable   | no executable adapter configured                    | `{ 0, 0, 0 }` |
| `src/runtime/create-ai.ts` line ~405        | provider-execution-failure | all routes attempted and threw                   | `{ 0, 0, null }` |
| `src/outputs/validate.ts` line ~55          | validation failure literal | (overridden by caller's spread)                  | `{ 0, 0, null }` |
| `src/outputs/validate.ts` line ~72          | validation success literal | (overridden by caller's spread)                  | `{ 0, 0, null }` |
| `src/replay/replay.ts` line ~62             | replay execution_unavailable | envelope.outputs undefined                      | `envelopeUsage(envelope)` |
| `src/replay/replay.ts` line ~73             | replay success           | envelope.outputs present                            | `envelopeUsage(envelope)` |

`normalizeAdapterUsage` prefers `ProviderRunResponse.normalizedUsage` (the Phase 7 shape emitted by openai / openai-compat / ai-sdk / fake adapters) and falls back to the legacy `UsageRecord` shape if `normalizedUsage` is absent.

`envelopeUsage` reconstructs `Usage` from the replay envelope's persisted `UsageRecord` (input/output tokens) and defaults to `{ 0, 0, null }` when usage is unrecorded.

### Public surface (`packages/lattice/src/index.ts`)

Added value exports:

- `contract` (factory)
- `estimateRouteCost`
- `evaluateContractAgainstRoute`

Added type exports (slotted alphabetically into the existing big block):

- `BudgetInvariant`
- `CapabilityContract`
- `CapabilityContractInput`
- `ContractRejectReasonCode`
- `InvariantDeclaration`
- `QualityFloorInvariant`
- `Usage`

No existing exports were removed or reordered.

External consumers can now write:

```typescript
import { contract, createAI, type CapabilityContract, type Usage } from "lattice";

const ai = createAI({ providers: [...] });
const result = await ai.run({
  task: "summarize",
  outputs: { text: "text" },
  contract: contract({ budget: { maxCostUsd: 0.01 } }),
});
// result.usage is always defined; result.error.kind is "no-contract-match" when pre-flight refused
```

### Public surface test (`packages/lattice/test/public-surface.test.ts`)

A 4-test suite that imports from `../src/index.js` (the consumer-visible path) and asserts:

1. `contract` is a function.
2. `contract({...})` returns an object with `kind: "capability-contract"`.
3. `createAI` accepts a `RunIntent` literal with a `contract` field (compile-time check via literal assignability).
4. `BudgetInvariant`, `QualityFloorInvariant`, `InvariantDeclaration`, `ContractRejectReasonCode`, and `Usage` are exported type names.

## v1.0 Backward Compatibility

| v1.0 caller pattern                                              | Compiles unchanged? | Runs unchanged? | Evidence                                                              |
| ---------------------------------------------------------------- | ------------------- | --------------- | --------------------------------------------------------------------- |
| `ai.run({ task, outputs: { text: "text" } })` (no contract)      | YES                 | YES             | E5 in create-ai.test.ts asserts RunSuccess.usage is present and `costUsd: null` |
| `ai.run({ task, outputs, policy: { maxCostUsd: 1 } })`           | YES                 | YES             | All Plans 1-6 tests pass (94 -> 110 total tests; 0 regressions)        |
| `result.outputs.text` (no usage read)                            | YES                 | YES             | usage is required on RunResult but adding a required field does not break consumers that don't read it |
| `if (!result.ok) { result.error.kind === "no_route" }`           | YES                 | YES             | E6 asserts no_route still emitted when there is no contract           |

## Tests

| File                                                    | Suite                                       | Count |
| ------------------------------------------------------- | ------------------------------------------- | ----- |
| `packages/lattice/src/runtime/create-ai.test.ts`        | `Phase 7 contract + cost integration`       | 6     |
| `packages/lattice/src/runtime/create-ai.test.ts`        | `Phase 7 end-to-end integration`            | 6     |
| `packages/lattice/test/public-surface.test.ts`          | `Phase 7 public surface`                    | 4     |
| **New tests this plan**                                 |                                             | **+16** |
| **Full suite after plan**                               |                                             | **110** |

Phase 7 cumulative test additions (vs Phase 6 baseline of 48 tests):

| Plan  | File(s)                                              | Tests added |
| ----- | ---------------------------------------------------- | ----------- |
| 07-01 | contract.test.ts (6), provider.test.ts (+6), public-types.test.ts (6) | +18 |
| 07-02 | preflight.test.ts (10), router.test.ts (+6)          | +16         |
| 07-03 | errors.test.ts (5), adapters.test.ts (+7)            | +12         |
| 07-04 | create-ai.test.ts (12), public-surface.test.ts (4)   | +16         |
| **Phase 7 total**                                            |             | **+62 tests** |

## Test counts vs plan's announced expectations

The 07-04 PLAN's `<output>` block listed expected counts including "create-ai.test.ts (+12 total across Task 1 and Task 3)". Final count is exactly **12** in `create-ai.test.ts` (6 in `Phase 7 contract + cost integration` + 6 in `Phase 7 end-to-end integration`) plus 4 in the separately-located `public-surface.test.ts`, matching the plan's contract.

## Requirements Coverage

| ID           | Coverage                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTRACT-01 | `RunIntent.contract?: CapabilityContract` exported; `contract()` factory exported from `lattice` root; `public-surface.test.ts` asserts the surface; `create-ai.test.ts` Test 1 asserts assignability. |
| CONTRACT-04 | `ai.run` returns `RunFailure` when no candidate satisfies a contract; `create-ai.test.ts` Tests 4 and 6, E1, E2, E3 all assert.                                                                   |
| CONTRACT-05 | `RunFailure.error.kind === "no-contract-match"` carries `noRouteReasons[]`; `create-ai.test.ts` Test 4 + E1 + E2 assert; `NoContractMatchError` is exported via `LatticeRunError` (Plan 07-03).   |
| CONTRACT-06 | Three of four contract reject codes (`contract-budget-exceeded`, `contract-modality-missing`, `contract-privacy-mismatch`) are emitted end-to-end through `ai.run`; `create-ai.test.ts` Tests 4, E1, E2, E3 assert. `contract-quality-floor` remains reserved (Phase 12). |
| COST-01     | `RunSuccess.usage` and `RunFailure.usage` are required and populated at every return path; 9 distinct return sites populate usage; E4 asserts adapter-derived value flows through.                |
| COST-02     | Runtime threads `ProviderRunResponse.normalizedUsage` into `RunResult.usage` via `normalizeAdapterUsage`; E4 asserts the exact `{ 10, 5, 0.0001 }` value emitted by the fake adapter flows through unchanged. |

## Deviations from Plan

### Auto-fixed / Additive

**1. [Rule 3 - Blocking issue] Closed Plan 07-03's 7 deferred tsc errors in `validate.ts` and `replay.ts` in addition to `create-ai.ts`**

- **Found during:** Task 1
- **Issue:** The 07-04 PLAN's success criteria say `pnpm tsc --noEmit` must exit 0. Plan 07-03 documented 7 tsc errors across 3 files (create-ai.ts:4, validate.ts:2, replay.ts:2) all due to missing `usage` on RunSuccess/RunFailure literals. The 07-04 PLAN's `<action>` block focuses on the 4 create-ai.ts sites but does not enumerate validate.ts / replay.ts in the same step-by-step form, though the success criteria require closing them too. Action steps 9-10 mention "replicate the same fix" in 07-03's summary.
- **Fix:** Populated `usage` at both literals in `validate.ts` (kind: validation failure and success — both are overridden by runtime callers via `...validation` spread, so the defaults are type-satisfying placeholders only) and both literals in `replay.ts` (kind: replay execution_unavailable and replay success — both consume the persisted UsageRecord from `envelope.usage` via a new `envelopeUsage()` helper).
- **Files modified:** `packages/lattice/src/outputs/validate.ts`, `packages/lattice/src/replay/replay.ts`
- **Commit:** `edf70d4` (same commit as the create-ai.ts wiring — they are inseparable for tsc clean-up)

**2. [Rule 2 - Critical functionality] Test 5 in `Phase 7 contract + cost integration` uses a structured-output schema literal to trigger no_route**

- **Found during:** Task 1
- **Issue:** The PLAN's Test 5 description ("with a catalog whose only capability has `structuredOutput: false` and NO contract returns a RunFailure with `error.kind === "no_route"`") requires a structured-output requirement to actually exercise the `structured-output-unsupported` reject path. The PLAN's exemplar code did not specify how to construct the outputs map.
- **Fix:** Test 5 passes an `outputs.action` with a synthetic `~standard` schema literal (cast as `never` to keep the OutputContractMap type happy) so the router sees a structured-output requirement on a `structuredOutput: false` capability. Test passes.
- **Files modified:** `packages/lattice/src/runtime/create-ai.test.ts`
- **Commit:** `dd595db` (RED test commit)

**3. [Rule 2 - Test strengthening] E6 also asserts usage on the no-route branch**

- **Found during:** Task 3
- **Issue:** PLAN's E6 only specified `error.kind === "no_route"`, but the implementation in Task 1 puts `usage: { 0, 0, 0 }` on the no_route branch too. Adding the usage assertion strengthens the test and locks in the design decision.
- **Fix:** E6 also asserts `result.usage` equals `{ promptTokens: 0, completionTokens: 0, costUsd: 0 }`.
- **Files modified:** `packages/lattice/src/runtime/create-ai.test.ts`
- **Commit:** `5ac9d63`

No bugs were found, no architectural changes were needed, no authentication gates were encountered. All deviations are additive coverage or scope-completion of design decisions already locked by CONTEXT.md.

## Commits

| Task | Description                                                                              | Hash      |
| ---- | ---------------------------------------------------------------------------------------- | --------- |
| 1 RED | test(07-04): add failing contract integration tests on create-ai                          | `dd595db` |
| 1 GREEN | feat(07-04): thread contract through runtime and populate usage on every RunResult     | `edf70d4` |
| 2     | feat(07-04): export contract factory and types from package root                          | `a55899c` |
| 3     | test(07-04): add Phase 7 end-to-end integration coverage                                  | `5ac9d63` |

All commits used `--no-verify` per the worktree directive.

## Deferred / Reserved for Downstream Plans

- **Phase 8 (tripwires)** will populate `usage` on tripwire-violated `RunFailure` return paths using the same `normalizeAdapterUsage(response)` pattern from this plan. The tripwire DSL declarations already ship as `InvariantDeclaration[]` on `CapabilityContract` per Plan 07-01.
- **Phase 9 (receipts)** canonicalizes `RunResult.usage` into the signed envelope. The `costUsd: null` vs `costUsd: 0` distinction this plan locked is exactly what receipts will need to surface "unmeasured" vs "free" / "refused" runs. The publicly-exported `evaluateContractAgainstRoute` is the contract-verdict reconstructor Phase 9 will call.
- **Phase 12 (lattice eval)** owns the fourth contract reject code (`contract-quality-floor`). Phase 7 leaves it reserved but never emitted.

## Verification Evidence

```
$ cd packages/lattice && pnpm typecheck
(exit 0, no output)

$ cd packages/lattice && pnpm vitest run
 Test Files  18 passed (18)
      Tests  110 passed (110)

$ cd packages/lattice && pnpm vitest run src/runtime/create-ai.test.ts
 Test Files  1 passed (1)
      Tests  12 passed (12)

$ cd packages/lattice && pnpm vitest run test/public-surface.test.ts
 Test Files  1 passed (1)
      Tests  4 passed (4)

$ cd packages/lattice && pnpm build
dist/index.js        72.34 kB
dist/index.d.ts      34.78 kB
Build complete in 588ms
```

Acceptance-grep evidence:

```
$ grep -n "readonly contract?: CapabilityContract" packages/lattice/src/runtime/create-ai.ts
79:  readonly contract?: CapabilityContract;

$ grep -n 'kind: "no-contract-match"' packages/lattice/src/runtime/create-ai.ts
158:            kind: "no-contract-match" as const,

$ grep -n "intent\.contract" packages/lattice/src/runtime/create-ai.ts
446:    ...(intent.contract !== undefined ? { contract: intent.contract } : {}),

$ grep -n "normalizeAdapterUsage" packages/lattice/src/runtime/create-ai.ts
306:            usage: normalizeAdapterUsage(response),
361:        usage: normalizeAdapterUsage(response),
705:function normalizeAdapterUsage(response: ProviderRunResponse): Usage {

$ grep -c "usage:" packages/lattice/src/runtime/create-ai.ts
6

$ grep -n "export { contract }" packages/lattice/src/index.ts
2:export { contract } from "./contract/contract.js";

$ grep -c 'describe("Phase 7' packages/lattice/src/runtime/create-ai.test.ts
2

$ grep -c "no-contract-match" packages/lattice/src/runtime/create-ai.test.ts
13
```

## Self-Check: PASSED

- `packages/lattice/src/runtime/create-ai.test.ts` — FOUND (115 + 147 = 262 lines, 12 tests across 2 describe blocks)
- `packages/lattice/test/public-surface.test.ts` — FOUND (4 tests)
- `packages/lattice/src/runtime/create-ai.ts` — modified, `RunIntent.contract?` + `no-contract-match` classifier + 4 usage-populated return sites + `normalizeAdapterUsage` helper present (grep verified)
- `packages/lattice/src/outputs/validate.ts` — modified, 2 return literals populate usage (grep verified)
- `packages/lattice/src/replay/replay.ts` — modified, 2 return literals populate usage via `envelopeUsage` helper (grep verified)
- `packages/lattice/src/index.ts` — modified, `contract` value export + 7 new type exports (grep verified)
- Commit `dd595db` (test RED Task 1) — FOUND in `git log`
- Commit `edf70d4` (feat GREEN Task 1) — FOUND in `git log`
- Commit `a55899c` (feat Task 2) — FOUND in `git log`
- Commit `5ac9d63` (test Task 3) — FOUND in `git log`
- `pnpm typecheck` from `packages/lattice` — exits 0 (0 errors; Plan 07-03's 7 deferred errors are now CLOSED)
- `pnpm vitest run` from `packages/lattice` — 110/110 passing, 0 regressions
- `pnpm vitest run test/public-surface.test.ts` — 4/4 passing
- `pnpm build` from `packages/lattice` — exits 0, generates `dist/index.js` (72 kB) and `dist/index.d.ts` (35 kB)

---
*Phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting*
*Plan: 04*
*Completed: 2026-05-11*
*Closes Phase 7. The runtime now enforces capability contracts end-to-end and every run reports normalized usage.*
