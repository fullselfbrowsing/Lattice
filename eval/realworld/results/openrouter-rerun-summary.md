# Hosted OpenRouter rerun – summary

- New: library commit c5f79b0, run started 2026-10-26T19:13:36.986Z (UTC; 2026-10-26 14:13 CDT), file `openrouter-rerun.json`, 7 models.
- Old: library commit a8cc091, started 2026-10-22T00:47Z (2026-10-21 19:47 CDT), `eval/realworld/results/openrouter.json`, 8 models.
- Lattice ms and % are recomputed uniformly from per-trial rows (signed calls that succeeded): % = 100·latticeMs/(latticeMs+providerMs). n=5 trials per model, so p95 is essentially the max. Pacing sleeps, 429 backoff and failed-attempt HTTP time are excluded.
- Free tier with heavy 429 rate limiting; none of this is a benchmark of the models.

## xingchen-agi/xing4.0-29b-a4b:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | 2.94 / 6.12 | 1.21 / 3.11 |
| Overhead % of end-to-end p50 / p95 | 0.099 / 0.198 | 0.032 / 0.033 |
| Extra prompt tokens (median) | 80 (n=2) | 82 (n=4) |
| Replay ok | 14/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) | 11/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | 14/20 ok, 14 cited | 11/20 ok, 11 cited |
| Ticket leak into signed record / answer in-scope PII | no / answerPII no | no / answerPII no |
| Crew outcome | success (4 receipts, chain closed True) | success (3 receipts, chain closed None) |
| Error codes | Provider returned error×6; HTTP 429×5; xingchen-agi/xing4.0-29b-a4b:free is temporar×1 | Provider returned error×2; xingchen-agi/xing4.0-29b-a4b:free is temporar×8; HTTP 429×1 |

## nvidia/nemotron-3.5-super-vl:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | 2.26 / 3.13 | 1.20 / 1.94 |
| Overhead % of end-to-end p50 / p95 | 0.192 / 0.316 | 0.138 / 0.245 |
| Extra prompt tokens (median) | 80 (n=4) | 80 (n=4) |
| Replay ok | 19/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | 19/20 ok, 19 cited | 20/20 ok, 20 cited |
| Ticket leak into signed record / answer in-scope PII | no / answerPII no | no / answerPII no |
| Crew outcome | success (4 receipts, chain closed True) | success (4 receipts, chain closed None) |
| Error codes | Upstream idle timeout exceeded×2 | none |

## nvidia/nemotron-3.5-lightning:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | 2.09 / 2.27 | 1.10 / 1.90 |
| Overhead % of end-to-end p50 / p95 | 0.066 / 0.110 | 0.053 / 0.077 |
| Extra prompt tokens (median) | 81 (n=5) | 82 (n=5) |
| Replay ok | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | 20/20 ok, 20 cited | 20/20 ok, 20 cited |
| Ticket leak into signed record / answer in-scope PII | no / answerPII no | no / answerPII no |
| Crew outcome | success (4 receipts, chain closed True) | success (3 receipts, chain closed None) |
| Error codes | none | none |

## dots-studio/dots-3-note-preview:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | 1.66 / 1.83 | 1.50 / 1.88 |
| Overhead % of end-to-end p50 / p95 | 0.082 / 0.156 | 0.123 / 0.141 |
| Extra prompt tokens (median) | 71 (n=5) | 74 (n=5) |
| Replay ok | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | 20/20 ok, 20 cited | 20/20 ok, 20 cited |
| Ticket leak into signed record / answer in-scope PII | no / answerPII no | no / answerPII no |
| Crew outcome | success (4 receipts, chain closed True) | success (4 receipts, chain closed None) |
| Error codes | none | none |

## liquid/lfm-2.5-2.6b:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | 1.69 / 2.05 | 1.65 / 3.65 |
| Overhead % of end-to-end p50 / p95 | 0.128 / 0.716 | 0.035 / 0.070 |
| Extra prompt tokens (median) | 62 (n=5) | 61 (n=5) |
| Replay ok | 17/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | 17/20 ok, 17 cited | 20/20 ok, 20 cited |
| Ticket leak into signed record / answer in-scope PII | no / answerPII no | no / answerPII no |
| Crew outcome | crew-budget-exceeded (3 receipts, chain closed True) | provider_execution (3 receipts, chain closed None) |
| Error codes | HTTP 429×3; Provider returned error×3 | none |

