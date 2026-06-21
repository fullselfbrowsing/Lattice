# Changelog

## 1.5.0

### Patch Changes

* Updated dependency `@full-self-browsing/lattice` to `1.5.0`.

## 1.4.0

### Minor Changes

- 3ab4423: Add agent-run eval gating, receipt structural diffing, and local LM Studio latency diagnostics to the `lattice` CLI.

### Patch Changes

- Updated dependencies [3b152a1]
- Updated dependencies [5f77ec5]
- Updated dependencies [e68d1e5]
- Updated dependencies [25a36bc]
- Updated dependencies [6503486]
- Updated dependencies [9278b77]
- Updated dependencies [25ef841]
  - @full-self-browsing/lattice@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [ca2bcb5]
- Updated dependencies [29474a1]
- Updated dependencies [a1e5f04]
- Updated dependencies [6ce8af3]
- Updated dependencies [5e38c31]
- Updated dependencies [cfc0372]
- Updated dependencies [f0be51f]
  - @full-self-browsing/lattice@1.3.0

All notable changes to `@full-self-browsing/lattice-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- v1.3.0 prepares the first public npm release under the `@full-self-browsing` scope. See `.changeset/v1.3.0-initial.md` for the full release notes.

## [1.2.0] - 2026-05-31

Tracks lattice runtime v1.2. No new CLI subcommands shipped in this release.

### Added

- CLI tracks the v1.2 runtime so `lattice repro`, `lattice verify`, and `lattice eval` consume the v1.1 receipt schema extension and the step-transition tracing literal without API drift.
- Test posture, 144 of 144 lattice-cli tests passing alongside the 589 runtime tests, gating every PR.
- Verified that the v1.1 `replayOffline` path inside `lattice repro` continues to reach `verdict=match` against fixtures produced by a v1.2 runtime emitting `step.transition` and `recovery.*` event kinds.

### Changed

- Bumped the workspace runtime peer to v1.2 so the CLI consumes the receipt v1.1 schema extension (`CapabilityReceiptBody.version` widening) and the new step-transition tracing literal.
- Subcommand registration kept lazy via `citty` so the v1.2 runtime's larger surface does not inflate cold-start cost for `lattice verify`.

### Security

- Continued to gate the runtime SDK against any CLI dependency leakage. Depcheck plus the runtime's `check-cli-deps.mjs` script run in CI on every push.

## [1.1.0] - 2026-05-12

lattice CLI. First public-facing CLI surface.

### Added

- New `packages/lattice-cli` workspace package exposing the `lattice` bin via tsdown shebang detection.
- `citty@0.2.2` lazy subcommand loading so unused subcommands do not pay an import cost at startup.
- `lattice repro <id-or-path>` subcommand running load, verify, materialize, replayOffline, and diff outputHash, with exit codes 0 (match), 1 (signature or structural fail), 2 (replay diverged).
- `lattice verify <path>` subcommand emitting a single-line OK or FAIL result covering signature plus structural verification.
- `lattice eval` subcommand walking `.lattice/receipts/`, replaying each via `replayOffline`, and gating layered determinism in three stages, Exact, then Semantic-cheap no-op, then Semantic-expensive judge with N=3 median.
- `--init-baseline` flag writing a fresh baseline JSON for first-run scaffolding.
- Disk-backed judge cache keyed by `hash(fixtureId, model_fingerprint, judge_prompt, output_canonicalized)`, demonstrably short-circuiting the second invocation.
- Filesystem artifact loader reading `.lattice/fixtures/<sha256>.bin` so showcase fixtures are content-addressed.

### Security

- Redacted-by-default behavior across all subcommands. No `--unsafe-unredacted` flag in v1.1.
- Depcheck gate prevents CLI dependencies from leaking into the runtime SDK package.

## [1.0.0] - 2026-04-22

Pre-CLI placeholder. Aligns the version history with the runtime SDK.

### Added

- Package not published in v1.0. The CLI surface landed in v1.1. This entry exists for completeness so the `@full-self-browsing/lattice-cli` version history aligns with the runtime SDK's `@full-self-browsing/lattice` history.
- Reproducibility in v1.0 was exercised through the `examples/work-inbox` showcase invoked as a Node script. The v1.1 `lattice repro` subcommand later subsumed that script-driven workflow.
