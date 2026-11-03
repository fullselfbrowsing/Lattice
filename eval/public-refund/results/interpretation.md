# Interpretation and source-rubric audit

The cohort used the full extracted pages of four actual public dispute decisions. It completed 16 live free-model reviews at measured revision `3330ca2`, with 16 reported-zero request costs and USD 0 added account usage. No booking, company rule, approval or payment event was invented for these reviews. Earlier synthetic tests remain separate.

## Frozen versus corrected source coverage

| Model | Usable responses / planned | Frozen full rubric | Source-rubric correction | Valid receipt signatures | Successful-output evidence packages |
| --- | --- | --- | --- | --- | --- |
| Nemotron 3.5 Super VL | 8/8 | 8/8 | 8/8 | 8/8 | 8/8 |
| Dots 3 Note Preview | 7/8 | 6/8 | 7/8 | 8/8 | 7/8 |

The frozen [summary](summary.json) gives 14/16 full passes. A post-run source audit identified an annotation omission: for `complaint_upheld` in DRN-4148727, the rubric accepted only page 2, while page 1 also explicitly states the ombudsman's own non-upholding conclusion. The Dots response cited page 1 and had the correct value. This was a valid source reference, not a model factual or citation error. The [audit record](rubric-audit.json) records the source-page hash, locator, short supporting excerpt, original/corrected page sets and affected row.

Allowing pages 1 or 2 yields **15/16** full passes, or 8/8 Nemotron and 7/8 Dots. This is a disclosed post-hoc annotation correction, not a new experiment. Original prompts, labels, code, raw outputs and frozen scores remain unchanged. Independent author validation of the full rubric remains pending. Source-page coverage is narrower than semantic entailment of every generated sentence.

## The actual format failure

The first Dots review of DRN-3785437 returned an answer object followed by another JSON object containing context-pack information. The overall response was not one valid JSON object, so the Lattice format invariant returned `tripwire-violated`. There was no repair or retry. Five answers from that unusable response receive no passing-answer credit, rather than being silently recovered. The other 75 answer instances matched the frozen factual values; this describes accepted structured outputs, not legal-advice accuracy.

Its terminal signature and task, execution-policy and request commitments verified. It had **no successful-output hash**, so the complete successful-output evidence measure is **15/16**, while valid terminal signatures are **16/16**. The malformed raw response is retained separately in the export; it must not be described as a successfully committed output.

All 10 scoped integrity checks passed on one eligible live bundle: one intact control and nine altered/missing-content or trust checks. This does not mean ten additional actual disputes or ten observed model attacks.

## What the actual-record review adds

All four Moffatt reviews correctly distinguished the recorded total paid, the chatbot's application window, the conflicting webpage restriction, the CAD 812.02 order and the absence of subsequent settlement evidence. All four DRN-4377241 reviews correctly identified the agent-controlled email inbox and separated the directed flight refund, fees and compensation. The case records, amounts and observed model outputs are real; no inference is made that Lattice was deployed at those companies or influenced the historical dispute.

The full decisions, including outcomes, were model inputs. This is source-grounded record review, not prediction of adjudication. Cases were selected purposively, repeated runs are dependent, and public records may have appeared in training. Original company exhibits and live staff workflows were unavailable. Managerial usefulness, legal correctness, financial outcomes and comparative effectiveness remain untested.
