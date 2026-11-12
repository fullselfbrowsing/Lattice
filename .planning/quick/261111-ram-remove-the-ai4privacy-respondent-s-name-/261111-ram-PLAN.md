---
phase: quick-261111-ram
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - paper/README.md
  - paper/JITCAR-TODO.md
  - paper/research/AI4PRIVACY-PERMISSION.md
  - paper/research/C4-EVIDENCE-MAP.md
  - eval/realworld/README.md
  - .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-PLAN.md
  - .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-SUMMARY.md
autonomous: true
requirements: []
must_haves:
  truths:
    - "No tracked file other than .planning/STATE.md names the Ai4Privacy respondent"
    - "The quoted sentence of the private email no longer appears in the repository"
    - "The fact of the October 22 academic-use confirmation is still recorded"
    - "Manuscripts and PDFs are unchanged"
  artifacts:
    - path: "paper/research/AI4PRIVACY-PERMISSION.md"
      provides: "Permission record without name or quote"
---

<objective>
Remove the Ai4Privacy respondent's name and the direct quote from repository notes, keeping the fact of the confirmation (author decision, Nov 11).

Out of scope: git history, the frozen Zenodo v1.7.0 archive, paper/main.tex, paper/ieee/main.tex, both PDFs, .planning/STATE.md (the orchestrator edits it), and .context/. Do not rewrite history, do not push.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply replacements R1-R12 and commit</name>
  <files>paper/README.md, paper/JITCAR-TODO.md, paper/research/AI4PRIVACY-PERMISSION.md, paper/research/C4-EVIDENCE-MAP.md, eval/realworld/README.md, .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-PLAN.md, .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-SUMMARY.md</files>
  <action>
Use the Edit tool (exact string replace; each OLD string occurs exactly once in its file). Copy strings verbatim, including the curly quotes in R3's OLD. Each OLD/NEW below is delimited by angle brackets that are NOT part of the string.

