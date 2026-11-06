---
type: quick
id: 261105-unn
date: 2026-11-05
status: complete
baseline: 7d3c623
implementation_commit: ae0aa67
---

# C8 working-title alignment

**C8 working title selected and aligned; coauthor approval and venue checks pending.**

Applied Lakshman's selected title: **Verifiable Evidence for AI-Assisted Business Decisions: A Design Science Study**. The visible title uses two lines; PDF title metadata matches the exact plain-text wording. The unchanged six visible keywords populate PDF keyword metadata. Added `paper/research/C8-TITLE-DECISION.md`, updated checklist/README and recorded title assistance in the declaration/A1. Original model/version uncertainty and all previous author-review items remain open.

Executed inline on `cursor/review-fixes-eval-708c`; plan commit `8485644`, implementation `ae0aa67`. Starting revision `7d3c623` includes the later C1/C4–C7 factual review, preserved unchanged. Date is November 5 in America/Chicago; GSD initialization was November 6 at 04:04 UTC.

## Validation

- `make -C paper tectonic`: passed; final PDF 77 pages, no undefined citations/references or overfull boxes, seven existing underfull warnings.
- `pdfinfo`: exact selected title and all six keyword strings match the manuscript.
- All 621 protected tracked files match baseline, including C2–C7 evidence, frozen/generated evaluations, bibliography, Ai4Privacy documentation, reviewed technical material and IEEE source.
- Reversing just the title/metadata edit and new assistance sentence produces the exact baseline `main.tex`; abstract, visible keywords, author details and research body are unchanged.
- Extracted-page comparison identifies changes only on pp. 1–5 and 27–28. All seven pages were rendered and visually inspected: readable two-line title, intact abstract/keywords, normal page transitions, no clipping/overlap. Other pages have identical extracted text.
- `git diff --check` and local decision-record links pass. Private baseline/hash/validation files and renders are in `.context/jitcar-c8/`.

## Handoff

Deliver `paper/main.pdf` and `paper/research/C8-TITLE-DECISION.md`. Lakshman's selection is recorded; Prof. Neouchi's agreement and A7 venue requirements remain unconfirmed. A1/P5, previous author reviews and submission-package tasks remain open. Later cover-letter/portal fields should use the authors' final agreed wording. No portal, cover-letter, historical-record or IEEE-title changes; no runtime/API changes, inference, experiments, template migration, external message or submission action.
