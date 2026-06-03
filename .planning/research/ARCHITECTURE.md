# Architecture Research

**Domain:** npm publish + OIDC trusted publishing + external canary consumer (additive to existing pnpm monorepo)
**Researched:** 2026-06-03
**Confidence:** HIGH (npm OIDC verified against official docs, repo state inspected file-by-file)

## Scope Boundary

This document covers ONLY the architecture additions for v1.3 (public release + canary). It does NOT re-research the existing Lattice runtime architecture, which is already shipped and validated through v1.2.

Five questions in scope:
- (a) Phase ordering for the package rename vs CI scaffolding
- (b) Where the OIDC trust boundary lives
- (c) How the canary's two test suites stay isolated
- (d) Cost-ceiling enforcement architecture
- (e) Data flow between Lattice release workflow and canary CI

## System Overview

```
                          [GitHub repo: fullselfbrowsing/Lattice]
                                        │
   ┌────────────────────────────────────┼────────────────────────────────────┐
   │                                    │                                    │
   │  .github/workflows/                │   packages/                        │
   │  ┌──────────────┐  ┌────────────┐  │   ┌────────────────────────────┐  │
   │  │   ci.yml     │  │ release.yml│  │   │ @fullselfbrowsing/lattice  │  │
   │  │ (PR + push)  │  │ (tag push) │  │   │ @fullselfbrowsing/lattice- │  │
   │  └──────┬───────┘  └─────┬──────┘  │   │   cli (bin: lattice)       │  │
   │         │                │         │   └────────────────────────────┘  │
   └─────────┼────────────────┼─────────┼────────────────────────────────────┘
             │                │
   typecheck │                │ permissions: { id-token: write, contents: write }
   test      │                │ npm publish --provenance (implicit via OIDC)
   lint:pkgs │                │
   (publint, │                ▼
    attw)    │       ┌────────────────────────────────┐
             │       │  npm registry (@fullselfbrowsing) │
             │       │   trusted publisher config:        │
             │       │     repo = fullselfbrowsing/Lattice│
             │       │     workflow = release.yml         │
             │       │     environment = (optional gate)  │
             │       └────────────┬───────────────────────┘
             │                    │
             │                    │ tarballs + provenance attestations
             │                    ▼
             │       ┌────────────────────────────────────────────────────┐
             │       │  GitHub repo: fullselfbrowsing/lattice-canary       │
             │       │  (separate repo, standalone install, no workspace)  │
             │       │                                                     │
             │       │  package.json depends on:                           │
             │       │    "@fullselfbrowsing/lattice": "^1.3.0"            │
             │       │    "@fullselfbrowsing/lattice-cli": "^1.3.0"        │
             │       │                                                     │
             │       │  .github/workflows/                                 │
             │       │  ┌──────────────────┐  ┌────────────────────────┐  │
             │       │  │ unit.yml         │  │ integration.yml         │  │
             │       │  │ (PR + push)      │  │ (cron + manual dispatch)│  │
             │       │  │ fake providers   │  │ real providers + budget │  │
             │       │  └──────────────────┘  └────────────────────────┘  │
             │       └─────────────────────────────────────────────────────┘
             │                    ▲
             │                    │ repository_dispatch event
             │                    │ payload: { tag, lattice_version, cli_version }
             └────────────────────┘
                  Lattice release.yml's final job pings canary repo after publish

Existing (unchanged):
  packages/lattice/src      packages/lattice-cli/src      examples/work-inbox      examples/agent-loop
  showcase/angular          tools                         docs                     .planning
```

## Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| `packages/lattice/package.json` (modified) | Declare published identity, OIDC-required `repository` field | Rename `name` field; add `license`, `repository`, `bugs`, `homepage`, `publishConfig.access: "public"` |
| `packages/lattice-cli/package.json` (modified) | Declare CLI identity, depend on renamed core | Rename `name`; rename `dependencies.lattice` → `dependencies."@fullselfbrowsing/lattice"` (still `workspace:*`); preserve `bin.lattice` |
| `.changeset/config.json` (modified) | Tell changesets the new published names | `packages` filter unchanged (workspace globs), but `linked` / `fixed` arrays must reference the new scoped names |
| `.github/workflows/ci.yml` (NEW) | PR-time gate: install, typecheck, test, lint:packages | Matrix on Node 24; `pnpm install --frozen-lockfile`; `pnpm -r typecheck`; `pnpm -r test`; `pnpm -r lint:packages` (publint + attw) |
| `.github/workflows/release.yml` (NEW) | Tag/changesets-PR publish with OIDC + provenance | `permissions: { id-token: write, contents: write }`; `pnpm changeset publish` or `pnpm publish -r --access public`; npm 11.5.1+; `gh release create` step |
| `tsd` paths map in `packages/lattice/package.json` (modified) | Type-test resolves new name | `paths."@fullselfbrowsing/lattice"` instead of `paths.lattice` |
| `packages/lattice/scripts/check-cli-deps.mjs` (unchanged) | Already scans for `citty/commander/cac/yargs` strings; package-name-agnostic | No change required |
| Canary repo `package.json` (NEW, separate repo) | External consumer pinning registry deps | `dependencies` references only registry packages; no workspace protocol |
| Canary `test/unit/**` (NEW) | Fast, deterministic, runs every PR | Vitest + Lattice's own `createFakeProvider` exported from `@fullselfbrowsing/lattice` |
| Canary `test/integration/**` (NEW) | Real-provider end-to-end gated to cron + dispatch | Vitest with separate config; `CostTracker` wrapper aborts on budget exceed |
| Canary `test/cli/**` (NEW) | Subprocess smoke against installed `lattice` bin | `execa` or `node:child_process` against `node_modules/.bin/lattice` |

## Phase Ordering (Answer to Question a)

Dependency direction forces ordering. Each phase below names the smallest set of files that change.

### Phase A: Package rename (FIRST, in Lattice repo only)

**Why first:** CI must test the new names. If CI scaffolding lands before the rename, the workflow tests packages that won't exist after the rename, and you re-test everything. Rename first means CI is born testing the final shape.

**Files modified (12, all in lattice repo):**
1. `packages/lattice/package.json` — `name: "@fullselfbrowsing/lattice"`, add `license`, `repository`, `bugs`, `homepage`, `publishConfig`, update `tsd.paths`
2. `packages/lattice-cli/package.json` — `name: "@fullselfbrowsing/lattice-cli"`, rename `dependencies.lattice` key, add same release metadata
3. `packages/lattice-cli/src/io/sidecar-loader.ts` — import string
4. `packages/lattice-cli/src/io/receipt-loader.ts` — import string
5. `packages/lattice-cli/src/io/artifact-loader.ts` — import string
6. `packages/lattice-cli/src/io/keyset-loader.ts` — import string
7. `packages/lattice-cli/src/io/receipt-walker.ts` — import string
8. `packages/lattice-cli/src/io/sidecar-walker.ts` — import string
9. `packages/lattice-cli/src/commands/verify.ts` — import string
10. `packages/lattice-cli/src/commands/repro.ts` — import string
11. `packages/lattice-cli/src/eval/runner.ts` — import string
12. `packages/lattice-cli/test/*.test.ts` (5 files) and `packages/lattice/test-d/package-types.test-d.ts` — import strings
13. `examples/agent-loop/package.json` — workspace dep rename
14. `examples/work-inbox/index.mjs` and friends — if any import `lattice` (currently `.mjs` calling built artifacts)

**Verification:** existing test suite (733 tests) all pass against new names. No CI workflow runs yet; this is a pure local sweep validated by `pnpm -r test` on the dev machine. `pnpm install` rewrites the lockfile to reflect the new internal dep name.

