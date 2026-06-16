---
phase: 24-atomic-scope-rename-license-hygiene
reviewed: 2026-06-04T00:00:00Z
depth: quick
files_reviewed: 23
files_reviewed_list:
  - packages/lattice-cli/src/commands/repro.ts
  - packages/lattice-cli/src/commands/verify.ts
  - packages/lattice-cli/src/eval/runner.ts
  - packages/lattice-cli/src/io/artifact-loader.ts
  - packages/lattice-cli/src/io/keyset-loader.ts
  - packages/lattice-cli/src/io/receipt-loader.ts
  - packages/lattice-cli/src/io/receipt-walker.ts
  - packages/lattice-cli/src/io/sidecar-loader.ts
  - packages/lattice-cli/src/io/sidecar-walker.ts
  - packages/lattice/src/agent/host-integration.test.ts
  - packages/lattice/src/agent/survivability-integration.test.ts
  - packages/lattice-cli/test/eval-runner.test.ts
  - packages/lattice-cli/test/receipt-walker.test.ts
  - packages/lattice-cli/test/repro.test.ts
  - packages/lattice-cli/test/showcase-e2e.test.ts
  - packages/lattice-cli/test/sidecar-walker.test.ts
  - packages/lattice-cli/test/verify.test.ts
  - packages/lattice/test-d/package-types.test-d.ts
  - packages/lattice/package.json
  - packages/lattice-cli/package.json
  - package.json
  - examples/agent-loop/package.json
  - .changeset/v1.3.0-initial.md
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 24: Code Review Report

**Reviewed:** 2026-06-04T00:00:00Z
**Depth:** quick
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 24 is a near-pure mechanical scope rename (`lattice` -> `@fullselfbrowsing/lattice`, `lattice-cli` -> `@fullselfbrowsing/lattice-cli`) plus publish-required manifest fields (license, repository, bugs, homepage, publishConfig.access=public). The rename is consistently applied to every TypeScript import string and to the workspace dependency in `packages/lattice-cli/package.json`. Manifest hygiene is correct on both publishable packages: MIT license, repository.directory pinned per-package, homepage / bugs URLs match, publishConfig.access=public present, and no provenance toggle leaked into the diff. The root workspace gained a top-level `"license": "MIT"` declaration. The `.changeset/v1.3.0-initial.md` file uses the new scoped names and a `minor` bump, which is appropriate given current `0.0.0` versions.

The non-import test widenings to `Record<string, unknown> | undefined` in `host-integration.test.ts` / `survivability-integration.test.ts` are unrelated typecheck prep changes and look correct.

Two warnings worth attention: (1) the root `package.json` and the `packages/lattice/package.json` script still reference unscoped pnpm filter targets (`pnpm --filter lattice ...`) which will silently fail once the rename takes effect; (2) the workspace-dep range flip from `"workspace:*"` to `"workspace:^"` for `@fullselfbrowsing/lattice-cli -> @fullselfbrowsing/lattice` changes the published tarball's range semantics in a way that may not match v1 intent. Plus several Info-level stale-string leftovers in docstrings, hint text, and a sanity-script log message.

## Warnings

### WR-01: Stale `pnpm --filter lattice` references will break after the scope rename

**Files:**
- `package.json:16`
- `packages/lattice/scripts/check-cli-deps.mjs:6`
- `packages/lattice/scripts/check-cli-deps.mjs:49`

**Issue:** Three pnpm filter invocations still target the OLD unscoped package names. pnpm `--filter` matches on the `name` field of `package.json`, and after the Phase 24 rename neither `lattice` nor `lattice-cli` exists as a package name in the workspace. These commands will resolve to zero packages and exit successfully without doing the work:

- `package.json` line 16:
  ```json
  "example:work-inbox": "pnpm --filter lattice build && node examples/work-inbox/index.mjs"
  ```
  After the rename, `--filter lattice` matches nothing; the build never runs; the showcase then dies on `Cannot find package '@fullselfbrowsing/lattice'`.

