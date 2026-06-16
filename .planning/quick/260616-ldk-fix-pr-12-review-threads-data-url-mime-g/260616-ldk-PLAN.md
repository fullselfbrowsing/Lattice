---
status: complete
must_haves:
  truths:
    - "All 8 current unresolved PR #12 review threads are addressed or verified fixed."
    - "No changeset/version bump is added for these unreleased review fix-ups."
    - "Existing untracked planning artifacts are preserved."
  artifacts:
    - "packages/lattice provider/runtime tests cover MIME, routing, OTel, and noPublicUrl regressions."
    - "packages/lattice-cli tests cover agent baseline bootstrap and receipt diff field coverage."
  key_links:
    - "packages/lattice/src/providers/multimodal.ts"
    - "packages/lattice/src/policy/policy.ts"
    - "packages/lattice/src/routing/router.ts"
    - "packages/lattice/src/runtime/create-ai.ts"
    - "packages/lattice/src/observability/otel.ts"
    - "packages/lattice-cli/src/commands/eval.ts"
---

# Quick Task 260616-ldk: Fix PR #12 Review Threads

## Goal

Fix the current unresolved PR #12 review threads covering data URL MIME handling, gateway policy merging, streaming-aware routing, OTel span/usage behavior, agent eval baseline bootstrap, and regression coverage for already-fixed receipt diff and Gemini `noPublicUrl` paths.

## Tasks

### 1. Core Runtime And Provider Fixes

**files:** `packages/lattice/src/providers/multimodal.ts`, `packages/lattice/src/providers/packaging.ts`, `packages/lattice/src/policy/policy.ts`, `packages/lattice/src/routing/router.ts`, `packages/lattice/src/runtime/create-ai.ts`, `packages/lattice/src/observability/otel.ts`

**action:** Preserve data URL MIME types through provider packaging and request bodies; deep-merge `policy.gateway`; reject non-streaming capabilities at route time when `policy.stream` is true; end one-shot negotiation OTel spans; attach normalized usage to successful provider attempt events.

**verify:** Add targeted tests for each behavior and run the relevant package tests.

**done:** The thread scenarios fail before the patch and pass after it.

### 2. CLI Agent Eval And Receipt Diff Fixes

**files:** `packages/lattice-cli/src/commands/eval.ts`, `packages/lattice-cli/src/eval/agent-runner.ts`, `packages/lattice-cli/src/eval/agent-types.ts`, `packages/lattice-cli/test/agent-eval.test.ts`, `packages/lattice-cli/test/receipt-diff.test.ts`

**action:** Add agent eval `--init-baseline` support with an injectable baseline writer, and expand receipt diff regression coverage for redaction, evidence, and step-marker fields.

**verify:** Run targeted CLI tests and CLI typecheck.

**done:** First-time `lattice eval --agent --init-baseline` writes an agent baseline instead of failing on a missing baseline.

### 3. Verification And PR Thread Check

**files:** GSD quick summary/verification artifacts plus GitHub thread fetch output.

**action:** Run targeted tests/typechecks, record summary and verification, then re-fetch PR #12 review threads without posting or resolving anything.

**verify:** Document passing commands and remaining GitHub thread state.

**done:** Targeted tests and package typechecks passed. PR #12 still shows the pre-existing unresolved GitHub thread state because local fixes have not been pushed or thread-resolved.
