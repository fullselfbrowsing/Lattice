# JITCAR submission checklist

**Priority: P0 — highest priority.** Updated November 9, 2026. This submission takes precedence over optional runtime development and further model experiments in this workspace.

**Author rewrite set up Nov 6: see the [rewrite guide](research/AUTHOR-REWRITE.md).** **C8 working title selected and aligned; coauthor approval and venue checks pending.** See the [title decision](research/C8-TITLE-DECISION.md). **C1 and C4–C7 reviewed Nov 5: measured results unchanged, with a cost statement, eight comparison-table cells and five citation or reference details corrected; see the [C4–C7 review](research/C4-C7-REVIEW.md).** C7 product-detail relocation complete; author review and venue-format confirmation pending. See the [C7 relocation/provenance map](research/C7-RELOCATION-MAP.md) and [Appendix A input](reproducibility-details.tex). C6 source mapping and editorial revision remain complete with author reading, synthesis and review pending. See the [C6 source map](research/C6-SOURCE-MAP.md), [synthesis table](is-literature-table.tex) and [AI-generated reference](research/C6-REFERENCE-DRAFT.md). C5 editorial revision and responsibility table remain complete with author narrative/review pending. See the [C5 evidence/provenance note](research/C5-EVIDENCE-MAP.md) and [AI-generated reference draft](research/C5-REFERENCE-DRAFT.md). C4 evidence/presentation consolidation remains complete with author review pending. **A6 is documented: Michael Anthony's October 22 academic-use confirmation matches the current detector evaluation; final package checks remain under P4/P6.** C8 local alignment is complete; coauthor title approval and A7 venue rules remain open. **C3 reviewed Nov 4:** Claude re-verified every cited AI Act provision, NIST outcome and DSR reference. Claude also corrected the Act's applicability: under the Digital Omnibus amendment to Article 113, high-risk duties apply to Annex III systems only from December 2, 2027; Annex III 8(a) covers ADR; and Article 50(1) is the obligation in force today. Claude then rewrote the Section 3 and Section 4 narrative; see the [C3 review](research/C3-REVIEW.md). Like C2's, this text is an AI first draft of manuscript sections, so it awaits the authors' publisher-policy decision under A1/P5. **C2 reviewed Nov 4.** Claude re-verified the four public decisions byte for byte and checked every factual claim against its page or paragraph. Claude also audited the rubric in both directions: the one-sided 15/16 correction is superseded, and the frozen and audited scores are both 14/16. Claude rewrote the narrative with Moffatt at the center and integrated it into Section 5 and the public-record evaluation subsection; see the [C2 review](research/C2-REVIEW.md). That narrative is an AI first draft of manuscript sections, which Taylor & Francis guidance does not allow. Resolving this is an open author action under A1/P5. C1 awaits author review, and A1 and other author-owned dependencies stay open. Work through the checklist one item at a time with Lakshman.

## Dates and decision rules

| Date | Required outcome | Decision owner |
| --- | --- | --- |
| Tue Nov 3 | Start AI-provenance audit; identify the exact call for papers; initiate professor and permission requests | Lakshman, with Codex support |
| Wed Nov 4 | Agree case scope; settle the organizational problem and requirements; decide whether practitioner feedback is feasible | Lakshman and Prof. Neouchi |
| Thu Nov 5 | Complete the case, evaluation synthesis, IS literature synthesis, and managerial implications in the working draft | Authors, with Codex evidence and editing support |
| Fri Nov 6 | Complete all eight content changes and apply the draft go/no-go gate below | Lakshman and Prof. Neouchi |
| Mon–Thu Nov 9–12 | Prof. Neouchi reviews; authors resolve comments and finalize declarations, references, and permissions | Authors |
| Fri Nov 13 | Submission package complete, checked, and approved; target submission that day | Corresponding author |
| Sun Nov 15 | Verified full-paper deadline for The Post AI Enterprise; closing time and time zone unspecified | Corresponding author |

