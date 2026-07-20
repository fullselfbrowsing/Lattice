# Phase 60: Audit, Evaluation, and Cost Integrity - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning
**Source:** Approved v1.6 bridge roadmap, milestone research, and reconciled repository evidence

<domain>
## Phase Boundary

This phase makes strict audit, evaluation, and cost-budget modes truthful. It adds
one receipt issuance policy across capability runs, agents, crews, checkpoints,
and external audit issuance; makes receipt evaluation retain every invalid row and
exit with failure precedence; and routes every pre-execution cost decision through
one estimator.

Phase 61 owns attaching the successfully issued agent and crew envelopes to stable
iteration and terminal result identities, resume deduplication, and final receipt
ordering. Phase 60 must establish the policy and typed failure behavior that Phase
61 composes, but must not build a second collector or duplicate receipt chain.

</domain>

<decisions>
## Implementation Decisions

### Receipt issuance policy

- **D-60-01:** The public issuance modes are `off`, `best-effort`, and `required`.
  Existing signer-only configuration remains the compatibility shorthand for
  `best-effort`; no signer and no explicit mode remains `off`.
- **D-60-02:** An additive `receiptMode` option is accepted at the runtime config
  boundary and at agent/crew invocation boundaries. A local invocation override
  wins over config. Explicit `off` wins even when a signer exists.
- **D-60-03:** One receipt-policy module owns mode normalization, signer preflight,
  issuance outcomes, and safe diagnostics. Direct `createReceipt` remains the
  low-level explicit issuer, while runtime orchestration must use the policy helper.
- **D-60-04:** `required` without an effective signer returns a typed terminal audit
  failure before provider execution. It must not throw an untyped configuration
  error and provider call count must remain zero.
- **D-60-05:** A signing failure after provider execution returns a typed terminal
  audit failure, retains safe usage/plan/partial-output evidence, and never activates
  provider fallback or repeats agent/crew work.
- **D-60-06:** Best-effort signing failure preserves the underlying execution result
  while emitting only bounded status/code diagnostics. Raw signer messages, keys,
  payloads, causes, and remote response bodies are never surfaced in result, event,
  or trace metadata.
- **D-60-07:** Checkpoint hooks, capability runs, agents, crews, and the explicit
  external-execution audit helper use the same issuance outcome vocabulary. Phase
  61 may add a collector callback, but cannot redefine strictness.

### Evaluation integrity

- **D-60-08:** Receipt evaluation continues through all fixtures and retains a row
  for every receipt/sidecar load, verification, materialization, replay, or
  unevaluable-output failure.
- **D-60-09:** The report adds an aggregate `loadFailed` count and a bounded failure
  stage/reason discriminator. Report exit precedence is invalid or unevaluable input
  `2`, otherwise regression `1`, otherwise success `0`.
- **D-60-10:** Exit code 2 caused by fixture rows still emits the complete human and
  JSON report. Session-wide failures that prevent enumeration retain the existing
  single `FAIL` diagnostic behavior.
- **D-60-11:** Baseline initialization is atomic with respect to fixture validity:
  any invalid or unevaluable row prevents the writer from being called and leaves
  an existing baseline untouched.

### Shared cost semantics

- **D-60-12:** A new pure routing cost kernel normalizes preferred per-1k and legacy
  per-1M pricing per side. Preferred fields win independently when both forms exist.
- **D-60-13:** The estimator returns structured input, output, total, pricing-source,
  and version diagnostics. A known free price is `0`; missing or incomplete pricing
  for a nonzero token dimension is `unknown`, never zero.
- **D-60-14:** Exact budget equality is accepted. Both route policy and capability
  contract budgets reject the same known overage and fail closed on unknown cost
  whenever `maxCostUsd` is declared.
- **D-60-15:** With no hard ceiling, unknown-priced candidates remain eligible but
  are explicitly observable and cannot outrank an otherwise equivalent known-free
  route merely because old code used `?? 0`.
- **D-60-16:** Routing estimates, execution plans, contract preflight, provider usage
  normalization, agent iteration preflight, crew budget propagation, and cost
  diagnostics consume the shared kernel or its structured result. Provider-reported
  cost remains post-execution billing authority when present.
- **D-60-17:** Preserve the existing `estimateRouteCost` export as a compatibility
  wrapper. Public changes are additive; no pricing ingestion service, decimal ledger,
  or provider-specific billing API belongs in this milestone.

### The agent's Discretion

- Exact module-local helper names and whether safe receipt failures are represented
  by an error interface, an outcome union, or both.
- Exact additive plan metadata field names for estimator version/source, provided
  unknown and zero remain structurally distinct.
- Whether provider usage normalizers call the cost kernel directly or through one
  shared usage helper.
