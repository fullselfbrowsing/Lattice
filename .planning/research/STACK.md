# Stack Research

**Domain:** TypeScript SDK monorepo — first public npm release pipeline (OIDC Trusted Publisher + provenance + changesets) plus minimal external canary consumer for real-provider integration smoke
**Researched:** 2026-06-03
**Confidence:** HIGH on publish pipeline (Context-free verification: npm docs + GitHub Changelog + changesets/action README), MEDIUM on canary scaffolding (opinionated from ecosystem patterns)

## Scope Discipline

This research only covers the NEW additions for v1.3. The validated existing stack (TypeScript 6.0.3, tsdown 0.21.9, Vitest 4.1.5, tsd 0.33.0, changesets 2.31.0, publint 0.3.18, @arethetypeswrong/cli 0.18.2, pnpm 10.33.1 workspace, Node >= 24) is NOT re-litigated. Where an existing tool already solves a v1.3 need, this doc says "already in repo, do not add a sibling."

## Recommended Stack — Lattice Repo (v1.3 additions only)

### Core Additions to Existing Repo

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `actions/checkout` | `@v5` | Source checkout in workflows | v5 is the GA major built on Node 24 runtime; v4 still works but emits deprecation warnings after GitHub's June 2 2026 forced Node 24 default. v5 (not v6) is the current stable major as of 2026-06; v6 is referenced in some upgrade issues but v5 is the established choice. |
| `actions/setup-node` | `@v4` | Install Node 24 + configure pnpm cache | v4 is the current stable major. Supports `cache: 'pnpm'` natively (>= 6.10) and ships an npm CLI >= 11.5.1 when paired with `node-version: '24'`, which is the floor for OIDC Trusted Publisher. v6 is in flight for Node 24 runtime parity but v4 with `node-version: '24'` works today and is what every shipping monorepo uses. |
| `pnpm/action-setup` | `@v4` | Install pnpm before setup-node cache resolves | Required because `actions/setup-node` reads `packageManager` from root `package.json` (already `pnpm@10.33.1`) but does NOT itself install pnpm; must run BEFORE `setup-node` so the cache step can probe `pnpm store path`. v4 targets Node 24 runtime. |
| `changesets/action` | `@v1` | Drive PR-based version bumps + tag-driven publish | Already wired locally (`@changesets/cli@2.31.0` installed); the GH Action is the missing CI half. v1 is the only major; minor revisions (v1.4.x) bring publish hardening. Pair with `publish: pnpm release` script that runs `pnpm -r build` then `changeset publish`. |

### Existing Repo Tools That Cover v1.3 Needs (DO NOT add siblings)

| Need | Existing Tool | Why It Covers v1.3 |
|------|---------------|---------------------|
| Version bumping + CHANGELOG | `@changesets/cli@2.31.0` | Already in `devDependencies`; produces `CHANGELOG.md` files and orchestrates `changeset publish`. No need for `semantic-release`, `np`, `release-it`, `lerna`. |
| Package publish lint | `publint@0.3.18` | Already wired in `lint:packages` script per package; catches missing `exports`, wrong `type`, broken `files` globs. Sufficient pre-publish gate. |
| Types-on-publish verification | `@arethetypeswrong/cli@0.18.2` | Already in `lint:packages` (`attw --pack . --profile esm-only`). The ESM-only profile is correct for this repo. |
| Test runner across both packages | `vitest@4.1.5` + `@vitest/coverage-v8@4.1.5` | Already at workspace root; `pnpm -r test` already aggregates. CI just calls the existing script. |
| Type tests on public surface | `tsd@0.33.0` | Already configured per `packages/lattice/package.json` with its own `compilerOptions`. CI just calls `pnpm -r test:types`. |
| Bundler / type emit | `tsdown@0.21.9` | Already shipping; ESM-only with shebang detection for the CLI. No need for `tsup`, `rollup`, or `unbuild`. |
| TypeScript compiler | `typescript@6.0.3` | Pinned via pnpm catalog; CI uses it transitively via `tsc -p ... --noEmit`. |
| Workspace manager | `pnpm@10.33.1` workspace | Catalog versions stay authoritative; canary repo deliberately does NOT inherit the catalog (consumes published tarball). |

### Required Workflow Permissions

`release.yml` (publish job) must include:

```yaml
permissions:
  contents: write       # changesets/action writes commits + tags
  pull-requests: write  # changesets/action opens / updates version PR
  id-token: write       # OIDC token minting for npm Trusted Publisher
```

`ci.yml` (PR job) only needs `contents: read` (default).

