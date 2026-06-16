# Phase 48 Research: Eval + Diagnostics CLI Expansion

**Date:** 2026-06-16
**Mode:** Local codebase research

## Findings

### Existing CLI Contract

The CLI is intentionally small:
- `packages/lattice-cli/src/cli.ts` registers `repro`, `verify`, and `eval`.
- Each command exports a testable `runX(args, deps)` handler and a default citty command.
- Existing tests call handlers directly with captured stdout/stderr/exit, then use one bin smoke test for command registration.

The safest expansion path is additive:
- Add `--agent` to `eval` without changing the default receipt replay flow.
- Add separate command groups for `receipt` and `diagnostics`.
- Preserve one JSON stdout line for report-producing commands.

### Agent Eval Kernel

`packages/lattice/src/agent/eval.ts` already provides the comparison kernel:
- `AgentRunSnapshot` captures `iterationsToGoal` and normalized `Usage`.
- `EvalOptions` exposes `iterationsToGoalRegressionLimit` and `costUsdRegressionLimit`.
- `evalAgentRun()` returns `ok` plus regression entries for iteration, cost, or mixed-cost unknown states.

The CLI only needs fixture discovery, baseline loading, report shaping, and exit-code mapping.

### Receipt Diff Inputs

`ReceiptEnvelope` is exported by the core package. The CLI already validates envelope shape through `loadReceiptByIdOrPath()`. Diff can decode `envelope.payload` with `Buffer.from(payload, "base64")` in the Node-only CLI, parse the signed body as JSON, and compare selected stable fields.

Diff should not reuse `verifyReceipt()` by default because the requirement is to compare two envelopes. Verification needs keysets and has a different failure model already covered by `lattice verify`.

### Diagnostics Inputs

`RunEvent` values have:
- `kind`
- `timestamp`
- `runId`
- optional `providerId`
- optional `modelId`
- optional `metadata`

Provider attempt lifecycle information may appear as multiple `provider.attempt` events with status in metadata. The diagnostic module should accept both explicit duration metadata and inferred timestamp brackets. Since Phase 47 added safe OTel export from the same event stream, diagnostics should remain offline and content-safe.

## Risks

- `lattice eval --agent` could accidentally change the default `lattice eval` report. Mitigation: tests assert default mode still returns `lattice-eval/v1`.
- Receipt diff could leak too much payload. Mitigation: compare only receipt metadata, usage, hashes, lineage, and signatures. Do not print arbitrary body content.
- LM Studio attempt pairing could be approximate if events lack attempt ids. Mitigation: deterministic FIFO pairing per run/provider/model and support explicit duration metadata where present.
- Citty nested command behavior is less exercised in this codebase. Mitigation: use top-level command groups with one subcommand each, plus smoke tests.

## Decisions

- No new runtime dependencies.
- No web research required; this phase consumes existing project contracts and Node CLI primitives.
- CLI package receives the changeset unless implementation unexpectedly changes core exports.
