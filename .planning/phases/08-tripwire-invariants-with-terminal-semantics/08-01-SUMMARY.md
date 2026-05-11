---
phase: 08-tripwire-invariants-with-terminal-semantics
plan: 01
subsystem: lattice/contract
tags:
  - tripwire
  - invariants
  - pii
  - pure-kernel
  - phase-8
requirements:
  - TRIP-01
  - TRIP-04
dependency-graph:
  requires:
    - phase-7/CapabilityContract.invariants field
    - phase-7/contract() factory
    - "@standard-schema/spec StandardSchemaV1"
  provides:
    - inv fluent builder (mustCite, fieldFromTable, noPII, matches)
    - InvariantDeclaration discriminated union
    - evaluateTripwires pure function
    - TripwireEvidence and TripwireResult types
    - defaultPiiDetectors with Luhn-validated credit cards
    - internal path resolver (dotted, [N], [*])
  affects:
    - phase-8/plan-02 (runtime wiring will consume evaluateTripwires)
    - phase-9 (receipt canonicalization against the new union)
    - phase-12 (eval gate tripwires-as-scorers reuses evaluateTripwires)
tech-stack:
  added: []
  patterns:
    - "frozen value pattern (Object.freeze on builder return values)"
    - "discriminated union over kind discriminant"
    - "pure-function evaluator (no I/O, no Date.now, no random)"
    - "test-only resets via __doubleUnderscore exports"
key-files:
  created:
    - packages/lattice/src/contract/pii-detectors.ts
    - packages/lattice/src/contract/pii-detectors.test.ts
    - packages/lattice/src/contract/invariants.ts
    - packages/lattice/src/contract/invariants.test.ts
    - packages/lattice/src/contract/tripwire.ts
    - packages/lattice/src/contract/tripwire.test.ts
  modified:
    - packages/lattice/src/contract/contract.ts
    - packages/lattice/src/contract/index.ts
    - packages/lattice/src/contract/contract.test.ts
    - packages/lattice/src/runtime/public-types.test.ts
    - packages/lattice/test/public-surface.test.ts
decisions:
  - "Reshaped InvariantDeclaration from Phase 7 placeholder ({ kind: 'policy' | 'semantic' | 'schema' }) into a discriminated union over four kinds (must-cite, field-from-table, no-pii, matches). Phase 7 never populated invariants, so impact is type-level only."
  - "Counter for auto-id generation is monotonic across kinds and process-wide. Test-only reset via inv.__resetCounterForTests()."
  - "Citations payload located by scanning top-level 'citations' or 'evidence' keys for an array; path field of must-cite evidence records the located key."
  - "Path resolver wildcard [*] materializes the array of resolutions. T-08-03 accepts O(N^k) for deeply nested wildcard chains in v1.1."
  - "Public package surface (packages/lattice/src/index.ts) NOT yet exporting tripwire types — that lands in Plan 02 with runtime wiring."
metrics:
  duration: "approximately 6 minutes"
  completed: "2026-05-11"
  tests-added: 51
  total-tests-after: 161
  phase-7-baseline: 110
---

# Phase 8 Plan 1: Tripwire Pure Kernel Summary

Ship the pure tripwire kernel — the `inv` fluent builder, the four-detector `defaultPiiDetectors` regex list with Luhn validation, the `evaluateTripwires` pure evaluator, the `TripwireEvidence` shape, and the path-traversal helper. Plan 02 will surface these through `packages/lattice/src/index.ts` and wire them into `runWithConfig`.

## What Shipped

### Public-from-Contract-Barrel Exports

From `packages/lattice/src/contract/index.ts`:

- **Values:** `contract`, `inv`, `defaultPiiDetectors`, `evaluateTripwires`, `estimateRouteCost`, `evaluateContractAgainstRoute`
- **Types:** `BudgetInvariant`, `CapabilityContract`, `CapabilityContractInput`, `ContractRejectReasonCode`, `InvariantDeclaration`, `QualityFloorInvariant`, `FieldFromTableInvariant`, `MatchesInvariant`, `MustCiteInvariant`, `NoPiiInvariant`, `InvariantOptions`, `PiiDetector`, `PiiDetectorResult`, `TripwireEvidence`, `TripwireResult`, `ContractPreflightResult`, `EstimateRouteCostInput`, `EvaluateContractInput`

The `inv` builder produces frozen `InvariantDeclaration` values. Each call increments a process-wide monotonic counter (`must-cite-1`, `field-from-table-2`, `no-pii-3`, `matches-4`); callers can override via `options.id`. The fluent surface is:

```ts
inv.mustCite("artifact-1");                            // MustCiteInvariant
inv.fieldFromTable("action.kind", ["create"]);         // FieldFromTableInvariant
inv.noPII("output.text");                              // NoPiiInvariant
inv.matches("payload", standardSchema);                // MatchesInvariant<T>
```

