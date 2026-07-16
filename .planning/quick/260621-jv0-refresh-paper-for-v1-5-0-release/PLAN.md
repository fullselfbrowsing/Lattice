---
quick_id: 260621-jv0
slug: refresh-paper-for-v1-5-0-release
status: in_progress
---

# Refresh Paper For v1.5.0 Release

## Goal

Refresh the IEEE paper for the v1.5.0 release while preserving the signed receipt
and verifiable replay thesis, the current title, and the 8-page conference shape.

## Implementation

* Update stale release facts, implementation size, package version, and test counts.
* Add concise v1.5.0 coverage for modular package subpaths, provider native tool
  and structured output parity, external execution audit helpers, standalone core
  preparation, and MCP/tool artifact helpers.
* Update CLI coverage for `lattice receipt diff` and agent eval mode.
* Remove limitations and future work claims that are now shipped.
* Rebuild `paper/main.pdf` with `tectonic`.

## Verification

* `tectonic main.tex`
* `pdfinfo paper/main.pdf` reports 8 pages
* stale-claim search from the approved plan
* `git diff --check`
