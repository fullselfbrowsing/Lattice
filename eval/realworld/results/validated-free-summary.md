# Free-model evaluation

This is a separate cohort; earlier paid results remain unchanged.

Recorded **428/428** planned cases, with **416** runtime successes. An additional 12 warmup rows are excluded from those totals.

Reported inference cost across development smoke, evaluation and judging: **$0.000000** over 784 requests. 50 requests did not return a cost; they used verified zero-priced routes.

Evaluation stop: none. Judge stop: none.

Collection restarts: 2; failed rows and free request counts were retained. Details are in validated-free-resumes.json when present.

## Runtime and transport

| Model | Suite | Arm | Recorded / planned | Runtime success | Correct |
|---|---|---|---:|---:|---:|
| nvidia/nemotron-3.5-super-vl:free | transport | direct | 10/10 | 10 | 10 |
| nvidia/nemotron-3.5-super-vl:free | transport | signed | 10/10 | 10 | 10 |
| nvidia/nemotron-3.5-super-vl:free | privacy | signed | 10/10 | 10 | — |
| nvidia/nemotron-3.5-super-vl:free | agent | signed | 2/2 | 2 | 2 |
| nvidia/nemotron-3.5-super-vl:free | crew | signed | 2/2 | 2 | 2 |
| nvidia/nemotron-3.5-super-vl:free | citations | prompt-only | 60/60 | 60 | — |
| nvidia/nemotron-3.5-super-vl:free | citations | contract | 60/60 | 56 | — |
| nvidia/nemotron-3.5-super-vl:free | latency | direct | 20/20 | 20 | 20 |
| nvidia/nemotron-3.5-super-vl:free | latency | unsigned | 20/20 | 20 | 20 |
| nvidia/nemotron-3.5-super-vl:free | latency | signed | 20/20 | 20 | 20 |
| dots-studio/dots-3-note-preview:free | transport | direct | 10/10 | 10 | 10 |
| dots-studio/dots-3-note-preview:free | transport | signed | 10/10 | 10 | 10 |
| dots-studio/dots-3-note-preview:free | privacy | signed | 10/10 | 10 | — |
| dots-studio/dots-3-note-preview:free | agent | signed | 2/2 | 2 | 2 |
| dots-studio/dots-3-note-preview:free | crew | signed | 2/2 | 2 | 1 |
| dots-studio/dots-3-note-preview:free | citations | prompt-only | 60/60 | 60 | — |
| dots-studio/dots-3-note-preview:free | citations | contract | 60/60 | 52 | — |
| dots-studio/dots-3-note-preview:free | latency | direct | 20/20 | 20 | 20 |
| dots-studio/dots-3-note-preview:free | latency | unsigned | 20/20 | 20 | 19 |
| dots-studio/dots-3-note-preview:free | latency | signed | 20/20 | 20 | 20 |

Runtime success means execution completed; it does not establish answer quality. Correct transport requires the exact JSON token or named image color. Correct agents/crews require actual tool use/delegation plus the supplied policy and source marker.

## Citations

| Model | Arm | Format valid / 60 | Usable / 60 | Valid judge / attempted | Strict supported answer / 60 |
|---|---|---:|---:|---:|---:|
| nvidia/nemotron-3.5-super-vl:free | prompt-only | 53 | 53 | 53/53 | 39 |
| nvidia/nemotron-3.5-super-vl:free | contract | 56 | 56 | 56/56 | 44 |
| dots-studio/dots-3-note-preview:free | prompt-only | 52 | 52 | 52/52 | 42 |
| dots-studio/dots-3-note-preview:free | contract | 52 | 52 | 52/52 | 41 |

Strict success requires a usable, correct, non-abstaining answer with at least one factual claim; every claim must be supported and cited, and every listed citation for that claim must be relevant.

Fixed exploratory judge: `nvidia/nemotron-3-ultra-550b-a55b:free`. Invalid/unavailable outputs stay in the 60-question denominator. Unjudged quality is unknown. Sources and frozen question manifest match the prior evaluation protocol; no heldout prompt tuning or automatic repair was used.

The replacement judge passed 2 synthetic supported/contradicted probes; this is not human calibration. 0 judge replies required removal of a single outer JSON fence. Candidate answers were never normalized. The initial rate-limited Xing attempt is preserved separately and not pooled. Collector hashes distinguish sequential and bounded concurrent grading with the same model, rubric and generation settings.

Overlapping judge failure categories (answers can appear in several): `abstained`: 2, `incorrectAnswer`: 14, `irrelevantCitation`: 31, `uncitedClaim`: 9, `unsupportedClaim`: 8. These are model judgments, not human-confirmed error labels.

120/120 completed citation request pairs had identical body hashes. The contract validates format after generation; it neither repairs output nor verifies entailment. Differences in generated answer quality across these arms do not establish that the contract improved generation.

## Latency

Medians below use successful, correct non-warmup cases. Wall time excludes recorded request pacing. JSON includes bootstrap median intervals and p95; these small free-tier samples do not estimate production latency.

