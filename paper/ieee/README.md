# Lattice IEEE Conference Paper

This directory contains the IEEE-conference LaTeX draft about Lattice: a
capability-first TypeScript runtime that, when a signer is configured, emits a
signed, canonical capability receipt for each `ai.run` call and a chain of
receipts for each multi-agent crew run.

- Title: Lattice: Signed, Replayable Capability Receipts for Model Runs
- Author: Lakshman Turlapati, Full Self Browsing
- Email: lakshmanturlapati@gmail.com
- Co-author: Rabih Neouchi, Naveen Jindal School of Management, The University of Texas at Dallas
- Code: https://github.com/fullselfbrowsing/Lattice
- Document class: `\documentclass[conference]{IEEEtran}`

## Files

- `main.tex` is the full two-column paper.
- `refs.bib` is the bibliography. It is compiled with `\bibliographystyle{IEEEtran}`.
- `IEEEtran.cls` and `IEEEtran.bst` are vendored, so the build does not depend on
  the TeX distribution shipping them.
- `Makefile` drives the build with `latexmk` (pdfLaTeX) or `tectonic`.
- `.gitignore` excludes LaTeX and tectonic build artifacts. It keeps the
  committed `main.pdf` and the `rw-*.pdf` figures.

### Generated content

Do not edit these by hand; rerun the generator instead.

- `realworld.tex` and `realworld-matrix.tex` are written by
  `eval/realworld/scripts/05-charts.py`, and `realworld-broad.tex` by
  `eval/realworld/scripts/12-charts.py`. Both scripts also write the `rw-*.pdf`
  figures. Each file is copied into `paper/` and `paper/ieee/` so each paper
  builds on its own.
- Three blocks inside `main.tex` are rewritten by
  `scripts/render-bench-table.mjs` from `paper/bench/results.json`: the rows of
  the benchmark table (`% bench-table:begin` to `% bench-table:end`), the
  paragraph after it (`% bench-prose:begin` to `% bench-prose:end`), and the
  benchmark sentence in the reproducibility notes (`% bench-platform:begin` to
  `% bench-platform:end`).

## Measured results

The numbers in the "Measured cost and tamper resistance" table and the paragraph
after it come from `scripts/bench-receipts.mjs`, which runs against the built
package with the mocked provider and writes `paper/bench/results.json`.
Regenerate them with:

```bash
pnpm -r build && pnpm bench:receipts
```

`pnpm bench:receipts` runs the benchmark and then `scripts/render-bench-table.mjs`.
To refresh the text from an existing `results.json` without measuring again, run
only `node scripts/render-bench-table.mjs`. Latencies depend on the machine; the
tamper-sweep and replay counts must always be 100 % and the benchmark exits
non-zero otherwise.

## Build

Either engine works. The preamble checks the engine with `iftex`.

- tectonic (a single XeTeX-based binary that fetches the packages it needs):

  ```sh
  make tectonic   # runs: tectonic -X compile main.tex --keep-logs
  ```

  Under XeTeX or LuaTeX the paper uses the OpenType TeX Gyre Termes, Heros, and
  Cursor fonts through `fontspec`, and TeX Gyre Termes Math through
  `unicode-math`. Tectonic exits 0 even with undefined references, so check
  `main.log` for `undefined` and `Citation` warnings.

- pdfLaTeX with `latexmk` and BibTeX:

  ```sh
  make
  ```

  This runs `latexmk -pdf main.tex`, which performs the full LaTeX and BibTeX
  passes and produces `main.pdf`. Text and math use `mathptmx`. You need a TeX
  distribution (TeX Live or MiKTeX) with `latexmk`, `psnfss` (`mathptmx`),
  `tikz` with `pgfplots`, `booktabs`, `etoolbox`, `iftex`, and `hyperref`.
  MiKTeX fetches missing packages on first use.

  To build manually without `latexmk`:

  ```sh
  pdflatex main.tex
  bibtex main
  pdflatex main.tex
  pdflatex main.tex
  ```

## Clean

```sh
make clean
```

`make clean` removes intermediate files. `make distclean` additionally removes the
generated PDF.
