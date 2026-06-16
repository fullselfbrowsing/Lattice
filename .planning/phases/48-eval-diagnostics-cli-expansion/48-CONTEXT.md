# Phase 48: Eval + Diagnostics CLI Expansion - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 48 expands `@full-self-browsing/lattice-cli` so local and CI users can gate agent-loop regressions, inspect receipt differences, and summarize LM Studio latency from run-event logs. In scope: an additive agent eval mode that wraps the existing `evalAgentRun` kernel, a receipt-diff command that compares signed receipt envelopes without requiring verification keys, and a local diagnostics command that reads Lattice `RunEvent` JSON and reports latency-tail statistics for LM Studio provider attempts.

Out of scope: changing the existing receipt replay `lattice-eval/v1` report, adding hosted observability, requiring provider API keys, adding non-core CLI dependencies, verifying receipt signatures inside diff by default, building an eval dashboard, or adding runtime event kinds solely for diagnostics.

</domain>

<decisions>
## Implementation Decisions

### Agent Eval Surface
- Use an additive `lattice eval --agent` mode instead of restructuring the existing `eval` command into nested subcommands. This preserves the current `lattice eval` receipt replay behavior and keeps existing scripts compatible.
- Agent eval loads current fixtures from a directory and baseline snapshots from a JSON file, then calls the core `evalAgentRun()` kernel for every fixture id found.
- The agent report uses a new `version: "lattice-agent-eval/v1"` envelope. The existing receipt replay report stays `version: "lattice-eval/v1"` and must not gain agent-only fields.
- Agent eval exits 0 for no regressions, 1 for any regression, and 2 for malformed or missing input. Stdout remains exactly one JSON line on successful report creation; stderr carries compact human summary lines.

### Fixture and Baseline Shape
- Agent current fixtures should be simple JSON files with `version: "lattice-agent-eval-fixture/v1"`, `fixtureId`, and `snapshot`.
- Agent baseline should be one JSON file with `version: "lattice-agent-eval-baseline/v1"` and a `fixtures` object keyed by fixture id.
- Snapshots use the public `AgentRunSnapshot` shape: `iterationsToGoal` plus normalized `usage` with `promptTokens`, `completionTokens`, and `costUsd`.
- Missing baseline entries should be reported as `new-fixture`, not as regressions. Malformed fixture files abort the command with exit 2 so CI does not silently skip bad inputs.

### Receipt Diff Surface
- Add `lattice receipt diff --left <path> --right <path>` as a new top-level command group. The explicit left/right flags avoid ambiguous positional ordering in scripts.
- Diff decodes the DSSE payload body directly from each receipt envelope and compares fields that are safe to report: model, route, usage, input hashes, output hash, lineage merkle root, parent receipt CID, receipt id/run id/kid, and signature key ids/signature values.
- The command emits `version: "lattice-receipt-diff/v1"` JSON with stable `differences[]` entries. Exit 0 means equal for the compared fields, 1 means differences, and 2 means load/decode failure.
- Diff does not verify signatures by default. It is a structural comparison tool; `lattice verify` remains the integrity check.

### LM Studio Diagnostics
- Add a local-only diagnostics command, `lattice diagnostics lm-studio --events <path>`.
- The input file may be either a raw array of `RunEvent` objects or an object with an `events` array, matching common persisted run-result shapes.
- The latency calculation pairs `provider.attempt` start and terminal events by run/provider/model order. It should prefer explicit metadata duration when present, but infer duration from timestamps when events bracket attempts.
- The JSON report uses `version: "lattice-diagnostics/lm-studio-latency/v1"` and includes count, success/failure counts, min/p50/p95/p99/max latency, and slowest attempt descriptors.

### the agent's Discretion
- Keep loader, diff, and diagnostics logic in pure modules under `packages/lattice-cli/src/` with command handlers as thin citty wrappers.
- Reuse existing CLI error discipline: typed load errors map to `FAIL kind=... reason=...`, handlers are tested through dependency injection, and bin smoke tests only assert command registration/help behavior.
- Add a CLI changeset. Core package changes should be avoided unless a public type export is missing.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice-cli/src/commands/eval.ts` already exposes `runEval(args, deps)` with injected stdout/stderr/exit and a single-line JSON stdout contract.
- `packages/lattice-cli/src/eval/runner.ts` and `src/eval/types.ts` define the current receipt replay report, which is locked to `lattice-eval/v1`.
- `packages/lattice/src/agent/eval.ts` exports `evalAgentRun`, `AgentRunSnapshot`, `EvalOptions`, and regression result types.
- `packages/lattice-cli/src/io/receipt-loader.ts` loads and validates receipt envelope shape and can be reused for diff.
- `packages/lattice/src/tracing/tracing.ts` defines `RunEvent`; the package root already exports `RunEvent` and `RunEventKind`.

### Established Patterns
- CLI commands use citty `defineCommand`, optional args are conditionally spread to satisfy `exactOptionalPropertyTypes`, and all testable handlers avoid process globals through injected deps.
- Exit-code conventions are consistent across `repro`, `verify`, and `eval`: 0 for success, 1 for semantic mismatch/regression, 2 for command/load failure.
- Tests prefer focused handler unit tests plus one `spawnSync` bin smoke test in `packages/lattice-cli/test/cli.test.ts`.
- Package type/build quality is enforced through `pnpm --filter @full-self-browsing/lattice-cli typecheck`, `test`, and `lint:packages`.

### Integration Points
- Add agent eval loader/runner modules under `packages/lattice-cli/src/eval/`.
- Extend `packages/lattice-cli/src/commands/eval.ts` with `--agent` args and dispatch while preserving the current default path.
- Add `packages/lattice-cli/src/commands/receipt.ts` and `src/receipt/diff.ts`, then register `receipt` in `src/cli.ts`.
- Add `packages/lattice-cli/src/commands/diagnostics.ts` and `src/diagnostics/lm-studio.ts`, then register `diagnostics` in `src/cli.ts`.
- Add tests under `packages/lattice-cli/test/` for agent eval, receipt diff, diagnostics, and CLI help registration.

</code_context>

<specifics>
## Specific Ideas

No external implementation dependency is needed. This phase is driven by existing local contracts:
- `evalAgentRun()` is already public and pure.
- `RunEvent` values already carry provider/model/timestamp metadata suitable for offline diagnostics.
- Receipt envelopes already contain base64 DSSE payload bytes and signatures, and structural diffing does not require key material.

</specifics>

<deferred>
## Deferred Ideas

Hosted eval storage, eval dashboards, judge-based agent quality scoring, signature verification in `receipt diff`, OpenTelemetry trace-file ingestion, cross-provider diagnostics beyond LM Studio, and automatic baseline update/writeback for agent eval are deferred.

</deferred>