`evaluateTripwires(output, invariants, detectors?)` is a pure async function. It evaluates invariants in declaration order and returns `{ ok: true }` on pass or `{ ok: false, evidence }` on the FIRST violation. Subsequent invariants are not evaluated. When `detectors` is omitted, `defaultPiiDetectors` is used.

`TripwireEvidence` shape:

```ts
interface TripwireEvidence {
  readonly invariantId: string;
  readonly kind: "must-cite" | "field-from-table" | "no-pii" | "matches";
  readonly path: string;
  readonly observed: unknown;
  readonly message: string;
}
```

For `no-pii`, `observed` carries ONLY `{ detector: string, substring: string }` — never the full input. This is the T-08-01 redaction invariant that Phase 9 receipts will sign.

### InvariantDeclaration Reshape (Type-Breaking, Practically Additive)

Phase 7 declared a placeholder:

```ts
// REMOVED
export interface InvariantDeclaration {
  readonly id: string;
  readonly kind: "policy" | "semantic" | "schema";
  readonly description?: string;
}
```

Phase 8 replaces it with a discriminated union:

```ts
export type InvariantDeclaration =
  | MustCiteInvariant
  | FieldFromTableInvariant
  | NoPiiInvariant
  | MatchesInvariant;
```

Phase 7 never populated `contract().invariants` (per 07-04-SUMMARY decisions), so no production caller relied on the old shape. Three Phase 7 test files referenced the old placeholder literals; all updated to the new must-cite shape:
- `packages/lattice/src/contract/contract.test.ts`
- `packages/lattice/src/runtime/public-types.test.ts`
- `packages/lattice/test/public-surface.test.ts`

Phase 9 receipt canonicalization will key off the new discriminant.

### Path Resolver

Internal-only helper in `tripwire.ts`. Supports:
- dotted: `a.b.c`
- bracket-indexed: `a[0].b`
- wildcard: `a[*].b` (materializes the array of resolutions)

~85 LOC including the tokenizer and walker, zero dependencies. Returns `undefined` for missing paths (never throws). Test-exported as `__resolvePathForTests` so unit tests cover dotted, indexed, wildcard, missing, and empty-path cases.

### PII Detectors

Four detectors in deterministic order:

| Detector | Regex/Logic | Notes |
|----------|-------------|-------|
| `email` | `/[\w.+-]+@[\w-]+\.[\w.-]+/` | Requires both local + domain + TLD |
| `us-ssn` | `/\b\d{3}-\d{2}-\d{4}\b/` | Word-bounded 3-2-4 grouped |
| `credit-card` | `/\b(?:\d[ -]?){13,19}\b/` + Luhn | Luhn rejects `4111 1111 1111 1112`, accepts `4111 1111 1111 1111` |
| `us-phone` | `/\b\d{3}-\d{3}-\d{4}\b|\(\d{3}\)\s?\d{3}-\d{4}/` | Matches dashed and parenthesized forms |

Luhn helper is private to `pii-detectors.ts`. Rejects sequences outside the ISO/IEC 7812 PAN range (13-19 digits) per Pitfall #5 in 08-CONTEXT.md.

## Tests Added

| File | Tests |
|------|-------|
| `packages/lattice/src/contract/pii-detectors.test.ts` | 18 |
| `packages/lattice/src/contract/invariants.test.ts` | 10 |
| `packages/lattice/src/contract/tripwire.test.ts` | 23 |
| **Subtotal new** | **51** |
| Phase 7 baseline (unchanged) | 110 |
| **Total after Plan 08-01** | **161** |

All 21 test files green; `pnpm typecheck` exits 0. Zero Phase 7 regressions.

## Verification

- `cd packages/lattice && pnpm exec vitest run src/contract/` → 67 tests pass across 5 files (PII + invariants + tripwire + contract + preflight).
- `cd packages/lattice && pnpm exec vitest run` → 161 tests pass across 21 files.
- `cd packages/lattice && pnpm typecheck` → exit 0.
- `grep -n "export const inv" packages/lattice/src/contract/invariants.ts` → finds the builder.
- `grep -n "export async function evaluateTripwires" packages/lattice/src/contract/tripwire.ts` → finds the evaluator (note: `async` because `matches` schemas may return Promises).
- `grep -n "defaultPiiDetectors" packages/lattice/src/contract/pii-detectors.ts` → finds the detector list.
- `grep -n "kind: \"must-cite\"" packages/lattice/src/contract/invariants.ts` → finds the discriminant literal.

## Threat Model Mitigations Applied

