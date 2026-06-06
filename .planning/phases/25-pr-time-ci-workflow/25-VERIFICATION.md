---
phase: 25-pr-time-ci-workflow
verified: 2026-06-06T00:00:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
---

# Phase 25: PR-Time CI Workflow Verification Report

**Phase Goal:** Every PR and push to main runs install + typecheck + test + publint + attw against the renamed surface via a SHA-pinned GitHub Actions workflow.
**Verified:** 2026-06-06T00:00:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                                                                          | Status     | Evidence                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `.github/workflows/ci.yml` exists and is the first/only workflow file                                                                                                          | VERIFIED   | `ls .github/workflows/` shows exactly one file: `ci.yml` (2043 bytes, dated 2026-06-05)                                                                        |
| 2   | The workflow triggers on `pull_request` to branches: [main] AND `push` to branches: [main]                                                                                     | VERIFIED   | ci.yml lines 12-16: `on: pull_request: branches: [main]` and `push: branches: [main]`                                                                          |
| 3   | Root-level `permissions: contents: read` declared (no id-token, no packages, no pull-requests, no actions)                                                                     | VERIFIED   | ci.yml lines 18-19. `grep id-token` exits 1; `grep packages:`/`pull-requests`/`actions:` returns no matches outside the existing 4 fields                       |
| 4   | No `pull_request_target` trigger anywhere in workflows                                                                                                                         | VERIFIED   | `grep -q pull_request_target .github/workflows/*.yml` exits 1                                                                                                  |
| 5   | No `id-token: write` anywhere in ci.yml                                                                                                                                        | VERIFIED   | `grep -q id-token .github/workflows/ci.yml` exits 1                                                                                                            |
| 6   | Concurrency block has `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` (PR-only cancel)                                                                        | VERIFIED   | ci.yml lines 21-23. Exact string `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` present                                                      |
| 7   | Single job `ci` on `ubuntu-latest`, no matrix                                                                                                                                  | VERIFIED   | ci.yml lines 25-28: `jobs: ci: name: ci runs-on: ubuntu-latest`. No `strategy:` or `matrix:` keys present                                                       |
| 8   | Every `uses:` line uses 40-char SHA pin                                                                                                                                        | VERIFIED   | `grep -c "uses:"` = 3; `grep -E "uses: .+@[0-9a-f]{40}" \| wc -l` = 3; `grep -E "uses: .+@(v[0-9]\|main\|master\|latest\|HEAD)"` exits 1                       |
| 9   | All five CI-01 commands appear as `run:` blocks                                                                                                                                | VERIFIED   | ci.yml lines 43, 46, 49, 52, 55 contain exactly: `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r test:types`, `pnpm -r lint:packages` |
| 10  | Three audit scripts exist under scripts/ and ci.yml invokes them as `node scripts/X.mjs`                                                                                       | VERIFIED   | All three files exist at workspace root; ci.yml lines 58, 61, 64 invoke `node scripts/check-tarball-leak.mjs`, `node scripts/verify-rename.mjs`, `node scripts/check-workflow-safety.mjs` |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                            | Expected                                                | Status   | Details                                                                                                  |
| ----------------------------------- | ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`          | PR-time CI workflow (CI-01 + CI-02)                     | VERIFIED | 65 lines; contains `actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10`; all 11 step names present |
| `scripts/check-tarball-leak.mjs`    | Tarball-leak audit gate (D-04)                          | VERIFIED | 168 lines; contains `pnpm pack` and `@fullselfbrowsing` allowlist; node: imports only                    |
| `scripts/verify-rename.mjs`         | Source-import rename audit gate (D-05)                  | VERIFIED | 145 lines; contains all five anti-pattern regexes; allowlist for lattice-cli bin and check-cli-deps      |
| `scripts/check-workflow-safety.mjs` | Workflow OIDC + pull_request_target audit gate (D-06)   | VERIFIED | 146 lines; hardened regex via cfeaf14 covers quoted-key and trailing-comment bypass paths                |

### Key Link Verification

| From                       | To                                              | Via                                            | Status | Details                                                  |
| -------------------------- | ----------------------------------------------- | ---------------------------------------------- | ------ | -------------------------------------------------------- |
| `.github/workflows/ci.yml` | `scripts/check-tarball-leak.mjs`                | `run: node scripts/check-tarball-leak.mjs`     | WIRED  | ci.yml line 58 (step 9)                                  |
| `.github/workflows/ci.yml` | `scripts/verify-rename.mjs`                     | `run: node scripts/verify-rename.mjs`          | WIRED  | ci.yml line 61 (step 10)                                 |
| `.github/workflows/ci.yml` | `scripts/check-workflow-safety.mjs`             | `run: node scripts/check-workflow-safety.mjs`  | WIRED  | ci.yml line 64 (step 11)                                 |
| `.github/workflows/ci.yml` | `packages/lattice` + `packages/lattice-cli`     | `pnpm -r typecheck/test/test:types/lint:packages` | WIRED  | ci.yml lines 46-55 (steps 5-8)                           |
| `actions/setup-node` step  | pnpm store cache (D-07)                         | `cache: 'pnpm'` input                          | WIRED  | ci.yml line 40                                           |

### Behavioral Spot-Checks

| Behavior                                                              | Command                                  | Result                                                                                                                                            | Status |
| --------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| check-tarball-leak.mjs exits 0 on clean tree                          | `node scripts/check-tarball-leak.mjs`    | `[check-tarball-leak] OK - inspected 2 tarballs (@fullselfbrowsing/lattice@..., @fullselfbrowsing/lattice-cli@...)` exit 0                        | PASS   |
| verify-rename.mjs exits 0 on clean tree                               | `node scripts/verify-rename.mjs`         | `[verify-rename] OK - scanned 168 files, no stale unscoped lattice imports found` exit 0                                                          | PASS   |
| check-workflow-safety.mjs exits 0 against ci.yml                      | `node scripts/check-workflow-safety.mjs` | `[check-workflow-safety] OK - audited 1 workflow file(s), no pull_request_target triggers, no out-of-scope id-token: write declarations` exit 0   | PASS   |
| All three uses: lines are 40-char SHA-pinned                          | `grep -E "uses: .+@[0-9a-f]{40}" ci.yml \| wc -l` | `3`                                                                                                                                      | PASS   |
| No floating tags in uses: lines                                       | `grep -E "uses: .+@(v[0-9]\|main\|master\|latest)" ci.yml` | (exit 1)                                                                                                                        | PASS   |
| No pull_request_target trigger across any workflow                    | `grep pull_request_target .github/workflows/*.yml` | (exit 1)                                                                                                                                | PASS   |
| No id-token: write declarations anywhere                              | `grep id-token .github/workflows/ci.yml` | (exit 1)                                                                                                                                          | PASS   |

### Requirements Coverage

| Requirement | Source Plan       | Description                                                                                                                                                  | Status    | Evidence                                                                                                                                                                                            |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CI-01       | 25-01, 25-02      | `.github/workflows/ci.yml` runs install (pnpm) + typecheck + test + `pnpm -r lint:packages` (publint + attw) on every PR and push to main                    | SATISFIED | ci.yml lines 43-55 execute the five v1.3 quality gates in order on triggers `pull_request: branches:[main]` and `push: branches:[main]`. Defense-in-depth gates at lines 58-64                      |
| CI-02       | 25-02             | All third-party actions in `ci.yml` pinned by 40-character commit SHA (TanStack May 2026 OIDC compromise mitigation)                                         | SATISFIED | All three `uses:` lines (actions/checkout, pnpm/action-setup, actions/setup-node) pinned to 40-char hex SHAs; floating-tag regex returns zero matches                                               |

No orphaned requirements: REQUIREMENTS.md lists CI-01 and CI-02 against Phase 25, and both are covered by the plans.

### Anti-Patterns Found

| File                                | Line | Pattern                              | Severity | Impact                                                                                                                                       |
| ----------------------------------- | ---- | ------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| (none flagged)                      |  -   | -                                    | -        | All three scripts use `node:`-prefixed imports only; no external npm imports. ci.yml has no `env:` block, no `secrets.` reference. No stubs. |

Non-ASCII bytes detected in the three scripts are U+2014 (em-dash) used as the visible separator in OK/FAIL log messages (e.g. `[check-tarball-leak] OK — inspected ...`). Em-dashes are punctuation, not emojis; this does not violate the no-emoji rule. The plans themselves dictate the em-dash format. ci.yml itself is pure ASCII (0 non-ASCII bytes).

### Human Verification Required

The phase goal includes one observable outcome that cannot be exercised without GitHub Actions actually running on a PR. The on-disk workflow file is verifiably correct, but its end-to-end behavior on the GitHub-hosted runner requires a live PR.

### 1. First PR triggers ci workflow and reports green status

**Test:** Open a new pull request from a feature branch against `main` (or push a no-op commit to a branch with an open PR).
**Expected:** GitHub Actions starts the `ci` workflow; the `ci` job (single job, `ubuntu-latest`) runs all 11 steps in order (Checkout, Set up pnpm, Set up Node.js, Install dependencies, Type-check workspace, Run unit tests, Validate package types, Lint packages, Audit tarballs, Audit source imports, Audit workflows) and finishes green within roughly 90 seconds. The PR's check list shows `ci` as a passing status check.
**Why human:** Cannot be tested without a real GitHub Actions runner; requires GitHub-hosted ubuntu-latest VM, network egress to npmjs.org, and the live actions/checkout + pnpm/action-setup + actions/setup-node infrastructure.

### 2. Concurrency cancels in-progress PR runs but queues push-to-main runs

**Test:** Push two commits to the same PR branch within a few seconds (PR cancel scenario). Then merge two PRs to `main` in rapid succession (push-to-main queue scenario).
**Expected:** In the PR scenario, the earlier run is marked "cancelled" in the Actions UI and only the later commit's run finishes. In the push-to-main scenario, both runs complete (no cancellation), and both produce a green check on the corresponding commit.
**Why human:** Requires actual GitHub Actions scheduling behavior; cannot be simulated on a local clone.

### 3. Branch protection ruleset requires `ci` before merge

**Test:** In the GitHub repository Settings -> Branch protection rules (or via `gh api`), confirm that `main` branch protection requires the `ci` status check before merge is allowed.
**Expected:** The merge button on a PR is disabled until the `ci` status check reports success.
**Why human:** Branch protection configuration is a GitHub repository setting outside the codebase. Explicitly noted as out-of-scope for the code artifact in 25-CONTEXT.md (`<domain>` block) and 25-02-SUMMARY.md (User Setup Required). Surfaced here so the user does not forget the gating step.

### Gaps Summary

No gaps blocking goal achievement. Every must-have is verified against the on-disk HEAD state:

- The workflow file exists at the expected path and is the only file under `.github/workflows/`.
- All triggers, permissions, concurrency, job shape, runner, Node version, cache, and SHA-pinning checks pass on textual inspection.
- All five CI-01 commands and all three Plan 01 audit-script invocations are present in the correct sequence.
- All three audit scripts exist, use `node:`-only imports, and exit 0 against the current clean tree (confirmed by running each: tarball-leak OK on 2 tarballs, verify-rename OK on 168 files, check-workflow-safety OK on 1 workflow file).
- The hardening of `check-workflow-safety.mjs` (commit cfeaf14) closed the IN-01 and IN-02 quick-review findings: the regex now accepts quoted YAML keys and trailing inline comments as bypass attempts.

The remaining work is the live-runner verification documented above; this is intrinsic to GitHub-Actions-class deliverables and not a code defect.

---

_Verified: 2026-06-06T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
