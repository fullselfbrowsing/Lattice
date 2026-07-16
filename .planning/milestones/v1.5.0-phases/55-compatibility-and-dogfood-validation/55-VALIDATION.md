---
phase: 55
slug: compatibility-and-dogfood-validation
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-20
---

# Phase 55 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest + package scripts + Node 20 smoke process |
| Quick run command | `pnpm --filter @full-self-browsing/lattice test -- gitfly-dogfood` |
| Full suite command | `pnpm check:node20-modules && pnpm example:external-consumer && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice lint:packages` |
| Estimated runtime | ~180 seconds |

## Per-Task Verification Map

| Requirement | Automated Evidence | Status |
|-------------|--------------------|--------|
| COMP-01 | `pnpm check:node20-modules` imports every built facade labelled `node20-compatible` under Node 20.18.2 | green |
| COMP-02 | `scripts/check-lattice-node20-modular.mjs` asserts root Node `>=24` and `./agents` remains `node24-runtime` | green |
| DOG-01 | `packages/lattice/test/gitfly-dogfood.test.ts` provider-only native tools and structured output scenario | green |
| DOG-02 | `packages/lattice/test/gitfly-dogfood.test.ts` external audit, receipt, replay, hash, and feature-flag scenario | green |
| DOG-03 | `pnpm example:external-consumer` runs core, tools/MCP, audit, and eval slices from built subpaths | green |
| DOG-04 | `docs/modular-entrypoints.md` documents required adoption paths and validation commands | green |

## Validation Sign-Off

- [x] All requirements have automated verification.
- [x] Full suite passed before phase closeout.
- [x] No manual-only verification required.
