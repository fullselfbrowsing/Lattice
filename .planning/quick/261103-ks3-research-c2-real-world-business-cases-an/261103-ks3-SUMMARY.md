---
type: quick
id: 261103-ks3
date: 2026-11-03
status: complete
implementation_commit: 8b18e8a
---

# C2 research and business case design

Completed the requested research and proposed case design. C2 manuscript incorporation and C4 execution remain pending; no new empirical result or field deployment is claimed.

## Outcome

- Compared primary evidence for the Moffatt travel-refund dispute, Klarna refunds/returns, and Zurich claims support. Selected a synthetic travel-refund review after conflicting chatbot advice as the strongest fit for organizational accountability, existing Lattice mechanisms and the November 6 draft cutoff.
- Created `paper/research/C2-REFUND-CASE.md` with source locations and access limitations, proposed actors/rules, ordinary and exception paths, process diagram, evidence/control table, implementation mapping and a frozen offline demonstration specification.
- Distinguished a wrong-but-validly-signed recommendation from tampering, missing evidence, authorization and payment. Kept business refund policy separate from Lattice execution policy; specified explicit hash checks beyond replay materialization.
- Updated the submission checklist and known assistance inventory. C1 remains revised/awaiting author review. Case narrative will be author-drafted under the existing A1 approach; the research brief is planning material.

## Validation

- Read the primary tribunal decision through available copies, downloaded the Middle Temple copy privately, and visually inspected page 6 (paragraphs 27–31). Official tribunal/CanLII access failed. Used the SEC filing after Klarna's press page was blocked.
- Verified current primary-source pages for Zurich, the special issue and publisher AI guidance. Public corporate reports are identified as self-reports; no corporate performance metric is imported as a Lattice result.
- Checked implementation claims against receipt construction/hash/verify helpers, execution-binding tests, provider request hashing, invariant definitions, policy types and replay helpers. Tests were inspected as implementation evidence, not newly run or relabeled as case results.
- All repository-relative links and Markdown section anchors resolve. Both paths and all five source records are present. Mermaid source has 11 declared/referenced nodes and 12 edges; no rendered preview was produced.
- `git diff --check` passes. Main LaTeX, PDF and bibliography match their starting bytes. No runtime/API or historical evaluation files changed; no new inference or paid service use.
- Private source/provenance records are under `.context/jitcar-c2/`; no credentials, private records or downloaded source PDFs were committed.

## Remaining work

1. Author review of the case choice/design and original C2 manuscript narrative; A7 general requirements still unresolved.
2. Implement and execute the proposed fixture demonstration under C4, preserving negative controls and separating scripted actions from human/model observations.
3. Adapt the figure/evidence table with appropriate disclosure and record the session-specific model/version if available; do not infer tool-model mappings.
4. Reconcile A5 against final case materials. The proposed synthetic case requires no private FSB/Voyza artifact or company-deployment claim.

Task executed inline through the required GSD quick workflow. No subagents, branch change, push, correspondence or submission.
