---
phase: 11-lattice-cli-repro-and-verify
verified: 2026-05-11T18:05:00Z
status: passed
score: 5/5 must-haves verified
overrides_applied: 0
---

# Phase 11: lattice CLI Repro and Verify - Verification Report

**Phase Goal:** A new `packages/lattice-cli` workspace publishes the `lattice` bin with `repro` and `verify` subcommands that go through the runtime via public exports only; redaction defaults are inherited from the signed receipt.

**Verified:** 2026-05-11T18:05:00Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `packages/lattice-cli` exists as a workspace package, publishes a single `lattice` bin entry maintained by `tsdown` shebang detection, depends on `lattice` only through public exports (`workspace:*`) | VERIFIED | `packages/lattice-cli/package.json` has `bin.lattice = ./dist/cli.js`; `dependencies.lattice = "workspace:*"`; dist/cli.js first bytes are literal `#!/usr/bin/env node`; no `lattice/src/*` imports anywhere in `packages/lattice-cli/src/` |
| 2 | `lattice repro <receipt-id>` loads a receipt, verifies signature, materializes a replay envelope from receipt + content-addressed artifact bodies, runs `replayOffline`, and diffs result against receipt's `outputHashes` | VERIFIED | `packages/lattice-cli/src/commands/repro.ts` implements the documented 7-stage pipeline (load receipt -> load keyset -> build loader -> materialize -> verify-for-body -> replay -> diff outputHash); 8 vitest cases cover match/drift/all exit-2 modes |
| 3 | `lattice verify <receipt-path>` verifies signature + structural integrity without running anything; prints a typed verdict | VERIFIED | `packages/lattice-cli/src/commands/verify.ts` calls `verifyReceipt` from lattice public surface, emits single-line `OK kid=<kid> verdict=<contractVerdict>` (exit 0) / `FAIL kind=<errorKind> reason=<msg>` (exit 1) / load-failure (exit 2); 9 vitest cases pass |
| 4 | CLI uses `citty@0.2.2` with lazy subcommand loading; depcheck gate prevents runtime package from importing CLI-only deps | VERIFIED | `pnpm-workspace.yaml` catalog: `citty: 0.2.2`; `packages/lattice-cli/src/cli.ts` uses lazy `subCommands: { repro: () => import("./commands/repro.js").then(m => m.default), verify: ... }`; `packages/lattice/scripts/check-cli-deps.mjs` regex-greps built `dist/*` for `citty|commander|cac|yargs` and exits non-zero on match; wired into `packages/lattice/package.json` `lint:packages` |
| 5 | CLI output is redacted by default - only redacted fields from signed receipt are surfaced; no `--unsafe-unredacted` flag in v1.1 | VERIFIED | `verify` emits only `kid` + `contractVerdict`; `repro` summary emits `receiptId, kid, contractVerdict, model.requested, route.providerId/capabilityId, usage.costUsd, verdict` (and outputHash only on drift) - all already-redacted body fields; grep of `packages/lattice-cli` confirms NO `unsafe-unredacted` / `unredacted` strings exist; verify.test.ts Test 7 and repro.test.ts Test 8 explicitly assert NO `inputHashes[i]` substrings, no payload, no signature bytes leak into stdout |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/lattice-cli/package.json` | Workspace package manifest with bin entry, citty catalog dep, lattice workspace dep | VERIFIED | name=lattice-cli, type=module, engines.node>=24, bin.lattice=./dist/cli.js, dependencies.lattice=workspace:*, dependencies.citty=catalog: |
| `pnpm-workspace.yaml` | catalog entry citty@0.2.2 | VERIFIED | `citty: 0.2.2` present in catalog block |
| `packages/lattice-cli/src/cli.ts` | Shebang + citty defineCommand + lazy subcommand resolvers | VERIFIED | `#!/usr/bin/env node` at byte 0; defineCommand with `subCommands: { repro: () => import(...).then(m=>m.default), verify: ... }`; runMain invoked |
| `packages/lattice-cli/src/commands/repro.ts` | citty defineCommand for repro + runRepro(args, deps) injectable handler | VERIFIED | Default-exported defineCommand with positional target, --key, --fixtures; runRepro implements 7-stage pipeline; imports `materializeReplayEnvelope, replayOffline, verifyReceipt` from "lattice" public surface |
| `packages/lattice-cli/src/commands/verify.ts` | citty defineCommand for verify + runVerify(args, deps) injectable handler | VERIFIED | Default-exported defineCommand with positional receipt + --key; runVerify implements load-keyset / load-receipt / verifyReceipt pipeline; imports `verifyReceipt` from "lattice" |
| `packages/lattice-cli/src/io/keyset-loader.ts` | loadKeySetFromPath, defaultKeysetPath (~/.lattice/keyset.json), tilde expansion, typed errors | VERIFIED | Resolves `~` via `os.homedir()`; createMemoryKeySet from lattice public surface; KeysetLoadError discriminated by kind |
| `packages/lattice-cli/src/io/artifact-loader.ts` | createFilesystemArtifactLoader(fixturesDir) reading <hash>.bin | VERIFIED | Regex-gates hash against `/^[a-f0-9]{64}$/u` BEFORE fs touch; reads `<root>/<hash>.bin`; ArtifactLoaderError discriminated by kind |
| `packages/lattice-cli/src/io/receipt-loader.ts` | loadReceiptByIdOrPath with id-or-path heuristic | VERIFIED | `target.includes("/") || target.endsWith(".json")` -> path; else `<receiptsDir>/<id>.json` where receiptsDir defaults to `.lattice/receipts` |
| `packages/lattice-cli/test/cli.test.ts` | Smoke test spawns built bin for shebang/help validation | VERIFIED | Uses `spawnSync(process.execPath, [binPath, ...args])` against dist/cli.js; 3 cases (help exit 0, repro stub-load exit 2, verify stub-load exit 2) |
| `packages/lattice-cli/test/verify.test.ts` | Mock-argv verify tests | VERIFIED | imports runVerify directly; 9 cases using captureDeps injection; no spawnSync |
| `packages/lattice-cli/test/repro.test.ts` | Mock-argv repro tests | VERIFIED | imports runRepro directly; 8 cases via captureDeps; no spawnSync |
| `packages/lattice-cli/test/keyset-loader.test.ts` | Unit tests for keyset loader | VERIFIED | 10 cases covering tilde expansion, missing/malformed, shape validation |
| `packages/lattice-cli/test/artifact-loader.test.ts` | Unit tests for filesystem artifact loader + receipt loader | VERIFIED | 13 cases for both loaders |
| `packages/lattice/scripts/check-cli-deps.mjs` | Depcheck gate - regex-greps lattice/dist for citty/commander/cac/yargs | VERIFIED | Walks dist/* (js/mjs/cjs/d.ts), regex `(from\|require\|import)\s*\(?\s*["']<sym>["']` anchors on import syntax; exits 1 on hit |

### Key Link Verification

| From | To | Via | Status |
|------|-----|-----|--------|
| `packages/lattice-cli/src/cli.ts` | `./commands/repro.js`, `./commands/verify.js` | citty subCommands Resolvable dynamic imports | WIRED - `subCommands: { repro: () => import(...).then(m=>m.default), verify: () => import(...).then(m=>m.default) }` |
| `packages/lattice-cli/package.json` | `packages/lattice` | workspace:* dependency | WIRED - `"lattice": "workspace:*"` |
| `packages/lattice/package.json scripts.lint:packages` | `packages/lattice/scripts/check-cli-deps.mjs` | wired as last && step | WIRED - `pnpm build && publint && attw --pack . --profile esm-only && node ./scripts/check-cli-deps.mjs` |
| `packages/lattice-cli/src/commands/verify.ts` | `lattice` public export `verifyReceipt` | `import { verifyReceipt, type ReceiptEnvelope } from "lattice"` | WIRED |
| `packages/lattice-cli/src/commands/repro.ts` | `lattice` public exports | `import { materializeReplayEnvelope, replayOffline, verifyReceipt, ... } from "lattice"` | WIRED |
| `packages/lattice-cli/src/commands/repro.ts` | `./io/artifact-loader.ts` | `createFilesystemArtifactLoader(fixturesDir)` passed as `options.artifactLoader` | WIRED |
| `packages/lattice-cli/src/commands/repro.ts` | `./io/receipt-loader.ts` | `loadReceiptByIdOrPath(args.target, ...)` | WIRED |
| `packages/lattice-cli/src/commands/repro.ts` | `./io/keyset-loader.ts` | `loadKeySetFromPath(args.key)` | WIRED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Built bin starts with shebang | `head -c 25 packages/lattice-cli/dist/cli.js` | `#!/usr/bin/env node\nimpor` | PASS |
| Built bin --help exits 0 and lists subcommands | `node packages/lattice-cli/dist/cli.js --help` | Exit 0, lists `repro` + `verify` with descriptions | PASS |
| `pnpm tsc --noEmit` (lattice-cli) | run in packages/lattice-cli | Exit 0 | PASS |
| `pnpm vitest run` (lattice-cli) | run in packages/lattice-cli after build | 43/43 tests pass across 5 files (cli, verify, keyset-loader, artifact-loader, repro) | PASS |
| `pnpm build` (lattice-cli) | run in packages/lattice-cli | Exit 0; 9 dist files; shebang preserved; "Granting execute permission to dist/cli.js" | PASS |
| `pnpm lint:packages` (lattice) | run in packages/lattice | Exit 0; publint "All good!"; attw green; `[check-cli-deps] OK - no forbidden CLI deps found` | PASS |
| Lazy subcommand pattern present | `grep -E "subCommands.*import\\(\|=> import\\(" cli.ts` | Matches `repro: () => import("./commands/repro.js").then(...)` and `verify: () => import(...)` | PASS |
| No `--unsafe-unredacted` flag exists | `grep -r "unsafe-unredacted\\|unredacted" packages/lattice-cli` | No matches | PASS |
| No deep imports into lattice/src | `grep -r "from \"lattice/src/" packages/lattice-cli/src` | No matches | PASS |
| citty version locked to 0.2.2 | `grep "citty" pnpm-workspace.yaml` | `citty: 0.2.2` in catalog | PASS |
| Depcheck script regex anchored on import syntax | inspect `check-cli-deps.mjs` | regex `(from\|require\|import)\s*\(?\s*["']<dep>["']` for each of citty/commander/cac/yargs over js/mjs/cjs/d.ts in lattice dist | PASS |

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CLI-01 | New `packages/lattice-cli` workspace package publishes a single `lattice` bin entry auto-maintained via tsdown shebang detection | SATISFIED | package.json has `bin.lattice = ./dist/cli.js`; dist/cli.js begins with `#!/usr/bin/env node`; tsdown build log shows "Granting execute permission to dist/cli.js" |
| CLI-02 | `lattice repro` loads, verifies, materializes, replays, diffs outputHash | SATISFIED | repro.ts implements all 7 stages with deterministic exit codes (0 match / 1 drift / 2 anything else); 8 mock-argv tests cover the matrix |
| CLI-03 | `lattice verify` verifies signature + structural integrity without running anything; prints typed verdict | SATISFIED | verify.ts handler runs verifyReceipt only; OK/FAIL single-line output with VerifyErrorKind passed through; 9 mock-argv tests cover OK/all VerifyErrorKinds/load failures |
| CLI-04 | Uses `citty@0.2.2` with lazy subcommand loading so `lattice repro` does not transitively load eval/judge deps | SATISFIED | catalog citty: 0.2.2; cli.ts subCommands use `() => import("./commands/X.js").then(m => m.default)` Resolvable thunks; subcommand bundles separated in dist (`repro-DYhPobHw.js`, `verify-BuxTXqOd.js`) |
| CLI-05 | CLI output redacted by default; no `--unsafe-unredacted` flag in v1.1 | SATISFIED | verify output: only kid + contractVerdict (both already on signed body); repro summary: only redacted body fields; verify.test.ts Test 7 and repro.test.ts Test 8 explicitly assert no inputHashes/payload/signature substrings appear in stdout; grep confirms no `--unsafe-unredacted` flag defined |
| CLI-06 | `packages/lattice-cli` imports lattice only via public exports; depcheck gate prevents runtime from importing CLI-only deps | SATISFIED | grep confirms no `lattice/src/*` imports; check-cli-deps.mjs walks lattice dist for citty/commander/cac/yargs in import-position regex; wired into lattice `lint:packages`; ran green |

No orphaned requirements - all 6 phase-11 requirement IDs are declared across plans (11-01: CLI-01/04/06; 11-02: CLI-03/05; 11-03: CLI-02/05).

### Anti-Patterns Found

None. Source files contain no `TODO`/`FIXME`/`XXX`/`HACK`/`PLACEHOLDER`/`not yet implemented` markers; no empty handler bodies; no hardcoded stub returns in production code.

### Human Verification Required

None - all phase goals verified programmatically:
- Bin built and `--help` exits 0 with lazy subcommands listed
- 43/43 mock-argv + spawn tests pass
- Typecheck (tsc --noEmit) exits 0
- Depcheck gate green on lattice runtime dist
- Shebang round-trip verified via byte inspection
- Redaction discipline asserted by test code (negates every potentially-leakable hash/payload/signature substring)

### Gaps Summary

No gaps. Phase 11 satisfies all 5 ROADMAP success criteria and all 6 requirement IDs (CLI-01..CLI-06). The CLI is a standalone workspace package consuming only lattice public exports; the `lattice` bin builds, executes, and lazy-loads its subcommands; both `lattice verify` and `lattice repro` implement the full documented pipelines with typed exit codes; output discipline is enforced by tests; the runtime depcheck gate is wired and runs green.

---

*Verified: 2026-05-11T18:05:00Z*
*Verifier: Claude (gsd-verifier)*
