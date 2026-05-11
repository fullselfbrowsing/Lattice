---
phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting
plan: 01
subsystem: contract-types
tags:
  - capability-contract
  - usage
  - pricing
  - types
  - phase-7
dependency_graph:
  requires:
    - packages/lattice/src/providers/provider.ts (CapabilityModality, ProviderPricingHint base)
    - packages/lattice/src/runtime/public-types.ts (aggregator surface)
  provides:
    - CapabilityContract type family (BudgetInvariant, QualityFloorInvariant, InvariantDeclaration)
    - contract() factory (frozen, exact-optional safe)
    - ContractRejectReasonCode closed four-value union
    - Usage normalized result-layer shape (promptTokens, completionTokens, costUsd: number | null)
    - ProviderPricingHint extended with inputPer1kTokens / outputPer1kTokens (additive)
    - effectivePer1kPricing helper (legacy per-1M -> per-1k conversion with preference for explicit)
  affects:
    - Plan 07-02 (pre-flight evaluator) — consumes CapabilityContract, ContractRejectReasonCode, effectivePer1kPricing
    - Plan 07-03 (adapter normalization) — consumes Usage
    - Plan 07-04 (runtime wiring) — re-exports contract value via src/index.ts
tech_stack:
  added: []
  patterns:
    - Frozen factory return values (mirrors output() pattern) for Phase 9 canonicalization safety
    - Exact-optional spread (no `field: undefined` properties under exactOptionalPropertyTypes)
    - Type-only re-export through runtime/public-types.ts aggregator
key_files:
  created:
    - packages/lattice/src/contract/contract.ts
    - packages/lattice/src/contract/index.ts
    - packages/lattice/src/contract/contract.test.ts
    - packages/lattice/src/providers/provider.test.ts
    - packages/lattice/src/runtime/public-types.test.ts
  modified:
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/routing/catalog.ts
    - packages/lattice/src/runtime/public-types.ts
decisions:
  - Used Object.freeze on factory output and nested objects so Phase 9 canonicalizer can rely on structural immutability without defensive cloning
  - Marked legacy ProviderPricingHint.inputCostPer1M / outputCostPer1M as @deprecated rather than removing — keeps every v1.0 caller compiling
  - effectivePer1kPricing returns undefined (not 0) when pricing is absent so the Phase 7 cost-normalization decision (`null` for unmeasured) is preserved
  - Added CapabilityContract.requiredModalities and requiredPrivacy as a Claude's-discretion extension because the locked taxonomy includes contract-modality-missing / contract-privacy-mismatch but CONTEXT.md did not name the carrier field
metrics:
  duration: ~9 minutes
  completed_date: "2026-05-11"
requirements:
  - CONTRACT-01
  - CONTRACT-02
  - CONTRACT-03
  - COST-01
  - COST-03
---

# Phase 07 Plan 01: Capability Contract type spine, Usage shape, and per-1k pricing Summary

CapabilityContract type family, contract() factory, normalized Usage shape, and per-1k catalog pricing land as a purely additive type spine so Plans 07-02/03/04 can implement against fixed shapes.

## What Shipped

### CapabilityContract type family (`packages/lattice/src/contract/contract.ts`)

Exact public signatures added:

```typescript
export interface BudgetInvariant {
  readonly maxCostUsd?: number;
  readonly p95LatencyMs?: number;
}

export interface QualityFloorInvariant {
  readonly suite: string;
  readonly minScore: number;
}

export interface InvariantDeclaration {
  readonly id: string;
  readonly kind: "policy" | "semantic" | "schema";
  readonly description?: string;
}

export interface CapabilityContract {
  readonly kind: "capability-contract";
  readonly budget?: BudgetInvariant;
  readonly invariants?: readonly InvariantDeclaration[];
  readonly qualityFloor?: QualityFloorInvariant;
  readonly requiredModalities?: readonly CapabilityModality[];
  readonly requiredPrivacy?: "standard" | "sensitive" | "restricted";
}

export interface CapabilityContractInput {
  readonly budget?: BudgetInvariant;
  readonly invariants?: readonly InvariantDeclaration[];
  readonly qualityFloor?: QualityFloorInvariant;
  readonly requiredModalities?: readonly CapabilityModality[];
  readonly requiredPrivacy?: "standard" | "sensitive" | "restricted";
}

export type ContractRejectReasonCode =
  | "contract-budget-exceeded"
  | "contract-quality-floor"
  | "contract-modality-missing"
  | "contract-privacy-mismatch";

export function contract(input: CapabilityContractInput = {}): CapabilityContract;
```

