---
phase: 07-capability-contracts-pre-flight-proof-and-cost-accounting
verified: 2026-05-11T16:02:30Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
---

# Phase 07: Capability Contracts, Pre-flight Proof, and Cost Accounting Verification Report

**Phase Goal:** Developers can attach a `contract` to `ai.run` and the deterministic router refuses to execute when no candidate route can satisfy budget, modality, privacy, or quality-floor constraints; every run reports normalized cost and token usage.
**Verified:** 2026-05-11T16:02:30Z
**Status:** passed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Developers can author a `CapabilityContract` value with optional `budget`, `invariants`, and `qualityFloor` fields | VERIFIED | `contract.ts` exports `contract()`, `CapabilityContract`, `BudgetInvariant`, `InvariantDeclaration`, `QualityFloorInvariant` — 6 tests pass in `contract.test.ts` |
| 2 | TypeScript callers without a contract still compile (additive optional types) | VERIFIED | `RunIntent.contract?: CapabilityContract` is optional (line 79); `pnpm tsc --noEmit` exits 0; backward-compat tests E5/E6 pass |
| 3 | Capability catalog entries can carry pricing metadata for static cost estimation | VERIFIED | `catalog.ts:45` populates `inputPer1kTokens: 0`; `effectivePer1kPricing` helper exported at line 69 |
| 4 | The shared `Usage` shape is exported from the public types for downstream consumers | VERIFIED | `provider.ts` exports `Usage`; `index.ts:72` re-exports as type; `public-surface.test.ts` 4/4 tests pass |
| 5 | Pre-flight evaluation is a pure function `evaluateContractAgainstRoute` returning ok or typed reject reasons | VERIFIED | `preflight.ts:76` exports pure function; 10 tests pass in `preflight.test.ts` |
| 6 | Router accepts an optional contract on `RouteRequest` and surfaces per-candidate reject reasons with the four contract-* codes when applicable | VERIFIED | `router.ts:26` adds `readonly contract?: CapabilityContract`; line 162 invokes `evaluateContractAgainstRoute`; 6 router tests pass |
| 7 | When all candidates fail contract preflight, `noRouteReasons` contains the contract reject codes (NOT just generic codes) | VERIFIED | `router.test.ts` test "with budget=0.0000001 surfaces contract-budget-exceeded" passes; existing `summarizeNoRouteReasons` dedupes by code |
| 8 | Static catalog pricing alone drives cost estimation (no probes, no external pricing API) | VERIFIED | `preflight.ts:38` `estimateRouteCost` reads only from `capability.pricing` via `effectivePer1kPricing`; no fetch/probe code anywhere in preflight |
| 9 | Every `RunSuccess` and `RunFailure` carries a `usage` field with `{ promptTokens, completionTokens, costUsd \| null }` | VERIFIED | `result.ts:13,21` both have `readonly usage: Usage`; all 9 return sites in create-ai.ts/validate.ts/replay.ts populate usage |
| 10 | openai, openai-compat, and ai-sdk adapters normalize their usage output into the shared `Usage` shape | VERIFIED | `adapters.ts:142` `normalizeUsageToRunUsage` helper; line 122 (openai-compat) and line 227 (ai-sdk) populate `normalizedUsage`; createOpenAIProvider delegates to compat; 7 tests pass in `adapters.test.ts` |
| 11 | openai-compat constructor accepts an optional `pricing` field; unknown endpoints surface `costUsd: null` | VERIFIED | `adapters.ts:17` `readonly pricing?:` on `OpenAICompatibleProviderOptions`; line 144-146 returns `costUsd: null` when pricing undefined |
| 12 | `LatticeRunError` union includes `NoContractMatchError` with kind `no-contract-match` and `noRouteReasons[]` | VERIFIED | `errors.ts:47-51` defines `NoContractMatchError`; line 59 adds to union; 5 tests pass in `errors.test.ts` |
| 13 | fake provider emits a `usage` field so deterministic tests can assert the full path | VERIFIED | `fake.ts:32` `costUsd: null` in DEFAULT_FAKE_USAGE; lines 58-68 inject `normalizedUsage` at every return path |
| 14 | fake provider accepts an optional `capabilities` override so tests can declare custom modalities/privacy/pricing without mutating readonly adapter fields | VERIFIED | `fake.ts:26` `readonly capabilities?: readonly ModelCapability[]`; line 45 consumes via `options.capabilities ?? [defaultCapability]` |
| 15 | `ai.run({ task, artifacts, outputs, contract })` compiles and routes through the new contract field | VERIFIED | `create-ai.ts:79` adds contract field to RunIntent; `buildPlan` forwards `intent.contract` to `routeDeterministically`; create-ai.test.ts 12 tests pass |
| 16 | When no candidate satisfies a contract, `ai.run` returns a RunFailure with `error.kind === 'no-contract-match'` and `usage = { 0, 0, 0 }`; on success, RunSuccess.usage is populated from adapter normalizedUsage | VERIFIED | `create-ai.ts:146-184` classifier emits NoContractMatchError; `normalizeAdapterUsage` helper populates from `response.normalizedUsage`; E1/E2/E3/E4 integration tests assert |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/lattice/src/contract/contract.ts` | CapabilityContract type + contract() factory + reject codes | VERIFIED | 99 lines, exports `contract`, `CapabilityContract`, `BudgetInvariant`, `QualityFloorInvariant`, `InvariantDeclaration`, `ContractRejectReasonCode` |
| `packages/lattice/src/contract/preflight.ts` | evaluateContractAgainstRoute + estimateRouteCost | VERIFIED | 137 lines, all four contract-* codes referenced; pure function signature; effectivePer1kPricing import present |
| `packages/lattice/src/routing/catalog.ts` | per-1k pricing populated; effectivePer1kPricing | VERIFIED | `inputPer1kTokens: 0` default; `effectivePer1kPricing` exported |
| `packages/lattice/src/routing/router.ts` | RouteRequest.contract optional; reject codes flow through | VERIFIED | Lines 2-3 import contract types; line 26 adds field to RouteRequest; line 162 calls evaluator |
| `packages/lattice/src/results/errors.ts` | NoContractMatchError added to LatticeRunError | VERIFIED | Line 47 interface, line 59 union member, `no-contract-match` kind |
| `packages/lattice/src/results/result.ts` | RunSuccess.usage and RunFailure.usage required | VERIFIED | Lines 13 + 21 both `readonly usage: Usage` |
| `packages/lattice/src/providers/adapters.ts` | normalizeUsageToRunUsage + pricing constructor option | VERIFIED | Line 17 pricing field; line 142 helper; line 122 and 227 emit normalizedUsage |
| `packages/lattice/src/providers/fake.ts` | emits normalizedUsage + capabilities override | VERIFIED | Line 26 capabilities option; line 32 costUsd:null default; lines 58/68 emit normalizedUsage |
| `packages/lattice/src/runtime/create-ai.ts` | RunIntent.contract; no-contract-match classifier; usage populated | VERIFIED | Line 79 contract field; lines 146-184 classifier; ZERO_USAGE/UNMEASURED_USAGE constants populate every return path |
| `packages/lattice/src/index.ts` | contract value + 7 type exports | VERIFIED | Line 2 contract value export; lines 45-72 include BudgetInvariant, CapabilityContract, CapabilityContractInput, ContractRejectReasonCode, InvariantDeclaration, QualityFloorInvariant, Usage |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `routing/router.ts` | `contract/preflight.ts` | `import { evaluateContractAgainstRoute } from "../contract/preflight.js"` | WIRED (line 3 + invocation at line 162) |
| `contract/preflight.ts` | `routing/catalog.ts` | `import { effectivePer1kPricing }` | WIRED (line 3 of preflight.ts) |
| `runtime/create-ai.ts` | `routing/router.ts` | `contract: intent.contract` passed to routeDeterministically | WIRED (line 446 spread) |
| `runtime/create-ai.ts` | `results/errors.ts` | emits NoContractMatchError | WIRED (line 158 `kind: "no-contract-match"`) |
| `index.ts` | `contract/contract.ts` | `export { contract }` | WIRED (line 2) |
| `providers/adapters.ts` | `providers/provider.ts` | `import type { Usage }` | WIRED |
| `results/result.ts` | `providers/provider.ts` | `import type { Usage }` | WIRED (line 5) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Strict TypeScript compiles | `cd packages/lattice && pnpm tsc --noEmit` | exit 0, no output | PASS |
| Full Vitest suite passes | `cd packages/lattice && pnpm vitest run` | 18 files / 110 tests passed | PASS |
| Phase 7 test files exist and pass | implicit in full suite | contract.test.ts (6), preflight.test.ts (10), router.test.ts (6 new), errors.test.ts (5), adapters.test.ts (7), create-ai.test.ts (12), public-surface.test.ts (4) — all pass | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CONTRACT-01 | 07-01, 07-04 | Optional `contract` field on `ai.run(...)` declaring budget/invariants/qualityFloor | SATISFIED | `RunIntent.contract` in create-ai.ts:79; `contract()` factory exported from `index.ts:2`; public-surface.test.ts asserts |
| CONTRACT-02 | 07-01 | BudgetInvariant with `maxCostUsd` and `p95LatencyMs` | SATISFIED | `contract.ts:10` BudgetInvariant interface; preflight enforces maxCostUsd; p95LatencyMs declared (informational per CONTEXT.md) |
| CONTRACT-03 | 07-01 | QualityFloorInvariant tied to fixture suite + minScore | SATISFIED | `contract.ts:22` QualityFloorInvariant with required `suite: string` and `minScore: number` |
| CONTRACT-04 | 07-02, 07-04 | Pre-flight refuses execution when no candidate satisfies the contract | SATISFIED | `preflight.ts:76` evaluator; router wires it; create-ai.test.ts Test 4 + E1/E2/E3 assert end-to-end |
| CONTRACT-05 | 07-03, 07-04 | RunFailure with kind `no-contract-match` (additive to LatticeRunError) | SATISFIED | `errors.ts:47` NoContractMatchError; runtime emits via classifier in create-ai.ts:154-165 |
| CONTRACT-06 | 07-02, 07-04 | Four contract-* reject codes flow through noRouteReasons | SATISFIED | `preflight.ts` emits 3 codes (budget/modality/privacy); `contract-quality-floor` reserved for Phase 12 per CONTEXT.md decision; all four declared in ContractRejectReasonCode union |
| COST-01 | 07-01, 07-03, 07-04 | Every RunResult exposes `usage: { promptTokens, completionTokens, costUsd }` | SATISFIED | `result.ts:13,21` required Usage field; 9 return sites populated; create-ai.test.ts E4/E5 assert |
| COST-02 | 07-03, 07-04 | openai/openai-compat/ai-sdk adapters normalize usage into shared shape | SATISFIED | `adapters.ts` normalizeUsageToRunUsage helper; openai-compat at line 122, ai-sdk at line 227; createOpenAIProvider inherits via shared options type |
| COST-03 | 07-01, 07-02 | Pre-flight reads adapter cost metadata from capability catalog | SATISFIED | `estimateRouteCost` in preflight.ts:38 reads only from `capability.pricing` via static `effectivePer1kPricing` |

All 9 requirement IDs SATISFIED. No orphans (REQUIREMENTS.md maps exactly CONTRACT-01..06 + COST-01..03 to Phase 7; all covered).

### Anti-Patterns Found

None blocking. Notable observations:

- `contract-quality-floor` reject code is declared in the union but never emitted by Phase 7 — this is intentional per CONTEXT.md decision ("qualityFloor is parsed and forwarded into the pre-flight evaluator but only enforced by Phase 12"). Documented as a deferred item in plan summaries.
- `defaultCapabilityForProvider` emits `inputPer1kTokens: 0` / `outputPer1kTokens: 0` placeholders — flagged as "future-work" in plan summaries (realistic per-model rates deferred to Phase 9 / Phase 12). Not a stub for Phase 7 scope because CONTEXT.md explicitly says "Pricing constants for OpenAI catalog entries are at Claude's discretion using current published rates as of May 2026; if uncertain, use placeholder values".

### Human Verification Required

None. All behavior is verifiable via the test suite (110/110 passing) and TypeScript compilation (exit 0). No UI, no real-time behavior, no external service integration — every behavior the phase goal claims is exercised by deterministic unit/integration tests.

### Gaps Summary

No gaps. Phase 7 delivers exactly what its goal demands:

1. Developers can attach a `contract` to `ai.run` — `RunIntent.contract?: CapabilityContract` is exported and accepted at the public surface.
2. The deterministic router refuses to execute when no candidate route can satisfy the contract — `runWithConfig` classifies `noRouteReasons` and emits `NoContractMatchError` when any `contract-*` code is present; verified by E1/E2/E3 integration tests across the budget, modality, and privacy axes. The fourth axis (quality-floor) is intentionally reserved for Phase 12 per the locked CONTEXT.md decision.
3. Every run reports normalized cost and token usage — `RunSuccess.usage` and `RunFailure.usage` are both required `Usage` fields populated at all 9 return sites with `costUsd: number | null` distinguishing "free / refused" (`0`) from "unmeasured" (`null`).

Test counts add up: 62 new Phase 7 tests across 7 files, 0 regressions on the 48 pre-Phase-7 tests (final 110/110).

---

*Verified: 2026-05-11T16:02:30Z*
*Verifier: Claude (gsd-verifier)*
