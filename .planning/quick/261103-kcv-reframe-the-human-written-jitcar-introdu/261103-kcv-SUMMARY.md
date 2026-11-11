---
mode: quick
status: complete
---

# JITCAR organizational introduction revision

Implemented the approved C1 revision in `77be0c4`. The task is complete as an editorial implementation; **C1 is revised, awaiting author review**, and the paper is not submission-ready.

## Changes

- Reframed the original, author-confirmed human-written introduction around an illustrative refund dispute: affected customer, reviewing employee, responsible manager, policy, information, recommendation and authorization. The introduction is approximately 663 words excluding citations, within the 650–750-word target.
- Connected the problem to organizational governance, human oversight and contestability. Lattice appears only after the problem, evidence gap and governance motivation. The approved research question is retained exactly.
- Acknowledged secure/tamper-evident logging and removed universal claims about debugging traces. Preserved the distinction between evidence integrity and decision correctness, fairness, honesty, human authorization or compliance, and between retained-output verification and model re-execution.
- Aligned abstract, keywords and conclusion. Technical evaluations remain separate from unmeasured managerial benefits, and historical timing is not attributed to later extensions.
- Replaced the blanket funding statement with self-funded research/no specific grant and conditional future publication support from Prof. Neouchi's research account.
- Added the combined AI-use declaration, distinguishing Prof. Neouchi's planning-only use from coding tools, known Codex evaluation prose and this editorial revision. All six model names are author-reported; mappings are not inferred. Final content/tool-terms verification and evaluation-text authorship remain open under A1/P5.
- Updated the checklist with received author facts and the selected illustrative refund case. Full C2 development, A7 author instructions/portal checks and other submission tasks remain open.

## Validation

- `make -C paper tectonic` passed; final log has no undefined citations/references and no overfull boxes. Underfull-box warnings remain in pre-existing generated tables/bibliography. Early-pass overfull warnings cleared in the final TeX pass.
- Visually inspected the affected abstract/introduction pages 1–3, conclusion page 39 and declarations page 40. The final PDF remains 51 pages; text, citations, section transitions and declarations render without clipping or overlap.
- Checked all eight introduction citation keys and relevant claims against primary sources: organizational governance, secure logging, audit documentation, Article 12, NIST AI RMF, and DSR. The refund example is explicitly hypothetical. The Commission's Article 12 text was used after EUR-Lex returned a JavaScript challenge.
- Checked the conclusion's technical statements against existing results: tamper 3,570/3,570, retained-output verification 350/350, zero routing-policy violations, and existing timing macros. No result was rerun or changed.
- SHA-256 comparison preserved all 592 captured evaluation, generated-input, bibliography and IEEE-version files. `git diff --check` passed. No runtime tests or inference were needed for this editorial change.

Private provenance, source checks, original source/PDF, preserved-file hashes and page renders are in `.context/jitcar-c1/`. They contain no credentials and are not committed. The final deliverables are `paper/main.tex`, `paper/main.pdf` and the updated submission checklist.

## Continuation

Review C1 with the authors, then develop C2's end-to-end refund case. Preserve the Nov 6 complete-draft cutoff, Nov 13 submission target and remaining author/permission requirements. No messages, push, publication or submission occurred.
