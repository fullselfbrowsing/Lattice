---
phase: 11-lattice-cli-repro-and-verify
plan: "01"
subsystem: cli
tags: [cli, workspace, citty, depcheck, scaffolding]
dependency_graph:
  requires:
    - packages/lattice (workspace:* consumer)
    - pnpm workspace + catalog
    - tsdown 0.21.9 (shebang detection)
  provides:
    - packages/lattice-cli/ workspace package
    - bin/lattice via tsdown shebang round-trip
    - citty subcommand seam (lazy dynamic imports)
    - depcheck gate (CLI-06) wired into lattice lint:packages
    - stable drop-in surface for plans 11-02 (verify) and 11-03 (repro)
  affects:
    - packages/lattice/package.json (lint:packages chain extended)
    - pnpm-workspace.yaml (catalog citty 0.2.2 added)
tech_stack:
  added:
    - citty@0.2.2 (catalog)
  patterns:
    - tsdown shebang detection auto-maintains package.json bin field
    - citty defineCommand with subCommands as Resolvable thunks for lazy loading
    - regex-based depcheck against built dist/* (not source) to catch real runtime closure leaks
    - stub subcommand default exports that plans 11-02/11-03 replace without touching cli.ts
key_files:
  created:
    - packages/lattice-cli/package.json
    - packages/lattice-cli/tsconfig.json
    - packages/lattice-cli/tsdown.config.ts
    - packages/lattice-cli/vitest.config.ts
    - packages/lattice-cli/src/cli.ts
    - packages/lattice-cli/src/version.ts
    - packages/lattice-cli/src/commands/repro.ts
    - packages/lattice-cli/src/commands/verify.ts
    - packages/lattice-cli/test/cli.test.ts
    - packages/lattice/scripts/check-cli-deps.mjs
  modified:
    - pnpm-workspace.yaml (catalog citty 0.2.2)
    - packages/lattice/package.json (lint:packages now chains check-cli-deps.mjs)
    - pnpm-lock.yaml (lockfile updated for new workspace package + citty resolution)
decisions:
  - "Hand-write latticeCliVersion as a constant rather than reading package.json at runtime — avoids forcing node:fs into the bin entry; Phase 13 can promote to build-time inject."
  - "Subcommand stubs exit code 2 (reserved for verify/materialize/load failure per CONTEXT.md) since the operation cannot succeed pre-implementation. Plans 11-02 and 11-03 keep the same export shape (default-exported defineCommand) so cli.ts never needs to change."
  - "Depcheck regex `(from|require|import)\\s*\\(?\\s*[\"']<dep>[\"']` matches only import-position occurrences. Plain substring match on `citty` would trip on `electricity`/`velocity`; the import-syntax anchor eliminates that class of false positives."
  - "Scan greps built dist/*.{js,mjs,cjs,d.ts} (not source). Type-only imports get stripped by tsdown, so only the runtime closure can actually leak CLI deps; source-level scanning would over-trigger on type imports."
  - "lattice-cli test script is `pnpm build && vitest run` so the smoke test always reads a freshly-built dist/cli.js. Same convention as lattice's lint:packages chain."
metrics:
  duration_minutes: 4
  tasks_completed: 3
  files_created: 10
  files_modified: 3
  completed_date: "2026-05-11"
---

# Phase 11 Plan 01: Lattice CLI Scaffolding + Depcheck Gate Summary

Bootstrap `packages/lattice-cli` as a pnpm workspace package with a citty-driven bin entry, lazy subcommand seam for `repro`/`verify`, and a depcheck gate that prevents CLI-only deps from leaking into the lattice runtime.

## What Shipped

### Workspace package scaffolding

`packages/lattice-cli/` is a new workspace package mirroring the `packages/lattice/` style:

- `package.json`:
  - `name: "lattice-cli"`, `type: "module"`, `sideEffects: false`, `engines.node: ">=24"`
  - `bin: { "lattice": "./dist/cli.js" }` (auto-maintained by tsdown shebang detection)
  - `exports`: ESM-only with declaration map (`./dist/cli.d.ts` + `./dist/cli.js`)
  - `dependencies`: `lattice: "workspace:*"`, `citty: "catalog:"`
  - `devDependencies`: `@types/node: "catalog:"` (vitest/tsdown/publint/attw inherit from root workspace devDeps)
  - `scripts.test`: `pnpm build && vitest run` (smoke test reads dist/, so build precedes)
- `tsconfig.json` extends `../../tsconfig.base.json` (same strict + bundler-resolution profile)
- `tsdown.config.ts` mirrors lattice's: single entry, ESM, dts, sourcemap, clean, treeshake. Critically — no explicit `banner` or `bin` option; tsdown infers both from the shebang on `src/cli.ts`.
- `vitest.config.ts` identical to lattice's

### Workspace catalog delta

Added one line to `pnpm-workspace.yaml`:

```yaml
catalog:
  ...
  citty: 0.2.2
  ...
```

No package-list change needed — the existing `packages/*` glob picks up `packages/lattice-cli/`. After `pnpm install`, lattice-cli resolves `lattice` via `workspace:*` and `citty` from the catalog at `0.2.2`.

### Bin entry with lazy subcommand seam

`packages/lattice-cli/src/cli.ts`:

```ts
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";
import { latticeCliVersion } from "./version.js";

const main = defineCommand({
  meta: { name: "lattice", version: latticeCliVersion, description: "Lattice CLI — repro and verify signed capability receipts" },
  subCommands: {
    repro: () => import("./commands/repro.js").then((m) => m.default),
    verify: () => import("./commands/verify.js").then((m) => m.default),
  },
});

runMain(main);
```

The `subCommands` entries are citty's `Resolvable<T>` thunks. Running `lattice verify ...` only imports `commands/verify.js`; the `repro` handler graph is never loaded. This is the CLI-04 lazy-load contract.

`src/commands/repro.ts` and `src/commands/verify.ts` are minimal stubs that emit `not-implemented` to stderr and exit code 2 (the CONTEXT.md-reserved code for verify/materialize/load failure — appropriate since the command cannot succeed yet). Plans 11-02 and 11-03 will replace these file bodies; the `export default defineCommand({...})` shape stays stable so `src/cli.ts`, `tsdown.config.ts`, and `check-cli-deps.mjs` never need to be touched again by those plans.

### How tsdown wired the bin

tsdown 0.21.9's shebang detection does two things automatically when it finds `#!/usr/bin/env node` at byte 0 of an entry:

1. Preserves the shebang verbatim in `dist/cli.js` (and chmods it executable — observed in build log: "Granting execute permission to dist/cli.js")
2. Maintains `bin.lattice = "./dist/cli.js"` in the package.json

Confirmed via:

```bash
$ head -c 20 packages/lattice-cli/dist/cli.js
#!/usr/bin/env node
$ node -e "console.log(require('./packages/lattice-cli/package.json').bin)"
{ lattice: './dist/cli.js' }
$ node packages/lattice-cli/dist/cli.js --help
Lattice CLI — repro and verify signed capability receipts (lattice v0.0.0)
USAGE lattice repro|verify
COMMANDS
   repro    Replay a signed receipt and diff against recorded outputs
  verify    Verify a receipt's signature and structural integrity
# exit 0
```

The bin smoke test in `test/cli.test.ts` codifies this with three vitest cases: `--help` exits 0 with both subcommands mentioned; `repro abc` exits 2 with `not-implemented`; `verify ./fixture.json` exits 2 with `not-implemented`.

### Depcheck gate (CLI-06)

`packages/lattice/scripts/check-cli-deps.mjs` walks `packages/lattice/dist/` for any `.js`, `.mjs`, `.cjs`, or `.d.ts` file and asserts that no forbidden CLI-only symbol appears in import position. Forbidden symbols: `citty`, `commander`, `cac`, `yargs`.

The match regex is:

```
(from|require|import)\s*\(?\s*["']<dep>["']
```

This anchors against the three import syntaxes (`from "citty"`, `require("citty")`, `import("citty")`) so plain word collisions cannot trigger a false positive (e.g. `velocity`, `electricity`, `accommodation`). Scanning targets the built `dist/*` rather than `src/*` because type-only imports get stripped by tsdown — only the runtime closure can actually leak a CLI dep. `.d.ts` files are scanned too so a CLI type leaking into the public types is also caught.

Wired into the existing `lint:packages` chain:

```jsonc
"lint:packages": "pnpm build && publint && attw --pack . --profile esm-only && node ./scripts/check-cli-deps.mjs"
```

`&&`-joined so any non-zero exit fails the lint. Order matters: `pnpm build` runs first to produce `dist/`, then publint/attw, then the depcheck.

#### Manual verification that the gate works

A one-shot smoke test of the gate (not committed): appended `import "citty";` to `packages/lattice/dist/index.js`, ran `node packages/lattice/scripts/check-cli-deps.mjs`, observed:

```
[check-cli-deps] FAIL — lattice runtime imports forbidden CLI-only deps:
  /…/packages/lattice/dist/index.js  ->  citty
# exit 1
```

Reverted the dist file immediately. The regex caught the violation; the gate is live.

## Verification Results

End-of-plan sweep (all exited 0):

```bash
pnpm install                                # workspace resolves lattice-cli
pnpm --filter lattice-cli build             # dist/cli.js with shebang
pnpm --filter lattice-cli test              # 3/3 smoke tests pass
pnpm --filter lattice build                 # runtime build
pnpm --filter lattice lint:packages         # publint + attw + check-cli-deps all green
head -c 20 packages/lattice-cli/dist/cli.js # prints #!/usr/bin/env node
node packages/lattice-cli/dist/cli.js --help # exits 0, lists repro + verify
```

Plus a `cd packages/lattice-cli && pnpm exec tsc --noEmit` typecheck that exited 0.

## Deviations from Plan

None — plan executed exactly as written. The plan's Task 3 already noted updating `test` to `pnpm build && vitest run` either in Task 1's package.json or in Task 3 ("fine either way"); chose Task 1 so the lattice-cli package.json was correct on first write.

## Forward Links

Plans 11-02 and 11-03 are now unblocked:

- **Plan 11-02 (verify)** drops into `packages/lattice-cli/src/commands/verify.ts`. The stub's `export default defineCommand({...})` contract is the seam: 11-02 swaps the `run` body to call `verifyReceipt(envelope, keySet)` against `lattice` public exports and emits `OK kid=… verdict=…` (exit 0) or `FAIL kind=… reason=…` (exit 1). 11-02 also adds `--key <path>` (default `~/.lattice/keyset.json`). The `cli.ts` lazy import resolves the new export automatically; no other files change.
- **Plan 11-03 (repro)** drops into `packages/lattice-cli/src/commands/repro.ts` and adds a `src/io/artifact-loader.ts` per CONTEXT.md. Same lazy-import contract — `cli.ts` untouched.

The lazy `() => import(...)` shape is what keeps 11-02 and 11-03 parallelizable: neither plan loads the other's graph, neither plan touches `cli.ts` / `tsdown.config.ts` / `check-cli-deps.mjs`, so they can be executed in either order or concurrently without merge conflicts.

## Commits

- `c807b07` — feat(11-01): scaffold lattice-cli workspace package
- `a1bb9b2` — feat(11-01): implement citty bin entry with lazy subcommand stubs
- `73af50e` — feat(11-01): bin smoke test + depcheck gate for CLI-only deps

## Self-Check: PASSED

All 10 created files present on disk. All 3 task commits present in git log.
