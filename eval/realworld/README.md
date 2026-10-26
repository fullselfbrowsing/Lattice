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
  `results/datasets.json`. The ai4privacy texts are never committed. The
  `LICENSE.md` at the pinned revision grants them for academic research and
  non-commercial use when Ai4Privacy is acknowledged. Redistribution and
  commercial use need a written licence or a prior discussion with
  licensing@ai4privacy.com. Neither was requested. One author's primary
  affiliation is Full Self Browsing; the paper discloses that and publishes
  aggregate scores only. Gretel and ASQA are Apache-2.0.

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

## Notes on the committed records

These notes cover the places where a committed record, the script that writes
it, and the generated text differ.

- cosign. The measured run called `sign-blob` without `--tlog-upload=false`
  and `verify-blob` without `--insecure-ignore-tlog`. cosign v2.5.3 therefore
  uploaded a hashedrekord entry for the eval blob to the public Rekor log (log
  index 3359395843, 2026-10-21T17:05:01Z), the 4916 ms wrap time includes that
  round trip, and verification was online. Only the blob hash and a throwaway
  public key went to the log. The cosign entry in `compare.json` records this
  in its `correction` field, with `tlogUpload: true`, `offlineVerify: null`,
  and `verifyOk: true`. `04-compare.py` passes both flags, so a new run stays
  local.
- Replay. `replayOffline` returns the outputs the caller supplies, so the
  replay metric is a hash-binding check. The figures and tables call it
  signed output binding: yes when the record is signed and the system's own
  verifier rejected a byte edit. cosign, in-toto, Sello, Janus, and the
  NovaFabric capsule also meet it.
- Hosted overhead. The end-to-end times in `openrouter.json` include the HTTP
  time of retried attempts. `12-charts.py` computes end-to-end time as
  `latticeMs + providerMs` from the per-trial rows, which leaves retries out,
  and `10-openrouter.mjs` records it the same way. The two differ only for
  Xingchen (overhead p50 0.019% recorded and 0.032% computed; signed p50
  9820 ms recorded and 4812 ms computed) and one Liquid trial.
- Drift. `drift[].uniqueExact` in `openrouter.json` counts failed calls' empty
  answers. The published cells count successful answers only, and
  `10-openrouter.mjs` computes `uniqueExact` over successful answers.
- `datasets.json` scores Gretel credit cards with 0 gold documents because the
  run that wrote it did not map `credit_card_number`. The published Gretel card
  scores come from `pii-tools.json`, which maps it, and `02-score.mjs` maps it.
- The dataset precision, recall, and F1 rows for Lattice were measured with the
  `noPII` detectors at commit `a8cc091`. The current detectors narrow
  identifier-label suppression and require a cue for bare numbers; the mocked
  harness covers them.
- `mustCite`. The RAG verdicts in `live.json` and `openrouter.json` (the
  refund-policy passes, and the successes behind the drift cells) and the ASQA
  `mustCiteAnyGold` count in `datasets.json` and `citations.json` were
  measured with the `mustCite` rules at commit `a8cc091`. There, an inline
  `[name]` or `(name)` marker containing the artifact name counted as a
  citation by default. The current default reads only a structured
  `citations` or `evidence` list and never reads the answer text. The recorded
  RAG answers cite `[policy-refund]` only inline and the ASQA answers carry no
  list, so under the current default every recorded RAG call would fail and
  ASQA would accept no gold title. `01-live.mjs`, `10-openrouter.mjs`, and
  `02-score.mjs` pass `{ inline: true }` and record it as `mustCiteOptions`.
  With that option a bracket or parenthesis counts only when its content, or
  one comma- or semicolon-separated part of it, equals the name, so a new ASQA
  count can differ from the recorded one. `05-charts.py` and `12-charts.py`
  print the `a8cc091` note for records without `mustCiteOptions`.
