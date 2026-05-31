# Phase 14: Public Surface Index + Packaging Readiness - Context

**Gathered:** 2026-05-31
**Status:** Retroactive backfill (code already on disk via cherry-pick from FSB v0.10.0-attempt-2 Phase 1)
**Mode:** Retro from FSB v0.10.0-attempt-2 Phase 1. Originating SHAs (Lattice repo on `fsb-integration-experiments`): `ab6c1f6`, `195e5ae`, `22bf986`. Cherry-picked onto this phase branch as `c9c5b9a`, `d17fb25`, `48f444d` (commit messages retain `(cherry picked from commit ...)` provenance via `git cherry-pick -x`).

<domain>
## Phase Boundary

Make the receipt-mint API (`createReceipt`) reachable via the bare `lattice` specifier from any npm consumer, and make `packages/lattice` installable as a `file:` dependency under npm 11 (which rejects `catalog:` specifiers at parse time). This is the smallest-possible packaging readiness layer needed before any in-extension consumption surface (Phases 17 providers + Phase 18 survivability adapter all reach Lattice via this same import path).

Out of scope: dist/ build pipeline changes (untouched), workspace structure (untouched), tsdown config (untouched), CI scripts (untouched), publishing to npm (deferred to Stage 5 / milestone close).

</domain>

<decisions>
## Implementation Decisions

### Public Surface
- `createReceipt` re-exported as a value; `CreateReceiptInput` re-exported as a type. Both flow from `./receipts/receipt.js` through `packages/lattice/src/index.ts`.
- Re-export sits between `verifyReceipt` and `isTerminal` so it travels with the rest of the receipts public surface. No reordering of unrelated exports.
- v1.1 `public-surface.test.ts` previously asserted "createReceipt is NOT exported" as a deliberate forward-compat marker. That assertion flips here (Phase 15 cleanup) to "createReceipt IS exported" — single-line change.

### Packaging
- All `pnpm-workspace.yaml` `catalog:` references inside `packages/lattice/package.json` resolve to concrete semver strings. npm 11 rejects `catalog:` at parse time; FSB consumes via `file:./lattice/packages/lattice`.
- The 6 dependencies touched: `@standard-schema/spec` (1.1.0), `canonicalize` (3.0.0), `mime` (4.1.0), `@noble/ed25519` (3.1.0), `@types/node` (24.12.2), `zod` (4.3.6). Versions match the catalog at the originating commit time; no version bumps.
- `pnpm-lock.yaml` regenerates to reflect the literal pins (mostly removing the `catalog:` indirection).
- `dist/` is gitignored at this baseline; downstream phases regenerate locally via tsdown.

### Audit Doc Companion
- `docs/fsb-integration-gaps.md` lands in this phase as the source-of-truth audit doc for the entire 5-phase retro narrative (Phases 14-18). It documents the 6 surface gaps (Receipts / Tripwires-hooks / Providers / Delegation / MV3-survivability / Observability) that drove FSB v0.10.0-attempt-2 Phases 1-5 — all surfaces lattice now ships as canonical.

### Claude's Discretion
None substantive — this phase is a single-line re-export plus a 6-dep catalog-to-literal substitution. No design choices left.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/receipts/receipt.ts` — already exports `createReceipt` and `CreateReceiptInput`; the public surface index just needs to re-export them.
- `packages/lattice/src/index.ts` — existing receipts public-surface section already re-exports `verifyReceipt`, `createInMemorySigner`, etc. New line slots in naturally.

### Established Patterns
- Public surface re-exports are flat (`export { Name } from "./path/file.js"`); no barrel files.
- Receipts module exports value-and-type pairs together in one `export { value, type Type }` statement.

### Integration Points
- Downstream FSB-side consumers reach `createReceipt` via `import { createReceipt } from "lattice"` — exercised by `tests/lattice-smoke.test.js` Plan 01-02 round-trip (Lattice repo: FSB v0.10.0-attempt-2 Plan 01-02).

</code_context>

<specifics>
## Specific Ideas

- Re-export line placement: between `verifyReceipt` and `isTerminal` (preserves "all receipts re-exports clustered" reading order).
- Resolution version source: the `pnpm-workspace.yaml` catalog as of `8fa7b03` (v1.1 close) defines the canonical versions. Cherry-pick brings them along.

</specifics>

<deferred>
## Deferred Ideas

- Publishing `@fullselfbrowsing/lattice@1.2.0` to npm — deferred to Stage 5 / milestone close. Submodule pin at the `v1.2.0` tag is the agreed FSB consumption path; npm publish only if an external consumer asks.
- `pnpm-workspace.yaml` catalog vs. literal-only architecture — out of scope; this phase changes only the `packages/lattice/package.json` view.

</deferred>
