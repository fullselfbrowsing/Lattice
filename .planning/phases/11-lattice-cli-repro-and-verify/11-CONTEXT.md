# Phase 11: lattice CLI — repro and verify - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A new `packages/lattice-cli` workspace publishes the `lattice` bin with `repro <receipt-id>` and `verify <receipt-path>` subcommands. The CLI consumes `lattice` only through public exports (`workspace:*`); a depcheck gate prevents the runtime package from accidentally importing CLI-only dependencies. CLI output is redacted by default — only the redacted fields from the signed receipt are surfaced.

Out of scope: `lattice eval` (Phase 12), milestone showcase (Phase 13). Cross-platform CI matrix is deferred to v1.2; v1.1 ships unix-only.
</domain>

<decisions>
## Implementation Decisions

### Workspace Package Layout
- New workspace package at `packages/lattice-cli/`.
- `package.json`:
  - `"name": "lattice-cli"` (private: false eventually, but published-name is `@lattice/cli` — defer naming to release time; package id stays `lattice-cli` internally)
  - `"version": "0.0.0-unreleased"` (matches the lattice package's pre-release versioning convention)
  - `"type": "module"`, `"engines": { "node": ">=24" }`
  - `"bin": { "lattice": "./dist/cli.js" }` — auto-maintained by `tsdown` shebang detection
  - `"sideEffects": false`
  - `dependencies`: `lattice: "workspace:*"`, `citty: "0.2.2"`
  - `devDependencies`: `tsdown`, `vitest`, `tsd`, `publint`, `@arethetypeswrong/cli`, `@types/node`
  - Scripts: `build` (tsdown), `typecheck`, `test`, `test:types`, `lint:packages`
- `tsconfig.json` — extends `tsconfig.base.json` from repo root
- `tsdown.config.ts` — single entry `src/cli.ts` with shebang preservation

### CLI Framework
- `citty@0.2.2` — declarative `defineCommand`, lazy subcommand loading. Each subcommand imported on demand via dynamic import so `lattice repro` does NOT pull in the `verify` graph and vice versa. Memory budget: under 25MB resident for a single repro invocation.
- Entry file: `packages/lattice-cli/src/cli.ts` — `#!/usr/bin/env node` shebang preserved by tsdown; calls `runMain` from citty.
- Subcommands: `packages/lattice-cli/src/commands/repro.ts`, `packages/lattice-cli/src/commands/verify.ts`.

### `lattice verify` Behavior
- `lattice verify <receipt-path> [--key <keyset-path>]` — reads a receipt JSON file, verifies its signature against the keyset (path to JSON file containing `KeySetEntries`).
- Output (success): single line `OK kid=<kid> verdict=<contractVerdict>`, exits 0.
- Output (failure): single line `FAIL kind=<error-kind> reason=<message>`, exits 1.
- Default keyset path: `~/.lattice/keyset.json` (resolved via `os.homedir()`); overridable via `--key`. If keyset path doesn't exist, error with friendly message.
- No additional output unless `--verbose` is passed.

### `lattice repro` Behavior
- `lattice repro <receipt-id-or-path> [--key <keyset-path>] [--fixtures <dir>]` — loads the receipt (by id from `.lattice/receipts/<id>.json` or absolute path), verifies it, materializes a `ReplayEnvelope` via `materializeReplayEnvelope`, runs `replayOffline`, and diffs the result's outputHash against the receipt's outputHash.
- Default fixtures dir: `.lattice/fixtures/` resolved relative to cwd. Filesystem artifact loader reads `<fixtures-dir>/<sha256>.bin` files.
- Output: a structured summary with:
  - Receipt id, kid, contract verdict, model.requested, route, usage.costUsd (the receipt's serialized string form).
  - Replay verdict: "match" if outputHashes equal, "drift" if they differ.
  - On drift, print the diff between expected and actual outputHash and which fields differ structurally (best-effort — show first 200 chars of expected vs actual).
- Exit codes: 0 on match, 1 on drift, 2 on verify/materialize/load failure.
- Redacted-by-default: only fields present in the redacted receipt body are surfaced. No flag for unredacted output in v1.1.

### Filesystem Artifact Loader
- `packages/lattice-cli/src/io/artifact-loader.ts` exports `createFilesystemArtifactLoader(fixturesDir: string)` returning `(hash: string) => Promise<ArtifactInput>`. Reads `<fixturesDir>/<hash>.bin` and constructs an `ArtifactInput` (kind `file`, MIME `application/octet-stream`, size from stat).
- Throws when file is missing — caller wraps in `MaterializationError` with kind `artifact-load-failed`.

### Cross-Package Boundary
- `lattice-cli` imports `lattice` via `workspace:*`. Only public exports. No `lattice/src/*` deep imports.
- Depcheck gate: a new script `pnpm --filter lattice lint:packages` already runs `publint` + `attw` — add an additional check that `packages/lattice/dist` does NOT contain references to `citty`, `commander`, `cac`, or any CLI-only dependency. Implementation: simple grep on built `dist/*.js`.

### Tests
- `packages/lattice-cli/test/repro.test.ts` — integration test using a fixture receipt + fixture artifacts on disk. Asserts match exit 0, drift exit 1, missing fixtures exit 2.
- `packages/lattice-cli/test/verify.test.ts` — integration test for verify subcommand. Asserts OK + 0 / FAIL + 1.
- `packages/lattice-cli/test/cli.test.ts` — smoke test that the bin entry can be spawned via `node dist/cli.js --help` and prints the citty help text.

### Claude's Discretion
- Internal modules for table-formatted output, color, etc. are at Claude's discretion. Recommend kept minimal — plain text, no chalk dep.
- Whether to ship a `--json` output mode in v1.1 for CI consumers: include if trivial, defer to v1.2 otherwise.
- Internal modules `commands/`, `io/`, `formatters/` (if needed).

### Limitations (v1.1 scope)
- Cross-platform: unix only (macOS/Linux). Windows CI matrix is deferred per CONTEXT.md research.
- No published-tarball smoke test in v1.1 (workspace package only).
- No `--unsafe-unredacted` flag in v1.1.
- Single-receipt operations only — batch repro/verify is a CLI ergonomics concern for v1.2.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/index.ts` — public exports include `verifyReceipt`, `createMemoryKeySet`, `materializeReplayEnvelope`, `replayOffline`, `MaterializationError`. All needed by the CLI.
- `packages/lattice/src/storage/local.ts` — existing local filesystem storage. Reference for the artifact loader pattern (read file, hash, return ArtifactInput).
- `packages/lattice/package.json` — version, deps, tsdown.config.ts, vitest.config.ts, tsconfig.json — model for the new lattice-cli package.

### Established Patterns
- pnpm workspace package. All deps from catalog where possible.
- tsdown build with declaration emit. ESM-only.
- Tests in co-located `test/` directory.
- No emojis in source/docs.

### Integration Points
- `pnpm-workspace.yaml`: add `packages/lattice-cli` to workspace list.
- `package.json` (root): add `example:lattice-cli` script if desired (optional).
- The new package depends on `lattice` via `workspace:*`. The `lattice` package does NOT depend on `lattice-cli`.
</code_context>

<specifics>
## Specific Ideas

- The CLI must not block the workspace if `lattice` fails to build. Tsdown's separate package builds are independent.
- `lattice verify` should work offline against any signed receipt + matching keyset, without network or filesystem access beyond the keyset file. This is a key value prop.
- Receipt id resolution: `lattice repro abc123` looks up `.lattice/receipts/abc123.json`. `lattice repro ./path/to/receipt.json` accepts an explicit path. Implementation: if argument has a `/` or `.json` suffix, treat as path; else treat as id.
- The integration tests for repro should NOT spawn the bin (slow). Instead, import the subcommand handler directly and pass a mock argv array. The smoke test (`cli.test.ts`) is the one that spawns the bin to validate shebang + bin field.
</specifics>

<deferred>
## Deferred Ideas

- Cross-platform CI matrix (Windows) and published-tarball smoke test (deferred to v1.2).
- `--unsafe-unredacted` opt-in flag (deferred to v1.2).
- Drift warnings beyond outputHash comparison (env drift, model fingerprint drift surfaced as typed errors) (deferred to v1.2).
- Batch operations (`lattice repro --all`, `lattice verify --dir`) (deferred to v1.2).
- `lattice receipt diff` subcommand (deferred to v1.2).
- `--json` machine-readable output mode (defer if non-trivial).
- KMS-backed keysets (deferred to v1.2).
</deferred>
