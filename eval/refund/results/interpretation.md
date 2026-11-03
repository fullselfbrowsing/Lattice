# Interpretation of the refund demonstration

The [frozen live cohort](summary.md) completed 32 planned evaluations using two free models, plus two excluded development calls. All 34 HTTP calls reported zero cost; account usage was unchanged. The models received synthetic evidence through real Lattice provider calls. Employee/manager decisions and payment outcomes remained simulated.

## Decision fields and source coverage

Both models matched the expected action, immediate amount, authority, conflict flag and decisive-rule inclusion on all 16 of their runs. Each passed the full rubric on 14/16. All four strict failures were omission of the customer-request source ID, not an incorrect action under the supplied rules.

| Model | Scenario | Repetition | Missing reference |
| --- | --- | --- | --- |
| Dots 3 Note Preview | Disputed promise | 0 | request |
| Dots 3 Note Preview | Disputed promise | 1 | request |
| Nemotron 3.5 Super VL | Already refunded | 0 | request |
| Nemotron 3.5 Super VL | Customer instruction | 1 | request |

These are diagnostic aggregations of fields already scored by the frozen evaluator. The full score stays **28/32**; no answer was repaired, rerun or promoted after inspection. Requiring the customer request in every source list is an operational traceability requirement in this study. Its omission does not by itself show that the substantive reasoning was unsupported. Explanation entailment was not systematically graded.

The configured Lattice format invariant requires valid fields and source IDs but does not require every rubric source. Consequently these four recommendations passed the runtime contract and the application workflow. The complete input records were retained and verified even when the generated source list was incomplete. This difference between retained evidence and the model's references is a useful implementation finding.

## The disputed refund in operation

In all four reviews of the disputed USD 240 request, the model identified the conflict between a company refund promise and the basic-fare terms. It proposed escalation to a manager with USD 0 immediately authorized. The application's separate manager-approval fixture then authorized USD 240 as service recovery; the payment fixture recorded one execution and blocked a second attempt.

For the routine USD 180 case, all four reviews recommended employee approval. For missing dates or mismatched booking identifiers, all eight reviews requested evidence. All eight reviews involving a basic-fare denial or an already-refunded booking denied a further refund. All four approval-limit reviews escalated. All four customer-instruction cases denied the requested unauthorized change under the supplied policy.

These observations support a small worked example of the business process. The cases contain deliberately structured evidence and explicit rules. They do not establish performance on operational disputes, ambiguous contracts, legal exceptions, sophisticated prompt injection or representative customers.

## What the evidence checks establish

All 32 receipts and their expected task, execution-policy and serialized-request bindings verified in a fresh process. The retained input/output content matched the signed commitments. Model identifiers in the actual request and signed record were also checked against the assigned model for each run.

The 18 scoped checks on the first eligible routine bundle included intact controls, altered output/policy/request evidence, missing content, foreign-case presentation, forged signatures, untrusted keys, missing approval/payment records, and application payment guards. They are not 18 distinct cryptographic attacks. The separate offline wrong-answer control had valid evidence but failed the decision score and was held by the application.

The approval/payment records are simulated external records with linkage/completeness checks. They are not authenticated actions by real people or a finance provider. Missing approval/payment records can invalidate the case record without invalidating the Lattice run receipt. Provider failover, durable transaction concurrency, real identity authorization, naturalistic manager review and comparison with secured logging were not evaluated in this cohort.

## Next improvement to test

Make required evidence references explicit in the output contract and prompt, then evaluate a separate frozen cohort with new or held-out scenarios. This would test whether omissions are reduced or rejected; it would not establish that the cited content supports every claim. Add semantic support review separately if that becomes a paper claim.

Do not alter this cohort's labels or strict scores. Retain all four omissions as findings. Before a real pilot, replace approval/payment fixtures with authenticated, durable application records and measure actual review effort with an approved practitioner protocol.

Generation settings were temperature 0 and a 4096-token output cap. Reasoning settings were omitted, so provider defaults applied. Median wall times excluding explicit pacing were approximately 9.44 seconds for Nemotron and 19.25 seconds for Dots; they include hosted model, networking and harness work, not isolated SDK overhead.
