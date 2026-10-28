# Validated evaluation

Recorded attempted cases: 213/1020 planned; 807 have no recorded outcome. Status: incomplete. Coverage completion does not mean every case succeeded or billing is reconciled.

Budget: USD 0.04482533 confirmed, USD 9.54471960 unresolved reservations, USD 9.58954493 charged or reserved against USD 10.00. 27 requests remain unresolved. Within reserved cap: True. Unknown charges retain their full reservations; a key-level usage snapshot is not settlement proof.

Recorded runtime revision: 617c565fae49df774f9931e54367241cbd7122ae; harness SHA-256: 14b0549a2f6d02a43ae423f0057f9d1e3d56605d1adf365bb6574bb3f56e2fd6. The current checkout is not substituted for recorded execution provenance.

Conservative remaining budget cannot reserve the next GPT-4.1-mini request. Paid evaluation stopped; uncertain charges were not released. The final case failed before HTTP egress due to budget denial; no additional paid request was made. Keep original measurements and stop reason unchanged. Do not pool development smoke cases with heldout evaluation. No hosted latency, support/completeness, or answer-correctness score is established by this run. Measured-harness defects: After first network timeout, the measured version kept trying subsequent cases, consuming conservative reservations. Fixed to halt on the first unknown transport failure. After a budget denial, zero observed HTTP calls were passed as an invalid empty expected request-hash array. This interrupted row persistence. Fixed to compare configured-fetch preparations and omit an empty expectation.

## Development-only evidence

A separate qualitative, AI-reviewed development-only spot check is available in citation-development-spotcheck.json. It supplies no human labels and is excluded from every heldout denominator and numerical accuracy estimate.

## Reading the tables

D = direct HTTP, U = unsigned runtime, S = signed runtime. Runtime success and task correctness are separate outcomes. Privacy prompts request non-disclosure; marker-free answers alone do not establish adversarial blocking effectiveness.

## Latency coverage; wall, provider and processing estimates and intervals are not measured

| Model | Arm | Attempted | Failed | Timings |
| --- | --- | --- | --- | --- |
| GPT-4.1 mini | D | 0/50 | 0 | not measured |
| GPT-4.1 mini | U | 0/50 | 0 | not measured |
| GPT-4.1 mini | S | 0/50 | 0 | not measured |
| Gemini Flash Lite | D | 0/50 | 0 | not measured |
| Gemini Flash Lite | U | 0/50 | 0 | not measured |
| Gemini Flash Lite | S | 0/50 | 0 | not measured |
| Claude Haiku 4.5 | D | 0/50 | 0 | not measured |
| Claude Haiku 4.5 | U | 0/50 | 0 | not measured |
| Claude Haiku 4.5 | S | 0/50 | 0 | not measured |

## Artifact task correctness; 20 planned per model/arm, split evenly between images and JSON

| Model | Arm | Input | Attempted | Runtime OK | Correct |
| --- | --- | --- | --- | --- | --- |
| GPT-4.1 mini | D | image | 10/10 | 10/10 | 4/10 |
| GPT-4.1 mini | D | json | 10/10 | 10/10 | 10/10 |
| GPT-4.1 mini | S | image | 10/10 | 10/10 | 3/10 |
| GPT-4.1 mini | S | json | 10/10 | 10/10 | 10/10 |
| Gemini Flash Lite | D | image | 10/10 | 10/10 | 10/10 |
| Gemini Flash Lite | D | json | 10/10 | 10/10 | 10/10 |
| Gemini Flash Lite | S | image | 10/10 | 10/10 | 10/10 |
| Gemini Flash Lite | S | json | 10/10 | 10/10 | 10/10 |
| Claude Haiku 4.5 | D | image | 10/10 | 10/10 | 10/10 |
| Claude Haiku 4.5 | D | json | 10/10 | 10/10 | 10/10 |
| Claude Haiku 4.5 | S | image | 10/10 | 9/10 | 9/10 |
| Claude Haiku 4.5 | S | json | 10/10 | 10/10 | 10/10 |

## Privacy marker checks; leak fractions use observed outputs or issued receipts only

| Model | Attempted | Marker-free | Delivered leaks | Raw leaks | Signed leaks |
| --- | --- | --- | --- | --- | --- |
| GPT-4.1 mini | 20/20 | 20/20 | 0/20 | 0/20 | 0/20 |
| Gemini Flash Lite | 20/20 | 20/20 | 0/20 | 0/20 | 0/20 |
| Claude Haiku 4.5 | 20/20 | 19/20 | 0/19 | 0/19 | 0/20 |

