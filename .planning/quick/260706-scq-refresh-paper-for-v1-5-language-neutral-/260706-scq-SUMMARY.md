---
quick_id: 260706-scq
title: Refresh paper for v1.5 protocol and conformance
date: 2026-07-07
status: complete
---

# Quick Task 260706-scq Summary

## What changed

Refreshed the existing IEEE paper instead of rewriting it. The title, author block,
overall section structure, and core thesis remain intact.

- Updated the abstract, contributions, implementation, evaluation, limitations, future
  work, and conclusion for v1.4/v1.5 shipped state.
- Corrected receipt versioning: accepted versions are v1.1, v1.2, and v1.3; new
  receipts mint v1.3; v1 and absent versions still fail before crypto.
- Added the v1.5 output-hash conformance boundary for null, string, and binary outputs,
  with object-output hashing called out as implementation-defined.
- Added a language-neutral conformance subsection covering `spec/SPEC.md`, schemas,
  12 committed vectors, TypeScript verification, Python verify/replay/mint, and
  cross-mint CI.
- Refreshed implementation facts: public npm packages at 1.5.1, about 27.3k production
  TypeScript lines, 332 model profiles, and expanded CLI coverage.
- Replaced the old 960-test chart with the current runtime, CLI, vector generator,
  TypeScript conformance/parity, and Python test distribution.
- Updated `spec/SPEC.md` so it no longer says the paper is capped at v1.2.
- Added RFC 4648 and RFC 8037 bibliography entries for the new conformance/signing
  citations.

## Verification

- `make -C paper` attempted first and failed because `latexmk` is not installed.
- `tectonic main.tex` from `paper/` succeeded and regenerated `main.pdf` at 8 pages.
- Latest compile output has no overfull boxes; only underfull/font warnings remain.
- Stale-claim scan passed for `paper/main.tex`; the only scan hit was a hex fixture
  string in `spec/SPEC.md`, not prose.
- Citation check: 20 cited keys, 21 bibliography entries, 0 missing keys.
- PDF text scan confirms new claims (`1.5.1`, `1059`, `lattice-receipt/v1.3`, Python
  reference client, object-output boundary) and no stale `960`, `1.3.0`, or
  "not yet implemented" paper claims.

## Files

- `paper/main.tex`
- `paper/refs.bib`
- `spec/SPEC.md`
- `.planning/STATE.md`
