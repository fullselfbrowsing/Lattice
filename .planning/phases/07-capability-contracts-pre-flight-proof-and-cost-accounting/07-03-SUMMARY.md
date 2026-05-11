---
phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting
plan: 03
subsystem: results-and-provider-normalization
tags:
  - capability-contract
  - usage
  - cost-accounting
  - adapters
  - fake-provider
  - phase-7
dependency_graph:
  requires:
    - phase: 07-01
      provides: Usage shape (promptTokens, completionTokens, costUsd:number|null), ProviderPricingHint with per-1k fields
    - phase: 07-02
      provides: RouteRejectReason carries contract-* codes that NoContractMatchError surfaces
  provides:
    - NoContractMatchError variant on LatticeRunError (kind no-contract-match, noRouteReasons[])
    - RunSuccess.usage and RunFailure.usage required readonly fields
    - normalizeUsageToRunUsage helper mapping raw prompt_tokens/input_tokens/inputTokens variants to Usage
    - OpenAICompatibleProviderOptions.pricing optional constructor field (per-1k rates)
    - ProviderRunResponse.normalizedUsage optional field (additive, alongside legacy usage:UsageRecord)
    - FakeProviderOptions.capabilities optional override field
    - openai, openai-compat, ai-sdk, and fake adapters all emit normalizedUsage
  affects:
    - Plan 07-04 (runtime wiring) — must populate RunSuccess.usage and RunFailure.usage at every create-ai.ts return site (currently 7 tsc errors across create-ai.ts, validate.ts, replay.ts as designed)
    - Plan 07-04 (E1/E2 contract reject tests) — relies on FakeProviderOptions.capabilities to construct unpriced/restricted-privacy adapters without mutating readonly fields
    - Phase 9 (receipts) — RunResult.usage will be canonicalized into receipt envelopes
tech_stack:
  added: []
  patterns:
    - Additive ProviderRunResponse extension preserves backward compatibility (legacy usage:UsageRecord kept as @deprecated alongside new normalizedUsage:Usage)
    - normalizedUsage.costUsd: null when pricing unknown (matches the COST-01 unmeasured-vs-free distinction from 07-CONTEXT.md)
    - Fake provider default usage (0, 0, null) so callers always see a present Usage value
    - Capability-override option pattern (FakeProviderOptions.capabilities) avoids readonly-field mutation in downstream tests
key_files:
  created:
    - packages/lattice/src/results/errors.test.ts
    - packages/lattice/src/providers/adapters.test.ts
  modified:
    - packages/lattice/src/results/errors.ts
    - packages/lattice/src/results/result.ts
    - packages/lattice/src/providers/provider.ts
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/providers/fake.ts
decisions:
  - Made usage REQUIRED on both RunSuccess and RunFailure per CONTEXT.md, accepting the 7 expected tsc errors in create-ai.ts/validate.ts/replay.ts that Plan 07-04 will fix
  - Preserved the legacy ProviderRunResponse.usage:UsageRecord field (marked @deprecated) so v1.0 adapters and the existing normalizeUsage helper continue to compile and emit per-attempt usage records
  - Returned costUsd:null (not 0) when openai-compat pricing is undefined, matching the COST-01 unmeasured-vs-free decision and lining up with Plan 07-02's estimateRouteCost null behavior
  - normalizeUsageToRunUsage accepts three field-name variants (prompt_tokens/input_tokens/inputTokens and the symmetric output variants) so the same helper covers OpenAI Chat Completions, OpenAI Responses API, and AI SDK shapes
  - Kept createOpenAIProvider sharing OpenAICompatibleProviderOptions verbatim — pricing flows through the existing ...options spread without needing a separate type alias
  - Fake provider defaults to a deterministic { promptTokens: 0, completionTokens: 0, costUsd: null } but honors a user-provided normalizedUsage on options.response to preserve developer overrides
metrics:
  duration: ~6 minutes
  completed_date: "2026-05-11"
requirements:
  - CONTRACT-05
  - COST-01
  - COST-02
---

# Phase 07 Plan 03: Result usage shape, NoContractMatchError, and adapter normalization Summary

NoContractMatchError joins LatticeRunError, RunSuccess/RunFailure both require a Usage field, and openai/openai-compat/ai-sdk/fake adapters all emit a normalized Usage on their ProviderRunResponse with an opt-in pricing constructor field for openai-compat.

