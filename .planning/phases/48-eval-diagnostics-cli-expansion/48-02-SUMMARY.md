---
phase: 48-eval-diagnostics-cli-expansion
plan: 02
subsystem: cli
tags: [receipts, diff, diagnostics]
requires:
  - phase: 46-receipt-provenance-kms-signer-shapes
    provides: lineage merkle root and parent receipt CID fields
provides:
  - lattice receipt diff command group
  - lattice-receipt-diff/v1 JSON report
  - structural receipt body comparison without key material
affects: [cli, receipts]
tech-stack:
  added: []
  patterns: [structural JSON decode, path-based diff report]
key-files:
  created:
    - packages/lattice-cli/src/receipt/diff.ts
    - packages/lattice-cli/src/commands/receipt.ts
    - packages/lattice-cli/test/receipt-diff.test.ts
  modified:
    - packages/lattice-cli/src/cli.ts
    - packages/lattice-cli/test/cli.test.ts
key-decisions:
  - "Make receipt diff a structural comparison tool; `lattice verify` remains the signature integrity check."
  - "Report granular paths for model, route, usage, hashes, lineage, parent receipt, and signature/key changes."
patterns-established:
  - "Receipt comparison reports use explicit versioned JSON with deterministic `differences[]` paths."
requirements-completed: [EVAL-03]
duration: 7min
completed: 2026-06-16
---

# Phase 48 Plan 02 Summary

**Receipt structural diff command**

## Accomplishments

- Added `lattice receipt diff --left <path> --right <path>`.
- Added safe receipt payload decoding with structural body validation.
- Added diff coverage for model, route, usage, input/output hashes, lineage merkle root, parent receipt CID, and signature count/key/value fields.
- Added command tests for equal receipts, required mismatch paths, and malformed payload failure.

## Review Follow-Up

- Hardened the diff decoder during review so payloads that decode to arbitrary JSON objects no longer flow into partial `undefined` comparisons; malformed receipt bodies now fail with exit 2.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice-cli test -- receipt-diff diagnostics agent-eval eval cli
pnpm --filter @full-self-browsing/lattice-cli typecheck
```

Both passed after the hardening patch.
