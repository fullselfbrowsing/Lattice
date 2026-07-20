---
phase: 58-conformance-and-client-migration
plan: 02
subsystem: conformance
tags: [dsse, rfc8785, webcrypto, ajv, vectors]

# Dependency graph
requires:
  - phase: 58-conformance-and-client-migration
    provides: normative v1.4 schema, raw-byte PAE contract, and frozen legacy boundary
provides:
  - Standalone local protocol primitives with no production receipt imports
  - Three deterministic schema-valid v1.4 positive vectors
  - Twelve one-axis adversarial vectors with exact typed expectations
  - Import-safe generator with a symlink-aware standard-only output boundary
affects: [58-03, 58-04, 58-06, conformance-harnesses]

# Tech tracking
tech-stack:
  added: []
  patterns: [standalone protocol generation, explicit vector metadata, physical-path output guards, temp-only generation tests]

key-files:
  created: [conformance/generate/src/protocol.ts, conformance/vectors/standard/positive, conformance/vectors/standard/negative]
  modified: [conformance/generate/src/main.ts, conformance/generate/src/types.ts, conformance/generate/src/positive.ts, conformance/generate/src/negative.ts, conformance/generate/src/main.test.ts]

key-decisions:
  - "Standard vectors explicitly record corpus, schema, verification profile, deprecation, result, and adversarial axis instead of relying on directory inference."
  - "Generation resolves existing symlink ancestors and refuses a physical target inside the committed legacy tree before any writes."
  - "Ordinary tests generate only into temporary directories; committed goldens change only through the explicit regen command."

patterns-established:
  - "Independent evidence: generator code implements public RFC 8785, base64, DSSE PAE, and Ed25519 rules without production receipt imports."
  - "One-axis negatives: each adversarial vector has one unique axis and one first-match typed outcome."

requirements-completed: [CONF16-01, CONF16-02]

# Metrics
duration: 12min
completed: 2026-07-16
---

# Phase 58 Plan 02: Standalone Standard Corpus Summary

**Independent v1.4 generation with three positive vectors, twelve adversarial axes, and a legacy-proof output boundary**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T21:24:00Z
- **Completed:** 2026-07-16T21:36:23Z
- **Tasks:** 2
- **Files modified:** 23

## Accomplishments

- Replaced production receipt imports with local RFC 8785 canonicalization, canonical base64, raw-byte DSSE PAE, and Node WebCrypto Ed25519 signing.
- Generated deterministic Unicode/redaction, minimal, and lineage/agent positives validated against `spec/schema/v1.4.json` before signing.
- Generated twelve explicit adversarial vectors covering base64, version, profile, PAE, key, canonicalization, signature, and signed-kid behavior.
- Added an importable generator that writes only `<outputRoot>/standard`, preserves unrelated files, and rejects physical legacy targets before writes.
- Confirmed all fifteen vector expectations against the production verifier without coupling generator source to it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement standalone standard protocol primitives and positive vectors** - `e5160e0` (feat)
2. **Task 2: Generate one-axis adversarial vectors behind a legacy-proof output boundary** - `5c43e40` (feat)

## Files Created/Modified

- `conformance/generate/src/protocol.ts` - Standalone canonicalization, base64, PAE, WebCrypto signing, and encoding primitives.
- `conformance/generate/src/types.ts` - Explicit standard vector and adversarial-axis contracts.
- `conformance/generate/src/positive.ts` - AJV-validated deterministic positive construction.
- `conformance/generate/src/negative.ts` - Twelve one-axis adversarial constructions.
- `conformance/generate/src/main.ts` - Safe importable and CLI generation entrypoint.
- `conformance/generate/src/main.test.ts` - Protocol, metadata, determinism, adversarial, and output-boundary coverage.
- `conformance/vectors/standard/{positive,negative}/*.json` - Fifteen committed current-profile vectors.

## Decisions Made

- Failure vectors use `null` for expected verification profile and deprecation because no cryptographic profile completed verification.
- Intentionally schema-invalid version/profile bodies record `expectedSchemaResult: "invalid"` without weakening construction or verifier ordering.
- The obsolete base64-text PAE helper is named and scoped exclusively for the v1.4 rejection fixture; it is not an issuance option.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migrated the negative module during Task 1**
- **Found during:** Task 1 package-wide typecheck
- **Issue:** The package gate compiled every source file, and the old negative module still passed base64 text to the corrected production PAE API and imported production receipt modules. Positive-only edits could not satisfy typecheck or the source-independence invariant.
- **Fix:** Moved negative construction onto the new local protocol primitives during Task 1, while deferring its committed corpus and boundary tests to Task 2.
- **Files modified:** `conformance/generate/src/negative.ts`, `conformance/generate/tsconfig.json`
- **Verification:** Package typecheck passed with only `src/**/*.ts` included, and a source scan found no production receipt imports.
- **Committed in:** `e5160e0`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The sequencing changed within the plan, but task scope and final artifacts remained unchanged.

## Issues Encountered

- `tsx -e` selected CommonJS for the initial one-off positive generation and could not load ESM-only `canonicalize`; rerunning through Node's ESM loader produced the vectors without source changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 58-03 can add exact aggregate manifests and non-mutating drift checks over a complete 15-file standard corpus plus the frozen legacy tree.
- Plan 58-04 can consume explicit metadata rather than inferring profile or failure semantics from filenames.
- No blockers remain.

## Self-Check: PASSED

- All declared generator and corpus artifacts exist.
- Task commits `e5160e0` and `5c43e40` are present in Git history.
- The committed corpus contains exactly 3 positive and 12 negative standard vectors.
- Generator source contains no production receipt imports.

---
*Phase: 58-conformance-and-client-migration*
*Completed: 2026-07-16*
