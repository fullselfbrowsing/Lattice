# C5 managerial implications: evidence and provenance

Date: November 4, 2026. GSD quick task `261104-it0`. Baseline `7cefab4`, following the C2 correction pass and C4 consolidation. This pass makes organizational design proposals from existing evidence; it is not a deployment, practitioner study or new governance assessment.

## Recommendations and their support

| Proposed decision or responsibility | Existing support | What remains proposed or untested |
| --- | --- | --- |
| Business-process owner assigns approval policy, exceptions, escalation and customer contestation. | [C3 source map](C3-SOURCE-MAP.md): DR3 and the selected NIST GOVERN 3.2 / MANAGE 4.1 outcomes distinguish human authority from execution controls. [C2 review](C2-REVIEW.md) and the case section distinguish automated advice, policy, orders and settlement records. | Specific role allocation, authority limits and an effective customer-redress process were not evaluated. The table is a proposed operating arrangement, not a source-prescribed organization chart. |
| Reviewing employee checks source support; the authorizing manager records a separate decision. | [Frozen summary](../../eval/public-refund/results/summary.json), [verification](../../eval/public-refund/results/verification.json) and [audited interpretation](../../eval/public-refund/results/interpretation.md): 16/16 signatures, 15/16 complete successful-output packages, 14/16 frozen and audited rubric passes. Source inconsistencies and the unusable response remain disclosed. | Rubric agreement is not independent truth. No employee used the packets, and the experiment records no human authorization or payment. Proposed approval/payment records do not retroactively become part of a receipt. |
| Application operator and security/key custodian configure signing, trust and failure handling. | [Agent wrapper](../../packages/lattice/src/agent/runtime.ts): a signer is optional; failed signing returns `receiptError` unless throw behavior is configured. C3's mechanism map and C4's threat table distinguish trusted-key verification from authority, freshness and issuer honesty. | Key custody, rotation operations, organizational identity checks and the business response to missing receipts were not evaluated. Even throw behavior cannot undo an external effect that already happened. No runtime change is proposed here. |
| Data owner sets retention, retrieval, access and deletion arrangements. | [C2 evidence table](../public-refund-case.tex): complete checks require local source pages and request bodies; published fingerprints alone are insufficient. C3 DR2/DR4 and [C4 evidence map](C4-EVIDENCE-MAP.md) document unsalted-hash and narrow marker-test limits. | No demonstrated lawful retention, access control, storage durability or post-deletion retrieval. The organization must decide what content remains available and what claims remain checkable after deletion; a digest cannot recover missing bytes. |
| Independent reviewer checks expected commitments and separately examines authorization/payment records. | C2 verified packages in another process, with explicit expectations and retained bytes. C4 reports scoped mutation controls and the separate wrong-but-signed synthetic control. | A separate verifier process does not establish organizational independence, issuer honesty, payment execution or useful human review. Independent-review performance remains future work. |
| Assess adoption against existing secured logging and full operating cost. | [Matched comparator](../../eval/realworld/results/accountability.json) records signed-arm decision parity. C4 separates historical component timings from hosted HTTP/harness residual and reports unmeasured integration and reviewer effort. | Cross-component use is a design opportunity, not demonstrated organizational improvement. Storage, key administration, integration and review work need their own assessment; no acceptance budget or superiority claim is inferred. |

The revised section reuses the existing AI-audit citation (`mokander2023`) and refers to the preserved C3 applicability discussion rather than adding a new legal interpretation, implementation date, duty or source. No new external factual/governance claim or bibliography entry is introduced. The existing source review is not represented as a fresh C5 retrieval or author endorsement.

## Pilot proposal and measurement definitions

The [reference draft](C5-REFERENCE-DRAFT.md) proposes three stages: inspection of retained historical records; shadow packets alongside existing approval controls; and a limited operational pilot only after organizational approval. These stages are not executed and do not amend or approve the existing [practitioner protocol](../practitioner-proposal.tex). Retained-evidence verification is not model re-execution.

Proposed measures retain separate denominators and meanings:

- **Evidence completeness:** eligible cases with all predefined required records divided by all eligible cases. Define required records and eligible cases before collection; retain missing/failed cases in the accounting.
- **Verification outcomes:** report signature failures, absent content, expectation mismatches and signing failures separately; a valid signature is not a complete package or correct decision.
- **Exception escalation:** among predefined exceptions, record whether they reached an authorized reviewer and how they were resolved. An escalation count alone is not evidence of appropriate resolution.
- **Investigation accuracy:** assess predefined questions against independently reviewed records, retaining unknown or conflicting facts. Do not reuse model agreement as human ground truth.
- **Review time:** record time per comparable investigation with its task complexity, completeness and outcome; compare with the organization's existing logging workflow rather than an intentionally weak baseline.
- **Integration effort:** separately record setup, changes, key administration and ongoing record-management work. Historical signing timings are not substitutes for these costs.

Acceptance criteria must be set prospectively by the organization. No numerical thresholds, recruitment, participant responses, review-time savings or approval/payment outcomes are created in this task. Institutional determination, consent and author approval remain prerequisites where applicable to the proposed participant study.

## Editorial boundaries and assistance

- The former “Implications for practice” subsection is promoted and reorganized into a dedicated Managerial Implications section before the Conclusion. Existing integrity, disclosure, retention and cost cautions are edited around organizational decisions; the developer-oriented ending is replaced with corresponding responsibilities. The introduction's roadmap and AI declaration are aligned with that change.
- The [responsibility table](../managerial-responsibilities.tex) is explicitly labelled **“Proposed organizational responsibilities; not evaluated in deployment.”** Its five role groups and their duties are AI-assisted design proposals. It links DR1–DR5 to existing evidence without treating a named role as an observed participant.
- The 692-word reference narrative is explicitly AI-generated and excluded from manuscript inputs. It contains the new explanatory pilot discussion for author rewriting. Editorial work and labels do not establish acceptable human authorship.
- OpenAI Codex reorganized/edited existing practical implications, prepared the proposed table, drafted the separate reference and pilot proposal, and documented evidence/provenance. Original practical-implications authorship and this session's model/version remain **unconfirmed**; the author-reported model list is not used to infer a tool mapping.
- C2/C3/C4 sections, prior generated fragments, runtime code and saved results remain protected. A1/P5 author/source/content verification and tool terms remain open. Ai4Privacy A6 is unchanged; this task grants no dataset permission. C6 is not started.

**C5 editorial revision and responsibility table complete; author narrative and review pending.**
