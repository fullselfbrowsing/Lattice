# Changelog

All notable changes to `@fullselfbrowsing/lattice-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- v1.3.0 prepares the first public npm release under the `@fullselfbrowsing` scope. See `.changeset/v1.3.0-initial.md` for the full release notes.

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

- Package not published in v1.0. The CLI surface landed in v1.1. This entry exists for completeness so the `@fullselfbrowsing/lattice-cli` version history aligns with the runtime SDK's `@fullselfbrowsing/lattice` history.
- Reproducibility in v1.0 was exercised through the `examples/work-inbox` showcase invoked as a Node script. The v1.1 `lattice repro` subcommand later subsumed that script-driven workflow.