## Agent and crew execution; activity is tool use or child execution

| Model | Suite | Attempted | Strict | Activity cases | Calls/receipts | Verified/closed |
| --- | --- | --- | --- | --- | --- | --- |
| GPT-4.1 mini | agent | 5/5 | 5/5 | 5 | 5 | 5 |
| GPT-4.1 mini | crew | 5/5 | 5/5 | 5 | 20 | 5 |
| Gemini Flash Lite | agent | 5/5 | 5/5 | 5 | 5 | 5 |
| Gemini Flash Lite | crew | 5/5 | 5/5 | 5 | 20 | 5 |
| Claude Haiku 4.5 | agent | 5/5 | 0/5 | 0 | 0 | 5 |
| Claude Haiku 4.5 | crew | 5/5 | 0/5 | 0 | 15 | 5 |

## Citation coverage and outcomes; 60 planned per model/arm; zero judged means accuracy is unmeasured

| Model | Arm | Attempted | Runtime | Format | Usable | Judged | Correct | Strict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-4.1 mini | Prompt | 2/60 | 0/60 | 0/60 | 0/60 | 0/60 | not measured | not measured |
| GPT-4.1 mini | Contract | 1/60 | 0/60 | 0/60 | 0/60 | 0/60 | not measured | not measured |
| Gemini Flash Lite | Prompt | 0/60 | 0/60 | 0/60 | 0/60 | 0/60 | not measured | not measured |
| Gemini Flash Lite | Contract | 0/60 | 0/60 | 0/60 | 0/60 | 0/60 | not measured | not measured |
| Claude Haiku 4.5 | Prompt | 0/60 | 0/60 | 0/60 | 0/60 | 0/60 | not measured | not measured |
| Claude Haiku 4.5 | Contract | 0/60 | 0/60 | 0/60 | 0/60 | 0/60 | not measured | not measured |

## Conditional claim aggregates from valid judgments; not human labels

| Model | Arm | Claims | Support | Cited | Precision | Relevant/total |
| --- | --- | --- | --- | --- | --- | --- |
| GPT-4.1 mini | Prompt | 0 | — | — | — | not measured |
| GPT-4.1 mini | Contract | 0 | — | — | — | not measured |
| Gemini Flash Lite | Prompt | 0 | — | — | — | not measured |
| Gemini Flash Lite | Contract | 0 | — | — | — | not measured |
| Claude Haiku 4.5 | Prompt | 0 | — | — | — | not measured |
| Claude Haiku 4.5 | Contract | 0 | — | — | — | not measured |

## PII macro F1 over four mapped types; corpus annotation agreement

| Split | Profile | Docs | Exact F1 | Overlap F1 |
| --- | --- | --- | --- | --- |
| dev | default | 20776 | 0.622126 | 0.654198 |
| dev | contextual | 20776 | 0.622123 | 0.654190 |
| holdout | default | 5186 | 0.623463 | 0.658917 |
| holdout | contextual | 5186 | 0.623364 | 0.658812 |

## Per-type exact-span precision; changes are absolute proportions

| Split | Type | Default | Contextual | Delta |
| --- | --- | --- | --- | --- |
| dev | email | 0.250441 | 0.250441 | 0.000000 |
| dev | us-ssn | 0.917625 | 0.917625 | 0.000000 |
| dev | us-phone | 0.767677 | 0.767266 | -0.000411 |
| dev | credit-card | 0.563474 | 0.563474 | 0.000000 |
| holdout | email | 0.252558 | 0.252558 | 0.000000 |
| holdout | us-ssn | 0.812500 | 0.812500 | 0.000000 |
| holdout | us-phone | 0.773350 | 0.772388 | -0.000962 |
| holdout | credit-card | 0.582090 | 0.582090 | 0.000000 |

## Matched accountability probes; signed-log parity is expected, not cryptographic novelty

| Arm | Class | Cases | Accept | Reject | N/A |
| --- | --- | --- | --- | --- | --- |
| JSON log | Control | 6 | 6 | 0 | 0 |
| JSON log | Integrity | 21 | 21 | 0 | 0 |
| JSON log | Key mismatch | 3 | 0 | 0 | 3 |
| JSON log | Expectation | 12 | 0 | 12 | 0 |
| Signed log | Control | 6 | 6 | 0 | 0 |
| Signed log | Integrity | 21 | 0 | 21 | 0 |
| Signed log | Key mismatch | 3 | 0 | 3 | 0 |
| Signed log | Expectation | 12 | 0 | 12 | 0 |
| Lattice | Control | 6 | 6 | 0 | 0 |
| Lattice | Integrity | 21 | 0 | 21 | 0 |
| Lattice | Key mismatch | 3 | 0 | 3 | 0 |
| Lattice | Expectation | 12 | 0 | 12 | 0 |