**Smallest possible change set:** ~15 files. Mechanical find/replace of the literal string `"lattice"` (when it's an import specifier or a `dependencies` key) → `"@fullselfbrowsing/lattice"`. Validated by Bash inventory: 15 files contain `from "lattice"` matches.

### Phase B: CI scaffolding (SECOND, in Lattice repo)

**Why second:** CI tests must run against the renamed packages so the workflow has the same surface that publish will produce. If CI ran first, you'd write the workflow for the old name and then have to revise the YAML during the rename phase, doubling the review surface.

**Files NEW:**
- `.github/workflows/ci.yml`

**Files modified:**
- (none — CI scaffolding is purely additive)

**ci.yml shape:**
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.1 }
      - uses: actions/setup-node@v5
        with: { node-version: '24', cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm -r test:types
      - run: pnpm -r lint:packages   # publint + attw + check-cli-deps
```

`lint:packages` already runs `publint` and `attw --pack . --profile esm-only`; both work against the renamed packages without modification because they read `name` from `package.json` at invocation time.

### Phase C: OIDC binding + release workflow (THIRD)

**Why third:** Publishing requires the workflow file to exist before the npm trusted-publisher config can reference it by filename. npm trust config is keyed on `(repo, workflow_filename, environment_name)`, so the file path is part of the trust tuple. Land the file in main first, then configure npm.

**Files NEW:**
- `.github/workflows/release.yml`

**Files modified:**
- `.changeset/config.json` — set `access: "public"`, ensure `changelog` plugin is configured

**release.yml shape (Trusted Publisher, no NPM_TOKEN):**
```yaml
name: Release
on:
  push:
    tags: ['v*.*.*']
permissions:
  contents: write   # for gh release create
  id-token: write   # MANDATORY for OIDC trusted publishing
jobs:
  publish:
    runs-on: ubuntu-latest
    environment: npm-publish   # optional but recommended; gates manual approval
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
        with: { version: 10.33.1 }
      - uses: actions/setup-node@v5
        with:
          node-version: '24'
          registry-url: 'https://registry.npmjs.org'
      - run: npm install -g npm@latest   # >= 11.5.1 required for trusted publishing
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r build
      - run: pnpm -r lint:packages
      - run: pnpm publish -r --access public --no-git-checks
        # No NODE_AUTH_TOKEN. OIDC handshake happens inside `npm publish`.
        # --provenance is implicit when trusted publisher is configured.
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            packages/lattice/*.tgz
            packages/lattice-cli/*.tgz
```

**OIDC trust boundary lives in THREE places (Answer to Question b):**

| Layer | Where | What it controls | Verified |
|-------|-------|------------------|----------|
| 1. Workflow permissions | `release.yml` `permissions.id-token: write` | Lets the job mint an OIDC token. Without it, `npm publish` fails before contacting npm. | docs.npmjs.com/trusted-publishers/ |
| 2. npm side trust config | npmjs.com → org `@fullselfbrowsing` → package settings → Trusted Publisher | Binds `(github.com/fullselfbrowsing/Lattice, release.yml, optional environment)` to one specific package | docs.npmjs.com/trusted-publishers/ |
| 3. package.json `repository` field | `packages/lattice/package.json` and `packages/lattice-cli/package.json` | REQUIRED for provenance attestation to be generated; without it, npm refuses to publish provenance even under OIDC | docs.npmjs.com/generating-provenance-statements/ |

**Important behavior:** Configurations created after May 20, 2026 must explicitly enable `publish` in the npm trusted-publisher UI; pre-existing configs default to publish. Since this is brand-new (June 2026), the new-rule path applies. The release.yml `environment: npm-publish` line is OPTIONAL but adds a manual-approval gate before the first publish, which is cheap insurance for v1.3.0.

**The first publish IS the smoke test of release.yml.** There is no way to dry-run an OIDC publish without actually publishing. Mitigations:
- Use `pnpm publish --dry-run` in a separate workflow_dispatch job first to validate the tarball
- Pre-create both packages on npm via a one-time manual publish using a granular token, THEN flip to OIDC trusted publisher (this is what npm recommends; their docs call this "claim then trust")
- Tag a `v1.3.0-rc.1` first so the smoke-test failure mode is a prerelease, not the real v1.3.0

### Phase D: Canary repo scaffolding (FOURTH, separate repo)

**Why fourth:** Canary installs `@fullselfbrowsing/lattice@^1.3.0` from the registry. That version doesn't exist until Phase C completes a publish. Canary scaffolding can be drafted in parallel (private branch) but cannot run end-to-end until first publish.

**Files NEW (separate repo fullselfbrowsing/lattice-canary):**

```
lattice-canary/
├── package.json                # depends on registry packages, NOT workspace
├── pnpm-lock.yaml              # pinned to specific lattice version
├── tsconfig.json
├── vitest.config.ts            # default config — used by unit suite
├── vitest.integration.config.ts # separate config — used by integration only
├── .github/
│   └── workflows/
│       ├── unit.yml            # on: [pull_request, push]
│       ├── integration.yml     # on: [schedule (nightly), workflow_dispatch, repository_dispatch]
│       └── refresh-lattice.yml # on: repository_dispatch from Lattice release.yml
├── src/
│   └── helpers/
│       ├── fake-providers.ts   # imports createFakeProvider from @fullselfbrowsing/lattice
│       ├── ephemeral-keyset.ts # generates Ed25519 keypair per test session
│       └── cli-runner.ts       # spawns @fullselfbrowsing/lattice-cli bin via execa
└── test/
    ├── unit/
    │   ├── public-api.test.ts        # named exports exist + correct shape
    │   ├── receipts-roundtrip.test.ts # signer → verifier with ephemeral keyset
    │   ├── tripwire-bands.test.ts    # SAFETY/OBSERVABILITY/EXTENSION priority
    │   └── agent-loop.test.ts        # ai.runAgent against fake provider
    └── integration/
        ├── openai.test.ts
        ├── anthropic.test.ts
        ├── gemini.test.ts
        ├── cli-subprocess.test.ts    # spawns `lattice repro` `lattice verify` `lattice eval`
        └── cost-ceiling.guard.ts     # NOT a .test file; imported by integration setup
```

## Canary Test Suite Isolation (Answer to Question c)

Two suites must never run together, must not share fixtures, and must not share Vitest config — because their reliability assumptions differ.

### Two-config strategy

`vitest.config.ts` (default):
```ts
export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts'],
    testTimeout: 5_000,                  // unit tests are fast
    setupFiles: ['./test/unit/setup.ts'],
    pool: 'threads',                     // parallel, deterministic
  },
});
```

`vitest.integration.config.ts`:
```ts
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    testTimeout: 120_000,                // real API calls
    setupFiles: ['./test/integration/setup.ts'],
    pool: 'forks',                       // each test in fresh process
    poolOptions: { forks: { singleFork: true } },  // serial — providers rate-limit
    bail: 1,                             // STOP on first failure
                                          // (so the cost-ceiling guard's abort actually stops)
    retry: 0,                            // never retry real-provider tests; flakes mean real bugs or budget
  },
});
```

### CI workflow isolation

`unit.yml` runs `pnpm vitest run` (default config). Triggers: `pull_request`, `push`. No secrets. Runs in <30 seconds. Gates PR merge.

`integration.yml` runs `pnpm vitest run --config vitest.integration.config.ts`. Triggers:
- `schedule: cron: '0 7 * * *'` (nightly UTC)
- `workflow_dispatch` (manual)
- `repository_dispatch` of type `lattice-published` (see Question e)

Requires secrets: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `LATTICE_COST_CEILING_USD`. Runs as a single job in `serial` mode so the cost guard's abort actually halts the suite.

### Fixture isolation

- Unit suite: in-memory artifact store, ephemeral keyset generated per `beforeAll`, fake providers from `createFakeProvider({ capabilities })` (already exported from `@fullselfbrowsing/lattice`).
- Integration suite: separate keyset (still ephemeral, still per-session), real providers, persistent `.canary/receipts/` directory written only during the run, cleaned up in `afterAll`.

The two suites must not share helper modules that touch real network. `src/helpers/fake-providers.ts` is safe to import from both. `src/helpers/real-providers.ts` (NEW) is imported ONLY from `test/integration/**`. ESLint rule enforces this (`no-restricted-imports` scoped to `test/unit/`).

## Cost-Ceiling Architecture (Answer to Question d)

The ceiling must fire BEFORE the next provider call, must produce a structured failure, and must leave in-flight HTTP requests to complete naturally (cancelling mid-request wastes the cost you already incurred without recording it).

### Architecture: suite-level guard wrapping per-test budgets

Three layers, each with a different failure surface:

**Layer 1: per-test budget (already exists in Lattice).** Each integration test creates an `ai` runtime with a `contract.budget.maxCostUsd` and reads `CostTracker.budgetStatus(budget)`. When status is `"exceeded"`, the TEST fails. This is normal lattice contract behavior — no new architecture.

**Layer 2: suite-level cumulative guard (NEW).** A shared `SuiteCostTracker` accumulates usage across all tests in the integration suite. Lives in `test/integration/cost-ceiling.guard.ts`:

```ts
// test/integration/cost-ceiling.guard.ts
import { createCostTracker } from '@fullselfbrowsing/lattice';
import type { Usage } from '@fullselfbrowsing/lattice';

const CEILING_USD = Number(process.env.LATTICE_COST_CEILING_USD ?? '5.00');
const suite = createCostTracker();
let aborted = false;

export function recordSuiteUsage(usage: Usage): void {
  if (aborted) return;
  suite.recordIteration(usage);
  const total = suite.total().costUsd ?? 0;
  if (total >= CEILING_USD) {
    aborted = true;
    // Emit structured failure to stdout so the workflow log machine-parses it
    console.error(JSON.stringify({
      event: 'canary.cost-ceiling.exceeded',
      ceilingUsd: CEILING_USD,
      totalUsd: total,
      timestamp: new Date().toISOString(),
    }));
    // Throw inside a test → vitest with bail:1 stops the suite.
    // Cannot synchronously stop here — we are inside a test's await.
    throw new Error(`COST_CEILING_EXCEEDED total=${total} ceiling=${CEILING_USD}`);
  }
}

export function isAborted(): boolean { return aborted; }
```

Each integration test calls `recordSuiteUsage(result.usage)` after every `ai.run` / `ai.runAgent` call. Subsequent tests check `isAborted()` in their `beforeEach` and `test.skip` themselves with a structured reason.

**Layer 3: process-level circuit breaker (defensive, fires only on bugs).** If Layer 2 fails to fire (a test forgot to call `recordSuiteUsage`), a setup-file `beforeAll` registers a 10-minute hard `setTimeout` that calls `process.exit(2)` with a structured marker. This is belt-and-suspenders: real protection is Layer 2.

### Failure surface (Answer to "what happens to in-flight requests")

In-flight HTTP requests are allowed to complete; cancelling them mid-call wastes prepaid cost. The guard fires AFTER `recordSuiteUsage` is called with the just-completed request's usage. The next test sees `isAborted() === true` and skips itself. With `bail: 1` in the integration vitest config, the first thrown `COST_CEILING_EXCEEDED` halts the whole suite.

### Testability of the guard

The guard module is pure TypeScript with one env-var input and three exported functions. Unit-testable from `test/unit/cost-ceiling.guard.test.ts` by:
1. Setting `process.env.LATTICE_COST_CEILING_USD = '1.00'`
2. Calling `recordSuiteUsage({ promptTokens: 0, completionTokens: 0, costUsd: 0.50 })` twice
3. Asserting the second call throws `COST_CEILING_EXCEEDED` and emits the structured JSON

That unit test runs on every canary PR (fast, no secrets), so the guard is exercised even on days nothing real publishes.

### When does the guard fire?
- After the FIRST request whose accumulated total `>= LATTICE_COST_CEILING_USD`
- Surface: structured `JSON.stringify` log line on stderr (`canary.cost-ceiling.exceeded`)
- Plus thrown `Error('COST_CEILING_EXCEEDED total=… ceiling=…')` → vitest `bail:1` stops suite
- Exit code: 1 (vitest default for failed suite). CI workflow detects the structured log and fires a Slack/PagerDuty notification via a separate step.

## Data Flow: Lattice repo → canary repo (Answer to Question e)

The canary repo must know when a new `@fullselfbrowsing/lattice` version exists so it can refresh its pinned dep and rerun integration tests against fresh bits.

### Recommended: GitHub `repository_dispatch` event from Lattice release.yml

After `pnpm publish -r` succeeds, the Lattice release workflow fires a `repository_dispatch` event at the canary repo with the published tag and versions in the payload. The canary repo's `refresh-lattice.yml` workflow listens for this event, bumps the dep, opens a PR, and that PR triggers `integration.yml`.

```yaml
# tail of Lattice release.yml
      - name: Notify canary
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.CANARY_DISPATCH_TOKEN }}   # PAT or fine-grained token
          repository: fullselfbrowsing/lattice-canary
          event-type: lattice-published
          client-payload: |
            {
              "tag": "${{ github.ref_name }}",
              "lattice_version": "${{ steps.publish.outputs.lattice_version }}",
              "cli_version": "${{ steps.publish.outputs.cli_version }}",
              "commit": "${{ github.sha }}"
            }
```

```yaml
# lattice-canary/.github/workflows/refresh-lattice.yml
name: Refresh Lattice
on:
  repository_dispatch:
    types: [lattice-published]
jobs:
  bump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - run: |
          pnpm up @fullselfbrowsing/lattice@${{ github.event.client_payload.lattice_version }} \
                  @fullselfbrowsing/lattice-cli@${{ github.event.client_payload.cli_version }}
      - uses: peter-evans/create-pull-request@v6
        with:
          branch: refresh/lattice-${{ github.event.client_payload.lattice_version }}
          title: "chore: bump Lattice to ${{ github.event.client_payload.lattice_version }}"
          body: |
            Triggered by upstream tag `${{ github.event.client_payload.tag }}`
            (commit `${{ github.event.client_payload.commit }}`).
            Unit suite runs on this PR. Merge to main also triggers a full integration run.
```

### Data flow diagram

```
Lattice repo                                  npm registry            Canary repo
─────────────────────                         ──────────────          ─────────────────────────

git tag v1.3.0 push
     │
     ▼
release.yml
  ┌──────────────┐
  │ checkout     │
  │ build        │
  │ lint:packages│
  │ publish ─────┼─── OIDC handshake ────────▶ verifies trust tuple
  │              │                            (repo,workflow,env)
  │              │                            ├─ accepts tarball
  │              │                            ├─ generates provenance
  │              │                            └─ publishes
  │ gh release ──┼──▶ GitHub Release object created on Lattice repo
  │   create     │
  │              │
  │ repository_ ─┼─────────────────────────────────────────────────▶  refresh-lattice.yml
  │  dispatch    │  event: lattice-published                              │
  │              │  payload: { tag, lattice_version, cli_version }        │
  └──────────────┘                                                        │
                                                                          ▼
                                                                 pnpm up → branch → PR
                                                                          │
                                                                          ▼
                                                                 unit.yml runs on PR (fast)
                                                                 PR merged to main
                                                                          │
                                                                          ▼
                                                                 next nightly cron runs
                                                                 integration.yml against
                                                                 the new pinned version
```

### Alternative considered: canary polls npm

A scheduled canary workflow could query `https://registry.npmjs.org/@fullselfbrowsing/lattice/latest` and bump if changed. Rejected because: (1) delay between publish and detection is up to the cron interval, (2) it couples canary to npm registry availability, (3) `repository_dispatch` carries the upstream commit SHA which is more useful for triage than a version string alone. The repository_dispatch design is also simpler to reason about during incident response.

### Secret needed

`CANARY_DISPATCH_TOKEN` lives in Lattice repo secrets. It's a fine-grained GitHub PAT scoped to `fullselfbrowsing/lattice-canary` with permission `contents: write` + `actions: write`. Owner-rotatable. NOT an OIDC token — `repository_dispatch` does not support OIDC for cross-repo dispatch yet, so this is a deliberate long-lived secret that we accept.

## Architectural Patterns

### Pattern 1: Workspace-internal `workspace:*` survives the rename

**What:** `packages/lattice-cli/package.json` continues to declare `"@fullselfbrowsing/lattice": "workspace:*"` after the rename. pnpm resolves the scoped name to the local workspace package by reading the renamed `packages/lattice/package.json#name`. At publish time, pnpm rewrites `workspace:*` to the actual published version (`^1.3.0`).

**When to use:** Always, for any workspace cross-dep that will be published. Avoids manual version sync between sibling packages.

**Trade-off:** During the rename phase, the `workspace:` protocol means pnpm catches the mismatch immediately. `pnpm install` will error if `dependencies."@fullselfbrowsing/lattice"` exists but no package in the workspace has that name yet — so the two file edits (CLI dep key + core package name) must land in the same commit. Stage them together.

### Pattern 2: First-publish-as-smoke-test

**What:** The OIDC publish path cannot be dry-run without contacting npm. The first real `v1.3.0-rc.1` tag IS the workflow's first integration test.

**When to use:** Any OIDC-trusted publish where you cannot mock the registry handshake.

**Trade-off:** Failure mode is a public release with a typo or missing file. Mitigations: cut `-rc.N` tags first, use `--dry-run` in a separate `workflow_dispatch` job for tarball validation, use `environment: npm-publish` for manual approval before publish step runs.

### Pattern 3: Two vitest configs, two CI workflows, one repo

**What:** Unit and integration suites share a repo but never share a config or a CI run. Each has its own `vitest.config.*.ts`, its own `.github/workflows/*.yml`, its own setup files.

**When to use:** When two test classes have fundamentally different reliability and cost profiles (fast/free vs slow/paid). Separating configs is cheaper than fighting `test.skip` annotations and environment-variable gating inside one suite.

**Trade-off:** Two configs to keep in sync (shared `setupFiles` pattern helps). Worth it because the unit suite must NEVER need a real API key to run.

### Pattern 4: Cumulative cost guard at suite scope, not test scope

**What:** Per-test budgets catch a single runaway test. A suite-scoped cumulative tracker catches the more dangerous case: every test under-budget individually but their sum exceeds the night's allowance.

**When to use:** Any test suite that makes real, paid API calls in batch.

**Trade-off:** Module-level mutable state (`aborted`, the singleton `CostTracker`) is ugly but isolated to test infrastructure. Process-level cleanup at suite end is sufficient because each workflow run is a fresh process.

### Pattern 5: Cross-repo signal via repository_dispatch, not registry polling

**What:** Upstream repo pushes an event to downstream repo on publish. Downstream listens and acts.

**When to use:** When you want low-latency, payload-carrying signals between repos you control, and the signal needs to carry context (commit SHA, version) the receiver can't easily re-derive.

**Trade-off:** Requires a long-lived cross-repo PAT. Worth it for the latency and the payload richness vs cron polling.

## Anti-Patterns

### Anti-Pattern 1: Land CI scaffolding before the rename

**What people do:** Write `ci.yml` referencing `lattice` and `lattice-cli`, then rename the packages a week later, then edit the workflow YAML to match.

**Why it's wrong:** Doubles the review surface. The workflow's first green run is against the old names, providing no signal about the renamed surface. PRs become harder to review because YAML diffs and package.json diffs mix.

**Do this instead:** Rename in commit N. Land CI in commit N+1. CI's first green run is against the publish-shape.

### Anti-Pattern 2: Use a long-lived NPM_TOKEN "just to ship v1.3.0 fast"

**What people do:** Skip the npm Trusted Publisher dance for the first release, use a classic token, plan to migrate later.

**Why it's wrong:** v1.3 is the foundation that every subsequent release inherits. A token-based first release means provenance attestations are missing from the v1.3.0 tarball forever — they cannot be retroactively added. Provenance is a per-tarball signature.

**Do this instead:** Configure Trusted Publisher BEFORE the first publish. Accept the one-time inconvenience of pre-creating the package shells via a granular token, then flipping to OIDC for all future versions including v1.3.0 itself.

### Anti-Pattern 3: Put the canary inside `examples/` as a third workspace package

**What people do:** Skip the separate repo. Add `examples/canary` to the existing workspace, install runs `pnpm install`, tests use `workspace:*`.

**Why it's wrong:** Workspace symlinks silently bypass `npm pack`, `exports` field validation, `publishConfig`, file inclusion via `files` array. The whole point of the canary is to catch packaging bugs. Workspace-internal cannot do that.

**Do this instead:** Separate public repo, registry-installed deps, completely isolated install graph.

### Anti-Pattern 4: Per-test cost ceiling without a suite-level cumulative guard

**What people do:** Set `contract.budget.maxCostUsd: 0.50` on each test, assume nightly budget = 0.50 × N.

**Why it's wrong:** Per-test budgets only catch a runaway single test. The dangerous failure mode is 50 tests each spending $0.49 in unfortunate combinations summing to $24.50 nightly. No single test trips its budget; the bill is the failure.

**Do this instead:** Suite-level cumulative `SuiteCostTracker` with `LATTICE_COST_CEILING_USD` as the upper bound on total nightly spend. Per-test budgets remain useful as additional defense in depth.

### Anti-Pattern 5: Cron-poll npm registry from canary

**What people do:** Canary cron job queries `npm view @fullselfbrowsing/lattice version` every hour, bumps if changed.

**Why it's wrong:** Cron interval is the lower bound on detection latency. Loses upstream context (commit SHA, tag name). Adds dependency on registry uptime to canary's correctness.

**Do this instead:** `repository_dispatch` from Lattice's release workflow. Carries `{ tag, lattice_version, cli_version, commit }`. Latency is whatever the GitHub event bus contributes (sub-second typically).

## Integration Points

### External services

| Service | Integration pattern | Notes |
|---------|---------------------|-------|
| npm registry | OIDC trusted publisher via `npm publish` (npm CLI 11.5.1+) | NO `NODE_AUTH_TOKEN`; trust is config'd at registry side. Provenance auto-generated when `repository` field present. |
| GitHub Releases | `softprops/action-gh-release@v2` | Attach `*.tgz` from `npm pack` if reproducibility verification is desired |
| OpenAI / Anthropic / Gemini APIs | Real HTTPS calls via existing Lattice provider adapters | Canary integration suite only. Keys in canary repo secrets. |
| GitHub cross-repo dispatch | `peter-evans/repository-dispatch@v3` | Requires fine-grained PAT (`CANARY_DISPATCH_TOKEN`) since OIDC doesn't span cross-repo dispatch yet |

### Internal boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `packages/lattice` ↔ `packages/lattice-cli` (in workspace) | `workspace:*` protocol resolves by package `name` | After rename, both files must change atomically |
| Lattice repo ↔ canary repo (post-release) | `repository_dispatch` GitHub event | Long-lived PAT — accept the secret rather than block on OIDC cross-repo |
| Canary unit suite ↔ canary integration suite | Separate vitest configs, separate workflows, separate setup files | Hard isolation — unit must run without any real-provider env |
| Canary integration tests ↔ cost guard | Module-level singleton in `cost-ceiling.guard.ts` | Each test calls `recordSuiteUsage(result.usage)` after every `ai.run` |

## Scaling Considerations

| Scale | Architecture adjustments |
|-------|--------------------------|
| 1 release/week (current scope) | Manual trigger via tag push is sufficient |
| 5+ releases/week | Move to changesets PR workflow (auto-versioning) — already supported by changesets in workspace |
| Multiple consumers beyond canary | Add a fanout `lattice-published` event handler — each consumer registers via a small list in Lattice repo's release.yml |

### Scaling priorities

1. **First bottleneck:** Manual `npm publish` flake during first 3-5 releases. Mitigate via `-rc.N` tags as smoke tests until release.yml has 3+ successful runs.
2. **Second bottleneck:** Real-provider cost growth as integration suite expands. Mitigate by tightening `LATTICE_COST_CEILING_USD` per quarter and pinning model versions to cheaper tiers in `test/integration/setup.ts`.

## Sources

- [Trusted publishing for npm packages | npm Docs](https://docs.npmjs.com/trusted-publishers/) — HIGH confidence, official docs (verified the `id-token: write` permission requirement, the `repo + workflow + environment` trust tuple, and the May 20 2026 explicit-action requirement)
- [Generating provenance statements | npm Docs](https://docs.npmjs.com/generating-provenance-statements/) — HIGH confidence (verified `repository` field requirement, npm 11.5.1+ requirement, automatic provenance when trusted publisher is configured)
- [npm Trusted Publishing — Philip Nash blog](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/) — MEDIUM (practitioner notes corroborate official docs)
- Lattice repo inspection (file-by-file) — HIGH confidence (15 import sites grep-confirmed, CostTracker API surface read line-by-line, pnpm-workspace.yaml read, package.json fields enumerated)

---
*Architecture research for: v1.3 npm publish + canary architecture additions to existing Lattice monorepo*
*Researched: 2026-06-03*
