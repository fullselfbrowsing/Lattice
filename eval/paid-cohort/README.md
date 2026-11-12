# Paid-model cohort

A separately frozen, budget-bounded evaluation of three paid models on the work the free cohorts measured: the public-record refund review, citation quality, and the runtime checks. It reuses no free-cohort result and is never pooled with one. Nothing under `eval/public-refund`, `eval/realworld` or `packages` is edited; this directory only imports their frozen modules read-only, and the frozen cohorts hash those files.

## Models and prices

Tested models (each $2 per million input tokens, $10 per million output tokens): `anthropic/claude-sonnet-5.5`, `openai/gpt-6.1-sol`, `google/gemini-4-carbon`.

Judges, from two families that are not tested ($2 and $6 per million): `x-ai/grok-4.7`, `qwen/qwen3.8-max-0902`.

OpenRouter ignores `temperature` for the Claude and GPT models, so these runs are not deterministic and cannot be replayed to the same text. The Lattice adapter cannot send `reasoning` options, so evaluated runs use each provider's default reasoning, with `max_tokens` as the hard output cap. Judge calls send `reasoning: {max_tokens: 1024}` and `max_tokens: 2048` directly.

## Stages

| Stage | Script | Work | Planned rows |
| --- | --- | --- | --- |
| smoke | `validated-live.mjs smoke`, `judge.mjs probe` | One development citation question per model; two probes per judge. Excluded from every result. | 3 and 4 |
| A | `public-refund.mjs` | 3 models, 4 published decisions, 2 repetitions, cap 4096 | 24 |
| B | `validated-live.mjs B` | First 60 evaluation questions, contract arm live, cap 4096 | 180 |
| J | `judge.mjs full` | Each judge scores every format-valid stage B answer, cap 2048 | 2 per valid answer |
| C | `validated-live.mjs C` | Per model: transport 40 (two arms), privacy 20, agent 5, crew 5, latency 20 per arm plus 2 warmups per arm. Caps 1024, agent and crew 2048. | 528 |

Stage B runs only the contract arm. The prompt-only arm sends an identical request, so its outcome is derived offline from the same retained raw answer (`promptOnlyFormatValid`). Inputs must be identical to the free cohorts': the public-record inputs hash must equal the free protocol's `inputHash`, and the citation manifest and split hashes must equal those in `validated-free-full.json`. Freezing refuses otherwise.

## Budget and safety

- Hard ledger limit of $17.00 at `.context/paid-cohort/budget.json`; a limit above $20 is rejected. The older `.context/hosted-budget.json` and the free request ledger are never touched.
- Before every request a reservation is written: ((request bytes + 1,000 per image) x the highest input price across listed endpoints + `max_tokens` x the higher of completion and reasoning price + any request fee) x 1.25. The reservation is settled to `usage.cost`. An unknown cost keeps the whole reservation. A charge above the reservation halts the cohort permanently.
- One attempt per request. There are no retries, fallbacks, routing fields (`models`, `route`, `provider`, `plugins`, `preset`, `service_tier`, `web_search_options`) or server-side tools. 401, 402, 403 and transport errors stop the stage. Calls run one at a time, with models interleaved per item. Failed rows are recorded and stay in denominators.
- Stage admission: a stage starts only if `min(ledger remaining, account balance - $0.50)` covers its worst case (every call writes its full allowance, inputs 35% above the largest measured). The balance is read from `/credits` (`total_credits - total_usage`).
- Circuit breaker: after 10 calls in a stage, if the mean cost per call exceeds twice the expected cost, the stage stops and reports.
- Prices are snapshotted at the freeze and again at the start of each stage. A price increase on any frozen model refuses the stage. Equal or lower prices are recorded and allowed, and a changed endpoint list alone does not refuse a stage.
- Code, input hashes, models, caps, counts and the ledger limit are frozen in `results/protocol.json` at the first stage run. A later run recomputes them and refuses to extend the cohort if anything differs. Real runs require a clean tree for the harness and the modules it imports.
- The credential is read by `common.mjs` only (`OPENROUTER_KEY_FILE`, defaulting to the existing key file). Every file write and log line is scrubbed, files are written atomically with mode 0600, and the key is never read in a dry run.

## Run order

1. Build the SDK if `packages/lattice/dist` is missing: `pnpm --filter @full-self-browsing/lattice build </dev/null`.
2. Test: `node --test --test-reporter=tap eval/paid-cohort/*.test.mjs eval/public-refund/workflow.test.mjs </dev/null`.
3. Commit the harness.
4. Smoke (this also freezes the protocol): `node eval/paid-cohort/validated-live.mjs smoke`, then `node eval/paid-cohort/judge.mjs probe`. Both must pass: no non-200 status, outputs parse, `usage.cost` present, completion tokens within the cap, cost within the reservation, receipts verify, judge sanity probes agree. Any failure stops the run for re-planning.
5. Stage A: `node eval/paid-cohort/public-refund.mjs`, then `node eval/paid-cohort/public-refund-report.mjs`.
6. Stage B: `node eval/paid-cohort/validated-live.mjs B`; stage J: `node eval/paid-cohort/judge.mjs full`.
7. Stage C if admitted: `node eval/paid-cohort/validated-live.mjs C`.
8. Report: `node eval/paid-cohort/report.mjs` writes `results/summary.json` and `results/summary.md` and prints VALID or INVALID.
9. Reconcile: the report lists, per stage, the ledger spend against the change in the OpenRouter account balance. Confirm the two agree to within a few cents.

A stage that stops can be re-run with the same command; finished rows are kept and never retried, and an interrupted row is marked interrupted.

## Reporting rule (fixed before the run)

The run is VALID if every admitted stage completes, at least 95% of planned calls return a model response, and every successful run's receipt verifies. Stages A, B and J must have been admitted; stage C must complete if it was admitted. No score takes part in this decision: `validity()` in `report.mjs` receives only completion and receipt counts. If the run is valid, the paid cohort replaces the free cohort as the main reported result. The free cohort stays reported either way, with its frozen results, in an appendix that states the paid run came after it. If the run is invalid, the free cohort stays the main result and the paid run is an incomplete follow-up. The two cohorts are never pooled.

## Dry run

`PAID_DRY_RUN=1` swaps the transport for `mock.mjs`, an offline stand-in with fixture catalog, endpoint, account and completion data. It makes no network call (the global `fetch` is replaced by a function that throws) and never reads the credential. Outputs, private files and the ledger must be redirected to a directory under `/tmp` and outside the repository:

```
D=$(mktemp -d /tmp/paid-dry-XXXX)
PAID_DRY_RUN=1 PAID_OUT_DIR=$D/out PAID_PRIVATE_DIR=$D/priv node eval/paid-cohort/validated-live.mjs smoke
```

`PAID_DRY_COUNTS` (a JSON object of reduced counts) is accepted only in a dry run and is recorded in the protocol. The mock honours `PAID_MOCK_402_AFTER`, `PAID_MOCK_CREDITS`, `PAID_MOCK_PRICE_FACTOR` and `PAID_MOCK_EXTRA_ENDPOINT` so the tests can exercise halts, admission and price checks. `dry-run.test.mjs` runs every stage and both reports end to end.

## Boundaries

Judges are not human validated. The public-record review uses published decisions that include their outcomes; it is retrospective document review, not outcome prediction. Audited public-record scores apply the free cohort's two-directional source audit (`eval/public-refund/results/source-audit.json`) to the saved per-answer grades. Scoring text about these results is written by the authors; the generated tables are not manuscript text.
