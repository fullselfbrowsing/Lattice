---
quick_id: 260621-jv0
slug: refresh-paper-for-v1-5-0-release
status: complete
completed_at: "2026-06-21T19:22:03.000Z"
---

# Paper v1.5.0 Refresh Summary

## Outcome

Refreshed the IEEE paper for the v1.5.0 release while preserving the signed
capability receipt and verifiable replay thesis.

## Changes

* Updated release, implementation size, and test-count claims to v1.5.0.
* Added concise coverage for modular package subpaths, provider-only native tools
  and structured outputs, external execution audit helpers, standalone core
  preparation, and MCP/tool artifact helpers.
* Updated CLI coverage for agent snapshot eval and `lattice receipt diff`.
* Removed limitations and future-work claims that now describe shipped behavior.
* Rebuilt `paper/main.pdf` locally with `tectonic`; the PDF remains ignored by the
  repo.

## Verification

* `tectonic main.tex`
* `pdfinfo paper/main.pdf` reports 8 pages
* `rg "1\\.3\\.0|960|816|144|82 files|receipt difference.*planned|native streaming.*still" paper/main.tex`
* `pdftotext paper/main.pdf -` spot checks for v1.5.0 content
* Visual inspection of rendered PDF pages 1, 6, 7, and 8
* `git diff --check`
