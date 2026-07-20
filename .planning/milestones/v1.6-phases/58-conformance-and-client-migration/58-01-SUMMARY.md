---
phase: 58-conformance-and-client-migration
plan: 01
subsystem: protocol
tags: [dsse, receipts, json-schema, conformance, migration]

# Dependency graph
requires:
  - phase: 57-protocol-semantics
    provides: v1.4 raw-byte DSSE issuance and bounded legacy verification in TypeScript and Python
provides:
  - Source-independent v1.4 receipt specification and closed JSON Schema
  - Ordered bridge verification contract with typed profiles and failures
  - Byte-identical immutable legacy vector corpus and nested integrity manifest
  - TypeScript, Python, CLI, and corpus migration guidance
affects: [58-02, 58-03, 58-04, 58-05, 58-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [versioned normative schemas, raw-byte DSSE PAE, observable legacy bridge, immutable legacy evidence]

key-files:
  created: [spec/schema/v1.4.json, spec/MIGRATION-v1.4.md]
  modified: [spec/SPEC.md, spec/CHANGELOG.md, conformance/vectors/legacy/MANIFEST.sha256]

key-decisions:
  - "The versioned specification and schemas are the normative public authority; production TypeScript source is non-normative."
  - "Current issuance is v1.4/dsse-v1 over canonical payload bytes; historical base64-text PAE is verification-only and observable."
  - "Historical vectors retain their exact bytes under an explicit immutable legacy boundary."

patterns-established:
  - "Profile-first protocol evolution: a signed version/profile pair selects standard semantics before key or signature work."
  - "Compatibility is a typed result: successful legacy acceptance reports its profile and deprecated status."

requirements-completed: [CONF16-01, CONF16-02]

# Metrics
duration: 9min
completed: 2026-07-16
---

# Phase 58 Plan 01: Protocol Contract and Legacy Evidence Summary

**Normative v1.4 raw-byte DSSE semantics with an explicit compatibility bridge and byte-identical historical evidence**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-16T21:12:21Z
- **Completed:** 2026-07-16T21:21:29Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Published a closed v1.4 body schema requiring the authenticated `dsse-v1` signature profile while preserving every v1.3 field and constraint.
- Replaced obsolete base64-text signing prose with standard DSSE PAE over decoded canonical payload bytes and a first-match 12-step verification tree.
- Relocated all twelve historical vectors and their manifest with Git-confirmed 100% byte-identical renames.
- Documented compatible and strict behavior across TypeScript, Python, CLI, result fields, and the legacy/standard corpus taxonomy.

## Task Commits

Each task was committed atomically:

1. **Task 1: Publish the normative v1.4 schema and corrected protocol** - `3e52512` (docs)
2. **Task 2: Publish the migration guide and freeze legacy evidence byte-for-byte** - `094ec1a` (docs)

## Files Created/Modified

- `spec/schema/v1.4.json` - Closed draft-2020-12 body schema requiring v1.4 and `dsse-v1`.
- `spec/SPEC.md` - Normative issuance, PAE, verifier ordering, result, key, CID, and bridge contract.
- `spec/CHANGELOG.md` - v1.4 protocol and migration entry.
- `spec/MIGRATION-v1.4.md` - Library, CLI, result, policy, and corpus migration guide.
- `conformance/vectors/legacy/MANIFEST.sha256` - Original manifest relocated unchanged.
- `conformance/vectors/legacy/{positive,negative}/*.json` - Twelve historical vectors relocated unchanged.

## Decisions Made

- Public versioned artifacts now govern protocol interoperability so an external implementation does not need production source.
- The direct bridge default remains `allow`, while strict policy rejects only the deprecated fallback and never blocks a valid standard signature solely because its body is historical.
- v1.4 signature failure is terminal and cannot fall back to historical PAE.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Documentation correctness] Included v1.4 in inherited optional-field headings**
- **Found during:** Overall plan acceptance verification
- **Issue:** The schema preserved all v1.3 fields, but three headings still described carry-forward only through v1.3.
- **Fix:** Updated the headings to state that common, v1.2, and v1.3 optional fields carry into v1.4.
- **Files modified:** `spec/SPEC.md`
- **Verification:** Compared every non-version v1.3 schema property against v1.4 and re-ran the contract scan.
- **Committed in:** `094ec1a`

---

**Total deviations:** 1 auto-fixed (1 documentation correctness)
**Impact on plan:** The correction removes prose/schema ambiguity without changing scope or behavior.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The legacy tree is frozen and available as a non-mutable input for aggregate manifest work.
- Plan 58-02 can generate the separate standard corpus against the published v1.4 contract.
- No blockers remain.

## Self-Check: PASSED

- All declared artifacts exist.
- Task commits `3e52512` and `094ec1a` are present in Git history.
- The nested legacy manifest validates all twelve relocated JSON files.

---
*Phase: 58-conformance-and-client-migration*
*Completed: 2026-07-16*
