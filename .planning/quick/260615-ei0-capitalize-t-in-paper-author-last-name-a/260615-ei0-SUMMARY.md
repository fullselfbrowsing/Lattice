---
quick_id: 260615-ei0
title: Capitalize T in paper author last name and rebuild PDF
date: 2026-06-15
status: complete
---

# Quick Task 260615-ei0 Summary

## What changed

- Changed the paper author line to `Lakshman Turlapati` in `paper/main.tex`.
- Changed the paper README author metadata to `Lakshman Turlapati`.
- Updated GSD quick-task notes that still referenced the lowercase last-name form.
- Rebuilt `paper/main.pdf`.

## Verification

- `tectonic main.tex` exits 0 from `paper/`.
- `pdftotext paper/main.pdf -` shows `Lakshman Turlapati`.
- Exact search for the old lowercase last-name form returns no matches.