The `id-token: write` permission is the single irreversible decision that unlocks OIDC publish; without it, `npm publish` falls back to looking for `NPM_TOKEN` and fails with E401.

### Required `package.json` Metadata (Both Publishable Packages)

These are not new dependencies but new fields needed before any publish succeeds. `publint` will flag them as warnings; npm registry will accept them but provenance tooling expects them.

| Field | Value (both packages) | Why |
|-------|-----------------------|-----|
| `name` | `@fullselfbrowsing/lattice` / `@fullselfbrowsing/lattice-cli` | Scope flip per Phase-1 decision in PROJECT.md (currently unscoped `lattice` / `lattice-cli`). |
| `version` | `1.3.0` | First public release per PROJECT.md "First publish: @fullselfbrowsing/lattice@1.3.0". |
| `license` | `MIT` | Currently MISSING in all three package.jsons; LICENSE file exists but the field is required for provenance attestation rendering on npm. |
| `repository` | `{ "type": "git", "url": "git+https://github.com/fullselfbrowsing/lattice.git", "directory": "packages/lattice" }` | Provenance attestations link the published tarball back to the source repo + commit; npm refuses provenance without `repository.url`. The `directory` field is required for monorepo path attribution. |
| `bugs` | `{ "url": "https://github.com/fullselfbrowsing/lattice/issues" }` | publint warning; surfaces on npm package page. |
| `homepage` | `https://github.com/fullselfbrowsing/lattice#readme` | publint warning. |
| `publishConfig` | `{ "access": "public", "provenance": true }` | Scoped packages default to `restricted` (private) on npm; explicit `"access": "public"` is mandatory or `npm publish` 402s. `"provenance": true` is belt-and-suspenders even though OIDC auto-enables it. |
| Internal dep (lattice-cli) | `"@fullselfbrowsing/lattice": "workspace:^"` | Changesets rewrites `workspace:^` to `^1.3.0` at publish time. Current `"lattice": "workspace:*"` becomes wrong both because of the rename AND because `*` resolves to whatever's there (changesets handles `^` better for SemVer ranges in the published tarball). |

## Recommended Stack — Canary Repo (separate `fullselfbrowsing/lattice-canary`)

Minimum-viable scaffolding. This is a smoke-test consumer, not a product. Resist adding ESLint, Prettier, Husky, lint-staged, commit hooks, or a build step — there is no published artifact, only test runs.

### Canary Core

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | `^6.0.0` | Type checking against the published `.d.ts` | Match Lattice's compiler floor exactly — canary's value is catching `attw`-clean-but-still-broken type emission. Loose caret because canary should track future TS minors automatically. |
| Vitest | `^4.1.0` | Test runner | Same family as Lattice so failure traces look familiar; no value in introducing Jest / Mocha. |
| `@types/node` | `^24.12.0` | Node 24 ambient types | Match Lattice engines floor. |
| `tsx` | `^4.19.0` | Run `.ts` directly for CLI subprocess smoke and ad-hoc scripts | Alternative is Node 24's experimental `--experimental-strip-types`, but `tsx` is dependency-free at runtime and predictable across CI matrix. The canary is short-lived enough that adding tsx is cheaper than fighting Node strip-types edge cases. |

### Canary Test Targets — Real Provider Clients

**Decision: use official provider SDKs, NOT raw `fetch`.**

Rationale: the canary's job is to prove that *a real consumer's typical setup* (which is "install the official SDK") works against Lattice's adapters. Going raw-fetch optimizes for a goal nobody has and accidentally tests Lattice's adapter against a different shape than real users hit.

| Provider | Package | Version | Why this one |
|----------|---------|---------|--------------|
| OpenAI | `openai` | `^6.41.0` | Official OpenAI Node SDK. ESM + CJS dual; Node 18+. v6 is current major as of 2026-06 (v6.41.0 published 2026-06). |
| Anthropic | `@anthropic-ai/sdk` | `^0.100.0` | Official Anthropic TypeScript SDK. v0.100.1 published 2026-05-30; pre-1.0 versioning is intentional (Anthropic policy), the SDK is production-stable. |
| Google Gemini | `@google/genai` | `^2.7.0` | The NEW unified Google GenAI SDK (GA since May 2025). The OLDER `@google/generative-ai` is DEPRECATED as of November 30 2025 and lacks Live API / Veo. v2.7.0 is current. |

