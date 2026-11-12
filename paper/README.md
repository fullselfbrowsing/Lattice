# Lattice papers

**Highest priority:** [JITCAR submission checklist](JITCAR-TODO.md). The complete-draft cutoff is November 6, 2026; otherwise the authors switch to ISF or BISE. Target submission on November 13, ahead of the verified November 15 deadline for [The Post AI Enterprise](https://think.taylorandfrancis.com/special_issues/the-post-ai-enterprise/). The call gives no closing time or time zone. Start with the AI-provenance audit before manuscript revision.

`main.tex` is the working JITCAR special-issue manuscript, developed from the earlier Information Systems Frontiers draft. It uses the article class with author-year citations (`natbib`, `apalike`) and a design-science frame. The refund workflow and run life-cycle figures are drawn with TikZ (`tikz`, libraries `arrows.meta` and `positioning`). JITCAR's official instructions, verified November 9, permit format-free initial submission; a Springer template migration is not required for this venue. See the [requirements record](research/A7-SUBMISSION-REQUIREMENTS.md) for the Research Article rules, appropriate appendices, single-anonymous review and PDF/LaTeX-zip/`.bib` requirements. The exact portal special-issue option remains unverified behind login.

## Reference and submission checks (November 9)

The [P2 audit](research/P2-REFERENCE-AUDIT.md) and [metadata record](research/P2-REFERENCE-AUDIT.json) cover all 85 bibliography entries. All 58 existing DOI records were checked; three verified identifiers were added, giving 61. The original 22 missing-DOI entries each have a documented disposition. ALCE venue/pages, Sculley pages and Gretel's author attribution were corrected, and the two added arXiv identifiers remain preprint citations. The active manuscript cites 82 entries with no missing keys or duplicate identifiers. Three unused `.bib` entries are recorded for final package reconciliation.

The rebuilt 77-page PDF retains the author-approved funding change and all research narrative/evaluation evidence. The `apalike` style omits native DOI fields; JITCAR recommends DOI inclusion but does not require it for initial format-free submission. The verified fields remain in `refs.bib`. Authors still need to review source relevance and documented title/version gaps and repeat citation closure after their rewrite. A7 confirms a 200-word unstructured Research Article abstract; the present abstract has 170 prose words and remains for the authors to finalize. A1/P5, coauthor approval, ethics, the reproducibility archive and final portal/package checks remain open. No submission or inference was performed.

`ieee/main.tex` is the IEEE conference version. It vendors `IEEEtran.cls` and `IEEEtran.bst`. Under pdfLaTeX, text and math use `mathptmx`; under XeTeX or LuaTeX (including Tectonic), they use the TeX Gyre Termes, Heros, and Cursor fonts and TeX Gyre Termes Math. See `ieee/README.md`.

## Generated files

Do not type numbers into the narrative by hand, and do not edit these files. Rerun the generator instead.

| File in `paper/` | Generator |
|---|---|
| `c4-evidence.tex`, `c4-evidence.json` | `paper/scripts/c4-tables.mjs`, from saved timing, quality and integrity results; `--check` is read-only |
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

The main C2 case uses **four actual published refund-dispute decisions**, with 18 exact PDF pages supplied to 16 live free-model reviews. See the [case/provenance record](research/C2-PUBLIC-RECORD-CASE.md) and [results with rubric audit](../eval/public-refund/results/interpretation.md). Section 5 of `main.tex` now contains the case narrative, and the public-record evaluation subsection contains its results discussion. Claude drafted both at Lakshman's direction (see the [C2 review record](research/C2-REVIEW.md)), replacing the superseded [Codex reference draft](research/C2-REFERENCE-DRAFT.md). C2 is **reviewed (Nov 4)**. The text is AI-drafted, so publisher policy and the A1/P5 authorship and disclosure checks still apply before submission.

`public-refund-case.tex` contains the main TikZ workflow and evidence table, before the artifact section. `public-refund-results.tex` is included within Evaluation. The earlier invented-case figure, evidence table and unchanged results are separately retained in `refund-synthetic-appendix.tex`; do not pool their denominators with the actual-record cohort.

From the repository root, regenerate only the actual-record presentation:

```sh
node paper/scripts/public-refund-tables.mjs
node paper/scripts/public-refund-tables.mjs --check
```

The script reads the frozen summary and verification results. It validates both the superseded one-sided correction (`rubric-audit.json`, 15/16) and the complete two-way source audit (`source-audit.json`, 14/16) against the saved grades and source-page hashes, and writes only the presentation. It reports the frozen and fully audited results side by side. It performs no inference and changes no frozen code, labels or results. Full source PDFs, page text and exact request exports remain local; published bundles contain outputs, receipts and fingerprints, so full independent package verification requires those retained bytes.

The historical synthetic presentation remains reproducible with `node paper/scripts/refund-tables.mjs --check`. That script checks the frozen code/build/fixture/protocol/bundle hashes, public key and original scores without inference. Do not restore or overwrite frozen hashes if the current build differs; reproduce the measured revision in an isolated checkout. Its 18 scoped checks and separate offline wrong-answer control differ from the current cohort's 10 checks on one live bundle.

Human usefulness and real approval/payment execution remain untested. Source/rubric validation, drafting-tool model/version confirmation and final declarations remain open under A1/P5.

## C3 requirements and source mapping

The manuscript retains DR1–DR5 and DP1–DP4, with a retrospective traceability table connecting organizational needs, exact governance provisions, mechanisms, existing evidence and limits. See the [source/provenance map](research/C3-SOURCE-MAP.md). EU AI Act applicability is conditional; NIST AI RMF 1.0 is voluntary. Source versions and access limitations are explicit.

Sections 3 and 4 of `main.tex` now carry Claude's rewritten narrative, with the applicability of the EU AI Act corrected for the Digital Omnibus dates. The Codex [explanatory reference](research/C3-REFERENCE-DRAFT.md) is superseded. **C3 is reviewed (Nov 4)**; see the [C3 review record](research/C3-REVIEW.md). The text is AI-drafted, so the publisher first-draft rule and the A1/P5 checks still apply before submission.

## C4 evaluation consolidation

The main evaluation now separates requirements, integrity, retained evidence, answer quality, disclosure and cost, with three generated summary tables. Detailed technical explanations/plots are in `evaluation-details.tex`; unchanged local, hosted, paid and free report fragments are included in the historical-cohort appendix. The unapproved practitioner protocol is in `practitioner-proposal.tex` and remains future work.

Use `node paper/scripts/c4-tables.mjs` to regenerate presentation only and `node paper/scripts/c4-tables.mjs --check` to verify it without writes. This generator validates saved percentile/count aggregates against retained rows and records source hashes in `c4-evidence.json`; it performs no inference, benchmark or bootstrap rerun. Do not run `eval/run-all.sh` or the benchmark commands to update the presentation, because they replace measurements.

See the [C4 evidence map](research/C4-EVIDENCE-MAP.md) for denominator definitions, measured revisions, uncertainty and provenance, and the [separate AI-generated reference](research/C4-REFERENCE-DRAFT.md) for author rewriting. Hosted residual time includes harness work; signed-log parity and accepted repeat presentations are explicit. C2 corrections and the reviewed C3 narrative are preserved.

**C4 evidence and presentation consolidation complete; author review pending.** Ai4Privacy's October 22 academic-use confirmation is documented in the [permission record](research/AI4PRIVACY-PERMISSION.md), matched to the current English-validation detector evaluation. The manuscript acknowledges Ai4Privacy and retains aggregate metrics only, with no records or derived annotations redistributed. Resolved permission TODOs are removed; final package exclusions remain under P4/P6. Final appendix/supplement requirements also remain part of A7. This pass adds no runtime/API changes, inference or new experimental measurements.

## C5 managerial implications

The dedicated Managerial Implications section before the Conclusion revises the existing practical implications around organizational decisions, evidence boundaries and costs. Its [responsibility table](managerial-responsibilities.tex) proposes five role groups and connects them to DR1–DR5; no role assignment or organizational benefit is presented as evaluated in deployment. Numerical case distinctions reuse the existing C4 macros rather than introducing new results.

See the [C5 evidence/provenance note](research/C5-EVIDENCE-MAP.md) for claim support and proposed pilot measures. The [692-word AI-generated reference draft](research/C5-REFERENCE-DRAFT.md), including retrospective inspection, shadow operation and a conditional limited pilot, remains outside manuscript inputs for author rewriting. It does not approve recruitment or replace the existing practitioner protocol.

**C5 editorial revision and responsibility table complete; author narrative and review pending.** Original practical-implications authorship and the session model/version remain unconfirmed. A1/P5 and previous author review items remain open. A6 written confirmation and scope reconciliation are complete for the current evaluation; final archive/source-package checks remain under P4/P6. C2–C4 text and saved evidence are preserved; C6 status is recorded below.

## C6 focused IS literature review

Section 2 now organizes existing related work around organizational accountability/governance, delegation/oversight, auditing/provenance, secure records and the bounded design contribution. The [six-row synthesis table](is-literature-table.tex) distinguishes source evidence from our design interpretation; the detailed systems comparison and chronology are retained in [Technical Background and Comparison](technical-background.tex). The discussion preserves signed-log parity and treats organizational usefulness as untested.

The [source map](research/C6-SOURCE-MAP.md) records the focused narrative search, claim locators, verified DOI/metadata, access limits and a study-level matrix. Baird/Maruping, Rinta-Kahila et al. and Grisold et al. are the three additions. Baird/Maruping, Berente and Papagiannidis remain abstract/overview-level readings in this pass. Three existing bibliography entries now use final issue years, with citation keys preserved.

The [874-word AI-generated reference](research/C6-REFERENCE-DRAFT.md) remains outside manuscript inputs. **C6 source mapping and editorial revision complete; author reading, synthesis and review pending.** Original Section 2 authorship and the session model/version are unconfirmed; A1/P5 remain open. C2–C5 text and evidence and Ai4Privacy documentation are preserved. C7/C8 remain separate; no runtime/API changes, inference or new experiments were made.

## C7 reproducibility appendix

The artifact section now keeps the conceptual lifecycle and principle/mechanism table, verification boundaries and integration choices. API options, provider inventory, receipt/agent/crew details and the full original limitations are consolidated in [the Appendix A input](reproducibility-details.tex). Existing environment macros and numerical tables remain intact. The [relocation/provenance map](research/C7-RELOCATION-MAP.md) identifies every moved passage and its retained main-text boundary.

The appendix distinguishes the archived release (Lattice 1.7.0, `87f7bb9`, DOI 10.5281/zenodo.24145363), the `73a47cf` source check, and the experimentally measured revisions from experimentally measured revisions, and saved-result presentation commands from commands that replace measurements. C7 runs only the read-only C4 and public-record presentation checks and the PDF build; no inference, new experiments or frozen-build changes are needed. The historical synthetic controls remain unchanged.

**C7 product-detail relocation complete; author review and venue-format confirmation pending.** Appendix A stays inside the working PDF until A7 confirms journal length and appendix/supplement rules. Original authorship and session model/version remain unconfirmed; A1/P5 and previous author reviews stay open. C2–C6 evidence, C6 technical background and Ai4Privacy documentation are unchanged. C8 and template migration remain separate tasks.

## Review of C1 and C4–C7

The [C4–C7 review](research/C4-C7-REVIEW.md) recomputes the evaluation from raw data, tests the managerial, literature and appendix claims, and lists items for the authors. Measured results are unchanged. No narrative was rewritten.

## Author rewrite

The narrative of Sections 3, 4, 5 and 7.7 is being rewritten by the authors on the local `author-rewrite` branch, following the [rewrite guide](research/AUTHOR-REWRITE.md). The working branch stays complete until that work is merged.

## C8 working title

**Verifiable Evidence for AI-Assisted Business Decisions: A Design Science Study** is Lakshman's selected working title. The visible title and PDF title metadata match; the unchanged six keywords also populate PDF metadata. The abstract and research body are unchanged. See the [title-decision record](research/C8-TITLE-DECISION.md) for all three candidates, rationale and assistance provenance.

**C8 working title selected and aligned; coauthor approval and venue checks pending.** Prof. Neouchi's approval is still required. A1/P5/A7 and previous author reviews remain open. The later cover letter and portal fields must use the final agreed wording; historical records and the separate IEEE manuscript are unchanged. No inference, experiments, runtime/API changes or submission actions are involved.

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
