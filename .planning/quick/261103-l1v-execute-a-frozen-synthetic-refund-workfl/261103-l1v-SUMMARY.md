---
type: quick
id: 261103-l1v
date: 2026-11-03
status: complete
measured_revision: f8a6914
results_commit: 430c493
---

# Live free-model refund workflow completed

Implemented and executed the user's requested live demonstration. Research cases are synthetic; model recommendations, provider transport, runtime contracts, receipts and verification are actual executions. Human approvals and payment events are explicitly simulated.

## Results

- 32/32 planned runs: eight scenarios × two pinned free models × two repetitions. Two separate development calls are excluded.
- Both models matched the frozen action, amount, authority, conflict and decisive-rule labels in 16/16 runs. Each passed the complete rubric in 14/16, for 28/32 overall.
- All four strict failures omitted the customer-request reference: Dots in both disputed-promise runs; Nemotron in the first already-refunded run and second customer-instruction run. Preserve these results; no retries, repair, model replacement or prompt changes.
- 32/32 receipts, expected task/execution-policy/prepared-request bindings and retained input/output packages passed fresh-process verification.
- 18/18 scoped integrity/application checks passed on the first eligible routine bundle. A separate scripted wrong-answer control had valid evidence but failed decision scoring and was held by application rules.
- 34 HTTP calls reported zero cost; account usage stayed USD 0.04546433 before/after, with USD 0 added spend. Shared free ledger rose from 784 to 818, below its 900-request cap. Paid ledger unchanged.

## Artifacts and implementation

- Frozen code/protocol commit: `f8a6914`; results/docs commit: `430c493`.
- `eval/refund` contains fixtures, format/scoring/application rules, runner, controls, tests, report generator and reproduction README.
- `eval/refund/results` retains the protocol and source/build hashes, public key, 34 evidence bundles, full run records, verification/control output, generated report and interpretation.
- Private signing key and provenance remain in `.context/refund-live`. Credential contents were never printed or committed.
- C2 research/checklist updated: live evidence ready for author incorporation. C4 case-execution subtask complete; overall evaluation consolidation and paper incorporation remain pending.

## Validation

- Lattice build passed. Fifteen targeted tests passed: seven refund tests and eight existing free-guard/observer tests.
- New scripts passed syntax checks and git diff hygiene. All local document links resolve.
- Fresh-process verifier recomputed commitments from retained records and frozen fixtures. All assigned models matched request/signed-model identifiers; all requests used temperature 0 and max_tokens 4096, with reasoning defaults.
- Final export scan found no API credential or private signing-key material.
- 159 prior manuscript/evaluation files were checked unchanged during execution; main LaTeX, PDF and bibliography checked again at completion. Runtime/API source and historical cohorts were not changed.

## Scope and next work

This is a small authored-case demonstration, not a representative business benchmark, company deployment, human study or legal/compliance finding. The rubric does not grade explanation entailment. Hosted latency includes model/network/harness work and is not pure SDK overhead. The external authorization/payment records are simulator artifacts; the duplicate guard is in memory, not a production transaction system.

Provider failover, real identity authorization, durable concurrency and a secured-log comparator were not evaluated. A distinct future cohort can test explicit required-source enforcement and semantic support; this cohort must remain frozen. Authors still own original C2 manuscript drafting and final methods/AI disclosures. C1 still awaits author review.

Completed inline through GSD quick. No subagents, branch change, push, correspondence, actual payment or submission.
