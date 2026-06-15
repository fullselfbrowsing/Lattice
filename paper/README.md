# Lattice IEEE Conference Paper

This directory contains a submission-ready IEEE-conference LaTeX paper about
Lattice: a capability-first TypeScript runtime whose every multimodal model run
emits a signed, canonical, replayable capability receipt.

- Title: Lattice: Capability Receipts for Verifiable and Reproducible Multimodal
  Model Orchestration
- Author: Venkat Lakshman Turlapati (preferred name: Lakshman Turlapati), Full Self
  Browsing
- Email: lakshmanturlapati@gmail.com
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
