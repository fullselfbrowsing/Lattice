---
phase: 48-eval-diagnostics-cli-expansion
plan: 01
subsystem: cli
tags: [eval, agents, ci]
requires:
  - phase: 39-agent-crew-surface
    provides: evalAgentRun kernel and AgentRunSnapshot type
provides:
  - lattice eval --agent mode
  - versioned agent eval fixture and baseline loaders
  - lattice-agent-eval/v1 JSON report
affects: [cli, eval]
tech-stack:
  added: []
  patterns: [dependency-injected CLI handler, versioned JSON fixture files]
key-files:
  created:
    - packages/lattice-cli/src/eval/agent-types.ts
    - packages/lattice-cli/src/eval/agent-runner.ts
    - packages/lattice-cli/test/agent-eval.test.ts
  modified:
    - packages/lattice-cli/src/commands/eval.ts
key-decisions:
  - "Use additive `lattice eval --agent` instead of changing the existing eval command shape."
  - "Keep the existing receipt replay report as `lattice-eval/v1` and emit agent reports as `lattice-agent-eval/v1`."
patterns-established:
  - "Agent eval fixtures are simple local JSON snapshots keyed by fixture id."
requirements-completed: [EVAL-01, EVAL-02]
duration: 9min
completed: 2026-06-16
---

# Phase 48 Plan 01 Summary

**Agent-run eval mode for CI regression gating**

## Accomplishments

- Added `AgentEvalConfig`, fixture/baseline file types, per-fixture reports, and `lattice-agent-eval/v1` report types.
- Added a runner that loads current snapshots from a fixture directory, loads a baseline JSON file, and calls `evalAgentRun()` for matching fixture ids.
- Added `lattice eval --agent` dispatch with one-line JSON stdout, compact stderr summaries, and exit-code parity with existing eval.
- Covered pass, regression, new-fixture, and malformed-fixture paths.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice-cli test -- agent-eval receipt-diff diagnostics cli eval
pnpm --filter @full-self-browsing/lattice-cli typecheck
```

Both passed after implementation.
