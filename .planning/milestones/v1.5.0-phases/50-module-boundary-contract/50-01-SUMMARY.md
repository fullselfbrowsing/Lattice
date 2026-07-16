---
phase: 50-module-boundary-contract
plan: 01
subsystem: package-api
tags: [modular-entrypoints, package-exports, boundary-checks, tsd]
requires: []
provides:
  - Modular package subpaths for providers, audit, context, artifacts, routing, tools, storage, eval, agents, and core
  - Machine-readable compatibility metadata in package.json
  - Deterministic boundary check for provider-only, audit-only, and core-only source entrypoints
  - Source and package type tests for modular entrypoints
affects: [phase-51-provider-execution-parity, phase-52-external-execution-audit-layer, phase-55-compatibility-dogfood-validation]
tech-stack:
  added: []
  patterns:
    - Thin source facade entrypoints
    - Source import graph boundary scanning
    - Package subpath tsd smoke tests
key-files:
  created:
    - packages/lattice/src/providers.ts
    - packages/lattice/src/audit.ts
    - packages/lattice/src/context.ts
    - packages/lattice/src/artifacts.ts
    - packages/lattice/src/routing.ts
    - packages/lattice/src/tools.ts
    - packages/lattice/src/storage.ts
    - packages/lattice/src/eval.ts
    - packages/lattice/src/agents.ts
    - packages/lattice/src/core.ts
    - packages/lattice/src/tools/tool-use.ts
    - scripts/check-lattice-module-boundaries.mjs
    - docs/modular-entrypoints.md
    - packages/lattice/test/modular-entrypoints.test.ts
    - packages/lattice/test-d/modular-entrypoints.test-d.ts
  modified:
    - package.json
    - packages/lattice/package.json
    - packages/lattice/tsdown.config.ts
    - packages/lattice/src/agent/format-tools.ts
    - packages/lattice/src/agent/types.ts
    - packages/lattice/src/providers/adapters.ts
    - packages/lattice/src/providers/anthropic.ts
    - packages/lattice/src/providers/gemini.ts
    - packages/lattice/src/tools/tool-call-validation.ts
key-decisions:
  - "Provider-only, audit-only, and core-only boundaries are enforced against runtime imports of src/agent/**."
  - "Generic tool-use envelope parsing now lives in the neutral tools layer so providers do not import agent formatter code."
  - "The package-level Node engine remains >=24 while per-module compatibility labels live in lattice.modules metadata and docs."
patterns-established:
  - "New package subpaths are thin explicit source facades included as tsdown entries."
  - "Package metadata and docs share the same compatibility labels: node20-compatible, node24-runtime, adapter-specific."
requirements-completed: [MOD-01, MOD-02, MOD-03, MOD-04]
duration: 27min
completed: 2026-06-20
---

# Phase 50 Plan 01: Module Boundary Contract Summary

**Modular package subpaths with compatibility metadata, source boundary enforcement, and type/package tests**

## Performance

- **Duration:** 27 min
- **Started:** 2026-06-20T02:00:00Z
- **Completed:** 2026-06-20T02:27:26Z
- **Tasks:** 4
- **Files modified:** 25

## Accomplishments

- Added package subpath facades for providers, audit, context, artifacts, routing, tools, storage, eval, agents, and core while keeping the root export unchanged.
- Added `lattice.modules` package metadata and `docs/modular-entrypoints.md` with compatibility labels and provider-only/audit-only/core-only examples.
- Added `scripts/check-lattice-module-boundaries.mjs`, wired into root checks and package lint, to fail if provider-only, audit-only, or core-only source entrypoints reach `src/agent/**`.
- Moved generic tool-use envelope parsing into `src/tools/tool-use.ts`, preserving agent re-exports while removing provider runtime imports from agent formatter code.
- Added Vitest and `tsd` coverage for source facades, package metadata, and built package subpath imports.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add modular source facades and build entries** - `1f6879b`
2. **Task 2: Add package exports, metadata, and adoption docs** - `9079043`
3. **Task 3: Add deterministic boundary check script** - `f6770db`
4. **Task 4: Protect source and package public surfaces** - `9e549c7`

## Files Created/Modified

- `packages/lattice/src/{providers,audit,context,artifacts,routing,tools,storage,eval,agents,core}.ts` - public modular source facades.
- `packages/lattice/src/tools/tool-use.ts` - neutral tool-use envelope request type and parser.
- `packages/lattice/package.json` - subpath exports, `lattice.modules` metadata, `tsd` subpath mapping, lint wiring.
- `packages/lattice/tsdown.config.ts` - multi-entry build configuration for subpaths.
- `scripts/check-lattice-module-boundaries.mjs` - source/package modular boundary check.
- `docs/modular-entrypoints.md` - modular adoption documentation.
- `packages/lattice/test/modular-entrypoints.test.ts` - source and package metadata tests.
- `packages/lattice/test-d/modular-entrypoints.test-d.ts` - built package subpath type smoke tests.

## Decisions Made

- Kept the full package engine at Node `>=24`; per-module Node 20 promises are labels for later compatibility validation, not a package-level engine downgrade.
- Treated agent and crew APIs as an explicit `@full-self-browsing/lattice/agents` opt-in path.
- Moved generic tool-use parsing out of `src/agent/format-tools.ts` rather than allowing provider adapters to depend on agent formatter code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Neutralized provider-to-agent tool-use imports**
- **Found during:** Task 3 (Add deterministic boundary check script)
- **Issue:** The new boundary check found provider facades reached `src/agent/types.ts` and `src/agent/format-tools.ts` through provider adapter tool-use parsing.
- **Fix:** Added `packages/lattice/src/tools/tool-use.ts`, updated providers and tool-call validation to import generic tool-use protocol from tools, and kept agent compatibility by re-exporting from agent modules.
- **Files modified:** `packages/lattice/src/tools/tool-use.ts`, provider adapters, `agent/format-tools.ts`, `agent/types.ts`, `tools/tool-call-validation.ts`.
- **Verification:** `node scripts/check-lattice-module-boundaries.mjs` and `pnpm --filter @full-self-browsing/lattice typecheck` passed.
- **Committed in:** `f6770db`

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** The deviation was required for MOD-04. It moved generic protocol code to a neutral layer without changing provider execution semantics.

## Issues Encountered

- `tsd` initially could not resolve package subpaths because the local `tsd.compilerOptions.paths` only mapped the root package. Added `@full-self-browsing/lattice/*` to map subpath imports to `dist/*.d.ts`.

## Verification

- `node scripts/check-lattice-module-boundaries.mjs` passed.
- `pnpm --filter @full-self-browsing/lattice test -- modular` passed: 78 files, 1029 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` passed.
- `pnpm --filter @full-self-browsing/lattice test:types` passed: 97 files, 1226 tests, no type errors, `tsd` clean.
- `pnpm --filter @full-self-browsing/lattice lint:packages` passed, including build, boundary check, `publint`, `attw --pack . --profile esm-only`, and CLI dependency check.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 51 can now build provider execution parity against `@full-self-browsing/lattice/providers`. Phase 52 can build external execution audit wrapping against `@full-self-browsing/lattice/audit`. Phase 55 should validate Node 20 behavior for the modules labeled `node20-compatible`.

---
*Phase: 50-module-boundary-contract*
*Completed: 2026-06-20*
