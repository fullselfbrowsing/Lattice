---
phase: 33-model-capability-registry-200-via-openrouter-feed
plan: 05
subsystem: ci-drift-workflow
tags: [github-actions, cron, auto-pr, sha-pinning, openrouter, registry-drift]

# Dependency graph
requires:
  - phase: 33-03
    provides: scripts/refresh-model-registry.mjs default write mode that the cron workflow invokes once per week to regenerate registry.generated.ts
  - phase: 25-pr-time-ci-workflow
    provides: scripts/check-workflow-safety.mjs (id-token + pull_request_target audit gate that the new workflow must pass)
  - phase: 28-release-workflow-rc0-oidc-smoke
    provides: SHA-pinning + split workflow-level vs job-level permissions pattern (ci.yml + release.yml inheritance for the four reused action SHAs)
provides:
  - .github/workflows/registry-drift.yml (weekly cron + workflow_dispatch; auto-opens a refresh PR via peter-evans/create-pull-request@v8.1.1)
affects:
  - Phase 33 completion (CAPS-01..05 wired: this plan closes CAPS-04 by shipping the scheduled drift gate)
  - Future weekly Monday 06:00 UTC runs will surface OpenRouter feed changes as automated PRs on branch chore/refresh-model-registry

# Tech tracking
tech-stack:
  added: []  # zero new runtime dependencies; only a GitHub Actions workflow file
  patterns:
    - "Workflow-level locked-down permissions (contents: read) + job-level minimum-needed elevation (contents: write + pull-requests: write) -- Phase 28 split-permissions inheritance"
    - "SHA-pinning every third-party action to a 40-character commit hash -- CI-02 discipline; reused SHAs from ci.yml for actions/checkout, actions/setup-node, pnpm/action-setup; new SHA-pin for peter-evans/create-pull-request@v8.1.1"
    - "Fixed branch name (chore/refresh-model-registry) + delete-branch: true on peter-evans/create-pull-request -- Pitfall 5 mitigation; re-runs update the existing PR in place rather than spawning siblings"
    - "Trigger discipline: schedule + workflow_dispatch ONLY -- no push, no pull_request, no repository_dispatch (D-19 keeps PR-time ci.yml network-free)"

key-files:
  created:
    - .github/workflows/registry-drift.yml
  modified: []

key-decisions:
  - "Comment text rewritten to avoid the literal token 'id-token' anywhere in the file -- AC6 in PLAN.md requires `! grep -q 'id-token' .github/workflows/registry-drift.yml`, which fails on any occurrence including comments. The comments now use the equivalent phrase 'OIDC token-mint scope' to preserve the documentation intent while satisfying the grep gate. Functionally identical to the original commented spec."
  - "peter-evans/create-pull-request SHA-pinned to v8.1.1 commit 5f6978faf089d4d20b00c7766989d076bb2fc7f1 per RESEARCH.md A4 (Node 24 runner support verified live via gh api 2026-06-08)"
  - "Reused SHAs from existing ci.yml verbatim (actions/checkout, actions/setup-node, pnpm/action-setup) per Task 1 verification step -- consistency across the workflow fleet + audit-friendliness; bumping any of these is a fleet-wide PR, not a per-workflow choice"
  - "Single job 'refresh' with 6 steps (checkout, pnpm, node 24 + cache pnpm, install --frozen-lockfile, regenerate, open PR) -- mirrors ci.yml step style; no concurrency: block needed because weekly runs do not race and manual dispatch racing with cron at worst produces a no-op PR"
  - "PR body's review checklist's last item references the anchor case study `openrouter:openai/gpt-oss-120b` (session_1780792387779) as the regression bar reviewers must defend before merge -- if the next OpenRouter snapshot demotes that profile out of `open_weight_instruct` + `internal_envelope_leak`, the PR is closed/reverted rather than merged"

patterns-established:
  - "Scheduled cron + auto-PR pattern in Lattice's CI fleet: weekly cron triggers a node script that mutates the working tree, then peter-evans/create-pull-request opens a fixed-branch PR; the human reviewer becomes the gate, not the script's exit code"
  - "Trigger isolation across workflows: ci.yml runs on PR + push, release.yml runs on tag + push to main, registry-drift.yml runs on schedule + workflow_dispatch only -- no two workflows share the same trigger surface"

requirements-completed:
  - CAPS-04

# Metrics
duration: ~6min
completed: 2026-06-08
---

# Phase 33 Plan 05: Registry-Drift CI Workflow Summary

**Weekly Monday 06:00 UTC cron + manual dispatch workflow shipped: regenerates `packages/lattice/src/capabilities/registry.generated.ts` via `scripts/refresh-model-registry.mjs`, then auto-opens a refresh PR on fixed branch `chore/refresh-model-registry` via `peter-evans/create-pull-request@v8.1.1` SHA-pinned. Closes CAPS-04 and -- pending the manual repo-setting prerequisite -- closes Phase 33's CAPS-* row in REQUIREMENTS.md.**

