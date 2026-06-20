---
id: 55-01
phase: 55
name: Compatibility and Dogfood Evidence
status: complete
completed_at: 2026-06-20
commit: d9fdb20
---

# Summary 55-01: Compatibility and Dogfood Evidence

## Completed

- Added `scripts/check-lattice-node20-modular.mjs`, which locates a real Node 20 binary, asserts package compatibility metadata, and imports every built facade labelled `node20-compatible`.
- Added root scripts:
  - `pnpm check:node20-modules`
  - `pnpm example:external-consumer`
- Added GitFly-style dogfood coverage for:
  - provider-only native tools, tool choice, structured output, and returned tool-call validation,
  - external execution audit wrapping with signed receipts, sidecar metadata, replay, raw request/response hashes, and feature-flag metadata.
- Added `examples/external-consumer/index.mjs` showing independent core, tools/MCP, audit, and eval adoption slices using built package subpaths.
- Expanded `docs/modular-entrypoints.md` with context/artifact-only, routing advisory, eval-only, full-runtime, and validation-command guidance.

## Requirements Closed

- COMP-01: Node 20 compatibility is executed for every modular layer labelled `node20-compatible`.
- COMP-02: Node 24 remains the documented full-runtime baseline through `engines.node >=24` and `./agents` compatibility metadata.
- DOG-01: GitFly-style provider-only native tool and structured output behavior is covered without runtime/agent APIs.
- DOG-02: GitFly-style external audit, receipt, replay, and feature-flag metadata wrapping is covered.
- DOG-03: The external-consumer example demonstrates multiple independent adoption slices from built subpaths.
- DOG-04: Modular adoption documentation now covers provider-only, audit-only, context/artifact-only, routing advisory, MCP/tools-only, eval-only, and full runtime paths.

## Review

Code review status: clean.

## Verification

- `pnpm --filter @full-self-browsing/lattice test -- gitfly-dogfood`
- `pnpm check:node20-modules`
- `pnpm example:external-consumer`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice test:types`
- `pnpm --filter @full-self-browsing/lattice lint:packages`
