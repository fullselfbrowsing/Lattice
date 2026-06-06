---
phase: 25-pr-time-ci-workflow
plan: 02
subsystem: infra
tags: [ci, github-actions, workflows, sha-pinning, oidc-defense, node24, pnpm]

# Dependency graph
requires:
  - phase: 25-pr-time-ci-workflow
    plan: 01
    provides: scripts/check-tarball-leak.mjs, scripts/verify-rename.mjs, scripts/check-workflow-safety.mjs
provides:
  - .github/workflows/ci.yml (PR-time CI workflow, single ci job, 11 sequential steps)
affects:
  - 28-release-workflow (release.yml will inherit the same SHA-pinning posture and the workflow-safety audit gate's publish-job-in-release.yml allowance)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - GitHub Actions workflow with 40-char commit SHA pinning for every third-party action (TanStack May 2026 supply-chain mitigation)
    - Root permissions contents read with no id-token, no packages, no pull-requests, no actions (D-10 least-privilege)
    - Concurrency group keyed on workflow + ref with cancel-in-progress gated on github.event_name (PR cancels, push-to-main queues)
    - Single sequential job pattern instead of parallel fan-out (D-08 wall-clock budget around 90 seconds)
    - pnpm/action-setup before actions/setup-node so cache pnpm input on setup-node finds pnpm on PATH (D-13)
    - actions/setup-node built-in cache pnpm only; no node_modules cache, no vitest cache, no build cache (D-07)

key-files:
  created:
    - .github/workflows/ci.yml
  modified: []

key-decisions:
  - "Inlined the locked third-party action commit SHAs verbatim from 25-CONTEXT.md interfaces block: actions/checkout df4cb1c069e1874edd31b4311f1884172cec0e10 (v6.0.3), pnpm/action-setup 0e279bb959325dab635dd2c09392533439d90093 (v6.0.8), actions/setup-node 48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e (v6.4.0)"
  - "Rephrased the D-11 header comment to avoid the literal token pull_request_target so the plan acceptance check grep -q pull_request_target exits non-zero against the file; the workflow-safety audit script uses an anchored regex on a trimmed YAML key so it would have accepted either wording"
  - "No env block at any scope; no NODE_AUTH_TOKEN; no secrets context reference anywhere; permissions: contents: read at root with no job-level override"
  - "Single job literally named ci so the required-check string in branch protection is just ci (matches the workflow name ci)"

patterns-established:
  - "Header comment trace pattern: every YAML decision keyed back to its CONTEXT.md decision ID (D-01 through D-13) for downstream gsd-check evidence"
  - "Step naming: imperative present tense; each step name self-documenting in the Actions UI log"
  - "Three gate scripts (check-tarball-leak, verify-rename, check-workflow-safety) run after the five CI-01 commands so a regression in the rename or workflow safety surface fails CI alongside test or typecheck regressions"
  - "Workflow self-audits via check-workflow-safety.mjs as its final step, providing meta-protection against future workflow drift"

requirements-completed: [CI-01, CI-02]

# Metrics
duration: 5min
completed: 2026-06-05
---

# Phase 25 Plan 02: PR-Time CI Workflow Summary

**Single .github/workflows/ci.yml file created at the workspace root, closing CI-01 (install + typecheck + test + test:types + lint:packages on every PR and push to main) and CI-02 (every third-party action pinned by 40-character commit SHA). Workflow has zero OIDC capability, zero secrets references, zero pull_request_target triggers, and self-audits via the three Plan 25-01 gate scripts.**

## Performance

- **Duration:** about 5 minutes
- **Started:** 2026-06-06T04:57:45Z
- **Completed:** 2026-06-06T04:59:34Z
- **Tasks:** 1
- **Files created:** 1 (.github/workflows/ci.yml)
- **Files modified:** 0

## Accomplishments

- `.github/workflows/ci.yml` created at the workspace root. First file under `.github/workflows/` in this repository (the directory did not exist before this commit).
- Triggers locked per D-03: `pull_request: { branches: [main] }` and `push: { branches: [main] }`. No `pull_request_target` anywhere (D-11). No `workflow_dispatch`, no `schedule`, no `release` triggers (those belong to Phase 28).
- Root permissions block declares `contents: read` only (D-10). No `id-token`, no `packages`, no `pull-requests`, no `actions` keys. Every future job must opt in explicitly.
- Concurrency block: `group: ${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. PR pushes cancel earlier PR runs; push-to-main runs are non-cancellable (D-09).
- Single sequential job `ci` on `ubuntu-latest` (D-01, D-08). No matrix. Node 24 only (D-02). Job name `ci` matches workflow name so the branch-protection required-check string is just `ci`.
- 11 steps in the exact CONTEXT-locked order: Checkout repository, Set up pnpm, Set up Node.js, Install dependencies, Type-check workspace, Run unit tests, Validate package types (tsd), Lint packages (publint + attw), Audit tarballs for stale names, Audit source imports for stale rename, Audit workflows for OIDC and PR-target drift.
- All three `uses:` lines SHA-pinned to 40-char lowercase hex commit SHAs (CI-02 / D-12). Tags they correspond to are documented in the section below.
- `actions/setup-node` configured with `node-version: '24'` and `cache: 'pnpm'` (D-07). `pnpm/action-setup` precedes it with no `version:` input (D-13; pnpm/action-setup reads the root `packageManager` field).
- Three Plan 25-01 gate scripts wired as the final three steps. The workflow-safety audit gate (`scripts/check-workflow-safety.mjs`) self-validates the new ci.yml — verified locally and returned exit 0.
- File encoding: ASCII (UTF-8 compatible), LF line endings, no BOM, no emoji characters, no non-ASCII bytes.

## Locked third-party action SHAs

| Action | Tag | 40-char commit SHA |
|---|---|---|
| actions/checkout | v6.0.3 | df4cb1c069e1874edd31b4311f1884172cec0e10 |
| pnpm/action-setup | v6.0.8 | 0e279bb959325dab635dd2c09392533439d90093 |
| actions/setup-node | v6.4.0 | 48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e |

## 11-step sequence and decision mapping

| Step | Name | Decision IDs closed |
|---|---|---|
| 1 | Checkout repository | D-12 (SHA-pinned) |
| 2 | Set up pnpm | D-13 (precedes setup-node), D-12 |
| 3 | Set up Node.js | D-02 (Node 24), D-07 (pnpm-store cache only), D-12, D-13 |
| 4 | Install dependencies | D-03 (frozen lockfile), CI-01 step 1 |
| 5 | Type-check workspace | D-03, CI-01 step 2 |
| 6 | Run unit tests | D-03, CI-01 step 3 |
| 7 | Validate package types (tsd) | D-03, CI-01 step 4 |
| 8 | Lint packages (publint + attw) | D-03, CI-01 step 5 |
| 9 | Audit tarballs for stale names | D-04 (PITFALLS RENAME-1 / RENAME-3 forever-guard) |
| 10 | Audit source imports for stale rename | D-05 (PITFALLS RENAME-1 belt-and-suspenders) |
| 11 | Audit workflows for OIDC and PR-target drift | D-06 (PITFALLS OIDC-1, TanStack May 2026 mitigation), D-10, D-11 |

## Verification Output

All 13 verification checks from the plan's `<verification>` block pass:

```
1.  test -f .github/workflows/ci.yml                                  -> exit 0  OK
2.  grep -c "uses:" .github/workflows/ci.yml                          -> 3       OK
3.  grep -E "uses: .+@[0-9a-f]{40}" ... | wc -l                       -> 3       OK
4.  grep -E "uses: .+@(v[0-9]|main|master|latest|HEAD)" ...           -> exit 1  OK (no floating tags)
5.  grep -q "pull_request_target" ...                                 -> exit 1  OK (token absent)
6.  grep -q "id-token" ...                                            -> exit 1  OK
7.  grep -q "secrets\." ...                                           -> exit 1  OK
8.  node scripts/check-workflow-safety.mjs                            -> exit 0  OK
9.  All 11 step-name strings appear literally                         -> 11/11   OK
10. The three locked SHAs appear literally and exactly                -> 3/3     OK
11. The five CI-01 commands appear literally                          -> 5/5     OK
12. The three Plan 01 script invocations appear literally             -> 3/3     OK
13. No emoji characters present                                       -> 0       OK
```

Supplementary checks:

- `grep -q "NODE_AUTH_TOKEN"` exits 1 (no auth token reference; OIDC-2 defense).
- `grep -q "^name: ci$"` succeeds.
- `grep -q "runs-on: ubuntu-latest"` succeeds.
- `grep -q "node-version: '24'"` succeeds.
- `grep -q "cache: 'pnpm'"` succeeds.
- `grep -F "cancel-in-progress: \${{ github.event_name == 'pull_request' }}"` succeeds.
- First three bytes of the file are `0x23 0x20 0x4c` (`# L`); no UTF-8 BOM (`0xEF 0xBB 0xBF`).
- `grep -lU $'\r' .github/workflows/ci.yml` returns no matches: pure LF line endings.
- `LC_ALL=C grep -cP "[\x80-\xff]"` returns 0: zero non-ASCII bytes (no emojis, no smart-quotes).
- Plan 01 gate scripts re-run against the new tree: `check-tarball-leak.mjs` exit 0, `verify-rename.mjs` exit 0 (168 files scanned), `check-workflow-safety.mjs` exit 0 (1 workflow file audited).

## CI-01 and CI-02 Closure

- **CI-01 closed.** The ci job runs `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r test:types`, `pnpm -r lint:packages` in that exact sequence on every PR against main and every push to main.
- **CI-02 closed.** All three third-party actions used by ci.yml (actions/checkout, pnpm/action-setup, actions/setup-node) are pinned by 40-character commit SHA. `grep -E "uses: .+@[0-9a-f]{40}" .github/workflows/ci.yml | wc -l` returns 3 (matches every uses line). `grep -E "uses: .+@(v[0-9]|main|master|latest|HEAD)"` returns no matches.

The first PR opened post-merge of this phase will exercise the workflow end-to-end and produce the first green `ci` status check.

## Decisions Made

- **Rephrased the D-11 header comment to avoid the literal `pull_request_target` token.** The plan's automated verification step (`grep -q "pull_request_target" .github/workflows/ci.yml` must exit non-zero) is a textual ban that does not distinguish between an actual YAML trigger key and a comment that names the banned trigger. The workflow-safety audit script uses an anchored regex (`/^pull_request_target\s*:/` after trimStart) so it would have accepted either form, but the simpler text-level acceptance check is the stricter contract. Rephrased the comment to `D-11 hard ban on the pwn-request trigger` (the PITFALLS OIDC-1 informal name for the same trigger) so the audit trail to D-11 is preserved without re-introducing the banned token.
- **All other content rendered verbatim from the plan's literal YAML block.** No paraphrasing of decision IDs in the header comment block, no rewording of step names, no SHA substitutions, no `env:` block additions, no job-level `permissions:` override, no `with:` block on `pnpm/action-setup`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rephrased D-11 comment to avoid literal `pull_request_target` token**
- **Found during:** Task 1 verification (acceptance criteria check `grep -q "pull_request_target" .github/workflows/ci.yml exits non-zero`).
- **Issue:** The plan's literal YAML block included the header comment `D-10 contents: read root permissions, D-11 hard ban on pull_request_target,` which placed the token `pull_request_target` in the file as a comment word. The plan's own acceptance criterion expected `grep -q "pull_request_target"` to exit non-zero. The workflow-safety audit script (anchored regex on trimmed YAML key) was unaffected, but the strict text-level acceptance check was not.
- **Fix:** Rephrased the comment to `D-11 hard ban on the pwn-request trigger`. The pwn-request name is the informal label used in PITFALLS OIDC-1 for the exact same trigger surface, so the audit trail to D-11 is preserved. No semantics changed; only the surface token in a comment.
- **Files modified:** `.github/workflows/ci.yml` (committed in the same task commit, not as a separate fix).
- **Verification:** Re-ran `grep -q "pull_request_target" .github/workflows/ci.yml` -> exit 1 (token absent). Re-ran `node scripts/check-workflow-safety.mjs` -> exit 0.
- **Committed in:** 1a6eccf (Task 1 commit; the fix was applied before the commit was made).

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Single comment-word substitution. No scope creep, no weakening of the workflow, no decision-ID trace lost. The pwn-request synonym is documented in PITFALLS OIDC-1 so a future reader chasing D-11 finds the same surface.

## Issues Encountered

- The one comment-token issue documented above. No other surprises. All three gate scripts already in place from Plan 25-01 returned exit 0 against the new tree on the first run. pnpm pack on both publishable packages completed cleanly during the `check-tarball-leak.mjs` re-validation.

## User Setup Required

- **Branch protection ruleset configuration on github.com is out of scope for this code artifact.** Per 25-CONTEXT.md domain block, configuring the ruleset to require the `ci` status check before merging into `main` is a user-driven action on the GitHub web UI or via `gh api`. The workflow file is the contract; making it required is repository policy.
- No npm credentials, no secrets, no environment variables needed: this workflow has zero secrets references and zero OIDC capability by design.

## Task Commits

1. **Task 1: Create .github/workflows/ci.yml** - `1a6eccf` (feat)

## Files Created/Modified

- `.github/workflows/ci.yml` (64 lines) - PR-time CI workflow closing CI-01 and CI-02. First file under `.github/workflows/` in this repository.

## Next Phase Readiness

- **Phase 25 success criteria satisfied.** ROADMAP criterion 1 (workflow exists with the five v1.3 quality gates) and criterion 2 (every uses: line is SHA-pinned) are both met by this single file. The defense-in-depth gates from Plan 25-01 are wired and self-validate the workflow.
- **Phase 26 (release docs + CRYPTO-01 receipt downgrade defense)** can proceed with the assumption that PR-time CI will gate every change going forward.
- **Phase 28 (release.yml)** will land as a second file under `.github/workflows/`. The `check-workflow-safety.mjs` gate already encodes the publish-job-in-release.yml allowance (Check B in the script): when release.yml lands with a `publish` job carrying `id-token: write`, the gate will recognize and accept it; any other workflow that adds `id-token: write` will fail ci.
- No blockers for the next phase.

## Self-Check: PASSED

Verified post-write and post-commit:
- `.github/workflows/ci.yml` exists at the expected path. FOUND.
- Commit `1a6eccf` (Task 1) present in `git log --oneline -5`. FOUND.
- All 13 verification checks from the plan's `<verification>` block pass on the committed file.
- `node scripts/check-workflow-safety.mjs` exits 0 against the new tree.
- All three Plan 01 gate scripts re-run together exit 0 with single-line OK output.
- No emoji characters present in `.github/workflows/ci.yml` (zero non-ASCII bytes).

---
*Phase: 25-pr-time-ci-workflow*
*Completed: 2026-06-05*
