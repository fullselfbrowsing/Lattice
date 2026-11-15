# Paid-model cohort summary

**Verdict: VALID.** All admitted stages completed, 98.3% of planned calls returned a response, and every successful run's receipt verified.

## Completion

| Stage | Admitted | Complete | Planned | Attempted | Responded |
| --- | --- | --- | --- | --- | --- |
| smoke-citations | true | true | 3 | 3 | 3 |
| smoke-judge | true | true | 4 | 4 | 4 |
| A | true | true | 24 | 24 | 23 |
| B | true | true | 180 | 180 | 179 |
| J | true | true | 152 | 152 | 152 |
| C | true | true | 408 | 408 | 397 |

## Public-record review

| Model | Full rubric (frozen) | Full rubric (audited) | Verified packages |
| --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | 7/8 | 7/8 | 7/8 |
| openai/gpt-6.1-sol | 8/8 | 8/8 | 8/8 |
| google/gemini-4-carbon | 7/8 | 7/8 | 7/8 |

## Citation quality (strict: correct, not abstained, every claim supported and cited)

Judge qwen/qwen3.8-max-0902

| Model | Planned | Judged | Strict, live contract | Strict, derived prompt-only |
| --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | 60 | 60 | 31 | 31 |
| openai/gpt-6.1-sol | 60 | 56 | 41 | 41 |
| google/gemini-4-carbon | 60 | 36 | 26 | 26 |

Agreement between judges: Not available: one active judge.

Excluded judge x-ai/grok-4.7: 5 partial rows (3 valid), not used in any table.

## Protocol amendments

- **A1** (2026-11-12T18:58:07.943Z, decided by Lakshman Turlapati (author), 2026-11-12): x-ai/grok-4.7 broke its infrastructure limits during stage J: 2 of its first 5 calls timed out at 180 s, and one returned 5,101 completion tokens against a 2,048-token cap because its reasoning ignored the 1,024-token budget. It is excluded for infrastructure reasons, decided before any further judging; no judging outcome informed the decision.
- **A2** (2026-11-12T20:25:01.678Z, decided by Claude Code (orchestrator), 2026-11-12: correction to the definition the approved plan specified; reported to the author for review): Reporting correction after the run: eval/paid-cohort/report.mjs counted strict citation quality when each claim had at least one relevant citation, but the free cohort (eval/realworld/scripts/16-validated-report.py, citation_summary) requires every listed citation to be relevant. The report now uses the free cohort rule, which the plan specified. No inference was rerun and validity uses no scores.

## Receipts

Successful runs with verified receipts: 384/384.

## Latency (median wall ms)

| Model | Direct | Unsigned | Signed | Signed minus direct |
| --- | --- | --- | --- | --- |
| anthropic/claude-sonnet-5.5 | 795 | 849 | 837 | 42 |
| openai/gpt-6.1-sol | 1567 | 1578 | 1585 | 18 |
| google/gemini-4-carbon | 6795 | 6460 | 6766 | -29 |

## Spend (USD)

| Stage | Ledger confirmed | Ledger incl. reservations | Account delta | Account minus ledger |
| --- | --- | --- | --- | --- |
| smoke-citations | 0.0137 | 0.0137 | 0.0000 | -0.0137 |
| smoke-judge | 0.0117 | 0.0117 | 0.0000 | -0.0117 |
| A | 0.3099 | 0.5208 | 0.2815 | -0.0284 |
| B | 1.0608 | 1.1796 | 1.0152 | -0.0456 |
| J | 1.1360 | 1.2808 | 1.1053 | -0.0308 |
| C | 0.4101 | 0.8011 | 0.4036 | -0.0064 |

Paid cohort, separate from and never pooled with the free cohorts. Judges are not human validated. Validity depends on completion and receipts only.
