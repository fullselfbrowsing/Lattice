# C2 review: sources, facts, rubric and narrative

Date: November 4, 2026. GSD quick task: `261104-exq`. Reviewer: Claude (Claude Code, Claude Opus 5.5), acting at Lakshman Turlapati's direction. This is an AI review. It does not replace the authors' own confirmation under A1/P5.

**Numbering note (Nov 5):** C4 later reorganized the Evaluation section. "Section 7.11" below is now Section 7.7, and table numbers have shifted.

**Outcome.** All four sources were re-verified byte for byte, and every factual claim in the C2 materials has a primary-source locator. The tribunal order in Moffatt is not evidence of settlement, and the rubric treats it correctly. The November 3 rubric correction is valid, but it was applied in only one direction. A complete audit finds an offsetting error, which leaves the score at **14/16** rather than 15/16. The audit also found that the Moffatt decision is arithmetically inconsistent in two places: the total paid, and the bereavement-fare cost of the outbound flight (paragraph 38). The tribunal's reported amounts are preserved as published. Claude rewrote the narrative with Moffatt at the center and integrated it into Section 5 and Section 7.11 of `main.tex`. **C2 is marked reviewed**, subject to the publisher-policy issue below.

## 1. Source validation

| Source | Re-download (Nov 4) | PDF SHA-256 vs manifest | Page-text hashes | Notes |
| --- | --- | --- | --- | --- |
| [Moffatt v. Air Canada, 2024 BCCRT 149](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf) | HTTP 200 | match | 9/9 | Every page carries the CanLII stamp "2024 BCCRT 149 (CanLII)". The official CRT page and the CanLII HTML refused automated access (HTTP 403). Issued February 14, 2024; Tribunal Member Christopher C. Rivers; file SC-2023-005609. |
| [FOS DRN-4377241](https://www.financial-ombudsman.org.uk/decision/DRN-4377241.pdf) | HTTP 200 | match | 4/4 | Ombudsman Tero Hiltunen; acceptance requested before March 18, 2024. The issue date is not printed and is not inferred. |
| [FOS DRN-4148727](https://www.financial-ombudsman.org.uk/decision/DRN-4148727.pdf) | HTTP 200 | match | 2/2 | Ombudsman Richard Wood; acceptance requested before October 17, 2023. |
| [FOS DRN-3785437](https://www.financial-ombudsman.org.uk/decision/DRN-3785437.pdf) | HTTP 200 | match | 3/3 | Ombudsman Will Culley; acceptance requested before June 28, 2023. |

Extraction was repeated with Poppler `pdftotext 26.06.0 -layout`, the same version and settings as `prepare.mjs`. All 18 page hashes match `eval/public-refund/source-manifest.json`. Moffatt pages 4 and 8 were also rendered and read as images to confirm the fare figures. The four bibliography entries match the documents. Using DRN-number citation aliases avoids the ambiguous "n.d.a/b/c" in-text labels.

**Recommended author check (5 minutes):** open the CanLII or CRT copy of Moffatt in a browser and confirm paragraphs 18, 34, 38 and 40. Automated access to both was refused, so the Middle Temple copy has not been compared with the official HTML.

## 2. Factual claims

Each claim in the Codex reference draft, the case record, the figure and tables, and the new narrative was checked against the cited page.

| Claim | Primary locator | Verdict |
| --- | --- | --- |
| The chatbot allowed bereavement applications within 90 days of ticket issue, including after travel | Moffatt para. 15 (p. 4) | Confirmed |
| The linked webpage excluded requests after travel was completed | paras. 16–17 (p. 4) | Confirmed |
| Air Canada gave no information about the nature of its chatbot; its architecture is not established | para. 14 (p. 3) | Confirmed. Nothing in the decision supports any claim about an LLM, the architecture or tampering. |
| An Air Canada representative admitted "misleading words" | para. 22 (p. 5) | Confirmed |
| The chatbot is part of the website, and Air Canada is responsible for all information on it | para. 27 (p. 6) | Confirmed |
| Air Canada did not provide the tariff, so its contractual defence was not proven | para. 31 (pp. 6–7) | Confirmed |
| A CAD 200 coupon was offered, not shown to be accepted, and no set-off was allowed | para. 41 (p. 8) | Confirmed; added to the narrative as an offer-versus-settlement example |
| Order totals CAD 812.02 = 650.88 damages + 36.14 interest + 125 fees, payable within 14 days | para. 44 (p. 9) | Confirmed. The order is not a ticket refund alone. |
| Total paid for the two flights | paras. 18, 34, 38–40 | **The record is internally inconsistent.** See section 4. |
| Bereavement-fare cost of the outbound flight would have been CAD 474.23 | para. 38 (p. 8) | **The record is internally inconsistent.** The components listed (380 + 62.12 + 22.11) sum to CAD 464.23. See section 4. |
| DRN-4377241: the site used its own email address, so the customer could not verify; the site declined to help | pp. 1, 3 | Confirmed. The decision calls K "a website". "Travel agent" is only the closest rubric label, so the narrative says "booking website". The Codex draft's "obstructed" is changed to "declined to help". |
| DRN-4377241: GBP 77.44 plus 8% interest; GBP 100 and GBP 19.41 each "if not already" | p. 4 | Confirmed. Page 1 shows the same amounts as the investigator's recommendation or the bank's offer, which correctly makes it ineligible for the direction questions. |
| DRN-4148727: about GBP 126 chargeback refund; GBP 958 paid by the airline to the agency; GBP 150 bank apology; not upheld | pp. 1–2 | Confirmed. The source's one "Mr R" is a typo for Mr P and does not affect any answer. |
| DRN-3785437: GBP 74.62 ticket; GBP 13 APD temporarily credited, then reversed; GBP 73 fee per person per flight; not upheld | pp. 1–3 | Confirmed |

## 3. Payment order versus proof of settlement

- **Moffatt.** Paragraph 44 is an order to pay within 14 days. Paragraph 45 adds post-judgment interest "as applicable". Paragraph 47 explains enforcement through the Provincial Court of British Columbia, a route that would matter only if payment were not made. A decision dated February 14, 2024 cannot record later events. A payment record, receipt or claimant acknowledgment would prove settlement, and the decision contains none. Therefore `settlement_proven = null` is the correct label: the decision gives no evidence of payment and no evidence of nonpayment. All four Moffatt reviews returned null and cited the order page.
- **Secondary reporting does not change this.** Global News (Amy Judd, February 15, 2024) says, in the reporter's voice, that Air Canada "will be reimbursing" Moffatt, which is future tense. Search snippets attribute a "will comply" statement to Air Canada, but its source could not be retrieved (CBC refused automated access). Even a verified statement would show intent, not payment. Neither is cited in the manuscript.
- **Ombudsman decisions.** These are directions that each ask the consumer to accept or reject by a deadline. DRN-4377241 makes its fee refund and compensation conditional ("if it hasn't already"), even though page 3 reports that the bank "has refunded the interest and late fee". This is the ombudsman's account of a past refund, not a payment record, and the question about the principal refund correctly remains null.

## 4. Rubric validation

**The November 3 correction is valid.** DRN-4148727 page 1 reads "Having done so, I do not uphold it." The page hash in `rubric-audit.json` matches the manifest, and so does the excerpt.

**The correction was applied in only one direction.** It added a page that rescued a model answer, but no one checked whether the whitelist also accepted pages that do not support the value. Applying the same standard (the cited page must state the recorded value) to all 75 graded answer/page pairs found:

| Question | Frozen pages | Audited | Effect |
| --- | --- | --- | --- |
| DRN-4148727 `complaint_upheld` | 2 | 1, 2 | One Dots run passes (+1) |
| Moffatt `paid_total_minor` (163036) | 4, 7 | 7, 8 (the stated total); page 4 only for the itemized sum 164036 | One Dots run cited only page 4, so it fails (−1) |
| Moffatt `chatbot_window_days` | 4 | 4, 5 | None |

Net result: **14/16 frozen and 14/16 audited** (Nemotron 8/8, Dots 6/8). The one-sided 15/16 is superseded wherever it is presented. The audit is recorded in [`source-audit.json`](../../eval/public-refund/results/source-audit.json). The generator re-derives it from saved grades and checks each page hash. `cases.mjs`, `rubric-audit.json` and all frozen results are unchanged.

**Moffatt contradicts itself in two places.** The tribunal's amounts are reported here as published. The arithmetic below is ours, on the decision's own figures, and is not a finding about what Moffatt was owed.

1. **Total paid.** Paragraph 18 records fares of CAD 794.98 and CAD 845.38, which sum to CAD 1,640.36. The same components appear in paragraphs 38–39. Paragraphs 34 and 40 state that Moffatt paid CAD 1,630.36, and the damages are calculated from that figure. Moffatt's own submission of CAD 880.36 matches the itemized fares (1,640.36 − 760).
2. **Bereavement-fare cost, outbound flight.** Paragraph 38 states that the flight "would have" cost CAD 474.23 at the bereavement fare. Its listed components (CAD 380 fare, 62.12 charges, 22.11 GST) sum to CAD 464.23; the GST is consistent with 5% of 442.12. Paragraph 39's return-flight figure (CAD 505.25) adds up. The should-have-paid total of CAD 979.48 (paragraph 40) uses the reported 474.23.

**Reported amounts, preserved as published:** CAD 1,630.36 paid; CAD 979.48 should have paid; CAD 650.88 damages; CAD 36.14 interest; CAD 125 fees; CAD 812.02 ordered (paragraph 44).

**Arithmetic only, not a finding:** both discrepancies lower the award relative to the decision's own components. Recomputing from the components gives 1,640.36 − 969.48 = CAD 670.88 in damages, CAD 20 more than the CAD 650.88 awarded. The published decision cannot show which figures match the actual charges, and the order is what the tribunal made. The manuscript reports the discrepancies and the tribunal's amounts but not this recomputation.

The frozen label for the total follows the tribunal's stated figure. That is defensible once the question is read as "the total the tribunal recorded"; the question's phrase "actually paid" overstates what the record can establish. One Dots review note flagged the first discrepancy. No review noted the second, which no question covered. The rubric flagged neither, and notes are not scored. The narrative uses both as real examples of why each value should be tied to its page.

## 5. Narrative rewrite and integration

The Codex reference draft is superseded. The new text, written by Claude, was integrated as follows:

- **Section 5** (about 1,040 words): an opening that states the problem; **5.1 Moffatt v. Air Canada** (facts, the evidence asymmetry, order versus settlement, and the two arithmetic inconsistencies); **5.2 Three ombudsman decisions**; **5.3 The executed review**, which places the existing figure and evidence table and gives the scope limits.
- **Section 7.11** (about 300 words): the results discussion beside the regenerated Table 21, with the two-way audit reported as frozen and audited together.
- **Conclusion:** one sentence corrected. It had said the public records showed an employee authorizing an AI recommendation, which they do not show. It now refers to Moffatt's evidence asymmetry.
- **Declaration:** a sentence disclosing that Claude Code (Claude Opus 5.5) drafted these passages and performed the source and rubric review.

**Correction pass (Nov 4, quick task `261104-i85`):**
- Section 5.1 adds the paragraph 38 inconsistency, keeping the tribunal's amounts as published.
- The table rows "All factual answers correct" and "Correct individual answers" are renamed "All answer values match the frozen rubric" and "Individual answer values matching the frozen rubric", because they measure agreement with the frozen rubric, not truth.
- Sections 5.3, 6 and 7.11, and the table notes, now state that Lattice adds an output commitment only when a run succeeds (`create-ai.ts` passes outputs to the receipt only on the success path; `agent/runtime.ts` sets `outputHash` only for `kind === "success"`). The failed C2 run's receipt commits to the task, policy and request and has `outputHash: null`.

The narrative's main changes from the Codex draft are: Moffatt's *evidential* asymmetry is the accountability point (customer screenshot, no chatbot information, tariff not produced, coupon not shown to be accepted); the order-versus-settlement boundary is spelled out from paragraphs 44–47; the record's internal inconsistency is used as evidence; the audit is reported in both directions; and the scope limits are stated once, plainly.

## 6. Publisher policy: author decision required

The Taylor & Francis [AI guidance](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/), re-read November 4, states: "No – Taylor & Francis does not allow generative AI to create a first draft of a manuscript or sections of a manuscript." Section 5's narrative and the Section 7.11 discussion are AI first drafts of manuscript sections. They were integrated because Lakshman explicitly asked for this, and the manuscript discloses it. Disclosure does not satisfy the restriction. Before submission, the authors should either write these passages themselves, using this record and the sources, or obtain the editors' explicit agreement. This affects A1, P5 and the go/no-go gate. It is not resolved by marking C2 reviewed.

**Correction (Nov 6, quick task `261106-2fh`):** do not rely on the editor-agreement option above. The Taylor & Francis guidance and its [main AI policy](https://taylorandfrancis.com/our-policies/ai-policy/) describe no exception route for article authors; the only approval route they describe is for book authors. The authors should write these passages themselves. See the [rewrite guide](AUTHOR-REWRITE.md).
