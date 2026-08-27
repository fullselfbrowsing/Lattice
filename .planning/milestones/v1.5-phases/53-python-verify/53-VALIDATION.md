---
phase: 53
slug: python-verify
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-06
---

# Phase 53 - Validation Strategy

> Reconstructed validation contract for the completed Python verify phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest via `clients/python/pyproject.toml` |
| **Config file** | `clients/python/pyproject.toml` |
| **Quick run command** | `.context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py -q` |
| **Full suite command** | `.context/python-venv/bin/python -m pytest clients/python/tests -q` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick conformance test command.
- **After every plan wave:** Run the full Python pytest suite.
- **Before `$gsd-verify-work`:** Full Python pytest suite must be green.
- **Max feedback latency:** 2 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | PYV-01 | - | Python verifier returns typed success/failure verdicts for DSSE envelopes | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py -q` | yes | green |
| 53-01-02 | 01 | 1 | PYV-02 | - | Canonical bytes and PAE match committed vectors byte-for-byte | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py -q` | yes | green |
| 53-01-03 | 01 | 1 | PYV-03 | - | Downgrade versions are rejected before key lookup / crypto | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py -q` | yes | green |
| 53-01-04 | 01 | 1 | PYV-04 | - | Positive and negative committed vectors produce exact expected verdicts | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py -q` | yes | green |

*Status: green = automated verification passed.*

---

## Wave 0 Requirements

- [x] `clients/python/pyproject.toml` declares pytest and runtime dependencies.
- [x] `clients/python/tests/conftest.py` loads committed vectors and shared fixtures.
- [x] `clients/python/tests/test_conformance.py` covers all Phase 53 requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 2s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-06
