---
status: complete_with_evaluation_gaps
completed: 2026-10-27
paid_evaluation_complete: false
---

# Runtime and evaluation implementation

Implemented native image/JSON delivery and explicit unsupported transport errors, validated provider generation settings, deterministic provider-visible context, exact prepared-body digest callbacks, optional v1.4 task/policy/request commitments and expected-digest verification, CLI flags, terminal single-agent receipts, reusable PII spans and opt-in contextual detection. Existing crew accounting, legacy receipts and default PII behavior remain compatible.

Corrected scoring with Unicode conversion, deduplication and one-to-one exact/overlap matching. Frozen Gretel development/holdout manifests exclude historical text/template matches. One historical annotation overrun is documented and clipped only for template exclusion; scoring gold is not rewritten. The holdout contains 5,186 documents. Exact macro F1: default 0.6234625648, contextual 0.6233644005. No default promotion. Development-only diagnostic aggregates identify annotation disagreements without relabeling them.

Prepared ALCE-derived citation splits, fixed-judge protocol, budget guard, matched hosted harness, accountability comparison and human-study materials. Accountability: all 42 probes behave as expected; generic signed-log and Lattice decisions agree. No human recruitment or human labels.

Paid evaluation is explicitly incomplete: 213/1,020 planned non-warmup cases recorded. JSON tasks are correct in all 60 direct/signed cases; the tiny image task varies by model. GPT and Gemini complete five single-agent and five crew cases each. A transport interruption leaves Haiku agent cases, citation quality and latency incomplete. Confirmed provider-reported charges are USD 0.04482533; unresolved reservations raise conservative accounting to USD 9.58954493 under the USD 10 cap. No reservations were released based on an aggregate key-usage snapshot. Two harness defects exposed by the interruption were fixed and regression-tested without further paid calls: halt after the first unknown transport error, and preserve pre-egress budget-denial evidence without passing an invalid empty request expectation. Original recordings are retained.

Rebuilt both papers, refreshed functional offline evaluation, corrected historical replay wording, documented implementation boundaries and generated a versioned result report. The README/security policy/changeset reflect current behavior. PR replacement text is prepared locally at `.context/PR-24-BODY.md`; nothing was pushed, published, merged or sent externally.

Validation: runtime 1,782 tests; CLI 196 tests; public type-check suite 1,986 passing cases and tsd; build/typecheck/package lint; tarball/version/core/module/rename/workflow audits; 19 Python scoring tests; 4 Node span tests; 8 budget/observer/accountability tests; reporting and diagnostic self-tests. Both TeX builds have no missing references or characters; new tables and result sections visually inspected. The ignored `.context` directory is excluded from the source rename audit because it contains isolated worktrees and evaluation caches.

Detailed measurements: `eval/realworld/results/validated-summary.md`. Paid limitations and post-run fixes: `validated-termination.json`. Runtime changes are committed separately from evidence. Isolated task worktrees were removed after their commits were integrated; the original workspace branch remains checked out.
