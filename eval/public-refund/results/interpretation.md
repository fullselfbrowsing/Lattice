# Interpretation and source-rubric audit

The cohort used the full extracted pages of four actual public dispute decisions. It completed 16 live free-model reviews at measured revision `3330ca2`, with 16 reported-zero request costs and USD 0 added account usage. No booking, company rule, approval or payment event was invented for these reviews. Earlier synthetic tests remain separate.

## Frozen versus audited source coverage

| Model | Usable responses / planned | Frozen full rubric | One-sided correction (Nov 3, superseded) | Complete source audit (Nov 4) | Valid receipt signatures | Successful-output evidence packages |
| --- | --- | --- | --- | --- | --- | --- |
| Nemotron 3.5 Super VL | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 |
| Dots 3 Note Preview | 7/8 | 6/8 | 7/8 | 6/8 | 8/8 | 7/8 |

The frozen [summary](summary.json) gives 14/16 full passes. On November 3, a post-run audit found that the `complaint_upheld` whitelist for DRN-4148727 accepted only page 2, although page 1 also states the ombudsman's conclusion. The Dots response citing page 1 was correct. That [one-sided correction](rubric-audit.json) produced 15/16 and is kept unchanged as a historical record.

On November 4, Claude re-checked all four PDFs against the manifest and re-read all 75 graded answer/page pairs. The standard was the one that justified the first correction: the cited page must state the recorded value. The [complete audit](source-audit.json) applies that standard in both directions:

- **DRN-4148727 `complaint_upheld`:** the page-1 correction holds. One Dots run gains a pass.
- **Moffatt `paid_total_minor`:** the whitelist accepted page 4, but that page records only the two fares, CAD 794.98 and 845.38, which sum to **CAD 1,640.36**. The labelled CAD 1,630.36 is the total the tribunal states at paragraphs 34 (page 7) and 40 (page 8), and page 8 was missing from the whitelist. One Dots run cited only page 4, so it loses its pass.
- **Moffatt `chatbot_window_days`:** page 5 (paragraphs 20–21) also states the 90-day window. No score changes.

The audited result is **14/16** (Nemotron 8/8, Dots 6/8). The 15/16 figure applied only the correction that favored the models and is superseded for presentation. Original prompts, labels, code, raw outputs and frozen scores remain unchanged. `paper/scripts/public-refund-tables.mjs` re-derives the audited counts from the saved per-answer grades and asserts the affected rows. Author confirmation of the audit belongs to A1/P5. Source-page coverage is narrower than semantic entailment of every generated sentence.

**The record is internally inconsistent in two places.** First, damages and the CAD 812.02 order are calculated from the stated CAD 1,630.36 paid, which is CAD 10.00 less than the sum of the fares the decision itself records. Second, paragraph 38 reports a bereavement-fare cost of CAD 474.23 for the outbound flight, but its listed components sum to CAD 464.23. The should-have-paid total of CAD 979.48 uses the reported figure. The tribunal's amounts are reported here as published; the decision cannot show which figures match the actual charges. One Dots review note flagged the first discrepancy without any question asking about it. No review noted the second. The rubric flagged neither, and review notes are not scored.

## The actual format failure

The first Dots review of DRN-3785437 returned an answer object followed by another JSON object containing context-pack information. The overall response was not one valid JSON object, so the Lattice format invariant returned `tripwire-violated`. There was no repair or retry. Five answers from that unusable response receive no passing-answer credit, rather than being silently recovered. The other 75 answer instances matched the frozen rubric values; this describes accepted structured outputs, not legal-advice accuracy.

Its terminal signature and task, execution-policy and request commitments verified. It had **no successful-output hash**, so the complete successful-output evidence measure is **15/16**, while valid terminal signatures are **16/16**. The malformed raw response is retained separately in the export; it must not be described as a successfully committed output.

All 10 scoped integrity checks passed on one eligible live bundle: one intact control and nine altered/missing-content or trust checks. This does not mean ten additional actual disputes or ten observed model attacks.

## What the actual-record review adds

All four Moffatt reviews correctly distinguished the total the tribunal recorded as paid, the chatbot's application window, the conflicting webpage restriction, the CAD 812.02 order and the absence of subsequent settlement evidence. All four DRN-4377241 reviews correctly identified the agent-controlled email inbox and separated the directed flight refund, fees and compensation. The case records, amounts and observed model outputs are real; no inference is made that Lattice was deployed at those companies or influenced the historical dispute.

The full decisions, including outcomes, were model inputs. This is source-grounded record review, not prediction of adjudication. Cases were selected purposively, repeated runs are dependent, and public records may have appeared in training. Original company exhibits and live staff workflows were unavailable. Managerial usefulness, legal correctness, financial outcomes and comparative effectiveness remain untested.
