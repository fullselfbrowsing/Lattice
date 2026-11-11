# C3 review: design-science sources, claims and narrative

Date: November 4, 2026. GSD quick task: `261104-h3r`. Baseline: Codex C3 pass `261104-fdc` (implementation `10edb21`). Reviewer: Claude (Claude Code, Claude Opus 5.5), at Lakshman Turlapati's direction. This is an AI review; it does not replace the authors' own confirmation under A1/P5.

**Outcome.** Every cited Act provision, NIST AI RMF outcome and design-science reference checks out against its primary source. Codex's mapping is sound, but it omitted three points that change how the governance motivation should read:

1. **The Act's high-risk duties are not yet in force.** The Commission's consolidated text includes the Digital Omnibus on AI. Its amended Article 113(c) defers Articles 6–27 (including 12, 13, 14, 19 and 26) to 2 December 2027 for Annex III systems and to 2 August 2028 for Annex I systems. Codex's source map stated that "no implementation-date claim is needed".
2. **Annex III point 8(a) covers alternative dispute resolution.** It is not limited to courts. This matters because two of the C2 records come from an ombudsman and a tribunal.
3. **Article 50(1) is the obligation that applies to a refund chatbot today.** It requires telling people they are interacting with an AI system; it does not require logging.

Claude rewrote the Section 3 and Section 4 narrative, kept the identifiers and the evidence they cite, and added the applicability framing and a closing statement of the contribution. **C3 is marked reviewed**, subject to the publisher-policy issue in section 6.

## 1. Source validation

| Source | Check (Nov 4) | Result |
| --- | --- | --- |
| Commission AI Act Service Desk, Articles 2, 6, 12, 13, 14, 19, 26 and Annex III | Re-fetched (HTTP 200) and compared with Codex's retained snapshots | All 8 pages byte-identical in size to the snapshots. Each reproduces the "EUR-Lex consolidated version of the AI Act as at 27 July 2026", with **NEW/AMENDED markers for Digital Omnibus changes**. |
| Same site, Articles 50 and 113 (added) | Fetched and read | Art. 113(c), **AMENDED**: Chapter III Sections 1–3 apply from **2 Dec 2027** (Art. 6(2)/Annex III) and **2 Aug 2028** (Art. 6(1)/Annex I). Art. 50(1) is unamended and falls under the general application date of 2 Aug 2026. |
| Digital Omnibus regulation number | EUR-Lex returned an empty JavaScript challenge (HTTP 202) | Secondary sources report **Regulation (EU) 2026/1744**, published in the OJ on July 24, 2026 and in force July 27, 2026. This is **not verified against EUR-Lex**, so the manuscript cites the Commission's consolidated text and does not give the number. |
| NIST AI 100-1 (AI RMF 1.0) | Re-downloaded | SHA-256 `7576edb5…` matches Codex's snapshot. The wording and printed page of all eight subcategories are verified: GOVERN 2.1 and 3.2 (p. 23), MAP 2.2 (p. 26), MAP 3.2 (p. 27), MEASURE 2.1 (p. 29), MEASURE 2.8 and 2.10 (p. 30), MANAGE 4.1 (p. 33). "Voluntary, rights-preserving…" is on p. 2. |
| Nine DSR method references (Peffers 2007; Venable 2016; Hevner 2004; Gregor & Hevner 2013; Gregor & Jones 2007; vom Brocke 2020; Walls 1992; Prat 2015; Sonnenberg 2012) | Crossref API | DOI, year, volume, issue, pages and authors all match `refs.bib`. |

