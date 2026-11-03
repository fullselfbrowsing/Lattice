# C2: actual public refund-dispute records and provenance

Date: November 3, 2026. GSD quick task: `261103-mnn`. Measured revision: `3330ca28c73ff11d355181cf24cb364ac1fe4c73`. Original results preserved at `efefcf2` before the rubric audit.

## Scope correction and authorization

Lakshman objected that the earlier case used invented data and explicitly chose **public records of actual disputes**. The main case now uses four actual published decisions, with exact extracted page text supplied to live free models through Lattice. No booking, company policy, approval or payment event was invented for this cohort. The earlier synthetic cohort remains unchanged as a technical control in Appendix B; it is not evidence of actual company operation.

The completed application reviews published records retrospectively. Full decisions include their outcomes; this is not prediction of adjudication. The records are real, but Lattice was not used in the historical disputes, and this experiment does not observe a company deployment, employee authorization, payment execution or practitioner benefit. Selection was purposive, cases may have appeared in training, and two repetitions do not make independent customer samples.

## Primary records and factual boundaries

| Record | Primary document and location | Why it matters | Boundary |
| --- | --- | --- | --- |
| Moffatt v. Air Canada, 2024 BCCRT 149 | [Tribunal judgment hosted by Middle Temple](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf), nine pages; paragraphs 14–17, 27–32 and 44 | Conflicting chatbot/webpage advice, absent contractual evidence and an order totaling CAD 812.02 | The total includes damages, interest and fees; it is not solely a ticket refund. The decision supplies no subsequent settlement evidence. Chatbot architecture and tampering are not established. |
| DRN-4377241 | [Financial Ombudsman decision](https://www.financial-ombudsman.org.uk/decision/DRN-4377241.pdf), four pages; pages 1, 3–4 | Travel-agent-controlled email prevented customer verification; distinguishes a GBP 77.44 refund, GBP 19.41 bank fees and conditional GBP 100 compensation | Directions to pay are not observed completed payments. Publication date is unconfirmed; the acceptance deadline is not treated as the issue date. |
| DRN-4148727 | [Financial Ombudsman decision](https://www.financial-ombudsman.org.uk/decision/DRN-4148727.pdf), two pages | Distinguishes an approximately GBP 126 earlier refund, GBP 958 later airline payment to the agent and GBP 150 bank compensation | The amount described as approximate remains approximate. The complaint is not upheld; that outcome appears on both pages. |
| DRN-3785437 | [Financial Ombudsman decision](https://www.financial-ombudsman.org.uk/decision/DRN-3785437.pdf), three pages | A GBP 74.62 ticket, GBP 13 requested taxes and a temporary credit subsequently reversed | The GBP 73 administration fee is per person per flight, not an observed refund. The final complaint outcome and actual transaction states remain distinct. |

All PDFs were retrieved November 3. The [source manifest](../../eval/public-refund/source-manifest.json) records URLs, PDF fingerprints and per-page text hashes. Poppler `pdftotext 26.06.0 -layout` extracted all 18 pages; preparation splits form feeds and trims page boundaries. Inputs are not paraphrased or replaced with synthetic policy facts. Primary PDFs and source pages were inspected before execution, including the pages supporting the amounts and outcomes.

Full PDFs, extracted pages and exact request exports remain local under `.context/refund-public/`; they are not republished in the repository. Public bundles contain model outputs, receipts, page identifiers and source/request fingerprints. This avoids asserting unrestricted redistribution rights and means the public bundles alone do not supply every byte needed for full package verification. A verifier needs the retained bytes or exact-source reacquisition; an issuer signature does not prove source authenticity or provider consumption. Original company systems and complete exhibits were unavailable.

## Frozen experiment and results

The [protocol](../../eval/public-refund/results/protocol.json) froze code, source/label/input hashes and the trust anchor before inference. Four cases × two pinned free models × two repetitions yielded **16 planned reviews** and **80 planned answer instances**. Five questions per case ask about recorded facts and evidence limits. Expected answers and accepted source pages were excluded from model prompts. Codex prepared the questions and rubric; independent author validation remains pending.

| Measure | Nemotron 3.5 Super VL | Dots 3 Note Preview |
| --- | --- | --- |
| Planned / attempted reviews | 8/8 | 8/8 |
| Usable structured responses | 8/8 | 7/8 |
| All factual checks | 8/8 | 7/8 |
| Full rubric, frozen | 8/8 | 6/8 |
| Full rubric, documented page correction | 8/8 | 7/8 |
| Correct factual answer instances | 40/40 | 35/40 |
| Valid terminal signatures | 8/8 | 8/8 |
| Complete successful-output packages | 8/8 | 7/8 |

The pinned model IDs were `nvidia/nemotron-3.5-super-vl:free` and `dots-studio/dots-3-note-preview:free`; temperature 0, output cap 4096, reasoning settings omitted. All 16 requests reported zero cost and account usage increased by USD 0. The shared free-request ledger advanced from 818 to 834; the paid ledger remained unchanged. No development inference, retries, repairs, replacement runs or paid fallback occurred.

**Annotation correction, not a model error:** the frozen rubric accepted only page 2 for DRN-4148727's complaint outcome. One Dots answer correctly cited page 1, which also explicitly states that outcome. The [audit](../../eval/public-refund/results/rubric-audit.json) records the page hash, locator, short excerpt and affected row. Accepting pages 1 or 2 changes the full-rubric result from **14/16 to 15/16**, reported separately. Original code, labels, outputs and scores remain unchanged. The presentation generator re-derives the corrected count from saved per-answer grades and asserts the exact changed row. Supporting-page coverage is narrower than entailment of all generated text.

**Actual format failure:** the first Dots response for DRN-3785437 contained an answer JSON object followed by a second context-pack JSON object. Lattice rejected the combined response as `tripwire-violated`. No answer fragments were rescued; all five planned answers remain nonpassing. The failure receipt's signature and task/execution-policy/request commitments verify, but it has no successful-output hash. Consequently there are **16 valid signatures but 15 complete successful-output packages**. The malformed raw response is separately retained, not described as a successfully committed output.

The separate verifier process recomputed all retained source/output/request hashes, checked expected task and execution-policy bindings, and confirmed every input page in the serialized provider request. Ten scoped checks on one eligible live bundle passed: intact control, changed page, missing page, changed output, changed request, changed task, wrong case, missing receipt, forged signature and untrusted key. These are not ten actual disputes or ten observed attacks. No receipt verification re-executes a model or proves honesty, truth or settlement.

## Assistance, presentation and validation

OpenAI Codex acquired and inspected sources, prepared the protocol/questions/rubric and harness, executed and analyzed the free cohort, identified and documented the annotation omission, and prepared the reference draft, diagrams, factual tables and limited abstract/roadmap/conclusion/declaration edits. The drafting session's model/version is **unconfirmed**; the author's pooled model list does not establish a tool-to-model mapping. Evaluated model identifiers above are separate research-subject metadata.

The separate [approximately 800-word reference narrative](C2-REFERENCE-DRAFT.md) is explicitly AI-generated for author rewriting and is not included in `main.tex`. The main additions are the workflow, evidence/results tables and factual captions/notes. A1/P5 still require author source/content verification, version/terms checks and review of earlier AI-generated evaluation prose. Reference labeling, disclosure or subsequent editing does not itself resolve the [publisher's first-draft restriction](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/).

Offline preflight passed exact-page transport and evidence checks for all four records; `node --test eval/public-refund/workflow.test.mjs` passed three tests. The fresh-process report verified the retained evidence, and both manuscript presentation generators support read-only `--check`. Final PDF build, layout inspection, unchanged historical/frozen file hashes and repository checks are recorded in the [quick-task summary](../../.planning/quick/261103-mnn-correct-c2-with-public-actual-refund-dis/261103-mnn-SUMMARY.md).

**Handoff: C2 actual public-record evidence integrated; author narrative and review pending.** C4 requirements mapping and practitioner usefulness remain open. C3 was not started. The primary next step is author rewriting and validation of this case and its rubric, not another inference run.
