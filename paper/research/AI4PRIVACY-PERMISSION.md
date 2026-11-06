# Ai4Privacy permission record

**Status: written academic-use confirmation documented; A6 scope reconciliation complete for the current evaluation and tracked publication material.** Lakshman supplied the email exchange on November 4, 2026. Final archive/source-package checks remain under P4/P6.

## Correspondence and provenance

- **Requester:** Lakshman Turlapati, October 22, 11:44 AM, to Ai4Privacy licensing.
- **Respondent:** Michael Anthony, October 22, 12:48 PM, replying to Lakshman and licensing. No job title or additional authority is inferred.
- **Date convention:** recorded as October 22, 2026 from the study/session context; the pasted headers show Thursday, October 22 and times, but omit the year and time zone. No time zone is assumed.
- **Evidence:** author-supplied transcript, retained privately at `.context/jitcar-a6-email/correspondence.md`; the original email account/export has not been independently inspected. Private addresses and the full correspondence are excluded from tracked publication files. Preserve the original email with the authors' submission records.

The operative reply is:

> Yes, that sounds great, and your evaluation usage falls within our academic terms.

This confirms the described use under academic terms. It does not replace the dataset's public license or grant unrestricted redistribution/commercial rights.

## Scope of the request that received confirmation

| Item | Recorded scope |
| --- | --- |
| Dataset | `pii-masking-300k`, English validation split, revision `c8c77895` |
| Purpose | Measure personal-data detector precision and recall |
| Published material | Aggregate metrics only |
| Exclusions | No redistribution of dataset records or derived annotations |
| Attribution | Acknowledge Ai4Privacy in the paper; the reply supplies no mandatory wording |
| Disclosed context | Lattice is an MIT open-source TypeScript library; its Full Self Browsing website was linked; Prof. Rabih Neouchi (UT Dallas) is the coauthor |
| Venue named in request | Information Systems Frontiers; the reply does not state a journal-exclusive condition. JITCAR is the current target, with the same described academic use |
| Additional message | An invitation to share the published paper for possible LinkedIn coverage. It is not stated as a permission condition; no message or promotion is authorized by this record |

The request did not seek permission for transmitting dataset records to external inference APIs, distributing row-level outputs, or commercial dataset use. No such additional rights are inferred.

## Reconciliation with the saved evaluation

Reviewed November 4 against the tracked files at `92dcf4b`:

- [Dataset metadata](../../eval/realworld/results/datasets.json) and [detector comparisons](../../eval/realworld/results/pii-tools.json) identify `data/validation/1english_openpii_8k.jsonl` at full revision `c8c77895a005822682b66ab547fc0422579bc1d3`, matching the requested prefix. The recorded English-validation cohort contains 7,946 documents. Reports retain aggregate detector metrics, counts, timing and provenance rather than records or per-record annotations.
- The inspected [detector scoring](../../eval/realworld/scripts/02-score.mjs), [span export](../../eval/realworld/scripts/06-lattice-spans.mjs), and [tool comparison](../../eval/realworld/scripts/06-pii-tools.py) paths process cached records locally. Raw cached records and local span exports are outside the tracked publication files. This is a code/material inventory, not a retrospective network audit.
- The [validated hosted privacy experiment](../../eval/realworld/scripts/14-validated-live.mjs) constructs synthetic markers separately; it does not load the Ai4Privacy split. Its hosted calls are not evidence of permission to send Ai4Privacy records to an API.
- No tracked English-validation source file, `lattice-spans.jsonl`, `dataset-meta.json`, or `llm-guard-spans` export was found. A field-name scan of tracked real-world JSON results found no `source_text`, `privacy_mask`, `masked_text`, `unmasked_text`, `predicted_spans`, or `gold_spans` keys. Together with inspection of the two Ai4Privacy reports, this supports the current aggregate-only material inventory; it is not a substitute for checking the final archive.
- The active manuscript acknowledgment now records academic-use confirmation and explicitly excludes redistribution of records and derived annotations. The public-license metadata remains unchanged. Historical task records and the old IEEE manuscript retain their original context; the current submission source is `paper/main.tex`.

## Submission handling and assistance

Keep only permitted aggregate reports in the submission/reproducibility package. P4/P6 must exclude raw dataset caches, record-level annotations/span exports, private correspondence and credentials, and check the exact final archive inventory. Any future use outside the described evaluation requires a separate scope assessment; this task neither performs nor authorizes it.

Codex reconciled the author-supplied exchange, inspected saved metadata/scripts/results, and edited permission documentation and existing acknowledgment text. No model/version is inferred for this session. No results, scripts, public-license terms, or research claims were changed; no inference or new experiment was run. Earlier C4/C5 notes are historical; this note and [A6](../JITCAR-TODO.md#a6--document-the-granted-ai4privacy-permission) record the current position. A1/P5 author review and C6 remain separate.
