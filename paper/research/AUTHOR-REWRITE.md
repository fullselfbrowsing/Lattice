# Author rewrite guide

Date: November 6, 2026. GSD quick task: `261106-2fh`. Prepared by Claude (Claude Code, Claude Opus 5.5) at Lakshman Turlapati's direction. This file covers process only. It contains no manuscript text and no outline of the argument.

## Why this exists

Taylor & Francis "does not allow generative AI to create a first draft of a manuscript or sections of a manuscript", and says AI "cannot be used to create or conclude the argument of an article" ([guidance](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/)). The narrative of Sections 3, 4, 5 and 7.7 is an AI first draft. Editing it does not change that, so the authors need to write these passages from a blank page.

Lakshman approved this approach on November 6. Prof. Neouchi's agreement is not yet recorded.

## Where to write

Use the local branch `author-rewrite`, in its own folder: `/Users/lakshman/conductor/workspaces/lattice/author-rewrite`. Missing text shows as a red `[TODO: Author text needed.]`. All figures, tables, labels and DR/DP names are kept, so the paper builds throughout.

Do not add stubs to `cursor/review-fixes-eval-708c`. It is the complete draft for the Nov 6 gate, which allows no placeholder in a core section. Please also leave these four passages alone on that branch until the rewrite is merged.

## What to write

| Section | Stubs | Where the facts are |
| --- | --- | --- |
| 3 Research Approach | 1 | The method sources in `refs.bib`; [C3 review](C3-REVIEW.md), sections 1–2 |
| 4 Design Requirements and Principles | 12 | [C3 review](C3-REVIEW.md), [C3 source map](C3-SOURCE-MAP.md), the AI Act and NIST texts |
| 5 Refund Disputes | 4 | The four decisions (links in the [case record](C2-PUBLIC-RECORD-CASE.md)); [C2 review](C2-REVIEW.md), sections 2–4 |
| 7.7 Public-record results | 1 | [Summary](../../eval/public-refund/results/summary.json), [source audit](../../eval/public-refund/results/source-audit.json), the results table; [C2 review](C2-REVIEW.md), section 4 |

## Ground rules

1. **Start blank.** Keep the old text closed while writing. That includes the working branch's `main.tex`, older PDFs and every `C*-REFERENCE-DRAFT.md`. Those drafts are labelled for author rewriting, but rewriting one is still rewriting an AI draft.
2. **Use the records for facts, not wording.** The review records and `interpretation.md` were also written by AI.
3. **Choose your own structure.** The stubs mark where text is missing and do not suggest an order. Merge, move or drop them. If you rename or renumber a DR or DP, update the tables and the references to it elsewhere in the paper.
4. **Commit your own work,** so the history shows who wrote it.
5. **Use AI only after you have written.** Checking facts and correcting language are fine. Drafting, paraphrasing and outlining the argument are not.

## Practical notes

- Build with `make -C paper tectonic`.
- Count what remains with `grep -c 'Author text needed' paper/main.tex`.
- Refer in your text to every kept figure and table: `tab:dsrm`, `tab:governance-trace`, `fig:public-refund-workflow`, `tab:public-refund-evidence` and `tab:public-refund-results`.
- Use the macros for public-record counts, so they stay tied to the saved results: `\CfourPublicSignatures{}`, `\CfourPublicPackages{}`, `\CfourPublicFrozen{}` and `\CfourPublicPlanned{}`.
- Cite the ombudsman decisions with `\citepalias{fos4377241}`, `\citepalias{fos4148727}` and `\citepalias{fos3785437}`.

## Also read and own

The kept figures, tables and their notes were prepared with AI, so read them as closely as your own text. `tab:governance-trace` matters most, because it carries the design argument. Generated notes are changed in `paper/scripts/public-refund-tables.mjs`, not by hand.

## Author edits outside the stubs

Section 6 of the [C4–C7 review](C4-C7-REVIEW.md) has the details.

- Say the real order of the work in the abstract, Introduction and Conclusion: the runtime came first.
- Decide whether the accountability definition in Section 2 includes consequences. Bovens (2007), *European Law Journal* 13(4), 447–468, is not yet in `refs.bib`.
- In the practitioner proposal, compare receipts with a signed log, and soften "establishes technical efficacy".
- Read the six works known only at abstract level before relying on them.

## Finishing

1. Clear every stub.
2. Update the AI-use declaration. It says Claude drafted these sections, which will no longer be true, so state what actually happened.
3. Ask for a check of the new text against the sources, numbers and stated limits, and for overlap with the old text.
4. From the working branch, run `git merge author-rewrite`, then rebuild. `paper/main.pdf` is a tracked binary and will conflict; the rebuild resolves it.

Sections 2, 6, 7.1–7.6, 8, 9 and 10 are not stubbed because their origin is unconfirmed. Once the A1 inventory is done, any that began as AI text need the same treatment.
