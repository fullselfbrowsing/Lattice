---
phase: 22-agent-showcase-eval-mode
verified: 2026-05-31T00:00:00Z
status: passed
score: 2/2 must-haves verified
overrides_applied: 0
verification_mode: real-runtime
---

# Phase 22: Agent Showcase + Eval Mode Verification Report

**Phase Goal:** Ship a runnable showcase exercising the full Phase 19-21 agent surface (SHOWCASE-AGENT-01) and a pure `evalAgentRun` regression-gate helper that any future `lattice eval --agent` CLI would reuse (SHOWCASE-AGENT-02).

**Verified:** 2026-05-31
**Status:** passed via real-runtime end-to-end + 11 unit tests.

## Goal Achievement

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The `examples/agent-loop/` showcase runs end-to-end against a fake provider, exercises all 5 Phase 21 primitives wired into hooks, and mints per-iteration receipts that verify under the ephemeral KeySet | VERIFIED | `node examples/agent-loop/index.mjs` produces `iterations=3 receipts=3 verified=true` and a writable receipt directory; cost tracker reports total `0.0006`; goal-progress reports `progressing`; eval helper reports `ok=true`. SHOWCASE-AGENT-01 closed. |
| 2 | `evalAgentRun(baseline, current, options?)` regression helper exported from the public surface; gates iterations-to-goal + cost with configurable thresholds | VERIFIED | `packages/lattice/src/agent/eval.ts` ships the helper + `AgentRunSnapshot`, `EvalOptions`, `EvalRegression`, `EvalRegressionKind`, `AgentEvalResult` types. `eval.test.ts` covers 11 cases (identity, iteration tolerance, iteration regression, custom iter limit, cost within 10%, cost regression, custom cost limit, mixed-cost-unknown, both-unmeasured, baseline=$0 → current>$0, multi-regression aggregation). SHOWCASE-AGENT-02 closed. |

## File-Level Evidence

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/agent/eval.ts` | NEW — `evalAgentRun()`, `AgentRunSnapshot`, `EvalOptions`, `EvalRegression`, `EvalRegressionKind`, `AgentEvalResult` | LANDED |
| `packages/lattice/src/agent/eval.test.ts` | NEW — 11 vitest cases | LANDED |
| `packages/lattice/src/index.ts` | `evalAgentRun` value + 5 type-only Phase 22 re-exports; `BAND` const promoted to public surface for showcase usage | LANDED |
| `examples/agent-loop/package.json` | NEW workspace marker | LANDED |
| `examples/agent-loop/setup.mjs` | NEW — Ed25519 signer + KeySet, scripted fake provider, 2 tools, hook pipeline with PermissionContext guard, all 5 primitives instantiated and wired | LANDED |
| `examples/agent-loop/index.mjs` | NEW — runs the agent, captures receipts via tracer, verifies each, prints structured stdout + copy-pastable next-step | LANDED |
| `.planning/phases/22-agent-showcase-eval-mode/22-VERIFICATION.md` | NEW (this file) | LANDED |

## Test Posture

| Workspace | Pre-Phase 22 | Post |
|---|---:|---:|
| `packages/lattice` | 578 | 589 (+11 eval) |
| `packages/lattice-cli` | 144 | 144 |
| **Total** | **722** | **733** |

## REQ-IDs Closed

| REQ-ID | Module | Status |
|---|---|---|
| SHOWCASE-AGENT-01 | `examples/agent-loop/*` | CLOSED |
| SHOWCASE-AGENT-02 | `packages/lattice/src/agent/eval.ts` | CLOSED |

## Conclusion

Phase 22 verified passed. The showcase composes every surface shipped in Track B (Phase 19 runtime + auto-checkpoint, Phase 20 host seam-aware design, Phase 21 infrastructure primitives) plus the v1.1 receipt verification round-trip. The eval helper is a small pure kernel ready for future CLI extension. **Carried forward to Phase 23**: milestone audit + `v1.2.0` tag.

**Deferred from Phase 22**: `lattice eval --agent` CLI subcommand (only the kernel ships in v1.2); multi-scenario showcase; native tool_use (waits for post-v1.2 ProviderAdapter additive extension).
