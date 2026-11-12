---
phase: quick-261112-fyy
plan: 01
subsystem: eval
tags: [eval, paid-cohort, openrouter, budget, dry-run]
requires: []
provides:
  - eval/paid-cohort harness (ledger, observer, stage scripts, judge, reports, mock transport)
affects: [paper results, eval/paid-cohort/results (future)]
tech-stack:
  added: []
  patterns: [reserve-before-send ledger, single-attempt observer, freeze-and-refuse protocol, offline mock transport]
key-files:
  created:
    - eval/paid-cohort/budget.mjs
    - eval/paid-cohort/observer.mjs
    - eval/paid-cohort/common.mjs
    - eval/paid-cohort/public-refund.mjs
    - eval/paid-cohort/public-refund-report.mjs
    - eval/paid-cohort/validated-live.mjs
    - eval/paid-cohort/judge.mjs
    - eval/paid-cohort/report.mjs
    - eval/paid-cohort/mock.mjs
    - eval/paid-cohort/README.md
    - eval/paid-cohort/budget.test.mjs
    - eval/paid-cohort/observer.test.mjs
    - eval/paid-cohort/dry-run.test.mjs
  modified: []
key-decisions:
  - "Prices are re-snapshotted per stage; only an increase on a frozen model refuses a stage (code, inputs, models, caps, counts and ledger limit compare strictly)."
  - "Stage admission reads the account balance from /credits through the transport and uses min(ledger remaining, balance - 0.50)."
  - "Validity (VALID/INVALID) is a function of completion and receipt counts only; stages A, B and J must have been admitted, C must complete if admitted."
  - "Dry run requires output, private and ledger paths under /tmp and outside the repo; path overrides and PAID_DRY_COUNTS are rejected outside a dry run."
metrics:
  tasks: 3
  files: 13
  completed: 2026-11-12
---

# Phase quick-261112-fyy Plan 01: Paid-model cohort harness Summary

A separately frozen, $17-capped paid-model evaluation harness in `eval/paid-cohort/` (three paid models, two judges, stages A, B, J, C) with an offline dry-run mode. No paid stage was run, no credential was read and no network call was made.

## Commits

- `edb0e2b` feat(eval): ledger, single-attempt observer, freeze helpers (Task 1)
- `4f021aa` feat(eval): stage scripts, judge, report and README (Task 2)
- `5679a78` test(eval): offline mock transport and end-to-end dry run (Task 3)

## What was built

- `budget.mjs`: `PaidBudget` (persisted reserve/settle, null cost keeps the reservation, overcharge halts permanently, limit above $20 rejected), `requestBound`, `admit`, `stageCeiling`, `CircuitBreaker`.
- `observer.mjs`: five-model allowlist, `max_tokens` required and at most 4096, forbidden routing keys, exactly one HTTP attempt (an identical body in the same run is refused, 429 and 5xx are measured, 401/402/403 and transport errors halt), `init.body === expectedBody` check kept, full call record including reasoning tokens.
- `common.mjs`: key loading (never in a dry run), scrubbing, atomic 0600 writes, clean-tree guard, code and input hashing, `freezeProtocol`, per-stage price re-snapshot, account snapshot, stage admission and bookkeeping, smoke verdict and gates.
- Stage scripts: `public-refund.mjs` (A), `validated-live.mjs smoke|B|C`, `judge.mjs probe|full`, `public-refund-report.mjs`, `report.mjs` (summary.json, summary.md, VALID/INVALID).
- `mock.mjs`: fixture catalog, endpoints, `/key`, `/credits` and completions shaped from the request body.

## Verification

- `node --test --test-reporter=tap eval/paid-cohort/*.test.mjs eval/public-refund/workflow.test.mjs eval/realworld/scripts/*.test.mjs` : 46 passed, 0 failed.
- Dry run (all stages, both reports) reports VALID: smoke 3 and 4, A 24/24, B 180/180, J 340/340, C 528/528, receipts 464/464, stage A bundles 24/24 verified in a fresh process with 10/10 integrity controls. Ledger spend equals the sum of mock call costs and the mock account delta.
- Negative cases tested: a 402 halts the stage and the report prints INVALID; a changed protocol or hand-edited cap refuses to extend; a price increase refuses a stage while a longer endpoint list at the same price does not; low balance means not admitted (exit 3); later stages need the smoke gates; path overrides outside a dry run or outside /tmp are rejected; scores can be wiped without moving the verdict.
- `git diff --stat HEAD -- eval/public-refund eval/realworld packages` is empty; no result files were created under `eval/paid-cohort/results/` or `.context/paid-cohort/`.

## Deviations from Plan

None to the plan's behavior. Choices where the plan was open:

