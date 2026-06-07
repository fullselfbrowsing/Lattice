# Phase 27: npm Org + Trusted Publisher Setup - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the cryptographic trust relationship between the GitHub repo and npmjs.com so Phase 28 can publish `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli` via OIDC with provenance attestations, eliminating the long-lived `NPM_TOKEN` exposure.

Three artifacts must exist before Phase 28's first publish is even attempted:
1. The `@full-self-browsing` npm organization claimed under the user's npmjs.com account (already done by the user, owner `parzival1213`, 0 packages currently).
2. The `npm-publish` GitHub Environment exists in `fullselfbrowsing/Lattice` with required reviewers configured.
3. The npm Trusted Publisher trust tuple `(repo: fullselfbrowsing/Lattice, workflow_filename: release.yml, environment: npm-publish)` is registered for both publishable packages on npmjs.com.

In scope:
- A walkthrough document the user follows step by step.
- An FSB-driven recon script that verifies the trust tuples and the GitHub Environment exist with the right configuration.
- Best-effort automation of the GitHub Environment creation via FSB.
- Documentation of the npm "publish first, configure trust second" sequence required by the current npm UI.

Out of scope:
- The actual publish (Phase 28 owns it).
- Creating the npm organization (already done by the user).
- Authoring `release.yml` (Phase 28 owns it).
- Any code-side changes (this is pure configuration work).

</domain>

<decisions>
## Implementation Decisions

### Org and identity (already established)
- **D-01:** npm scope is `@full-self-browsing` (hyphenated). The org is owned by user `parzival1213` on npmjs.com.
- **D-02:** GitHub repo is `fullselfbrowsing/Lattice` (unhyphenated). The npm scope and GitHub org names intentionally diverge. The trust tuple references the GitHub org name (unhyphenated) since that is what the OIDC token claim reports.

### Trust tuple values (locked by ROADMAP Phase 27 goal)
- **D-03:** Each Trusted Publisher entry on npmjs.com is configured with exactly:
  - Repository: `fullselfbrowsing/Lattice`
  - Workflow filename: `release.yml`
  - Environment: `npm-publish`
  - Action: `publish`
- **D-04:** Both publishable packages get the same trust tuple:
  - `@full-self-browsing/lattice`
  - `@full-self-browsing/lattice-cli`

### GitHub Environment configuration
- **D-05:** Environment name: `npm-publish` (literal, must match the trust tuple).
- **D-06:** Required reviewers: at least `LakshmanTurlapati` (the repo owner). Manual reviewer gate on every publish for the first three RC publishes, then optionally relaxed once OIDC plumbing is verified.
- **D-07:** No deployment branch restriction. The `release.yml` workflow is gated by tag push (`v*.*.*`), and tag pushes always carry the originating commit's protection rules.

### The publish-first-then-trust order
- **D-08:** npmjs.com's current Trusted Publisher UI requires the package to exist on the registry before the Trusted Publisher form is reachable (the form lives under the per-package admin page at `/package/<name>/access`). For an unpublished package the admin page returns 404.
- **D-09:** Bootstrap strategy: the first ever publish of each package goes through a one-time classic npm token (granular access, write scope on the specific package, 7-day expiry, single use), executed locally by the user from a clean checkout. After the first 0.0.0 or pre-release version lands on the registry, the per-package admin page becomes reachable and the trust tuple can be configured. Subsequent publishes (including the Phase 28 `1.3.0-rc.0` smoke test) flow through OIDC with provenance.
- **D-10:** Bootstrap version is `0.0.0-bootstrap.0` for both packages. It is published with `--tag bootstrap` so it does not become the `latest` dist-tag. After Phase 28 publishes `1.3.0-rc.0` with provenance, the bootstrap tag is left as historical record; `latest` resolves to `1.3.0` once the milestone closes.

### Recon strategy
- **D-11:** FSB navigates the npm and GitHub UIs and asserts:
  - The `full-self-browsing` org settings page reachable, packages tab loads.
  - For each of the two packages, the per-package admin page shows a Trusted Publisher entry with the exact trust tuple from D-03.
  - The GitHub repo's Environments page shows `npm-publish` with `LakshmanTurlapati` as a required reviewer.
- **D-12:** Recon failures are reported as a structured list (which artifact, what was expected, what was observed). The recon script is idempotent and re-runnable.

