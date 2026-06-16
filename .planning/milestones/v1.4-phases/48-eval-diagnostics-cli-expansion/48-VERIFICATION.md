---
phase: 48-eval-diagnostics-cli-expansion
verified_at: 2026-06-16T03:42:30-05:00
status: passed
requirements_verified: [EVAL-01, EVAL-02, EVAL-03, EVAL-04]
automated:
  passed:
    - pnpm --filter @full-self-browsing/lattice-cli test -- agent-eval receipt-diff diagnostics cli eval
    - pnpm --filter @full-self-browsing/lattice-cli test -- receipt-diff diagnostics agent-eval eval cli
    - pnpm --filter @full-self-browsing/lattice-cli typecheck
    - pnpm --filter @full-self-browsing/lattice-cli test
    - pnpm --filter @full-self-browsing/lattice-cli build
    - pnpm --filter @full-self-browsing/lattice-cli lint:packages
  failed: []
human_verification: []
---

# Phase 48 Verification

## Result

Status: passed.

## Requirement Evidence

- **EVAL-01:** `lattice eval --agent` loads local fixture JSON, baseline JSON, invokes `evalAgentRun()`, and emits `lattice-agent-eval/v1`.
- **EVAL-02:** Agent reports include iterations-to-goal and cost outcome fields. Existing `lattice eval` receipt replay tests still emit `lattice-eval/v1`.
- **EVAL-03:** `lattice receipt diff` compares model, route, usage, input/output hashes, lineage merkle root, parent receipt CID, and signature/key fields.
- **EVAL-04:** `lattice diagnostics lm-studio` summarizes local LM Studio provider attempt latency tails from saved `RunEvent` JSON.

## Automated Evidence

```bash
pnpm --filter @full-self-browsing/lattice-cli test -- agent-eval receipt-diff diagnostics cli eval
pnpm --filter @full-self-browsing/lattice-cli test -- receipt-diff diagnostics agent-eval eval cli
pnpm --filter @full-self-browsing/lattice-cli typecheck
pnpm --filter @full-self-browsing/lattice-cli test
pnpm --filter @full-self-browsing/lattice-cli build
pnpm --filter @full-self-browsing/lattice-cli lint:packages
```

All passed.

## Notes

`tsdown` continues to warn that `noExternal` is deprecated and reports an existing ineffective dynamic import warning from bundled runtime output. These warnings predate this phase and do not fail package validation.
