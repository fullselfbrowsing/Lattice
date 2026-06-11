---
phase: 29
slug: first-v1-3-0-stable-publish
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-11
---

# Phase 29 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pnpm workspace scripts, Vitest, tsd, publint, attw, npm CLI, gh CLI |
| **Config file** | `package.json`, `pnpm-workspace.yaml`, `.changeset/config.json`, `.github/workflows/release.yml` |
| **Quick run command** | `node scripts/check-workflow-safety.mjs && pnpm changeset status --verbose` |
| **Full suite command** | `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test && pnpm test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-workflow-safety.mjs && node scripts/refresh-model-registry.mjs --check` |
| **Estimated runtime** | ~10-20 minutes locally, plus external GitHub/npm waiting time |

---

## Sampling Rate

- **After every docs/workflow task commit:** Run `node scripts/check-workflow-safety.mjs && pnpm changeset status --verbose`
- **After every plan wave:** Run the full suite command when local files changed
- **Before publish approval:** Confirm version PR merge commit, tag, workflow run, and npm pre-state
- **Before `$gsd-verify-work`:** Full post-publish proof must be captured for both packages
- **Max feedback latency:** local gates under 20 minutes; external publish gate bounded by GitHub/npm workflow completion

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | PUB-04 | T-29-06 | GitHub Release notes are sourced from changelog/changesets, not generic diff only | static/workflow | `rg "body_path|CHANGELOG|release notes" .github/workflows/release.yml README.md` | Yes | pending |
| 29-01-02 | 01 | 1 | PUB-02..04 | T-29-01, T-29-02 | Release workflow keeps OIDC scoped to publish job and no token fallback | static/security | `node scripts/check-workflow-safety.mjs && ! rg "NODE_AUTH_TOKEN|NPM_TOKEN" .github/workflows/release.yml` | Yes | pending |
| 29-02-01 | 02 | 1 | PUB-02..04 | T-29-04, T-29-05 | Stable version PR is generated only after local release gates pass | integration/local | full suite command plus `pnpm changeset status --verbose` | Yes | pending |
| 29-02-02 | 02 | 1 | PUB-02..04 | T-29-04 | npm pre-state confirms `1.3.0` slot is open before publish | registry/preflight | `npm view @full-self-browsing/lattice versions dist-tags --json && npm view @full-self-browsing/lattice-cli versions dist-tags --json` | Yes | pending |
| 29-03-01 | 03 | 2 | PUB-02, PUB-03 | T-29-02, T-29-03 | Stable publish runs through OIDC and environment approval only | external/manual | GitHub Actions publish run URL plus approval evidence | Yes | pending |
| 29-04-01 | 04 | 3 | PUB-02, PUB-03 | T-29-07 | Both npm packages have stable versions, latest dist-tags, signatures, and attestations | registry/postflight | `npm view <pkg>@1.3.0 --json` and `npm audit signatures` in a temp consumer | Yes | pending |
| 29-04-02 | 04 | 3 | PUB-04 | T-29-06 | GitHub Release `v1.3.0` exists, is not prerelease, and contains changelog-derived notes | gh/postflight | `gh release view v1.3.0 --repo fullselfbrowsing/Lattice --json tagName,name,url,body,isLatest,isPrerelease` | Yes | pending |
| 29-04-03 | 04 | 3 | PUB-02, PUB-03 | T-29-03 | Published tarballs ship scoped package names, exports, types, and CLI bin | tarball/postflight | `npm pack @full-self-browsing/lattice@1.3.0` and `npm pack @full-self-browsing/lattice-cli@1.3.0` with manifest inspection | Yes | pending |

*Status: pending, green, red, flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub Actions can create/update the Version Packages PR | PUB-04 | Repository setting is external to git | Check repo Settings -> Actions -> General -> Workflow permissions, or observe the `version-pr` job successfully creates/updates the PR |
| `npm-publish` environment approval gate is exercised | PUB-02, PUB-03 | GitHub Environment approval is an external human gate | Approve the deployment in GitHub Actions and record approver/run URL in summary |
| npm provenance UI shows expected source metadata | PUB-02, PUB-03 | CLI JSON shape may not expose all UI fields uniformly | Inspect both package pages for provenance details: workflow run, source commit, build file, and transparency log |

---

## Validation Sign-Off

- [x] All tasks have automated verify or explicit manual gate dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency target documented
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
