# C2: actual public refund-dispute records and provenance

Date: November 3, 2026. GSD quick task: `261103-mnn`. Measured revision: `3330ca28c73ff11d355181cf24cb364ac1fe4c73`. Original results preserved at `efefcf2` before the rubric audit.

## Scope correction and authorization

Lakshman objected that the earlier case used invented data and explicitly chose **public records of actual disputes**. The main case now uses four actual published decisions, with exact extracted page text supplied to live free models through Lattice. No booking, company policy, approval or payment event was invented for this cohort. The earlier synthetic cohort remains unchanged as a technical control in Appendix B; it is not evidence of actual company operation.

The completed application reviews published records retrospectively. Full decisions include their outcomes; this is not prediction of adjudication. The records are real, but Lattice was not used in the historical disputes, and this experiment does not observe a company deployment, employee authorization, payment execution or practitioner benefit. Selection was purposive, cases may have appeared in training, and two repetitions do not make independent customer samples.

## Primary records and factual boundaries

| Record | Primary document and location | Why it matters | Boundary |
| --- | --- | --- | --- |
| Moffatt v. Air Canada, 2024 BCCRT 149 | [Tribunal judgment hosted by Middle Temple](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf), nine pages; paragraphs 14–17, 27–32 and 44 | Conflicting chatbot/webpage advice, absent contractual evidence and an order totaling CAD 812.02 | The total includes damages, interest and fees; it is not solely a ticket refund. The decision supplies no subsequent settlement evidence. Chatbot architecture and tampering are not established. The stated total paid (CAD 1,630.36, paras. 34, 40) is CAD 10 less than the recorded fares (794.98 + 845.38 = 1,640.36, para. 18). Para. 38 reports a bereavement-fare cost of CAD 474.23, but its components sum to CAD 464.23. The tribunal's amounts are reported as published. |
| DRN-4377241 | [Financial Ombudsman decision](https://www.financial-ombudsman.org.uk/decision/DRN-4377241.pdf), four pages; pages 1, 3–4 | Travel-agent-controlled email prevented customer verification; distinguishes a GBP 77.44 refund, GBP 19.41 bank fees and conditional GBP 100 compensation | Directions to pay are not observed completed payments. Publication date is unconfirmed; the acceptance deadline is not treated as the issue date. |
| DRN-4148727 | [Financial Ombudsman decision](https://www.financial-ombudsman.org.uk/decision/DRN-4148727.pdf), two pages | Distinguishes an approximately GBP 126 earlier refund, GBP 958 later airline payment to the agent and GBP 150 bank compensation | The amount described as approximate remains approximate. The complaint is not upheld; that outcome appears on both pages. |
| DRN-3785437 | [Financial Ombudsman decision](https://www.financial-ombudsman.org.uk/decision/DRN-3785437.pdf), three pages | A GBP 74.62 ticket, GBP 13 requested taxes and a temporary credit subsequently reversed | The GBP 73 administration fee is per person per flight, not an observed refund. The final complaint outcome and actual transaction states remain distinct. |

All PDFs were retrieved November 3. The [source manifest](../../eval/public-refund/source-manifest.json) records URLs, PDF fingerprints and per-page text hashes. Poppler `pdftotext 26.06.0 -layout` extracted all 18 pages; preparation splits form feeds and trims page boundaries. Inputs are not paraphrased or replaced with synthetic policy facts. Primary PDFs and source pages were inspected before execution, including the pages supporting the amounts and outcomes.

Full PDFs, extracted pages and exact request exports remain local under `.context/refund-public/`; they are not republished in the repository. Public bundles contain model outputs, receipts, page identifiers and source/request fingerprints. This avoids asserting unrestricted redistribution rights and means the public bundles alone do not supply every byte needed for full package verification. A verifier needs the retained bytes or exact-source reacquisition; an issuer signature does not prove source authenticity or provider consumption. Original company systems and complete exhibits were unavailable.

## Frozen experiment and results

The [protocol](../../eval/public-refund/results/protocol.json) froze code, source/label/input hashes and the trust anchor before inference. Four cases × two pinned free models × two repetitions yielded **16 planned reviews** and **80 planned answer instances**. Five questions per case ask about recorded facts and evidence limits. Expected answers and accepted source pages were excluded from model prompts. Codex prepared the questions and rubric. Claude audited them against the sources on November 4 ([C2 review](C2-REVIEW.md)).

| Measure | Nemotron 3.5 Super VL | Dots 3 Note Preview |
| --- | --- | --- |
| Planned / attempted reviews | 8/8 | 8/8 |
| Usable structured responses | 8/8 | 7/8 |
| All answer values match the frozen rubric | 8/8 | 7/8 |
| Full rubric, frozen | 8/8 | 6/8 |
| Full rubric, complete source audit | 8/8 | 6/8 |
| Individual answer values matching the frozen rubric | 40/40 | 35/40 |
| Valid terminal signatures | 8/8 | 8/8 |
| Complete successful-output packages | 8/8 | 7/8 |

The pinned model IDs were `nvidia/nemotron-3.5-super-vl:free` and `dots-studio/dots-3-note-preview:free`; temperature 0, output cap 4096, reasoning settings omitted. All 16 requests reported zero cost and account usage increased by USD 0. The shared free-request ledger advanced from 818 to 834; the paid ledger remained unchanged. No development inference, retries, repairs, replacement runs or paid fallback occurred.

**Source-rubric audit (superseding the one-sided correction):** the frozen rubric accepted only page 2 for DRN-4148727's complaint outcome, although page 1 also states it. One Dots answer cited page 1, and the November 3 [audit](../../eval/public-refund/results/rubric-audit.json) raised the score to 15/16 by accepting it. On November 4, Claude applied the same standard (the cited page must state the recorded value) to all 75 graded pairs. Moffatt page 4 records only the two fares, which sum to CAD 1,640.36, yet the rubric had accepted it for the CAD 1,630.36 stated total; page 8 states that total and was omitted. One Dots answer cited page 4 alone. Page 5 also states the 90-day window, which changes no score. The [complete audit](../../eval/public-refund/results/source-audit.json) therefore yields **14/16**, the same as the frozen score. The 15/16 figure is superseded. Original code, labels, outputs and scores remain unchanged. The generator re-derives both audits from the saved per-answer grades and checks the page hashes. Supporting-page coverage is narrower than entailment of all generated text.

**Actual format failure:** the first Dots response for DRN-3785437 contained an answer JSON object followed by a second context-pack JSON object. Lattice rejected the combined response as `tripwire-violated`. No answer fragments were rescued; all five planned answers remain nonpassing. The failure receipt's signature and task/execution-policy/request commitments verify, but it has no successful-output hash. Consequently there are **16 valid signatures but 15 complete successful-output packages**. The malformed raw response is separately retained, not described as a successfully committed output.

The separate verifier process recomputed all retained source/output/request hashes, checked expected task and execution-policy bindings, and confirmed every input page in the serialized provider request. Ten scoped checks on one eligible live bundle passed: intact control, changed page, missing page, changed output, changed request, changed task, wrong case, missing receipt, forged signature and untrusted key. These are not ten actual disputes or ten observed attacks. No receipt verification re-executes a model or proves honesty, truth or settlement.

## Assistance, presentation and validation

OpenAI Codex acquired and inspected sources, prepared the protocol/questions/rubric and harness, executed and analyzed the free cohort, identified and documented the annotation omission, and prepared the reference draft, diagrams, factual tables and limited abstract/roadmap/conclusion/declaration edits. The drafting session's model/version is **unconfirmed**; the author's pooled model list does not establish a tool-to-model mapping. Evaluated model identifiers above are separate research-subject metadata.

The Codex reference narrative is [superseded](C2-REFERENCE-DRAFT.md). At Lakshman's direction, Claude (Claude Code, Claude Opus 5.5) re-verified the sources, audited the rubric, wrote the Section 5 narrative and the Section 7.11 (now 7.7) results discussion, corrected one conclusion sentence and added the matching AI-use disclosure; see the [C2 review](C2-REVIEW.md). These passages are AI first drafts of manuscript sections. Taylor & Francis guidance does not allow this, and disclosure does not resolve it. The authors must act under A1/P5 before submission.

Offline preflight passed exact-page transport and evidence checks for all four records; `node --test eval/public-refund/workflow.test.mjs` passed three tests. The fresh-process report verified the retained evidence, and both manuscript presentation generators support read-only `--check`. Final PDF build, layout inspection, unchanged historical/frozen file hashes and repository checks are recorded in the [quick-task summary](../../.planning/quick/261103-mnn-correct-c2-with-public-actual-refund-dis/261103-mnn-SUMMARY.md).

**Handoff: C2 reviewed (Nov 4).** The sources, facts and rubric are validated, and the narrative is integrated. Outstanding author items are the publisher first-draft decision, a manual check of Moffatt paragraphs 18, 34, 38 and 40 on CanLII, and A1/P5 disclosure confirmation. C4 requirements mapping and practitioner usefulness remain open. C3 is next.
