---
phase: 51
slug: conformance-vector-generator-+-committed-vectors
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Generator self-checks (vitest) + `sha256sum --check` of the committed manifest are the
> primary feedback signals. Vectors are committed golden files — CI consumes, never regenerates.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (generator self-checks) + `sha256sum --check` (manifest integrity) + ajv (body-vs-schema validation at gen time) |
| **Config file** | `conformance/generate/` private package (vitest config local to it) |
| **Quick run command** | `pnpm --filter @conformance/generate test` (or the private package's test script) |
| **Full suite command** | regenerate is OFF by default; `cd conformance/vectors && sha256sum --check MANIFEST.sha256` + generator self-check suite |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** run that task's `<verify>` (generator self-check or manifest check).
- **After the generation task:** `sha256sum --check` the manifest; assert every committed vector verifies via the reference `verifyReceipt` with its `expectedResult`.
- **Before `/gsd-verify-work`:** all positive vectors verify OK; all negative vectors fail with their exact `VerifyErrorKind`; manifest check passes.
- **Max feedback latency:** ~5 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (filled by planner) | | | VEC-01..06 | | committed test keypair stays EXAMPLE/TEST-ONLY; flag-gated regen | structural | (per plan) | W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `conformance/generate/` private pnpm package scaffolded + registered in `pnpm-workspace.yaml` (`private: true`)
- [ ] `ajv@^8` (+ verify `ajv-formats` exists if used) added to the private package only — NOT the runtime
- [ ] `tsx` available (already at workspace root from Phase 50)

*If none beyond scaffolding: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RFC 8785 cross-check data is genuinely external/authoritative | VEC-05 | Provenance of reference data is a human judgement | Reviewer confirms the cross-checked canonical bytes come from RFC 8785 §3.2.4 and/or cyberphone/json-canonicalization testdata, cited in the vector or a README |

*All other phase behaviors have automated structural verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers private-package scaffolding + ajv
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** {pending}