| Threat ID | Mitigation in code | Test that asserts it |
|-----------|--------------------|--------------------|
| T-08-01 (info disclosure) | `evaluateNoPii` builds `observed: { detector, substring }` — never copies the full input. | `tripwire.test.ts` Test 12: `JSON.stringify(evidence.observed)` does not contain surrounding input text. |
| T-08-02 (tampering / false positives) | Credit card detector calls `luhn(trimmed)` before reporting match. | `pii-detectors.test.ts` Test 14: `4111 1111 1111 1112` not matched. |
| T-08-04 (repudiation / non-determinism) | Evaluator is a pure async function; no `Date.now`, no `Math.random`, no I/O. | `tripwire.test.ts` Test 23: two evaluations of `(output, invariants)` are deep-equal. |

T-08-03 (path resolver wildcard allocation) and T-08-05 (matches schema injection) are documented `accept` dispositions per the threat register.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Phase 7 tests referenced the old InvariantDeclaration placeholder shape**

- **Found during:** Task 2 typecheck
- **Issue:** Three Phase 7 test files (`contract.test.ts`, `public-types.test.ts`, `public-surface.test.ts`) literally constructed `{ id: "x", kind: "policy" }` against the old placeholder union. After reshaping `InvariantDeclaration`, `pnpm typecheck` failed with TS2322 / TS2344 errors.
- **Fix:** Updated each literal to the new `{ id, kind: "must-cite", artifactName }` shape, and updated the `InvariantDeclaration["kind"]` `expectTypeOf` assertion in `public-types.test.ts` to the new four-value union. No behavior changed — these tests already asserted "declaration is preserved" without depending on the specific kind value.
- **Files modified:** `packages/lattice/src/contract/contract.test.ts`, `packages/lattice/src/runtime/public-types.test.ts`, `packages/lattice/test/public-surface.test.ts`
- **Commit:** `c2c8a0b` (folded into Task 2 GREEN commit so the diff is atomic with the reshape)

### Implementation Choices Surfaced

- `evaluateTripwires` is declared `async` (not synchronous as the plan's example sketched), because `matches` invariants may receive Standard Schemas whose `validate` returns a Promise. The plan's verification example used `await`-style usage so this aligns with intent.
- The path-resolver tokenizer is a tiny state machine rather than a regex split, to handle `[N]` / `[*]` segments embedded inside dotted paths without escaping pitfalls. Kept at ~85 LOC.

## Forward Links to Plan 02

Plan 02 (runtime wiring, Wave 2) will:

1. Surface from `packages/lattice/src/index.ts`:
   - `inv`, `evaluateTripwires`, `defaultPiiDetectors`
   - Types: `TripwireEvidence`, `TripwireResult`, `InvariantDeclaration` (already exported via Phase 7), `MustCiteInvariant`, `FieldFromTableInvariant`, `NoPiiInvariant`, `MatchesInvariant`, `PiiDetector`
2. Add `"tripwire"` to `ExecutionStageKind` in `packages/lattice/src/plan/plan.ts`.
3. Add `TripwireViolationError` variant + `isTerminal` predicate to `packages/lattice/src/results/errors.ts`.
4. Wire `evaluateTripwires` into `runWithConfig` after `validateOutputMap` succeeds and before `RunSuccess` returns. On violation, return a `RunFailure` carrying the evidence and the cost-so-far in `usage`.
5. Make the fallback chain in `runWithConfig` consult `isTerminal()` before any retry.

The kernel ships in this plan as a pure function specifically so Phase 12's eval gate can import `evaluateTripwires` directly without dragging in runtime concerns — that forward-compat hook is locked.

## Commits

| # | Hash | Type | Subject |
|---|------|------|---------|
| 1 | `2dcaf1c` | test | add failing tests for defaultPiiDetectors |
| 2 | `e63a242` | feat | implement defaultPiiDetectors with Luhn-validated credit cards |
| 3 | `913d30d` | test | add failing tests for inv fluent builder |
| 4 | `c2c8a0b` | feat | implement inv fluent builder and reshape InvariantDeclaration |
| 5 | `ac214a2` | test | add failing tests for evaluateTripwires and path resolver |
| 6 | `f256d9e` | feat | implement evaluateTripwires pure kernel and path resolver |

## Self-Check: PASSED

All 7 expected files exist on disk:
- `packages/lattice/src/contract/pii-detectors.ts`
- `packages/lattice/src/contract/pii-detectors.test.ts`
- `packages/lattice/src/contract/invariants.ts`
- `packages/lattice/src/contract/invariants.test.ts`
- `packages/lattice/src/contract/tripwire.ts`
- `packages/lattice/src/contract/tripwire.test.ts`
- `.planning/phases/08-tripwire-invariants-with-terminal-semantics/08-01-SUMMARY.md`

All 6 commit hashes are reachable on the current branch:
- `2dcaf1c`, `e63a242`, `913d30d`, `c2c8a0b`, `ac214a2`, `f256d9e`