**What NOT to pull in for the canary:**

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `ai` (Vercel AI SDK) | It's a different runtime philosophy that would shadow Lattice's adapters; canary's job is to prove Lattice's surface, not Vercel's. | Direct provider SDKs above. |
| `@google/generative-ai` | Deprecated November 2025. | `@google/genai`. |
| `dotenv` | Node 24 has `--env-file` flag; CI already exposes secrets as env vars. | Bare `process.env.OPENAI_API_KEY` etc. |
| `xai-sdk` / OpenRouter SDK / LM Studio client | INV-03 parity is Lattice's internal concern. The canary only validates the three providers that have official, well-maintained Node SDKs in 2026. xAI / OpenRouter / LM Studio coverage stays inside Lattice's internal test matrix. | Three official SDKs above; flag remaining providers as Lattice-internal CI coverage. |

### Canary GitHub Actions

| Action | Version | Notes |
|--------|---------|-------|
| `actions/checkout` | `@v5` | Same as Lattice. |
| `actions/setup-node` | `@v4` | `node-version: '24'`, no pnpm cache (canary uses npm to consume the tarball, NOT pnpm). |

Canary uses **npm**, not pnpm, intentionally. Justification: the canary must consume `@fullselfbrowsing/lattice` from the registry exactly as a typical external user would, and `npm install` is the lowest common denominator. Using pnpm in the canary would hide tarball-resolution bugs that surface for plain-npm users (peer dep resolution differences, hoisting differences).

### Canary `workflow_dispatch` Inputs

For the nightly cron + manual dispatch workflow, expose at minimum:

```yaml
on:
  schedule:
    - cron: '17 7 * * *'   # 07:17 UTC nightly; offset from :00 to avoid GitHub scheduler congestion
  workflow_dispatch:
    inputs:
      cost_ceiling_usd:
        description: 'Override per-run USD cost ceiling (Lattice CostTracker)'
        type: string
        default: '1.00'
      providers:
        description: 'Comma-separated providers to exercise'
        type: string
        default: 'openai,anthropic,gemini'
```

The cost ceiling input is forwarded into a Node process that constructs a Lattice `CostTracker` with that budget — the canary uses Lattice's own cost primitive as the kill switch, which doubles as a real-world validation of `CostTracker` correctness. Off-the-shelf "cost cap" actions (e.g. third-party budget-guard actions) are deliberately avoided because they would duplicate functionality Lattice already provides AND fail to dogfood the SDK.

### Canary Secrets

Repository secrets (set via `gh secret set` or repo settings UI, not committed):

| Secret | Provider | Notes |
|--------|----------|-------|
| `OPENAI_API_KEY` | OpenAI | Standard env name the OpenAI SDK reads automatically. |
| `ANTHROPIC_API_KEY` | Anthropic | Standard env name the Anthropic SDK reads automatically. |
| `GEMINI_API_KEY` | Google | `@google/genai` reads this OR `GOOGLE_API_KEY`; pick `GEMINI_API_KEY` for clarity. |

No NPM token is needed in the canary — it consumes from npm public registry, it does not publish.

## Installation

### Lattice Repo (add to existing)

No new `package.json` dependencies. v1.3 additions are entirely:
1. New files in `.github/workflows/` (no `npm install` needed).
2. Field additions in existing `package.json` files (`license`, `repository`, `bugs`, `homepage`, `publishConfig`, scoped `name`, `version: 1.3.0`).
3. New `release` script at root: `"release": "pnpm -r build && changeset publish"`.

### Canary Repo (greenfield)

```bash
mkdir lattice-canary && cd lattice-canary
npm init -y
npm install -D typescript@^6.0.0 vitest@^4.1.0 @types/node@^24.12.0 tsx@^4.19.0
npm install @fullselfbrowsing/lattice@^1.3.0 \
            openai@^6.41.0 \
            @anthropic-ai/sdk@^0.100.0 \
            @google/genai@^2.7.0
```

