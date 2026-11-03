---
status: passed
verified: 2026-11-03
---

# Verification

| Requirement | Evidence | Result |
| --- | --- | --- |
| Use only free routes | Pinned `:free` IDs, zero model/endpoint prices, blocked paid fallbacks/extensions; guard tests | PASS |
| Preserve paid budget/results | Every SHA-256 in `.context/free-baseline-hashes.json` still matches | PASS |
| Bound free requests | Persisted ledger contains 784 unique reservations out of 900; every model is `:free`, every reported cost zero | PASS |
| No added account spend | Read-only final key endpoint: USD 0.04546433 before/after, daily usage zero; snapshot in `.context/free-final-account-check.json` | PASS |
| Complete fixed main cohort | 428 unique planned cases plus 12 excluded warmups, failures retained; `validated-free-full.json` | PASS |
| Complete independent grading | Exact 213-candidate identity set and candidate-file hash match; 213 valid judgments, two passed synthetic probes | PASS |
| Keep measurement revisions separate | Main measured commit `07cd9006b0fc`; initial Xing and sequential judge records preserved; collector hashes, explicit restart log | PASS |
| Reject HTTP-200 provider errors | Six new adapter regressions; ordinary JSON, streaming JSON and SSE error cases; fix commit `6410010` | PASS |
| Runtime and CLI regressions | 1,788 runtime + 196 CLI tests; `.context/free-tests.log` | PASS |
| Build/type correctness | Workspace build and typecheck; `.context/free-build.log`, `.context/free-typecheck.log` | PASS |
| Evaluation accounting/scoring | 15 Node guard/budget/observer/accountability/judge tests; report and format-analysis self-tests | PASS |
| Credential isolation | Exact credential-byte scan across tracked/unignored candidate files returned no matches; cache/key/ledgers ignored | PASS |
| Generated reports | Separate free summary JSON/Markdown and matching TeX fragments; paid metrics unchanged | PASS |
| PDF output | Both Tectonic builds succeeded; ISF 51 pages, IEEE 23 pages; free section/tables and resized PII figure visually checked in `.context/free-final-*` renders | PASS |

No TeX warnings identify the new free-cohort fragment. Existing unrelated underfull/overfull box warnings remain; the oversized PII float warning was removed. There is no human calibration, model-ranking claim, production latency claim, or reinterpretation of missing charge reports as confirmed zeros. The final account check and zero-price route guards support the no-added-spend result.

No live inference ran after completion of the 784-request cohort. No push, PR posting, merge or publication occurred. A concrete PR body is prepared locally in `.context/PR-24-BODY.md`.
