---
quick_id: 260623-pdf
slug: track-paper-pdf
status: in_progress
---

# Track Paper PDF

## Goal

Commit and push the rebuilt `paper/main.pdf` alongside the paper source.

## Implementation

* Allow `paper/main.pdf` through the paper ignore rules.
* Add the existing rebuilt 8-page PDF to git.
* Push the change through a small PR and merge it into `main`.

## Verification

* `pdfinfo paper/main.pdf` reports 8 pages.
* `git diff --check`
* PR checks pass before merge.
