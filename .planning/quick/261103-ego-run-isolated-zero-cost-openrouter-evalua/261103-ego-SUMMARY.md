---
mode: quick
status: complete
---

# Free-model evaluation follow-up

Completed the user-authorized free-model alternative without further paid inference. The free runner pins zero-priced model and endpoint routes, rejects paid fallback/extensions, and shares a separate 900-request ledger across all stages. The paid ledger and every original paid result JSON retain their baseline hashes.

## Outcomes

- Nemotron 3.5 Super VL and Dots 3 Note Preview recorded all 428 planned cases, plus 12 excluded warmups. Runtime success: 416/428; failures remain recorded.
- Artifact checks: 40/40; single-agent tasks: 4/4; crews: 3/4. All four crews delegated and closed their chains. All 324 terminal receipts verified expected task, policy and submitted-request bindings. All 20 synthetic privacy answers were available and marker-free, with no raw/signed marker leaks.
- Citation format: 213/240. The replacement free Nemotron 3 Ultra judge produced 213/213 valid judgments after passing two synthetic probes. Strict supported-answer passes: Nemotron prompt 39/60, contract 44/60; Dots prompt 42/60, contract 41/60 (166/240 overall). This judge is exploratory and not human-calibrated.
- All 120 citation request pairs had identical provider-body hashes. The contract validates after generation; arm differences do not establish improved generation.
- Format failures: eight empty answers (six token exhaustion, two filtered), eight empty citation lists, eight unused source IDs, two transport failures and one invalid JSON. Overlapping judge labels include 31 answers with irrelevant citations, 14 incorrect answers, nine with uncited claims and eight with unsupported claims.
- Free development, main evaluation and all judge attempts consumed 784/900 reservations. Reported cost was USD 0; 50 requests lacked cost reporting. A final read-only key check found total usage unchanged at USD 0.04546433 and daily usage zero. No paid reservations were released.

## Preserved deviations and fixes

The initial Gemma smoke was unavailable and small Nemotron output caps exhausted reasoning budgets. These development observations led to Dots and larger fixed caps before heldout inference. Development records remain separate. Two main transport stops resumed the same immutable harness without replacing failed cases.

The initial Xing judge was rate-limited; its 45-row record is preserved and not pooled. Replacement grading used the same candidates, rubric, model and generation settings across sequential and four-worker collectors. Collector hashes identify the scheduling change, and a shared queue preserves 3.2-second submission spacing. The parser accepts one outer judge JSON fence, although no final judge reply needed it. Candidate answers were never repaired or rescored.

The live run exposed an HTTP-200 embedded error accepted as empty output. A subsequent SDK correction rejects ordinary, streaming JSON and SSE error envelopes. Six regression cases cover the correction. Original measured verdicts and the pre-fix runtime hash remain intact; the incorrect answer is excluded from latency statistics.

## Validation and artifacts

Build, typecheck, 1,788 runtime tests and 196 CLI tests passed. All 15 guard/budget/observer/accountability/judge utility tests and reporting/format-diagnostic self-tests passed. Candidate/coverage, paid-artifact integrity and credential scans passed. Both paper PDFs were rebuilt and visually checked; the existing oversized PII figure was constrained to the page height without changing metrics.

Primary report: `eval/realworld/results/validated-free-summary.md`; public raw records use `validated-free-*`. Private responses, credentials and request ledgers stay in ignored `.context/`. Reproduction is documented in `eval/realworld/README.md`. Both paper sources include the separate cohort; PDF outputs are `paper/main.pdf` and `paper/ieee/main.pdf`.

Next experiments should use a separate development set: reasoning budgets, explicit abstention, citation consistency and claim-level evidence selection. Calibrate the judge with blinded human labels before asserting quality gains. No human study or new frozen-set prompt tuning occurred.

Changes remain on `cursor/review-fixes-eval-708c`; no push, PR posting, merge or publication occurred. The PR body was prepared locally in `.context/PR-24-BODY.md`.
