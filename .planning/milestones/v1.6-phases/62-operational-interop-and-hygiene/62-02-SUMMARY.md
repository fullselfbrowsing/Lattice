---
phase: 62-operational-interop-and-hygiene
plan: 02
subsystem: operations
tags: [providers, canary, receipts, spend-limits, github-actions]
requires:
  - phase: 62-operational-interop-and-hygiene
    plan: 01
    provides: shared packed-package build, pack, and clean-install helper
provides:
  - additive provider-owned output token ceilings for three native wire families
  - packed tri-family provider canary with strict receipts and bounded evidence
  - scheduled/manual protected GitHub Actions canary lane
affects: [release, provider-adapters, operational-evidence, documentation]
tech-stack:
  added: []
  patterns: [pre-network configuration gate, counted transport, allowlisted report projection]
key-files:
  created:
    - scripts/provider-canary-core.mjs
    - scripts/provider-canary-consumer.mjs
    - scripts/run-provider-canary.mjs
    - scripts/provider-canary.test.mjs
    - .github/workflows/provider-canary.yml
  modified:
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/providers/anthropic.ts
    - packages/lattice/src/providers/gemini.ts
key-decisions:
  - "Keep maxOutputTokens additive at each adapter boundary and preserve each adapter's omitted/default behavior."
  - "Compute canary cost from configured pricing, fail closed on higher provider-reported cost, and derive Gemini output from total minus prompt when totals exist."
  - "Reconstruct every retained report from a fixed field allowlist instead of redacting raw execution data."
patterns-established:
  - "Canary truthfulness: invalid configuration is not-run before provider construction; attempted work is passed or failed."
  - "Canary isolation: one packed runtime, one public factory and createAI run per family, and one counted non-redirecting fetch."
requirements-completed: [OPSVAL-02, OPSVAL-03]
duration: 45 min
completed: 2026-07-20
---

# Phase 62 Plan 02: Bounded Provider Canary Summary

**One packed public runtime now exercises OpenAI-compatible Chat Completions, Anthropic Messages, and Gemini generateContent with hard token, time, transport, spend, receipt, and evidence boundaries.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-07-20T12:45:00Z
- **Completed:** 2026-07-20T13:30:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added validated `maxOutputTokens` options to all three adapters and routed streaming and non-streaming requests through the same provider-native request builders.
- Built one tarball-only canary that clean-installs the runtime, runs each native protocol sequentially, and emits truthful `not-run`, `passed`, or `failed` evidence.
- Enforced one transport, 16 output tokens, 2,048 input tokens, a 20-second timeout, no fallback retry, and at most USD 0.02 configured spend per family.
- Required actual normalized usage, observed provider identity, bounded cost, and strict verification of a newly issued standard v1.4 receipt for every pass.
- Added a scheduled/manual, read-only, protected workflow that uploads only the sanitized report and writes a sanitized status summary.

## Task Commits

1. **Task 1: Add one explicit output-token ceiling to the three public adapters** - `5cf7d12`
2. **Task 2: Build and schedule the bounded packed provider canary** - `b48cfa0`

## Files Created/Modified

- `packages/lattice/src/providers/adapters.ts` - Optional OpenAI-compatible `max_tokens` ceiling.
- `packages/lattice/src/providers/anthropic.ts` - Validated Anthropic `max_tokens` ceiling with the existing 2,000 default.
- `packages/lattice/src/providers/gemini.ts` - Validated Gemini `generationConfig.maxOutputTokens` ceiling with the existing 2,000 default.
- `scripts/provider-canary-core.mjs` - Side-effect-free configuration, usage, cost, failure-code, and report projection contract.
- `scripts/provider-canary-consumer.mjs` - Packed public runtime execution, counted fetch, timeout, actual evidence, and strict receipt verification.
- `scripts/run-provider-canary.mjs` - Build, pack, clean-install, launch, sanitize, report-write, and exit-status authority.
- `scripts/provider-canary.test.mjs` - Packed local-server success, fault, secrecy, and workflow tests.
- `.github/workflows/provider-canary.yml` - Protected weekly/manual live evidence lane.

## Decisions Made

- OpenAI-compatible omission still sends no ceiling; Anthropic and Gemini retain their 2,000-token defaults. The canary explicitly selects 16 without changing ordinary consumers.
- Configuration is complete only when model, credential, safe base URL, finite nonnegative per-1K pricing, and a positive repository-bounded spend cap pass before networking.
- Provider-reported cost can raise, but never lower, configured token-price cost. This preserves fail-closed billing behavior.
- Provider outputs, raw errors, headers, URLs, prompts, credentials, and receipt envelopes never enter the report object; final evidence is rebuilt from approved primitives.

## Deviations from Plan

None - the planned public adapter, packed runtime, native protocol, failure, secrecy, and workflow surfaces were implemented directly.

## Issues Encountered

- `createAI` returns provider exceptions as typed failed results. The canary classifies only their bounded public message and kind, never the raw cause.
- macOS temporary paths can resolve through `/private/var`; executable entrypoint detection now compares realpaths so copied consumers run reliably.

## User Setup Required

Create a protected GitHub Actions environment named `provider-canary` and configure:

- Secrets: `PROVIDER_CANARY_OPENAI_API_KEY`, `PROVIDER_CANARY_ANTHROPIC_API_KEY`, `PROVIDER_CANARY_GEMINI_API_KEY`.
- Variables: each family's `MODEL`, `INPUT_PRICE_PER_1K_USD`, `OUTPUT_PRICE_PER_1K_USD`, and `MAX_SPEND_USD` values under the `PROVIDER_CANARY_<FAMILY>_...` prefix.
- Variable: `PROVIDER_CANARY_OPENAI_BASE_URL`. Anthropic and Gemini use their safe official defaults.

Without configuration, the workflow succeeds with three visible `not-run` records and makes no provider requests.

## Verification Evidence

- Focused adapter suite passed 151 tests across OpenAI-compatible, Anthropic, and Gemini.
- Packed provider canary suite passed 10 local-server success and fault tests.
- Workflow safety audited five workflows with no unsafe trigger or OIDC scope.
- Package TypeScript checking passed.
- Direct launcher smoke built and installed the tarball, emitted three `not-run` records, and exited zero with no credentials.

## Next Phase Readiness

- Operational provider evidence is complete and isolated from deterministic PR testing.
- Plan 62-03 can now remove workflow-history comments and install the production comment-hygiene gate.

---
*Phase: 62-operational-interop-and-hygiene*
*Completed: 2026-07-20*
