# Lattice IEEE Conference Paper

This directory contains a submission-ready IEEE-conference LaTeX paper about
Lattice: a capability-first TypeScript runtime whose every multimodal model run
emits a signed, canonical, replayable capability receipt.

- Title: Capability Receipts: Verifiable and Reproducible Multimodal Model
  Orchestration
- Author: Lakshman Turlapati, Full Self Browsing
- Document class: `\documentclass[conference]{IEEEtran}`

## Files

- `main.tex` is the full two-column paper.
- `refs.bib` is the bibliography. It is compiled with `\bibliographystyle{IEEEtran}`.
- `Makefile` drives the build with `latexmk`.
- `.gitignore` excludes LaTeX build artifacts.

## Requirements

You need a TeX distribution that provides `latexmk`, `pdflatex`, `bibtex`, and the
`IEEEtran` document class. `IEEEtran.cls` ships with standard TeX distributions
(TeX Live, MiKTeX), so it does not need to be vendored into this directory.

- macOS: install MacTeX or BasicTeX, then `tlmgr install latexmk ieeetran`.
- Debian or Ubuntu: `sudo apt-get install texlive-latex-recommended texlive-publishers latexmk`.
- Windows: install MiKTeX, which fetches `IEEEtran` on first use.

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