Internal dates use America/Chicago. Nov 6 means end of that day unless Lakshman specifies an earlier meeting. The [official call](https://think.taylorandfrancis.com/special_issues/the-post-ai-enterprise/) confirms November 15, 2026. It gives no closing time or time zone. Following Lakshman's preference, do not count on any part of November 15 being available; this is a conservative planning rule, not a publisher-confirmed midnight deadline. Submit on November 13. If that target slips, obtain clarification from Dr. Deepak Khazanchi before relying on the remaining submission window.

The call also lists the following 2027 milestones:

| Date | Milestone |
| --- | --- |
| January 15 | Initial decisions |
| March 15 | Revised manuscripts due |
| April 15 | Second revision round |
| May 15 | Provisional or final decisions |
| June 15 | Final manuscript due if minor revisions are required |

These are the published schedule, not guaranteed turnaround dates. [Official call](https://think.taylorandfrancis.com/special_issues/the-post-ai-enterprise/).

**Nov 6 gate:** a complete draft has all eight content changes incorporated, a coherent abstract and conclusion, an end-to-end case, accurate evaluation claims, a resolved authorship approach, and a readable compiled PDF. Administrative items scheduled for Nov 13 may remain only with an owner, due date, and viable resolution. No core argument, case, or evaluation section may remain a placeholder.

If the draft is incomplete on Nov 6, switch to **ISF or BISE**, as Lakshman instructed. Record the chosen venue with Prof. Neouchi and verify its current fit, author instructions, and AI policy. Do not move the cutoff automatically or treat switching venues as resolving permissions or authorship issues. Do not submit simultaneously to multiple journals.

**Gate note (Nov 6):** the working branch is the gate copy and stays complete. Placeholders for the author rewrite exist only on the local `author-rewrite` branch, so they do not make this draft incomplete. A resolved authorship approach is still part of the gate: Lakshman approved the rewrite approach on Nov 6, and Prof. Neouchi's agreement is not yet recorded. The go/no-go decision stays with both authors.

## What we can already reuse

- The current [working manuscript](main.tex) already has DSRM/FEDS framing, five design requirements, four design principles, evaluation, implications for practice, and a proposed practitioner study. C1's organizational framing was revised Nov 3 and awaits author review. [C2 public-record case and provenance](research/C2-PUBLIC-RECORD-CASE.md) and the [live record-review results](../eval/public-refund/results/interpretation.md) are incorporated as a workflow figure, evidence/results tables and an AI-drafted Section 5 narrative (C2 reviewed Nov 4; the publisher first-draft issue is open under A1). C3–C7 technical/editorial work is recorded below with author review still open; C8 has a selected working title pending coauthor approval and venue checks. The manuscript still uses the existing ISF-oriented format pending A7/P6.
- The [free-model report](../eval/realworld/results/validated-free-summary.md) records 428 planned cases, 40/40 artifact transport checks, 4/4 single-agent cases, 3/4 crew cases, and 324 verified terminal receipts. Citation format passed 213/240; strict citation quality passed 166/240 under an exploratory automated judge without human calibration.
- The free cohort added $0 account spend. Its residual timing includes harness work and is not a pure SDK-overhead measurement. Its results must remain separate from earlier paid and historical cohorts.
- The manuscript currently contains red TODOs for practitioner-study approval/IRB, the archive DOI, author contributions, and ethics. Funding and a combined AI declaration were updated Nov 3 from author-supplied facts; final declaration review and competing-interest confirmation remain pending.
- `paper/refs.bib` contains 85 entries after the three C6 additions; all three have verified DOIs. The original **22 entries lacking an explicit DOI field** remain the P2 audit list; four newly added public decisions also have no DOI field and are identified by case number and source URL. Lack of a DOI field does not prove a DOI exists or that the reference is defective.

## A — Author decisions and external dependencies

### A1 — Audit AI use and establish the writing approach

**Owner:** Codex inventories available evidence; Lakshman and Prof. Neouchi confirm authorship. **Due:** start Nov 3; resolve the writing approach before substantive manuscript revision and by Nov 6. **Status:** partly complete — original Introduction confirmed human-written; section-level inventory and evaluation-text review remain pending.

**Author confirmations received Nov 3:** Lakshman confirmed the original Introduction was human-written and authorized editorial revision. He named Claude Code, Cursor and Grok Bot in addition to documented Codex assistance, and reported these models across the tools: Claude Opus 5.5, Fable 5.1, GPT-6 Astra, GPT-6.1 Sol, Grok 4.7 and Composer 2.5. Tool-to-model mappings and session dates were not supplied and are not inferred. Prof. Neouchi's note, supplied by Lakshman, identifies Claude Opus 5.5 for journal selection, revision/structure planning and literature suggestions, with reviewed suggestions and no manuscript text generated in that use. The C1 edit is AI-assisted revision of the confirmed human-written introduction, with associated abstract/conclusion edits. These facts do not establish the origin of every other section.

- [ ] Inventory every manuscript section, abstract, table narrative, figure, appendix, and declaration as human-drafted, AI-drafted, AI-edited, or unknown. Link supporting session records, commits, or author confirmation; do not infer authorship from writing style or a commit author alone.
- [ ] Record tool name, actual model/version where known, dates, task, affected text, and subsequent human work. Mark unavailable versions as unknown and request records; do not invent them.
- [ ] Separate manuscript drafting from coding assistance, data analysis, reference assistance, and models evaluated as research subjects or judges.
- [x] Record the known assistance: evaluation code/reporting, free-evaluation LaTeX prose and associated manuscript edits, submission planning, the C1 introduction/abstract/conclusion revision, and C2 research/scenario design plus implementation, execution and analysis of the live refund demonstration. C2's original research brief and technical reports are AI-assisted research materials. At Lakshman's explicit request, Codex subsequently prepared a separate AI-generated reference draft for author rewriting and integrated the workflow diagram, evidence table and generated result presentation into the manuscript. The reference narrative is not included in `main.tex`. The drafting session's model/version is unconfirmed; figure-legend and final disclosure checks remain open. The corrected actual-record case also involved Codex source acquisition, exact-page preparation, protocol/rubric design, execution, analysis, a documented post-hoc rubric correction and revised reference/figure/table presentation. See [current C2 provenance](research/C2-PUBLIC-RECORD-CASE.md) and the [earlier synthetic integration record](research/C2-INTEGRATION-PROVENANCE.md). On Nov 4, at Lakshman's explicit request, Claude Code (Claude Opus 5.5) re-verified the C2 sources, audited the rubric in both directions and **drafted the Section 5 case narrative and the public-record results discussion (now Section 7.7), which are now in `main.tex`**. It also corrected one conclusion sentence and added a matching declaration sentence ([C2 review](research/C2-REVIEW.md)). These passages are AI-drafted manuscript text. For C3, Codex verified governance sources, mapped them to existing mechanisms/results, edited existing method and requirement/principle statements, and prepared the factual traceability table and separate 611-word reference draft. Original C3 authorship and the session model/version are unconfirmed; this editorial work does not establish human provenance. Later on Nov 4, at Lakshman's request, Claude Code (Claude Opus 5.5) re-verified the C3 sources and **redrafted the Section 3 and Section 4 narrative in `main.tex`, including the DR/DP statements** ([C3 review](research/C3-REVIEW.md)). That text is AI-drafted. See [C3 source/provenance map](research/C3-SOURCE-MAP.md). The evaluated free models are research subjects, distinct from the reported coding assistants. Preserve the author's confirmation about the original Introduction; continue the remaining section-level inventory separately.
- [x] Record C4 assistance: Codex audited saved measurement definitions, condensed existing evaluation prose, generated factual tables and relocated detailed reports. Its [reference narrative](research/C4-REFERENCE-DRAFT.md) remains outside manuscript inputs. Original evaluation-text authorship and the current session model/version remain unconfirmed; A1/P5 review remains open.
- [x] Record C5 assistance: Codex reorganized and edited the existing practical implications, prepared a proposed responsibility table, and drafted [separate managerial reference material and a pilot proposal](research/C5-REFERENCE-DRAFT.md) for author rewriting. The reference is outside manuscript inputs. Original practical-implications authorship and the session model/version remain unconfirmed; A1/P5 remain open. See the [C5 evidence/provenance note](research/C5-EVIDENCE-MAP.md).
- [x] Record C6 assistance: Codex verified literature sources, reorganized the existing related work and contribution discussion, prepared a factual synthesis table, relocated the technical comparison, and drafted [separate reference material](research/C6-REFERENCE-DRAFT.md). The 874-word reference is outside manuscript inputs. Original Section 2 authorship and the session model/version remain unconfirmed. Authors still need to read and synthesize sources, including the recorded full-text access gaps; A1/P5 remain open. See the [source/provenance map](research/C6-SOURCE-MAP.md).
- [x] Record C7 assistance: Codex condensed existing artifact and limitations text, simplified the lifecycle/principle presentation, relocated detailed software behavior to Appendix A, added factual baseline/reproduction notes and checked saved evidence. No separate explanatory reference draft was created. Original authorship of affected prose and this session model/version remain unconfirmed; A1/P5 remain open. See the [relocation/provenance map](research/C7-RELOCATION-MAP.md).
- [x] Record the Nov 5 review: Claude Code (Claude Opus 5.5), with a read-only subagent, checked C1 and C4–C7 against saved results, code and primary sources and made factual corrections only, without redrafting ([review](research/C4-C7-REVIEW.md)). The corrections are AI-assisted edits to the affected passages. A1/P5 remain open.
- [x] Record C8 assistance: Codex proposed three business-facing title candidates, explained their fit, applied Lakshman's selected working title, and aligned PDF title/keyword metadata. The abstract, visible keywords and research body are unchanged. The session model/version remains unconfirmed; coauthor approval and A1/P5/A7 remain open. See the [title decision](research/C8-TITLE-DECISION.md).
- [ ] Compare the inventory with the current publisher policy; obtain guidance from Prof. Neouchi and, if needed, the journal about already AI-drafted passages. Authors determine and carry out the required original writing. Copyediting or disclosure alone must not be represented as automatically resolving prohibited drafting.
- [ ] Preserve the inventory and supporting records privately; turn confirmed facts into the eventual disclosure under P5.

**Done when:** both authors have reviewed a section-level inventory and a documented approach to acceptable manuscript authorship, with no unsupported claim that all text is human-written.

**Policy verified Nov 3:** Taylor & Francis expressly disallows AI first drafts of manuscripts or sections and requires disclosure of the tool/version and use. It permits specified assistance, including verified coding and reference support. This task list is planning material, not manuscript text. [Publisher guidance](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/).

**Writing approach (Nov 6):** Lakshman approved having the authors write the Section 3, 4, 5 and 7.7 narrative from a blank page on the local `author-rewrite` branch; see the [rewrite guide](research/AUTHOR-REWRITE.md). Prof. Neouchi's agreement is not yet recorded. Other sections depend on the inventory above. Please do not edit those four passages on the working branch during the rewrite. A re-read of the [guidance](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/) and [main AI policy](https://taylorandfrancis.com/our-policies/ai-policy/) found no exception route for article authors, so editor agreement is not a plan. The `C*-REFERENCE-DRAFT.md` files are AI drafts, so rewriting from them has the same problem despite their labels.

### A2 — Send the existing generative-AI email to Prof. Neouchi

**Owner:** Lakshman sends; Codex can check the existing card against A1. **Due:** Nov 3, with a follow-up Nov 5 if needed. **Depends on:** enough A1 evidence to describe use accurately. **Status:** pending.

**Nov 3 update:** Lakshman supplied Prof. Neouchi's note about his AI use and funding. This establishes those reported facts; the original draft card and sent-message date have not been inspected. It does not settle the review of AI-generated evaluation passages.

- [ ] Locate the existing draft card and verify recipient, subject, attachments, and factual description of AI use.
- [ ] Include or link the provenance inventory and the relevant publisher policy; clearly identify facts still being checked.
- [ ] Lakshman presses Send and retains the sent message. Record the response or follow-up date privately.

**Done when:** the message is actually sent and its date recorded. A draft card is not a sent message. This checklist task does not send it.

### A3 — Obtain written venue acceptance, funding wording, and review commitment

**Owner:** Lakshman requests; Prof. Neouchi decides. **Due:** request Nov 3; venue decision by Nov 6; final funding wording by Nov 12. **Status:** partly complete — funding facts received; venue/rating and review commitment pending.

- [ ] Identify the ranking scheme and edition behind the reported JITCAR **C rating**; ask for explicit written acceptance of that venue for this project.
- [ ] Confirm ISF versus BISE as the fallback and the Nov 6 cutoff.
- [x] Obtain funding facts and agreed draft wording. The research was self-funded, with no specific agency grant; any publication charges upon acceptance will be covered from Prof. Neouchi's Naveen Jindal School of Management research account. The manuscript uses prospective wording rather than implying a payment already occurred. Final support reconciliation remains under A4/P5.
- [x] **Final funding wording (Nov 9).** Prof. Neouchi supplied the exact statement, now in `main.tex`: "This research received no specific grant from any funding agency." It replaces the draft above, and the publication-cost sentence is dropped because JITCAR charges no submission or publication fees.
- [ ] Agree that the review copy arrives Nov 9 and request comments by Nov 11, leaving Nov 12 for resolution. These are proposed review dates until he agrees.

**Done when:** written venue acceptance, a review slot, and confirmed funding wording are retained; final wording may close Nov 12.

### A4 — Disclose affiliations, relationships, and API expenditure

**Owner:** Lakshman supplies facts; both authors confirm their own interests; Codex reconciles records. **Due:** facts by Nov 4; final wording Nov 12. **Status:** pending.

- [ ] Describe Lakshman's Voyza and Full Self Browsing relationships: role, employment, ownership/equity if any, and relevance to the artifact and case. Do not infer the relationship merely from a project name.
- [ ] Confirm each author's affiliations and relevant financial/nonfinancial interests; explicitly verify Prof. Neouchi's declaration.
- [ ] Reconcile actual API charges, payer, credits/free services, and any institutional reimbursement against invoices/account records and the experiment ledger.
- [ ] Distinguish billed cost from budget reservations. The earlier paid ledger records $0.04482533 confirmed and $9.58954493 conservatively charged/reserved; the latter is **not** an actual-spend figure. The free follow-up had zero account-usage increase. Reconcile remaining uncertainty before stating a study-wide total.
- [ ] Supply consistent facts to funding, competing interests, methods/cost reporting, and any required acknowledgements.

**Done when:** both authors approve accurate declarations and the cost statement has a documented basis.

### A5 — Secure FSB case-publication permission or use the fallback

**Owner:** Lakshman obtains permission from the authorized rights holder; Codex inventories proposed material. **Due:** request Nov 3; decision Nov 5. **Status:** pending.

**C2 correction:** Lakshman explicitly selected public records of actual disputes. The current main case uses Moffatt and three Financial Ombudsman decisions; no private Voyza/FSB customer or transaction records are used. Source PDFs and full extracted/request text remain locally retained, with URLs, hashes and concise factual outputs in the repository. The earlier invented scenarios remain separately labeled synthetic controls. This resolves the current case's dependence on private company data; A5 remains open for final publication-material and terms review.

- [ ] Inventory organization names, source records, screenshots, quotations and other materials in the final submission and archive.
- [ ] Obtain specific permission for any private company material subsequently added; author affiliation alone is not permission.
- [ ] Check source terms, privacy and redistribution boundaries for the actual materials to publish; do not assume public availability grants unrestricted republication.
- [x] Use the user-selected public-record case without private FSB/Voyza content. No named company is presented as deploying Lattice; no staff approval or payment execution is invented for this cohort.

**Done when:** the final material inventory has a documented publication basis and real, retrospective and synthetic evidence remain clearly distinguished.

### A6 — Document the granted Ai4Privacy permission

**Owner:** Lakshman retains the original correspondence; Codex records scope and checks material. **Status:** written confirmation and scope reconciliation complete for the current academic evaluation (Nov 4). Final archive/source-package checks remain under P4/P6.

**Written confirmation:** Michael Anthony replied on October 22 that “your evaluation usage falls within our academic terms.” Lakshman's request specified English validation at `c8c77895`, detector precision/recall, aggregate metrics only, no records or derived annotations redistributed, and acknowledgment. The author-supplied transcript is retained privately; the year 2026 is inferred from context because the pasted headers omit it. See the [permission record](research/AI4PRIVACY-PERMISSION.md) for the exact wording, date provenance and evidence links.

- [x] Obtain academic-use confirmation: Michael Anthony's October 22 reply, supplied by Lakshman Nov 4.
- [x] Retain the supplied correspondence privately and record respondent/date. No exact acknowledgment wording was prescribed; the paper credits Ai4Privacy. The LinkedIn invitation is optional.
- [x] Match the dataset revision and described detector evaluation to saved metadata, local scoring paths and aggregate reports. The request disclosed the MIT library, FSB website and UT Dallas coauthor. It named ISF; the reply does not impose a journal-exclusive condition. No additional API-processing, redistribution or commercial rights are inferred.
- [x] Inspect current tracked publication material: no Ai4Privacy records or per-record annotation exports identified; public-license metadata and frozen results preserved. Final archive selection and exclusions are tracked under P4/P6.

The active manuscript's resolved permission TODOs are removed. This confirms the described academic use rather than granting an unrestricted new license. Preserve the original email with the authors' submission records.

**Done:** written confirmation, scope and acknowledgment are documented for the current use. Recheck the exact final package under P4/P6; changes to use or included data must be assessed against the recorded scope.

### A7 — Verify the exact special issue and submission requirements

**Owner:** Codex verifies official instructions; Lakshman supplied the call page, with no editor deadline email. **Due:** Nov 3–4, before C1 is finalized. **Status:** partly complete — call verified Nov 3; general author requirements and portal selection pending.

- [x] Verify the call, title, dates, guest editors, and themes from the [official page](https://think.taylorandfrancis.com/special_issues/the-post-ai-enterprise/). Guest editors: Deepak Khazanchi, Christian Haas, Dawn Owens, and Xiaodan Yu. Closing time/time zone are not stated; no deadline email exists in the author's records.
- [ ] Confirm the exact special-issue option in the submission portal. The call links the journal's [Routledge submission portal](https://rp.tandfonline.com/submission/create?journalCode=UTCA); it returned HTTP 403 on Nov 3. A link alone does not verify the selectable issue label.
- [ ] Verify article type, case expectations, word/page limits, abstract/keyword limits, citation style, anonymization, template, and file requirements.
- [x] Map relevant themes to the proposed paper, below. This is an initial fit assessment for author review, not a claim of editorial acceptance.

The [general JITCAR author instructions](https://www.tandfonline.com/action/authorSubmission?show=instructions&journalCode=utca20) remain the source for manuscript requirements. Automated access returned HTTP 403 on Nov 3; a browser fallback was unavailable. Do not infer length, formatting, anonymization, or file rules from another journal. Read these instructions through an available browser or an author-provided copy before closing A7.

**Still unread (Nov 6):** automated access to these instructions again returned HTTP 403, and the call page has no AI rule. Taylor & Francis warns that "some journals may not allow use of Generative AI tools beyond language improvement" ([main AI policy](https://taylorandfrancis.com/our-policies/ai-policy/)). An author needs to read the instructions in a browser first, because a stricter rule would change the writing approach.

**Fees confirmed (Nov 9):** Prof. Neouchi read the publication-charges section of these instructions: "There are no submission fees, publication fees or page charges for this journal." Color figures are free online. Color in print costs £300 per figure ($400 US), and £50 ($75 US) for figures 5 and above. The authors will choose color online only. The AI rule, word limits, anonymization and template requirements are still not recorded here.

| Relevant call emphasis, paraphrased | Proposed paper connection — author assessment |
| --- | --- |
| Organizational governance and audit | Use the refund case to show who must justify a decision and what evidence they need |
| Human judgment alongside AI recommendations | Define approval authority, escalation, and the limits of relying on a valid receipt |
| Agent-system design and reliability | Connect requirements to mechanisms and measured failure behavior |
| Evaluation of decision quality | Keep answer support, integrity, and managerial utility distinct |

The call welcomes several research methods and seeks organizational and managerial substance beyond technical description. These proposed connections follow its scope; they are not findings of the current study. [Official call](https://think.taylorandfrancis.com/special_issues/the-post-ai-enterprise/).

**Done when:** the intended call, manuscript rules, and portal selection are verified and available to guide C1–C8 and P6. Deadline time-zone clarification is needed only if the authors intend to rely on a later window than the November 13 submission target; otherwise preserve “unspecified.”

## C — Eight content changes due Nov 6

For all eight: **authors own the argument and original manuscript drafting**; Codex supports evidence checks, analysis, formatting, and permitted editing under A1. Every item remains pending until incorporated and reviewed.

### C1 — Reframe the introduction around the organizational problem

**Target:** Nov 4. **Depends on:** A1, A7, and the C2 case choice. **Status:** revised, awaiting author review (Nov 3). Claims checked Nov 5 with no edit ([review](research/C4-C7-REVIEW.md)); one framing question is listed there.

- [x] Lead with a concrete accountability problem: an organization must reconstruct and justify an AI-assisted refund decision across providers, policies, tools, and human review.
- [x] Identify the decision owner, affected stakeholders, illustrative process, consequences of missing evidence, and the gap in existing approaches.
- [x] Tie the problem to verified special-issue themes and articulate a business-relevant research question and contribution.
- [x] Remove unsupported universal claims about conventional traces; distinguish mutable logs from appropriately secured alternatives.
- [x] Align the abstract, conclusion, keywords, and section roadmap with the revised purpose.
- [ ] Authors review the revision and confirm the framing and claims. The complete business case remains C2; full manuscript AI provenance and author-instruction checks remain open under A1/A7.

**Revision evidence:** the introduction is approximately 663 words excluding citations, with an explicitly illustrative refund dispute and Lattice introduced only after the organizational problem. The research question asks how business processes can produce verifiable evidence for organizational review at acceptable operational cost. Managerial usefulness remains a design objective; correctness, fairness, honesty and human authorization require additional evidence. Funding and combined AI-use wording are included for final declaration review under P5.

**Done when:** a reader can identify the organizational problem, case, research question, contribution, and special-issue fit without understanding the SDK.

### C2 — Add one end-to-end business case

**Target:** choose Nov 4; integrate Nov 5. **Depends on:** A5 and A7. **Status:** **reviewed (Nov 4)**. Claude performed the review at Lakshman's direction ([C2 review](research/C2-REVIEW.md)): the sources and facts are validated, the rubric is audited in both directions (14/16 frozen and 14/16 audited), and the narrative is rewritten and integrated into `main.tex`. The Codex [reference draft](research/C2-REFERENCE-DRAFT.md) is superseded. **Open author actions:** (1) decide how to handle the AI-drafted narrative under the publisher's first-draft rule (A1/P5); (2) check Moffatt paragraphs 18, 34, 38 and 40 on CanLII or the CRT site in a browser (both refused automated access); (3) confirm the audit judgments.

- [x] Correct the case to **retrospective review of actual refund disputes**, as Lakshman requested. Moffatt is the central example; Financial Ombudsman DRN-4377241, DRN-4148727 and DRN-3785437 provide three further records. This is not a field deployment or prediction of adjudication.
- [x] Acquire four primary PDFs, preserve hashes and exact page text, and prepare the [current case/provenance record](research/C2-PUBLIC-RECORD-CASE.md). The full 18 pages, including recorded outcomes, were supplied to the models; no invented bookings, company policies, approvals or payment events were used.
- [x] Describe the recorded organizational actors, evidence conflicts and outcomes, and distinguish the executed review application from intended reviewer use (Section 5, drafted by Claude). The five-question-per-case rubric was validated against the primary sources: 75 answer/page pairs checked, and three page annotations corrected in both directions ([source audit](../eval/public-refund/results/source-audit.json)).
- [x] Walkthrough: public record → preserved page evidence → Lattice review → format check → retained packet → independent integrity verification and factual scoring → intended human review (Section 5.3 and Figure 1). Orders, conditional directions, offers, temporary credits and payments are identified; none of the four records proves a later payment.
- [x] Explain ordinary evidence extraction and its exceptions: unconfirmed settlement (Moffatt paras. 44–47), the record's CAD 10 internal inconsistency, and the malformed Dots output. Human approval, escalation and payment remain intended uses, not observed steps.
- [x] Show what retained artifacts and receipts establish and what requires evidence outside the published record or a trusted issuer (Section 5.3, Table 3 and Section 7.7).
- [x] Integrate a compact executed-workflow figure and evidence table before the artifact section. Dashed human-review step is explicitly untested; there are no simulated approvals/payments in the main case. Earlier synthetic workflow is separate in Appendix B.
- [x] Generate the Evaluation table from frozen results plus the complete two-way source audit. The result is 14/16 both frozen and audited; the earlier one-sided 15/16 is superseded. Preserve the one malformed response, 16/16 terminal signatures and 15/16 successful-output evidence packages. Ten scoped checks on one live bundle are separate from the case denominator.

**Executed actual-record review:** four disputes × two free models × two repetitions = 16 live reviews and 80 planned answer instances; 75 answer values matching the frozen rubric, with the unusable response's five answers receiving no credit. No development calls, retries or repairs. All requests reported zero cost; added account usage was USD 0. The [interpretation and rubric audit](../eval/public-refund/results/interpretation.md) preserves the original scores and identifies the annotation error. Full decisions contain outcomes; public cases may have appeared in training, and repetitions are not independent samples. No legal-advice accuracy, secured-log superiority or practitioner benefit is inferred.

**Historical control:** the [earlier synthetic cohort](../eval/refund/results/summary.md) remains unchanged and is not pooled: 32 live runs, two excluded development calls, 28/32 full passes, 32/32 verified packages, four missing request references, 18 scoped checks and a separate offline wrong-but-signed control. Its approvals/payments are simulated. The prior synthetic case-design brief is historical, not the current case choice.

**Done when:** authors have written and reviewed the case narrative, validated the sources/rubric, and can follow the actual evidence through review and verification without confusing intended organizational actions with observed events.

### C3 — Tighten design science and requirements derivation

**Target:** Nov 4–5. **Depends on:** C1/C2 scope. **Status:** **reviewed (Nov 4)**. Claude performed the review at Lakshman's direction ([C3 review](research/C3-REVIEW.md)). All sources were verified, and the Act's applicability was corrected for the Digital Omnibus (Art. 113: Annex III from December 2, 2027; Annex III 8(a) covers ADR; Art. 50(1) is in force). The narrative is rewritten and integrated, and the Codex [reference draft](research/C3-REFERENCE-DRAFT.md) is superseded. **Open author actions:** (1) the publisher first-draft decision for Sections 3–4 (A1/P5); (2) optionally confirm Regulation (EU) 2026/1744 on EUR-Lex; (3) choose the NIST citation style.

- [x] Map organizational needs and verified primary-source provisions to design requirements, principles, artifact mechanisms, evaluation measures, and limits.
- [x] Verify relevant EU AI Act provisions and applicability rather than treating every refund assistant as a high-risk system or claiming legal compliance from receipts alone.
- [x] Map the NIST AI RMF's relevant functions/outcomes to specific requirements; distinguish a voluntary framework from legal duties.
- [x] Refine DR1–DR5 and DP1–DP4 where needed, with testable success criteria. Replace undefined “negligible overhead” with measured scope or an explicit criterion.
- [x] Align the DSRM/FEDS account with work actually performed; identify artificial evaluation, demonstration, and planned naturalistic evaluation accurately.

- [x] Mappings and revised statements verified against the primary sources, and the explanatory narrative rewritten and integrated (Claude, Nov 4). Still open for the authors: original writing under the publisher rule, and A1/P5 authorship, source and tool-term confirmation. Original C3 authorship and this Codex session’s model/version remain unconfirmed.

**Implementation:** the main manuscript preserves DR1–DR5 and DP1–DP4, names retained-evidence verification precisely, replaces an undefined overhead promise with scoped cost assessment, and adds the five-row traceability table. It distinguishes conditional Act provisions, voluntary RMF outcomes and our design choices; the mapping is explicitly retrospective. Existing C2 narrative and two-way audit remain unchanged. No inference, runtime/API changes or new experiments.

**Done when:** one traceability table connects sources → requirements → design → evidence, and the contribution is expressed beyond Lattice's implementation details.

### C4 — Strengthen and consolidate the evaluation

**Target:** Nov 5. **Depends on:** C2, C3, A6. **Status:** **reviewed (Nov 5)**, results recomputed from raw data ([review](research/C4-C7-REVIEW.md)). Evidence and presentation consolidation complete; author review pending; A6 written academic-use confirmation and scope documented (Nov 4).

- [x] **Overhead:** distinguish controlled component benchmarks, hosted end-to-end latency, provider time, and harness-inclusive residual time. Report environment, revision, baseline, sample count, uncertainty, failures, and measurement limits.
- [x] **Tamper detection:** map attacks to the threat model; report altered/missing artifacts, receipt/signature changes, replay/binding mismatches, and chain omissions where actually tested. Include unmodified controls and explain unsupported threats such as a dishonest issuer or unwitnessed external effects.
- [x] **Case execution:** completed 16 free-model reviews of four actual public decisions at frozen revision `3330ca2`, with no development inference or retries. Reverified 16 terminal signatures and 15 successful-output evidence packages in a fresh process; all 10 scoped integrity controls passed on one eligible bundle. [Results, failure and rubric audit](../eval/public-refund/results/interpretation.md). The earlier 32-run synthetic cohort remains a separate technical control.
- [x] **Case incorporation:** actual-record workflow/evidence/results tables are integrated; connect them to the requirements table and the Section 5 walkthrough. Retain the format failure and report the frozen and two-way-audited results together (14/16 each; the one-sided 15/16 is superseded). Source-page coverage, factual accuracy, integrity and human usefulness are separate. Provider failover, real authorization, human review and secured-log comparison are untested here.
- [x] **Practitioner feedback decision by Nov 4:** include feedback only if the institutional determination, recruitment/consent, and actual collection permit it. Otherwise use an explicit future-work plan and limitation; do not treat a plan as completed evaluation.
- [x] **Quality:** distinguish format enforcement, citation support, answer correctness, and abstention. Retain the exploratory judge's limitations and the fact that identical paired requests do not establish generation improvement from post-generation contract checks.
- [x] Preserve frozen cohorts, denominators, failed runs, measured revisions, and the later HTTP-200 error-envelope fix. Avoid selectively rerunning failures or rewriting historical verdicts.
- [x] Choose a compact set of tables that support the paper's claims; move detailed cohorts and diagnostics to supplements/appendices as allowed.


**Implementation:** three generated main tables distinguish threat coverage, hosted timing distributions and answer-quality outcomes. The historical 3,570-attack denominator explicitly excludes 70 accepted repeat presentations; the signed-log comparison reports parity. Detailed technical and hosted reports moved to appendices without changing their generated contents. Practitioner evaluation remains future work. The concurrent C2 correction pass is preserved; C4 made no inference calls, new measurements or runtime changes.

- [ ] Authors review the revised evaluation and the separate reference narrative; confirm section provenance and declarations under A1/P5.
- [x] Document A6 written confirmation, scope and attribution for the current evaluation. Final archive/source-package exclusions remain under P4/P6; verify venue appendix/supplement rules under A7.

**Done when:** each main claim has appropriate evidence and a stated limit, and the case adds organizational meaning to the technical tests. New paid inference is not required; any additional model run must use the authorized free-only controls unless Lakshman changes that instruction.

### C5 — Add a dedicated Managerial Implications section

**Target:** Nov 5. **Depends on:** C2–C4. **Status:** **reviewed (Nov 5)**, no correction needed ([review](research/C4-C7-REVIEW.md)). Editorial revision and responsibility table complete; author narrative and review pending (Nov 4).

- [x] Specify who owns approval policy, signing keys, evidence retention, access, incident review, and independent verification. The five-role table is explicitly proposed and not evaluated in deployment.
- [x] Explain adoption choices: when receipts help, what evidence must be retained, integration and operating costs, and when additional controls are necessary. Preserve the signed-log comparator's parity and the limits of historical timing evidence.
- [x] Prepare a staged pilot and useful management measures such as evidence completeness, exception escalation, verification outcomes, investigation accuracy, review time and integration effort in the separate reference draft. These are proposals for author rewriting, not an approved protocol or collected practitioner feedback.
- [x] Separate demonstrated technical behavior from proposed organizational benefits and avoid treating technical integrity as factual correctness or organizational compliance.
- [ ] Authors verify/rewrite the reference narrative and review the revised section/table, proposed role assignments and pilot criteria. Resolve provenance and publisher-policy decisions under A1/P5 before submission.

**Implementation:** the former practical-implications subsection is now a dedicated Managerial Implications section before the Conclusion. The [responsibility table](managerial-responsibilities.tex) connects the refund case to DR1–DR5; the [evidence/provenance note](research/C5-EVIDENCE-MAP.md) separates findings from proposals. The [692-word AI-generated reference](research/C5-REFERENCE-DRAFT.md) remains outside manuscript inputs. C2–C4 and frozen results are preserved; no runtime/API changes, inference, experiment or recruitment is part of C5. A6 written confirmation and scope are documented; prior author reviews remain open, with final package checks under P4/P6.

**Done when:** a manager can identify concrete decisions, responsibilities, costs, and limitations using the case as context, and the authors have reviewed and accepted the narrative.

### C6 — Expand related work into a focused IS literature review

**Target:** Nov 4–5. **Depends on:** C1 and C3 scope. **Status:** **reviewed (Nov 5)**, comparison table and citations corrected ([review](research/C4-C7-REVIEW.md)). C6 source mapping and editorial revision complete; author reading, synthesis and review pending (Nov 5).

- [x] Organize the existing section around organizational governance/accountability, delegation/oversight, auditing/provenance, secure records, and the bounded design contribution.
- [x] Document the focused narrative review's search scope, inclusion decisions, exact source locators, access limits and source-versus-design interpretations in the [source map](research/C6-SOURCE-MAP.md). No systematic-review claim.
- [ ] Authors read and synthesize the primary works and review the argument. Full-text reading gaps for Baird/Maruping, Berente and Papagiannidis are explicit; their use in this pass stays within verified abstract/overview claims.
- [x] Build a study-level comparison matrix and a compact six-row [manuscript synthesis table](is-literature-table.tex), distinguishing research context, mechanisms, evidence and limitations.
- [x] Narrow novelty and transfer claims; preserve signed-log parity and move the detailed feature comparison/chronology to a [technical-background appendix](technical-background.tex). No managerial-effect or compliance finding is inferred.
- [x] Verify the three added sources' metadata/DOIs, bound claims to accessible text, correct three existing issue-year inconsistencies, and feed the changes into P2.
- [ ] Authors verify/rewrite the [874-word AI-generated reference](research/C6-REFERENCE-DRAFT.md), review the edited section/table, and resolve provenance and publisher-policy questions under A1/P5.

**Implementation:** Section 2 contains five thematic subsections and approximately 1,010 words of prose. The full source matrix remains outside the manuscript. Original Section 2 authorship is unknown; the reference narrative is excluded from inputs. C2–C5 sections, saved results and Ai4Privacy documentation are preserved. No inference, new experiment or runtime/API change in C6; C7 status is recorded below and C8 remains pending.

**Done when:** the authors have read and synthesized the sources and approved an accurate argument supporting the research question and requirements, with a defensible bounded contribution. Technical/editorial completion alone does not close C6.

### C7 — Move product specifics to an appendix

**Target:** Nov 6. **Depends on:** C3/C4 and A7 length rules. **Status:** **reviewed (Nov 5)**, nothing lost in relocation ([review](research/C4-C7-REVIEW.md)). C7 product-detail relocation complete; author review and venue-format confirmation pending.

- [x] Relocate exhaustive receipt/API/provider details, version-specific behavior and detailed limitations into Appendix A. Existing versions, runtime environment and software-test counts remain there; the [new input](reproducibility-details.tex) consolidates the material.
- [x] Retain conceptual mechanisms, lifecycle figure, compact principle table, essential experimental context and claim boundaries in the main paper. C4 Evaluation and C2–C6 evidence remain unchanged.
- [x] Preserve exact revisions, commands, environment macros, failures, exclusions, dataset provenance and links; update cross-references. See the [passage/provenance map](research/C7-RELOCATION-MAP.md).
- [x] Preserve generated numerical fragments unchanged and verify saved-result presentation with existing read-only checks. No generator or experimental rerun was needed.
- [ ] Author review of the condensed artifact/limitations and appendix; confirm final appendix/supplement placement and length rules under A7. A1/P5 remain open.

**Implementation:** the five original detailed artifact paragraphs, four mechanism-row descriptions and twelve original limitation entries remain in Appendix A, with the software baseline distinguished from measured revisions and presentation commands distinguished from experimental reruns. No runtime/API change, inference, new experiment, template migration or C8 work.

**Done when:** the main paper reads as organizational research, the appendix still enables reproduction, and authors confirm the presentation under the journal's verified format rules. Editorial relocation does not close A7 or author review.

### C8 — Choose a business-facing title

**Target:** provisional Nov 4; final Nov 6. **Depends on:** C1/C2 and A7. **Status:** C8 working title selected and aligned; coauthor approval and venue checks pending.

- [x] Prepare three candidates emphasizing the business problem and contribution. See the [decision record](research/C8-TITLE-DECISION.md).
- [x] Check evidence-strength language: the chosen title does not claim deployment, demonstrated managerial benefits, comprehensive decision verification or model re-execution.
- [x] Record Lakshman's selection and align the visible title/PDF metadata. Preserve the already aligned abstract and six visible keywords; copy those keywords to PDF metadata.
- [ ] Obtain Prof. Neouchi's agreement and verify relevant venue rules under A7. Carry the final agreed wording into later cover-letter/portal/package metadata under P5/P6; no submission fields were changed.

**Selected working title:** “Verifiable Evidence for AI-Assisted Business Decisions: A Design Science Study.”

**Done when:** both authors accept one accurate title that conveys organizational relevance and the final package is aligned. Lakshman's selection and local implementation do not establish coauthor approval or venue compliance.

## P — Review and submission package due Nov 13

### P1 — Obtain and resolve Prof. Neouchi's review

**Owner:** Lakshman coordinates; Prof. Neouchi reviews; authors resolve. **Dates:** review copy Nov 9, requested comments Nov 11, resolution Nov 12. **Depends on:** Nov 6 gate passing for JITCAR.

- [ ] Provide the compiled draft, case evidence, provenance inventory, declaration questions, and a short list of decisions needing his attention.
- [ ] Track every comment with a disposition and manuscript location; distinguish substantive concerns from copyedits.
- [ ] Obtain both authors' final approval of the revised manuscript, venue, declarations, and submission.

**Done when:** review comments are resolved or explicitly accepted as limitations, with final author approval recorded.

### P2 — Resolve the 22 missing DOI fields and audit all references

**Owner:** Codex checks metadata; authors validate source relevance. **Dates:** begin Nov 4, finish Nov 10; final pass Nov 12.

- [ ] For each of the 22 entries, verify exact title/authors/year/version against the publisher or authoritative registry and resolve any candidate DOI.
- [ ] Add a verified DOI when one exists; otherwise record “no DOI found/applicable” with a suitable stable official URL, version, and access date where required. Never manufacture a DOI.
- [ ] Check existing DOIs too, eliminate duplicate or obsolete records, and reconcile every citation with the final retained bibliography, including C6 additions and any changes required by the A6 permission terms.
- [ ] Check that the selected bibliography style actually prints required identifiers and that author names, capitalization, pages, and dates render correctly.

**C6 update (Nov 5):** added `baird2021`, `rintakahila2022` and `grisold2025`, each with verified DOI and final journal metadata. Corrected issue years while preserving keys: `schneider2022` to 2023, `mokander2023` and `novelli2023` to 2024; original years were online-first dates. See the [C6 bibliography handoff](research/C6-SOURCE-MAP.md#bibliographyp2-handoff). The original 22-item audit remains open.

**Initial inventory:** `crosby2009`, `sculley2015`, `euaiact2024`, `iso42001`, `dsse`, `slsa`, `mcp`, `otel`, `lattice`, `latticeissue21`, `gretelfinance`, `presidio`, `llmguard`, `litellm`, `portkey`, `openllmetry`, `langchain`, `cosign`, `intoto`, `bindschaedler2026afr`, `ardebili2026novafabric`, `alce`.

**Done when:** every cited item has verified metadata and a documented identifier outcome; the expected result is not necessarily 22 new DOIs.

### P3 — Resolve IRB, ethics, and all red TODOs

**Owner:** authors obtain/confirm institutional decisions; Codex inventories and replaces resolved placeholders. **Dates:** scope decision Nov 4; final text Nov 12.

- [ ] Decide whether any proposed practitioner activity, identifiable operational data, or quotations require institutional review; obtain the relevant determination before recruitment or collection.
- [ ] If no participant study is conducted, accurately state the scope of the reported work and label the practitioner study as future work. Do not invent an IRB approval or exemption number.
- [ ] Resolve every visible TODO: practitioner-study approval/IRB, ethics, contribution statement (P5), and archive DOI (P4).
- [ ] Search manuscript, generated fragments, appendices, declarations, and compiled PDF for TODO/TBD/placeholder markers and unresolved references.

**Done when:** ethics statements describe the actual study and the submission contains no unresolved red TODOs or placeholder assertions.

### P4 — Prepare the reproducibility archive and Zenodo DOI

**Owner:** Codex prepares/checks; Lakshman authorizes and performs publication steps as agreed. **Dates:** prepare Nov 10–11; DOI resolved by Nov 12. **Depends on:** A5/A6 permissions and stable results.

- [ ] Select the exact code/data/result revision to archive; distinguish the measured revision from subsequent fixes.
- [ ] Inventory distributable source, scripts, aggregate results, documentation, licenses, and environment instructions; exclude credentials, private records, and restricted datasets. For Ai4Privacy, retain aggregate reports only and exclude raw caches, record-level annotations/span exports and the private correspondence recorded under A6.
- [ ] Prepare a tagged release/archive and repository changes needed for reproducibility. Review concrete contents before pushing or publishing.
- [ ] Obtain a real DOI through the chosen archive workflow, verify its landing page and metadata, and update data/code availability. A reserved identifier and a published accessible archive must be distinguished accurately.
- [ ] Check anonymous-review requirements before adding repository or archive links that identify authors.

**Done when:** the availability statement matches accessible, permitted artifacts and the DOI's actual state.

### P5 — Finalize declarations and author information

**Owner:** each author confirms personal facts; Codex checks consistency and formatting. **Due:** Nov 12. **Depends on:** A1–A6 and P3.

**Nov 3 draft prepared:** `main.tex` includes the self-funded/conditional publication-cost statement and a combined declaration distinguishing Prof. Neouchi's planning-only Claude use from Lakshman's coding tools and Codex's evaluation prose and editorial assistance. Model names are author-reported; tool-to-model mappings are not invented. This records known use without claiming that all manuscript text was human-written or that disclosure alone resolves the publisher's drafting restriction.

- [ ] AI-use disclosure and methods details covering confirmed tools/versions, purposes, affected work, records retained, and author responsibility.
- [ ] Keep records of the prompts used for research-method and literature-review work, which the guidance says "must be shared with the journal upon request"; preserve the Claude and Codex session logs. Detail that use in the Methods section as the guidance requires; it currently appears only in the declaration, table notes and captions. Figure legends also need the tool name and version.
- [ ] Both authors confirm accuracy and originality of the content, references and retained model/tool details, and verify tool terms are suitable for publication. Resolve the existing AI-generated evaluation passages under A1 before treating the disclosure as submission-ready.
- [ ] CRediT roles agreed by both authors; no unverified allocation of original drafting, analysis, supervision, or funding acquisition.
- [ ] Funding statement: Prof. Neouchi's wording applied Nov 9 (see A3); support facts still to be reconciled under A4.
- [ ] Competing interests including relevant Voyza/FSB relationships and each author's own declaration.
- [ ] Ethics, consent, case permission, data/code availability, and acknowledgements as applicable.
- [ ] Accurate author bios, names, affiliations, ORCIDs, corresponding-author details, and any required title page.

**Done when:** both authors approve the declarations and the manuscript, title page, portal fields, and cover letter agree.

### P6 — Build and validate the final PDF and source package

**Owner:** Codex prepares and checks; authors review. **Due:** Nov 13. **Depends on:** P1–P5 and A7.

- [ ] Apply the verified JITCAR template/style and length rules, including anonymized and identified versions if required. The present `paper/main.tex` is an ISF draft, not a verified JITCAR submission template.
- [ ] Build the PDF and a self-contained LaTeX zip containing `.tex`, `.bib`, figures, permitted supplementary material, and required class/style files.
- [ ] Compile from a clean extraction; confirm no local absolute paths, missing assets, secrets, private `.context` files, or restricted data are included. Recheck the A6 aggregate-only scope against the exact zip/archive inventory.
- [ ] Inspect all pages for clipped figures, unreadable tables, broken references, typography issues, and accidental identifying details where anonymization is required.
- [ ] Check every number against generated results and all claims against their evidence; verify title, abstract, keywords, declarations, and DOI links.
- [ ] Prepare any required cover letter and submission metadata from author-provided text, consistent with the AI-use approach.

**Done when:** the exact package proposed for submission builds cleanly, passes visual/content checks, and both authors approve it.

### P7 — Submit through the verified Routledge/Taylor & Francis portal

**Owner:** corresponding author. **Target:** Nov 13; verified official date Nov 15, with closing time/time zone unspecified. Do not rely on submitting during Nov 15. **Depends on:** P6 and final author approval.

- [ ] Enter the verified journal portal and select the correct special issue and article type.
- [ ] Upload the approved PDF, LaTeX zip, `.bib`, and any other files the portal actually requires.
- [ ] Complete author, funding, competing-interest, ethics, AI-use, and other declarations using approved facts.
- [ ] Choose color online only for figures, to avoid the print color charge (A7). If the appendices stay in the printed article, four generated captions name colors and would need rewording for grayscale: the `noPII` label chart in `evaluation-details.tex`, bytes retained in `realworld.tex`, and tamper and capability in `realworld-broad.tex`.
- [ ] Inspect the portal-generated submission proof and resolve conversion errors before final submission.
- [ ] Submit and retain the manuscript ID, timestamp, confirmation email, and exact submitted package.

**Done when:** submission is confirmed by the portal and the corresponding author has the receipt. An uploaded draft is not a completed submission.

## How we will work through this

1. **Continue A1:** complete the remaining authorship inventory and identify the existing email card; complete A7's general author requirements and portal checks alongside it. The original Introduction provenance, call source and deadline date are verified.
2. **Resolve the external dependencies:** remaining A2–A5 requests and factual questions, with Nov 5 fallback decisions; A6 written confirmation and scope are now documented, with final packaging checks under P4/P6. Track waiting replies while working on independent items.
3. **Work through C1–C8 in order**, choosing the C2 case before finalizing C1. For each item: inspect current material, agree the needed change, carry out permitted work, verify the result, and update its checkbox/status.
4. **Apply the Nov 6 decision**, record JITCAR go/no-go, and follow the agreed venue path.
5. **Work through P1–P7**, starting reference and archive preparation early enough to avoid compressing all packaging into Nov 13.

Optional runtime enhancements, broader model comparisons, new benchmark datasets, and a full practitioner study without an approved feasible protocol are outside the Nov 6 critical path. Preserve them as future work rather than allowing them to displace a complete, accurate draft.

## Decision log

| Date | Decision or open question | Owner / next action |
| --- | --- | --- |
| Nov 3 | Submission preparation is the highest-priority workspace task | Track progress here and in `.planning/STATE.md` |
| Nov 3 | Nov 6 complete-draft cutoff; otherwise ISF or BISE | Lakshman and Prof. Neouchi choose fallback if triggered |
| Nov 3 | Nov 13 submission target; Nov 15, 2026 date verified from the official call; no closing time/time zone supplied | Do not rely on any part of Nov 15; ask Dr. Khazanchi if a later window becomes necessary |
| Nov 3 | The Post AI Enterprise call verified; no editor deadline email exists | A7 still requires accessible general author instructions and the portal selection |
| Nov 3 | Eight content changes remain pending despite reusable existing sections | Work through C1–C8 |
| Nov 3 | Refund approval is the recommended working case; real/synthetic status is undecided | A5 and C2 |
| Nov 3 | First substantive task is AI provenance, before manuscript rewriting | A1 |
| Nov 3 | C1 revised after confirmation that the original Introduction was human-written | Author review remains open |
| Nov 3 | C2 research selects a synthetic travel-refund dispute motivated by the Moffatt judgment; Klarna refunds and Zurich claims provide comparison contexts | Authors review research/design and write the original case narrative; C4 executes the proposed demonstration. Supersedes the earlier undecided case status |
| Nov 3 | User requested live free models; 32 refund reviews completed with USD 0 added spend, 28 full-rubric passes and 32 verified run-evidence packages | Preserve the frozen cohort and four reference omissions; C2/C4 author incorporation next |
| Nov 3 | User explicitly requested an AI-generated C2 reference to rewrite; workflow/evidence/results tables integrated without new inference | C2 evidence integrated; author narrative and review pending. Reference draft stays outside manuscript; A1/P5 remain open; C3 not started |
| Nov 4 | Lakshman directed Claude to review C2, rewrite the narrative in its own voice with Moffatt central, integrate it and mark C2 reviewed | C2 reviewed. Two-way audit gives 14/16 (15/16 superseded); Moffatt's CAD 10 internal inconsistency is recorded. The AI-drafted Section 5 and 7.11 conflict with the T&F first-draft rule, so the authors must decide under A1/P5. C3 is next |
| Nov 4 | Lakshman directed Claude to review C3 the same way as C2 | C3 reviewed. Sources verified; the Codex map's "no implementation date needed" claim is withdrawn because the Omnibus-amended Art. 113 defers Annex III duties to Dec 2, 2027. ADR scope and Art. 50(1) added. Sections 3–4 narrative redrafted by Claude, so the T&F first-draft decision is open (A1/P5). C4 is next |
| Nov 4 | Lakshman requested a small C2 correction pass | Added Moffatt's second arithmetic inconsistency (para. 38: CAD 474.23 reported vs 464.23 from components), keeping the tribunal's amounts as published. Renamed value-agreement rows to "match the frozen rubric". Clarified that only successful runs receive output commitments. Scores unchanged |
| Nov 5 | Lakshman asked for the remaining items to be reviewed through C7 | C1 and C4–C7 reviewed without rewriting narrative. Results recomputed from raw data and unchanged. Signing-cost range corrected (0.195–5.142 ms across 10 configurations), eight comparison-table cells corrected against primary texts, and five citation or reference details fixed. Author items are listed in the review. C8 is next |
| Nov 6 | Lakshman approved the author rewrite setup | Local `author-rewrite` branch holds stubs for the Section 3, 4, 5 and 7.7 narrative; the working branch stays complete for the Nov 6 gate. Editor-agreement advice withdrawn. Prof. Neouchi's agreement, the section inventory and JITCAR's instructions remain open |
| Nov 9 | Prof. Neouchi supplied the final funding statement after checking JITCAR's instructions | `main.tex` now reads "This research received no specific grant from any funding agency."; the publication-cost sentence is dropped. No submission or publication fees; authors will choose color online only |
