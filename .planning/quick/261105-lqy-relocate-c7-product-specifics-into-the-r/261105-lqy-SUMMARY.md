---
type: quick
id: 261105-lqy
date: 2026-11-05
status: complete
baseline: 73a47cf
implementation_commit: 9e56e4b
---

# C7 product-detail relocation

**C7 product-detail relocation complete; author review and venue-format confirmation pending.** Implemented inline on `cursor/review-fixes-eval-708c`, preserving the branch. Plan commit `72ee360`; implementation `9e56e4b`.

## Result

- Condensed the artifact section, lifecycle labels and principle/mechanism table around conceptual behavior, evidence boundaries and integration choices. Condensed the main limitations without losing signing, successful-output, missing-evidence, provider-consumption, freshness, closure, privacy or human-evaluation boundaries.
- Added `paper/reproducibility-details.tex` under the existing Appendix A/`app:repro` heading: software baseline, receipt/execution details, integration interfaces, measured environments/historical qualifications and reproduction commands. Five original artifact paragraphs, four original mechanism descriptions and twelve detailed limitation entries are preserved verbatim. Existing environment/test-count macros and generated tables remain unchanged and included once.
- Distinguished source baseline `73a47cf` from measured revisions, and saved-result presentation from experimental reruns. Documented manifest/runtime requirements without asserting new compatibility or current-package equivalence. No command that installs/builds the SDK, reruns controls or replaces measurements was executed.
- Added `paper/research/C7-RELOCATION-MAP.md`; updated checklist, README and assistance declaration. No explanatory reference narrative was created. Original affected-text authorship and this session model/version remain unconfirmed; A1/P5/A7 and prior author reviews stay open. C8 and template migration remain separate.

## Validation

- `node paper/scripts/c4-tables.mjs --check`: passed against 12 saved sources; six timing rows, four citation rows and signed-log parity preserved.
- `node paper/scripts/public-refund-tables.mjs --check`: passed; 14 rubric passes of 16, 15 complete packages; original signature/completeness/rubric distinctions unchanged. Synthetic presentation/control script was not rerun; frozen files were compared instead.
- 618/618 protected tracked files unchanged, including runtime, frozen evaluation code/prompts/labels/bundles/results, generated fragments, bibliography, C6 technical background and Ai4Privacy records. C1, C2, C3, C4 Evaluation, C5, C6 review/contribution discussion, Conclusion and Acknowledgements are byte-identical to baseline.
- Verbatim preservation assertions pass for all moved paragraphs, mechanism bodies and detailed limitation items. Nineteen unique TeX inputs, 85 unique labels, all cross-references resolved and 82 used bibliography keys resolved; reference drafts remain outside inputs. Static citation parsing excludes the existing `#1` macro parameter, not a missing citation.
- `make -C paper tectonic` and `git diff --check`: pass. Final PDF: 77 pages, no undefined references/citations or overfull boxes, seven existing underfull warnings in the historical report/bibliography. Command flags extract as literal `--check`, not ligature dashes.
- Rendered/inspected artifact pp. 15–17, limitations p. 24, Appendix A detail pp. 28–33 and generated tables pp. 34–39. Figure/table readable; no clipping or overlap. A shortened limitation paragraph eliminates an orphan continuation page; an appendix float barrier prevents result tables interrupting the reproduction commands.

Private checks/renders: `.context/jitcar-c7/validation.json`, `protected-hashes.json`, `build.log`, `main.txt` and `page-*.png`. Approximate main-text counts (excluding the TikZ body and citation/label commands) fall from 1,125 to 463 in the artifact section and 676 to 379 in limitations. These are editorial diagnostics, not a venue word-count claim. The larger total PDF retains moved detail plus explicit reproduction notes.

## Handoff

Deliver `paper/main.pdf`, the Appendix A input and relocation map. Author review of the condensed text and final appendix/supplement/length decisions remain pending. No inference, API spend, new experiments, runtime/API changes, restricted-data additions, external messages or publication actions were performed.