## What Shipped

### LatticeRunError additions (`packages/lattice/src/results/errors.ts`)

```typescript
export interface NoContractMatchError {
  readonly kind: "no-contract-match";
  readonly message: string;
  readonly noRouteReasons: readonly RouteRejectReason[];
}

export type LatticeRunError =
  | ValidationError
  | ExecutionUnavailableError
  | NoRouteError
  | ProviderExecutionError
  | TimeoutError
  | NoContractMatchError;
```

`noRouteReasons` carries the deterministic-router rejection list straight through from Plan 07-02 so Phase 9 receipts can re-verify the verdict without re-running the router.

### RunResult usage field (`packages/lattice/src/results/result.ts`)

```typescript
export interface RunSuccess<TOutputs extends OutputContractMap> {
  readonly ok: true;
  readonly outputs: InferOutputMap<TOutputs>;
  readonly artifacts: readonly ArtifactRef[];
  readonly usage: Usage;
  readonly plan: ResultPlan;
  readonly events?: readonly RunEvent[];
}

export interface RunFailure {
  readonly ok: false;
  readonly error: LatticeRunError;
  readonly usage: Usage;
  readonly raw?: unknown;
  readonly partialOutputs?: Record<string, unknown>;
  readonly plan: ResultPlan;
  readonly events?: readonly RunEvent[];
}
```

`usage` is REQUIRED on both branches (CONTEXT.md "usage is present on BOTH RunSuccess and RunFailure"). Plan 07-04 will populate it at every return site.

### ProviderRunResponse additive extension (`packages/lattice/src/providers/provider.ts`)

```typescript
export interface ProviderRunResponse {
  readonly rawOutputs: Record<string, unknown>;
  readonly artifactRefs?: readonly (ArtifactInput | ArtifactRef)[];
  /** @deprecated Legacy per-attempt usage — kept for backward compatibility */
  readonly usage?: UsageRecord;
  /** Phase 7 normalized usage for RunResult.usage */
  readonly normalizedUsage?: Usage;
  readonly rawResponse?: unknown;
}
```

Backward compatibility: the legacy `usage: UsageRecord` field is preserved (marked `@deprecated`) so the existing `normalizeUsage` helper and any v1.0 adapter that already emits a `UsageRecord` continues to compile and report per-attempt usage. Plan 07-04 will prefer `normalizedUsage` when wiring `RunResult.usage`.

### Adapter normalization (`packages/lattice/src/providers/adapters.ts`)

#### OpenAICompatibleProviderOptions gains pricing

```typescript
export interface OpenAICompatibleProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly fetch?: typeof fetch;
  readonly pricing?: {
    readonly inputPer1kTokens?: number;
    readonly outputPer1kTokens?: number;
  };
}
```

`createOpenAIProvider` inherits the new field automatically — it shares the same options type and already spreads `...options` into the delegated `createOpenAICompatibleProvider` call.

#### normalizeUsageToRunUsage field mapping

| Raw field name (any of)                                 | Normalized Usage field |
| ------------------------------------------------------- | ---------------------- |
| `prompt_tokens`, `input_tokens`, `inputTokens`          | `promptTokens`         |
| `completion_tokens`, `output_tokens`, `outputTokens`    | `completionTokens`     |

`costUsd` is computed as `(inputPer1kTokens * promptTokens + outputPer1kTokens * completionTokens) / 1000` when at least one pricing rate is supplied; otherwise it is `null` (NOT `0` — the COST-01 unmeasured-vs-free distinction).

#### AI SDK normalization

`createAISdkProvider` wraps the user-supplied `generate` and synthesizes `normalizedUsage` from the legacy `UsageRecord` returned by the SDK:

```typescript
const normalizedUsage: Usage = {
  promptTokens: response.usage?.inputTokens ?? 0,
  completionTokens: response.usage?.outputTokens ?? 0,
  costUsd: null,
};
```

`costUsd` is `null` because AI SDK consumers typically use a gateway (LiteLLM, OpenRouter) whose pricing Lattice cannot statically know; pricing comes in via the openai-compat adapter when needed.

### Fake provider extensions (`packages/lattice/src/providers/fake.ts`)

