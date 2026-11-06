---
type: quick
id: 261103-mbs
date: 2026-11-03
status: complete
implementation_commit: cc41303
---

# C2 reference draft and evidence integration complete

Implemented the approved scope on `cursor/review-fixes-eval-708c`. No runtime/API changes, inference calls, payments, pushes or messages to others. C2 as a whole remains open for author narrative/review; C3 was not started.

## Delivered

- Separate 794-word AI-generated reference narrative in `paper/research/C2-REFERENCE-DRAFT.md`, explicitly intended for author rewriting and excluded from manuscript narrative. Primary Moffatt judgment rechecked; synthetic setting and live/simulated boundaries preserved.
- TikZ workflow on PDF page 8 and evidence table on page 9, before the artifact description. A stranded heading found during inspection was fixed. Results table on page 38, separate from historical cohorts.
- `paper/scripts/refund-tables.mjs` and generated `paper/refund-results.tex`: read-only checks of frozen code/fixture/trust/protocol/bundle hashes, scoring, model IDs and expected repetition inventory; 32 exported packages reverified. All 18 scoped controls reproduced in memory; saved offline wrong-but-signed evidence reverified and rescored.
- Per-model 16/16 decisions, 14/16 strict passes and 16/16 verified packages; all four request-source omissions retained. Two development calls excluded, 34 zero-cost requests and USD 0 added usage preserved.
- Updated README/Makefile generation documentation, C2/C4 checklist status, limited section-roadmap and AI-declaration editorial changes, and `paper/research/C2-INTEGRATION-PROVENANCE.md`. Drafting model/version remains explicitly unconfirmed.

## Validation

- `node --check paper/scripts/refund-tables.mjs`: passed.
- `node paper/scripts/refund-tables.mjs --check`: passed; deterministic presentation matches saved evidence; no result files written.
- `make -C paper tectonic`: passed, 54-page PDF. Final log: zero undefined references/citations and zero overfull boxes; seven pre-existing underfull warnings in historical tables/bibliography remain.
- Rendered/inspected pages 3, 7–9, 37–39 and 42–43. Final unchanged-page raster comparisons confirmed the reviewed layout after the last editorial adjustment. Figure/table text readable, arrows and page transitions clean.
- All 510 protected files in refund/historical result directories byte-for-byte unchanged; frozen manifest separately checks measured source and build files.
- Local Markdown links resolve; `git diff --check` passed.
- Private before-PDF, protected hashes and render previews are in `.context/jitcar-c2-integration/`.

## Author handoff

**C2: evidence integrated; author narrative and review pending.** Workflow/evidence-table and measured-outcome checklist items are complete. The narrative stays outside `main.tex` until the authors revise and settle authorship. A1/P5 verification, version records, terms and disclosure review remain open. Reference labeling/editing is not represented as resolving Taylor & Francis's restriction on AI first drafts. C4 requirements mapping and practitioner evaluation remain pending.
