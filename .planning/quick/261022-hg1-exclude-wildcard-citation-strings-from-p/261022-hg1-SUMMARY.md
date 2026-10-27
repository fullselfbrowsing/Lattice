# Exclude wildcard citation strings from prose

Completed 2026-10-22. Implementation commit: `8a112e7`.

## Changes

- Private path traversal now reports original parent/key locations and can prune
  excluded locations before building wildcard projections.
- Citation exclusions retain container identities and record selected source
  slots, so primitive citation metadata is skipped without hiding equal prose
  elsewhere. The same exclusions apply while resolving textPath.
- Added 18 regression cases covering both reported failures, real-array/wildcard
  parity, selected array indices, sibling strings, overlapping and nested textPath
  projections, object aliases, and inline scanning. Public APIs and path result
  shapes are unchanged.

## Validation

- Before the evaluator change, 11 of the first 15 regression cases failed.
- Focused run after the evaluator change: 168/168 tripwire tests passed.
- Final package suite, including all 18 new cases:
  `RAYON_NUM_THREADS=1 pnpm exec vitest run --maxWorkers=1` — 1,614 tests passed
  across 87 files (15.04 seconds).
- `pnpm exec tsc -p tsconfig.json --noEmit` — passed.
- `git diff --check` — passed.
- Commands ran directly in packages/lattice without version-stamping scripts.

Vitest initially stalled before startup; limiting Rayon threads and Vitest workers
resolved the local runner issue. No dependency or project configuration changes
were needed. No plan deviations.
