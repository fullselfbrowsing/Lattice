---
mode: quick-full
description: Implement approved runtime and evaluation improvements
must_haves:
  truths:
    - Supported images and JSON values reach provider request bodies intact.
    - Signed runs and agents expose task, policy, and provider submission binding.
    - PII scores use one-to-one span matching and distinguish blocking from classification.
    - Hosted evaluations are reproducible and spend no more than 10 USD.
  artifacts:
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/receipts/types.ts
    - eval/realworld/results
  key_links:
    - Provider submission digests feed signed receipts.
    - Evaluation reports and both papers derive from versioned result files.
---

# Approved runtime and evaluation improvements

Starting revision: 60461f9. Keep the current PR branch and incorporate its hosted rerun as historical evidence. The user's approved conversational plan is the execution contract. GSD quick validation is used for the bounded implementation batches below; no new milestone or branch rename is needed.

## Task 1 — Provider request correctness

- **Files:** provider adapters, provider types, runtime/agent generation forwarding, associated tests and public type exports.
- **Action:** native image parts and preserved JSON values; explicit unsupported transport errors; noPublicUrl parity; correct OpenAI URL joining; additive generation temperature/maxOutputTokens; request submission digest callback at final serialized-body boundary for all built-in fetch adapters, both streaming and ordinary.
- **Interface coordination:** `ProviderRunRequest.generation?: { temperature?: number; maxOutputTokens?: number }`; `ProviderRunRequest.onRequestPrepared?: (metadata: { bodyHash: string }) => void | Promise<void>`. Digests are lowercase SHA-256 hexadecimal of UTF-8 request bytes handed to configured fetch. Callback is awaited before fetch. It never receives headers/content. Custom fetch mutation and receiver consumption remain outside the attestation boundary.
- **Verify:** adapter, streaming, packaging, noPublicUrl, runtime forwarding tests; typecheck and public API type checks.
- **Done:** byte-level image/JSON payload checks pass across execute/stream; settings have wire-level assertions; explicit unsupported inputs never silently disappear.

## Task 2 — Receipt and agent binding

- **Files:** receipts, runtime receipt issuance, agent terminal results, external audit, CLI verification/diff and tests.
- **Action:** optional v1.4 taskHash, policyHash, ordered providerRequestHashes; explicit expected digest verification; terminal single-agent receipt and receiptError using existing signer failure policy; preserve crew counts and legacy canonicalization. Capture request digests through Task 1 callback, including failed attempts; absent support remains visibly unbound. Original task and normalized policy use existing canonical hashing. Never include raw content or credentials in receipts.
- **Verify:** digest changes/mismatches, malformed fields, legacy envelopes, success/failure agent returns without tracer, signer flag/throw, crews and CLI.
- **Done:** signatures cover the claimed bindings; caller expectation checks reject mismatches; single-agent results expose signed terminal outcomes without changing unsigned execution.

## Task 3 — Evaluation validity, privacy, and evidence

- **Files:** PII detectors/tripwire options, scoring and dataset preparation scripts, live harness, reports, documentation, papers and tests.
- **Action:** reusable all-match detection preserving detect(); opt-in structured context; E.164 and bounded cues; one-to-one exact/overlap scores and Unicode normalization; document blocking versus type classification; freeze baseline and heldout manifests before tuning. Correct replay eligibility and remove false model re-execution attribution. New modest paid OpenRouter run uses three catalog-verified models, explicit sampling options, per-call cost reservation and a 10 USD ceiling. Add cited-answer/support, artifact transport, agent/crew and matched accountability probes. Generate reports/papers and study preparation materials; no human recruitment.
- **Verify:** scorer counterexamples, detector regressions, strict heldout separation, budget guard offline tests, all repository CI gates, live smoke followed by bounded evaluation, both PDF builds and visual inspection.
- **Done:** results carry code/data/model/config provenance; failed, skipped, unavailable and successful runs use explicit denominators; reports contain measured regressions as well as gains and actual spend.

## Execution constraints

- User credential: `.context/attachments/y53fe4/openrouter.key`, runtime read only; never commit, copy into worktrees, print, or include in reports.
- Models: openai/gpt-4.1-mini, google/gemini-2.5-flash-lite, anthropic/claude-haiku-4.5, subject to catalog recheck. Serial paid requests, bounded outputs, retries charged to shared persisted budget. No substitution with a more expensive model.
- Freeze historical outputs before rewriting reports. Public dataset raw files remain outside tracked paths. No claims of untouched holdout for already-inspected public test sets.
- GSD executors use explicitly created task worktrees and commit only their owned code/tests. Root integrates, verifies, runs paid calls, updates planning state and final evidence. Each executor owns a distinct responsibility and must not revert others' work.
- No merge, publish, human recruitment, or messages to third parties. Prepare consolidated PR body locally for review.

## Plan validation

Approved user requirements mapped to the three tasks above. Existing entrypoints inspected. No unresolved product decision. Remaining uncertainty (heldout improvement and live provider behavior) is measured rather than assumed. The task is delivered only after integration and evidence regeneration, not merely after the parallel code batches.