The text of the provisions was checked paragraph by paragraph. Art. 12(1)–(2)(a)–(c) and 12(3), which is biometric-only, match. So do Art. 13(3)(d) (oversight measures) and 13(3)(f) (mechanisms to collect, store and interpret logs), Art. 14(4)(d) (disregard, override or reverse), Art. 19(1) (provider log retention, at least six months, under the provider's control), Art. 26(2) (oversight by persons with competence, training and authority) and Art. 26(6) (deployer log retention, at least six months), as well as Annex III 5(b), 5(c) and 8(a). Articles 12, 13, 14, 19 and 26 and Annex III carry no Omnibus amendments. Article 6 gained paragraphs 1a–1c, which concern safety components and do not affect Annex III, and Article 2 gained paragraph 13 plus amendments to 2(2) and 2(7).

## 2. Claims checked

| Claim (manuscript or source map) | Verdict |
| --- | --- |
| Arts. 12–14, 19 and 26 concern high-risk systems only; classification depends on Art. 6 and Annex III | Confirmed |
| A refund-review task is not automatically high-risk | Confirmed. Refund handling is not a listed use. **Added:** Annex III 8(a) extends to "alternative dispute resolution", so the same kind of review used *by* an ombudsman or tribunal to interpret facts could be high-risk if in scope. |
| "No implementation-date claim is needed" (Codex source map) | **Corrected.** None of these duties applies today. The manuscript now says so and gives the dates. |
| The Act does not prescribe signatures, hashes or routing | Confirmed; there is no such provision in the articles read. |
| NIST AI RMF is voluntary; the subcategory meanings are as mapped | Confirmed (section 1) |
| DSRM allows multiple entry points; FEDS has formative/summative purposes and artificial/naturalistic settings, with a Technical Risk & Efficacy strategy | Consistent with the cited works. The new text says the project entered at design and development; receipt code (May 11, 2026, `fa6d5a1`) predates the paper's requirements. |
| DR4 evidence: 0/14 signed-byte marker hits | `eval/results/SUMMARY.md` line 30 |
| DR5 evidence: signing p50 delta 0.214 ms (1 KB), 1.354 ms (1 MB); verify p50 0.172 ms; 1,000 trials | `eval/results/SUMMARY.md` line 13 |
| DP4: redact → canonicalize → sign; verify before the artifact loader | `receipts/receipt.ts` (lines 83–90), `replay/materialize.ts` (lines 110–120) |
| DP3: an output-contract violation is terminal, with no fallback retry | `runtime/create-ai.test.ts` T1/T2 |
| C2 cross-references (two-way audit 14/16; 16 signatures and 15 complete packages) | Consistent with the C2 review |
| Discussion: "…and onto the documented controls…" | Grammar fixed ("and to") |

## 3. Narrative rewrite and integration

The Codex reference draft is superseded. Claude's text is integrated as follows:

- **Section 3, Research Approach** (about 370 words, plus the unchanged DSRM table). It names the entry point honestly (design and development), explains why a retrospective requirement refinement limits what evaluation can confirm, and classifies the three reported episodes under FEDS. The public-record review is described as a demonstration with technical evaluation, not a naturalistic episode.
- **Section 4, Design Requirements and Principles** (about 1,240 words, plus the traceability table). It covers the three kinds of source; the Act's applicability (high-risk only, Annex III 8(a) and ADR, the 2 December 2027 date, and Art. 50(1) as the obligation in force today); NIST as voluntary; and a derivation paragraph linking the C2 records to the five questions the requirements answer. DR1–DR5 are rewritten with explicit *Assessment* criteria and limits, and DP1–DP4 are rewritten with the same mechanisms. A closing paragraph states the contribution apart from Lattice: the requirements and tests are runtime-independent, the boundaries are explicit, DR1 is demonstrated within scope and DR2–DR5 are partial.
- **Table 3 caption** now reports the Omnibus consolidation and the application date. The `euai2026text` bibliography entry now lists Articles 50 and 113 and the Omnibus note.
- **Declaration**: one sentence discloses Claude's re-verification and redrafting of Sections 3 and 4.

All identifiers (DR1–DR5, DP1–DP4), labels, table contents, evidence links and both C2 sections are preserved; the C2 section hashes are unchanged.

## 4. Verification

- `make -C paper tectonic`: 64 pages, 0 overfull boxes, 0 undefined references, the 7 existing underfull warnings. Pages 6–11 rendered and inspected. The closing paragraph was moved ahead of Table 3 to avoid a near-empty page.
- `public-refund-tables.mjs --check` and `refund-tables.mjs --check` passed; `workflow.test.mjs` passed 3/3.
- 549/549 (C3 baseline), 510/510 and 23/23 protected or frozen files are byte-identical. `git diff --check` passed.

## 5. Recommendations for authors (not applied)

- In-text citations of NIST render as "Tabassi, 2023" because the DOI metadata lists Elham Tabassi as author. Many IS papers cite "NIST (2023)". This is a style decision for the authors.
- If you want the amending regulation number in the bibliography, confirm "Regulation (EU) 2026/1744" on EUR-Lex in a browser first.
- The Introduction (C1) mentions Article 12 accurately, without implying it currently applies. No change was made there.

## 6. Publisher policy: author decision required

The Taylor & Francis [AI guidance](https://authorservices.taylorandfrancis.com/editorial-policies/using-ai-in-your-research-and-manuscript-preparations/) states: "No – Taylor & Francis does not allow generative AI to create a first draft of a manuscript or sections of a manuscript." The same page also says generative AI "cannot be used to create or conclude the argument of an article." Sections 3 and 4 carry the paper's design-science argument. Their present narrative was drafted by Claude, at Lakshman's request, on top of a Codex revision of text whose original authorship is unconfirmed. The declaration discloses this, but disclosure does not satisfy the restriction. Before submission, the authors should write these passages themselves, using this record and the source map, or obtain the editors' explicit agreement (A1/P5).

**Correction (Nov 6, quick task `261106-2fh`):** do not rely on the editor-agreement option above. The Taylor & Francis guidance and its [main AI policy](https://taylorandfrancis.com/our-policies/ai-policy/) describe no exception route for article authors; the only approval route they describe is for book authors. The authors should write these passages themselves. See the [rewrite guide](AUTHOR-REWRITE.md).
