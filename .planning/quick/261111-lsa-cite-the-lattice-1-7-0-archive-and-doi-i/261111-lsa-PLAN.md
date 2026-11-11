---
phase: quick-261111-lsa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - paper/main.tex
  - paper/refs.bib
  - paper/reproducibility-details.tex
  - paper/ieee/main.tex
  - paper/ieee/refs.bib
  - paper/README.md
  - paper/practitioner-proposal.tex
  - paper/JITCAR-TODO.md
  - paper/main.pdf
  - paper/ieee/main.pdf
autonomous: true
requirements: [QUICK-261111-LSA]
must_haves:
  truths:
    - "Paper cites Lattice 1.7.0 archive and DOI 10.5281/zenodo.24145363 in both manuscripts"
    - "Requirements chronology, AI Act source and proposal scope wording corrected"
    - "Both PDFs rebuild with no undefined refs/citations and no overfull boxes"
  artifacts:
    - path: "paper/main.pdf"
    - path: "paper/ieee/main.pdf"
  key_links: []
---

<objective>
Apply the approved plan at /Users/lakshman/.claude/plans/please-proceed-with-these-merry-magpie.md verbatim (it is the source of truth; every replacement string below is copied from it). Fact and wording corrections only, per paper/research/AUTHOR-REWRITE.md rule 5.

Branch: paper/release-doi-and-wording (from origin/main at 87f7bb9). Line numbers refer to that commit.

Constraints:
- NO Co-Authored-By or AI/tool attribution lines in commit messages (user rule, overrides any default).
- Do NOT touch the generated `% bench-platform:begin/end` block in paper/ieee/main.tex; insert the new paragraph after `% bench-platform:end`.
- Do not edit any other file than those listed. Do not push. Do not merge.
- Use the Edit tool for file changes, not heredocs.
</objective>

<context>
@/Users/lakshman/.claude/plans/please-proceed-with-these-merry-magpie.md
@./AGENTS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Cite the archived 1.7.0 release and DOI (edits 1-4, README part of 8)</name>
  <files>paper/main.tex, paper/refs.bib, paper/ieee/refs.bib, paper/reproducibility-details.tex, paper/ieee/main.tex, paper/README.md</files>
  <action>
Read each target region first, then edit.

Edit 1, paper/main.tex line ~496 (data and code availability): keep the sentence up to the GitHub URL; replace the tail and the `\todo{...}` so it reads:
`... are available at \url{https://github.com/fullselfbrowsing/Lattice} and are archived on Zenodo as Lattice 1.7.0 (tag \code{v1.7.0}, commit \code{87f7bb9}), \url{https://doi.org/10.5281/zenodo.24145363} \citep{lattice}. Reported measurements identify the revisions at which they ran, all of which precede this release (Appendix~\ref{app:software-baseline}).`
Confirm the label `app:software-baseline` exists (grep); if it does not, report it rather than inventing one.

Edit 2, the `lattice` entry in BOTH paper/refs.bib and paper/ieee/refs.bib: keep author and title. Set `howpublished = {Version 1.7.0, Zenodo}`, add `version = {1.7.0}` and `doi = {10.5281/zenodo.24145363}`, and set
`note = {\url{https://doi.org/10.5281/zenodo.24145363}. Source repository: \url{https://github.com/fullselfbrowsing/Lattice}}`.
(apalike and IEEEtran do not print doi/version, hence the DOI in note.)

Edit 3, paper/reproducibility-details.tex line 4: replace the paragraph with:
`The implementation description refers to Lattice 1.7.0, released on 11 November 2026 as tag \texttt{v1.7.0} (commit \texttt{87f7bb9}), published to npm as \code{@full-self-browsing/lattice} and \code{@full-self-browsing/lattice-cli}, and archived on Zenodo \citep{lattice}. The description was checked against commit \texttt{73a47cf} on 5 November 2026 rather than through a new measurement run; between that commit and the release, the packages changed only in error-message detail and OpenAI base-URL handling, with accompanying tests, documentation and version metadata, and their dependencies are unchanged. Both packages declare Node.js $\geq 24$; the workspace declares pnpm 10.33.1. These are manifest requirements, not the environments of every experiment. Dependency versions are recorded in \code{package.json}, the package manifests, \code{pnpm-workspace.yaml} and \code{pnpm-lock.yaml} at the release commit. A package version alone does not identify the source revision tested: revisions after the 1.6.0 release whose manifests still read 1.6.0 are not the published 1.6.0 packages.`

