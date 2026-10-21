# Lattice evaluation harness

Reproducible, **offline** evaluation of Lattice. Every provider call is served by an in-process fake `fetch` that returns provider-shaped JSON, so the harness needs no network access and no API keys.

```sh
./eval/run-all.sh            # TRIALS=1000 by default; TRIALS=100 for a quick pass
```
Requirements: Node >= 24 (tested with v24.22.0), pnpm 10.33.1, and python3 with matplotlib (needed only for the plots).

| Script | Experiment | Outputs (eval/results/) |
|---|---|---|
| 01-overhead.mjs | E1 latency of plain call / ai.run / signed ai.run / verify; E2 receipt size | overhead_raw.csv, overhead_summary.csv, overhead.json, receipt_sizes.csv |
| 02-chain.mjs | E2b chained receipts (parentReceiptCid) by depth | chain_scaling.csv/json |
| 03-tamper.mjs | E3 tamper and attack suite plus chain splicing | tamper_raw.csv, tamper_summary.csv, chain_attacks.csv, tamper.json |
| 04-replay.mjs | E4 offline replay across the 7 adapters from on-disk fixtures | replay_raw.csv, replay_summary.csv, fixtures/ |
| 05-policy.mjs | E5 routing determinism and policy oracle; noPII and mustCite on a labeled set; receipt secret-leakage scan | routing_raw.csv, pii_raw.csv, pii_by_label.csv, mustcite.csv, leakage.csv, policy.json |
| 07-v16.mjs | Audience, nonce, expiry, minVersion, verifyChain, crew chain closure, signer-failure modes | v16.json |
| (run-all) | E6 the repo's existing vitest suites | tests-lattice*.json/log |
| 06-report.py | LaTeX tables and plots, generated from the JSON (no hand-typed numbers) | tables.tex, *.png |

All synthetic data comes from fixed-seed PRNGs. Hardware and runtime details are in results/env.json. See SUMMARY.md for findings and caveats.
