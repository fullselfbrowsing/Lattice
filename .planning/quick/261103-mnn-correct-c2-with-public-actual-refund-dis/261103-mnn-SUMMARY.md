---
type: quick
id: 261103-mnn
date: 2026-11-03
status: complete
measured_commit: 3330ca2
frozen_results_commit: efefcf2
implementation_commit: 54e947f
---

# C2 corrected to actual public refund-dispute records

Completed the user's correction on `cursor/review-fixes-eval-708c`. The user explicitly selected public records of actual disputes. The main case now uses real published decisions and actual source-page inputs; the previous invented scenario is a separate appendix. No runtime/API changes, company deployment, real approval/payment execution, push or correspondence occurred. C2 as a whole remains open for author narrative/source/rubric review; C3 was not started.

## Delivered

- Four primary decisions: Moffatt v. Air Canada (2024 BCCRT 149), FOS DRN-4377241, DRN-4148727 and DRN-3785437. All 18 exact extracted PDF pages were model inputs; original PDFs and request bytes remain locally retained. Public manifest and bundles expose hashes/locators, outputs and receipts without republishing full source/request text.
- New frozen harness in `eval/public-refund`, committed before inference at `3330ca2`. Protocol/labels/source/trust/code/build hashes preserved. Full decisions include outcomes: this is retrospective factual review, not legal-outcome prediction. No invented booking facts, company rules, approvals or payment events.
- Four cases × two pinned free models × two repetitions: **16 planned/attempted live reviews**, 80 planned answer instances, no development calls, retries, repairs or replacements. All 16 requests reported zero cost; account usage increased USD 0. Shared request ledger 818 → 834; paid ledger unchanged.
- **Frozen full rubric: 14/16** (Nemotron 8/8, Dots 6/8). Original results committed at `efefcf2` before a separate source-rubric correction. Page 1 of DRN-4148727 validly states the complaint outcome but the original annotation accepted only page 2. The audit permits either page and yields **15/16** (8/8, 7/8), without changing original code/labels/scores or rerunning inference. The presentation script re-derives this correction from saved per-answer grades; independent author validation remains pending.
- One real format failure remains: the first Dots DRN-3785437 response contained two JSON objects and was rejected by Lattice. No partial answer rescue. **75/80 factual answer instances passed**, **16/16 terminal signatures verified**, **15/16 successful-output evidence packages reverified**. The failure receipt has no successful-output commitment; raw failed output remains separately retained.
- **10/10 scoped integrity checks** on one eligible live bundle, including an intact control and nine mutation/trust checks. These are not ten disputes or observed attacks. Prior 32-run synthetic data, four reference omissions, 18 controls and separate wrong-but-signed control remain distinct and unchanged.
- Main TikZ workflow and evidence table on PDF pages 8–9, results table on page 38; synthetic controls moved to Appendix B, pages 50–51. Factual captions and table notes, limited abstract/roadmap/conclusion/AI-declaration edits, four primary references, generator, checklist and provenance updated.
- Approximately 800-word explicitly AI-generated reference narrative (764 prose words, excluding headings/sources/preface) remains outside `main.tex` for the authors to rewrite. Current drafting model/version is unconfirmed; A1/P5 review remains open.

## Validation

- Offline preflight transported all four exact decision texts through the actual Lattice path with a fake provider and no external inference. All 18 pages were confirmed in serialized provider requests.
- `node --test eval/public-refund/workflow.test.mjs`: **3/3 passed**, covering label-free prompts, distinct factual/citation/format checks, and signed wrong-output integrity with scoped controls.
- `node eval/public-refund/report.mjs`: fresh-process package/source/request/signature verification completed before results freeze. It was not rerun after freezing the results merely to refresh timestamps.
- `node paper/scripts/public-refund-tables.mjs --check`: passed; frozen summary/verification and separately audited correction agree with generated presentation.
- `node paper/scripts/refund-tables.mjs --check`: passed; all 32 historical synthetic packages, four omissions and 18 controls remain reproducible.
- All **510 protected historical/synthetic files**, **23 original public-record result files**, **45 measured code/build files**, and the source manifest passed byte/hash comparison after integration. Audit and interpretation are additional files, not rewritten frozen scores.
- Credential scan and public-export retention checks passed; no credential, private signing key, source artifact array or exact request-body array in public bundles.
- `make -C paper tectonic`: passed, **57-page PDF**. Final log: **0 undefined references/citations, 0 overfull boxes**; seven existing underfull warnings in historical tables/bibliography remain.
- Rendered/visually inspected main workflow, evidence/results tables, adjacent evaluation pages, abstract, conclusion/declarations, synthetic appendix and new bibliography entries (pages 1, 8–9, 38–39, 42–43, 50–53). Fixed a stranded synthetic-results heading and ambiguous undated citation rendering. Final workflow screenshot: `.context/refund-public/paper-page-8.png`.
- Local document links and `git diff --check` passed after summary creation. Private sources, complete bundles, before/after text, hash manifests and page renders remain in `.context/refund-public/`.

## Author handoff

**C2: actual public-record evidence integrated; author narrative and review pending.** Authors should rewrite the reference narrative, validate the sources/rubric including the page correction, and settle A1/P5 authorship/disclosure/terms questions. The public-record review supports a concrete example of retaining review evidence, not demonstrated reviewer usefulness, legal correctness, settlement or production financial results. No further inference is needed for this handoff. C4 requirements mapping and practitioner-evaluation decisions remain open; do not start C3 implicitly.
