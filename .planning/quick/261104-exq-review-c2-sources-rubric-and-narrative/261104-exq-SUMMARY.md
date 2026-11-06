---
type: quick
id: 261104-exq
date: 2026-11-04
status: complete
---

# C2 reviewed: sources, rubric and Moffatt-centered narrative

At Lakshman's direction, Claude (Claude Code, Claude Opus 5.5) reviewed C2, rewrote the narrative and integrated it into the manuscript. The work was done inline, not by subagents, because the request was for Claude's own voice and source judgment. No inference was run, no runtime or API changes were made, and nothing was pushed or submitted. C3 was not started. The full record is [C2-REVIEW.md](../../../paper/research/C2-REVIEW.md).

## Findings

- **Sources:** all four PDFs re-downloaded (HTTP 200). PDF SHA-256 matched 4/4 and page-text SHA-256 matched 18/18 with the same `pdftotext 26.06.0 -layout` extraction. The Moffatt fare figures were confirmed against rendered page images. The official CRT and CanLII pages returned HTTP 403, so the authors should compare paragraphs 18, 34 and 40 in a browser.
- **Facts:** every claim in the Codex draft, the case record, the tables and the new narrative traces to a paragraph or page. Two wording fixes were made: DRN-4377241's K is a "booking website" that "declined to help", not an agent that "obstructed", and the Moffatt "total paid" needed the caveat below.
- **Order versus settlement:** Moffatt para. 44 orders CAD 812.02 within 14 days (damages, interest and fees, not a refund alone). Para. 47 gives the enforcement route. A decision dated Feb 14, 2024 cannot evidence later payment, so the `settlement_proven = null` label is correct. Press coverage reports intent ("will be reimbursing"), not payment, and is not cited. The FOS directions are conditional and await acceptance; none records a payment.
- **Rubric:** the Nov 3 DRN-4148727 page-1 correction is valid, but it was applied in only one direction. The same standard applied to all 75 graded pairs found that Moffatt page 4 (fares summing to CAD 1,640.36) had been accepted for the CAD 1,630.36 total, while page 8 was omitted. One Dots run cited only page 4. It also found that page 5 restates the 90-day window. The audited result is **14/16** (8/8, 6/8), the same as the frozen score, and **15/16 is superseded**. The audit is in `eval/public-refund/results/source-audit.json` and is re-derived and hash-checked by the generator.
- **Record inconsistency:** Moffatt's stated total paid is CAD 10 below its own itemized fares, and damages are computed from the stated total. One Dots review note flagged this; the rubric did not.

## Delivered

- `main.tex` Section 5 (about 1,040 words: introduction, 5.1 Moffatt, 5.2 three ombudsman decisions, 5.3 executed review with the existing figure and evidence table) and Section 7.11 (about 300 words of results discussion before Table 21). One conclusion sentence corrected to match the records. The declaration discloses Claude's drafting and review. Undated FOS citations now use DRN aliases instead of "n.d.a/b/c".
- The regenerated results table shows a "complete source audit" row and a rewritten audit note. The Codex reference draft is marked superseded; it is preserved at `80a4ad8`. Updated: the case/provenance record, eval README and interpretation, paper README, checklist (C2 **reviewed**, A1 inventory, decision log) and STATE.

## Validation

- `node paper/scripts/public-refund-tables.mjs --check` and `node paper/scripts/refund-tables.mjs --check` passed. `node --test eval/public-refund/workflow.test.mjs` passed 3/3.
- 510/510 protected historical/synthetic files and 23/23 frozen public-record result files are byte-identical. `cases.mjs`, `run.mjs`, `workflow.mjs` and `rubric-audit.json` are unchanged.
- `make -C paper tectonic`: 61 pages, 0 overfull boxes, 0 undefined references or citations, and the 7 existing underfull warnings. Pages 8–11, 40–41 and 46 were rendered and inspected. Local Markdown links and `git diff --check` passed.

## Author handoff

**C2 reviewed.** Open author actions:
1. Section 5 and the Section 7.11 discussion are AI first drafts of manuscript sections. Taylor & Francis guidance (re-read Nov 4) says it "does not allow generative AI to create a first draft of a manuscript or sections of a manuscript". Disclosure does not resolve this. Write the passages yourselves from the review record, or obtain the editors' agreement (A1/P5).
2. Check Moffatt paragraphs 18, 34 and 40 on CanLII or the CRT site.
3. Confirm the audit judgments.

C3 (design-science framing) is next.
