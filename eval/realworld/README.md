# Real-model evaluation

This directory records runs against a local Ollama model, hosted `:free`
models on OpenRouter, and the other record systems that could be executed on
the same machine. The mocked harness in `eval/run-all.sh` is a different
experiment.

## Setup

- Build the library first (`pnpm build`); the scripts import
  `packages/lattice/dist`.
- Python packages: `pip install -r eval/realworld/requirements-realworld.txt`.
- Comparison systems: `eval/realworld/fetch-competitors.sh` clones Agent
  Flight Recorder, NovaFabric, Sello, and Janus at the commits recorded in
  `results/compare.json` into `CMP_DIR` (default `eval/realworld/.cache/cmp`,
  gitignored). The scripts import or run code from these checkouts, so keep
  `CMP_DIR` writable only by you.
- cosign v2.5.3 on `PATH` or in `COSIGN_BIN`, the `nova` CLI, Go (the Janus
  shim builds with `GOTOOLCHAIN=go1.26.8`), Ollama with `llama3.2:3b`, and a
  Portkey gateway on 127.0.0.1:8787 for `08-gateways.py`.
- Janus: `integrations/janus/go.mod` and `go.sum` are gitignored.
  `04-compare.py` runs `go mod init`, points the module at
  `$CMP_DIR/janus` with `go mod edit -replace`, and runs `go mod tidy` before
  `go build`.
- Datasets are cached outside the repo in `REALWORLD_CACHE` (default
  `/tmp/realworld-data`). `scripts/02-prepare.py --download` fetches the three
  source files with `huggingface_hub` at the revisions in
  `results/datasets.json`. The ai4privacy texts are never committed: the
  license allows academic, non-commercial use with acknowledgement and forbids
  redistribution.

Environment variables: `NODE_BIN` (default `node` on `PATH`), `PYTHON`,
`REALWORLD_CACHE`, `CMP_DIR`, `COSIGN_BIN`, `LATTICE_SPANS` (default
`$REALWORLD_CACHE/lattice-spans.jsonl`), `REUSE_LATTICE_SPANS=1`,
`PII_SKIP_LLM_GUARD=1`, `GLINER_REVISION`, and `OPENROUTER_API_KEY` or
`OPENROUTER_KEY_FILE`.

## Scripts

`run-all.sh` runs 01-05. `RUN_BROAD=1 run-all.sh` also runs 06-12.

| Script | Needs | Writes |
| --- | --- | --- |
| `01-live.mjs` | Ollama with `llama3.2:3b` | `live.json`, `payloads.json` |
| `02-prepare.py` | pyarrow; `--download` needs huggingface_hub | cache files, `dataset-meta.json` in the cache |
| `02-score.mjs` | the cache | `datasets.json` |
| `03-wrap.mjs` | Sello checkout; run by 04 | `wrap-node.json` |
| `04-compare.py` | checkouts, cosign, nova, Go, in-toto, OpenTelemetry SDK | `compare.json` |
| `05-charts.py` | matplotlib, numpy | `rw-latency`, `rw-pii`, `rw-bytes`, `realworld.tex`, `feature-matrix.tex` |
| `06-lattice-spans.mjs` | the cache; run by 06-pii-tools | `$LATTICE_SPANS` |
| `06-pii-tools.py` | the cache, Presidio, spaCy `en_core_web_sm`, GLiNER | `pii-tools.json` |
| `06-llm-guard-only.py` | llm-guard | LLM Guard row of `pii-tools.json` |
| `07-cite.py` | the cache; `--nli` needs transformers | `citations.json` |
| `08-gateways.py` | Ollama, LiteLLM, LangChain, traceloop-sdk, Portkey | `gateways.json` |
| `09-tamper-classes.py` | checkouts, node; runs `09-lattice-mutations.mjs` | `tamper-classes.json` |
| `10-openrouter.mjs` | OpenRouter key; calls only `:free` models | `openrouter.json` |
| `11-rescore-lattice.py` | optional; the span file | Lattice row of `pii-tools.json` |
| `12-charts.py` | matplotlib, numpy | the other `rw-*` figures, `realworld-broad.tex` |

`05-charts.py` and `12-charts.py` read only the JSON in `results/` and need no
network or model. Their figures are deterministic: PDFs carry no creation date
and PNGs no software string. Both write to `results/` and copy the PDFs and the
`.tex` fragments into `paper/` and `paper/ieee/`. The PNGs stay in `results/`.
The comparison artifacts directory is gitignored because it contains signing
keys. Do not commit API keys. `10-openrouter.mjs` reads the key from the
environment and refuses to write a file that still contains it.

## Corrections recorded after the run

The committed measurements were not re-run. These corrections were made to the
records and the generated text afterwards.

- cosign. `04-compare.py` called `sign-blob` without `--tlog-upload=false` and
  `verify-blob` without `--insecure-ignore-tlog`. cosign v2.5.3 therefore
  uploaded a hashedrekord entry for the eval blob to the public Rekor log (log
  index 3359395843, 2026-10-21T17:05:01Z), the 4916 ms wrap time includes that
  round trip, and verification was online. Only the blob hash and a throwaway
  public key went to the log. `compare.json` now says so, its `offlineVerify`
  for cosign is `null` (with `verifyOk: true`), and the script passes both
  flags for future runs.
- Replay. `replayOffline` returns the outputs the caller supplies, so the
  former replay metric is a hash-binding check. The figures and tables call it
  signed output binding: yes when the record is signed and the system's own
  verifier rejected a byte edit. cosign, in-toto, Sello, Janus, and the
  NovaFabric capsule also meet it.
- Hosted overhead. `10-openrouter.mjs` added the HTTP time of retried attempts
  to the end-to-end time. `12-charts.py` recomputes end-to-end time as
  `latticeMs + providerMs` from the per-trial rows. Only Xingchen (p50
  0.019% to 0.032%, signed p50 9820 ms to 4812 ms) and one Liquid trial
  changed. The script no longer adds retry time.
- Drift. `drift[].uniqueExact` in `openrouter.json` counted failed calls'
  empty answers. The published cells already counted successful answers only;
  the script now writes them that way.
- `datasets.json` scores Gretel credit cards with 0 gold documents because
  `02-score.mjs` did not map `credit_card_number`. The published Gretel card
  scores come from `pii-tools.json`, which maps it. The map is fixed for future
  runs.
- The dataset precision, recall, and F1 rows for Lattice were measured with the
  `noPII` detectors at commit `a8cc091`. Later detectors narrow identifier-label
  suppression and require a cue for bare numbers; the mocked harness covers
  them.
