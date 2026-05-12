---
phase: 08-tripwire-invariants-with-terminal-semantics
verified: 2026-05-11T16:31:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 8: Tripwire Invariants with Terminal Semantics - Verification Report

**Phase Goal:** Developers can declare semantic/policy invariants on a contract using a fluent Standard Schema builder, the runtime evaluates them post-execution as a distinct plan stage, and violations are typed terminal failures that the fallback chain refuses to retry.

**Verified:** 2026-05-11T16:31:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developer can call inv.mustCite/fieldFromTable/noPII/matches and receive an InvariantDeclaration | VERIFIED | `packages/lattice/src/contract/invariants.ts:74-121` - all four helpers exported on `inv` const; each returns frozen discriminated-union variant |
| 2 | Each invariant declaration carries a stable id (auto or supplied) and discriminant kind | VERIFIED | `invariants.ts:53-56` nextId helper; ids `must-cite-N` etc with `options.id` override |
| 3 | Pure function evaluateTripwires returns {ok:true} on pass and {ok:false,evidence} on first violation | VERIFIED | `packages/lattice/src/contract/tripwire.ts:53-63` - iterates declaration order, returns first failure |
| 4 | Default PII detectors flag email, US SSN, Luhn credit card, US phone with redacted substring evidence | VERIFIED | `packages/lattice/src/contract/pii-detectors.ts:62-119` - four detectors in deterministic order; Luhn validator at lines 34-54 |
| 5 | Path resolver handles dotted, [N], and [*] segments without external deps | VERIFIED | `tripwire.ts:222-299` - tokenize() + walk(); zero imports beyond local types |
| 6 | Runtime evaluates tripwires AFTER schema validation succeeds and BEFORE success returns | VERIFIED | `packages/lattice/src/runtime/create-ai.ts:316-381` - inside `validation.ok === true` branch, before success return |
| 7 | Tripwire violation produces RunFailure with kind=tripwire-violated, invariantId, evidence, terminal:true | VERIFIED | `create-ai.ts:367-380` - returns RunFailure with all required fields; `results/errors.ts:64-70` defines type |
| 8 | Fallback chain refuses to retry on tripwire violation (no advance to second route) | VERIFIED | `create-ai.ts:367-379` - early return short-circuits the `for` loop; integration test T2 asserts attempts.length===1 |
| 9 | RunFailure.usage on tripwire-violated carries normalized provider usage (not zero) | VERIFIED | `create-ai.ts:376` - `usage: normalizeAdapterUsage(response)`; integration test T3 asserts exact value |
| 10 | "tripwire" ExecutionStageKind sits between validation and persistence with status reported | VERIFIED | `packages/lattice/src/plan/plan.ts:17-27` (union member); `plan.ts:333-338` (default stage emission between validation and persistence) |
| 11 | Public surface exports inv, evaluateTripwires, isTerminal, and Phase 8 types | VERIFIED | `packages/lattice/src/index.ts:3,9,11` (values); lines 54,57,58,61-63,67,68,83-85 (types) |