| Model | Arm | Eligible / 20 | Wall median ms | HTTP median ms | Processing median ms |
|---|---|---:|---:|---:|---:|
| nvidia/nemotron-3.5-super-vl:free | direct | 20 | 559.947 | 558.426 | 1.324 |
| nvidia/nemotron-3.5-super-vl:free | unsigned | 20 | 636.562 | 634.875 | 1.687 |
| nvidia/nemotron-3.5-super-vl:free | signed | 20 | 586.974 | 585.300 | 1.844 |
| dots-studio/dots-3-note-preview:free | direct | 20 | 1958.527 | 1955.248 | 2.129 |
| dots-studio/dots-3-note-preview:free | unsigned | 19 | 1792.735 | 1790.025 | 2.246 |
| dots-studio/dots-3-note-preview:free | signed | 20 | 1936.853 | 1933.839 | 2.819 |

## Receipt and privacy checks

- `nvidia/nemotron-3.5-super-vl:free`: 162/162 terminal receipts verified with expected bindings; 2/2 crew chains closed. Privacy answers available 10/10; answer marker leaks 0, raw-output marker leaks 0, signed marker leaks 0.
- `dots-studio/dots-3-note-preview:free`: 162/162 terminal receipts verified with expected bindings; 2/2 crew chains closed. Privacy answers available 10/10; answer marker leaks 0, raw-output marker leaks 0, signed marker leaks 0.

## Post-hoc format diagnosis

Counts below explain failures without changing their scores. Empty citation lists are not automatically treated as justified abstentions.

| Model | Arm | Failure category | Count |
|---|---|---|---:|
| dots-studio/dots-3-note-preview:free | contract | empty-citation-list | 4 |
| dots-studio/dots-3-note-preview:free | contract | empty-content | 1 |
| dots-studio/dots-3-note-preview:free | contract | transport-unavailable | 2 |
| dots-studio/dots-3-note-preview:free | contract | unused-source-id | 1 |
| dots-studio/dots-3-note-preview:free | prompt-only | empty-citation-list | 3 |
| dots-studio/dots-3-note-preview:free | prompt-only | empty-content | 2 |
| dots-studio/dots-3-note-preview:free | prompt-only | unused-source-id | 3 |
| nvidia/nemotron-3.5-super-vl:free | contract | empty-citation-list | 1 |
| nvidia/nemotron-3.5-super-vl:free | contract | empty-content | 2 |
| nvidia/nemotron-3.5-super-vl:free | contract | unused-source-id | 1 |
| nvidia/nemotron-3.5-super-vl:free | prompt-only | empty-content | 3 |
| nvidia/nemotron-3.5-super-vl:free | prompt-only | invalid-json | 1 |
| nvidia/nemotron-3.5-super-vl:free | prompt-only | unused-source-id | 3 |

Empty-response finish reasons: `content_filter`: 2, `length`: 6. Token exhaustion and content filtering are distinct outcomes; filtered responses should not be treated as JSON-repair opportunities.

## Next experiments

1. On a separate development set, compare explicit reasoning allowances and output budgets against the current provider defaults. Record visible-answer completion, token use and supported-answer quality together; a larger budget alone is not evidence of improvement.
2. Define and evaluate an explicit abstention result, then validate citation-list and inline-marker consistency. Keep supported answers, justified abstentions, filtering and transport failures separate. Do not silently repair or rescore the frozen answers.
3. On development questions, test claim-level evidence selection and minimal supporting citations. Track irrelevant citations, unsupported claims and answer correctness separately; adding more citations can lower precision without improving support.
4. Calibrate the support judge with blinded human labels before using it to rank models or claim quality gains. The synthetic probes check basic behavior only; a same-vendor judge may introduce bias.
5. Confirm the HTTP-200 error-envelope fix with the existing offline regressions and a new independently recorded cohort when needed. Measure provider availability separately from task quality, and use more timing trials for production latency claims.

## Provenance and limits

Measured revision: `07cd9006b0fceaeacd81a8a6e38b66bb1b673c69`. Runtime hash: `af6f9aecac80262dda326968558806bd390e041e07bfc8352e166d5c58053a75`.

The measured runtime accepted 1 upstream error envelope inside HTTP 200 as empty output. The task-answer check excluded it from latency statistics. A subsequent adapter fix rejects error envelopes in ordinary and streaming responses; the recorded verdict is retained rather than rewritten.

All request bodies are hashed before egress without mutation. Catalog and endpoint prices, model IDs, generation limits, harness hashes and dataset manifests are recorded in the JSON artifacts. The paid ledger was never opened for writes by the free runner.

- Separate exploratory free-model cohort; do not pool with the earlier paid cohort.
- Provider-default reasoning is included; output allowances differ from paid results.
- Free-tier queueing and availability limit latency generalization; 20 trials per arm are descriptive.
- Processing is residual wall time including harness hashing, ledger writes and JSON work, not pure SDK overhead.
- Fixed free judge is not human validated; its judgments are exploratory and not official ALCE scores.
- Synthetic non-disclosure prompts are not an adversarial privacy evaluation.
- 16x16 solid-color images are narrow transport fixtures, not a general vision benchmark.

[OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free) document zero-cost access and separate availability limits. [Rate-limit documentation](https://openrouter.ai/docs/api/reference/limits) describes the daily free-request quota.
