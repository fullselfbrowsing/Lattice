---
type: quick
id: 261104-exq
date: 2026-11-04
status: complete
---

# Review C2: sources, rubric and narrative

Lakshman asked Claude (Claude Code, Claude Opus 5.5) to carry out the C2 review: rewrite the Codex reference narrative in Claude's own voice with Moffatt as the central example, validate the sources and the rubric correction, confirm the factual claims (especially the difference between a tribunal's payment order and proof of settlement), integrate the narrative next to the existing figure and tables, and mark C2 reviewed. C3 follows separately and is not started here.

Executed inline rather than through planner/executor subagents, because the task is to write in Claude's own voice and to apply its own source judgment.

## Tasks

1. **Validate sources.** Re-download all four PDFs from their recorded URLs and compare their bytes with the manifest. Re-extract the 18 pages and compare their text hashes. Read every page used by a question, and check that each claim in the reference draft, the case record and the manuscript tables has a primary-source locator. Check the Moffatt order paragraphs (44, 47) and the evidence about subsequent payment. No inference.
2. **Validate the rubric correction in both directions.** Confirm the DRN-4148727 page-1 correction. Then check every one of the 75 graded answer/page pairs under the same standard (the cited page must state the recorded value) and record any annotation errors in either direction. Report the frozen and fully audited scores separately. Do not change frozen code, labels, outputs or scores, and do not rerun anything.
3. **Rewrite and integrate the narrative.** Write a new narrative for Section 4 with Moffatt at the center, and add a short results discussion beside Table `tab:public-refund-results`. Regenerate the results table from the frozen results plus the complete audit. Update the AI-use declaration to say that Claude drafted this text. Mark the Codex draft as superseded.
4. **Record and verify.** Write a review record covering sources, facts and the rubric. Update the eval README/interpretation, case/provenance record, checklist (C2 reviewed; A1 inventory) and STATE. Run the generator `--check` commands and workflow tests, check that protected files are unchanged, build the PDF and inspect the affected pages visually, then commit.

## Acceptance

- Every factual statement in the new narrative traces to a page or paragraph of a primary decision, or to the frozen eval outputs.
- Orders, directions, offers, temporary credits and completed payments are kept distinct. No statement implies that Moffatt was paid.
- The rubric audit is applied in both directions. Any post-hoc score correction is reported next to the frozen score.
- The manuscript discloses that Claude drafted the narrative. The record flags the publisher's restriction on AI first drafts for the authors to decide.
- Build, references, `--check` generators and hash comparisons pass.
