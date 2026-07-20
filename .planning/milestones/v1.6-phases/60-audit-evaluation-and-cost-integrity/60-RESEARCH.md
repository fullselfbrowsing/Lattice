# Phase 60: Audit, Evaluation, and Cost Integrity - Research

**Researched:** 2026-07-16
**Confidence:** HIGH

## Executive Summary

Phase 60 is a convergence change, not a new subsystem. The repository already has
a standards-compliant receipt issuer, typed run failures, complete per-fixture eval
walking, normalized pricing in contract preflight, provider usage records, and
agent/crew budget structures. The integrity gaps come from orchestration paths that
bypass those primitives or apply different failure semantics.

Three corrections are required:

1. Introduce one receipt issuance policy/outcome helper and route capability runs,
   checkpoints, agents, crews, and explicit external audits through it.
2. Preserve every invalid eval row, count it, give invalid input exit code 2 priority,
   and prohibit baseline writes when the count is nonzero.
3. Promote pricing normalization into a structured shared estimator and remove all
   pre-execution formulas that bypass it.

No new dependency is warranted. Vitest and fast-check cover the policy, fault, unit,
property, and cross-surface matrices.

## Repository Findings

### Receipt policy is implicit and inconsistent

`LatticeConfig.signer` is the only single-shot switch. Its documentation promises a
receipt when configured, but `maybeIssueReceipt` catches every failure and returns
`undefined`. That is compatible best-effort behavior but cannot express an audit
guarantee.

The agent loop accepts `intent.signer`, auto-registers a checkpoint hook, and invokes
the hook after every completed/denied iteration. The hook catches signer errors and
puts the raw message in tracer metadata. It returns `void`, so the agent cannot
distinguish successful issuance from required-mode failure without a new outcome
channel. Phase 61 will collect envelopes; Phase 60 only needs a safe strict failure
signal now.

Crew execution has the opposite behavior: root and completion receipts call
`createReceipt` directly. Root signer failure throws before provider work; parent or
child completion failure can throw after billed work. Neither path returns the typed
agent/crew failure promised by the integrity requirement.

The explicit external-execution audit helper requires a signer and always returns a
receipt, making it semantically required already, but it also calls `createReceipt`
directly and exposes raw signer failure behavior. It should use the same required
outcome helper without changing its successful return shape.

### Terminal runtime evidence can preserve post-provider facts

The single-shot runtime has terminal issuance calls for plan/preparation failure, no
route, fallback preparation failure, provider persistence failure, validation,
tripwire, provider failure, and success. A shared helper can replace each call without
restructuring provider execution.

`RunFailure` already supports `usage`, `partialOutputs`, `artifacts`, `plan`, `events`,
and gateway metadata. A typed `AuditError` can therefore preserve post-provider facts
and return terminally without retry. The current fallback loop must stop immediately
when required signing fails; signer faults are audit failures, not provider faults.

A preflight check at the start of `runWithConfig`, `runAgentInternal`, and
`runAgentCrew` guarantees required mode without an effective signer reaches no
adapter. An execution-plan stub is sufficient for the single-shot early failure.

### Evaluation already aggregates but classifies invalid rows as neutral

`runEvalSession` walks receipts and sidecars to completion. Walker errors, missing
sidecars, materialization exceptions, verification failures, replay failures, and
missing output hashes become `FixtureReport { verdict: "load-failed" }`. The report
then counts only matches as passed and drift/regression as regressed. Because the CLI
uses only `summary.regressed`, an all-invalid run exits 0.

`--init-baseline` compounds the defect by skipping load-failed rows and writing the
remaining valid subset. The writer itself is atomic on disk, but the selected data is
not atomic with respect to fixture validity.

The runner also collapses every materialization exception to `verify-failed`, even
though `materializeReplayEnvelope` already exposes `verify-failed`,
`artifact-load-failed`, and `envelope-malformed`. Extending the bounded row taxonomy
preserves each failure stage without exposing file content or receipt payloads.

The correct precedence is:

