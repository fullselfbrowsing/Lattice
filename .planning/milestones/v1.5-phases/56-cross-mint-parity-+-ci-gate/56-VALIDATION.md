---
phase: 56
slug: cross-mint-parity-ci-gate
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-06
---

# Phase 56 - Validation Strategy

> Reconstructed validation contract for cross-mint parity and the conformance CI gate.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + pytest + GitHub Actions workflow safety check |
| **Config file** | `conformance/verify-ts/vitest.config.ts`, `clients/python/pyproject.toml`, `.github/workflows/conformance.yml` |
| **Quick run command** | `PYTHON=.context/python-venv/bin/python LATTICE_RUN_CROSS_MINT=1 pnpm --filter @lattice-conformance/verify-ts test -- src/cross_mint_parity.test.ts` |
| **Full suite command** | `cd conformance/vectors && shasum -a 256 -c MANIFEST.sha256 && cd ../.. && pnpm --filter @lattice-conformance/generate test && pnpm --filter @lattice-conformance/verify-ts test && .context/python-venv/bin/python -m pytest clients/python/tests -q && PYTHON=.context/python-venv/bin/python LATTICE_RUN_CROSS_MINT=1 pnpm --filter @lattice-conformance/verify-ts test -- src/cross_mint_parity.test.ts && node scripts/check-workflow-safety.mjs` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick cross-mint parity command.
- **After every plan wave:** Run the full conformance gate command.
- **Before `$gsd-verify-work`:** Manifest, TS, Python, parity, and workflow-safety checks must be green.
- **Max feedback latency:** 15 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | PARITY-01 | - | TypeScript verifies a Python-minted receipt and vector #0 intermediates match | vitest + Python subprocess | `PYTHON=.context/python-venv/bin/python LATTICE_RUN_CROSS_MINT=1 pnpm --filter @lattice-conformance/verify-ts test -- src/cross_mint_parity.test.ts` | yes | green |
| 56-01-02 | 01 | 1 | PARITY-02 | - | CI workflow runs manifest -> TS -> Python -> parity and uses SHA-pinned setup actions | workflow + script | `node scripts/check-workflow-safety.mjs` | yes | green |
| 56-01-03 | 01 | 1 | PARITY-02 | - | Generator manifest coverage no longer depends on checkout mtime | vitest | `pnpm --filter @lattice-conformance/generate test` | yes | green |

*Status: green = automated verification passed.*

---

## Wave 0 Requirements

- [x] `conformance/verify-ts/src/cross_mint_parity.test.ts` covers Python -> TypeScript receipt parity.
- [x] `.github/workflows/conformance.yml` defines the conformance CI gate.
- [x] `scripts/check-workflow-safety.mjs` validates workflow safety invariants.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 15s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-06