```typescript
export interface FakeProviderOptions {
  // ...existing fields...
  readonly capabilities?: readonly ModelCapability[];
}
```

Two behaviors added:

1. `capabilities` option REPLACES the default single-capability array when supplied. Lets Plan 07-04's modality/privacy reject tests build fakes with arbitrary modality/privacy/pricing without mutating readonly adapter fields.
2. Every `execute()` return path includes `normalizedUsage: { promptTokens: 0, completionTokens: 0, costUsd: null }`. When `options.response` is a user-provided value or function, the override is injected only if the user didn't already supply `normalizedUsage` (preserving developer control).

## Tests

| File                                                    | Suite                                       | Count |
| ------------------------------------------------------- | ------------------------------------------- | ----- |
| `packages/lattice/src/results/errors.test.ts`           | `Phase 7 LatticeRunError additions`         | 5     |
| `packages/lattice/src/providers/adapters.test.ts`       | `Phase 7 adapter usage normalization`       | 7     |
| **New tests this plan**                                 |                                             | **+12** |
| **Full suite after plan**                               |                                             | 94    |

Plan called for 5 + 6 = 11; the executor added one extra adapter test (`openai-compat handles input_tokens/output_tokens variant`) to cover the OpenAI Responses API field-name variant that the helper now explicitly supports. All 7 adapter tests fall within the same TDD `<behavior>` block (Test 3 of the plan called for input_tokens; the executor preserved the missing/empty-usage test from Test 4 separately, giving 4 openai-compat permutations + 1 openai-with-pricing + 1 ai-sdk + 1 fake = 7).

## Test counts and regression check

```
$ cd packages/lattice && pnpm test src/results/errors.test.ts src/providers/adapters.test.ts
 Test Files  2 passed (2)
      Tests  12 passed (12)

$ cd packages/lattice && pnpm test
 Test Files  16 passed (16)
      Tests  94 passed (94)
```

Was 82/82 before Plan 03; +12 new tests, zero regressions.

## Expected TypeScript Failure (Deferred to Plan 07-04)

`pnpm tsc --noEmit` from `packages/lattice` exits with **7 errors** across 3 files:

| File                              | Errors | Cause                                                                            |
| --------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `src/runtime/create-ai.ts`        | 4      | `RunSuccess`/`RunFailure` literals constructed without `usage` at no-route, execution-unavailable, provider-execution, and success branches |
| `src/outputs/validate.ts`         | 2      | Validation-failure and validation-success literals built without `usage`         |
| `src/replay/replay.ts`            | 2      | Replay execution-unavailable and replay-success literals built without `usage`   |

This is **expected and intentional** per the plan's `<done>` block: "TSC will fail across the whole package because runtime/create-ai.ts has not been updated — that is Plan 04's responsibility." Plan 07-04 will:

1. Populate `usage` at every `RunSuccess`/`RunFailure` return site in `runtime/create-ai.ts`.
2. Wire the `no-contract-match` classification (detect `contract-*` codes in `noRouteReasons` and emit `NoContractMatchError` instead of generic `no_route`).
3. Replicate the same fix in `outputs/validate.ts` (validation failures get `usage: { 0, 0, null }`) and `replay/replay.ts` (replay reconstructs the persisted usage from the envelope).

All 16 vitest test files pass — the 7 tsc errors do NOT cause vitest failures because vitest does not type-check production source by default.

## Pricing Constants

No catalog pricing constants were chosen in this plan. Plan 07-01 set `defaultCapabilityForProvider`'s pricing to `{ inputPer1kTokens: 0, outputPer1kTokens: 0 }` as a placeholder. Realistic per-model rates are a Plan 07-04 / Phase 9 concern when receipts begin to surface live cost data. The fake provider deliberately reports `costUsd: null` so phase-7 tests cannot accidentally lock in a pricing assumption.

## Commits

| Task | Description                                                                       | Hash      |
| ---- | --------------------------------------------------------------------------------- | --------- |
| 1 RED | test(07-03): add failing RunResult usage and NoContractMatchError tests          | `933fcf6` |
| 1 GREEN | feat(07-03): add NoContractMatchError and require usage on RunResult           | `2d54b5c` |
| 2 RED | test(07-03): add failing adapter usage normalization tests                        | `37b2832` |
| 2 GREEN | feat(07-03): normalize adapter usage and add openai-compat pricing option       | `6340c33` |