## Performance

- **Duration:** ~6min (single Task 2 commit `635686c`; Task 1 was a verification-only no-file-change step)
- **Started:** 2026-06-08
- **Completed:** 2026-06-08
- **Tasks:** 2 (Task 1: confirm reused SHA pins by reading ci.yml; Task 2: author registry-drift.yml)
- **Files created:** 1 (`.github/workflows/registry-drift.yml`)
- **Files modified:** 0

## Accomplishments

### Workflow file (`.github/workflows/registry-drift.yml`)

| Surface | Line range | Behavior |
| --- | --- | --- |
| Header comment block | 1-23 | Documents Phase 33 + D-19 + PR-time-vs-cron design decision + permissions discipline + SHA-pinning + the manual prerequisite repo setting |
| `name: registry-drift` | 24 | Top-level workflow name |
| `on:` triggers | 26-29 | `schedule: '0 6 * * 1'` (Monday 06:00 UTC) + `workflow_dispatch` ONLY (no push, no pull_request) |
| Workflow-level `permissions:` | 31-32 | `contents: read` (default-locked-down) |
| Job `refresh` | 34-89 | Single job, ubuntu-latest, job-scoped permissions, 6 steps |
| Job-level `permissions:` | 40-42 | `contents: write` + `pull-requests: write` (minimum needed to push branch + open PR); deliberately no OIDC token-mint scope |
| Step 1: Checkout | 44-45 | `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10` (reused from ci.yml) |
| Step 2: Set up pnpm | 47-48 | `pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093` (reused from ci.yml) |
| Step 3: Set up Node.js | 50-54 | `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` (reused from ci.yml); node-version 24; cache pnpm |
| Step 4: Install | 56-57 | `pnpm install --frozen-lockfile` |
| Step 5: Regenerate | 59-60 | `node scripts/refresh-model-registry.mjs` (default write mode -- overwrites registry.generated.ts on drift) |
| Step 6: Open refresh PR | 62-89 | `peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1` (v8.1.1); fixed branch `chore/refresh-model-registry`; `delete-branch: true`; PR body with 4-item review checklist including anchor case study `openrouter:openai/gpt-oss-120b` regression bar |

## Final SHA Pins (verbatim 40-character hashes)

| Action | SHA | Source |
| --- | --- | --- |
| `actions/checkout` | `df4cb1c069e1874edd31b4311f1884172cec0e10` | Reused from ci.yml line 31 (Phase 25 D-12) |
| `pnpm/action-setup` | `0e279bb959325dab635dd2c09392533439d90093` | Reused from ci.yml line 34 (Phase 25 D-12) |
| `actions/setup-node` | `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` | Reused from ci.yml line 37 (Phase 25 D-12) |
| `peter-evans/create-pull-request` | `5f6978faf089d4d20b00c7766989d076bb2fc7f1` | New in this plan; v8.1.1 verified live via `gh api repos/peter-evans/create-pull-request/git/refs/tags/v8.1.1` per RESEARCH.md A4 (Node 24 runner support) |

## Trigger Surface

| Trigger | When | Purpose |
| --- | --- | --- |
| `schedule: '0 6 * * 1'` | Every Monday at 06:00 UTC | Weekly drift check against the live OpenRouter feed |
| `workflow_dispatch` | Manual via GitHub Actions UI | Ad-hoc refresh (e.g., when a known model retires mid-week) |

**NOT triggered by:** push, pull_request, repository_dispatch, workflow_run, or any other code-event. This is the D-19 invariant: PR-time `ci.yml` stays network-free; OpenRouter is queried on a predictable cadence only.

## Permissions Discipline

| Scope | Setting | Rationale |
| --- | --- | --- |
| Workflow root | `contents: read` | Default-locked-down; any future step extension cannot escalate without an explicit edit visible in PR diff |
| Job `refresh` | `contents: write` | Needed to push the regenerated branch via peter-evans/create-pull-request |
| Job `refresh` | `pull-requests: write` | Needed to open / update the auto-PR |
| Job `refresh` | (no OIDC token-mint scope) | This workflow does not publish; Phase 28's blast-radius mitigation forbids unnecessary OIDC scope. `scripts/check-workflow-safety.mjs` will FAIL the CI gate if the OIDC scope is ever added to this workflow (only `release.yml`'s `publish` job is allowed to mint OIDC tokens, per Phase 25 D-10) |

## Branch + delete-branch Convention (Pitfall 5)

