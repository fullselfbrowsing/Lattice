---
type: quick
id: 261105-p6k
date: 2026-11-05
status: complete
baseline: ab62b0d
---

# C1 and C4–C7 reviewed

Claude (Claude Code, Claude Opus 5.5) reviewed the remaining items at Lakshman's direction, with one read-only subagent for the C6 literature check. Full record: [C4–C7 review](../../../paper/research/C4-C7-REVIEW.md). No inference, new experiment, runtime change, push or submission. No narrative was rewritten.

## Findings

- **C4:** every hosted timing and quality cell, the tamper, replay, routing and leakage counts and the matched probes reproduce from raw data. One misleading statement corrected: the signing cost is 0.195–5.142 ms across ten configurations, not "0.214 to 1.354 ms". `c4-tables.mjs` now derives the range.
- **C5:** all factual statements hold. No correction.
- **C6:** eight comparison-table cells corrected against primary texts, including Janus's effect gating, which is limited to the MCP edge. Five citation or reference details fixed: the "nascent" citation, the Baird attribution, Mäntymäki's "legal", the comparator pointer and the synthesis-table note.
- **C7:** nothing lost in relocation, and Appendix A's repository claims hold. The declaration now points to Appendix A for the successful-runs clarification.
- **C1:** claims checked, no edit. One framing question for the authors.
- **Tracking:** paragraph 38 added to the author's Moffatt check, stale section numbers handled, and the superseded Ai4Privacy statement in the C4 map annotated.

## Validation

- `make -C paper tectonic`: 77 pages, 0 overfull boxes, 0 undefined references, the 7 existing underfull warnings. Pages 18, 27 and 70 rendered and inspected.
- `c4-tables.mjs`, `public-refund-tables.mjs` and `refund-tables.mjs` `--check` passed; `workflow.test.mjs` passed 3/3.
- Frozen 23/23 and protected 510/510 byte-identical. The C7 baseline is 609/618; the 9 differences are this task's intended files. Scores unchanged: 14/16, 15 packages, 16 signatures.
- Introduction, Sections 3–5, Section 6, Section 7.7, Section 9 and the Conclusion are byte-identical to the baseline. `git diff --check` passed.

## Author handoff

Eight items are listed in section 6 of the review. The publisher first-draft decision (A1/P5) remains open. C8 is next.