Re-exported wholesale via `packages/lattice/src/contract/index.ts` and (type-only) via `packages/lattice/src/runtime/public-types.ts`. The runtime value export through `src/index.ts` is deferred to Plan 07-04 per the locked plan ordering.

### Normalized Usage shape (`packages/lattice/src/providers/provider.ts`)

```typescript
export interface Usage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number | null;
}
```

`costUsd` is `number | null` (not optional) so downstream gates can distinguish "free / zero" from "unmeasured" — the locked CONTEXT.md cost decision. `Usage` is distinct from the existing `UsageRecord` on `ProviderAttemptRecord`; both will coexist in Plan 07-03.

### Per-1k catalog pricing (`packages/lattice/src/providers/provider.ts`, `packages/lattice/src/routing/catalog.ts`)

```typescript
export interface ProviderPricingHint {
  /** @deprecated prefer `inputPer1kTokens` — kept for backward compatibility */
  readonly inputCostPer1M?: number;
  /** @deprecated prefer `outputPer1kTokens` — kept for backward compatibility */
  readonly outputCostPer1M?: number;
  readonly inputPer1kTokens?: number;
  readonly outputPer1kTokens?: number;
}

export function effectivePer1kPricing(
  pricing: ProviderPricingHint | undefined,
): {
  readonly inputPer1kTokens: number | undefined;
  readonly outputPer1kTokens: number | undefined;
};
```

`defaultCapabilityForProvider` now emits `{ inputPer1kTokens: 0, outputPer1kTokens: 0 }` alongside the legacy per-1M fields, so every existing catalog entry carries the Phase 7 surface without breaking v1.0 callers.

## Backward Compatibility

`ProviderPricingHint` extension preserved backward compatibility (yes):

- `grep -n "inputCostPer1M" packages/lattice/src/providers/provider.ts` returns matches (legacy fields preserved as `@deprecated`).
- `grep -n "inputPer1kTokens" packages/lattice/src/providers/provider.ts` returns matches (new fields, both optional).
- `pnpm tsc --noEmit` exits 0 from `packages/lattice` with zero errors.
- Full Vitest suite: 12 files / 66 tests pass (was 9 / 48 before; +3 new test files / +18 new tests, 0 regressions).

## Tests

| File                                                   | Suite                              | Count |
| ------------------------------------------------------ | ---------------------------------- | ----- |
| `packages/lattice/src/contract/contract.test.ts`       | `contract() factory`               | 6     |
| `packages/lattice/src/providers/provider.test.ts`      | `Phase 7 pricing + Usage`          | 6     |
| `packages/lattice/src/runtime/public-types.test.ts`    | `Phase 7 public type exports`      | 6     |
| **Total new tests**                                    |                                    | **18**|

Note: The plan called for `+4` tests in `provider.test.ts` and `6` in `public-types.test.ts`; the executor added two extra cases to `provider.test.ts` (`effectivePer1kPricing returns undefined for unknown pricing` and `ProviderPricingHint accepts both legacy and new fields`) to cover the `undefined` branch of the helper and the additive-extension guarantee. All extra tests are within the scope of the same TDD `<behavior>` block and strengthen the contract.

## Requirements Coverage

| ID         | Coverage                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------- |
| CONTRACT-01 | `CapabilityContract` type + `contract()` factory in `contract/contract.ts`                |
| CONTRACT-02 | `BudgetInvariant` carries `maxCostUsd` and `p95LatencyMs` (informational in Phase 7)      |
| CONTRACT-03 | `QualityFloorInvariant` with required `suite: string` and `minScore: number`              |
| COST-01    | `Usage` shape exported with `promptTokens`, `completionTokens`, `costUsd: number \| null` |
| COST-03    | Catalog entries carry per-1k pricing; `effectivePer1kPricing` helper added                |

