---
type: quick
id: 261104-h3r
date: 2026-11-04
status: complete
---

# C3 reviewed: design-science sources, applicability and narrative

Claude (Claude Code, Claude Opus 5.5) reviewed C3 the same way as C2, at Lakshman's direction, working on top of the Codex C3 pass (`261104-fdc`). No inference, runtime/API change, new experiment, push or submission. C4 was not started. Full record: [C3-REVIEW.md](../../../paper/research/C3-REVIEW.md).

## Findings

- **Sources verified.** The Commission AI Act pages for Articles 2, 6, 12, 13, 14, 19, 26 and Annex III matched Codex's snapshots, and Articles 50 and 113 were added. The NIST AI 100-1 PDF matched by SHA-256. All eight RMF subcategories match their wording and printed pages (23, 26, 27, 29, 30 and 33), and "voluntary" appears on p. 2. All nine DSR references match Crossref.
- **Applicability corrected.** The consolidated text (27 July 2026) includes the Digital Omnibus on AI. Amended Art. 113(c) defers Chapter III Sections 1–3 to **2 Dec 2027** for Annex III systems and **2 Aug 2028** for Annex I systems, so none of the cited high-risk duties applies today. Codex's claim that "no implementation-date claim is needed" is withdrawn.
- **Scope sharpened.** Annex III 8(a) extends to alternative dispute resolution, which bears on the ombudsman and tribunal records in C2. Art. 50(1), AI-interaction disclosure, is the obligation already in force for a refund chatbot.
- **Claims checked.** DR4 (0/14 marker hits) and DR5 (0.214, 1.354 and 0.172 ms) match the saved results. The DP3 and DP4 mechanisms match the code and tests. One grammar slip in the Discussion was fixed.
- **Not verified.** The Omnibus regulation number (reported as 2026/1744) could not be checked because EUR-Lex blocks automated access, so it is not cited.

## Delivered

- Section 3 (about 370 words): the entry point, what a retrospective requirement refinement limits, and the FEDS classification of the three reported episodes.
- Section 4 (about 1,240 words): the three kinds of source; the Act's applicability, including timing, ADR scope and Art. 50(1); NIST as voluntary; a derivation from the C2 records; DR1–DR5 with explicit assessment criteria; DP1–DP4; and a closing paragraph that states the contribution beyond Lattice. Identifiers, labels, table evidence and both C2 sections are unchanged.
- Updated the Table 3 caption, the `euai2026text` bibliography entry and the declaration. Marked the Codex C3 draft superseded and annotated the source map. Updated the paper README, the checklist (C3 **reviewed**, A1 inventory, decision log) and STATE.

## Validation

- `make -C paper tectonic`: 64 pages, 0 overfull boxes, 0 undefined references, the 7 existing underfull warnings. Pages 6–11 rendered and inspected. The closing paragraph was moved ahead of Table 3 to avoid a near-empty page.
- Both table generators passed `--check`; `workflow.test.mjs` passed 3/3. Protected and frozen files are byte-identical (549, 510 and 23). The C2 section hashes are unchanged. `git diff --check` and the local links passed.

## Author handoff

**C3 reviewed.** Sections 3 and 4 now carry Claude-drafted narrative, including the paper's design argument. Taylor & Francis does not allow AI first drafts of manuscript sections, and says AI "cannot be used to create or conclude the argument of an article". The authors must decide under A1/P5. Optional: confirm the Omnibus regulation number on EUR-Lex, and choose a citation style for NIST. C4 is next.
