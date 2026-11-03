# Retrospective review of actual public refund disputes

This cohort corrects the earlier substitution of invented scenarios for the requested real-world data. It uses **actual published dispute decisions**, with exact PDF page text as Lattice input. The original [synthetic cohort](../refund/README.md) remains a separate technical control.

## Completed results

All 16 planned reviews completed with USD 0 added spend. The frozen full-rubric score was **14/16**. A separately documented source-rubric correction accepts a valid supporting page omitted by the original annotation, yielding **15/16** without changing frozen labels/results or rerunning inference. The remaining response failed the format contract. Terminal signatures verified for 16/16 runs; successful-output evidence packages verified for 15/16. See the [interpretation and audit](results/interpretation.md) and [machine-readable correction](results/rubric-audit.json); independent author validation remains pending.

Measured harness revision: `3330ca2`. Original results were committed at `efefcf2` before the correction. Regenerate only the manuscript table with `node paper/scripts/public-refund-tables.mjs`; `--check` validates the presentation. The reproduction commands below are for a deliberately managed reproduction, not a request to rerun the completed frozen cohort.

## Data and selection

Four records were selected before inference for their relevance to travel-refund evidence and availability as primary documents: [Moffatt v. Air Canada](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf), [DRN-4377241](https://www.financial-ombudsman.org.uk/decision/DRN-4377241.pdf), [DRN-4148727](https://www.financial-ombudsman.org.uk/decision/DRN-4148727.pdf), and [DRN-3785437](https://www.financial-ombudsman.org.uk/decision/DRN-3785437.pdf). Selection was purposive, not random. The first is a primary judgment hosted by Middle Temple; the others are published by the Financial Ombudsman Service. These documents describe actual disputes, but are not the original company systems, customer attachments or complete evidentiary files.

The [source manifest](source-manifest.json) records URLs, PDF hashes and page-text hashes. PDFs were retrieved November 3, 2026. Poppler `pdftotext 26.06.0 -layout` extracts complete pages; preparation splits form feeds and trims page boundaries. The page text is not paraphrased or replaced by invented policy/booking facts. Source PDFs and exact input/request exports remain under `.context/refund-public/` locally; full decisions are not redistributed in this repository. Models receive the full text, including recorded outcomes. This is **record review, not prediction of judicial outcomes**. Public cases may also have appeared in model training.

## Frozen design

- Four disputes × two pinned free models × two repetitions = **16 planned runs**, no development inference.
- Five source-based questions per dispute: 80 planned answer instances. Labels and accepted supporting pages are in [cases.mjs](cases.mjs), prepared with Codex and checked against the PDFs before execution. Independent author validation remains pending. Labels and accepted-page lists are excluded from prompts.
- Exact factual values, accepted supporting-page coverage and full-rubric run success are reported separately. Null distinguishes absence of settlement evidence from proof of nonpayment. Approximate amounts are explicitly asked as approximate; directions to pay are not reported as completed payments.
- Supporting-page coverage tests whether a designated source page is cited. It does not establish entailment of every generated sentence. Free-text review notes, legal correctness and human usefulness are not graded.
- Responses are constrained to a review packet. There are no invented approvals, payment fixtures or financial side effects.
- Shared 900-request free ledger, verified zero prices and pinned `:free` models; no retries, paid fallback, repairs or post-freeze prompt changes. This cohort caps inference requests at 16. Failures and unattempted cases remain in planned denominators.

## Commands

From the repository root, download each linked PDF to `.context/refund-public/sources/<case-id>.pdf`, retaining the filenames in `cases.mjs`. Then:

```sh
node eval/public-refund/prepare.mjs
node --test eval/public-refund/workflow.test.mjs
node eval/public-refund/run.mjs
node eval/public-refund/report.mjs
```

The runner reads `OPENROUTER_KEY_FILE`, defaulting to the user-supplied private credential path. Do not commit keys or raw source/request exports. Protocol/code must be committed before inference. The runner freezes source, label, build, protocol and public-key hashes and rejects changed cohorts. Interrupted/terminal rows are not retried; only unstarted rows can resume.

The report requires the exact retained private inputs and request bundles. It rechecks source-page content, signatures, output hashes, task/policy/request bindings and presence of every input page in the serialized request. Published bundles contain outputs, receipts and source/request fingerprints; they do not independently supply all bytes needed for full replay verification. The published primary source URLs and manifest support source re-acquisition, subject to exact hashes and extraction tooling. An issuer signature still does not establish issuer honesty or remote provider consumption.

Offline controls mutate a copy of one eligible live bundle; they are not additional real disputes or observed model failures. Earlier controlled wrong-but-signed tests remain separate. A correct source-based answer is not evidence of correct legal advice, production refund approval, operational generalization, managerial benefit or superiority over secured logging.
