# Phase 48 Validation Strategy

## Automated Gates

Run before completing the phase:

```bash
pnpm --filter @full-self-browsing/lattice-cli test -- eval agent receipt diagnostics cli
pnpm --filter @full-self-browsing/lattice-cli typecheck
pnpm --filter @full-self-browsing/lattice-cli build
pnpm --filter @full-self-browsing/lattice-cli lint:packages
```

If focused test filtering misses coverage due to Vitest filename matching, run the full CLI test suite:

```bash
pnpm --filter @full-self-browsing/lattice-cli test
```

## Requirement Checks

- **EVAL-01:** `lattice eval --agent` loads fixture files, loads a baseline file, and returns JSON report entries produced from `evalAgentRun()`.
- **EVAL-02:** Existing `lattice eval` still emits `version: "lattice-eval/v1"` and the new agent mode emits `version: "lattice-agent-eval/v1"` with iterations and cost regressions.
- **EVAL-03:** `lattice receipt diff` reports model, route, usage, input/output hashes, lineage merkle root, parent receipt CID, and signature/key differences.
- **EVAL-04:** `lattice diagnostics lm-studio` reads run events locally and reports latency-tail statistics without network access.

## Test Matrix

### Agent Eval
- Passing fixture exits 0.
- Cost or iteration regression exits 1.
- Mixed-cost unknown is surfaced as a regression.
- Malformed fixture or baseline exits 2.
- Default receipt replay mode remains unchanged.

### Receipt Diff
- Equal selected receipt fields exit 0.
- Mismatched selected fields exit 1 and list stable paths.
- Malformed envelope or bad payload exits 2.
- Diff report includes signature/key differences.

### Diagnostics
- Successful LM Studio attempts produce min/p50/p95/p99/max latency values.
- Failed attempts count separately while still contributing latency if terminal timestamps are present.
- Non-LM Studio provider attempts are ignored.
- Malformed event files exit 2.

## Manual Checks

After build, inspect CLI help:

```bash
node packages/lattice-cli/dist/cli.js --help
node packages/lattice-cli/dist/cli.js eval --help
node packages/lattice-cli/dist/cli.js receipt --help
node packages/lattice-cli/dist/cli.js diagnostics --help
```