Note: the canary installs `@fullselfbrowsing/lattice` as a regular dependency (not devDependency) because the integration tests genuinely consume it as application code; this matches what an external user's `dependencies` block would look like.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| changesets (already in repo) | semantic-release | Never for this repo — changesets is wired, semantic-release would duplicate. |
| changesets (already in repo) | `np` / `release-it` | Never — both are interactive and don't model pnpm workspaces well. |
| OIDC Trusted Publisher | Long-lived `NPM_TOKEN` | Only if the GitHub repo were private (provenance is skipped on private repos anyway, but OIDC publish still works). Lattice repo is public; no reason to fall back. |
| Official provider SDKs in canary | Raw `fetch` to provider REST APIs | If a provider's official SDK had a known bug that masked Lattice issues. None of the three providers currently does. |
| `@google/genai` | `@google/generative-ai` | Never — deprecated Nov 2025. |
| Separate canary repo | `examples/canary/` directory | Never — workspace symlinks defeat the test (per PROJECT.md Key Decision: "A workspace-internal example silently uses pnpm symlinks and misses packaging bugs"). |
| npm in canary | pnpm in canary | Never — defeats the "act like a typical external consumer" purpose. |
| `actions/setup-node@v4` with explicit `node-version: '24'` | Reading `.nvmrc` | If repo grows a `.nvmrc`. Currently it doesn't; `engines.node >= 24` is the single source of truth. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `lerna` | Workspace + changesets already cover release orchestration; lerna would conflict. | pnpm workspace + changesets (already in repo). |
| `semantic-release` | Configuration overlap with changesets; commit-message-driven versioning conflicts with changesets' explicit-changeset-file model. | changesets (already in repo). |
| `np` / `release-it` | Interactive flows incompatible with OIDC GitHub Actions automation. | changesets/action@v1. |
| `husky` / `lint-staged` (canary) | Canary has no human commits to gate; CI is the only consumer of its tests. | Bare scripts. |
| `ESLint` / `Prettier` (canary) | Adds maintenance burden for ~200 LOC of test code. | TypeScript strict mode alone. |
| `dotenv` (canary) | Node 24 has `--env-file`; CI exposes secrets directly. | `process.env.*` or Node 24 `--env-file=.env` for local dev. |
| `@google/generative-ai` (canary) | Deprecated November 30 2025; lacks current features. | `@google/genai`. |
| `ai` package / Vercel AI SDK (canary) | Wrong layer — would shadow what Lattice's adapters do. | Direct OpenAI / Anthropic / Google SDKs. |
| `NPM_TOKEN` in Lattice release.yml | Long-lived credential when OIDC short-lived tokens exist. | `permissions: id-token: write` + Trusted Publisher config in npmjs.com package settings. |
| `--provenance` CLI flag override | Redundant when Trusted Publishing is configured; can mask config errors. | Let OIDC auto-detect; set `NPM_CONFIG_PROVENANCE: true` as belt-and-suspenders env var. |
| Manual `npm version` / git tag in release workflow | Changesets handles this. | `changeset publish` (changesets/action creates the GitHub Release object too). |

## Stack Patterns by Variant

**If a publish run needs to skip a package (e.g. CLI breaks but core ships):**
- Don't add a new tool.
- Use changesets' `ignore` config in `.changeset/config.json` plus per-package `private: true` toggle. Already supported by changesets.

**If a provider SDK breaks the canary nightly (upstream regression):**
- Pin the offending SDK to a known-good minor in the canary's `package.json`.
- Open a Lattice issue tagged `canary-regression`, do NOT mask the failure in the workflow.

**If the npm scope `@fullselfbrowsing` cannot be claimed:**
- Fallback per PROJECT.md is unstated; recommend `@fsb-runtime` or `@lattice-sdk` as second-choice scopes. Not part of v1.3 stack research scope to pick; flag for owner.

**If real-provider tests need budget that exceeds the default cost ceiling:**
- Use the `workflow_dispatch` input (`cost_ceiling_usd`) rather than hardcoding higher defaults — keeps nightly cost predictable, lets humans opt in.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| npm CLI >= 11.5.1 | OIDC Trusted Publisher | Hard floor. Shipped by default with Node 24+, so `actions/setup-node@v4` + `node-version: '24'` satisfies it. |
| Node >= 22.14.0 | OIDC Trusted Publisher | Lattice's `engines.node >= 24` already exceeds this. |
| `actions/setup-node@v4` | `pnpm/action-setup@v4` | setup-node must run AFTER pnpm/action-setup so the cache step can call `pnpm store path`. Reversed order silently breaks pnpm caching. |
| `changesets/action@v1` | `@changesets/cli@2.31.0` | The GH Action shells out to the local CLI version; major-version-locked. v1 is the only major. |
| `@changesets/cli@2.31.0` | pnpm workspace `workspace:^` | Changesets transforms `workspace:^` -> `^X.Y.Z` at publish time. Currently `packages/lattice-cli` uses `workspace:*`; change to `workspace:^` before first publish (else the published tarball pins exact). |
| `publint@0.3.18` | ESM-only packages | The repo's `--profile esm-only` is correct given `"type": "module"` everywhere. |
| `@arethetypeswrong/cli@0.18.2` | `tsdown@0.21.9` output | tsdown emits dual `.d.ts` + ESM that `attw` validates clean under `esm-only` profile. Keep as-is. |
| `@google/genai@^2.7.0` | Node 18+ | Compatible with Node 24 floor; no peer conflicts with `openai` or `@anthropic-ai/sdk`. |
| `openai@^6.41.0` | `@anthropic-ai/sdk@^0.100.0` | No shared deps; coexist cleanly. |
| `tsx@^4.19.0` | TypeScript 6.0.3 | tsx tracks recent TS; 4.19 supports TS 5.x and 6.x. |

