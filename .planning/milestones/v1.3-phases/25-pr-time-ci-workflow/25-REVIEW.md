---
phase: 25-pr-time-ci-workflow
reviewed: 2026-06-06T00:00:00Z
depth: quick
files_reviewed: 4
files_reviewed_list:
  - scripts/check-tarball-leak.mjs
  - scripts/verify-rename.mjs
  - scripts/check-workflow-safety.mjs
  - .github/workflows/ci.yml
findings:
  critical: 0
  warning: 0
  info: 3
  total: 3
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-06-06T00:00:00Z
**Depth:** quick
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Quick-depth pattern scan of the Phase 25 PR-time CI workflow deliverables: three Node 24 ESM gate scripts and the wiring `.github/workflows/ci.yml`.

Security posture is strong. No hardcoded secrets, no dangerous function calls (`eval`, `exec`, `system`, `innerHTML`), no empty catch blocks, no debug artifacts beyond intentional `console.log` status reporting. The `ci.yml` supply-chain posture is correct: all three `uses:` lines are pinned to 40-character SHAs (verified: `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`), root-level `permissions: contents: read` is set explicitly, no `pull_request_target` trigger, no `id-token: write` anywhere, no `secrets.*` references, and concurrency / branch / job key names are internally consistent (`name: ci`, job key `ci:`, job `name: ci`).

The `check-tarball-leak.mjs` cleanup path is correct (`try { ... } finally { await rm(tmp, { recursive: true, force: true }); }` guarantees temp directory removal on both `pnpm pack` failure and success). The `verify-rename.mjs` allowlist correctly covers the two phase-context-mandated files (`packages/lattice-cli/package.json` bin map, `packages/lattice/scripts/check-cli-deps.mjs` FORBIDDEN array) plus a self-reference to prevent the script's own JSDoc from triggering a self-match.

Three Info-level observations follow. None block landing; all are hardening notes for future iterations.

## Info

### IN-01: check-workflow-safety pull_request_target regex does not catch quoted YAML keys

**File:** `scripts/check-workflow-safety.mjs:42`
**Issue:** `PR_TARGET_RE = /^pull_request_target\s*:/` is applied to the leading-whitespace-stripped line. It catches the conventional form `pull_request_target:` but would silently miss the quoted YAML key forms `"pull_request_target":` or `'pull_request_target':`. GitHub Actions accepts quoted keys as valid YAML, so a deliberate adversary editing a workflow file in the future could bypass this gate. Probability is extremely low (no human writes that form), but the gate exists precisely to defend against the pwn-request supply-chain class.
**Fix:**
```js
const PR_TARGET_RE = /^["']?pull_request_target["']?\s*:/;
```

### IN-02: check-workflow-safety id-token regex misses trailing inline comments

**File:** `scripts/check-workflow-safety.mjs:43`
**Issue:** `ID_TOKEN_WRITE_RE = /^-?\s*id-token\s*:\s*write\s*$/` requires end-of-line after `write`. A line like `id-token: write  # needed for npm provenance` would NOT match and the gate would silently pass, allowing a future contributor to grant OIDC scope with a justifying comment. Same supply-chain blast-radius concern as IN-01.
**Fix:**
```js
const ID_TOKEN_WRITE_RE = /^-?\s*id-token\s*:\s*write\b/;
```

### IN-03: ci.yml tarball-leak step has no explicit build dependency

**File:** `.github/workflows/ci.yml:57-58`
**Issue:** The "Audit tarballs for stale names" step invokes `pnpm pack` indirectly via `check-tarball-leak.mjs`. Whether the packed tarball contains the post-build artifacts depends entirely on each package's `prepack` / `prepublishOnly` hook running a build. If a future package omits that hook, the tarball gate would inspect a stale `package.json` from a previous build directory or an empty tarball. The current step ordering relies on `pnpm -r lint:packages` (line 55) having implicitly triggered builds via publint/attw, which is fragile. Consider adding an explicit `pnpm -r build` step before the tarball-leak gate, or documenting in the script that `prepack` is the contractual hook.
**Fix:** Add a build step before line 57:
```yaml
      - name: Build all packages
        run: pnpm -r build

      - name: Audit tarballs for stale names
        run: node scripts/check-tarball-leak.mjs
```
Alternatively, leave as-is if every publishable package's `prepack` reliably triggers its own build (verify by inspecting `packages/lattice/package.json` and `packages/lattice-cli/package.json`).

---

_Reviewed: 2026-06-06T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: quick_
