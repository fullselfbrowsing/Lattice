---
phase: 51
slug: conformance-vector-generator-+-committed-vectors
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 51 — Validation Strategy

> Generator self-checks (vitest) + `sha256sum --check` of the committed manifest are the primary
> feedback signals. Vectors are committed golden files — CI consumes, never regenerates.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (in the private `@lattice-conformance/generate` package) + `sha256sum --check` + ajv (body-vs-schema at gen time) |
| **Config file** | `conformance/generate/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @lattice-conformance/generate typecheck` |
| **Full suite command** | `pnpm --filter @lattice-conformance/generate test && cd conformance/vectors && sha256sum --check MANIFEST.sha256` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** run that task's `<verify>`.
- **After Wave 3 (manifest):** `sha256sum --check`; every positive vector verifies OK and every negative vector fails with its exact `VerifyErrorKind` via the reference `verifyReceipt`.
- **Before `/gsd-verify-work`:** full suite green; manifest check passes.
- **Max feedback latency:** ~5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|--------|
| 51-01-01 | 01 | 1 | VEC-01 | T-51-SC | private package; deps audited (incl. canonicalize) | structural | `grep -q "conformance/" pnpm-workspace.yaml && pnpm --filter @lattice-conformance/generate exec node -e "require('canonicalize')"` | ⬜ |
| 51-01-02 | 01 | 1 | VEC-01, VEC-02 | T-51-FG | `--regen-vectors` no-op gate; ConformanceVector incl. `envelope?`/`verifyKeyState?` | structural | `pnpm --filter @lattice-conformance/generate typecheck && pnpm --filter @lattice-conformance/generate test` | ⬜ |
| 51-02-01 | 02 | 2 | VEC-03, VEC-05 | T-51-05 | RFC 8785 cross-check (wrong hex fails here, not deferred) | unit | `pnpm --filter @lattice-conformance/generate typecheck && <run runRFC8785CrossChecks no-throw>` | ⬜ |
| 51-02-02 | 02 | 2 | VEC-03, VEC-05 | — | vec-00 byte-identical to spec/vector0-fixture.json; per-version positives | structural | `pnpm --filter @lattice-conformance/generate test && ls conformance/vectors/positive/ | sort` | ⬜ |
| 51-03-01 | 03 | 3 | VEC-04 | T-51-11 | 9 negatives isolate each VerifyErrorKind; NEG-01 carries machine-readable `envelope` | unit | `pnpm --filter @lattice-conformance/generate typecheck` | ⬜ |
| 51-03-02 | 03 | 3 | VEC-04, VEC-06 | T-51-MAN | MANIFEST.sha256 written last; fails closed on tamper | structural | `pnpm --filter @lattice-conformance/generate test && cd conformance/vectors && sha256sum --check MANIFEST.sha256` | ⬜ |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `conformance/generate/` private pnpm package scaffolded + `conformance/*` registered in `pnpm-workspace.yaml` (`private: true`) — Plan 51-01 Task 1
- [ ] devDependencies declared in the private package: `canonicalize@3.0.0` (or `catalog:`), `ajv@^8`, `ajv-formats@^3`, `tsx`, `typescript`, `vitest`, `@types/node`

*No runtime-package changes — all tooling stays in the private conformance package.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RFC 8785 cross-check data is genuinely external/authoritative | VEC-05 | Provenance of reference data is a human judgement | Reviewer confirms the cross-checked canonical bytes come from RFC 8785 §3.2.4 and/or cyberphone/json-canonicalization testdata, cited in `rfc8785-check.ts` |

*All other phase behaviors have automated structural verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers private-package scaffolding + deps
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-25