- `packages/lattice/scripts/check-cli-deps.mjs` line 6 (docstring) and line 49 (user-facing error message):
  ```
  Run after `pnpm --filter lattice build`.
  ...
  Run `pnpm --filter lattice build` first.
  ```
  The hint text now points users at a command that silently no-ops.

Note: `packages/lattice-cli/test/showcase-e2e.test.ts` lines 202-218 were correctly updated to `--filter @fullselfbrowsing/lattice` / `--filter @fullselfbrowsing/lattice-cli`, and `examples/work-inbox/index.mjs:61,64,67` were correctly updated to `--filter @fullselfbrowsing/lattice-cli exec lattice`. So the rename was partially propagated but missed these three call sites.

**Fix:**
```json
// package.json line 16
"example:work-inbox": "pnpm --filter @fullselfbrowsing/lattice build && node examples/work-inbox/index.mjs"
```
```javascript
// packages/lattice/scripts/check-cli-deps.mjs line 6 (comment)
// reference any CLI-only dependency. Run after `pnpm --filter @fullselfbrowsing/lattice build`.

// line 49 (error message)
console.error(`[check-cli-deps] dist directory not found at ${distDir}. Run \`pnpm --filter @fullselfbrowsing/lattice build\` first.`);
```

### WR-02: Workspace-dep range flip `workspace:*` -> `workspace:^` changes published tarball semantics

**File:** `packages/lattice-cli/package.json:43`

**Issue:** The diff flips
```diff
- "lattice": "workspace:*"
+ "@fullselfbrowsing/lattice": "workspace:^"
```

`workspace:*` and `workspace:^` differ in what pnpm rewrites at `pnpm publish` time:

- `workspace:*` -> rewritten to the EXACT version of the workspace package at publish time (e.g. `"1.3.0"`).
- `workspace:^` -> rewritten to a caret range based on the workspace package version (e.g. `"^1.3.0"`).

For a CLI that calls into private/semi-private surface of its sister package (which `lattice-cli` does — it relies on the specific shapes of `MaterializationError`, `ReplayEnvelope`, `CapabilityReceiptBody`, etc.), the safer release pin is exact. A caret range means a user who installs an old `@fullselfbrowsing/lattice-cli@1.3.0` from npm could resolve `@fullselfbrowsing/lattice@1.4.x` and break on any forward-incompat surface change.

Also note the inconsistency: `examples/agent-loop/package.json` uses `"workspace:^"` (appropriate for a downstream consumer example) but the CLI -> runtime sister-package link is a different scenario where exact pinning is conventional.

**Fix:** If exact-version pinning is intended:
```json
"@fullselfbrowsing/lattice": "workspace:*"
```
If caret is intentional (because lattice will commit to SemVer compatibility across minor bumps for the surfaces lattice-cli depends on), leave as-is but document the decision in `24-CONTEXT.md` so a future reviewer doesn't flag it. Phase 24-CONTEXT does not currently mention the `*` -> `^` flip rationale.

## Info

### IN-01: Docstring header still says `lattice repro` / `lattice verify` (not `@fullselfbrowsing/lattice-cli`)

**Files:**
- `packages/lattice-cli/src/commands/repro.ts:2`
- `packages/lattice-cli/src/commands/verify.ts:2`
- `packages/lattice-cli/src/io/receipt-walker.ts:2`
- `packages/lattice-cli/src/io/sidecar-walker.ts:2-3`
- `packages/lattice-cli/src/io/sidecar-loader.ts:2`
- `packages/lattice-cli/src/io/artifact-loader.ts:2`
- `packages/lattice-cli/src/io/keyset-loader.ts:2`
- `packages/lattice-cli/src/io/receipt-loader.ts:2`

**Issue:** Each module's leading docstring refers to the CLI as `lattice repro` / `lattice verify` / `lattice eval`. This is correct — `lattice` is the `bin` name (set in `packages/lattice-cli/package.json:24`), and end users invoke it as `lattice <cmd>` regardless of the package's npm scope. No fix needed; flagging only so a future reviewer doing a textual `lattice` audit doesn't mis-flag these.

**Fix:** None. These are correct bin-name references, not stale package-name references.

### IN-02: User-facing hint in `runRepro` still says "See lattice-sidecar/v1 spec" — verify it's the spec name, not a package name

**File:** `packages/lattice-cli/src/commands/repro.ts:304`

**Issue:** The hint string reads:
```typescript
deps.stderr(
  `hint: Provide --sidecar <path> or place a sidecar at .lattice/sidecars/${receiptId}.json. See lattice-sidecar/v1 spec.`,
);
```
`lattice-sidecar/v1` is a wire-format version identifier (used as `sidecar.version` value in `sidecar-loader.ts:34`), not a package name. The string is correct as-is, but the form `lattice-sidecar/v1` is easy to confuse with the renamed package. Confirmed: this is the spec version literal, not a package reference. No change needed.

**Fix:** None.

### IN-03: `examples/agent-loop/package.json` uses `workspace:^` consistent with downstream-consumer pattern

**File:** `examples/agent-loop/package.json:7`

**Issue:** This example correctly uses `"@fullselfbrowsing/lattice": "workspace:^"` since it's a sample consumer (not a publishable package). Noting for completeness: this is the desired form for sample/example projects (they should resolve to any minor-compatible version after publish, like a real downstream user). No issue here — flagged only to contrast with WR-02 above.

**Fix:** None.

### IN-04: Tsd `compilerOptions.paths` key was correctly renamed in `packages/lattice/package.json`

**File:** `packages/lattice/package.json:46-48`

**Issue:** The `tsd.compilerOptions.paths` key was correctly flipped from `"lattice"` to `"@fullselfbrowsing/lattice"`, matching the test-d file's import strings (`packages/lattice/test-d/package-types.test-d.ts:10,11`). This is consistent and works — verified that `test-d/package-types.test-d.ts` imports from `"@fullselfbrowsing/lattice"`. No action needed.

**Fix:** None.

---

## Items Verified Clean

The following requested focus areas were checked and look correct:

- **All TS/JS import strings:** every reviewed `.ts` file in `packages/lattice-cli/src/` and the two test files in `packages/lattice/src/agent/` imports from `"@fullselfbrowsing/lattice"`. No unscoped `from "lattice"` survives in production sources or the listed test files.
- **Workspace dependency flips:** `packages/lattice-cli/package.json` and `examples/agent-loop/package.json` both reference `@fullselfbrowsing/lattice`. No other workspace consumer was found pointing at the old name (grep over `packages/` and `examples/` returns only `pnpm --filter lattice` script strings, covered in WR-01).
- **Manifest hygiene on both publishable packages:** MIT license set, repository.directory pinned (`packages/lattice` and `packages/lattice-cli` respectively), homepage + bugs URLs identical and point at the public GitHub repo, `publishConfig.access=public` present. No `provenance: true` or `--provenance` flag leaked into Phase 24 (correct — provenance is a separate release-tooling decision).
- **Root `package.json` license:** correctly gained `"license": "MIT"` (workspace declaration).
- **Changeset:** `.changeset/v1.3.0-initial.md` correctly uses the new scoped names (`@fullselfbrowsing/lattice`, `@fullselfbrowsing/lattice-cli`) and a `minor` bump.
- **`showcase-e2e.test.ts` pnpm filter args:** lines 204 and 216 correctly use `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` for the `pnpm --filter ... build` invocations. pnpm filter semantics treat the scope as part of the package name, so this is correct.
- **Test type widenings:** `Array<{ kind: string; payload?: Record<string, unknown> | undefined }>` in `host-integration.test.ts:169,216` and `survivability-integration.test.ts:167` are correct under `exactOptionalPropertyTypes`; the pre-existing widening lets tracer callbacks invoked without the second argument satisfy the array element shape.

---

_Reviewed: 2026-06-04T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
