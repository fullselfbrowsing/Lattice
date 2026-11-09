---
type: quick
id: 261109-boa
date: 2026-11-09
status: complete
baseline: 3a4722e
implementation_commit: 810181e
---

# Final funding statement applied

At Lakshman's direction, the Funding paragraph now reads exactly as Prof. Neouchi supplied it: "This research received no specific grant from any funding agency." The "self-funded" wording and the publication-cost sentence are gone. The checklist records the final wording, the fee terms Prof. Neouchi read in JITCAR's instructions, and a submission step to choose color online only.

## Validation

- `paper/main.tex` diff is one line. The PDF builds at 77 pages with 0 undefined references, 0 overfull boxes and the 7 existing underfull warnings.
- A word-level comparison of PDF text shows only the deleted funding words; other differences are page-number reflow on pages 27–30. Page 27 rendered and inspected.
- Frozen 23/23 and protected 510/510 byte-identical. `git diff --check` passed. Nothing pushed.

## Open

- Title-page affiliation and corresponding-author changes await Lakshman's go-ahead and Prof. Neouchi's email.
- JITCAR's AI rule, word limits, anonymization and template requirements are still not recorded.
- If the appendices stay in the printed article, four generated captions that name colors need rewording for grayscale.
