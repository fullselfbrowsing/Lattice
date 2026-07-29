---
quick_id: 260729-fek
status: complete
date: 2026-07-29
---

# Aviation Warranty Use Case Added to the Journal Paper

Added a 624-word illustrative aircraft-component warranty adjudication
subsection to the organizational auditability discussion in
`paper/journal-main.tex`. The example uses a restricted local analysis run
followed by a contract-bound warranty assessment, maps the resulting claim
packet to the paper's four auditability dimensions, and keeps final commercial
and maintenance authority with accountable human reviewers.

Added a full-width TikZ workflow with the required airline/MRO-to-review flow,
an independent public-key and artifact/output-hash verification branch, and a
human-disposition terminus. The caption identifies the figure as an
illustrative design application rather than a deployed evaluation.

Added official IATA, ICAO, FAA, and C2PA references with clickable source links.
The assurance boundary states that Lattice attests to a signed execution
procedure and output commitment, not sensor accuracy, source truth, media
authenticity, model correctness, regulatory compliance, or airworthiness.

## Verification

- All 33 journal citation keys exist uniquely in the 40-entry bibliography.
- `tectonic journal-main.tex` completed without undefined citations,
  references, or fatal errors and produced a seven-page PDF.
- `tectonic main.tex` completed in a temporary output directory and preserved
  the unchanged eight-page systems manuscript.
- All seven journal pages were rendered with Poppler and visually inspected;
  the workflow is legible and unclipped, with no crossing labels or blank pages.
- Extracted PDF text contains the heading, figure caption, source entries, and
  limitation language without unresolved placeholders.
- The new prose contains none of the prohibited inflated or
  airworthiness-determination claims.
- `git diff --check` passed.