### Bootstrap publish guardrails
- **D-13:** The bootstrap publish MUST NOT modify package.json `version` from `0.0.0` to anything else. The bootstrap version is supplied as `npm publish --tag bootstrap --provenance=false` from a temporary command, not committed to the repo.
- **D-14:** The classic token used for bootstrap is created with the npm CLI ahead of the publish, scoped to the specific package, write-only, 7-day expiry. The token is rotated out of the user's environment immediately after the bootstrap publish completes.

### Claude's Discretion
- Exact wording inside the walkthrough doc as long as the technical content is right.
- Whether to split the walkthrough into two files (`27-WALKTHROUGH-NPM.md` and `27-WALKTHROUGH-GITHUB.md`) or keep it as one. Default: one document with two clearly labeled sections.
- Specific selectors used by the FSB recon script (these are implementation details; the script must tolerate npm UI selector churn).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & milestone framing
- `.planning/ROADMAP.md` Phase 27 section (goal + 3 success criteria).
- `.planning/REQUIREMENTS.md` (ORG-01, ORG-02, ORG-03).
- `.planning/PROJECT.md` (Current Milestone section, OIDC Trusted Publisher non-negotiable).

### Threat model
- `.planning/research/PITFALLS.md`:
  - OIDC-1 (workflow-level `id-token: write` blast radius) drives the Environment requirement.
  - OIDC-2 (`NODE_AUTH_TOKEN` empty string disables OIDC fallback silently) informs the bootstrap token cleanup.
  - OIDC-4 (Trusted Publisher locks to wrong workflow filename on first config) drives the requirement that the trust tuple be set exactly once with the correct filename.

### External npm documentation
- `https://docs.npmjs.com/trusted-publishers` (Trusted publishing with OIDC) — Configuring trusted publishing step.
- `https://docs.npmjs.com/staged-publishing` (Staged publishing) — referenced for the publish-first-then-trust workaround.

### Phase 24 outputs
- `.planning/phases/24-atomic-scope-rename-license-hygiene/24-CONTEXT.md` — locked repository.url exact form (`git+https://github.com/fullselfbrowsing/Lattice.git`).

### Phase 25 outputs
- `.github/workflows/ci.yml` — referenced for the workflow-safety audit script's expectation that `id-token: write` lives only in `release.yml`'s `publish` job (Phase 28).
- `scripts/check-workflow-safety.mjs` — will validate the future `release.yml`.

### Phase 26 outputs
- `SECURITY.md` — documents the OIDC posture and the bootstrap window risk.

### Local artifacts created by this phase
- `27-WALKTHROUGH.md` (or split files) — user-facing step-by-step instructions.
- `27-RECON.mjs` (or `scripts/check-trust-tuples.mjs`) — FSB-driven verification script.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/check-workflow-safety.mjs` from Phase 25 is the reference pattern for Node 24 ESM verification scripts and will validate `release.yml` once it lands.
- The FSB MCP toolset is already integrated; the recon script can either be a pure Node script that fetches public npm/GitHub APIs OR an FSB-driven UI script if the data is behind login.

### Established Patterns
- Per-package operations use the scoped names from Phase 24 (now `@full-self-browsing/lattice` etc.).
- Phase 25's audit scripts exit 0 on success with a single OK line, exit 1 on failure with a single FAIL line and a structured details block. The recon follows the same convention.

### Integration Points
- The GitHub Environment configured here is referenced by `release.yml` in Phase 28's `publish:` job under `environment: npm-publish`.
- The npm Trusted Publisher trust tuple is what Phase 28's OIDC publish needs to verify against.

</code_context>

<specifics>
## Specific Ideas

- The walkthrough explicitly enumerates the bootstrap version as `0.0.0-bootstrap.0` and shows the literal commands to run from a clean shell (with placeholder for the classic token).
- The recon script reports each finding with a one-line OK or FAIL plus a path the user can click to fix.
- The Environment configuration uses required reviewers (not wait timer, not deployment branches) so the publish is paused for a human eyeball even after OIDC succeeds.

</specifics>

<deferred>
## Deferred Ideas

- Automatic rotation of the bootstrap classic token via npm CLI (would require credentials in code). Manual token deletion is sufficient.
- Multiple required reviewers (only one is needed for the first three publishes; more can be added later).
- Configuring npm Granular Access Tokens for CI fallback if OIDC fails. Phase 28 owns the release workflow logic; bypass mechanisms are deferred to a future hardening phase.
- Reserved package name claiming via npm support email (would bypass the bootstrap publish but adds days of round-trip).

</deferred>

---

*Phase: 27-npm-org-trusted-publisher-setup*
*Context gathered: 2026-06-06*
