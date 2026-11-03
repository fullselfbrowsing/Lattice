# C2 reference draft: reviewing actual public refund disputes

**AI-generated reference draft for Lakshman and Rabih to rewrite; not submission-ready.** Revised November 3, 2026 after the user clarified that actual public records were required. OpenAI Codex prepared this text; session model/version is unconfirmed. The earlier invented-case narrative is superseded and remains in Git history. This reference stays outside `main.tex`; A1/P5 authorship and verification checks remain open. Reference labeling or editing does not itself resolve the [publisher's first-draft restriction](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/).

## Reference narrative

### Actual records and the organizational problem

A disputed refund can require an organization to reconcile several kinds of evidence: what the customer paid, what a representative promised, what the terms allowed, what a reviewer decided, and whether money actually changed hands. The distinction matters because a recommendation, a temporary credit, an adjudicator's direction and a completed payment describe different events. A review process that collapses them into one answer can obscure the question a responsible employee needs to resolve. The present case examines whether an AI-assisted review can retain the records behind its answers and expose those distinctions for subsequent inspection.

The evaluation uses four actual published decisions: Moffatt v. Air Canada and Financial Ombudsman decisions DRN-4377241, DRN-4148727 and DRN-3785437. These were selected for their relevance to travel-refund evidence and availability as primary documents. The inputs comprise all eighteen extracted PDF pages, rather than invented bookings or replacement company policies. The records describe real disputes, but they are published accounts rather than original company systems or complete exhibit files. Selection was purposive, and the small collection is not a representative sample of refund disputes.[1–4]

Moffatt provides the central accountability example. The decision records conflicting chatbot and webpage guidance, missing contractual evidence, and a total order of CAD 812.02. It does not confirm subsequent payment of that order. This distinction is preserved in the evaluation: a model must identify what the record establishes while leaving settlement unconfirmed. The tribunal decision does not identify the chatbot's technical architecture or establish a tampering incident. Lattice was not involved in the historical dispute, and this experiment does not demonstrate that it would have prevented it.[1]

The other decisions expose related evidence problems. DRN-4377241 describes an email inbox controlled by a travel agent that obstructed the customer's refund application. DRN-4148727 distinguishes an earlier chargeback, a later airline payment to an agency and bank compensation. DRN-3785437 records a temporary credit that was subsequently reversed. These cases make review of actual records relevant without assuming identical contractual rules, jurisdictions or outcomes. The task extracts published facts; it does not independently adjudicate entitlement.[2–4]

### What Lattice actually does

The application preserves each source URL and PDF fingerprint, extracts page text, and assigns page identifiers. It passes those exact pages, a review task and an execution policy to Lattice. The selected free model returns structured factual answers, references to supporting pages and a short review note. A format contract checks the response structure. Lattice produces a terminal receipt, and the application retains the source inputs, serialized provider request and response for verification. No approval limits, employee decisions or payment events are fabricated for this workflow.[5]

A separate process checks the issuer's signature, recomputes content hashes, verifies expected task and execution-policy commitments, and confirms that every source page appears in the recorded provider request. Source-based scoring separately compares factual answers and cited pages with a predefined rubric. These are distinct checks: a valid signature can preserve an incorrect interpretation, and a correct answer can be unusable if its response format fails. The resulting packet is intended for a disputes reviewer, but no reviewer-performance study or payment execution occurred.[5]

### Results and interpretation

The frozen cohort comprised four disputes, two models and two repetitions: sixteen live reviews with eighty planned answer instances. Nemotron produced eight usable responses with all factual and supporting-page checks passing. Dots produced seven usable responses; one response contained two JSON objects and was rejected by the format contract. The frozen rubric recorded fourteen full passes overall. A subsequent source audit found that its accepted-page list wrongly excluded a page that explicitly supported one Dots answer. A separately documented correction therefore yields fifteen full passes, without rerunning inference or changing the original scores.[5,6]

All sixteen terminal receipt signatures verified. Fifteen runs had successful-output commitments and complete local evidence verification. The format failure had a valid terminal receipt but no successful-output hash; its raw response remained separately retained. Ten scoped integrity checks passed on one eligible live bundle, including an intact control. All sixteen inference requests reported zero cost, and account usage did not increase. The earlier synthetic demonstration remains a separate technical control and is not pooled with these actual-record results.[5,6]

The full decisions, including their outcomes, were supplied to the models. The results therefore concern retrospective record review, not prediction of adjudication or legal-advice accuracy. Public cases may have appeared in training, repetitions are dependent, and independent author validation of the rubric remains pending. Supporting-page coverage does not establish entailment of every sentence in the review note. Receipts preserve commitments; they do not establish issuer honesty, original-document authenticity or complete organizational history. Managerial usefulness, faster dispute resolution and improved financial outcomes remain objectives for future evaluation.

## Sources and author handoff

1. [Moffatt v. Air Canada, primary judgment copy](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf), paragraphs 14–17, 27–32 and 44.
2. [Financial Ombudsman DRN-4377241](https://www.financial-ombudsman.org.uk/decision/DRN-4377241.pdf), pages 1–4.
3. [Financial Ombudsman DRN-4148727](https://www.financial-ombudsman.org.uk/decision/DRN-4148727.pdf), pages 1–2; the outcome is stated on both pages.
4. [Financial Ombudsman DRN-3785437](https://www.financial-ombudsman.org.uk/decision/DRN-3785437.pdf), pages 1–3.
5. [Frozen actual-record report](../../eval/public-refund/results/summary.md), [source manifest](../../eval/public-refund/source-manifest.json), [protocol](../../eval/public-refund/results/protocol.json), measured revision `3330ca2`.
6. [Interpretation](../../eval/public-refund/results/interpretation.md) and [documented source-rubric correction](../../eval/public-refund/results/rubric-audit.json). Frozen score 14/16; corrected page whitelist 15/16. No inference reruns.

**C2: actual public-record evidence integrated; author narrative and review pending.** The main manuscript contains the actual-record workflow and factual evidence/results tables. The older synthetic presentation is retained as an appendix. No company deployment, actual staff approval or new payment is claimed. Rewrite the narrative and validate the sources/rubric before incorporating author text; C3 remains unstarted.
