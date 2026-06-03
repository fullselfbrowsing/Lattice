# Feature Research

**Domain:** TypeScript SDK — first public npm release + external canary consumer (Lattice v1.3)
**Researched:** 2026-06-03
**Confidence:** HIGH for areas 1, 4, 5, 6 (verified against npm docs, GitHub Changelog, and inspectable open-source repos); MEDIUM for areas 2, 3 (verified against multiple OSS examples but cost-control details vary per project).

> Scope note: v1.0/1.1/1.2 features are already shipped. This file ONLY covers v1.3's six new areas (npm publish polish, canary consumer, real-provider tests, provenance, OIDC UX, GitHub Release object). All complexity estimates are in focused engineering days (1 day = ~6 hours of uninterrupted work by a senior TS engineer who already knows the codebase).

---

## Feature Landscape

The six v1.3 areas naturally cluster into three groups:

- **A. Package hygiene & publish flow** (areas 1 + 4 + 5 + 6) — what ships and how
- **B. Canary consumer** (area 2) — separate repo that proves the publish worked
- **C. Real-provider integration** (area 3) — nightly cost-bounded smoke tests

Each area below is broken into Table Stakes / Differentiators / Anti-Features.

---

### Area 1 — npm Publish Flow: First Public Release Polish

#### Table Stakes (every comparable library does these)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `license` field in every publishable `package.json` (currently missing — flagged in PROJECT.md) | npm UI shows "No license" warning otherwise; some consumer scanners (Snyk, npm audit, FOSSA) gate on this | LOW (~0.25 day) | MIT root LICENSE already present; just add `"license": "MIT"` to `packages/lattice/package.json` and `packages/lattice-cli/package.json`. Must precede first publish. |
| `repository` / `bugs` / `homepage` fields | Required for npm provenance validation (see Area 4); also drives "Repository" sidebar link on npmjs.com | LOW (~0.25 day) | `repository.type: "git"`, `repository.url: "git+https://github.com/fullselfbrowsing/lattice.git"`, `repository.directory: "packages/lattice"` for the monorepo subpath. Vercel AI SDK and `@openai/agents-core` both use this pattern. |
| README badges (npm version, license, CI status, types) | Signal of liveness and quality at a glance; ~all 2026-era TS libs do this | LOW (~0.5 day) | Shields.io is canonical: `npm version`, `npm downloads`, `license`, `CI status`, `bundle size` (bundlephobia or packagephobia). AI SDK README shows version + downloads + discord; tRPC shows version + types + license. |
| `CHANGELOG.md` per publishable package via changesets | Consumers expect chronological "what changed" file; changesets already in repo (PROJECT.md confirms) | LOW (~0.5 day for first scaffolding, then automatic) | Mastra ([deepwiki](https://deepwiki.com/mastra-ai/mastra/12.4-dependency-management-with-renovate)) and `vercel/ai` ([CHANGELOG.md](https://github.com/vercel/ai/blob/main/CHANGELOG.md)) both run changesets in CI and let it write the changelog. One-time setup: `pnpm changeset init`, then `.changeset/config.json` with `access: "public"`. |
| Semver from 1.0.0+, public scope access flag | Default `npm publish` on a scoped package publishes private; need explicit `--access public` once (or `publishConfig.access: "public"` in `package.json`) | LOW (~0.1 day, easy to forget) | Anti-feature trap: forgetting this means first publish fails with `402 Payment Required`. Set `"publishConfig": {"access": "public", "provenance": true}` in each publishable `package.json`. |
| Working `types` / `exports` map, validated by `publint` + `arethetypeswrong` (both already in repo per PROJECT.md) | Modern bundlers (Vite, esbuild, Bun) all check `exports`; consumers paying attention will run `attw` themselves | LOW (~0.5 day to verify clean output across both packages) | Just run them in CI on PR; fail the build if either reports an error. Drizzle, Hono, AI SDK all do this. |
| `CONTRIBUTING.md` + `SECURITY.md` | GitHub renders both in the repo sidebar; security researchers expect SECURITY.md for disclosure | LOW (~0.5 day total) | SECURITY.md must include contact (email or GitHub security advisory) and supported-versions table. PROJECT.md already calls these out. |
| Pinned Node engine field | Avoids confusing failures on Node 18; lattice already requires Node 24 WebCrypto Ed25519 | LOW (~0.1 day) | `"engines": {"node": ">=24"}` in both packages. |

#### Differentiators (stand out, not required)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `keywords` curated for npm search | Drives discoverability; AI SDK lists `ai`, `agents`, `openai`, `anthropic`; Lattice should claim `capability-runtime`, `signed-receipts`, `replay`, `tripwire` to define a unique semantic space | LOW (~0.25 day) | Differentiator because most first-release packages forget this; 5-12 well-chosen keywords meaningfully improves rank. |
| README "Why this vs X" comparison table | Differentiates Lattice from Vercel AI SDK / LangChain / OpenAI Agents SDK upfront; PROJECT.md already has the comparison thesis | MEDIUM (~1 day to write well) | Mastra README does this. Critical for category-creating libraries because the obvious question is "isn't this just X?". |
| 60-second "quickstart" runnable copy-paste block in README | First impression — does it work in under a minute? | LOW (~0.5 day) | `npx create-something` is the gold standard but overkill for v1.3; a 6-line `ai.run()` snippet exercising fake provider + receipt is enough. |
| `package.json` `funding` field | Free signal; renders on npm UI as a "Sponsor" link | LOW (~0.1 day) | Even pointing at the GitHub repo's `.github/FUNDING.yml` is meaningful. Skip if no sponsorship strategy. |
| Inline TSDoc on every public export driving the IDE hover | Lattice's whole pitch is "inspectable runtime" — IDE hover documentation reinforces that promise. Hono and tRPC are exemplary here. | MEDIUM (~1-2 days to audit and backfill) | Differentiator because most TS SDKs ship with empty hover docs; competitive with `@openai/agents` and AI SDK. |
| `.npmignore` or `files` allowlist tuned tight | Smaller tarball = faster installs; shows engineering care. `files: ["dist", "README.md", "LICENSE"]` is the modern pattern (Hono, Drizzle, AI SDK all do this). | LOW (~0.25 day) | Default `npm publish` ships test files, source maps, internal scratch — bad first impression. |

#### Anti-Features (don't ship)

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| Polished marketing site as part of v1.3 | "First impression matters" | Sinks weeks; PROJECT.md correctly defers anything beyond the publish. Vercel AI SDK ships docs alongside but they had a marketing team. | Defer. README + GitHub Pages on the existing showcase is enough. |
| `private: false` on the root workspace package | Easy to flip blindly | The root is a workspace coordinator, not publishable. Publishing it leaks `.planning/`, internal scripts, and tests. | Keep root `package.json` `"private": true`; only `packages/lattice` and `packages/lattice-cli` flip to public. (Mastra root is private; only `@mastra/*` packages publish.) |
| Hand-written CHANGELOG | "More personal" | Diverges from changesets; double-bookkeeping; humans forget. | Let changesets generate it, hand-edit only the top section (release notes) if needed before merging the version PR. |
| Pre-1.0 version (e.g., `0.9.0`) for the first public release | Signals "still beta, expect breakage" | Lattice is already at internal v1.2 with 733 passing tests; semantic regression. Also: pre-1.0 changesets behave differently (no major bumps), which surprises maintainers later. | Ship as `1.3.0` per PROJECT.md ("Decisions" table). Matches internal versioning continuity. |
| Publishing both packages from a single root version bump | "Simpler CI" | Couples cadence; if `lattice-cli` has a doc-only fix, lattice gets a useless version bump too. | Independent versioning via changesets (each changeset names which package). `@openai/agents-core` vs `@openai/agents-openai` ship on independent cadences. |
| Adding badges that don't reflect reality (e.g., "100% test coverage" without coverage in CI) | Looks professional | Lying badge is worse than no badge; sophisticated consumers check | Only add badges backed by real data sources. |

#### Dependencies / ordering

- `license` + `repository` + `files` allowlist **must** land before first publish workflow runs (provenance refuses to attest without `repository`).
- Scope rename to `@fullselfbrowsing/*` **must** precede CI publish workflow (workflow filename gets bound to scope in npm UI; see Area 5).
- `publint` + `attw` **must** be green before publish workflow runs (gate them in the PR-time `ci.yml`).

---

### Area 2 — Canary Consumer Pattern

The PROJECT.md "Out of Scope" lines call this out exactly right: workspace-internal `examples/*` use pnpm symlinks and silently mask packaging bugs. The canary repo must `npm install @fullselfbrowsing/lattice@1.3.0` from the public registry.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Separate public GitHub repo (`fullselfbrowsing/lattice-canary`) | Already decided in PROJECT.md; only way to prove publish actually works | LOW (~0.25 day to create + initialize) | Public so consumers can read it as a working example, like AI SDK's [`examples/` apps](https://github.com/vercel/ai/tree/main/examples) but in their own repo. |
| Lockfile pinning the published version (not `workspace:*` or `file:..`) | Whole point of the canary — install path identical to a real user | LOW (~0.1 day) | `package.json` deps reference `^1.3.0` (or exact `1.3.0` for true canary determinism). Lockfile commits. |
| Type-level smoke test (using already-installed `tsd`) | Validates `.d.ts` files actually shipped and resolve | LOW (~0.5 day) | `tsd` is already a v1.2 dependency. One `.test-d.ts` per public type — `createAI` signature, `ai.run` return type, `ai.runAgent` intent shape. tRPC examples use exactly this pattern. |
| Runtime smoke test on every public export against fake providers | No API keys needed; catches "I exported X from the wrong barrel file" | LOW (~1 day) | Layer-1 in PROJECT.md. Use `createFakeProvider` (already shipped in v1.0). Covers receipt creation, replay, tripwire eval, agent loop. |
| CI on the canary repo running on PR + nightly | Nothing useful without automation; nightly catches "publish was overwritten" | LOW (~0.5 day) | GitHub Actions workflow installs from registry, runs vitest, reports. |
| Documented purpose in canary README | External readers will find this repo; they shouldn't think it's THE example | LOW (~0.25 day) | One paragraph: "This is the v1.3 release validation canary. For getting-started examples, see lattice/examples/*". |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Verdaccio-based pre-publish dry-run **inside lattice CI** (separate from canary) | OpenAI Agents JS does this ([repo](https://github.com/openai/openai-agents-js)) — publish to local Verdaccio, install from it, run integration tests. Catches packaging bugs before public publish. | MEDIUM (~1-2 days) | Strong differentiator: failure mode "publish breaks but canary nightly catches it" becomes "publish CI fails before tag, no broken release goes out". Recommended even though canary exists. |
| Matrix install across `npm`, `pnpm`, `yarn`, `bun` | Catches package-manager-specific resolution bugs (looking at you, `pnpm` strict mode) | MEDIUM (~1 day) | AI SDK runs this matrix. Lattice should at minimum cover `npm` + `pnpm` (FSB ecosystem default). |
| Test against multiple Node versions (24 LTS + current) | Lattice requires Node 24 WebCrypto Ed25519; verify forward-compat | LOW (~0.25 day on top of matrix above) | `strategy.matrix.node: [24, 26]` in workflow. |
| Failure paging via GitHub Issue auto-open on nightly failure | Closes the "nightly silently red for a week" loop | LOW (~0.5 day with `actions/github-script`) | PROJECT.md target features mention "failure paging" already. Stay GitHub-native; avoid PagerDuty integration in v1.3. |
| Canary results posted as a status badge on the main lattice README | Public-facing trust signal — anyone visiting npm/GitHub sees "canary green" | LOW (~0.25 day) | Shields.io endpoint pointing at the canary's `release.yml` status. Worth it because PROJECT.md emphasizes the publish is the milestone. |

#### Anti-Features

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| `workspace:*` or `file:../lattice` dependency in canary | "Faster iteration during development" | Defeats the entire point. Symlinks bypass tarball semantics, `exports` map resolution, peer dependencies, `files` allowlist. | Hard rule: canary always pulls from registry. For pre-publish testing use Verdaccio (see Differentiators), not symlinks. |
| Single huge canary monolith test file | "Just run everything" | When it fails, you can't tell which surface broke. Hard to gate "fake-providers passed, real-providers failed". | Split into `tests/fake/*.test.ts` (Layer 1) and `tests/real/*.test.ts` (Layer 2). Different CI jobs, different cost profiles. |
| Canary tries to recreate the showcase | "Demonstrative" | Examples already exist in lattice/examples/agent-loop, work-inbox. Duplication. | Canary asserts behavior, not flow. It calls `ai.run`, asserts receipt validity, asserts replay round-trip — not "demo a multimodal work inbox". |
| Canary owns its own changelog / release process | "Consistency" | Canary isn't published anywhere — it's a runner. Tags/releases on canary muddy the signal. | Canary's only artifacts are CI runs. No semver, no tags, no GitHub releases. |
| Canary tests version-pin to `latest` dist-tag | "Always tests newest" | If a broken release ships, every canary run goes red until the next release; no way to reproduce a historical green state. | Pin to specific `1.3.x` version in `package.json`. Bump explicitly when validating a new release. Dependabot can auto-PR the bump. |

#### Dependencies / ordering

- Canary repo creation **depends on** the `@fullselfbrowsing` scope being claimed (Area 5) and first publish succeeding (Area 1).
- Canary CI **depends on** publish workflow producing a real registry artifact (chicken-and-egg: first canary run only works after first publish lands).
- Bootstrap order: (1) scope claim, (2) publish workflow + first release to npm, (3) create canary repo, (4) canary CI green, (5) put canary badge on main README.

---

### Area 3 — Real-Provider Integration Test Patterns (Layer 2 canary)

This is the highest-risk and most under-tooled v1.3 area. PROJECT.md correctly gates real-provider tests to nightly + manual dispatch only.

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Provider keys stored as GitHub repo secrets (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) | Required to call APIs at all | LOW (~0.25 day) | Per-provider keys, scoped to a dedicated "canary" budget account, not shared with production. |
| Per-test cost ceiling using Lattice's own `CostTracker` (v1.2, AGENT-INFRA-01) | Lattice owns the primitive; eat your own dog food and bound spend | MEDIUM (~1 day) | PROJECT.md explicitly calls this out. Per-run budget set in workflow env (e.g., `LATTICE_CANARY_BUDGET_USD=1.50`); each test calls `ai.run({ contract: { budget: { maxUsd: 0.20 }}})`. |
| `if-no-key` graceful skip | Forks / external contributors can't have your API keys; PR-time tests must not require them | LOW (~0.5 day) | Pattern from many OSS libs: `it.skipIf(!process.env.OPENAI_API_KEY)('exercises OpenAI', ...)`. Vitest has `it.skipIf` built-in. |
| Trigger: `schedule.cron` (nightly) + `workflow_dispatch` (manual), never `pull_request` | Cost + flakiness; one bad night doesn't block contributors | LOW (~0.1 day) | `on: { schedule: [{cron: '0 6 * * *'}], workflow_dispatch: {} }`. PROJECT.md key decision. |
| One provider per job (not all-in-one) | Per-provider rate limits + per-provider key gating | LOW (~0.5 day) | Matrix strategy `matrix.provider: [openai, anthropic, gemini]` with `if: secrets[matrix.provider_key]`. |
| Concurrency group cancellation | Prevents 5 nightly runs piling up if one hangs | LOW (~0.1 day) | `concurrency: { group: canary-${{ matrix.provider }}, cancel-in-progress: true }`. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Cost summary posted as workflow summary (markdown table) | Operators see "last night cost $0.84 across 14 calls" without log-diving | LOW (~0.5 day) | Use Lattice's `CostTracker.summary()` → write to `$GITHUB_STEP_SUMMARY`. Strong differentiator — most OSS libs don't surface this. |
| Provider-side abort on budget breach (Lattice's `CostTracker` is already budget-aware per AGENT-INFRA-01) | Cap is real, not aspirational. If a tool calls itself in a loop, test fails fast with `tripwire-violated` rather than burning $50. | MEDIUM (~0.5 day to wire) | Lattice already has this primitive — just enable it. |
| Use cheapest competent model per provider (`gpt-5-nano`, `claude-haiku-4`, `gemini-flash-lite`) | Order-of-magnitude cost savings without changing API surface coverage | LOW (~0.5 day) | Cost ladder: nightly = cheapest, manual dispatch can override with `inputs.model`. Production OSS libs (LangChain test suite, AI SDK tests) follow this. |
| **OpenAI Batch API for non-time-sensitive nightly runs** | 50% cost reduction on standard models (gpt-5.4 $2.50/$15 → $1.25/$7.50 per million tokens per the cost research). Lattice's deterministic-router design is compatible. | HIGH (~3-4 days; requires async polling in test harness) | Differentiator but complex — defer to v1.4 unless cost ceiling repeatedly trips. |
| Per-iteration receipt verification asserted in the canary | Lattice's pitch is "every run is inspectable + verifiable"; canary should prove this on a real provider, not just a fake | LOW (~0.5 day) | Already implemented in `examples/agent-loop` — port the assertions. |
| Replay-against-recording fallback when budget exhausted | If nightly hits cap, replay the last green run's receipts to verify the public surface still works | MEDIUM (~1 day) | Stretch goal; safety net so a hard budget cap doesn't mean "test suite goes red". |

#### Anti-Features

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| Run real-provider tests on every PR | "Catch regressions early" | $$$ on fork PRs (which can't access secrets anyway); flaky on rate limits; can be exploited by a malicious PR. | Nightly + manual dispatch ONLY (PROJECT.md decision). PR-time uses fake providers (Layer 1). |
| Single shared organization-wide OpenAI key | "Simpler" | One leak burns all rate limit; no per-canary spend attribution; key rotation requires updating everything. | Dedicated key per canary repo, scoped to a $50/month organization with hard cap (OpenAI org-level budget). |
| Test against the most expensive model ("for realism") | "Production parity" | $2-15/M tokens × hundreds of nightly runs = real money | Cheapest competent model is the default. Manual dispatch can override for one-off pre-release validation. |
| Re-running on flake automatically | "Reduces noise" | Doubles cost on every flake; hides legitimate provider regressions | One run, one result. Failures triage to a GitHub issue (Area 2 differentiator). Network-tier retry inside the SDK is fine; suite-level retry is not. |
| Snapshot-test provider responses | "Deterministic" | LLM outputs vary; snapshots break weekly; misleading green/red | Use Lattice's `evalAgentRun` regression kernel (v1.2 SHOWCASE-AGENT-02) — semantic gates, not text equality. |
| Long-running multi-turn agent loops in nightly (10+ iterations) | "Most realistic" | Highest cost; lowest signal density; one stuck loop wastes the budget | Cap iterations at 3-5 in canary tests. Multi-iteration is exercised in lattice's own examples, not canary. |

#### Dependencies / ordering

- Real-provider tests **depend on** Layer 1 (fake providers) being green first (no point testing OpenAI if the package's exports are broken).
- Cost ceiling enforcement **depends on** `CostTracker` being part of the public `@fullselfbrowsing/lattice` export (already shipped v1.2).
- Per-provider gating **depends on** GitHub Actions `secrets` being conditionally referenceable (use `if: ${{ secrets.OPENAI_API_KEY }}` pattern).

---

### Area 4 — npm Provenance: Consumer Experience

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Provenance attestation generated automatically by OIDC publish | Free supply-chain signal; appears as a badge on the npmjs.com package page next to the version number | LOW (already enabled by Trusted Publisher) | Confirmed in [npm docs](https://docs.npmjs.com/generating-provenance-statements/) — no `--provenance` flag needed when using Trusted Publisher in 2026. |
| Attestation uploaded to Sigstore Rekor transparency log | Industry-standard tamper-evident log; what every modern provenance system uses | LOW (automatic) | Per [GitHub blog](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/) — automatic part of the publish action. |
| Public repository required (private repos don't get provenance) | npm rule; `fullselfbrowsing/lattice` is already public | LOW (already true) | No action needed. |
| Consumer can run `npm audit signatures` to verify | Discoverable verification path for security-conscious consumers | LOW (no action; works automatically) | npm CLI 9.5+ ships this. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| README section explaining "how to verify Lattice's provenance" | Lattice already pitches signed receipts as its core value; provenance on the install path is a coherent story to tell | LOW (~0.5 day) | Cite `npm audit signatures` + Rekor lookup URL. Half a page. |
| Cross-link from the npm provenance attestation to Lattice's receipt verification | "Both ends of the trust chain are inspectable" — install provenance + runtime receipts | LOW (~0.25 day) | Just a sentence and a link. Unique to libraries that ship signing primitives. |
| `cosign verify` instructions for advanced consumers | Sigstore's `cosign` CLI can verify attestations directly ([Sigstore blog](https://blog.sigstore.dev/cosign-verify-bundles/)) | LOW (~0.25 day) | Stretch — most consumers will use `npm audit signatures`. |

#### Anti-Features

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| Custom signing key on top of provenance | "More signatures = more secure" | Provenance is sufficient; user-managed keys add operational burden and a single point of compromise. | Trust the npm + Sigstore chain. Lattice's runtime Ed25519 keys are for receipts (per-run), not for the npm artifact. |
| Bypassing provenance with `--provenance=false` for emergency releases | "Speed during incident" | Defeats the entire trust model. Once you've taught users "look for the badge", any unsigned release looks suspicious. | If trusted publisher CI is down, accept the release delay. Hot-fix via the same CI path. |
| Documenting provenance as a "feature" in README without explaining what it gives consumers | "Marketing the badge" | Performative; consumers want to know what's actually verified | Explain: "this proves the published tarball was built from commit X by workflow Y in this repo at time Z; nothing about runtime safety". |

#### Dependencies / ordering

- Provenance **depends on** OIDC Trusted Publisher (Area 5) being live; cannot exist without it.
- Provenance **depends on** `repository` field being set correctly in `package.json` (Area 1 table stakes).
- README explanation (differentiator) **depends on** first successful provenance-enabled publish (else screenshots are vaporware).

---

### Area 5 — OIDC Trusted Publisher UX on npmjs.com

#### Table Stakes (what the user actually does — sequenced)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Claim `@fullselfbrowsing` org on npmjs.com | Scope is unclaimed per PROJECT.md recon; whoever claims first owns it | LOW (~0.25 day, user-driven) | npm UI → "Add Organization" → free tier. Currently the only thing blocking the rename. |
| Add team members to the org | Bus-factor; FSB likely wants more than one human with publish rights | LOW (~0.1 day) | npm UI → org settings → members. |
| Publish package(s) once with a token (legacy path) OR pre-create empty package via npm web UI | Trusted publisher must be attached to an EXISTING package; brand-new package names need first publish under classic auth | MEDIUM (~0.5-1 day with potential gotcha) | Two options: (a) one-time classic token publish of a stub `1.3.0-rc.0` then immediately revoke token; (b) some workflows now allow trusted-publisher publish on first-ever publish if you preconfigure via API. Verify current behavior at publish time. **Anti-pattern: leaving the classic token in repo secrets after first publish.** |
| Configure trusted publisher on the package settings page | Required to wire repo → scope → workflow | LOW (~0.25 day per package, user-driven) | Per [npm docs](https://docs.npmjs.com/trusted-publishers/): navigate to package settings → Trusted Publisher → GitHub Actions → fill in: organization (`fullselfbrowsing`), repository (`lattice`), workflow filename (`release.yml`), optional environment (`npm-publish`). |
| Choose "npm publish" allowed action | Required since May 20, 2026; configurations created after that date must explicitly select at least one allowed action | LOW (~0.1 day) | Per [GitHub Changelog](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/). Check `npm publish`; leave `npm stage publish` unchecked unless using staged-release feature. |
| GitHub workflow with `permissions: { id-token: write }` | Without this, OIDC token issuance fails silently | LOW (~0.1 day) | Documented gotcha — workflow runs but `npm publish` errors with `403 oidc token not found`. |
| npm CLI 11.5.1+ in CI | Required version per current docs | LOW (~0.1 day) | `setup-node` action: pin Node 24 + ensure shipped npm is >= 11.5.1, or `npm install -g npm@latest` step. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| GitHub Environment `npm-publish` with required reviewer + branch protection | Adds human approval before tag → publish; defense-in-depth | MEDIUM (~0.5 day) | If `release.yml` references `environment: npm-publish`, the workflow pauses for a reviewer click before issuing OIDC token. Strong for first-public-release era; can relax later. |
| Separate trusted publisher configs per package (`@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli`) bound to the SAME workflow file | One workflow, two packages, both attest cleanly | LOW (~0.25 day extra) | Both packages list the same `release.yml` as their trusted publisher; release workflow publishes both atomically. |
| Restrict trusted publisher to a release branch | Defense against compromised tag from a fork | LOW (~0.1 day) | npm UI doesn't fully gate this; use GitHub branch protection + `if: github.ref == 'refs/heads/main'` in the workflow. |

#### Anti-Features

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| Keep a long-lived `NPM_TOKEN` "as backup" | "What if OIDC breaks" | Defeats the whole point; one leak = full publish access; rotation theater | Use trusted publisher exclusively. If OIDC fails, fix the workflow. PROJECT.md decision is explicit. |
| Bind trusted publisher to "any workflow in the repo" | "Flexibility" | Any compromised action (`actions/script` with malicious input) can publish | Bind to ONE workflow file by name (`release.yml`). |
| Skip the environment-based approval gate "to move fast" | "Friction reduction" | First-release era is exactly when human eyes matter most | Keep approval gate at minimum through v1.3.x; revisit after a few clean releases. |
| Use the `NODE_AUTH_TOKEN` setup-node trick alongside OIDC | "Belt and suspenders" | Confusing failure modes; the token gets picked up over OIDC silently | Trusted publisher only; remove all `NODE_AUTH_TOKEN` references from workflow. |

#### Dependencies / ordering

Strict order (each blocks the next):
1. Scope claim on npmjs.com (manual, user-driven; can happen in parallel with everything else as Day 0).
2. Package rename in repo to `@fullselfbrowsing/*` + `repository`/`license`/`publishConfig` fields landed.
3. First publish (classic token path or stub).
4. Trusted publisher config attached to each published package.
5. Update `release.yml` to remove any classic token reference; next release uses OIDC.

---

### Area 6 — GitHub Release Object

#### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Release per published tag (`v1.3.0`) auto-created by changesets release action | Standard pattern; changesets has `createGithubReleases: true` option | LOW (~0.1 day, one config line) | The `changesets/action@v1` step takes `createGithubReleases: aggregate` or `true`. AI SDK, Mastra, OpenAI Agents JS all use this. |
| Release notes sourced from the CHANGELOG entry for that version | Single source of truth; no double-bookkeeping | LOW (~0.1 day, default behavior) | Changesets writes `CHANGELOG.md` + creates the matching GitHub release with the same content. |
| Tag is signed or at least pushed by the CI bot's protected token | Tampered tags are the original supply-chain attack | LOW (~0.25 day) | Use the `GITHUB_TOKEN` with `contents: write` from the changesets action; don't push tags manually. |
| Release marked "latest" automatically | npm dist-tag `latest` and GitHub "latest release" align | LOW (~0.1 day) | Default for non-prerelease versions. |

#### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Hand-edited release intro before merging the version PR | Changesets aggregates raw entries; a 2-paragraph intro framing the release for humans is a meaningful upgrade | LOW (~0.5 day per release) | Pattern: changesets opens a "Version Packages" PR with the auto-generated `CHANGELOG.md`. Hand-edit the top of `CHANGELOG.md` in that PR with a narrative intro before merging. AI SDK does this; that's why their releases read well. |
| "Validated against canary" link in release notes pointing to the canary CI run | Closes the loop: "this release passed the external consumer canary against real providers" | LOW (~0.25 day, with workflow scripting) | Strong differentiator; ties Area 2 directly into the release artifact. |
| Linked install snippet in release notes (`npm install @fullselfbrowsing/lattice@1.3.0`) | One-click copy for consumers | LOW (~0.1 day, template fragment) | Add to changesets release template. |
| Provenance attestation link in release notes | Visible reinforcement of the supply-chain story | LOW (~0.25 day) | Sigstore Rekor URL is deterministic from the publish event; can be templated. |
| Migration notes section for breaking changes | First public release likely has none; but template the section so it's habitual from v1.4 onward | LOW (~0.25 day) | Pattern from Drizzle, AI SDK. |

#### Anti-Features

| Feature | Why Tempting | Why Problematic | Alternative |
|---------|--------------|-----------------|-------------|
| Asset attachments (tarballs, zips) on the release | "More to download" | npm registry IS the distribution; duplicating in GitHub releases creates "which tarball is canonical" confusion; consumers might verify the GitHub one and get a different SHA than what `npm install` pulled | Don't attach binaries. Link to the npm package page. |
| Release-branch strategy (long-lived `release/1.x` branch) | "Industry pattern" | Adds maintenance overhead; changesets + tag-driven flow doesn't need it; merge conflicts | Single-branch flow: `main` → changesets PR → merge → tag → release. (AI SDK, Drizzle, Hono all use this.) |
| Generating release notes from raw commit messages (`git log`) | "Auto-magic" | Reads like a changelog of typos and merge commits; not human-aimed | Use changesets (PROJECT.md confirms it's already in the repo). |
| Pre-release tags on the public scope (`@fullselfbrowsing/lattice@1.3.0-rc.1`) before 1.3.0 stable | "Safer rollout" | Pollutes the dist-tag space; trusted-publisher pre-releases require extra setup; canary already covers pre-release validation | Use the canary repo to validate; tag and release only stable. Pre-releases are a v1.4+ concern. |
| Creating a release without a corresponding npm publish | "Tag the milestone" | Decouples github releases from npm versions; consumers get confused | Strict invariant: every GitHub release maps 1:1 to a published npm version. |

#### Dependencies / ordering

- GitHub release **depends on** changesets `release.yml` job, which **depends on** OIDC publish (Area 5) succeeding first.
- Canary-validation link (differentiator) **depends on** canary CI publishing a stable badge URL (Area 2).

---

## Feature Dependencies (cross-area)

```
[Scope claim @fullselfbrowsing on npmjs.com]
    └──blocks──> [Package rename in monorepo]
                    └──blocks──> [First publish (any path)]
                                    └──blocks──> [Trusted Publisher config in npm UI]
                                                    └──blocks──> [OIDC release.yml workflow]
                                                                    └──enables──> [Automatic provenance]
                                                                    └──enables──> [Auto GitHub Release object]

[package.json: license + repository + publishConfig + files allowlist]
    └──blocks──> [First publish] (provenance refuses without `repository`)
    └──blocks──> [publint / attw clean] (gating CI check)

[publint + attw green]
    └──blocks──> [PR-time ci.yml passes]
                    └──blocks──> [Merge to main]
                                    └──blocks──> [Tag → release.yml]

[Successful first publish to @fullselfbrowsing/lattice@1.3.0]
    └──blocks──> [Create lattice-canary repo + Layer 1 fake-provider tests]
                    └──enhances──> [Layer 2 real-provider tests gated by per-provider secrets]
                                    └──enhances──> [Cost summary in workflow run]

[Canary green]
    └──enhances──> [Canary badge in main README]
    └──enhances──> [Validated-against-canary link in GitHub Release notes]

[CHANGELOG.md generated by changesets]
    └──feeds──> [GitHub Release notes body]
    └──feeds──> [npm package page version history]
```

### Critical-path summary

The single hard ordering constraint is: **scope claim → repo rename → first publish → trusted publisher attach → all subsequent automation**. Everything else can parallelize.

---

## MVP Definition

### Launch With (v1.3.0)

The absolute minimum to call v1.3 done:

- [ ] **A1** Scope `@fullselfbrowsing` claimed on npmjs.com — blocks everything
- [ ] **A1** `license`, `repository`, `bugs`, `homepage`, `publishConfig.access: "public"`, `publishConfig.provenance: true`, `files`, `engines` fields in both publishable `package.json` files
- [ ] **A1** Both packages renamed to `@fullselfbrowsing/*`, CLI bin remains `lattice`
- [ ] **A1** README badges (version, license, types, CI), 60-second quickstart, "Why this vs X" comparison table
- [ ] **A1** CONTRIBUTING.md, SECURITY.md, CHANGELOG.md (changesets-generated)
- [ ] **A1** `publint` + `arethetypeswrong` gate in PR-time CI
- [ ] **A5** Trusted Publisher configured per package, workflow file name bound, `id-token: write` permission set
- [ ] **A5** `release.yml` (tag-driven, OIDC publish, no `NPM_TOKEN`, optional environment gate)
- [ ] **A5** `ci.yml` (PR-time: install, build, test, typecheck, publint, attw)
- [ ] **A4** Provenance attestation generated automatically by Trusted Publisher (no config needed once Area 5 is live)
- [ ] **A4** README section "Verifying the publish" with `npm audit signatures` + Rekor link template
- [ ] **A6** Changesets-driven CHANGELOG.md feeding GitHub Release notes with `createGithubReleases: true`
- [ ] **A6** Install snippet in release notes template
- [ ] **A2** `fullselfbrowsing/lattice-canary` public repo created
- [ ] **A2** Layer 1: tsd type tests + vitest runtime tests on every public export using `createFakeProvider`
- [ ] **A2** Canary CI on PR + nightly cron
- [ ] **A3** Layer 2: real-provider nightly tests for OpenAI, Anthropic, Gemini gated by per-provider secrets
- [ ] **A3** Per-run `CostTracker` budget ceiling enforced; cheapest competent model per provider
- [ ] **A3** `if-no-key` skip pattern so PR-time and forks don't fail
- [ ] **A3** Workflow summary table with cost breakdown
- [ ] **A2** Failure paging via auto-opened GitHub issue on nightly red

### Add After Validation (v1.3.x patches)

- [ ] **A2** Verdaccio-based pre-publish dry-run in lattice CI (catches packaging bugs before public publish) — defer to v1.3.1
- [ ] **A2** Package manager matrix (npm + pnpm + yarn + bun) — defer to v1.3.1
- [ ] **A2** Node version matrix — defer to v1.3.1
- [ ] **A6** Canary-validated badge link inside GitHub Release notes — defer to v1.3.1 (depends on canary being stable for a few cycles)
- [ ] **A3** Replay-against-recording fallback when nightly hits budget cap — defer if budget overruns happen

### Future Consideration (v1.4+)

- [ ] OpenAI Batch API for 50% cost reduction on nightly suite — complex, defer until cost actually hurts
- [ ] `cosign verify` advanced-consumer instructions — niche audience
- [ ] Pre-release `-rc` versioning workflow — needed only when v1.4 has breaking changes
- [ ] Migration-notes templating — kicks in when first breaking change ships

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Scope rename + license/repository fields | HIGH (blocks publish) | LOW (~1 day total) | P1 |
| Trusted Publisher + OIDC release workflow | HIGH (security signature for the whole release) | MEDIUM (~2 days first time) | P1 |
| Provenance (automatic with above) | MEDIUM (signal to security-aware users) | LOW (free) | P1 |
| Canary Layer 1 (fake providers, type tests) | HIGH (proves publish actually works) | MEDIUM (~2 days) | P1 |
| Canary Layer 2 (real providers, cost-bounded) | HIGH (proves real-world integration) | MEDIUM (~2-3 days) | P1 |
| CHANGELOG via changesets + auto GitHub release | HIGH (release hygiene baseline) | LOW (~1 day) | P1 |
| README badges + quickstart + comparison | MEDIUM (first impression) | LOW (~1-2 days) | P1 |
| publint + attw CI gating | MEDIUM (catches packaging regressions) | LOW (~0.5 day) | P1 |
| Verdaccio pre-publish dry-run | MEDIUM (catches packaging bugs before public release) | MEDIUM (~1-2 days) | P2 |
| Package manager + Node version matrix | MEDIUM (catches resolver edge cases) | LOW (~1 day) | P2 |
| Failure paging via auto-opened issues | MEDIUM (closes the silent-red loop) | LOW (~0.5 day) | P2 |
| Cost summary in workflow run | MEDIUM (operational visibility) | LOW (~0.5 day) | P2 |
| Canary status badge on main README | LOW-MEDIUM (public trust signal) | LOW (~0.25 day) | P2 |
| OpenAI Batch API integration | LOW until budget pain | HIGH (~3-4 days) | P3 |
| `cosign verify` instructions | LOW (niche) | LOW (~0.25 day) | P3 |
| Pre-release versioning workflow | LOW (not needed yet) | MEDIUM | P3 |

---

## Competitor Feature Analysis

Five comparable TypeScript libraries, with the specific repo/file we'd learn from:

| Feature | Vercel AI SDK (`vercel/ai`) | OpenAI Agents JS (`openai/openai-agents-js`) | Mastra (`mastra-ai/mastra`) | Drizzle (`drizzle-team/drizzle-orm`) | Hono (`honojs/hono`) | Our Approach (Lattice v1.3) |
|---------|------------------------------|---------------------------------------------|---------------------------|------------------------------------|---------------------|-----------------------------|
| Release tooling | Changesets ([CHANGELOG.md](https://github.com/vercel/ai/blob/main/CHANGELOG.md)) | Changesets + Verdaccio integration-tests ([repo](https://github.com/openai/openai-agents-js)) | Changesets ([deepwiki](https://deepwiki.com/mastra-ai/mastra/12.4-dependency-management-with-renovate)) — continuous alpha prereleases | Changesets | Changesets | Changesets (already installed); skip alpha-prerelease pattern |
| Package scoping | `ai` (unscoped, claimed years ago) + `@ai-sdk/*` subpackages | `@openai/agents-core`, `@openai/agents-openai`, `@openai/agents-extensions` | `mastra` + `@mastra/core`, `@mastra/*` modules | `drizzle-orm` (unscoped) + `drizzle-kit` | `hono` (unscoped) | `@fullselfbrowsing/lattice` + `@fullselfbrowsing/lattice-cli`; matches OpenAI/Mastra pattern |
| Pre-publish validation | tests + lint in CI | **Verdaccio local registry + install-and-run integration tests** — strongest of all, worth copying | tests + alpha pre-release on every commit | tests | tests | Layer 1 (fake) + Layer 2 (real) canary in separate repo; consider Verdaccio dry-run for v1.3.1 |
| Examples as validation | [`examples/*` apps](https://github.com/vercel/ai/tree/main/examples) pinned to real published versions | Mostly in-repo `examples/` | Workspaces and integration tests | `examples/` and `drizzle-kit` self-test | `examples/` plus `bench/` | **Separate external canary repo** — stronger than examples folder because it actually exercises the publish |
| Provenance | Yes (visible badge on [`ai` npm page](https://www.npmjs.com/package/ai)) | Yes | Yes ([`@mastra/core`](https://www.npmjs.com/package/@mastra/core)) | Recently enabled | Yes | Yes — automatic via Trusted Publisher |
| Release object | Auto-created by changesets, hand-edited intro | Auto-created, terse | Auto-created | Auto-created, often hand-curated | Auto-created | Auto-created via changesets + hand-edited intro on the version PR |
| Real-provider testing | Mock providers documented; real-provider tests exist but not exposed | LIVE provider tests gated to manual/scheduled with key gating | Has real-provider tests with skips | N/A (DB, not LLM) | N/A | Nightly + manual dispatch, per-provider secrets, `CostTracker` budget ceiling |

**Most copy-worthy patterns**:
- **OpenAI Agents JS** for the Verdaccio + integration-tests pattern (closest analog to Lattice's situation: scoped packages, TypeScript-first, provider-adjacent, ships cryptographic primitives).
- **Vercel AI SDK** for the README polish, CHANGELOG.md narrative quality, and pinned-version examples (the way release notes read in `vercel/ai` is the gold standard for first-impression communication).
- **Mastra** for changesets-as-the-only-source-of-truth release flow.

---

## Sources

- [npm Docs — Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/) — HIGH confidence, authoritative
- [npm Docs — Generating provenance statements](https://docs.npmjs.com/generating-provenance-statements/) — HIGH confidence, authoritative
- [GitHub Changelog — npm trusted publishing with OIDC GA (2025-07-31)](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/) — HIGH confidence, official announcement
- [GitHub Blog — Introducing npm package provenance](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/) — HIGH confidence
- [Sigstore Blog — cosign Verification of npm Provenance](https://blog.sigstore.dev/cosign-verify-bundles/) — HIGH confidence
- [Things you need to do for npm trusted publishing to work (philna.sh, Jan 2026)](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/) — MEDIUM, recent practitioner walkthrough
- [vercel/ai CHANGELOG.md](https://github.com/vercel/ai/blob/main/CHANGELOG.md) — HIGH, primary source
- [vercel/ai GitHub repository](https://github.com/vercel/ai) — HIGH, primary source
- [@openai/agents-core on npm](https://www.npmjs.com/package/@openai/agents-core) — HIGH, primary source
- [openai/openai-agents-js GitHub repository](https://github.com/openai/openai-agents-js) — HIGH, primary source (Verdaccio integration-tests pattern)
- [OpenAI Agents SDK TypeScript docs](https://openai.github.io/openai-agents-js/) — HIGH
- [Mastra release management with Changesets](https://deepwiki.com/mastra-ai/mastra/12.4-dependency-management-with-renovate) — MEDIUM (deepwiki is generated)
- [@mastra/core on npm](https://www.npmjs.com/package/@mastra/core) — HIGH, primary source
- [Artsy Engineering — Deploying canaries with auto](https://artsy.github.io/blog/2020/02/20/deploying-canaries-with-auto/) — MEDIUM, established canary pattern
- [trpc/examples-next-prisma-starter](https://github.com/trpc/examples-next-prisma-starter) — HIGH, primary source for vitest e2e pattern
- [trpc-cli on npm](https://www.npmjs.com/package/trpc-cli) — HIGH (vitest CLI subprocess fixture pattern)
- [OpenAI vs Anthropic API Pricing Comparison 2026 (Finout)](https://www.finout.io/blog/openai-vs-anthropic-api-pricing-comparison) — MEDIUM, used to size cost ceilings
- [LLM API Pricing 2026 (CloudIDR)](https://www.cloudidr.com/llm-pricing) — MEDIUM
- [OpenAI API Cost in 2026 (CloudZero)](https://www.cloudzero.com/blog/openai-pricing/) — MEDIUM (Batch API discount confirmation)
- [Lattice PROJECT.md](file:///Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/PROJECT.md) — HIGH, internal source of truth

---
*Feature research for: Lattice v1.3 — first public npm release + canary consumer*
*Researched: 2026-06-03*