```text
loadFailed > 0  -> exit 2, emit complete report, never write baseline
regressed > 0   -> exit 1
otherwise       -> exit 0
```

Session-wide keyset, baseline, or directory failures that prevent enumeration can
retain the existing single `FAIL` line and exit 2.

### Pricing has one correct helper and several bypasses

`ProviderPricingHint` supports preferred `inputPer1kTokens` and
`outputPer1kTokens`, plus deprecated per-million fields. `effectivePer1kPricing`
correctly prefers modern fields and converts legacy values. Contract preflight calls
that helper through `estimateRouteCost` and returns `null` for wholly unknown pricing.

`routing/router.ts` independently reads only the deprecated per-million fields. A
capability with modern pricing is therefore:

- assigned no route `costUsd`,
- treated as zero for cost scoring,
- allowed through route `maxCostUsd`, but
- priced and potentially rejected by contract preflight.

That directly violates PRICE-01..03.

Provider usage normalizers in the generic adapters, Anthropic, and Gemini repeat the
per-thousand arithmetic. These are post-execution paths, but sharing the same kernel
prevents a second unit/partial-pricing definition. Provider-reported `costUsd` should
win when present; configured static pricing can estimate cost only when the response
does not report one.

The agent loop checks only accumulated reported cost. It can execute the first or next
iteration without estimating the impending call, and unknown cost bypasses its hard
budget. The selected provider exposes capabilities and pricing sufficient for a
bounded next-iteration estimate using the same token estimator/output projection as
routing. Crew children inherit remaining budgets, so the same agent preflight closes
both single-agent and crew calls; crew accounting still uses actual normalized usage
after execution.

### Unknown, zero, and partial price need an explicit result

A scalar `number | null` is enough for compatibility but not diagnostics. A structured
estimate should record:

- normalized input/output rates,
- input/output token counts,
- per-side cost when known,
- total cost only when every nonzero dimension is priced,
- source (`per-1k`, `legacy-per-1m`, `mixed`, or `unknown`), and
- a stable estimator version.

Rules:

- Explicit modern rate wins per side over legacy rate.
- A zero rate is known and produces zero cost.
- A missing rate for zero tokens does not make the total unknown.
- A missing rate for a nonzero token dimension makes total cost unknown.
- Exact `totalCostUsd === maxCostUsd` passes; only overage rejects.
- A hard ceiling rejects unknown in both route policy and contract preflight.
- Without a ceiling, unknown routes remain eligible but are not scored as known-free.

Execution plans can carry the structured result additively while retaining the legacy
scalar field for compatible readers.

## Recommended Architecture

### `receipts/policy.ts`

Own:

- `ReceiptIssuanceMode = "off" | "best-effort" | "required"`;
- effective mode/signer resolution;
- missing-signer preflight;
- `issued | skipped | failed` outcomes;
- stable audit error code/stage and safe message;
- optional bounded diagnostic callback data.

Do not expose raw caught causes. Low-level `createReceipt` stays available for callers
who explicitly mint evidence; orchestrators use the policy helper.

### `routing/cost.ts`

Own:

- per-side hint normalization and precedence;
- structured estimate construction;
- usage cost filling when pricing is configured;
- unknown/zero predicates and stable version/source;
- compatibility scalar wrapper consumed by `estimateRouteCost`.

Decision code remains local: router, contract, agent, and crew apply their own budget
types but consume the identical structured estimate.

### Eval report boundary

Keep the runner exhaustive and the command authoritative for exit/baseline behavior.
The runner returns `summary.loadFailed`; the command defensively derives it from rows
for injected/older test reports, emits the final report with the selected exit code,
and checks invalidity before constructing or writing a baseline.

## Threat Model

