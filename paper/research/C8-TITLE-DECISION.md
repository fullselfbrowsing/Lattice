# C8 working-title decision

**C8 working title selected and aligned; coauthor approval and venue checks pending.**

Decision date: November 5, 2026 (America/Chicago). Implementation initialized November 6, 2026 at 04:04 UTC, still November 5 locally. GSD task: `261105-unn`. Starting revision: `7d3c62374e293911ef473ee2701e1ddc02f14e98`; current branch retained. The intervening C1/C4–C7 factual review is preserved.

## Selected working title

**Verifiable Evidence for AI-Assisted Business Decisions: A Design Science Study**

Lakshman selected the evidence-led option in the C8 planning question and then explicitly requested implementation. Prof. Neouchi's approval has not been supplied. Use the exact plain-text wording above for later title-page, cover-letter and submission-field alignment after the authors' final decision; no external submission field was changed here.

## Candidates considered

| Candidate | Emphasis | Decision |
| --- | --- | --- |
| Verifiable Evidence for AI-Assisted Business Decisions: A Design Science Study | Business relevance and the bounded evidence-design contribution | Recommended by Codex; selected by Lakshman |
| Supporting Organizational AI Accountability: A Design Science Study of Verifiable Evidence | Governance and organizational responsibility | Not selected |
| Verifiable Evidence for AI-Assisted Decisions: A Design Science Study with Public Refund-Dispute Records | Explicit public-record application | Not selected |

The selected wording introduces the organizational application before implementation details. “Verifiable evidence” denotes the recorded commitments and checks evaluated in the paper; it does not claim that signatures establish decision correctness, complete business records, provider honesty or human authorization. The design-science subtitle matches the method. The title makes no claim of organizational deployment, observed human approval, improved managerial decisions or comprehensive decision verification. The public refund-dispute application remains explicit in the unchanged abstract and case sections.

The former title, “Making Model Runs Auditable by Default: A Design Science Study of Signed, Replayable Capability Receipts for Organizational AI Accountability,” was more implementation-focused. “By default” could obscure the need to configure signing, and “replayable” could be mistaken for model re-execution. The new title avoids both ambiguities without changing the claims or evidence.

## Alignment and verification

- The visible title in [the manuscript](../main.tex) uses the selected wording with a line break before the subtitle. PDF title metadata uses the same wording without a line break.
- The abstract and visible keywords are unchanged. The six existing keywords also populate PDF metadata: Organizational AI accountability; AI-assisted decision-making; Design science research; Audit evidence; Human oversight; AI governance.
- The research body, C2–C7 evidence, latest factual corrections, generated results, bibliography, Ai4Privacy documentation and separate IEEE manuscript are protected against the starting revision. Only title/metadata and the title-assistance disclosure change in the LaTeX manuscript.
- `make -C paper tectonic` passes: 77 pages, no undefined citations/references or overfull boxes, and seven existing underfull warnings. `pdfinfo` reports the exact selected title and all six keywords. The title is visibly two lines. Changed page layouts (pp. 1–5 and 27–28) were rendered and inspected; all other pages have unchanged extracted text. All 621 protected files match the baseline. Reversing only the title, metadata and added assistance sentence yields the exact original LaTeX source. The GSD summary and private `.context/jitcar-c8/validation.json` record the checks. No experiment or numerical presentation generator was run.

## Assistance and open decisions

OpenAI Codex proposed the three titles, explained their fit and limitations, applied Lakshman's selection, aligned PDF metadata and prepared this decision record. This is AI-assisted title selection; it is not evidence of human authorship for previously drafted sections. This session's model/version is **unconfirmed**; author-reported versions from other work are not assigned to it. The manuscript declaration and A1 checklist record this assistance.

Prof. Neouchi's agreement and final journal requirements remain pending. No title-length limit, keyword limit, anonymization rule or template compliance is inferred while A7 is unresolved. A1/P5, previous author reviews and the submission-package tasks remain open. Portal fields, cover letters, historical records and the separate IEEE title are unchanged. No runtime/API change, inference, new experiment, template migration, external message or submission action was performed.
