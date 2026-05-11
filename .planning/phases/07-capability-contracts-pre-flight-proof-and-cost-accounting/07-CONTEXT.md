# Phase 7: Capability Contracts, Pre-flight Proof, and Cost Accounting - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can attach a `contract` to `ai.run` and the deterministic router refuses to execute when no candidate route can satisfy budget, modality, privacy, or quality-floor constraints; every run reports normalized cost and token usage. Scope is the contract carrier shape (additive, no breaking changes), the pre-flight proof against the existing capability catalog, and uniform `usage` reporting across the three v1.0 adapter families.

Out of scope for Phase 7: tripwire DSL (Phase 8), receipt issuance/signing (Phase 9), replay envelope integration (Phase 10), CLI surfaces (Phase 11), eval gates (Phase 12).
</domain>

<decisions>
## Implementation Decisions

### Contract API Surface
- `contract` is a top-level optional field on `RunIntent` (the argument to `ai.run`), NOT nested inside `policy`.
- `contract` is OPTIONAL. v1.0 callers compile and run unchanged. PROJECT.md explicitly rejects mandatory contracts.
- Contract shape is an object literal with three optional sub-fields: `{ budget?, invariants?, qualityFloor? }`. Phase 7 only implements `budget` and `qualityFloor`; `invariants[]` is reserved for Phase 8 tripwire wiring (declared in the type but not evaluated yet).
- `qualityFloor` is `{ suite: string, minScore: number }` where `suite` is a fixture-directory path string and `minScore` is in 0-1. In Phase 7, `qualityFloor` is parsed and forwarded into the pre-flight evaluator but only enforced by Phase 12's `lattice eval` — pre-flight rejects only on the `capability` side (quality-floor invariant pertains to model class).

### Pre-flight Rejection Behavior
- Reject reasons extend the existing `noRouteReasons` union with new codes: `contract-budget-exceeded`, `contract-quality-floor`, `contract-modality-missing`, `contract-privacy-mismatch`.
- When no candidate satisfies the contract, the runtime returns a typed `RunFailure` with kind `no-contract-match` (additive to `LatticeRunError`). The result carries the full `noRouteReasons[]` per candidate.
- Cost estimation uses STATIC catalog metadata only (no provider dry-run probe, no external pricing API). Deterministic and fast.
- Pre-flight surfaces ALL failed candidates with per-candidate rejection reasons (not first-failing only).
- Pre-flight budget is the minimum-cost route. Retry budget headroom is handled later by the existing fallback chain (no double-counting in Phase 7).

### Cost Normalization & Usage
- Cost unit is `costUsd: number` (USD with up to 6 decimal places). Phase 7 stores this as a JS number; Phase 9 will constrain receipts to I-JSON (string or integer micro-units) — that conversion lives in Phase 9.
- Pricing data lives in capability catalog entries as `{ inputPer1kTokens, outputPer1kTokens }` USD constants. No external config file, env var, or runtime fetch.
- `openai-compat` adapters accept pricing in constructor options (caller-supplied). For unpriced endpoints, `usage.costUsd` falls back to `null` rather than failing routing — pre-flight budget invariants reject `null`-cost routes when a budget is declared.
- `usage` is present on BOTH `RunSuccess` and `RunFailure`. Failure results expose what was spent before abort. `no-contract-match` results carry `usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 }` since pre-flight refused execution.

### Claude's Discretion
- Exact file layout under `packages/lattice/src/contract/` is at Claude's discretion (likely `contract.ts` for types + factory and `preflight.ts` for evaluator).
- Pricing constants for OpenAI catalog entries are at Claude's discretion using current published rates as of May 2026; if uncertain, use placeholder values with a TODO and a unit test on the field shape rather than the values.
- Internal naming of the new public types (`CapabilityContract`, `BudgetInvariant`, `QualityFloorInvariant`, `NoContractMatchResult`) is at Claude's discretion as long as they are exported via the public index.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/routing/router.ts` — deterministic router with hard filters, scoring, fallback chains, no-route results. Extend `RouteRequest` with optional `contract?` and add new entries to `noRouteReasons`.
- `packages/lattice/src/routing/catalog.ts` — capability catalog. Extend catalog entries with `inputPer1kTokens` / `outputPer1kTokens` pricing.
- `packages/lattice/src/policy/policy.ts` — policy contracts. Do NOT nest `contract` inside policy; keep separate.
- `packages/lattice/src/results/{result.ts,errors.ts}` — typed `RunResult` union. Extend with optional `usage` and new `no-contract-match` failure variant.
- `packages/lattice/src/runtime/create-ai.ts` — runtime facade. Single integration point at the "no route selected" branch where `noRouteReasons` is classified into `no-contract-match` vs `no-route`.
- `packages/lattice/src/providers/{adapters.ts,packaging.ts}` — provider adapter factories. Each adapter's `execute()` returns usage; normalize into the shared `RunResult.usage` shape.

### Established Patterns
- Standard Schema validation already plumbed through `outputs/validate.ts` — reuse the pattern for any internal contract-shape validation if needed.
- Provider adapters return their own usage shapes; the runtime is responsible for normalization.
- `LatticeRunError` is an additive tagged union — add `no-contract-match` as a new variant.
- All public types exported via `packages/lattice/src/index.ts`; new contract types must be exported there.

### Integration Points
- `RunIntent` type: add optional `contract?: CapabilityContract`.
- `RouteRequest`: add optional `contract?: CapabilityContract` to flow through the router.
- `noRouteReasons` union: add `contract-budget-exceeded`, `contract-quality-floor`, `contract-modality-missing`, `contract-privacy-mismatch`.
- `LatticeRunError`: add `NoContractMatchError` variant with `noRouteReasons[]`.
- `RunSuccess` and `RunFailure`: add required `usage: { promptTokens, completionTokens, costUsd }` (costUsd nullable).
- Capability catalog entries: add `inputPer1kTokens?`, `outputPer1kTokens?` fields.
- `openai-compat` adapter factory: accept `pricing?: { inputPer1kTokens, outputPer1kTokens }` in constructor.
</code_context>

<specifics>
## Specific Ideas

- Pre-flight evaluator should be a pure function `evaluateContractAgainstRoute(contract, candidate, catalog) -> { ok: true } | { ok: false, reasons: ContractRejectReason[] }` so Phase 9 receipts can re-use the same evaluator deterministically.
- Cost estimation is `(promptTokens_estimate * inputPer1kTokens + completionTokens_estimate * outputPer1kTokens) / 1000`. Token estimation uses a conservative upper bound (artifact byte size / 4 + 256 output tokens) — exact estimation is deferred.
- `usage.costUsd` is `null` (not `0`) when pricing is unknown so that downstream regression gates can distinguish "free" from "unmeasured".
</specifics>

<deferred>
## Deferred Ideas

- Per-candidate rejection-reason detail beyond the basic taxonomy (deferred to v1.2 per REQUIREMENTS.md Future Requirements section).
- Content-addressed contract identity / contract hashing (deferred to v1.2).
- Tripwire `invariants[]` evaluation — declared in the contract type in Phase 7 but only evaluated in Phase 8.
- `costAtAbort` vs `costAtSuccess` split (deferred to v1.2).
- Provider dry-run cost probes and external pricing APIs — explicitly NOT in v1.1.
</deferred>
