# Lattice papers

**Highest priority:** [JITCAR submission checklist](JITCAR-TODO.md). The complete-draft cutoff is November 6, 2026; otherwise the authors switch to ISF or BISE. Target submission on November 13, ahead of the verified November 15 deadline for [The Post AI Enterprise](https://think.taylorandfrancis.com/special_issues/the-post-ai-enterprise/). The call gives no closing time or time zone. Start with the AI-provenance audit before manuscript revision.

`main.tex` is the Information Systems Frontiers draft. It uses the article class with author-year citations (`natbib`, `apalike`) and a design-science frame. The refund workflow and run life-cycle figures are drawn with TikZ (`tikz`, libraries `arrows.meta` and `positioning`). Springer Nature's `sn-jnl` class is not vendored: the template download page is script-rendered, so this build could not fetch `sn-jnl.cls`. Before submission, port the body into `\documentclass[pdflatex,sn-apa]{sn-jnl}`.

`ieee/main.tex` is the IEEE conference version. It vendors `IEEEtran.cls` and `IEEEtran.bst`. Under pdfLaTeX, text and math use `mathptmx`; under XeTeX or LuaTeX (including Tectonic), they use the TeX Gyre Termes, Heros, and Cursor fonts and TeX Gyre Termes Math. See `ieee/README.md`.

## Generated files

Do not type numbers into the narrative by hand, and do not edit these files. Rerun the generator instead.

| File in `paper/` | Generator |
|---|---|
| `numbers.tex`, `eval-tables.tex`, `Fig2.png`, `Fig3.png`, `Fig4.png` | `eval/scripts/06-report.py`, from `eval/results/*.json` |
| `validated.tex`, `validated-pii.pdf`, `validated-latency.pdf` | `eval/realworld/scripts/16-validated-report.py`, from the versioned validated result files; missing measurements are explicit |
| `public-refund-results.tex` | `paper/scripts/public-refund-tables.mjs`, from frozen `eval/public-refund/results` plus its separately disclosed rubric audit |
| `refund-results.tex` | `paper/scripts/refund-tables.mjs`, from frozen `eval/refund/results`; read-only verification before rendering |
| `bench/results.json` | `scripts/bench-receipts.mjs` (run by `pnpm bench:receipts`) |
| the `bench-table`, `bench-prose`, and `bench-platform` blocks in `ieee/main.tex` | `scripts/render-bench-table.mjs`, from `bench/results.json` (also run by `pnpm bench:receipts`) |
| `realworld.tex`, `realworld-matrix.tex`, `rw-latency.pdf`, `rw-pii.pdf`, `rw-bytes.pdf` | `eval/realworld/scripts/05-charts.py`, from `eval/realworld/results` |
| `realworld-broad.tex` and the other `rw-*.pdf` figures | `eval/realworld/scripts/12-charts.py`, from `eval/realworld/results` |

The real-world generators write the same fragments and PDFs into `paper/` and `paper/ieee/`, so each paper builds on its own. The papers include the PDF figures only. The `rw-*.png` previews stay in `eval/realworld/results`.

The latency results (`tab:overhead`, `tab:size`, `tab:chain`, `Fig2.png`, `Fig3.png`, and the `\Eval*` macros) come from the original measurement run on an Intel Xeon host, recorded in `eval/results/env-latency.json`. The functional results (tamper, replay, policy, verifier checks, test counts, and the `\EvalFunc*` macros) were re-run without re-measuring latency and are recorded in `eval/results/env-functional.json`. `eval/run-all.sh` and `pnpm bench:receipts` re-measure latency on the host that runs them, so running them replaces the Xeon numbers.

## Refund case materials

The main C2 case uses **four actual published refund-dispute decisions**, with 18 exact PDF pages supplied to 16 live free-model reviews. See the [case/provenance record](research/C2-PUBLIC-RECORD-CASE.md) and [results with rubric audit](../eval/public-refund/results/interpretation.md). Section 5 of `main.tex` now contains the case narrative, and Section 7.11 contains its results discussion. Claude drafted both at Lakshman's direction (see the [C2 review record](research/C2-REVIEW.md)), replacing the superseded [Codex reference draft](research/C2-REFERENCE-DRAFT.md). C2 is **reviewed (Nov 4)**. The text is AI-drafted, so publisher policy and the A1/P5 authorship and disclosure checks still apply before submission.

`public-refund-case.tex` contains the main TikZ workflow and evidence table, before the artifact section. `public-refund-results.tex` is included within Evaluation. The earlier invented-case figure, evidence table and unchanged results are separately retained in `refund-synthetic-appendix.tex`; do not pool their denominators with the actual-record cohort.

From the repository root, regenerate only the actual-record presentation:

```sh
node paper/scripts/public-refund-tables.mjs
node paper/scripts/public-refund-tables.mjs --check
```

The script reads the frozen summary and verification results. It validates both the superseded one-sided correction (`rubric-audit.json`, 15/16) and the complete two-way source audit (`source-audit.json`, 14/16) against the saved grades and source-page hashes, and writes only the presentation. It reports the frozen and fully audited results side by side. It performs no inference and changes no frozen code, labels or results. Full source PDFs, page text and exact request exports remain local; published bundles contain outputs, receipts and fingerprints, so full independent package verification requires those retained bytes.

The historical synthetic presentation remains reproducible with `node paper/scripts/refund-tables.mjs --check`. That script checks the frozen code/build/fixture/protocol/bundle hashes, public key and original scores without inference. Do not restore or overwrite frozen hashes if the current build differs; reproduce the measured revision in an isolated checkout. Its 18 scoped checks and separate offline wrong-answer control differ from the current cohort's 10 checks on one live bundle.

Human usefulness and real approval/payment execution remain untested. Source/rubric validation, drafting-tool model/version confirmation and final declarations remain open under A1/P5.

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
