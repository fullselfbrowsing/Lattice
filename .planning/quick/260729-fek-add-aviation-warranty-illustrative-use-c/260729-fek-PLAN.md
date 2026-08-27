---
quick_id: 260729-fek
status: complete
date: 2026-07-29
---

# Add Aviation Warranty Use Case to the Lattice Journal Paper

Extend the journal/governance manuscript with an academically restrained,
illustrative aircraft-component warranty adjudication use case. Add an
authoritative aviation bibliography, a full-width workflow figure, explicit
human-decision and assurance boundaries, and a rebuilt tracked PDF. Preserve the
systems manuscript and all unrelated working-tree changes.

## Implementation

- Add a 500--700 word subsection before Evaluation that connects a two-stage,
  policy-bound Lattice workflow to governance, accountability,
  reproducibility, and control auditability.
- Add a full-width TikZ workflow from airline/MRO evidence through local
  analysis, lineage-linked findings, contract-bound assessment, portable claim
  packet, independent verification, organizational review, and human
  disposition.
- Add official IATA, ICAO, FAA, and C2PA bibliography entries and maintain
  restrained claims: the example is illustrative, not a deployment or
  certification result.
- Rebuild and track `paper/journal-main.pdf`; leave `paper/main.tex` unchanged.

## Verification

- Verify every journal citation key exists uniquely in `paper/refs.bib`.
- Compile both `paper/journal-main.tex` and `paper/main.tex` with Tectonic
  without undefined citations, references, or fatal errors.
- Render and inspect every journal PDF page with Poppler.
- Extract the PDF text and verify the new heading, caption, citations, boundary
  language, and absence of unresolved placeholders or inflated claims.
- Run `git diff --check` and commit only the approved manuscript, bibliography,
  generated PDF/allowlist, and GSD quick-task artifacts.
