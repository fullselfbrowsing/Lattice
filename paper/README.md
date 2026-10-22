# Lattice papers

`main.tex` is the Information Systems Frontiers draft. It uses the article class with author-year citations (`natbib`, `apalike`) and a design-science frame. Figure 1 is drawn with TikZ (`tikz`, libraries `arrows.meta` and `positioning`). Springer Nature's `sn-jnl` class is not vendored: the template download page is script-rendered, so this build could not fetch `sn-jnl.cls`. Before submission, port the body into `\documentclass[pdflatex,sn-apa]{sn-jnl}`.

`ieee/main.tex` is the IEEE conference version. It vendors `IEEEtran.cls` and `IEEEtran.bst`. Under pdfLaTeX, text and math use `mathptmx`; under XeTeX or LuaTeX (including Tectonic), they use the TeX Gyre Termes, Heros, and Cursor fonts and TeX Gyre Termes Math. See `ieee/README.md`.

## Generated files

Do not type numbers into the narrative by hand, and do not edit these files. Rerun the generator instead.

| File in `paper/` | Generator |
|---|---|
| `numbers.tex`, `eval-tables.tex`, `Fig2.png`, `Fig3.png`, `Fig4.png` | `eval/scripts/06-report.py`, from `eval/results/*.json` |
| `bench/results.json` | `scripts/bench-receipts.mjs` (run by `pnpm bench:receipts`) |
| the `bench-table`, `bench-prose`, and `bench-platform` blocks in `ieee/main.tex` | `scripts/render-bench-table.mjs`, from `bench/results.json` (also run by `pnpm bench:receipts`) |
| `realworld.tex`, `realworld-matrix.tex`, `rw-latency.pdf`, `rw-pii.pdf`, `rw-bytes.pdf` | `eval/realworld/scripts/05-charts.py`, from `eval/realworld/results` |
| `realworld-broad.tex` and the other `rw-*.pdf` figures | `eval/realworld/scripts/12-charts.py`, from `eval/realworld/results` |

The real-world generators write the same fragments and PDFs into `paper/` and `paper/ieee/`, so each paper builds on its own. The papers include the PDF figures only. The `rw-*.png` previews stay in `eval/realworld/results`.

The latency results (`tab:overhead`, `tab:size`, `tab:chain`, `Fig2.png`, `Fig3.png`, and the `\Eval*` macros) come from the original measurement run on an Intel Xeon host, recorded in `eval/results/env-latency.json`. The functional results (tamper, replay, policy, verifier checks, test counts, and the `\EvalFunc*` macros) were re-run without re-measuring latency and are recorded in `eval/results/env-functional.json`. `eval/run-all.sh` and `pnpm bench:receipts` re-measure latency on the host that runs them, so running them replaces the Xeon numbers.

## Build

With a TeX Live installation:

```sh
cd paper && make            # latexmk -pdf
cd paper/ieee && make
```

With [Tectonic](https://tectonic-typesetting.github.io/), which fetches packages on demand:

```sh
cd paper && make tectonic   # tectonic -X compile main.tex --keep-logs
```

Tectonic exits 0 when references or citations are undefined, so check the log:

```sh
grep -n "undefined\|Citation" main.log
```