Edit 4, paper/ieee/main.tex: insert a new paragraph (blank line before it) directly after the line `% bench-platform:end` (~line 1219), leaving the generated block unchanged:
`Commit \code{4549334} precedes the 1.7.0 release; its package manifests still read 1.6.0, and its library code is not the published 1.6.0 package. The code, harness and result files are archived as Lattice 1.7.0 (tag \code{v1.7.0}, commit \code{87f7bb9}), \url{https://doi.org/10.5281/zenodo.24145363} \cite{lattice}.`
Check that `\code` is defined in the IEEE preamble; if not, report it.

Edit 8 (README part), paper/README.md line ~90: "source baseline `73a47cf`" becomes "the archived release (Lattice 1.7.0, `87f7bb9`, DOI 10.5281/zenodo.24145363), the `73a47cf` source check, and the experimentally measured revisions".

Then commit only these six files (git add explicit paths) with message exactly:
`docs(paper): cite the archived Lattice 1.7.0 release and DOI`
No trailer lines.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/columbia && ! grep -n "todo{[^}]*archive" paper/main.tex && grep -c "10.5281/zenodo.24145363" paper/main.tex paper/refs.bib paper/ieee/refs.bib paper/ieee/main.tex paper/README.md && grep -n "Lattice 1.7.0, released on 11 November 2026" paper/reproducibility-details.tex && ! grep -n "source baseline .73a47cf" paper/README.md && sed -n '/bench-platform:end/,+3p' paper/ieee/main.tex | grep -q "4549334" && git log -1 --format=%B | grep -v "^$" | grep -ci "co-authored"; test $? -ne 0 || true</automated>
  </verify>
  <done>Old TODO/1.6.0 baseline strings gone, new strings present in all six files, bench-platform block unchanged (git diff shows only additions after the end marker), one commit made with the specified message and no attribution.</done>
</task>

<task type="auto">
  <name>Task 2: Align chronology, AI Act source and proposal scope (edits 5, 6, 7)</name>
  <files>paper/main.tex, paper/practitioner-proposal.tex</files>
  <action>
Edit 5, paper/main.tex (chronology, mirroring "refined retrospectively" at line ~200):
- Abstract line ~113: replace `develops five requirements and four principles for verifiable run-level evidence and instantiates them in Lattice, an open-source runtime.` with `refines five requirements and four principles for verifiable run-level evidence retrospectively and examines their instantiation in Lattice, an existing open-source runtime.`
- Introduction line ~130: replace `We derive requirements from governance and auditing literature, formulate design principles, and instantiate them in Lattice, an open-source runtime \citep{lattice}.` with `We refine requirements retrospectively against governance and auditing literature, formulate design principles, and examine how Lattice, an existing open-source runtime \citep{lattice}, instantiates them.`
- Conclusion line ~482: replace `It develops five design requirements and four principles and instantiates them in Lattice.` with `It refines five design requirements and four principles retrospectively and examines their instantiation in Lattice.`

Edit 6, paper/main.tex line ~128: replace the ending `... for high-risk AI systems \citep{euaiact2024}.` with `... for high-risk AI systems \citep{euaiact2024}; Section~\ref{sec:requirements} cites the Commission's consolidated text as at 27 July 2026, which incorporates the Digital Omnibus amendments \citep{euai2026text}.` Confirm `sec:requirements` label and `euai2026text` bib key exist (grep); report if not.