R1 paper/README.md
OLD: <[respondent's name]'s October 22 academic-use confirmation is documented in the [permission record](research/AI4PRIVACY-PERMISSION.md)>
NEW: <Ai4Privacy's October 22 academic-use confirmation is documented in the [permission record](research/AI4PRIVACY-PERMISSION.md)>

R2 paper/JITCAR-TODO.md
OLD: <**A6 is documented: [respondent's name]'s October 22 academic-use confirmation matches the current detector evaluation;>
NEW: <**A6 is documented: Ai4Privacy's October 22 academic-use confirmation matches the current detector evaluation;>

R3 paper/JITCAR-TODO.md
OLD: <**Written confirmation:** [respondent's name] replied on October 22 that “[quoted fragment]”>
NEW: <**Written confirmation:** Ai4Privacy confirmed by email on October 22 that the described evaluation falls within its academic terms.>

R4 paper/JITCAR-TODO.md
OLD: <See the [permission record](research/AI4PRIVACY-PERMISSION.md) for the exact wording, date provenance and evidence links.>
NEW: <See the [permission record](research/AI4PRIVACY-PERMISSION.md) for date provenance and evidence links.>

R5 paper/JITCAR-TODO.md
OLD: <- [x] Obtain academic-use confirmation: [respondent's name]'s October 22 reply, supplied by Lakshman Nov 4.>
NEW: <- [x] Obtain academic-use confirmation: Ai4Privacy's October 22 email reply, supplied by Lakshman Nov 4.>

R6 paper/JITCAR-TODO.md (checklist item near line 343; two edits on the same line)
OLD: <- [ ] Inventory distributable source, scripts, aggregate results,>
NEW: <- [x] Inventory distributable source, scripts, aggregate results,>
and
OLD: <Open: the archived `paper/research/AI4PRIVACY-PERMISSION.md` names the respondent and quotes one sentence of the October 22 reply, so the authors must decide whether that record may stay public.>
NEW: <Resolved Nov 11: the authors removed the respondent's name and the quoted reply from the repository; the frozen `v1.7.0` archive and git history keep the earlier record.>

R7 paper/research/AI4PRIVACY-PERMISSION.md
OLD: <- **Respondent:** [respondent's name], October 22, 12:48 PM, replying to Lakshman and licensing. No job title or additional authority is inferred.>
NEW: <- **Respondent:** an Ai4Privacy representative, October 22, 12:48 PM, replying to Lakshman and licensing. The respondent's name is kept with the private transcript; no job title or additional authority is inferred.>

R8 paper/research/AI4PRIVACY-PERMISSION.md (multi-line, around lines 12-16)
OLD, as consecutive lines: the line "The operative reply is:", a blank line, the line "> [quoted reply]", a blank line, then the line "This confirms the described use under academic terms. It does not replace" (the latter ends the OLD string at "replace"; keep whatever follows on that line/next lines untouched).
NEW: a single line "The operative reply, kept with the private transcript, confirms that the described evaluation use falls within Ai4Privacy's academic terms. It does not replace" (the subsequent text continues from there unchanged).
Preserve the blank line before the original "The operative reply is:" paragraph. After editing, reflow nothing else.

R9 paper/research/C4-EVIDENCE-MAP.md
OLD: <**Superseded (Nov 5):** [respondent's name]'s October 22 written academic-use confirmation>
NEW: <**Superseded (Nov 5):** Ai4Privacy's October 22 written academic-use confirmation>

R10 eval/realworld/README.md
OLD: <  [respondent's name] confirmed that the described English-validation detector>
NEW: <  Ai4Privacy confirmed that the described English-validation detector>

R11 .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-PLAN.md
OLD: <[respondent's name]'s October 22 reply confirms that the described evaluation use>
NEW: <Ai4Privacy's October 22 reply confirms that the described evaluation use>

R12 .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-SUMMARY.md
OLD: <Recorded [respondent's name]'s October 22 reply that the described evaluation>
NEW: <Recorded Ai4Privacy's October 22 reply that the described evaluation>

Do not edit .planning/STATE.md, manuscripts, PDFs, or .context/. Then stage exactly the seven files listed in <files> with git add (by path) and commit with this message and nothing else (no Co-Authored-By, no AI/tool attribution lines, per user rule): docs(paper): remove the Ai4Privacy contact's name and quoted reply from repository notes
Do not push. Do not amend or rewrite history.
  </action>
  <verify>
    <automated>cd /Users/lakshman/conductor/workspaces/lattice/columbia && test -z "$(git grep -n "[respondent's name]" -- . ':!.planning/STATE.md' ':!.planning/quick/261111-*')" && test -z "$(git grep -n "[quote term]" -- . ':!.planning/quick/261111-*')" && test -z "$(git grep -n "[quote term]" -- . ':!.planning/quick/261111-*')" && test "$(git diff --name-only HEAD~1 | sort | tr '\n' ' ')" = "$(printf '%s\n' paper/README.md paper/JITCAR-TODO.md paper/research/AI4PRIVACY-PERMISSION.md paper/research/C4-EVIDENCE-MAP.md eval/realworld/README.md .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-PLAN.md .planning/quick/261104-j8m-document-ai4privacy-october-22-written-c/261104-j8m-SUMMARY.md | sort | tr '\n' ' ')" && test -z "$(git diff --name-only HEAD~1 -- paper/main.tex paper/ieee/main.tex '*.pdf')" && git log -1 --format=%B | grep -ci "co-authored" | grep -qx 0</automated>
    The 261111-* pathspec exclusion is needed only because this plan file itself quotes the old strings. Run the verify immediately after the commit, before any docs commit is made on top.
  </verify>
  <done>
Greps for the name (excluding STATE.md), "[quote term]" and "[quote term]" return nothing; the commit touches exactly the seven listed files; main.tex, ieee/main.tex and PDFs are unchanged; commit message has no attribution lines; nothing pushed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repo to public | Notes in the public repository may expose a third party's name and private email text |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261111-01 | I | Notes naming respondent / quoting email | mitigate | Replacements R1-R12 remove name and quote; grep gates confirm |
| T-261111-02 | I | Git history and Zenodo v1.7.0 | accept | Out of scope by author decision; no history rewriting |
</threat_model>

<verification>
Verify command in Task 1 passes after the commit.
</verification>

<success_criteria>
Name and quote removed from all seven files, confirmation fact retained, single clean commit, manuscripts untouched.
</success_criteria>

<output>
Create `.planning/quick/261111-ram-remove-the-ai4privacy-respondent-s-name-/261111-ram-SUMMARY.md` when done
</output>
