---
phase: 55
status: passed
verified_at: 2026-06-20
---

# Phase 55 Verification

## Result

Passed.

## Commands

| Command | Result | Notes |
|---------|--------|-------|
| `pnpm --filter @full-self-browsing/lattice test -- gitfly-dogfood` | Pass | GitFly-style provider and external audit dogfood scenarios passed; focused suite reported 82 files and 1,051 tests. |
| `pnpm check:node20-modules` | Pass | Built Lattice, found Node 20.18.2, and imported `./artifacts`, `./audit`, `./context`, `./core`, `./eval`, `./routing`, and `./tools`. |
| `pnpm example:external-consumer` | Pass | Built Lattice and ran core, tools, audit, and eval consumer slices. |
| `pnpm --filter @full-self-browsing/lattice typecheck` | Pass | TypeScript completed with no errors. |
| `pnpm --filter @full-self-browsing/lattice test:types` | Pass | 102 test files and 1,251 tests passed; no type errors; `tsd` passed. |
| `pnpm --filter @full-self-browsing/lattice lint:packages` | Pass | Build, module boundaries, publint, attw, and CLI dependency checks passed. |

## Requirement Evidence

- COMP-01: `scripts/check-lattice-node20-modular.mjs` spawns Node 20 and imports every built facade labelled `node20-compatible`.
- COMP-02: The Node 20 checker asserts the root package remains Node `>=24` and `./agents` remains `node24-runtime`.
- DOG-01: `packages/lattice/test/gitfly-dogfood.test.ts` covers direct provider execution with native tool request shaping, structured output parsing, and validated returned tool calls.
- DOG-02: `packages/lattice/test/gitfly-dogfood.test.ts` covers external execution audit wrapping, receipt verification, replay, hashes, and feature-flag metadata.
- DOG-03: `examples/external-consumer/index.mjs` demonstrates built-subpath usage for core, tools/MCP, audit, and eval slices.
- DOG-04: `docs/modular-entrypoints.md` documents the required adoption paths and validation commands.

## Human Verification

None required.
