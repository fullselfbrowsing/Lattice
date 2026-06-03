---
phase: 19-delegation-surface-agent-runtime-entrypoint
verified: 2026-05-31T00:00:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
verification_mode: real-runtime
---

# Phase 19: Delegation Surface Policy Flip + Agent Runtime Entrypoint Verification Report

**Phase Goal:** Lattice opens the **Delegation** surface previously declared out of scope in v1.x `AGENTS.md`. A new `ai.runAgent(intent)` method ships on the runtime returned by `createAI`. The runtime drives a tool_use protocol loop across the 7 v1.1 + v1.2 provider adapters, composes with the Phase 15 `HookPipeline` for safety-band veto and observability-band per-iteration receipt minting, and emits per-iteration events. Single-agent only (multi-agent crews remain Out of Scope).

**Verified:** 2026-05-31
**Status:** passed via real-runtime tests (no Lattice primitive mocks)

## Implementation Note — Native tool_use Deferred

During Plan 19-03 implementation it surfaced that native tool_use protocols (Anthropic Messages-API `tools[]`, OpenAI Chat-Completions `tools[]`, Gemini `function_declarations`) cannot ship without modifying the `ProviderAdapter` interface in a way that risks breaking the v1.2 Phase 17 INV-03 7-provider parity contract. Phase 19 therefore ships **prompt-reencoded mode uniformly across all 7 providers** (openai, openai-compat, anthropic, gemini, xai, openrouter, lm-studio) — the agent loop encodes conversation + tool descriptions + JSON-envelope instructions into the unchanged `ProviderRunRequest.task` field and parses tool-call envelopes from the response text. This is documented as a deferral in Plan 19-03 SUMMARY and AGENTS.md; the CONTEXT.md Q3 "native where supported" decision is treated as forward-compat intent for a follow-on milestone where the ProviderAdapter interface can be additively extended.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `AGENTS.md` policy stance flipped: single-agent execution in scope; multi-agent crews still out of scope | VERIFIED | `AGENTS.md` "Agent Execution Policy" section + updated "What Not To Use" row 127. Plan 19-01 commit `a0e5c9c`. DELEG-01 closed. |
| 2 | `ai.runAgent(intent)` reachable as a method on the runtime returned by `createAI` | VERIFIED | `AI` interface in `runtime/create-ai.ts` declares `runAgent<TOutputs>(intent)`. `createAI()` returns an object with `runAgent` as a callable function. `public-surface.test.ts` "createAI() returns a runtime exposing ai.runAgent next to ai.run" asserts this. AGENT-01 closed. |
| 3 | Agent loop drives a tool_use protocol across the 7 v1.2 provider adapters via the unchanged `ProviderAdapter` interface | VERIFIED | `formatToolsForProvider` accepts all 7 provider names and returns a prompt-reencoded handle that works with the unchanged `ProviderAdapter`. `format-tools.test.ts` `describe.each(ALL_PROVIDERS)` exercises all 7 adapters end-to-end against the same handle shape (12 cases × 7 = 84 provider cases). `runtime.test.ts` "tool-use multi-iteration" + `integration.test.ts` "completes a 2-iteration flow" prove end-to-end dispatch via fake provider's `execute()`. AGENT-02 closed. |
| 4 | Each agent iteration emits BEFORE/AFTER_AGENT_ITERATION via the existing HookPipeline so observability composes with `createCheckpointHook` (per-iteration v1.1 receipts when signer configured) | VERIFIED | `runtime.test.ts` "fires BEFORE_AGENT_ITERATION and AFTER_AGENT_ITERATION in order per iteration". `integration.test.ts` "completes a 2-iteration flow" captures 2 minted receipts via the auto-registered checkpoint hook reading `stepIndex` / `stepName` / `timestamp` from the iteration context. Each receipt verifies cleanly against the ephemeral KeySet (`verifyResult.ok === true`). AGENT-03 closed. |
| 5 | A `BAND.SAFETY` handler can deny an iteration via `controls.deny(reason)` before any provider call; runtime returns `AgentFailure { kind: "agent-iteration-denied" }` with the reason | VERIFIED | `bands.test.ts` "Phase 19 deny pattern" cases (5 cases): set, null, reset, multi-handler-wins, backward-compat. `runtime.test.ts` "returns agent-iteration-denied when a SAFETY handler calls controls.deny" proves end-to-end veto: the iteration aborts BEFORE provider invocation and surfaces the denial reason on the returned `AgentFailure`. AGENT-04 closed. |

## File-Level Evidence

### Plan 19-01 (DELEG-01)

| File | Change | Status |
|---|---|---|
| `AGENTS.md` | Modified row 127 (OpenAI Agents SDK guidance) + new "Agent Execution Policy" section between "What Not To Use" and "Initial Install Sets" | LANDED |

