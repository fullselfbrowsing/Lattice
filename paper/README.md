# Lattice IEEE Conference Paper

This directory contains a submission-ready IEEE-conference LaTeX paper about
Lattice: a capability-first TypeScript runtime whose every multimodal model run
emits a signed, canonical, replayable capability receipt.

- Title: Lattice: Signed, Replayable Capability Receipts for Model Runs
- Author: Lakshman Turlapati, Full Self Browsing
- Email: lakshmanturlapati@gmail.com
- Code: https://github.com/fullselfbrowsing/Lattice
- Document class: `\documentclass[conference]{IEEEtran}`

## Files

- `main.tex` is the full two-column paper.
- `refs.bib` is the bibliography. It is compiled with `\bibliographystyle{IEEEtran}`.
- `Makefile` drives the build with `latexmk`.
- `.gitignore` excludes LaTeX build artifacts.

## Requirements

You need a TeX distribution that provides `latexmk`, `pdflatex`, `bibtex`, the
`IEEEtran` document class, the `newtx` Times fonts, and `tikz` with `pgfplots`. All of
these ship with standard TeX distributions (TeX Live, MiKTeX), so nothing needs to be
vendored into this directory.

- macOS: install MacTeX (recommended, complete) or BasicTeX, then
  `tlmgr install latexmk ieeetran newtx pgfplots`.
- Debian or Ubuntu: `sudo apt-get install texlive-latex-recommended texlive-publishers texlive-fonts-extra texlive-pictures texlive-science latexmk`.
- Windows: install MiKTeX, which fetches missing packages on first use.
- Single binary alternative: `tectonic main.tex` (auto-fetches every package it needs).

## Measured results

The numbers in the "Measured cost and tamper resistance" table come from
`scripts/bench-receipts.mjs`, which runs against the built package with the
mocked provider and writes `paper/bench/results.json`. Regenerate them with:

```bash
pnpm -r build && pnpm bench:receipts
```

Latencies depend on the machine; the tamper-sweep and replay counts must always
be 100 % and the script exits non-zero otherwise.

## Build

```sh
make
```

This runs `latexmk -pdf main.tex`, which performs the full LaTeX and BibTeX passes
and produces `main.pdf`.

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