| Setting | Value | Why |
| --- | --- | --- |
| `branch` | `chore/refresh-model-registry` (fixed) | peter-evans/create-pull-request updates the existing PR if the branch already exists -- prevents the weekly cron from spawning sibling PRs (`chore/refresh-model-registry-1`, `-2`, ...) week after week |
| `delete-branch` | `true` | Merged PRs cleanly remove the branch; the next cron run starts from a fresh branch |
| `base` | `main` | Auto-PR targets main directly |
| `token` | `${{ secrets.GITHUB_TOKEN }}` | Auto-issued per workflow run; no long-lived PAT; expires at job end |

## PR Body Review Checklist

The auto-opened PR includes a 4-item review checklist embedded in its body:

1. Any new `[classifier] WARN -- unknown prefix ...` lines in the workflow logs that suggest a `scripts/capabilities/classifier.mjs` `PROVIDER_PREFIX_RULES` extension?
2. Diff matches expected upstream changes (new models, retired models, context window adjustments)?
3. No unintended schema drift (extra fields, missing fields, reordering)?
4. **Anchor case study** `openrouter:openai/gpt-oss-120b` still classifies as `open_weight_instruct` with `internal_envelope_leak` (Phase 33 anchor; do NOT merge if this regresses)?

Item 4 is the regression bar -- if OpenRouter ever demotes the gpt-oss-120b classification in a way that loses the case study's failure-mode signal, the PR must be closed rather than merged. Phase 36's sanitizer dispatch will depend on `internal_envelope_leak` staying in the profile's `knownFailureModes`.

## Workflow Safety Gate Output

```
$ node scripts/check-workflow-safety.mjs
[check-workflow-safety] OK -- audited 3 workflow file(s), no pull_request_target triggers, no out-of-scope id-token: write declarations
```

The Phase 25 / Phase 28 safety gate audits all three workflows in the fleet (ci.yml, release.yml, registry-drift.yml) and confirms:
- No `pull_request_target` triggers anywhere (pwn-request mitigation per D-11)
- No `id-token: write` declarations outside `release.yml`'s `publish` job (OIDC blast-radius mitigation per D-10)

The new workflow passes both checks: it has no OIDC scope at all, and uses only the safe `schedule` + `workflow_dispatch` triggers.

## Verification Summary

All 15 acceptance criteria from PLAN.md Task 2 verified:

| # | Check | Result |
| --- | --- | --- |
| AC1 | File exists; line count >= 50 | 89 lines |
| AC2 | `name: registry-drift` at top level | Present |
| AC3 | Triggers limited to schedule + workflow_dispatch | 0 banned triggers |
| AC4 | Workflow-level `permissions: contents: read` | Present at line 31-32 |
| AC5 | Job-level `permissions: contents: write + pull-requests: write` | Both present at lines 41-42 |
| AC6 | NO `id-token` anywhere | 0 occurrences (comments use "OIDC token-mint scope" phrasing instead) |
| AC7 | NO long-lived PAT references | 0 occurrences of GH_TOKEN / PAT_TOKEN / CANARY_DISPATCH_TOKEN / NPM_TOKEN |
| AC8 | Every `uses:` SHA-pinned with 40-char hex | 4 of 4 |
| AC9 | peter-evans pin exactly `5f6978faf089d4d20b00c7766989d076bb2fc7f1` | Match |
| AC10 | `branch: chore/refresh-model-registry` (fixed) | Present |
| AC11 | `delete-branch: true` | Present |
| AC12 | PR body references `openrouter:openai/gpt-oss-120b` anchor | Present |
| AC13 | `node scripts/check-workflow-safety.mjs` exits 0 | OK -- audited 3 workflow file(s) |
| AC14 | YAML parses cleanly, no tabs | OK |
| AC15 | No emojis anywhere | OK |

## Task Commits

The single task with file changes was committed atomically (Task 1 was verification-only with no file changes; Task 2 produced the deliverable):

1. **Task 2: `.github/workflows/registry-drift.yml`** -- `635686c` (feat)

## Deviations from Plan

**Rule 3 (auto-fix blocking issue) -- single deviation, documented:**

PLAN.md's Task 2 acceptance criterion AC6 requires `! grep -q "id-token" .github/workflows/registry-drift.yml` -- which forbids any literal occurrence of the token `id-token` anywhere in the file, including header comments. The skeleton in CONTEXT.md and the plan body both included header comments like `# - NO id-token (this workflow does not publish; OIDC blast-radius mitigation)`, which would have failed the grep gate.

**Fix:** Rewrote both comment lines to use the equivalent phrase "OIDC token-mint scope" instead of the literal `id-token`. The documentation intent is preserved (the comments still explain that the workflow deliberately omits the OIDC scope); the grep gate now passes.

The structural workflow content -- triggers, permissions, SHA pins, steps, PR body -- matches the plan skeleton verbatim.

## Issues Encountered

