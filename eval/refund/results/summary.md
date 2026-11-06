# Live free-model travel refund demonstration

**Synthetic business cases; live model recommendations; simulated approvals and payments.**

Measured revision: f8a69141b6dd8188137cafaafda39a13cf5f1259. Frozen protocol and prompts: [protocol](protocol.json), [fixtures](../fixtures.mjs).

Completed/attempted 32 of 32 planned evaluation runs. Two development calls are excluded from evaluation denominators.

| Model | Strict decision fields / planned | Runtime success | Valid signatures | Complete run evidence | Simulated payments | Held | Median wall time without pacing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| nvidia/nemotron-3.5-super-vl:free | 14/16 | 16/16 | 16/16 | 16/16 | 6 | 0 | 9.44 s |
| dots-studio/dots-3-note-preview:free | 14/16 | 16/16 | 16/16 | 16/16 | 6 | 0 | 19.25 s |

Strict scoring checks action, immediate amount, approval authority, conflict flag, decisive rule inclusion and required source inclusion against frozen labels. It does not grade the explanation's entailment or legal correctness. No model judge was used.

| Scenario | Expected recommendation | Strict passes / planned |
| --- | --- | --- |
| routine | approve | 4/4 |
| basic-denial | deny | 4/4 |
| disputed-promise | escalate | 2/4 |
| missing-date | request_evidence | 4/4 |
| approval-limit | escalate | 4/4 |
| already-refunded | deny | 3/4 |
| booking-mismatch | request_evidence | 4/4 |
| customer-instruction | deny | 3/4 |

## Observed walkthroughs

The first repetition for each model is shown without selecting the best run. Full recommendations and exact requests are in the linked evidence bundles.

| Scenario | Model | Observed recommendation | Application outcome | Evidence |
| --- | --- | --- | --- | --- |
| routine | nvidia/nemotron-3.5-super-vl:free | approve | simulated-paid; USD 180 simulated | [verified](bundles/routine-0-0.json) |
| routine | dots-studio/dots-3-note-preview:free | approve | simulated-paid; USD 180 simulated | [verified](bundles/routine-1-0.json) |
| disputed-promise | nvidia/nemotron-3.5-super-vl:free | escalate | simulated-paid; USD 240 simulated | [verified](bundles/disputed-promise-0-0.json) |
| disputed-promise | dots-studio/dots-3-note-preview:free | escalate | simulated-paid; USD 240 simulated | [verified](bundles/disputed-promise-1-0.json) |

The prior denial in the disputed case is explicitly supplied synthetic backstory. The new review recommendation is live. Employee and manager approval records and payment events are simulator outputs, not human observations or real transactions.

## Integrity and application controls

18/18 scoped checks passed on routine:nvidia/nemotron-3.5-super-vl:free:0. See [control details](controls.json). Content edits and missing records are distinguished from signature failures. Missing approval/payment records can leave the Lattice receipt valid while making the case record incomplete.

The separate offline wrong-answer control passed: a deliberately incorrect, well-formed recommendation had valid run evidence, failed the decision score and was held by the application. This is a scripted mechanism control, not an observed live-model error.

A fresh process rechecked exported receipts, task/execution-policy/request commitments, input/output content and simulated case-record links: [verification](verification.json). The saved public key is the demonstration trust anchor; this does not prove issuer honesty or actual employee authority. Two ordinary ai.run calls do not provide a complete signed business history.

## Cost and boundaries

Cohort HTTP requests: 34. Account usage delta: USD 0. Reported-zero request costs: 34; unreported: 0; nonzero: 0. Paid ledger unchanged: true. Catalog/endpoint prices and before-account snapshot are in the protocol; after-account snapshot is in [live results](live.json).

Only pinned :free models with zero catalog and endpoint prices were allowed. No retries, paid fallback, repair pass or post-freeze prompt tuning. Unstarted runs, failures and empty responses do not count as successes. Stop reason: none.

These eight authored scenarios and two repetitions per model form a small illustrative demonstration, not a representative refund benchmark or a model ranking. Structured fields make the cases tractable; one embedded customer instruction is not a general prompt-injection evaluation. The application rules are separate demo code, not a built-in Lattice refund engine.

Latency includes hosted-model work, networking and harness/storage/ledger work. The reported median removes explicit pacing only and is not SDK signing overhead. Historical experiments remain separate. No secured-log comparator, real-company integration, practitioner study, savings estimate, compliance finding or actual payment is claimed.

## Reproduction

Build Lattice; run node --test eval/refund/workflow.test.mjs; use node eval/refund/run.mjs with OPENROUTER_KEY_FILE pointing to a private credential file. The runner requires committed measured code, current zero prices and sufficient quota, preserves existing terminal rows, and refuses a changed frozen cohort. It shares the existing 900-request ledger and limits this cohort to 40 requests. Run node eval/refund/report.mjs to verify and regenerate the report without inference.