| Ref | Threat | Severity | Required mitigation |
|---|---|---:|---|
| T-60-01 | Required mode returns success without a receipt | Critical | preflight missing signer; required failed outcome replaces underlying result |
| T-60-02 | Post-provider signer fault activates fallback or repeats work | Critical | receipt issuance is terminal finalization outside provider retry classification |
| T-60-03 | Signer exception leaks KMS/provider/key details | High | stable code/stage/message only; reject raw cause in result/event/trace tests |
| T-60-04 | Runtime, agent, checkpoint, crew, and external audit disagree | High | one normalized policy/outcome helper and cross-surface matrix |
| T-60-05 | Invalid eval fixtures yield exit 0 | Critical | aggregate loadFailed with exit precedence 2 |
| T-60-06 | Baseline init overwrites evidence with a valid subset | Critical | check aggregate before writer; existing file unchanged fault test |
| T-60-07 | Router treats modern or unknown pricing as free | High | shared structured estimate; known/unknown scoring distinction |
| T-60-08 | Route and contract hard budgets disagree | High | same estimate and unknown rule; property matrix over hints/tokens/bounds |
| T-60-09 | Agent/crew executes a call whose estimate already exceeds budget | High | shared next-call preflight before every transport call |
| T-60-10 | Post-execution billed cost is replaced by a local estimate | Medium | provider-reported cost wins; estimate provenance remains explicit |

## Validation Architecture

Use focused tests after each task and reserve the complete package/CLI/build/type gate
for the final plan.

Receipt feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/policy.test.ts src/runtime/create-ai.test.ts src/contract/checkpoint.test.ts src/agent/runtime.test.ts src/agent/crew/run-crew.test.ts`

Eval feedback:

`pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/eval-runner.test.ts test/eval.test.ts`

Cost feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/routing/cost.test.ts src/routing/router.test.ts src/contract/preflight.test.ts src/agent/infra/cost-tracker.test.ts`

Cross-surface feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run test/audit-cost-integrity.test.ts src/providers/parity.test.ts`

Final gate:

`pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice-cli typecheck && pnpm --filter @full-self-browsing/lattice-cli test && pnpm --filter @full-self-browsing/lattice-cli build && pnpm check:module-boundaries`

Property tests should cover mode/signer/provider-call invariants; price unit precedence,
partial/zero/unknown semantics; budget equality/overage; and route/preflight parity.

## Planning Implications

Use six plans:

1. Add the shared issuance policy, safe typed audit error, public configuration, and
   single-shot runtime finalization.
2. Apply the policy to checkpoints, agents, crews, and explicit external audits.
3. Correct eval failure taxonomy, aggregate accounting, exit precedence, and baseline
   initialization.
4. Add the structured cost kernel and converge routing, plans, and preflight.
5. Reuse the kernel for provider usage, agent/crew call preflight, and diagnostics.
6. Close all requirements with generated cross-surface matrices and the full gate.

Receipt, eval, and core estimator plans can be reviewed independently. The final
closure plan depends on all integrations and must not absorb Phase 61 receipt
attachment/resume work.

## Sources

### Repository

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/research/{SUMMARY,FEATURES,ARCHITECTURE,PITFALLS,STACK}.md`
- `.planning/phases/59-authoritative-runtime-state/59-CONTEXT.md`
- `packages/lattice/src/runtime/{config,create-ai}.ts`
- `packages/lattice/src/contract/checkpoint.ts`
- `packages/lattice/src/agent/{runtime,types}.ts`
- `packages/lattice/src/agent/crew/{run-crew,dispatcher}.ts`
- `packages/lattice/src/audit/external-execution.ts`
- `packages/lattice-cli/src/eval/{runner,types}.ts`
- `packages/lattice-cli/src/commands/eval.ts`
- `packages/lattice/src/routing/{catalog,router}.ts`
- `packages/lattice/src/contract/preflight.ts`
- `packages/lattice/src/providers/{provider,adapters,anthropic,gemini}.ts`
- `packages/lattice/src/agent/infra/cost-tracker.ts`

### External primary guidance inherited from milestone research

- DSSE v1.0.2 protocol: https://github.com/secure-systems-lab/dsse/blob/v1.0.2/protocol.md
- OpenTelemetry sensitive-data guidance: https://opentelemetry.io/docs/security/handling-sensitive-data/

---

*Research completed: 2026-07-16*
