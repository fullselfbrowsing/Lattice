---
mode: quick
description: Run isolated zero-cost OpenRouter evaluations with pinned free models
---

# Free model evaluation

User authorized using free models instead of further paid calls. Keep the current PR branch. Execute inline under the GSD quick workflow; no delegation is needed.

## 1. Guard and isolate free inference

Add an explicit free cohort to the existing measured harness. Require catalog-listed `:free` IDs, zero model/endpoint prices, no model fallbacks or paid extensions, and a separate persisted request ledger. Preserve `.context/hosted-budget.json` byte-for-byte. Pace serial requests below 20/minute; stop on quota exhaustion, transport failure, or any nonzero reported charge. Test these guards offline before inference.

## 2. Run the separate cohort

Pin `nvidia/nemotron-3.5-super-vl:free` and `google/gemma-4-31b-it:free` based on catalog image/tool support. Fixed exploratory judge: `dots-studio/dots-3-note-preview:free`. Record catalogs and exact request hashes. Use existing development smoke cases before the frozen evaluation set. Each target model gets 10 transport fixtures (5 image/5 JSON), 10 privacy cases, 2 single-agent and 2 crew cases, all 60 frozen citation questions in both arms, and 20 matched latency trials per arm plus 2 warmups. Cap this cohort at 900 requests across stages, subject to the account's remaining daily quota. Keep all failures and report explicit denominators. Do not change prompts based on heldout outcomes.

## 3. Report and verify

Publish a separate local free-cohort summary and reproduction instructions, with free-tier availability and judge limitations. Do not pool paid/free model results or treat new measurements as completion of the old cohort. Verify original paid artifacts/ledger are unchanged, run focused harness tests, scan output for the credential, update GSD state, and commit locally. No push, PR posting, merging, or publication.

Add a generated free-cohort follow-up fragment to both paper drafts, keeping the earlier paid measurements unchanged. Rebuild both PDFs and visually inspect the added section using the PDF skill. The new section must distinguish syntax enforcement from answer support, and label the free judge and small latency sample as exploratory.

Sources checked 2026-11-03: OpenRouter models/endpoints/key APIs; official free variant and limits documentation. Key reported 1,000 daily free requests remaining. Free variants have zero inference price but limited availability. Only public benchmark passages and synthetic fixtures are transmitted.

## Development-only adjustment before heldout inference

The first smoke run (18 cases, 21 requests, zero reported cost) found all 9 Gemma calls rate-limited and Nemotron exhausting 64/128-token caps with empty visible output. Preserve it as `validated-free-smoke-development-1.json`. Replace unavailable Gemma with `dots-studio/dots-3-note-preview:free`; the fixed exploratory judge becomes `xingchen-agi/xing4.0-29b-a4b:free`. Raise bounded free-cohort output allowance to 1024 for simple tasks and 4096 for citations/agents/judging, retaining provider-default reasoning. Run a fresh development smoke; require a correct JSON fixture for each model. No heldout prompts or outcomes have been used for these adjustments.

## Judge availability revision

The main cohort completed all 428 cases unchanged. The initial fixed Xing judge was stopped after 45 rows (36 HTTP 429, 9 HTTP 200); its raw recording is retained as `validated-free-judge-initial.json`. The replacement fixed judge is `nvidia/nemotron-3-ultra-550b-a55b:free`, with a 1024-token reasoning allowance and 4096 total output cap, tested first on two synthetic supported/contradicted examples. A standalone grader shares the same zero-price guard and cumulative 900-request ledger. It accepts a single outer JSON fence as mechanical judge-output normalization, records that normalization, and leaves candidate format scores unchanged. All eligible benchmark answers are graded again with the replacement instrument; the initial judge is not pooled. This remains exploratory, without human calibration.

The live run also exposed an HTTP-200 error envelope accepted as empty text by the compatible adapter. Add a focused regression and reject such envelopes after measurement; preserve the original recorded runtime verdict and identify the later correction in the report.
