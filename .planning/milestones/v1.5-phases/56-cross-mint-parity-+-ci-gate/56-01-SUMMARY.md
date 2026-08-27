---
phase: 56-cross-mint-parity-+-ci-gate
plan: 01
subsystem: ci
tags: [typescript, python, conformance, github-actions, parity]
requirements-completed: [PARITY-01, PARITY-02]
completed: 2026-07-06
---

# Phase 56 Plan 01: Cross-Mint Parity + CI Gate Summary

**Added cross-language mint parity and a SHA-pinned conformance CI workflow that gates
receipt/spec/conformance/Python-client drift through manifest, TS, Python, and parity checks.**

## Accomplishments

- Added `conformance/verify-ts/src/cross_mint_parity.test.ts`.
- The test spawns Python minting, asserts vector #0 intermediates, and verifies the envelope with TypeScript `verifyReceipt`.
- Added `.github/workflows/conformance.yml` with pinned checkout, pnpm, Node, and Python setup actions.
- Replaced the generator's checkout-fragile manifest mtime test with a manifest coverage assertion.

## Verification

- `cd conformance/vectors && shasum -a 256 -c MANIFEST.sha256` -> all 12 OK.
- `pnpm --filter @lattice-conformance/generate test` -> 28 passed.
- `pnpm --filter @lattice-conformance/verify-ts typecheck` -> passed.
- `pnpm --filter @lattice-conformance/verify-ts test` -> 33 passed, 1 skipped.
- `PYTHON=.context/python-venv/bin/python LATTICE_RUN_CROSS_MINT=1 pnpm --filter @lattice-conformance/verify-ts test -- src/cross_mint_parity.test.ts` -> 34 passed.
- `.context/python-venv/bin/python -m pytest clients/python/tests -q` -> 29 passed.

