# Quick Task 261115-6oh: Apply Prof. Neouchi's November 15 JITCAR review edits - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning

<domain>
## Task Boundary

Apply the review edits that Prof. Rabih Neouchi (R.N.) sent on November 15, 2026, the JITCAR special-issue deadline day, to the manuscript in `paper/`. The PDF R.N. reviewed matches the current branch build exactly (79 pages; his page numbers match).

R.N. confirmed from the JITCAR author instructions: single-anonymous review (no anonymized version), no word limit for research articles, free format (no reformatting). The abstract is limited to an unstructured 200 words (`paper/research/A7-SUBMISSION-REQUIREMENTS.md`).

**Out of scope, do not touch:** R.N.'s item 4, the rewrite of the AI-drafted narrative of Sections 3, 4, 5 and 7.7 plus shortening the AI declaration. That is the author's own writing (see `paper/research/AUTHOR-REWRITE.md`). Do not edit the narrative of Sections 3–5 or 7.7, do not shorten or reword the existing AI declaration beyond the one insertion below, and do not touch the `author-rewrite` branch or worktree.

</domain>

<decisions>
## Implementation Decisions (locked by Lakshman Turlapati, November 15)

- L.T. affiliation: "Independent Researcher, Dallas, TX, USA" (Lattice's first commit is 2026-04-21, after his December 2025 M.S.).
- Paid cohort (Appendix D, Tables 34–36): keep it. Lakshman instructed Claude to draft its introduction, overriding the publisher's AI-first-draft rule. The draft must be disclosed in the AI declaration (insertion below).
- CRediT: R.N.'s proposed roles plus Investigation, Data curation, Validation and Visualization for L.T., in CRediT taxonomy (alphabetical) order.
- Abstract keeps exactly one limits sentence, "Verification checks recorded commitments, not provider honesty, decision correctness, fairness, or human authorization."; the other limits move to Section 8.2.
- R.N.'s biographical note is inserted verbatim. L.T.'s note is a short factual draft for his check (facts: M.S. from JSOM, UT Dallas, December 2025; independent researcher, Dallas; author and maintainer of Lattice under his Full Self Browsing project).
- Appendix F (`practitioner-proposal.tex`) leaves the manuscript; the file stays in the repository.
- Generated notes are edited in their generator, never by hand: `paper/public-refund-results.tex` comes from `paper/scripts/public-refund-tables.mjs`. The other `.tex` files edited below are hand-written (no generator references them).

</decisions>

<specifics>
## Exact Edits (apply verbatim; do not rephrase, reflow, or "improve" any text)

### E1. `paper/is-literature-table.tex` (Table 1 note) and `paper/managerial-responsibilities.tex` (Table 11 note)
Old: `Table prepared with OpenAI Codex; session model/version unconfirmed, pending author review.`
New: `Table prepared with OpenAI Codex; session model/version unconfirmed.`

### E2. `paper/public-refund-case.tex` (Figure 1 caption) and `paper/refund-synthetic-appendix.tex` (Appendix E diagram caption)
Old: `Diagram prepared with OpenAI Codex; drafting model/version unconfirmed, pending author disclosure review.`
New: `Diagram prepared with OpenAI Codex; drafting model/version unconfirmed.`

### E3. `paper/scripts/public-refund-tables.mjs` (Table 10 note generator), then regenerate
Old: `The rubric was prepared with Codex and audited against the source pages with Claude; author confirmation remains open.`
New: `The rubric was prepared with Codex and audited against the source pages with Claude.`
Then from the repo root: `node paper/scripts/public-refund-tables.mjs </dev/null` and `node paper/scripts/public-refund-tables.mjs --check </dev/null`. `git diff paper/public-refund-results.tex` must show only that phrase removed.

### E4. `paper/main.tex`

**E4a. Affiliations.**
Old:
```
\small $^{1}$Full Self Browsing\\
\small $^{2}$Naveen Jindal School of Management, The University of Texas at Dallas, Richardson, TX, USA\\
```
New:
```
\small $^{1}$Independent Researcher, Dallas, TX, USA\\
\small $^{2}$Information Systems, Naveen Jindal School of Management, The University of Texas at Dallas, Richardson, TX, USA\\
```
Leave the corresponding-author lines (alumnus, M.S. December 2025, email, ORCIDs) unchanged.

**E4b. Abstract.** In the abstract paragraph, replace this exact substring:
```
Historical controlled evaluation tested tamper detection, retained-output verification, policy checks, and signing overhead; separate hosted cohorts examine execution and answer quality, including retrospective review of four actual public refund-dispute records. These evaluations do not establish improved managerial decisions or reduced dispute-resolution costs. Verification checks recorded commitments, not provider honesty, decision correctness, fairness, or human authorization. Stored-output verification is not model re-execution, and request commitments do not prove remote consumption. The contribution is a design for producing evidence during execution, with explicit limits on what that evidence supports. Its usefulness to managers and auditors remains to be evaluated.
```
with:
```
In historical controlled evaluation, single-receipt tamper attempts were rejected where rejection was required, retained outputs matched their signed hashes, routing policies were not violated, and signing added \CfourSignDeltaMinMs{} to \CfourSignDeltaMaxMs{}~ms to median run time. Separate hosted cohorts examine execution and answer quality; in a retrospective review of four actual public refund-dispute records, all \CfourPublicSignatures{} terminal signatures verified and \CfourPublicPackages{} of \CfourPublicPlanned{} runs supplied complete output evidence. Verification checks recorded commitments, not provider honesty, decision correctness, fairness, or human authorization. The contribution is a design for producing evidence during execution, with explicit limits on what that evidence supports.
```
The first two abstract sentences stay unchanged. Values: `\CfourSignDeltaMinMs`=0.195, `\CfourSignDeltaMaxMs`=5.142, `\CfourPublicSignatures`=16, `\CfourPublicPackages`=15, `\CfourPublicPlanned`=16 (all defined in the preamble via `c4-evidence.tex`).

**E4c. Source comment under the abstract.**
Old: `% Confirm abstract and keyword limits against the JITCAR author instructions.`
New: `% JITCAR research articles: unstructured abstract of at most 200 words.`

**E4d. Introduction, contributions paragraph (starts "The study makes three contributions").** Replace its last sentence:
Old: `Controlled and hosted evaluations supply technical evidence; they do not demonstrate improved managerial decisions or faster resolution of customer disputes.`
New: `The historical controlled evaluation shows that, where rejection was required, single-receipt tamper attempts were rejected, retained outputs matched their signed hashes, routing policies were not violated and signing added \CfourSignDeltaMinMs{} to \CfourSignDeltaMaxMs{}~ms to median run time; in a retrospective review of four actual public refund-dispute records, all \CfourPublicSignatures{} terminal signatures verified.`

**E4e. Introduction, delete this whole paragraph** (and one of the blank lines around it, so one blank line separates the neighbours):
```
A valid receipt establishes integrity of the signed commitments. It does not establish that an issuing runtime or provider acted honestly, that a decision was correct or fair, or that an employee authorized it. Those questions require additional evidence and organizational judgment. Verification of retained outputs is also distinct from re-executing a model. These boundaries matter when deciding how much reliance to place on a record during review.
```

**E4f. Section 7.8 body** (under `\subsection{Practitioner evaluation remains future work}\label{sec:eval-study}`). Keep the heading and label.
Old:
```
The reported evidence contains no practitioner evaluation of usefulness, review accuracy, review time or adoption effort. Following FEDS \citep{venable2016}, a naturalistic episode remains proposed. Appendix~\ref{app:practitioner-protocol} retains the draft participant roles, tasks and measures for author review and institutional determination before recruitment. A proposed protocol is not feedback, and technical integrity or correct extraction alone does not establish better managerial decisions.
```
New:
```
Following FEDS \citep{venable2016}, a future naturalistic evaluation with practitioners should assess usefulness, review accuracy, review time and adoption effort; the reported evidence includes no such evaluation.
```

**E4g. Section 8.2 heading and opening.**
Old:
```
\subsection{Limitations and future research}

The evaluation has several limitations. Some of them were first reported in an evaluation filed as a public issue \citep{latticeissue21}.
```
New:
```
\subsection{Limitations and future research}\label{sec:limitations}

The evaluation has several limitations. Some of them were first reported in an evaluation filed as a public issue \citep{latticeissue21}. The controlled and hosted evaluations supply technical evidence; they do not establish improved managerial decisions, faster resolution of customer disputes or reduced dispute-resolution costs, and the design's usefulness to managers and auditors remains to be evaluated. A valid receipt establishes integrity of the signed commitments. It does not establish that an issuing runtime or provider acted honestly, that a decision was correct or fair, or that an employee authorized it. Those questions require additional evidence and organizational judgment. Verification of retained outputs is also distinct from re-executing a model, and request commitments do not prove remote consumption. These boundaries matter when deciding how much reliance to place on a record during review.
```
The `\begin{itemize}` list that follows stays unchanged.

**E4h. Acknowledgements.** Delete exactly this sentence and the single space after it:
`One author's primary affiliation is Full Self Browsing, disclosed under competing interests. `

**E4i. Generative AI declaration.** Insert the following immediately before the existing final sentence `The authors take responsibility for the content of this publication.` (one space between sentences). Change nothing else in the declaration.
```
Claude Code (Claude Opus 5.5) orchestrated the paid-model cohort in Appendix~\ref{app:paid-cohort} at L.~Turlapati's direction, made the reporting correction recorded there as amendment A2, and drafted that appendix's introduction. On 15 November 2026 it also applied R.~Neouchi's review requests: it restated evaluation results already reported in the paper in the abstract and introduction, moved limitation statements from both to Section~\ref{sec:limitations}, shortened Section~\ref{sec:eval-study}, and drafted L.~Turlapati's biographical note.
```

**E4j. Competing interests.**
Old: `Lakshman Turlapati is the author and maintainer of Lattice and is affiliated with Full Self Browsing, which publishes Lattice. Rabih Neouchi declares no competing interests.`
New: `Lakshman Turlapati is the author and maintainer of Lattice, which he publishes under his Full Self Browsing project. Rabih Neouchi declares no competing interests.`

**E4k. Author contributions.**
Old: `\paragraph{Author contributions} \todo{CRediT statement, e.g., Conceptualization: L.T., R.N.; Software: L.T.; Methodology: L.T., R.N.; Writing: L.T.; Supervision: R.N.}`
New: `\paragraph{Author contributions} Conceptualization: L.T., R.N.; Data curation: L.T.; Formal analysis: L.T.; Investigation: L.T.; Methodology: L.T., R.N.; Software: L.T.; Supervision: R.N.; Validation: L.T.; Visualization: L.T.; Writing -- original draft: L.T.; Writing -- review \& editing: L.T., R.N.`

**E4l. Ethics approval.**
Old: `\paragraph{Ethics approval} Not applicable to the reported evaluation, which involved no human participants. \todo{Required for the planned study in Sect.~\ref{sec:eval-study}.}`
New: `\paragraph{Ethics approval} Not applicable to the reported evaluation, which involved no human participants.`

**E4m. Notes on contributors.** Insert after the Ethics approval paragraph and before `\appendix` (blank line before and after the block):
```
\section*{Notes on contributors}
\noindent\textbf{Lakshman Turlapati} is an independent researcher based in Dallas, Texas. He received his M.S. from the Naveen Jindal School of Management at The University of Texas at Dallas in December 2025. He is the author and maintainer of Lattice, an open-source TypeScript runtime for AI applications that can produce signed, verifiable records of model runs, which he publishes under his Full Self Browsing project. His work focuses on verifiable evidence and accountability for AI-assisted business processes.

\medskip
\noindent\textbf{Rabih Neouchi} is an Associate Professor of Instruction in Information Systems at the Naveen Jindal School of Management, The University of Texas at Dallas, where he teaches programming and business analytics courses at the undergraduate and graduate levels. He holds a doctorate in Engineering Management from Southern Methodist University and a master's degree in Computer Science from the University of Windsor. Before joining academia full time, he worked in industry as a software engineer at Microsoft and as a data scientist at Verizon. His research interests include natural language processing, knowledge graphs, temporal reasoning in large language models, computing education, and, more recently, the responsible design and use of AI.
```

**E4n. Paid-cohort appendix introduction.** Under `\section{Paid-model cohort}\label{app:paid-cohort}`, replace:
`\todo{Author text needed: introduce the paid-model cohort, run on 12 November 2026 after the free cohort and never pooled with it; its verdict under the reporting rule fixed before the run; and amendments A1 and A2.}`
with:
```
This appendix reports a paid-model cohort run on 12 November 2026, after the free cohorts and separately from the incomplete earlier paid rerun in Appendix~\ref{app:hosted-details}. Through OpenRouter, it repeated the public-record refund review, the citation evaluation and the runtime checks with Claude Sonnet 5.5, GPT-6.1 Sol and Gemini 4 Carbon, sending requests identical to the free cohorts' apart from the model identifier. Its protocol was frozen at revision \code{\PaidRevision} before the run; it reuses no free-cohort result and is never pooled with one. The reporting rule fixed before the run made the cohort valid if every admitted stage completed, at least 95\% of planned calls returned a model response and every successful run's receipt verified; no score entered that decision. The cohort met that rule: \PaidRespondedCalls{} of \PaidPlannedCalls{} planned calls (\PaidResponseRate\%) returned a response, and all \PaidReceiptsVerified{} successful runs' receipts verified. Two amendments are recorded. Under A1, decided by the first author before any further judging, Grok 4.7 was excluded as a judge after timeouts and a breached output-token cap, leaving Qwen 3.8 Max as the only judge, so no inter-judge agreement is reported. A2 is a reporting correction that Claude Code, which orchestrated the run, made afterwards and reported to the first author: strict citation quality now follows the free cohort's rule, under which every listed citation must be relevant. No inference was rerun, and the verdict is unaffected because validity uses no scores.
```
Source facts: `eval/paid-cohort/results/summary.md`, `amendments.json`, `protocol.json` (judges grok-4.7 and qwen3.8-max; frozen at 08e15df), `eval/paid-cohort/README.md` "Reporting rule (fixed before the run)".

**E4o. Remove Appendix F.**
Old:
```
\input{refund-synthetic-appendix.tex}
\FloatBarrier
\clearpage
\input{practitioner-proposal.tex}

\FloatBarrier
\clearpage
\input{technical-background.tex}
```
New:
```
\input{refund-synthetic-appendix.tex}
\FloatBarrier
\clearpage
\input{technical-background.tex}
```

### E5. `paper/README.md`
Old: ``The unapproved practitioner protocol is in `practitioner-proposal.tex` and remains future work.``
New: ``The practitioner protocol in `practitioner-proposal.tex` is no longer included in `main.tex`; it was removed at Prof. Neouchi's request on November 15, 2026, and Section 7.8 states practitioner evaluation as future work in one sentence.``

### E6. `paper/JITCAR-TODO.md`
- Under the existing bold status lines at the top, add one line: `**November 15 coauthor review applied** ([quick task 261115-6oh](../.planning/quick/261115-6oh-jitcar-rn-review-edits/261115-6oh-SUMMARY.md)): drafting notes and all four red TODOs cleared, Appendix F removed, affiliations, competing interests, CRediT and contributor notes updated, abstract and introduction lead with results. R.N.'s item 4 (author rewrite of Sections 3–5 and a shortened, accurate AI declaration) remains with the authors.`
- P3, "Decide whether any proposed practitioner activity…": check it and append ` Resolved Nov 15: at Prof. Neouchi's request the practitioner protocol (former Appendix F) was removed; the manuscript proposes and reports no participant activity.`
- P3, "If no participant study is conducted…": check it and append ` Nov 15: Section 7.8 states practitioner evaluation as future work in one sentence; the ethics statement keeps "Not applicable…" with no approval number.`
- P3, "Resolve every visible TODO…": check it and append ` Nov 15: all four resolved — CRediT filled, ethics TODO deleted, paid-cohort introduction drafted by Claude Code at Lakshman's instruction (disclosed), Appendix F removed.`
- P3, "Search manuscript, generated fragments…": leave unchecked; append ` Nov 15: the compiled PDF has no TODO or drafting markers after the coauthor edits; repeat after the author rewrite is merged, since that branch carries 18 stubs.`
- P5, "CRediT roles agreed by both authors…": leave unchecked; append ` Nov 15: R.N. proposed the roles; L.T. added Investigation, Data curation, Validation and Visualization. R.N. to confirm the additions.`
- P5, "Competing interests…": leave unchecked; append ` Nov 15: R.N.'s wording applied; Full Self Browsing removed from L.T.'s affiliation and the acknowledgements.`
- P5, "Accurate author bios, names, affiliations…": leave unchecked; append ` Nov 15: L.T. listed as Independent Researcher, Dallas, TX, USA; R.N. as Information Systems, JSOM, UT Dallas. Notes on contributors added: R.N.'s supplied text and a Claude-drafted factual L.T. note awaiting his check.`
- P6, "Apply the verified JITCAR template/style and length rules…": check it and append ` Nov 15: R.N. checked the author instructions — single-anonymous review (no anonymized version), no word limit for research articles, free format, so no reformatting. The abstract stays within the 200-word limit.`

## Verification (all must pass)
1. `cd paper && tectonic -X compile main.tex --keep-logs` succeeds, then `make -C paper check` passes (no undefined references or citations).
2. `pdftotext -layout paper/main.pdf -` contains none of: `[TODO`, `pending author`, `author confirmation`, `Proposed practitioner evaluation`.
3. `Full Self Browsing` appears in the PDF only in the competing-interests paragraph and L.T.'s contributor note.
4. The abstract is at most 200 words.
5. `grep -c 'todo{' paper/main.tex` reports only the `\newcommand{\todo}` definition (1).
6. `node paper/scripts/public-refund-tables.mjs --check </dev/null` passes.
7. `git diff --stat` touches only: paper/main.tex, paper/main.pdf, paper/is-literature-table.tex, paper/managerial-responsibilities.tex, paper/public-refund-case.tex, paper/refund-synthetic-appendix.tex, paper/scripts/public-refund-tables.mjs, paper/public-refund-results.tex, paper/README.md, paper/JITCAR-TODO.md.

## Commit rules
- Conventional commits, e.g. `docs(paper): apply Prof. Neouchi's November 15 review edits` and `docs(paper): record the coauthor review in the submission checklist`.
- Commit `paper/main.pdf` rebuilt in place together with the manuscript changes (established practice on this branch).
- **No `Co-Authored-By` or any AI-attribution trailer** in commit messages (user's global rule).
- Do not push.

</specifics>

<canonical_refs>
## Canonical References

- R.N.'s review message (Nov 15, relayed by Lakshman in this session)
- `paper/research/A7-SUBMISSION-REQUIREMENTS.md`: 200-word unstructured abstract; generative-AI disclosure requirement
- `paper/research/AUTHOR-REWRITE.md`: item 4 boundary (author's own rewrite)
- `eval/paid-cohort/results/summary.md`, `amendments.json`, `protocol.json`; `eval/paid-cohort/README.md`

</canonical_refs>
