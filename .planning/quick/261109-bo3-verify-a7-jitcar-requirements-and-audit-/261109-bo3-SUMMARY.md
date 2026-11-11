---
type: quick-summary
id: 261109-bo3
date: 2026-11-09
status: complete
implementation_commit: 47a1497
---

# A7 public requirements and P2 identifier audit

Completed the authorized verification/reference-management pass inline under GSD. The current branch was preserved. No inference, experiments, runtime/API changes, manuscript narrative drafting, author-rewrite edits, external messages or submission actions occurred.

## Results

- Read the official JITCAR author instructions and current special-issue call through Safari after automated access returned HTTP 403 and the FSB connector had no attached extension. Research Article: 200-word unstructured abstract, no numerical word/page limit stated, single-anonymous review, format-free initial layout, appropriate appendices and PDF plus LaTeX source zip/`.bib`. The call explicitly accepts experiments and other methods. DOI display is recommended, not mandatory. Journal AI instructions link the publisher guidance; no additional language-only restriction was found, and the first-draft restriction remains applicable.
- Reconfirmed November 15 deadline without closing time/time zone, and no standard submission/publication/page fees. Optional open access and print color remain separate choices. Preserved the concurrently approved funding wording; no cost commitment made.
- Portal reached a JITCAR login screen. No credentials entered, account created, manuscript started or files uploaded. Exact special-issue label and final portal selections remain A7/P6 work for an authenticated author.
- Audited 85 bibliography entries and all 58 existing DOI records. Added three verified DOIs: ALCE, Agent Flight Recorder and NovaFabric. NovaFabric's pending-registration label conflicts with its findable DataCite record and successful DOI redirect; recorded both observations. Retained preprint versions and reported BCCA acceptance without inventing proceedings details.
- Corrected ALCE proceedings/pages, Sculley pages and Gretel author attribution. Documented the Gretel citation-card title discrepancy, spaCy concept-DOI/preferred-citation distinction, unknown consulted documentation versions, and online-first/issue-year differences. No citation keys changed.
- Active inputs cite 82 entries; three unused source entries remain documented for final P6 reconciliation. No duplicate key/DOI or missing active citation key. No new citations or argument inserted.

Deliverables: `paper/research/A7-SUBMISSION-REQUIREMENTS.md`, `P2-REFERENCE-AUDIT.md`, `P2-REFERENCE-AUDIT.json`, corrected `paper/refs.bib`, updated `paper/main.pdf`, README and checklist/provenance updates.

## Validation

- `make -C paper tectonic`: pass; 77 pages, zero undefined citations/references, zero overfull boxes, seven existing underfull warnings plus the existing inputenc/engine notice.
- Rendered and visually inspected pages 27–30, 46, 53 and 71–77: readable references, source URLs, page transitions and table caption; no clipping or overlap. Native DOI fields are omitted by `apalike`; this is explicitly documented and acceptable under the public format-free rule. Verified fields stay in the required `.bib`.
- All **622 protected files** match the starting hash manifest. Generated numerical fragments, frozen evaluations, C2–C8 evidence, Ai4Privacy documentation, runtime/API sources and separate IEEE files remain unchanged.
- Starting baseline was `3a4722e`. During this task, funding task commits `810181e` and `944a2e3` landed. They are preserved. `paper/main.tex` is byte-for-byte equal to `944a2e3:paper/main.tex`; its sole change from the original task snapshot is the other task's author-supplied funding sentence.
- Relative to the funded review PDF at `944a2e3`, changed PDF pages are 27, 46, 53 and 71–77. Body/caption differences are the corrected Gretel author-year citation and wrapping; reference pages reflect bibliography changes. No evaluation value changed.
- `git diff --check`, local documentation-link checks, citation-key/DOI uniqueness checks and audit JSON checks pass. Private retrieval records, snapshots, hashes, render PNGs and validation JSON are under `.context/jitcar-a7-p2/` and are not in the submission source package.

## Handoff

**A7 public requirements verified; authenticated portal selection and final conformity pending. P2 identifier audit complete; author/source review and post-rewrite reconciliation pending.** The abstract is currently 170 prose words versus the page's 200-word wording; authors finalize it. Keep the blank-page rewrite, both-author approval, venue/title acceptance, source-reading gaps, declarations/ethics, reproducibility deposit and final packaging open. Initial format-free permission does not certify acceptance or resolve authorship.

Codex assistance comprised administrative source reading, reference metadata/identifier verification, corrections and build/layout checks. Exact session model/version is unconfirmed. A1/P5 records this assistance without asserting author verification or checked tool terms.
