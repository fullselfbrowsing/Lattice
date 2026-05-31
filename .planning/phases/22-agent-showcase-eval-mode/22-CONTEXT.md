# Phase 22: Agent Showcase + Eval Mode - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Forward. Final implementation phase before milestone audit (Phase 23).

<domain>
## Phase Boundary

Two artifacts:

1. **`examples/agent-loop/` showcase** (SHOWCASE-AGENT-01) — A runnable example that exercises the full Phase 19-21 agent surface end-to-end. Composes: `ai.runAgent`, all 5 Phase 21 primitives (cost tracker, transcript store, goal-progress, action-history, permission context), auto-registered checkpoint hook with signer, and the AgentHost storage seam. Produces signed per-iteration receipts that verify cleanly.

2. **`evalAgentRun(baseline, current)` helper** (SHOWCASE-AGENT-02) — A small pure-function exported from the public surface that gates a baseline-relative regression on iterations-to-goal + total cost. Returns a typed verdict the caller can wire into CI. Does NOT add a new `lattice eval --agent` subcommand to `lattice-cli` — that wider CLI extension is deferred to a follow-on milestone; this phase ships the kernel that any future CLI gate would use.

Out of scope for Phase 22: milestone audit / `v1.2.0` tag (Phase 23), Stage 5 submodule switchover.

</domain>

<decisions>
## Implementation Decisions

### Showcase Layout (SHOWCASE-AGENT-01)
- `examples/agent-loop/index.mjs` — single-file entry. Builds setup, runs the agent, prints stdout result with receipt path.
- `examples/agent-loop/setup.mjs` — generates ephemeral Ed25519 keypair + signer, fake provider scripted to a deterministic tool_use → final answer sequence, a tool registry with `sumOf` + `lookup` tools, a fresh hook pipeline, all 5 Phase 21 primitives configured and wired via hooks.
- Deterministic: the fake provider's scripted responses produce the same receipt sequence across runs (modulo timestamps + keypair material).
- Output: receipts written to a per-run temp directory; stdout prints a copy-pastable `lattice verify <path>` line.

### Eval Helper (SHOWCASE-AGENT-02)
- New `packages/lattice/src/agent/eval.ts`.
- Exports `evalAgentRun(baseline, current, options?)` returning `AgentEvalResult`.
- Inputs are two `AgentRunSnapshot` records summarizing iterations + cost.
- Default thresholds: `iterationsToGoalRegressionLimit: 1` (1 extra iteration tolerated), `costUsdRegressionLimit: 0.1` (10% cost increase tolerated).
- Result: `{ ok: boolean; regressions: ReadonlyArray<EvalRegression> }`.

</decisions>

<code_context>
## Existing Code Insights

- v1.1 `examples/work-inbox/` for showcase shape.
- v1.1 `packages/lattice-cli/src/eval/` for the existing eval kernel (we don't extend the CLI in Phase 22; only the pure helper kernel).

</code_context>

<specifics>
## Specific Ideas

- Showcase fake provider sequence:
  1. tool_use envelope requesting `lookup(query: "x")` 
  2. tool_use envelope requesting `sumOf(a: 2, b: 3)`
  3. final answer "Total is 5."
- Each iteration mints a v1.1 receipt via auto-checkpoint hook.

</specifics>

<deferred>
## Deferred Ideas

- `lattice eval --agent` CLI subcommand (the kernel is in eval.ts; wiring it into citty + adding fixture discovery is OOS for v1.2).
- Showcase with Anthropic / OpenAI native tool_use (waits for the post-v1.2 ProviderAdapter additive extension).
- Multi-scenario showcase (single-scenario is sufficient for v1.2 verification).

</deferred>
