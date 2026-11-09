---
type: quick
id: 261109-boa
date: 2026-11-09
status: complete
---

# Apply the final funding statement

Prof. Neouchi checked JITCAR's Instructions for Authors and supplied the final funding wording: "This research received no specific grant from any funding agency." The publication-cost sentence is dropped because the journal charges no submission or publication fees.

## Work

1. `paper/main.tex`: replace the Funding paragraph with the supplied sentence, then rebuild the PDF.
2. `paper/JITCAR-TODO.md`: record the final wording and fee terms, and add the color-online-only step.

The title-page affiliation and corresponding-author changes are separate and not part of this task.

## Verification

One-line `main.tex` diff; build with 0 undefined references and 0 overfull boxes; PDF text differs only in the Funding paragraph and following reflow; frozen and protected hashes unchanged.
