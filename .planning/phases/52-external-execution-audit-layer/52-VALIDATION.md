# Phase 52 Validation Plan

## Unit Tests

- Creates and verifies a signed external execution receipt.
- Emits receipt input/output hashes matching raw artifact/output values.
- Emits a `lattice-sidecar/v1` sidecar with raw external request/response metadata and hashes.
- Produces a replay envelope that `replayOffline` can return as a successful result when raw outputs are present.
- Works through the audit subpath export.
- Verifies an existing v1.2 receipt fixture still passes unchanged.

## Commands

- `node scripts/check-lattice-module-boundaries.mjs`
- `pnpm --filter @full-self-browsing/lattice test -- external-execution receipts replay`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice test:types`
- `pnpm --filter @full-self-browsing/lattice lint:packages`