- Test fixture organization and the smallest production files needed to close each
  invariant without changing frozen provider adapter methods.

</decisions>

<canonical_refs>
## Canonical References

### Requirements and milestone decisions

- `.planning/ROADMAP.md` - Phase 60 goal, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` - AUDIT16-01..04, EVAL16-01..02, PRICE-01..04.
- `.planning/research/{SUMMARY,FEATURES,ARCHITECTURE,PITFALLS,STACK}.md` - approved
  v1.6 policy, estimator, evaluation, compatibility, and threat guidance.
- `.planning/phases/59-authoritative-runtime-state/59-CONTEXT.md` - authoritative
  provider projection and the explicit Phase 60/61 deferrals.

### Receipt and result boundaries

- `packages/lattice/src/runtime/{config,create-ai}.ts` - signer shorthand and all
  capability-run terminal receipt branches.
- `packages/lattice/src/contract/checkpoint.ts` - current swallowed checkpoint mint
  error and tracer-only outcome.
- `packages/lattice/src/agent/{runtime,types}.ts` - agent provider loop, budget checks,
  and documented optional receipt fields.
- `packages/lattice/src/agent/crew/{run-crew,dispatcher}.ts` - crew root/completion
  issuance and shared budget propagation.
- `packages/lattice/src/audit/external-execution.ts` - explicit required external
  evidence issuance.
- `packages/lattice/src/results/{errors,result}.ts` - typed terminal failure and
  partial-evidence surface.

### Evaluation and pricing boundaries

- `packages/lattice-cli/src/eval/{runner,types}.ts` - aggregate receipt evaluation.
- `packages/lattice-cli/src/commands/eval.ts` - exit precedence and baseline writes.
- `packages/lattice/src/routing/{catalog,router}.ts` - existing normalization helper
  and divergent legacy-only router formula.
- `packages/lattice/src/contract/preflight.ts` - currently correct normalized cost
  wrapper and hard-budget unknown rule.
- `packages/lattice/src/providers/{provider,adapters,anthropic,gemini}.ts` - pricing
  hints and duplicated post-execution usage formulas.
- `packages/lattice/src/agent/infra/cost-tracker.ts` - agent/crew cost diagnostic and
  budget accumulator.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable assets

- `effectivePer1kPricing` already defines modern-field precedence and legacy unit
  conversion; move or delegate it to the shared cost kernel rather than preserving
  two authorities.
- `estimateRouteCost` already uses normalized pricing and returns `null` for unknown;
  retain it as a public compatibility wrapper.
- `RunFailure` already carries usage, plan, partial outputs, artifacts, events, and
  gateway evidence needed for a post-provider audit failure.
- `LatticeRunError` and `AgentFailureKind` already compose through an additive
  discriminated error union.
- Eval already walks every fixture and has per-row `load-failed` reports; the missing
  pieces are stage fidelity, aggregate accounting, exit precedence, and baseline
  write prevention.

### Confirmed defects

- `maybeIssueReceipt` catches every signer failure and returns `undefined`, including
  required-audit scenarios.
- `createCheckpointHook` exposes raw caught signer text as `mintError` and never
  propagates strict failure.
- Crew root and completion issuance call `createReceipt` directly and can throw raw
  errors, unlike the single-shot runtime's swallowed failures.
- Eval excludes `load-failed` rows from both passed and regressed counts, so the CLI
  can exit 0; baseline init silently skips them and writes a partial baseline.
- The router calculates only `inputCostPer1M`/`outputCostPer1M`, while preflight
  prefers per-1k hints. Preferred-only pricing therefore appears free/unknown to
  routing but known to contract enforcement.
- Adapter and agent cost paths contain additional independent arithmetic that can
  drift from route/preflight semantics.

</code_context>

<specifics>
## Specific Ideas

The bridge should separate issuance policy from receipt attachment. Phase 60 returns
one safe outcome for every attempt and makes strict failure terminal. Phase 61 can
then collect successful envelopes without inventing another error model.

The cost kernel should similarly separate arithmetic from decisions. It returns a
structured known/unknown estimate; routing, contracts, plans, agents, crews, and
diagnostics decide how to apply it while sharing identical units and provenance.

</specifics>

<deferred>
## Deferred Ideas

- Stable iteration identity, terminal agent receipt contents, result attachment,
  resume deduplication, and crew envelope ownership/order remain Phase 61.
- Provider pricing ingestion, live billing reconciliation, decimal settlement, and
  hosted spend controls remain outside v1.6.
- Real-provider canaries, packed supported-Node consumers, docs/release refresh, and
  comment hygiene remain Phase 62.
- Required-mode compile-time result narrowing remains `TYPE-F01` future work.

</deferred>

---

*Phase: 60-audit-evaluation-and-cost-integrity*
*Context gathered: 2026-07-16*
