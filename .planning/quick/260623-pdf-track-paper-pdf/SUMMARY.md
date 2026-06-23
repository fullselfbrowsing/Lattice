---
quick_id: 260623-pdf
slug: track-paper-pdf
status: complete
completed_at: "2026-06-23T17:22:22.000Z"
---

# Track Paper PDF Summary

## Outcome

Added the rebuilt paper PDF to git so `paper/main.pdf` is available from the repository.

## Changes

* Updated `paper/.gitignore` to keep ignoring generated PDFs except `main.pdf`.
* Added the rebuilt 8-page `paper/main.pdf`.

## Verification

* `pdfinfo paper/main.pdf`
* `git diff --check`
* PR checks before merge
