# Changelog

## 1.6.0

### Minor Changes

- a636350: Harden capability receipts and fix the findings from issue #21.

  - Signed `tripwireEvidence.observed` is now redacted for every invariant kind before signing. `no-pii` carries `{ detector, length, mask }` (letters, digits, and combining marks in any script masked, separators kept); `must-cite`, `field-from-table`, and `matches` carry `{ valueType }` and nothing else, so no value from the output can mimic redacted evidence; the message is rebuilt for every kind from the invariant kind, the declared path, and the detector name, because the kernel's message can embed model-produced object keys or schema issue text. The signed `path` is always the declared path; for `no-pii` the concrete location lives in `observed.foundAt` on the runtime error only. The manifest reasons are `no-pii-detector-mask-only`, `tripwire-observed-value-elided`, and `tripwire-message-templated`, and each entry is written at the moment of the rewrite. `result.error.evidence` from `ai.run` is unchanged apart from the added `foundAt`. Breaking for consumers that read `observed.substring` from a signed body: switch to `mask`.
  - New receipt schema `lattice-receipt/v1.4` with optional `audience`, `nonce`, and `expiresAt`. `createReceipt` accepts them, `ai.run` accepts `intent.receipt: { audience?, nonce?, ttlMs? }`, and `RECEIPT_VERSIONS` exports the ordered version list.
  - `verifyReceipt(envelope, keySet, options?)` adds `minVersion`, `expectedAudience`, `expectedNonce`, `now`, and `maxAgeMs`, with the new error kinds `audience-mismatch`, `nonce-mismatch`, and `receipt-expired`. Binding checks run after signature verification. `expiresAt`, `issuedAt` (under `maxAgeMs`), and a string `now` must be calendar-valid RFC 3339 instants with an explicit `Z` or numeric offset, parsed field by field rather than by `Date.parse`, so a verdict never depends on the verifier's local timezone and an impossible date such as February 31 is rejected instead of rolled into March; `createReceipt` throws on an `issuedAt` or `expiresAt` that fails the same check. A receipt carrying `expiresAt` is rejected after that instant by every verifier, including replay and eval, so do not set `ttlMs` on receipts you intend to replay later.
  - New `verifyChain(envelopes, keySet, options?)` on the root and `audit` entrypoints verifies a `parentReceiptCid` tree: every link, unique CIDs, one `runId`, exactly one root, parent linkage, and optional `expectedRunId`, `expectedCount`, and `expectedRootCid`. Dropped leaf receipts are only detectable with `expectedCount` or an external anchor; `expectedRootCid` detects a replaced root.
  - `LatticeConfig.receipts.onSignerError` selects what `ai.run` does when a configured signer fails. `"flag"` (default) returns the run with `receiptError: { kind: "signer-failed", message }` and emits a `step.transition` event; `"throw"` emits `run.failed` and rejects with `ReceiptSigningError`. Receipts are minted before the session turn is appended and before each terminal run event, so a `"throw"` rejection leaves no session state behind. The crew dispatcher records child receipt mint failures on the tracer instead of swallowing them.
  - Crew agent completion receipts now carry `outputHash` over the agent's output, computed by the shared `hashOutputForReceipt` helper that `ai.run`, replay, and eval all agree on. An output with no JSON form (a BigInt, a circular structure) hashes to `null` instead of surfacing as a signer failure.
  - Routing no longer adds the catalog position to a candidate's score. Ties resolve on provider and model identifier compared by UTF-16 code unit (not `localeCompare`, whose order depends on the process locale), so the same catalog contents produce the same route and fallback chain in any registration order on any machine. Behavior change for candidates that previously tied and were ordered by registration.
  - `noPII` scans nested objects, arrays, and `[*]` wildcard results deterministically (array order, sorted keys, 32-level cap, and a depth-keyed visited map so a shared reference first met near the cap is rescanned when reached through a shallower path) and reports the concrete sub-path of the offending string as `observed.foundAt` on the runtime error. `us-phone` accepts dotted, spaced, and `+1` or `1` trunk-prefixed forms, including `+1` glued to the area code (`+1415-555-1234`). `us-ssn` stays dashed-only; the detector module documents in-scope formats and the known SKU false positive.
  - `inv.mustCite(name, { path?, keys?, caseInsensitive? })` locates nested citation arrays, compares other object keys, and matches case-insensitively. Defaults reproduce the previous behavior and keep `contractHash` stable.
  - CLI: `lattice verify` gains `--min-version`, `--audience`, `--nonce`, and `--max-age-ms`; new `lattice receipt verify-chain <dir> [--key] [--expect-count] [--run-id] [--root-cid]` prints `OK root=<cid> links=<n>` or `FAIL kind=<kind> reason=<msg>`. Bad flag values exit 2 with `FAIL kind=invalid-argument`. `receipt diff` projects the new `audience`, `nonce`, and `expiresAt` fields.

### Patch Changes

- Updated dependencies [a636350]
  - @full-self-browsing/lattice@1.6.0

## 1.5.1

### Patch Changes

- Updated dependency `@full-self-browsing/lattice` to `1.5.1`.

## 1.5.0

### Patch Changes

- Updated dependency `@full-self-browsing/lattice` to `1.5.0`.

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
