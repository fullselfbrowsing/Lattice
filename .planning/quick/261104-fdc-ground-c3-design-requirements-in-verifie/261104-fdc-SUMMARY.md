---
type: quick
id: 261104-fdc
date: 2026-11-04
status: complete
implementation_commit: 10edb21
---

# C3 governance and evidence mapping

Implemented the approved C3 documentation pass inline on `cursor/review-fixes-eval-708c`. Planning commit: `39d1f65`; implementation: `10edb21`. Baseline `fd5c055` includes the newer C2 review and integrated narrative, which were preserved. No runtime/API changes, inference calls, new experiments, push or submission. C4 consolidation was not started.

## Delivered

- [Source map](../../../paper/research/C3-SOURCE-MAP.md): exact article/outcome locators, versions, retrieval dates, paraphrases, design interpretations, evidence links and limits. The Commission service desk identifies the 27 July 2026 consolidation; inaccessible EUR-Lex authentication is not claimed. Article 2/6/Annex III scope and classification are separate from Articles 12–14, 19 and 26 as conditional governance motivations. NIST AI RMF 1.0 is explicitly voluntary.
- Existing research-method, DR1–DR5 and DP1–DP4 text revised, retaining identifiers. DR2 now means verifiable retained evidence; DR5 means assessable operational/adoption costs. Signing requires configuration and successful minting. Key attribution, organizational authority, semantic correctness, privacy and retention are distinguished.
- Five-row traceability table after the principles (Table 3, PDF page 9), connecting organizational need, source, mechanism, assessment and limitation. Support is demonstrated within scope, partial or untested; it does not claim fulfillment of an entire legal provision or RMF outcome.
- DSRM/FEDS account explicitly describes retrospective analytical refinement and distinguishes controlled technical tests, live-model experiments, retrospective public-record review and the planned practitioner evaluation. No prospective registration, acceptance threshold or demonstrated managerial benefit is invented.
- Separate [611-word AI-generated reference draft](../../../paper/research/C3-REFERENCE-DRAFT.md) for author rewriting, excluded from manuscript inputs. Original C3 authorship and this drafting session's model/version remain unconfirmed. Bibliography, assistance declaration, checklist and paper README updated.
- Updated [63-page PDF](../../../paper/main.pdf). Existing C2 narrative, historical results and the separately disclosed two-way rubric audit remain intact: frozen and audited 14/16; the earlier one-sided 15/16 remains superseded.

## Validation

- Read the official article bodies for Articles 2, 6, 12, 13, 14, 19 and 26 plus Annex III, and the official January 2023 NIST PDF. Eight HTML snapshots and the PDF with SHA-256 fingerprints are retained privately in `.context/jitcar-c3/sources/manifest.json`. Source-to-design interpretation is explicit; no claim that the Act requires cryptographic receipts.
- Checked assessment statements against saved summaries/results and the relevant receipt, agent, verifier and materialization implementation. Current C2 evidence distinguishes 16 valid terminal signatures from 15 complete successful-output packages. Marker scans do not establish privacy, and historical latency does not establish adoption effort.
- All 549 protected tracked runtime/evaluation/generated-result files are byte-identical to the starting snapshot. Both C2 manuscript sections also match the baseline exactly. The reference draft is outside manuscript inputs and its local links resolve.
- Both presentation checks passed: `node paper/scripts/public-refund-tables.mjs --check` and `node paper/scripts/refund-tables.mjs --check`. These read saved results; they do not run inference or new experiments.
- `make -C paper tectonic` passed: 63 pages, no undefined references/citations, no final-pass overfull boxes, seven existing underfull warnings. Intermediate-pass overfull warnings disappear after reference convergence. Rendered and inspected pages 6–9, 14–18, 20, 44–49, 59 and 63. The final table render matches the inspected image. Validation details and images are under `.context/jitcar-c3/`.
- `git diff --check` passed. Current branch preserved.

## Handoff

**C3 evidence mapping and editorial revision complete; author narrative and review pending.** Authors must verify sources and statements, decide on original writing and complete the A1/P5 provenance, tool-term and declaration review. C2 technical review remains recorded, but author approval and its AI-first-draft issue are still open. C4 consolidation is the next separate task.