## thinkingmachines/inkling-small:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | n/a | n/a |
| Overhead % of end-to-end p50 / p95 | n/a | n/a |
| Extra prompt tokens (median) | n/a | n/a |
| Replay ok | n/a | n/a |
| RAG | n/a | n/a |
| Ticket leak into signed record / answer in-scope PII | n/a | n/a |
| Crew outcome | n/a | n/a |
| Error codes | unavailable (provider rejects ordinary chat) | unavailable (provider rejects ordinary chat) |

## poolside/laguna-s-2.1:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | 3.01 / 3.29 | 1.56 / 3.57 |
| Overhead % of end-to-end p50 / p95 | 0.265 / 0.344 | 0.142 / 0.261 |
| Extra prompt tokens (median) | 73 (n=5) | 76 (n=5) |
| Replay ok | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | 20/20 ok, 20 cited | 20/20 ok, 20 cited |
| Ticket leak into signed record / answer in-scope PII | no / answerPII no | no / answerPII no |
| Crew outcome | crew-budget-exceeded (3 receipts, chain closed True) | success (4 receipts, chain closed None) |
| Error codes | none | none |

## minimax/minimax-m3.1-flash:free

| Metric | New (c5f79b0) | Old (a8cc091) |
|---|---|---|
| Lattice overhead ms p50 / p95 | – | 1.69 / 3.35 |
| Overhead % of end-to-end p50 / p95 | – | 0.218 / 0.311 |
| Extra prompt tokens (median) | – | 63 (n=5) |
| Replay ok | – | 20/20 output-hash match (receipt verified, materialized, altered-copy detected: 20/20) |
| RAG | – | 20/20 ok, 20 cited |
| Ticket leak into signed record / answer in-scope PII | – | no / answerPII no |
| Crew outcome | – | success (4 receipts, chain closed None) |
| Error codes | – | none |

*Not in the rerun: the model was absent from OpenRouter's catalog at rerun time.*

## What changed or failed (honest list)

- **Replay:** every receipt that was produced verified, materialized, and had its altered copy detected (20/20 on every model). The "x/20" above counts replays whose *output hash matched*; misses are the free model giving a different answer on re-execution, not a signature or chain failure. Xing 14/20 (old 11/20), Nemotron-VL 19/20 (was 20), Liquid 17/20 (was 20); the other four models 20/20.
- **Crew budget exceeded:** Liquid and Laguna ended with `crew-budget-exceeded`, 3 receipts, empty answer. The harness gives the crew `maxIterations 4` and `maxWallTimeMs 180000`, and the runs used only 1 and 2 iterations, so the iteration cap is not the cause. The recorded unaccounted (pacing / 429 backoff sleep) time in those two runs was 485 s (Liquid) and 225 s (Laguna), far over the 180 s wall-clock budget, so the most likely cause is the free-tier rate-limit waits tripping the wall-time budget (inferred from the numbers, not proven from a log). It is a harness/free-tier artifact rather than a model or signing failure, and the 3-receipt chain still closed OK (auditable partial run). It does mean crew success is not demonstrated for those two models in this run (Laguna was success/4 receipts before; Liquid was `provider_execution` (provider timeout), 3 receipts, before). A fix would be to exclude pacing sleeps from the budget or raise it for the harness.
- **Inkling:** still unusable. Provider says it is only available on agentic harnesses (recorded as HTTP 403 in the runner note); no data in either run.
- **Minimax:** not in the rerun, not found in OpenRouter's catalog on the rerun date.
- **Not rerun:** the single-agent stage and the multimodal/image stage are null for every model (old run had the agent stage; old Nemotron-VL image test got the colour wrong through Lattice). Single-agent receipt count was 0 in the old run; the bugs are unverified on this commit.
- **RAG failures are rate limits, not Lattice:** Xing 6/20 failed (HTTP 429 / provider error; 14/20 ok vs old 11/20), Liquid 3/20 (429), Nemotron-VL 1/20 (upstream idle timeout).
- **Overhead:** Lattice time is 1.7 to 3.0 ms median on every model, 0.07 to 0.27% of end-to-end at the median (max p95 0.72% on Liquid, one slow-provider-fast outlier). The median is up from the old run by 0.0 to 1.7 ms depending on model (Xing +1.7, Laguna +1.5, Nemotron-VL +1.1, Lightning +1.0, dots +0.2, Liquid +0.04; possibly a slower machine or the new PII cue rules and crew chain), still far below 1% of the provider time. n=5 per model, so treat as indicative.
- **Privacy:** no ticket PII in any signed record and none in any answer (6 of 6 usable models).
- **Extra prompt tokens:** 62 to 81 (median), unchanged from before; no measurable latency effect.
- **Data provenance:** old p50/p95 pct values in the repo's own summary used retry-inclusive timing (see the file's `correction`), so both columns here are recomputed uniformly from per-trial rows.
