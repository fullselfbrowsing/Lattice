# Lattice evaluation harness

Reproducible, **offline** evaluation of Lattice. Every provider call is served by an in-process fake `fetch` that returns provider-shaped JSON, so the harness needs no network access and no API keys.

```sh
./eval/run-all.sh                  # everything; TRIALS=1000 by default, TRIALS=100 for a quick pass
SKIP_LATENCY=1 ./eval/run-all.sh   # functional part only; keeps the latency results and env-latency.json
```
Requirements: Node >= 24, pnpm 10.33.1, and python3 with matplotlib and numpy (needed only for 06-report.py; set `PYTHON=` to pick an interpreter).

| Script | Experiment | Outputs (eval/results/) |
|---|---|---|
| 01-overhead.mjs | E1 latency of plain call / ai.run / signed ai.run / verify; E2 receipt size | overhead_summary.csv, overhead.json, receipt_sizes.csv, overhead_raw.csv* |
| 02-chain.mjs | E2b chained receipts (parentReceiptCid) by depth | chain_scaling.csv/json |
| 03-tamper.mjs | E3 tamper and attack suite plus chain splicing (library `verifyChain`) | tamper_summary.csv, chain_attacks.csv, tamper.json, tamper.log, tamper_raw.csv* |
| 04-replay.mjs | E4 offline replay across the 7 adapters from on-disk fixtures | replay_summary.csv, replay.json, replay.log, replay_raw.csv*, fixtures/* |
| 05-policy.mjs | E5 routing determinism and policy oracle; noPII and mustCite on a labeled set; receipt secret-leakage scan | pii_by_label.csv, mustcite.csv, leakage.csv, policy.json, policy.log, routing_raw.csv*, pii_raw.csv* |
| 07-v16.mjs | Audience, nonce, expiry, minVersion, structured advisories, verifyChain closure (requireClosure, partial, root-only), malformed closers, crew receipts from runAgentCrew, signer-failure modes, and the released 1.6.0 verifier on a new crew chain. Exits non-zero if any check fails. | v16.json, v16.log |
| (run-all) | E6 the repo's existing vitest suites | tests-lattice*.json/log* |
| 06-report.py | Plots, LaTeX tables, and paper macros, generated from the JSON (no hand-typed numbers) | SUMMARY.md, tests_summary.json, *.png; paper/eval-tables.tex, paper/numbers.tex, paper/Fig2-4.png |

\* gitignored; see below.

## Two environments

Latency depends on the machine; the functional results depend only on the library. They are recorded separately:

- **`results/env-latency.json`**: the latency run (Intel Xeon x4, Node v24.22.1, Linux, commit `4549334`). It covers 01-overhead and 02-chain (and `pnpm bench:receipts`), the overhead, size, and chain tables, Fig2-3, and the latency macros in `paper/numbers.tex` (`\Eval*` without `Func`, `\OverheadTrials`, `\SignDelta*`, `\VerifySmallMs`).
- **`results/env-functional.json`**: the functional run (this machine, Node version, and `libraryCommit`, the last commit that touched `packages/`). It covers 03-tamper, 04-replay, 05-policy, 07-v16, the vitest counts, the tamper, replay, policy, and verifier tables, Fig4, and every other macro (`\EvalFunc*`, `\Tests*`, `\Pii*`, `\MustCite*`, `\Route*`, `\Tamper*`, `\Replay*`, `\Leak*`, `\VerifierChecks*`).

Each table caption, the `paper/eval-tables.tex` header, and the `paper/numbers.tex` header name the environment they come from.

**Current results.** The functional scripts (03, 04, 05, 07) and both vitest suites were re-run against the library at `6d15f0a`. 01-overhead and 02-chain were not re-run, so their numbers stay from the latency run at `4549334`. 02-chain.mjs was changed afterwards only to report advisory codes; its timing code is unchanged.

## Labeled sets (05-policy.mjs)

- **noPII.** The original labels were written alongside the detectors, so their precision and recall are a regression check, not evidence. Added labels are appended after every original draw, so the seeded data for the original labels is unchanged. They are: real PII in support and CRM prose ("Customer SSN ...", "Patient ID ...", "Please call the customer at ...", tickets, CSV and markdown rows), more card networks (UnionPay, Maestro, Mir, Diners 309/39, RuPay; the generator asserts Luhn validity), and uncued numbers that are not PII (epoch seconds and milliseconds, byte counts, populations, ABA routing numbers, spaced triples, decimals, ZIP+4 without a dash, build ids). `ssn-spaced` now carries an SSN cue and `phone-plain10` NANP-valid digits; only their templates changed, not their place in the random stream. `policy.json` reports precision and recall overall and in-scope, each with all negatives and with only the original negatives, and separately for the original and added labels. Two added labels are documented misses (`crm-call-customer-plain10`: another word between the cue and a bare 10-digit number; `crm-csv-ssn-undashed`: the cue is on the header line).
- **mustCite.** The original 15 cases plus default-behavior cases (`[1]` with a list, markdown links, `[sic]`, a bracketed title outside a declared `path`) and opt-in cases (`inline`, `rejectUncited` with label-key and positional `[n]` resolution, a fabricated competing author-year citation, `textPath`). `inline-text-only` and `hallucinated-cite-string` are relabeled to the current default, under which prose is read only on opt-in, and each has an opt-in twin. `policy.json` also scores the original cases against the labels of the first run.

## Not committed, and how to regenerate it

These outputs are gitignored because they are large, churn on every run, or hold synthetic card and SSN strings that trip secret scanners:

- `results/*_raw.csv`: per-sample rows from 01, 03, 04, and 05 (`pii_raw.csv` contains the synthetic PII). Regenerate with the matching script.
- `results/fixtures/`: the 350 replay fixtures from 04-replay.mjs, plus `fixtures/keyset.json`, the public JWK keyset (the `KeyEntry[]` shape `lattice verify --key` reads). The private key is never written. To re-verify a fixture, take its `receipt` field and run `lattice verify <receipt.json> --key eval/results/fixtures/keyset.json`, or call `verifyReceipt(fixture.receipt, createMemoryKeySet(keyset))`.
- `results/tests-lattice*.json` and `results/tests-lattice*.log`: raw vitest output. 06-report.py copies the counts into the committed `results/tests_summary.json` and falls back to it when the raw files are absent. Regenerate with
  `pnpm --filter @full-self-browsing/lattice exec vitest run --reporter=json --outputFile=$PWD/eval/results/tests-lattice.json </dev/null`
  and the same for `@full-self-browsing/lattice-cli` (`tests-lattice-cli.json`).

The LaTeX tables are written only to `paper/eval-tables.tex` (there is no `results/tables.tex` copy). All synthetic data comes from fixed-seed PRNGs. See results/SUMMARY.md for the numbers.
