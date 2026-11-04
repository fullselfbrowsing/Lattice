---
type: quick
id: 261104-i6a
date: 2026-11-04
status: complete
implementation_commit: 419d94c
---

# C4 evaluation consolidation

**C4 evidence and presentation consolidation complete; author review and A6 clearance pending.** Implemented the approved plan on `cursor/review-fixes-eval-708c`. C5 was not started. This completion refers to the technical/editorial task, not author acceptance or submission clearance.

## Delivered

- Condensed the main Evaluation to pages 17–23. Three generated tables distinguish threats/controls, hosted timing distributions and answer-quality outcomes. The requirement map and C2 results remain main tables.
- Separated controlled signed-minus-unsigned medians and verification timings from hosted HTTP and harness-inclusive residual time. Retained revisions, warmups, eligibility, percentile variability, saved intervals and paid latency's 0/450 attempted cases. No new uncertainty estimate or acceptance threshold was invented.
- Made the historical 3,570-attack denominator's exclusion of 70 accepted repeat presentations explicit. Preserved intact controls, chain limitations, mixed verifier checks, dishonest-issuer limits and the matched signed-log comparator's parity with Lattice.
- Connected C2's 16 terminal signatures and 15 complete successful-output packages to DR1/DR2; preserved the separate 14/16 source-based rubric outcome, format failure and two-way correction. Distinguished format, usable output, judge coverage, correctness, source support and abstention; no generation-improvement or managerial-benefit claim.
- Moved detailed technical assessments, unchanged historical cohort reports and the unapproved practitioner protocol to appendices. A visible appendix TODO keeps Ai4Privacy permission/removal open; moving results does not authorize use.
- Added a [source/evidence map](../../../paper/research/C4-EVIDENCE-MAP.md), a separate [661-word AI-generated reference narrative](../../../paper/research/C4-REFERENCE-DRAFT.md), [presentation generator](../../../paper/scripts/c4-tables.mjs) and [generated input-hash manifest](../../../paper/c4-evidence.json). The reference narrative is not a manuscript input. Updated the checklist, README and assistance declaration.

## Preservation and concurrent work

Initial baseline was `6bb0b1e`. The author-directed C2 correction pass committed `41ddfc6` and `e8d2e79` during this work. Its interpretation, source-audit annotation and generated result table changed relative to the initial snapshot and were deliberately preserved. All 580 protected files match the post-correction `e8d2e79` baseline. The C2 case/results sections and reviewed C3 Sections 3–4 are byte-identical to that baseline. C4 changed no runtime, provider API, frozen prompt, label, run, score, historical generator or original generated report fragment.

## Validation

- `node paper/scripts/c4-tables.mjs --check`: passed; 12 saved inputs, six latency rows, four citation rows, signed-log parity verified. Saved latency p50/p95 and eligible counts cross-checked against raw rows; existing bootstrap intervals reused.
- Disposable presentation fixtures: clean reproduction passed; stale presentation, changed saved median and inconsistent signed-log summary were rejected. These checked the new presentation code, not model/runtime performance.
- Existing C2 table checks: actual-record strict 14/16, complete packages 15/16; historical synthetic strict 28/32, evidence 32/32, four missing references and 18 controls preserved.
- `make -C paper tectonic`: passed. Final PDF: 69 pages, zero undefined citations/references, zero overfull boxes, seven underfull warnings. `git diff --check` passed.
- Rendered and visually inspected the main evaluation tables, affected transitions, declaration and appendix entrances/proposal (pages 16–23, 26–27, 35, 40 and 63). Tables fit and remain readable. Detailed history makes the full PDF longer despite the compact main evaluation.
- Local QA record and screenshots: `.context/jitcar-c4/`. Final PDF SHA-256: `cd0dfbdd48f7337bd486252c79e224e9735d6891eb44c099f0589e543baeb482`.
- No inference, paid spend, new empirical experiments, external messages, push or submission.

## Author handoff

Review the revised evaluation and rewrite/verify the separate reference narrative. Original C4 authorship and this Codex session's model/version remain unconfirmed. Keep A1/P5 authorship, content verification and tool-term decisions open, alongside the existing C2/C3 review items. Resolve Ai4Privacy A6 and venue appendix/supplement requirements A7 before submission. Practitioner usefulness remains future work; institutional and author decisions precede recruitment. C5 managerial implications is the next separate checklist task.
