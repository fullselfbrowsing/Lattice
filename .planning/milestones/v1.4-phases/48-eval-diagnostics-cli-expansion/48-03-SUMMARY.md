---
phase: 48-eval-diagnostics-cli-expansion
plan: 03
subsystem: cli
tags: [diagnostics, lm-studio, run-events]
requires:
  - phase: 47-opentelemetry-exporter-langfuse-phoenix-paths
    provides: stable RunEvent vocabulary and local event trail
provides:
  - lattice diagnostics lm-studio command group
  - local LM Studio latency-tail report
  - support for array-shaped and object-shaped event files
affects: [cli, diagnostics]
tech-stack:
  added: []
  patterns: [offline run-event analysis, deterministic percentile summary]
key-files:
  created:
    - packages/lattice-cli/src/diagnostics/lm-studio.ts
    - packages/lattice-cli/src/commands/diagnostics.ts
    - packages/lattice-cli/test/diagnostics.test.ts
  modified:
    - packages/lattice-cli/src/cli.ts
    - packages/lattice-cli/test/cli.test.ts
key-decisions:
  - "Keep LM Studio diagnostics local-only over saved RunEvent JSON."
  - "Pair provider.attempt start and terminal events by run/provider/model FIFO, with explicit duration metadata as an override."
patterns-established:
  - "Diagnostics commands emit versioned JSON reports and no hosted telemetry."
requirements-completed: [EVAL-04]
duration: 6min
completed: 2026-06-16
---

# Phase 48 Plan 03 Summary

**LM Studio latency-tail diagnostics**

## Accomplishments

- Added `lattice diagnostics lm-studio --events <path>`.
- Added loader support for `RunEvent[]` files and `{ events: RunEvent[] }` files.
- Added LM Studio provider filtering, attempt pairing, explicit-duration support, incomplete count tracking, and min/p50/p95/p99/max/average latency summaries.
- Covered successful, failed, incomplete, non-LM Studio, zero-count, and malformed event-file paths.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice-cli test -- diagnostics cli
pnpm --filter @full-self-browsing/lattice-cli typecheck
```

Both passed.
