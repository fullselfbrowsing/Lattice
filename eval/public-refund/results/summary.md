# Actual public refund disputes: retrospective Lattice evaluation

**Real published case records and live model calls. No invented booking, policy, approval or payment events.**

Actual public records; retrospective source-grounded extraction. Complete decisions (including outcomes) provided. Not outcome prediction, adjudication, a production deployment or a representative benchmark.

Measured revision: `3330ca28c73ff11d355181cf24cb364ac1fe4c73`. Four cases, two pinned free models, two repetitions; 16/16 planned reviews attempted. No development inference, retries or post-freeze repairs.

| Model | Factual runs | Supporting-page runs | Full rubric | Factual answers | Verified packages |
| --- | --- | --- | --- | --- | --- |
| nvidia/nemotron-3.5-super-vl:free | 8/8 | 8/8 | 8/8 | 40/40 | 8/8 |
| dots-studio/dots-3-note-preview:free | 7/8 | 6/8 | 6/8 | 35/40 | 7/8 |

Five prespecified questions per case distinguish currencies, paid/claimed/ordered amounts, temporary credit status, and absence of settlement evidence. Supporting-page coverage checks an accepted page ID for each answer; it does not grade every sentence in the free-text review note. Source-based labels were prepared with Codex and await independent author validation. All planned runs remain in denominators.

| Actual dispute | Full rubric | Source |
| --- | --- | --- |
| moffatt | 4/4 | [published decision](https://www.middletemple.org.uk/sites/default/files/civicrm/persist/contribute/files/2024bccrt149.pdf) |
| drn-4377241 | 4/4 | [published decision](https://www.financial-ombudsman.org.uk/decision/DRN-4377241.pdf) |
| drn-4148727 | 3/4 | [published decision](https://www.financial-ombudsman.org.uk/decision/DRN-4148727.pdf) |
| drn-3785437 | 3/4 | [published decision](https://www.financial-ombudsman.org.uk/decision/DRN-3785437.pdf) |

## Failures retained

```json
[
  {
    "id": "drn-3785437:dots-studio/dots-3-note-preview:free:0",
    "error": "tripwire-violated",
    "format": false,
    "answers": []
  },
  {
    "id": "drn-4148727:dots-studio/dots-3-note-preview:free:1",
    "error": null,
    "format": true,
    "answers": [
      {
        "id": "complaint_upheld",
        "value": false,
        "sources": [
          "drn-4148727-p1"
        ],
        "fact": true,
        "citation": false
      }
    ]
  }
]
```

## Evidence and cost

15/16 locally retained run-evidence packages reverified in a fresh process. Signatures, full page inputs, outputs, expected tasks/execution policies and exact serialized requests were checked. Published bundles retain outputs, receipts and source/request fingerprints; full source pages and request bodies remain local rather than republishing complete decisions.

10/10 scoped checks passed on one live bundle. Includes an intact control; separate from the live-run denominator. See [controls](controls.json).

Inference requests: 16; reported zero cost: 16; unknown cost: 0; nonzero cost: 0. Account usage delta: 0 USD. Paid ledger unchanged: true. Stop reason: null.

## Boundaries

The source documents are published decisions, not original airline/bank files. The full decisions include their outcomes, so the experiment measures retrospective record review rather than forecasting an adjudicator. Selection is purposive, cases are public and may have appeared in model training, repeated runs are dependent, and four cases do not establish operational accuracy. Model recommendations did not authorize or execute anything. Human review effectiveness, savings, fairness, legal entitlement, provider honesty and superiority over secured logging remain untested.

Reproduction and source retention: [README](../README.md), [source manifest](../source-manifest.json), [questions and labels](../cases.mjs). The earlier [synthetic cohort](../../refund/results/summary.md) remains a separate technical control, not evidence of actual customer-case performance.