**Score:** 11/11 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/lattice/src/contract/pii-detectors.ts` | defaultPiiDetectors + PiiDetector type | VERIFIED | 119 lines; exports `PiiDetector`, `PiiDetectorResult`, `defaultPiiDetectors` (4 detectors) |
| `packages/lattice/src/contract/invariants.ts` | inv fluent builder + InvariantDeclaration union | VERIFIED | 122 lines; exports `inv` and all variant types as discriminated union |
| `packages/lattice/src/contract/tripwire.ts` | evaluateTripwires + TripwireEvidence + path resolver | VERIFIED | 309 lines; pure async evaluator + path resolver |
| `packages/lattice/src/results/errors.ts` | TripwireViolationError variant on LatticeRunError + isTerminal | VERIFIED | `TripwireViolationError` interface lines 64-70 with `terminal: true`; `isTerminal` lines 95-97 |
| `packages/lattice/src/plan/plan.ts` | "tripwire" ExecutionStageKind + default stage | VERIFIED | Union at line 25; stage entry at lines 333-338 |
| `packages/lattice/src/runtime/create-ai.ts` | Tripwire eval block + isTerminal-aware fallback gate | VERIFIED | Eval block lines 316-381; early-return short-circuit on violation |
| `packages/lattice/src/index.ts` | Public exports for inv, evaluateTripwires, isTerminal + types | VERIFIED | All required value + type exports present |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `create-ai.ts` | `contract/tripwire.ts` | `import { evaluateTripwires }` + invocation | WIRED - import line 4, call line 326 |
| `create-ai.ts` | `results/errors.ts` | Returns RunFailure with `kind: "tripwire-violated"` and `terminal: true` (isTerminal carries union-level knowledge) | WIRED - return shape lines 367-380 |
| `plan.ts` | `create-ai.ts` | `markStage(..., "tripwire", ...)` calls during success/failure paths | WIRED - markStage("tripwire","failed") line 345-347; markStage("tripwire","completed"|"skipped") line 403-404 |
| `contract/tripwire.ts` | `contract/pii-detectors.ts` | `import { defaultPiiDetectors }` for no-pii kind | WIRED - import line 10, used as default arg line 56 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|-------------------|--------|
| `create-ai.ts` tripwire block | `tripwireResult` | `evaluateTripwires(validatedSuccess.outputs, invariants)` | Yes - validated provider outputs flow through real evaluator | FLOWING |
| `create-ai.ts` tripwire block | `usage` on violation | `normalizeAdapterUsage(response)` | Yes - cost-so-far from actual provider response | FLOWING |
| `create-ai.ts` tripwire block | `evidence` on violation | `tripwireResult.evidence` from evaluator | Yes - real evidence with redacted substring for no-pii | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles cleanly | `cd packages/lattice && pnpm tsc --noEmit` | Exit 0, zero errors | PASS |
| Full test suite passes | `cd packages/lattice && pnpm vitest run` | 22 test files / 189 tests passed | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TRIP-01 | 08-01 | Fluent builder inv.mustCite/fieldFromTable/noPII/matches with Standard Schema | SATISFIED | `invariants.ts:74-121` + tests in `invariants.test.ts` (10 tests) |
| TRIP-02 | 08-02 | Runtime evaluates tripwires post-execution as stage between validation and result return | SATISFIED | `create-ai.ts:316-381` (eval block in success branch) + `plan.ts:333-338` (stage placement) |
| TRIP-03 | 08-02 | Tripwire violations are terminal:true and not retried by fallback chain | SATISFIED | `errors.ts:64-70` (terminal:true) + `errors.ts:95-97` (isTerminal) + early-return in `create-ai.ts:367-379` + integration test T2 |
| TRIP-04 | 08-01, 08-02 | Tripwire violation returns RunFailure with kind=tripwire-violated, invariantId, evidence | SATISFIED | `create-ai.ts:367-380` (failure return) + `errors.ts:64-70` (type) + `tripwire.ts:25-31` (evidence shape) |
| TRIP-05 | 08-02 | "tripwire" ExecutionStageKind added for inspectability | SATISFIED | `plan.ts:25` (union member) + `plan.ts:333-338` (default stage) + create-ai markStage chain |

No orphaned requirements - all five TRIP IDs are claimed and satisfied.

### Anti-Patterns Found

No anti-patterns flagged. Spot-checked the modified files:
- `tripwire.ts`: No TODO/FIXME/placeholder; exhaustiveness guard at line 82 throws on unknown invariant kind (legitimate); empty `return { ok: true }` is correct (semantic success result, not stub return).
- `create-ai.ts` tripwire block (lines 316-381): No placeholders; all returns carry real provider data; `terminal: true as const` is structural, not stub.
- `invariants.ts`: `__resetCounterForTests` is intentionally test-only and documented.
- `pii-detectors.ts`: No anti-patterns; zero deps, regex+Luhn-only.

### Human Verification Required

None. All behaviors are verifiable via the automated test suite (189 passing tests) and TypeScript compilation. The phase produces pure functions, type definitions, and runtime wiring that are exercised end-to-end by integration tests in `create-ai.test.ts` (T1-T8) and public-surface tests.

### Gaps Summary

No gaps. All 11 observable truths verified, all 7 artifacts present and substantive, all 4 key links wired, all 5 requirements satisfied, no blocking anti-patterns, typecheck and full vitest suite (189 tests) green.

The phase goal is achieved end-to-end:
1. The fluent `inv` builder ships with four helpers returning frozen discriminated-union variants.
2. The pure `evaluateTripwires` kernel evaluates invariants in declaration order with first-violation-aborts semantics and redacted PII evidence.
3. The runtime wires the kernel into `runWithConfig` after schema validation succeeds and before the success return.
4. Violations early-return a `TripwireViolationError` with `terminal: true`, populated `usage`, and full evidence; the early return structurally prevents fallback retry.
5. The `"tripwire"` `ExecutionStageKind` is observable on `result.plan.stages` with completed/failed/skipped status.
6. Public surface exports cover all required values and type names; `dist/index.d.ts` (per 08-02 summary grep) contains every Phase 8 type name.

---

_Verified: 2026-05-11T16:31:00Z_
_Verifier: Claude (gsd-verifier)_
