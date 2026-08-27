---
phase: 50
slug: protocol-specification
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Phase 50 is documentation + JSON files only — validation is structural (file/section presence,
> schema parse + structural checks, generated worked-example bytes verifying against the reference
> implementation), not a unit-test suite. No test framework is installed or required.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — inline Node.js (`node -e`), `grep`, and `awk` structural checks |
| **Config file** | none — no framework to configure |
| **Quick run command** | `pnpm exec tsx spec/generate-vector0.ts && node -e "JSON.parse(require('fs').readFileSync('spec/vector0-fixture.json','utf8'))"` |
| **Full suite command** | run each task's `<verify>` command in order (see Per-Task Verification Map) |
| **Estimated runtime** | ~3 seconds (generator mint + structural checks) |

---

## Sampling Rate

- **After every task commit:** Run that task's `<verify>` command (all sub-second except the generator mint).
- **After every plan wave:** Wave 1 → re-run the generator + fixture assertions; Wave 2 → run all SPEC.md and schema/changelog checks.
- **Before `/gsd-verify-work`:** All six task verify commands must exit 0.
- **Max feedback latency:** ~3 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | SPEC-01/03/05 | T-50-01 | Test keypair labeled EXAMPLE/TEST-ONLY | structural | `pnpm exec tsx spec/generate-vector0.ts 2>&1 | tail -5; echo "Exit: $?"` | ❌ W0→created | ⬜ pending |
| 50-01-02 | 01 | 1 | SPEC-07 (D-04) | — | Fixture body exercises ≥1 redaction (impl-generated) | structural | `node -e "const f=JSON.parse(require('fs').readFileSync('spec/vector0-fixture.json','utf8')); console.assert(Array.isArray(f.body.redactions)&&f.body.redactions.length>=1,'D-04 redactions')"` | ❌ W0→created | ⬜ pending |
| 50-02-01 | 02 | 2 | SPEC-01/02/03/05/06 | T-50-04 | Downgrade-defense step ordering preserved (schema-version-too-low before key-not-found) | structural | `grep -c "MUST" spec/SPEC.md && awk '/schema-version-too-low/{a=NR} /key-not-found/{b=NR} END{exit (a>0&&b>0&&a<b)?0:1}' spec/SPEC.md && echo "step-order OK"` | ❌ W0→created | ⬜ pending |
| 50-02-02 | 02 | 2 | SPEC-04 | — | outputHash full dispatch + D-11 conformance boundary stated | structural | `grep -E "^## " spec/SPEC.md | wc -l && grep -c 'Uint8Array\|ArrayBuffer\|Blob' spec/SPEC.md && grep -iE 'implementation-defined|out of.*v1\.5 conformance' spec/SPEC.md` | ❌ W0→created | ⬜ pending |
| 50-03-01 | 03 | 2 | SPEC-07 | T-50-08 | `additionalProperties:false` drift gate present on all 3 schemas | structural | `node -e "['v1.1','v1.2','v1.3'].forEach(v=>{const s=JSON.parse(require('fs').readFileSync('spec/schema/'+v+'.json','utf8')); if(s.additionalProperties!==false) throw new Error(v)})"` | ❌ W0→created | ⬜ pending |
| 50-03-02 | 03 | 2 | SPEC-07 | — | CHANGELOG records per-version deltas | structural | `grep -c "lattice-receipt/v1\." spec/CHANGELOG.md` | ❌ W0→created | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tsx` available at workspace root (Plan 01 installs it if absent in devDependencies) — required to run `spec/generate-vector0.ts`

*No test framework or fixtures to install — `node`/`grep`/`awk` are sufficient for all structural checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A human implementer can reproduce JCS bytes from SPEC.md alone | SPEC-01 | "Without reading TypeScript" is a comprehension property no script can assert | At `/gsd-verify-work`, a reviewer reads §4 + §4.9 of SPEC.md and confirms the worked example's canonical-bytes hex is reconstructable from the prose rules + the fixture body |

*All other phase behaviors have automated structural verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (all 6 have one)
- [x] Wave 0 covers all MISSING references (tsx availability)
- [x] No watch-mode flags
- [x] Feedback latency < 3s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-25