## Deviations from Plan

### Auto-fixed / Additive

**1. [Rule 2 - Critical functionality] `effectivePer1kPricing` exported, not internal-only**

- **Found during:** Task 2
- **Issue:** The plan said "do not export yet — internal helper" but immediately below provided `export function effectivePer1kPricing(...)`. The export keyword was clearly intended — Plan 07-02 explicitly lists it under "Plan 02 can import `effectivePer1kPricing` from this plan's exports."
- **Fix:** Exported the helper as written in the action block. Comment in the plan body was treated as stale.
- **Files modified:** `packages/lattice/src/routing/catalog.ts`
- **Commit:** `4e2dbf0`

**2. [Rule 2 - Strengthened test coverage] Two extra test cases in `provider.test.ts`**

- **Found during:** Task 2
- **Issue:** `effectivePer1kPricing` has an `undefined` branch and a "both fields absent on a defined pricing object" branch that the four prescribed tests did not cover. `ProviderPricingHint` additive extension also benefits from an explicit `{}` and "all four fields populated" type-check.
- **Fix:** Added 2 extra tests so the suite is 6 instead of 4. All within the original `Phase 7 pricing + Usage` describe block.
- **Files modified:** `packages/lattice/src/providers/provider.test.ts`
- **Commit:** `4e2dbf0`

No bugs found, no architectural changes needed, no authentication gates encountered. The plan was already locked tightly — these are purely test-coverage strengthenings.

## Deferred / Reserved for Downstream Plans

- **Plan 07-02** wires `CapabilityContract` and `ContractRejectReasonCode` into the deterministic router and adds the pre-flight evaluator.
- **Plan 07-03** wires `Usage` through each provider adapter and surfaces it on `RunResult`.
- **Plan 07-04** adds the `contract` value export to `packages/lattice/src/index.ts` and the `RunIntent.contract?` field on `runtime/create-ai.ts`. This plan deliberately did NOT touch `create-ai.ts` or `index.ts` to keep the surface purely additive at the type layer.
- **Phase 8** evaluates `invariants[]` declarations — the type carrier ships now, the runtime is intentionally out of scope.
- **Phase 12** enforces `qualityFloor` via `lattice eval`. Phase 7 only forwards the declaration into the pre-flight evaluator (Plan 07-02).

## Commits

| Task | Description                                                                          | Hash      |
| ---- | ------------------------------------------------------------------------------------ | --------- |
| 1    | feat(07-01): add CapabilityContract types and contract() factory                      | `29c84ed` |
| 2    | feat(07-01): add per-1k pricing fields and normalized Usage shape                     | `4e2dbf0` |
| 3    | feat(07-01): export contract and Usage types from public-types aggregator             | `6b962a3` |

## Verification Evidence

```
$ cd packages/lattice && pnpm tsc --noEmit
(exit 0, no output)

$ cd packages/lattice && pnpm vitest run
 Test Files  12 passed (12)
      Tests  66 passed (66)

$ cd packages/lattice && pnpm vitest run src/contract src/providers/provider.test.ts src/runtime/public-types.test.ts
 Test Files  3 passed (3)
      Tests  18 passed (18)
```

## Self-Check: PASSED

- `packages/lattice/src/contract/contract.ts` — FOUND
- `packages/lattice/src/contract/index.ts` — FOUND
- `packages/lattice/src/contract/contract.test.ts` — FOUND
- `packages/lattice/src/providers/provider.test.ts` — FOUND
- `packages/lattice/src/runtime/public-types.test.ts` — FOUND
- `packages/lattice/src/providers/provider.ts` — modified, `Usage` and per-1k fields present (grep verified)
- `packages/lattice/src/routing/catalog.ts` — modified, `effectivePer1kPricing` exported (grep verified)
- `packages/lattice/src/runtime/public-types.ts` — modified, contract types and `Usage` re-exported (grep verified)
- Commit `29c84ed` — FOUND in `git log`
- Commit `4e2dbf0` — FOUND in `git log`
- Commit `6b962a3` — FOUND in `git log`
- `pnpm tsc --noEmit` from `packages/lattice` — exits 0
- `pnpm vitest run` from `packages/lattice` — 66/66 passing
