# Real-model evaluation

This directory records runs against a local Ollama model and the other record
systems that could be executed on the same machine. The mocked harness in
`eval/run-all.sh` is a different experiment.

`scripts/01-live.mjs` calls Ollama through Lattice's OpenAI-compatible adapter.
`scripts/02-prepare.py` and `scripts/02-score.mjs` score `noPII` and `mustCite`
on public datasets cached outside the repo (`REALWORLD_CACHE`, default
`/tmp/realworld-data`). The ai4privacy texts are not committed: the dataset
license allows academic use and forbids redistribution. `scripts/04-compare.py`
wraps the recorded payloads. `scripts/05-charts.py` writes the figures and the
LaTeX fragment from the JSON only.

Raw measurements are `results/live.json`, `results/datasets.json`, and
`results/compare.json`. Generated figures are `results/rw-*.pdf` and
`results/rw-*.png`. The comparison artifacts directory is gitignored because it
contains signing keys.
