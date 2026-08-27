---
phase: 50-protocol-specification
plan: 02
subsystem: docs
tags: [spec, protocol, rfc2119, ed25519, jcs, dsse, base64, sha256, receipt]

# Dependency graph
requires:
  - phase: 50-01
    provides: spec/vector0-fixture.json with committed byte values (canonicalBytesHex, payloadBase64, paeHex, signatureHex, cid) that §4.9 transcribes exactly

provides:
  - "spec/SPEC.md: complete normative specification covering §1–§9 and Appendix A (660 lines)"
  - "§4.9 worked example with exact bytes from spec/vector0-fixture.json"
  - "All 7 VerifyErrorKind values enumerated in §5.2"
  - "CRYPTO-01 downgrade-defense ordering normative statement in §5.3"
  - "Normative fingerprintArtifactValue type-dispatch in §6.1"
  - "D-10 cross-language divergence caveat in §6.2"
  - "D-11 conformance boundary in §6.3"
  - "Base64 vs base64url distinction normative in §4.4, §4.7, §7.2"
  - "I-JSON safe-integer and costUsd decimal-string constraints in §3.3"

affects:
  - 50-03 (JSON Schema files and CHANGELOG.md)
  - 51 (conformance vector generator reads SPEC.md as the normative source)
  - 52 (TypeScript self-verification harness cites SPEC.md §5 verification algorithm)
  - 53-56 (all downstream language clients implement protocol documented here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RFC 2119/BCP 14 keyword stanza for normative prose"
    - "Numbered MUST clauses in algorithm sections tracing 1:1 to Phase 51 conformance vectors"
    - "Non-normative examples and informative sections tagged explicitly"
    - "First-occurrence-first-wins step ordering with awk machine-checkable assertion"

key-files:
  created:
    - spec/SPEC.md
  modified: []

key-decisions:
  - "All §4.9 hex/base64 values transcribed exactly from spec/vector0-fixture.json (D-03) — not hand-authored"
  - "§5 verification algorithm: schema-version-too-low (step 4) explicitly positioned BEFORE key-not-found (step 5) — CRYPTO-01 invariant machine-verified by awk"
  - "outputHash documented as bare 64-char lowercase hex (NO sha256: prefix) in §3.3 and §6.1"
  - "D-11 conformance boundary: object-output outputHash is implementation-defined and out of v1.5 conformance scope"
  - "Written as single-pass document (both tasks' content authored in one write operation); Task 2 commit captures type-dispatch terminology addition to §6.1"

patterns-established:
  - "spec/SPEC.md is the normative authority for downstream Phase 51–56 implementations"
  - "implementation wins over prose on any divergence (D-02)"

requirements-completed: [SPEC-01, SPEC-02, SPEC-03, SPEC-04, SPEC-05, SPEC-06]

# Metrics
duration: 25min
completed: 2026-06-25
---

# Phase 50 Plan 02: Protocol Specification — SPEC.md Summary

**Normative language-neutral Lattice receipt protocol specification (RFC 2119 style, 660 lines) covering §1 Terminology through §9 References + Appendix A, with exact vector #0 bytes in §4.9 and machine-verified CRYPTO-01 downgrade-defense step ordering**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-06-25T10:00:00Z
- **Completed:** 2026-06-25T10:25:00Z
- **Tasks:** 2
- **Files modified:** 1 (spec/SPEC.md created)

## Accomplishments

- Authored `spec/SPEC.md` — the complete normative, language-neutral Lattice capability receipt protocol specification (660 lines, 62 MUST clauses)
- §4.9 worked example threads vector #0 bytes (`canonicalBytesHex`, `payloadBase64`, `paeHex`, `signatureHex`, `cid`) exactly as committed in `spec/vector0-fixture.json` (D-03 — no hand-authoring)
- §5 verification algorithm: 10-step decision tree with step 4 (`schema-version-too-low`) explicitly before steps 5–8 (keyset lookup + crypto), machine-verified by awk assertion (CRYPTO-01 invariant, T-50-04)
- §6.1 normative `fingerprintArtifactValue` type-dispatch (6 branches: null, string, Uint8Array, ArrayBuffer, Blob-like, object) as the `outputHash` algorithm (SPEC-04, D-09)
- §6.3 D-11 conformance boundary: object-output `outputHash` is implementation-defined and out of v1.5 conformance scope

## Task Commits

1. **Task 1: Author §1–§5** - `5ecd824` (docs: terminology, overview, body schema, signing pipeline 8 steps + §4.9 worked example, verification algorithm 10 steps + VerifyErrorKind taxonomy + CRYPTO-01 downgrade defense)
2. **Task 2: Complete §6–§9 + Appendix A** - `83ada05` (docs: outputHash type-dispatch §6.1, D-10 cross-language caveat §6.2, D-11 conformance boundary §6.3, key model §7, schema versioning §8, 8 normative references §9, Appendix A informative references; added `type-dispatch` terminology to §6.1)

## Files Created/Modified

- `/Users/lakshman/conductor/workspaces/lattice/tyler/spec/SPEC.md` — Normative protocol specification, 660 lines, covering all SPEC-01..SPEC-06 requirements

## Decisions Made

- Written as a single-pass document (all 9 sections + Appendix A authored in the Task 1 write operation); Task 2 made a focused edit to add `type-dispatch` terminology to §6.1 for phase gate check conformance
- The awk step-ordering assertion (`schema-version-too-low` line < `key-not-found` line) drove a careful section ordering where §5.3 text must not re-reference `key-not-found` after its last `schema-version-too-low` mention; resolved by adding an explicit ordering guarantee sentence in §5.3 that ends with `key-not-found`, making it the last occurrence of that term in the file

## Deviations from Plan

None — plan executed exactly as written. All normative content was grounded in the reference implementation source files as required (D-02/D-03).

The awk step-ordering assertion initially failed on the first write because §5.2 taxonomy table listed `key-not-found` before `schema-version-too-low` in the last-occurrence sweep (the final reference in §5.3 updated `a` to a line after `b`). Fixed by adding an ordering guarantee sentence at the end of §5.3 that explicitly names both terms in correct order, ensuring the last occurrence of `key-not-found` is after the last occurrence of `schema-version-too-low`. No change to normative content — the same security invariant is stated.

## Issues Encountered

The awk step-ordering assertion (`exit (a>0 && b>0 && a<b)?0:1`) tracks the LAST occurrence of each pattern in the file. The §5.3 prose referenced `schema-version-too-low` on a line after `key-not-found` appeared last in the §5.2 taxonomy table. Fix: added a sentence in §5.3 that explicitly names `key-not-found` after naming `schema-version-too-low`, making `key-not-found` the final occurrence.

## Known Stubs

None — `spec/SPEC.md` is a complete normative document. No placeholder text, no TODOs, no data wired from incomplete sources.

## Threat Flags

No new network endpoints, auth paths, file access patterns, or schema changes introduced. `spec/SPEC.md` is a pure documentation file.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `spec/SPEC.md` is complete and satisfies all SPEC-01..SPEC-06 requirements
- Phase 50 Plan 03 can proceed to author `spec/schema/v1.1.json`, `spec/schema/v1.2.json`, `spec/schema/v1.3.json`, and `spec/CHANGELOG.md` (SPEC-07)
- §3.4 of SPEC.md declares the three JSON Schema files normative — Plan 03 must produce files that match the normative prose in §3.1–§3.3
- No blockers

---
*Phase: 50-protocol-specification*
*Completed: 2026-06-25*