All commits used `--no-verify` per the worktree directive.

## Requirements Coverage

| ID         | Coverage                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| CONTRACT-05 | `NoContractMatchError` is a typed member of `LatticeRunError`. Runtime emission is Plan 07-04's job.                                          |
| COST-01    | `usage: Usage` is REQUIRED on both `RunSuccess` and `RunFailure`. Population is Plan 07-04's job; the type contract ships now.                |
| COST-02    | `createOpenAIProvider`, `createOpenAICompatibleProvider`, `createAISdkProvider`, and `createFakeProvider` each emit `normalizedUsage`.        |

## Deviations from Plan

### Auto-fixed / Additive

**1. [Rule 2 - Strengthened test coverage] Added `openai-compat input_tokens/output_tokens` variant test**

- **Found during:** Task 2 RED authoring
- **Issue:** The plan's behavior block listed both `input_tokens` handling (Test 3) and missing-usage handling (Test 4) as separate behaviors of the same adapter. The executor implemented both as distinct test cases (rather than collapsing them) so the field-mapping table in this SUMMARY can point at a passing test for every raw-field variant the helper claims to support.
- **Fix:** 7 adapters.test.ts cases instead of 6 (still within the original `<behavior>` block).
- **Files modified:** `packages/lattice/src/providers/adapters.test.ts`
- **Commit:** `37b2832`

No bugs found, no architectural changes needed, no authentication gates encountered. The plan was tightly locked and the action blocks were followable verbatim.

## Deferred / Reserved for Downstream Plans

- **Plan 07-04** populates `RunSuccess.usage` / `RunFailure.usage` at every return site in `runtime/create-ai.ts`, `outputs/validate.ts`, and `replay/replay.ts`; wires `contract-*` reject-code detection into the `NoContractMatchError` emission path; adds the `contract` value export and `RunIntent.contract?` field on the public API.
- **Phase 9 (receipts)** canonicalizes `RunResult.usage` into the signed receipt envelope. The `costUsd: null` vs `costUsd: 0` distinction this plan preserves is exactly what receipts will need to surface "unmeasured" runs.
- **Phase 12 (lattice eval)** will be the first consumer of pricing-driven `costUsd` numbers in CI gates; today the openai-compat adapter accepts caller-supplied rates but no catalog default ships.

## Self-Check: PASSED

- `packages/lattice/src/results/errors.test.ts` — FOUND
- `packages/lattice/src/providers/adapters.test.ts` — FOUND
- `packages/lattice/src/results/errors.ts` — modified, `NoContractMatchError` interface + union member (grep verified, 3 matches)
- `packages/lattice/src/results/result.ts` — modified, `readonly usage: Usage` present on both RunSuccess and RunFailure (grep verified, 2 matches)
- `packages/lattice/src/providers/provider.ts` — modified, `normalizedUsage?: Usage` added to ProviderRunResponse
- `packages/lattice/src/providers/adapters.ts` — modified, `pricing?:` on options + `normalizeUsageToRunUsage` helper + 3 normalizedUsage emission sites + legacy `normalizeUsage` preserved (grep verified, all 5 acceptance regex matches)
- `packages/lattice/src/providers/fake.ts` — modified, `capabilities?: readonly ModelCapability[]` option + `options.capabilities` consumed + `costUsd: null` default (grep verified, all 4 acceptance matches)
- Commit `933fcf6` (test RED Task 1) — FOUND in `git log`
- Commit `2d54b5c` (feat GREEN Task 1) — FOUND in `git log`
- Commit `37b2832` (test RED Task 2) — FOUND in `git log`
- Commit `6340c33` (feat GREEN Task 2) — FOUND in `git log`
- `pnpm test src/results/errors.test.ts src/providers/adapters.test.ts` — 12/12 passing
- `pnpm test` — 94/94 passing, 0 regressions
- `pnpm tsc --noEmit` — 7 errors in 3 files (create-ai.ts, validate.ts, replay.ts), ALL due to missing `usage` literal field; EXPECTED and deferred to Plan 07-04 per the plan's `<done>` block

---
*Phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting*
*Plan: 03*
*Completed: 2026-05-11*