- The one-sided `rubric-audit.json` is not used for audited scores; only the complete two-directional `source-audit.json` is applied (the former is documented as superseded).
- Stage C ceiling assumes 4 calls per agent run and 6 per crew run. It will differ from the plan's $6.00 estimate, which has no stated call model.
- Stages A, B and J are required to have been admitted for VALID (the plan's rule covers admitted stages only; an unadmitted core stage would otherwise be vacuously valid).

## Notes for the orchestrator

- `/credits` is read through the transport for admission and reconciliation; if the real key cannot read it, admission fails closed (exit 3) and nothing is spent.
- Real runs need a clean tree for `eval/paid-cohort/*.mjs` and the imported eval modules; the dry run skips this check. `README.md` and the test files are not hashed into the freeze.
- The Lattice SDK may attempt its own re-sends; the observer refuses an identical body twice in one run, so a retry becomes a recorded failed row.
- Stage order: smoke (`validated-live.mjs smoke`, `judge.mjs probe`), A, A report, B, J, C, `report.mjs`. Stage A and later stages refuse to start without both smoke gates.

## Known Stubs

None.

## Self-Check: PASSED

All 13 files exist under `eval/paid-cohort/`; commits `edb0e2b`, `4f021aa`, `5679a78` are on branch `eval/paid-cohort`.

## Review fixes

Applied in one follow-up commit (see git log on `eval/paid-cohort`); tests 57/57 pass; `git diff --stat HEAD -- eval/public-refund eval/realworld packages` is empty.

1. observer.mjs: per-stage timeouts (`TIMEOUTS_MS` in common.mjs, frozen in the protocol and passed through `bootstrap`: smoke, A, B 300000; J 180000; C 120000). `messageText` mirrors the SDK's `openAIMessageText` for array content (no "[object Object]"). Every egress body is pushed to `active.requestBodies` inside the observer (the stage A wrapper that did this was removed). `usageAnomaly` halts the ledger permanently (`PaidBudget.halt`) when completion tokens exceed 1.25 x max_tokens + 32 or prompt tokens exceed the reservation's token bound (bytes + 1000 per image); the call is recorded first.
2. validated-live.mjs: one signing key per stage at `.context/paid-cohort/<stage>-signing-key.json` and trust anchor at `results/<stage>-public-key.json`, reused on resume, hash recorded as `trustAnchorHash`. Rows are written as `started` before the call and replaced on finish; on load `started` becomes `interrupted` and is skipped. Private rows now hold receipt(s), all request bodies, outputs and the expected task/policy hashes.
3. judge.mjs: same started/interrupted pattern.
4. verify-validated.mjs (fresh process) for smoke, B and C writes `results/verification-<stage>.json`; report.mjs takes B and C receipt counts only from these files (A from its fresh-process summary), and an admitted stage without its file makes the verdict INVALID.
5. smokeVerdict no longer gates on parse. Judge probes: a judge failing any probe is excluded from J and recorded (`perJudge`, `passedJudges`, `excludedJudges`); the gate passes if at least one judge passes.
6. `EXPECTED_PER_CALL_USD.C` is 0.004.
7. parity.test.mjs (read-only): stage A 16/16 free bundle bodies, stage B 60 questions x 3 free models = 180 bodies, and the smoke development body are all byte-identical with the model id swapped. Shared builders moved to requests.mjs.
8. dry-run.test.mjs and observer.test.mjs extended (verification files, interrupted rows, judge exclusion, smoke not parse-gated, array content, anomaly halt, tampered body detection); README updated (timeouts, judge rule, derived prompt-only arm is not an independent sample and arm differences must not be compared across cohorts, parity test).

Not done / notes: the mock can force only one bad judge at a time, so "both judges fail" is covered by code path only. `paper/JITCAR-TODO.md` shows as modified in the working tree; it is not mine and was not committed.

## Run results (orchestrator, Nov 12)

The orchestrator ran the paid stages after the harness was committed. Verdict from `report.mjs`: **VALID**. Every admitted stage completed, 98.3% of planned calls returned a response, and 384/384 successful runs' receipts verified in fresh processes.

| Stage | Planned | Responded | Result | Ledger confirmed |
|---|---|---|---|---|
| Smoke (citations, judges) | 3 + 4 | 3 + 4 | infrastructure checks passed; both judges passed their probes | $0.03 |
| A public-record review | 24 | 23 | strict 22/24 (Sonnet 7/8, Sol 8/8, Carbon 7/8), frozen and audited alike; 10/10 controls | $0.31 |
| B citations | 180 | 179 | 152/180 format-valid (Sonnet 60, Sol 56, Carbon 36) | $1.06 |
| J judging (Qwen only) | 152 | 152 | strict: Sonnet 34/60, Sol 46/60, Carbon 26/60 | $1.14 |
| C runtime checks | 408 | 397 | all four suites admitted; signed minus direct median wall time +42, +18, -29 ms | $0.41 |

Spend: OpenRouter billed $3.0026 since the top-up, all through one key. The ledger confirmed $2.9720 and held $0.8656 for 16 calls that reported no cost; those were actually billed about $0.03. The balance is $16.87.

Orchestrator fixes during the run, each committed before inference continued:
- **`dcfe066`:** admission priced every endpoint, including OpenAI's opt-in ultrafast tier ($12/$60 per million), so stage B could never be admitted. Admission now uses standard tiers; reservations still use every endpoint. Smoke attempt 1 is archived.
- **`08e15df`:** xAI adds a hidden system prompt, so a judge's prompt tokens exceeded the request's byte length. That false-positive halt led to a provider prompt allowance (512 tokens for tested models, 2,048 for judges). Stage C is now admitted suite by suite, and transport is 20 per arm, as planned. Smoke attempt 2 is archived, and the halt is kept under `resolvedHalts`.
- **`03ca8de`, `9260270`:** disclosed protocol amendment A1. Grok 4.7 overran its output cap (5,101 tokens against 2,048) and timed out on 2 of 5 calls, so it was excluded from stage J by the author's decision, made before further judging. `protocol.json` is unchanged.
- **`a33df6f`:** the final results.

Paper integration is a separate step. Under the fixed reporting rule the paid cohort becomes the main result, with the free cohort in an appendix. The authors write the text and disclose amendment A1; tables are generated afterwards.
