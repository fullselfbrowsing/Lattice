---
phase: quick-261111-lsa
plan: 01
status: complete
commits: [22fa88d, 7b21ab0, 96d44be, d5c669e]
---

# Quick 261111-lsa Summary

Cited the Lattice 1.7.0 archive (DOI 10.5281/zenodo.24145363) in both manuscripts, corrected the requirements chronology, AI Act source and proposal-scope wording, and rebuilt both PDFs.

## Commits
- 22fa88d docs(paper): cite the archived Lattice 1.7.0 release and DOI
- 7b21ab0 docs(paper): align requirements chronology, AI Act source and proposal scope
- 96d44be docs(paper): rebuild both manuscripts
- d5c669e docs(paper): let the npm package names break at the slash. This orchestrator review follow-up replaces the executor's forced `\linebreak`, which left a visibly stretched line and a new badness-10000 underfull warning, with `\allowbreak` after the slash in both package names and a paragraph-local `\emergencystretch`. Markup only; the approved wording is unchanged.

## Deviations
- The approved software-baseline paragraph needed typesetting help because the long npm package names caused an 8.7pt overfull box. The final markup is d5c669e's, and the words are as approved.
- The IEEE log's single overfull box (1.2pt, table at ieee/main.tex lines 696-713) is pre-existing. A build of untouched `origin/main` gives the identical warning, the same 49 underfull warnings and 23 pages.
- paper/JITCAR-TODO.md: P4 items 342, 344, 345 and 346 are checked with evidence. Item 343 stays unchecked because the archived `paper/research/AI4PRIVACY-PERMISSION.md` names the Ai4Privacy respondent and quotes one sentence of the reply, which needs an author decision. Item 344 notes that archive contents were reviewed after publication. The P3 note says three visible TODOs remain.

## Verification
- All ten approved replacement blocks are present verbatim in the committed sources, and the six superseded sentences are gone.
- main.pdf: 77 pages; 3 `[TODO:` (CRediT, ethics, study design); DOI in the availability statement and the reference list; 0 undefined; 0 overfull; 7 underfull, the same as the baseline.
- ieee/main.pdf: 23 pages; 0 `[TODO:`; DOI in the reproducibility notes and reference [25]; 0 undefined; overfull and underfull counts identical to `origin/main`.
- Abstract: 173 prose words (limit 200).
- Rendered pages inspected: journal p28 (availability, appendix A.1) and IEEE p22 (release paragraph, reference [25]). Text checks covered the abstract (p1), the introduction and AI Act clause (p2), the conclusion (p26), the proposal (p68) and the reference list (p76).
- `git merge-tree` against `author-rewrite`: paper/main.tex merges cleanly. Only the binary paper/main.pdf conflicts, as any two PDF rebuilds do; resolve by rebuilding after the merge.
- Committed scope: paper/main.tex, practitioner-proposal.tex, reproducibility-details.tex, refs.bib, README.md, ieee/main.tex, ieee/refs.bib and both PDFs. No attribution trailers. Generated fragments and evaluation files are untouched.