- None. Worktree was clean at start; baseline `node scripts/check-workflow-safety.mjs` passed (2 files audited); after writing the new workflow it passed again (3 files audited). The AC6 `grep -q "id-token"` check initially failed due to the comment text but was a documentation rephrasing fix, not a structural issue.

## User Setup Required -- Manual Prerequisite

The auto-PR step depends on a repo setting that this workflow cannot self-enable:

**Settings -> Actions -> General -> Workflow permissions -> "Allow GitHub Actions to create and approve pull requests"** must be enabled.

### Why

When `peter-evans/create-pull-request` runs under `GITHUB_TOKEN`, it needs the repo-level permission to "create and approve pull requests" in addition to the workflow-level `pull-requests: write`. This is a defense-in-depth setting GitHub introduced to prevent stolen workflow tokens from spamming PRs. Without it the create-PR step returns HTTP 403.

### Inheritance

Phase 28's SUMMARY already flagged this as a Phase 29 prerequisite (the changesets/action Version Packages PR flow needs the same setting). If Phase 29 has already enabled it, no separate action is needed for Phase 33's drift workflow. If Phase 29 has not enabled it yet:

- The first cron run after merge will fail at the create-PR step with HTTP 403
- The workflow log will surface the failure cleanly with a link to the setting
- The fix is one click in repo settings; the next cron run (or a manual workflow_dispatch) will succeed

### How to verify

After enabling the setting, manually trigger the workflow via the GitHub Actions UI (`workflow_dispatch`) and confirm the run completes through the "Open refresh PR" step. Expected outcome:
- If `registry.generated.ts` has not changed since the last refresh, peter-evans/create-pull-request is a no-op (no PR opened)
- If there is drift, a PR opens on branch `chore/refresh-model-registry` with the regenerated file

## First Cron Run Expectations

Plan 33-04 (live OpenRouter run) committed the initial registry.generated.ts using the same `scripts/refresh-model-registry.mjs` script this workflow invokes. As long as the OpenRouter feed has not drifted between Plan 33-04's run and the first weekly cron, the first cron run will produce a no-op PR (the working tree stays clean; peter-evans/create-pull-request does not open a PR when there is no diff to commit).

If the OpenRouter feed has drifted between Plan 33-04 and the first cron (e.g., new models added, context windows adjusted), the first cron run will open a refresh PR with the regenerated file -- which is the intended behavior and the v1.3.0 cut's first signal that the registry pipeline is alive.

## Phase 33 Completion Status

This plan ships the last CAPS-* requirement (CAPS-04). With CAPS-01 (typed profile + lookup), CAPS-02 (refresh script), CAPS-03 (classifier + tests), CAPS-04 (drift workflow + this plan), and CAPS-05 (>=200 distinct profiles via the live OpenRouter run in Plan 33-04) all wired, Phase 33's REQUIREMENTS.md row moves from `pending` to `complete` once the merge lands.

The model-aware SDK surface (Phases 34-38) can now treat `getCapabilityProfile()` / `findCapabilityProfile()` as a reliable, fresh-on-a-cadence query surface. Phase 38's receipt v1.2 `modelClass` field will read `trainingClass` from this registry; Phase 36's sanitizers will dispatch on `knownFailureModes`; Phase 35's prompt scaffolds will dispatch on `recommendedPromptStrategy`.

## Self-Check: PASSED

- `.github/workflows/registry-drift.yml` exists (89 lines, 3843 bytes)
- Commit `635686c` present in `git log` (Task 2: feat workflow)
- `node scripts/check-workflow-safety.mjs` exits 0 (audited 3 workflow files)
- All 15 acceptance criteria from PLAN.md Task 2 pass (full check table above)
- `name: registry-drift` present at top of file
- Triggers limited to `schedule: '0 6 * * 1'` + `workflow_dispatch` -- 0 banned triggers (push / pull_request / repository_dispatch grep all return 0)
- Workflow-level `permissions: contents: read` at line 31
- Job-level `permissions: contents: write + pull-requests: write` at lines 41-42 (no OIDC token-mint scope)
- All 4 `uses:` lines SHA-pinned to 40-char hex (`grep "uses:" | grep -cE "@[0-9a-f]{40}$"` returns 4)
- peter-evans pin exactly `5f6978faf089d4d20b00c7766989d076bb2fc7f1`
- `branch: chore/refresh-model-registry` + `delete-branch: true` present
- PR body grep for `openrouter:openai/gpt-oss-120b` matches (anchor case study referenced)
- No tabs (YAML lint sanity)
- No emojis (Unicode emoji range scan returns no match)
- STATE.md untouched (parallel-execution constraint respected)
- ROADMAP.md untouched (parallel-execution constraint respected)
- Worktree on branch `worktree-agent-a1420ac1cd555b4ae` (not main / master / etc.)

---
*Phase: 33-model-capability-registry-200-via-openrouter-feed*
*Completed: 2026-06-08*
