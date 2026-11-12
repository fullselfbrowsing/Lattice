---
phase: quick-261112-fyy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - eval/paid-cohort/budget.mjs
  - eval/paid-cohort/budget.test.mjs
  - eval/paid-cohort/observer.mjs
  - eval/paid-cohort/observer.test.mjs
  - eval/paid-cohort/common.mjs
  - eval/paid-cohort/mock.mjs
  - eval/paid-cohort/public-refund.mjs
  - eval/paid-cohort/public-refund-report.mjs
  - eval/paid-cohort/validated-live.mjs
  - eval/paid-cohort/judge.mjs
  - eval/paid-cohort/report.mjs
  - eval/paid-cohort/dry-run.test.mjs
  - eval/paid-cohort/README.md
autonomous: true
requirements: [PAID-COHORT-HARNESS]
must_haves:
  truths:
    - "PAID_DRY_RUN=1 runs stages A, B, J, C and both reports end to end with no network and no key read, into a throwaway dir"
    - "No file outside eval/paid-cohort/ is created or edited in the repo; frozen eval/ and packages/ files are only imported read-only"
    - "Ledger limit is $17 at .context/paid-cohort/budget.json; the old .context/hosted-budget.json is never touched"
    - "Every request: reserve before send, one attempt, settle to usage.cost, null cost keeps reservation, charge above reservation halts permanently"
    - "Validity rule prints VALID/INVALID from completion, >=95% responses and receipt verification only, never scores"
  artifacts:
    - path: eval/paid-cohort/budget.mjs
      provides: "PaidBudget, requestBound, admit, stageCeiling"
    - path: eval/paid-cohort/observer.mjs
      provides: "single-attempt allowlisted fetch observer"
    - path: eval/paid-cohort/dry-run.test.mjs
      provides: "end-to-end no-network test"
  key_links:
    - from: eval/paid-cohort/*.mjs stage scripts
      to: eval/paid-cohort/common.mjs
      via: "import of freeze/guard/atomic-write/scrub/transport helpers"
    - from: eval/paid-cohort/common.mjs
      to: eval/paid-cohort/mock.mjs
      via: "transport selection on PAID_DRY_RUN"
---

<objective>
Build the paid-model evaluation cohort harness in eval/paid-cohort/ per the approved plan (/Users/lakshman/.claude/plans/please-proceed-with-these-merry-magpie.md, authoritative), with a no-network dry-run mode. The paid run is NOT part of this plan; the orchestrator runs it later after commit.

Purpose: a separately frozen, budget-bounded cohort that never edits or pools with the free cohorts.
Output: the files above, passing `node --test`, committed with a conventional message (no Co-Authored-By or AI attribution).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@/Users/lakshman/.claude/plans/please-proceed-with-these-merry-magpie.md
@eval/realworld/scripts/budget.mjs
@eval/realworld/scripts/live-observer.mjs
@eval/realworld/scripts/budget.test.mjs
@eval/realworld/scripts/live-observer.test.mjs
@eval/public-refund/run.mjs
@eval/public-refund/report.mjs
@eval/public-refund/workflow.mjs
@eval/realworld/scripts/14-validated-live.mjs
@eval/realworld/scripts/20-free-judge.mjs
@eval/realworld/scripts/free-judge-utils.mjs

Hard rules (all tasks):
- NEVER edit any existing file under eval/ or packages/. New code only in eval/paid-cohort/. Importing existing modules read-only is fine (CASES/PROTOCOL from eval/public-refund/cases.mjs; sha, jsonHash, makeIntent, gradeReview, verifyBundle, integrityControls from eval/public-refund/workflow.mjs; parseJudge from eval/realworld/scripts/free-judge-utils.mjs).
- Do NOT read .context/attachments/y53fe4/openrouter.key, make no network calls (no paid, authenticated, or catalog GETs). Dry run uses fixture catalog/endpoint/account data embedded in mock.mjs.
- Models: anthropic/claude-sonnet-5.5, openai/gpt-6.1-sol, google/gemini-4-carbon ($2/M in, $10/M out). Judges: x-ai/grok-4.7, qwen/qwen3.8-max-0902 ($2/$6).
- Write files via the Write tool (no heredocs). Atomic writes (tmp + rename), mode 0600.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Ledger, observer, common helpers with unit tests</name>
  <files>eval/paid-cohort/budget.mjs, eval/paid-cohort/budget.test.mjs, eval/paid-cohort/observer.mjs, eval/paid-cohort/observer.test.mjs, eval/paid-cohort/common.mjs</files>
  <behavior>
    - requestBound(body, endpoints, maxTokens) = ((serialized bytes + 1000 per image part) x max endpoint input price + maxTokens x max(completion, internal_reasoning) price + request fee) x 1.25; never below the actual cost of a response within max_tokens.
    - reserve over limit throws; settle(actual) releases down to actual; settle(null) keeps reservation; actual > reservation halts permanently (every later reserve throws); limit above $20 rejected; ledger persists atomically at .context/paid-cohort/budget.json (path overridable for tests/dry run).
    - admit(ceilingUsd, balanceUsd) true iff min(remaining, balance - 0.50) >= ceiling; stageCeiling(calls, maxInputTokens, inPrice, cap, maxOutPrice) = calls x (maxInput x 1.35 x inPrice + cap x maxOutPrice).
    - circuit breaker helper: after 10 calls, trips when mean cost/call > 2x expected.
    - observer: rejects models outside the 5-model allowlist, max_tokens > 4096 or missing, forbidden body keys (models, route, provider, plugins, preset, service_tier, web_search_options); exactly one fetch attempt per request (no retry on 5xx/429); halts on 401/402/403/transport error (subsequent calls throw); keeps init.body === expectedBody check; records bodyHash, model, status, httpMs, costUsd, promptTokens, completionTokens, reasoningTokens, provider, observedModel, finishReason, generationId.
  </behavior>
  <action>
    Copy-and-adapt eval/realworld/scripts/budget.mjs into budget.mjs (class PaidBudget, same reserve/settle/halt semantics, limit up to 17-20, requestBound, admit, stageCeiling, breaker). Copy-and-adapt live-observer.mjs into observer.mjs per the behavior above; the observer takes an injected fetch (default global fetch) and a PaidBudget, reserves via requestBound before sending, settles from usage.cost. Write common.mjs exporting: loadKey (reads OPENROUTER_KEY_FILE only when not dry run; returns null in dry run), scrub(text, key) applied to every file write and log, atomicWrite(path, data) mode 0600, requireCleanTree (git status --porcelain on eval/paid-cohort/, skipped when PAID_DRY_RUN=1), codeHashes (sha of eval/paid-cohort/*.mjs, the imported eval modules, and packages/lattice/dist/*.js), freezeProtocol(dir, fields) (writes protocol.json on first run with models, catalog/endpoint price snapshot, caps, counts, code hashes, git revision, ledger limit, input hashes; on later runs recomputes and refuses to proceed if anything differs), getTransport() (returns real fetch normally, mock fetch from mock.mjs when PAID_DRY_RUN=1), account snapshot helper (/key, /credits via transport) used before/after stages, and stage admission wrapper that computes the ceiling from observed max input and calls admit. Failed rows are always recorded and kept in denominators; never retried. Follow the node --test style of the existing budget.test.mjs and live-observer.test.mjs for budget.test.mjs and observer.test.mjs, covering every bullet in <behavior> with injected fakes.
  </action>
  <verify>
    <automated>node --test eval/paid-cohort/budget.test.mjs eval/paid-cohort/observer.test.mjs</automated>
  </verify>
  <done>Unit tests pass; bound >= actual cost property tested; one-attempt, forbidden-field, allowlist, halt semantics tested; no file outside eval/paid-cohort changed (git status).</done>
</task>

<task type="auto">
  <name>Task 2: Stage scripts, judge, report, README</name>
  <files>eval/paid-cohort/public-refund.mjs, eval/paid-cohort/public-refund-report.mjs, eval/paid-cohort/validated-live.mjs, eval/paid-cohort/judge.mjs, eval/paid-cohort/report.mjs, eval/paid-cohort/README.md</files>
  <action>
    All stage scripts use common.mjs (clean-tree guard, freezeProtocol, admission, breaker, scrub, atomic 0600 writes, transport) and observer.mjs; calls run one at a time with models interleaved per item; one attempt per request.

    public-refund.mjs (stage A, adapted from eval/public-refund/run.mjs): 3 models x 4 CASES x 2 repetitions, cap 4096 via the frozen makeIntent; read inputs only from .context/refund-public/inputs.json asserting its hash equals eval/public-refund/results/protocol.json inputHash; new kid paid-public-refund-20261112; outputs to eval/paid-cohort/results/public-refund/ and private material to .context/paid-cohort/public-refund/ (never write under .context/refund-public/).

    public-refund-report.mjs (adapted from eval/public-refund/report.mjs): fresh-process verifyBundle, integrityControls, frozen and audited scores reading eval/public-refund/results/{rubric-audit,source-audit}.json.

    validated-live.mjs (stages B and C; adapted copy of eval/realworld/scripts/14-validated-live.mjs, which must not be edited): stage B = first 60 evaluation questions from .context/eval-cache/citation-split/evaluation.jsonl, contract arm only live, cap 4096, assert manifest.json deep-equals env.citationManifest in eval/realworld/results/validated-free-full.json; prompt-only outcome derived offline from the retained raw answers (identical requests); smoke = 1 dev-split question per model recorded as excluded development rows. Stage C = per model: transport 40, privacy 20, agent 5, crew 5, latency 20 per arm plus 2 warmups per arm; caps >= 1024 (agent/crew 2048). Keep the smoke gate. Stage selectable by argv (smoke|B|C).

    judge.mjs (stage J, adapted from 20-free-judge.mjs): same RUBRIC and probes, parseJudge from free-judge-utils.mjs, two judges, direct HTTP through the observer path with reasoning {max_tokens: 1024} and max_tokens 2048, judges every format-valid stage-B answer, probe smoke per judge.

    report.mjs: writes summary.json and summary.md covering completion per stage/model; frozen and audited public-record scores; strict citation quality for the live contract arm and derived prompt-only, per judge; Cohen's kappa between judges; receipts verified; latency; spend per stage from ledger vs account delta. Implement the validity rule (all admitted stages complete, >=95% of planned calls returned a model response, all successful runs' receipts verify), print VALID or INVALID, and ensure no score value is an input to it. Output directory overridable via env (PAID_OUT_DIR) so dry run can use /tmp.

    README.md: protocol, budget, run order (build, test, commit, freeze, smoke, A, B, J, C, report, reconcile), commands, dry-run usage, reporting rule, note that OpenRouter ignores temperature for Claude/GPT so runs are non-deterministic, and that the free cohorts are never pooled. Use plain prose; no emojis.
  </action>
  <verify>
    <automated>node --check eval/paid-cohort/public-refund.mjs && node --check eval/paid-cohort/public-refund-report.mjs && node --check eval/paid-cohort/validated-live.mjs && node --check eval/paid-cohort/judge.mjs && node --check eval/paid-cohort/report.mjs</automated>
  </verify>
  <done>All scripts parse, import only read-only existing modules, no existing eval/ or packages/ file modified (git diff --stat outside eval/paid-cohort is empty).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Dry-run mock transport and end-to-end test</name>
  <files>eval/paid-cohort/mock.mjs, eval/paid-cohort/dry-run.test.mjs</files>
  <behavior>
    - With PAID_DRY_RUN=1 and output/ledger/private dirs pointed at a mkdtemp dir under /tmp, stages smoke, A, B, J, C and both reports complete with zero real network calls (global fetch replaced/asserted unused) and without reading the key file.
    - Mock returns deterministic schema-valid answers (valid review JSON for stage A, citation answers for B, rubric-valid judge JSON for J, tool/crew responses for C) with usage {prompt_tokens, completion_tokens, completion_tokens_details.reasoning_tokens, cost} and generation id/provider fields; fixture catalog, endpoint prices and account (/key, /credits) data.
    - Ledger reserve/settle exercised: settled spend equals sum of mock costs; receipts and Stage A bundles pass verifyBundle; report prints VALID and writes summary.json and summary.md.
    - Negative cases: a mock run injecting a 402 halts the stage and report prints INVALID; frozen protocol change on a second run refuses to extend.
  </behavior>
  <action>
    Write mock.mjs exporting mockFetch(request) used by common.getTransport() when PAID_DRY_RUN=1; derive responses from the request body so answers are consistent with the frozen prompts/schemas (read the existing stage prompts to shape outputs). Dry run may use reduced item counts via the same code path only if controlled by an explicit env (PAID_DRY_COUNTS) that is never set in real runs and is recorded in protocol.json; otherwise use full counts since calls are free. Write dry-run.test.mjs in node --test style that runs the stage scripts as child processes with env pointing to a /tmp mkdtemp dir, asserts outputs, VALID verdict, ledger arithmetic, file modes 0600, absence of any key-like string in outputs, and the negative cases. Afterwards run the full suite and the existing eval tests, then commit with a conventional message such as `feat(eval): add paid-model cohort harness with dry-run mode` (no Co-Authored-By or AI attribution). Do not run any paid stage.
  </action>
  <verify>
    <automated>node --test eval/paid-cohort/*.test.mjs eval/public-refund/workflow.test.mjs && git diff --stat HEAD -- eval/public-refund eval/realworld packages | wc -l</automated>
  </verify>
  <done>All tests pass including dry-run end to end; the diff outside eval/paid-cohort is empty (wc prints 0); committed; the working tree under eval/paid-cohort is clean so the orchestrator can freeze and run.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| harness to OpenRouter | paid, authenticated requests; key material crosses here |
| harness to repo | outputs written to tracked paths could leak the key |
| frozen cohorts | existing eval/ and packages/ hashes must stay intact |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fyy-01 | I | key handling | mitigate | key read only by common.loadKey outside dry run; scrub() on every write/log; test asserts no key-like string in outputs; files 0600 |
| T-fyy-02 | D | spend runaway | mitigate | pre-request reservation with x1.25 bound, $17 limit, permanent halt on overcharge, stage admission against account balance - 0.50, circuit breaker, single attempt |
| T-fyy-03 | T | frozen cohort files | mitigate | no edits to eval/ or packages/; test and verify step assert empty diff outside eval/paid-cohort |
| T-fyy-04 | T | protocol drift | mitigate | freezeProtocol refuses to extend if code hashes, prices, caps or inputs change; clean-tree guard |
| T-fyy-05 | R | request tampering | mitigate | observer keeps init.body === expectedBody and records bodyHash for receipt matching |
| T-fyy-06 | E | routing override | mitigate | observer forbids models/route/provider/plugins/preset/service_tier/web_search_options and enforces model allowlist |
</threat_model>

<verification>
- node --test eval/paid-cohort/*.test.mjs eval/public-refund/workflow.test.mjs passes
- git diff --stat on eval/public-refund, eval/realworld, packages is empty
- No network or key-file access occurred during execution
</verification>

<success_criteria>
Harness committed in eval/paid-cohort/; dry run produces VALID reports in /tmp; ready for orchestrator to freeze protocol and run paid stages.
</success_criteria>

<output>
Create `.planning/quick/261112-fyy-build-and-run-a-separate-paid-model-eval/261112-fyy-SUMMARY.md` when done
</output>