Edit 7, paper/practitioner-proposal.tex line 3: replace `The artificial evaluation establishes technical efficacy but not utility for the people who must act on the evidence.` with `The artificial evaluation provides technical evidence on integrity, retained evidence, execution controls, minimized disclosure and cost (DR1--DR5) but not on utility for the people who must act on the evidence.` Keep the `\todo` on that line.

Commit only these two files with message exactly:
`docs(paper): align requirements chronology, AI Act source and proposal scope`
No trailer lines.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/columbia && ! grep -n "develops five requirements\|We derive requirements from governance\|It develops five design requirements" paper/main.tex && grep -c "refines five requirements and four principles for verifiable run-level evidence retrospectively\|We refine requirements retrospectively\|It refines five design requirements" paper/main.tex && grep -n "euai2026text" paper/main.tex && ! grep -n "establishes technical efficacy" paper/practitioner-proposal.tex && grep -n "DR1--DR5" paper/practitioner-proposal.tex</automated>
  </verify>
  <done>All old phrases absent, all new phrases present, \todo on proposal line preserved, commit made with specified message and no attribution.</done>
</task>

<task type="auto">
  <name>Task 3: Rebuild both PDFs, verify, and update JITCAR-TODO (uncommitted)</name>
  <files>paper/main.pdf, paper/ieee/main.pdf, paper/JITCAR-TODO.md</files>
  <action>
Edit 8 (JITCAR-TODO part), paper/JITCAR-TODO.md: check off P4 items 342-346, each with evidence: release `v1.7.0`; archive inventory clean (no credentials, no Ai4Privacy rows, no third-party documents); DOI findable at DataCite; single-anonymous review; availability statement updated. Annotate P3 line 333: the archive-DOI TODO is resolved, three remain. Leave this file UNCOMMITTED (the orchestrator commits it with the GSD records).

Build: run `make -C paper tectonic` (fails on undefined refs/citations), then `cd paper/ieee && tectonic -X compile main.tex --keep-logs`. Run with stdin from /dev/null if a build hangs. Fix nothing outside the listed files; if a build error traces to an edit, correct the edit minimally and amend the relevant earlier commit only if unavoidable (otherwise add a fixup note in the final report).

Run all verification checks below. Then commit only paper/main.pdf and paper/ieee/main.pdf (explicit git add) with message exactly:
`docs(paper): rebuild both manuscripts`
No trailer lines. Do not push.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/columbia && make -C paper tectonic </dev/null && (cd paper/ieee && tectonic -X compile main.tex --keep-logs </dev/null && ! grep -nE "undefined|Citation" main.log) && echo "overfull main: $(grep -c Overfull paper/main.log)" && echo "overfull ieee: $(grep -c Overfull paper/ieee/main.log)" && echo "TODO main (expect 3): $(pdftotext paper/main.pdf - | grep -o '\[TODO:' | wc -l)" && echo "TODO ieee (expect 0): $(pdftotext paper/ieee/main.pdf - | grep -o '\[TODO:' | wc -l)" && pdftotext paper/main.pdf - | grep -c "10.5281/zenodo.24145363" && pdftotext paper/ieee/main.pdf - | grep -c "10.5281/zenodo.24145363" && git status --short</automated>
  </verify>
  <done>Both builds succeed with no undefined references/citations; overfull counts 0 in both logs; main.pdf has exactly 3 [TODO: markers and ieee/main.pdf 0; the DOI string appears in each PDF; abstract prose-word count is 173 or fewer (count words of the rendered abstract via pdftotext and report the number); git status --short shows only paper/JITCAR-TODO.md as modified/uncommitted after the PDF commit (LaTeX byproducts are gitignored); PDF commit made with the specified message and no attribution; nothing pushed.</done>
</task>

</tasks>

<success_criteria>
Three commits on paper/release-doi-and-wording with the exact messages above, no attribution lines, only intended files changed, JITCAR-TODO.md left uncommitted, and all Task 3 checks passing.
</success_criteria>

<output>
Create `.planning/quick/261111-lsa-cite-the-lattice-1-7-0-archive-and-doi-i/261111-lsa-SUMMARY.md` when done.
</output>
