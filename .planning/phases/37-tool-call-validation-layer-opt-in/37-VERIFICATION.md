---
phase: 37
verification_type: goal-backward
verified_at: 2026-06-09T21:39:24Z
verdict: pass
gaps_found: 0
---

# Phase 37 Verification

## Goal

Each of the 7 real provider adapters accepts an opt-in `validateToolCalls` option that validates prompt-reencoded returned tool-call envelopes, exposes normalized `ProviderRunResponse.toolCalls`, and preserves existing behavior when the option is absent.

## Verdict

PASS.

## Evidence

- `packages/lattice/src/tools/tool-call-validation.ts` defines `ToolCallValidationError`, `ToolCallValidationFailureReason`, `ValidateToolCallsOption`, `ValidatedToolCall`, and `validateToolCallRequests`.
- `packages/lattice/src/providers/provider.ts` exposes optional `ProviderRunResponse.toolCalls`.
- `packages/lattice/src/agent/format-tools.ts` exports `parseToolUseEnvelope`.
- `packages/lattice/src/providers/adapters.ts`, `anthropic.ts`, and `gemini.ts` import `parseToolUseEnvelope` plus `validateToolCallRequests`, and add `validateToolCalls?: ValidateToolCallsOption`.
- OpenAI, OpenRouter, xAI, and LM Studio inherit validation through the shared OpenAI-compatible adapter path.
- `packages/lattice/src/agent/runtime.ts` prefers `response.toolCalls` when present and keeps parser fallback when absent.
- `packages/lattice/src/providers/parity.test.ts` iterates all seven provider ids and verifies valid, drop, and throw behavior.
- `.changeset/v1.3.0-tool-call-validation.md` documents the new opt-in returned tool-call validation surface and avoids native tool-use claims.

## Verification Commands

- `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools adapters openrouter xai lm-studio agent/runtime anthropic gemini parity public-surface` - passed, 11 files / 295 tests.
- `pnpm --filter @full-self-browsing/lattice build` - passed.
- `pnpm --filter @full-self-browsing/lattice test:types` - passed, 78 files / 992 tests / no type errors, plus `tsd`.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.

## Requirements

- `VALID-01` - complete.
- `VALID-02` - complete.
- `VALID-03` - complete.

## Residual Follow-Up

Security enforcement is enabled and no Phase 37 security artifact exists yet. Run `$gsd-secure-phase 37` before advancing if strict gate completion is required.