## Pitfalls Flagged Here (Cross-Reference for PITFALLS.md)

These are stack-decision pitfalls; capture cross-cuts as well in PITFALLS.md.

1. **Forgetting `id-token: write` permission** — publish silently falls back to looking for `NPM_TOKEN` and fails with E401. The error message does NOT mention OIDC.
2. **Forgetting `repository.directory` in monorepo packages** — provenance attestation links to repo root instead of `packages/lattice/`, making the attestation less useful for auditors.
3. **`workspace:*` vs `workspace:^` in `lattice-cli`** — `*` pins exact version in the published tarball, locking CLI users to a single patch of `@fullselfbrowsing/lattice`. Must change to `workspace:^` BEFORE first publish.
4. **Trusted Publisher npmjs.com config drift** — the workflow filename (`release.yml`) must match what's registered in npm package settings literally; renaming the workflow silently breaks publish.
5. **Canary using pnpm workspace** — accidentally symlinks back to local Lattice source, defeating the whole point.
6. **Scoped package default access** — npm defaults scoped packages to `restricted` (private). Without `publishConfig.access: "public"`, the first publish 402s with "private packages require a paid plan."
7. **Provenance and private repos** — if the GitHub repo were ever made private, provenance silently stops being generated even though OIDC publish keeps working. Lattice repo is public; flag for any future visibility change.
8. **`@google/generative-ai` lingering** — easy to copy-paste from old docs; deprecated. Lock canary to `@google/genai`.

## Sources

- [npm Trusted Publishing docs](https://docs.npmjs.com/trusted-publishers/) — HIGH confidence; authoritative on `id-token: write`, npm CLI >= 11.5.1 floor, automatic provenance behavior.
- [GitHub Changelog: npm trusted publishing GA (2025-07-31)](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) — HIGH confidence; GA announcement.
- [changesets/action GitHub README](https://github.com/changesets/action) — HIGH confidence; v1.9.0 latest, `publish:` script pattern, env var contract.
- [npm Generating Provenance Statements](https://docs.npmjs.com/generating-provenance-statements/) — HIGH confidence; `publishConfig.provenance` and `repository` field requirements.
- [actions/setup-node README + advanced-usage](https://github.com/actions/setup-node) — HIGH confidence; `cache: 'pnpm'` minimum pnpm 6.10, Node 24 runtime support timeline.
- [pnpm/action-setup README](https://github.com/pnpm/action-setup) — HIGH confidence; v4 targets Node 24 runtime, must run before setup-node for cache resolution.
- [openai npm package (v6.41.0, 2026-06)](https://www.npmjs.com/package/openai) — HIGH confidence; official SDK, current major.
- [@anthropic-ai/sdk npm package (v0.100.1, 2026-05-30)](https://www.npmjs.com/package/@anthropic-ai/sdk) — HIGH confidence; official SDK, pre-1.0 by policy.
- [@google/genai npm package (v2.7.0)](https://www.npmjs.com/package/@google/genai) — HIGH confidence; new official unified GenAI SDK, GA May 2025.
- [Gemini API libraries — Google AI for Developers](https://ai.google.dev/gemini-api/docs/libraries) — HIGH confidence; confirms `@google/generative-ai` deprecation Nov 30 2025.
- [GitHub Actions workflow syntax (cron + workflow_dispatch inputs)](https://docs.github.com/actions/using-workflows/workflow-syntax-for-github-actions) — HIGH confidence; cron 5-field POSIX, input limits.
- Existing repo files read: `/Users/lakshmanturlapati/Desktop/FSB/lattice/package.json`, `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/package.json`, `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice-cli/package.json`, `/Users/lakshmanturlapati/Desktop/FSB/lattice/pnpm-workspace.yaml`, `/Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/PROJECT.md` — HIGH confidence; ground truth for catalog versions and milestone scope.

---
*Stack research for: v1.3 npm publish pipeline + canary consumer*
*Researched: 2026-06-03*
