# Phase 49 Research

## Current Validation Surface

- `examples/work-inbox/index.mjs` remains the strongest end-to-end contract showcase. It covers success, tripwire, no-contract-match, quality-floor, signed receipts, sidecars, CLI `verify`, CLI `repro`, and CLI `eval`.
- `examples/agent-loop/index.mjs` and `examples/agent-crew/index.mjs` validate agent receipts and `evalAgentRun` against built runtime output.
- Phase 43-47 introduced v1.4 runtime surfaces that are individually tested but not yet demonstrated together as an offline scenario: `collectStream`, `policy.stream`, gateway metadata, OpenRouter/LiteLLM helpers, and `createOtelRunEventSink`.
- Phase 48 introduced CLI diagnostics/eval/diff surfaces with package tests, but no package-level showcase that combines them with the v1.4 runtime story.

## Package Candidate Checks

- `scripts/check-package-version-surfaces.mjs` already validates packed runtime and CLI version stamping.
- `scripts/check-tarball-leak.mjs` already detects stale unscoped `lattice` references in packed manifests.
- VAL-03 requires a stronger tarball gate: no install lifecycle scripts and no unwanted native/heavy optional dependencies leaking into `@full-self-browsing/lattice`.
- Current runtime manifest dependencies are intentionally small: `@standard-schema/spec`, `canonicalize`, and `mime`. Optional native/media/storage dependencies should remain absent from the core runtime package.

## FSB Dogfood Context

- The v1.3 dogfood strategy is real downstream validation through FSB rather than a synthetic canary.
- The local FSB automation checkout has unrelated modified generated files and must not be edited in place.
- The current FSB automation manifest still uses a local bare dependency (`"lattice": "file:./lattice/packages/lattice"`), so the Phase 49 runner must create an isolated candidate install and bridge any bare-import expectation inside the temp copy only.
- The dogfood gate must check new v1.4 exports and version stamping explicitly because existing FSB smoke tests may not exercise new APIs.

## Risks

| Risk | Mitigation |
|------|------------|
| FSB checkout unavailable on another machine | Make `--fsb-dir` configurable and fail with a clear skip/blocker message when required dogfood cannot run. |
| Full FSB install is slow or mutates local state | Use a temp copy/temp project and clean it up automatically unless `--keep-temp` is passed. |
| Candidate tarball installs under scoped name while FSB imports bare `lattice` | Install the scoped package, then create a temp-only `node_modules/lattice` symlink to the scoped package for legacy FSB smoke tests. |
| Showcase duplicates unit tests without adding confidence | Run against built package output and combine multiple v1.4 surfaces in one offline example. |
| Tarball audit becomes brittle | Inspect manifest-level dependency/script surfaces first and keep allowlists explicit. |