## Interpretation and limits

Only runtime-successful measured latency rows with finite nonnegative wall/provider/processing timings. Warmups and failures excluded from timing distributions, retained in coverage. Processing is wall minus HTTP and backoff, not a causal pure-SDK cost.

60 per model/arm, including unattempted, blocked, invalid and unjudged cases. Claim metrics are conditional micro-aggregates over valid judgments. With zero valid judgments, accuracy and strict success are unmeasured (null), not zero accuracy.

Usable runtime output, valid judge, correct non-abstained answer, nonempty claims, every claim supported/cited, and every claimed citation relevant.

One fixed GPT-4.1-mini judge; no human labels. ALCE-derived subset with our prompts and judge, not official ALCE metrics or a reproduction. Judge errors and shared-model bias remain possible.

ALCE: https://github.com/princeton-nlp/ALCE. Pinned subset source: https://huggingface.co/datasets/princeton-nlp/ALCE-data/tree/334fa2e7dd32040c3fef931a123c4be1a81e91a0.

Task correctness and observed request image parts do not attest that the remote receiver consumed specific bytes.

Checks supplied markers only; blocked answers and absent receipts are not counted as delivered leak-free answers.

PII decision: retain-opt-in. Supportive development evidence and a holdout exact-macro-F1 improvement are both required, with no type losing more than 0.01 precision. Corpus annotation agreement, not estimated deployment precision. Four supported PII types; prose rows do not measure structured-field cues. Historical single-match and many-to-one span scores are not comparable.

Matched signed-log/Lattice decision parity: True. These probes compare signed canonical records carrying the same fields; they do not establish a new cryptographic advantage.

Historical results use different extraction/scoring and are not directly comparable.

## Next evaluation improvements

Development-only error analysis found 4,171 of 4,336 overlap-unmatched email predictions outside any annotated span. Only 165 overlapped another label, and 0 exactly repeated a complete annotated value elsewhere. Review a blinded development sample to distinguish detector errors, boundary errors and annotation gaps before changing rules. No labels or scores were changed. For citations, compare native JSON schema output and bounded repair as explicit new arms, recording added calls and cost; a syntax contract alone does not improve source support. Resume a new paid experiment only after uncertain charges are reconciled or a new budget is explicitly authorized. Keep the current failed/incomplete recording intact.

## Input hashes

| Input | SHA-256 |
| --- | --- |
| validated-full.json | 5665a24ef2412a2b9cc71bfca466e90d3c42ee2337ee6475f6200c24227bd38c |
| validated-judge.json | ada80b3f98eac448c9769855ed7af9e924981d85c311bfcc1d3876c0c6214ba2 |
| pii-dev-default.json | 3ef5d3f3165a521d8ea4d75158bef280bb4bc5c77b1713584b361a7cce5e744d |
| pii-dev-contextual.json | 5855bbe9af91b03f05586d236fd1827527df1225d7229054a58adfe702d5eb56 |
| pii-holdout-default.json | efb46be7260540bca7cd0511a83c05088038876aadaf0bc588749a7edc45d2c6 |
| pii-holdout-contextual.json | f67a69b3b7f5ab972436a3ad74130e8bc40f0b4c340f6e1aaa255eb7f69ad1b7 |
| pii-promotion.json | cec8e1da5ce56ea27b623da9da59f9c6e4f11cdbb93235ad5f273db36afa1549 |
| accountability.json | f171064d154eb0c8eef2e59dc4f86275061db6937f67cf2d54df46be4527afc3 |
| validated-termination.json | 6dfc0b098f126d68d82c250757e43f9f98dd2ae610dd926b9630d03539c400d3 |
| citation-development-spotcheck.json | 602c0682f2df65a59b950edfc5961a3b7cdc03222e0d3224c773943b5e1eded0 |
| pii-error-analysis.json | 830d9ef9f47ca816a79e6cb25dbb94c5d3fc26bf3b92447345c43c681c5184fc |
| hosted-budget.json | 6705196b1bd6c6da6148e832e5d8c3cec7c2bd7a9c1a4abff15ab36013d4b6f3 |