### Plan 19-02 (foundation)

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/agent/types.ts` | NEW — AgentIntent, AgentSuccess, AgentFailure, AgentResult, AgentFailureKind, IterationRecord, AgentDeniedError, AgentHost (forward-decl), ToolUseRequest | LANDED |
| `packages/lattice/src/contract/contract.ts` | BudgetInvariant extended with `maxIterations?` + `maxWallTimeMs?` (additive) | LANDED |
| `packages/lattice/src/contract/bands.ts` | HookLifecycleEvent + BEFORE/AFTER_AGENT_ITERATION; HookControls + HookDenyDirective; HookHandler signature gains optional `controls?: HookControls` (backward compat); `lastDenialReason()` accessor on HookPipeline; per-run reset | LANDED |
| `packages/lattice/src/contract/bands.test.ts` | +6 cases (1 iteration-events, 5 deny-pattern + backward compat) | LANDED |

### Plan 19-03 (AGENT-02)

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/agent/format-tools.ts` | NEW — `formatToolsForProvider(name, tools, options)` returns `FormattedToolsHandle`; `toolSchemaToJsonSchema(schema)` helper; `ConversationTurn` type; prompt-reencoded mode across all 7 providers | LANDED |
| `packages/lattice/src/agent/format-tools.test.ts` | NEW — 88 vitest cases (`describe.each` × 7 providers × 12 cases each + 4 helper cases) | LANDED |

### Plan 19-04 (AGENT-01, AGENT-03, AGENT-04)

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/agent/runtime.ts` | NEW — `runAgent(intent, config)` orchestrator: sticky provider; budget enforcement (maxIterations, maxWallTimeMs, maxCostUsd); HookPipeline auto-creation + auto-checkpoint registration; BEFORE/AFTER_AGENT_ITERATION emission; tool dispatch via runTool + artifact.toolResult wrapping; unknown-tool graceful handling; final-answer materialization | LANDED |
| `packages/lattice/src/agent/runtime.test.ts` | NEW — 11 vitest cases (final-answer, multi-iter tool-use, sticky, deny, budget×3, lifecycle events, unknown tool, execution_unavailable, provider error) | LANDED |
| `packages/lattice/src/runtime/create-ai.ts` | `AI` interface extended with `runAgent<TOutputs>(intent)` method; `createAI()` returns an object including `runAgent` (lazy-imports `agent/runtime.ts`) | LANDED |

### Plan 19-05 (closure)

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/index.ts` | Public surface re-exports for `runAgent`, `formatToolsForProvider`, `toolSchemaToJsonSchema`, `AgentDeniedError`, and all 13 type-only re-exports (AgentIntent / AgentResult / AgentSuccess / AgentFailure / AgentFailureKind / AgentHost / IterationRecord / ToolUseRequest / ConversationTurn / FormatToolsMode / FormatToolsOptions / FormattedToolsHandle / HookControls / HookDenyDirective) | LANDED |
| `packages/lattice/test/public-surface.test.ts` | +3 cases (value exports, type-only exports, createAI runtime exposes runAgent) | LANDED |
| `packages/lattice/src/agent/integration.test.ts` | NEW — 3 end-to-end integration cases: (1) 2-iteration flow + 2 minted receipts that verify against ephemeral KeySet; (2) `autoRegisterCheckpoint: false` suppresses minting; (3) caller-supplied SAFETY handler + auto-checkpoint coexist | LANDED |
| `.planning/phases/19-delegation-surface-agent-runtime-entrypoint/19-VERIFICATION.md` | NEW (this file) | LANDED |

## Test Posture

| Workspace | Pre-Phase 19 | Plan 19-02 close | Plan 19-04 close | Plan 19-05 close (final) |
|---|---:|---:|---:|---:|
| `packages/lattice` | 414 | 420 (+6 bands deny) | 519 (+88 format-tools, +11 runtime) | 525 (+3 public-surface, +3 integration) |
| `packages/lattice-cli` | 144 | 144 | 144 | 144 |
| **Total** | **558** | **564** | **663** | **669** |

**Phase 19 net: +111 new vitest cases across 6 source/test files. 669 PASS / 0 FAIL on `pnpm -r test`.**

## REQ-IDs Closed

| REQ-ID | Plan | Status |
|---|---|---|
| DELEG-01 | 19-01 | CLOSED |
| AGENT-01 | 19-04 | CLOSED |
| AGENT-02 | 19-03 | CLOSED (prompt-reencoded mode; native tool_use deferred per Implementation Note) |
| AGENT-03 | 19-04 | CLOSED |
| AGENT-04 | 19-02 + 19-04 | CLOSED |

## Conclusion

Phase 19 verified passed via real-runtime tests against a real Ed25519 signer + receipt verifier + fake provider. The agent loop composes cleanly with all Phase 14-18 surfaces (band pipeline, checkpoint hook, receipt envelope, survivability adapter forward-decl, provider adapters). Ready to merge into `v1.2` branch + advance to Phase 20.

**Deferral carried to Phase 20+:** Native tool_use (Anthropic / OpenAI / Gemini structured `tools[]` fields). The agent loop's pluggable `AgentHost` (Phase 20) will surface a per-host transport seam that can opt into native protocols without breaking the v1.2 ProviderAdapter parity contract.
