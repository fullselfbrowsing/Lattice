---
phase: 58-conformance-and-client-migration
plan: 05
subsystem: protocol-cli
tags: [dsse, cli, replay, packed-consumer, migration-policy]

# Dependency graph
requires:
  - phase: 58-conformance-and-client-migration
    provides: exact standard and frozen legacy corpora with typed verification outcomes
provides:
  - Verify-first replay policy enforcement before artifact loading
  - Profile-aware verify and repro commands with standard-only enforcement
  - Clean tarball consumer proof for public runtime exports and the installed CLI binary
affects: [58-06, conformance-ci, package-release, downstream-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [single derived legacy policy, verifier-owned profile reporting, packed public-surface smoke]

key-files:
  created: [scripts/check-protocol-package-consumer.mjs]
  modified: [packages/lattice/src/replay/materialize.ts, packages/lattice-cli/src/commands/verify.ts, packages/lattice-cli/src/commands/repro.ts, package.json]

key-decisions:
  - "CLI compatibility remains allow-by-default while --standard-only maps to the shared reject policy at every verification boundary."
  - "Profile and deprecation output comes directly from VerifyOk; commands never infer cryptographic semantics from receipt versions."
  - "Release smoke tests install runtime and CLI tarballs into a clean ESM project and exercise only declared public exports and the packed binary."

patterns-established:
  - "Verify-first policy: strict legacy rejection occurs before artifact loaders, replay, or any other side effect."
  - "Packed consumer gate: public runtime behavior and CLI wiring are proven outside workspace resolution."

requirements-completed: [CONF16-05, CONF16-06]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 58 Plan 05: CLI Bridge and Packed Consumer Summary

**One consistent receipt policy now governs replay and CLI verification, with machine-visible profile metadata and clean tarball consumer proof**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-16T22:02:30Z
- **Completed:** 2026-07-16T22:17:10Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added an optional shared legacy policy at replay materialization's existing verify-first boundary, preserving default compatibility while guaranteeing strict rejection before artifact reads.
- Added `--standard-only` to `verify` and `repro`, derived one policy per command, and reported exact verifier-owned `profile=` and `deprecated=` fields on every success.
- Covered standard strict success, legacy default compatibility, exact strict rejection, replay ordering, parser wiring, and unchanged exit-code classes in focused tests.
- Added a root packed-package check that builds and packs both publishable packages, installs only their tarballs in a clean ESM consumer, verifies public issuance/CID/bridge behavior, and invokes the installed CLI binary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread explicit legacy policy through replay materialization** - `7372ffe` (feat)
2. **Task 2: Add profile reporting and --standard-only to verify and repro** - `c915aca` (feat)
3. **Task 3: Prove public behavior from clean packed runtime and CLI consumers** - `9e8d340` (test)

## Files Created/Modified

- `packages/lattice/src/replay/materialize.ts` - Accepts optional `LegacyReceiptPolicy` and applies it before loader access.
- `packages/lattice/src/replay/materialize.test.ts` - Proves default legacy compatibility and strict standard/legacy ordering.
- `packages/lattice-cli/src/commands/verify.ts` - Adds standard-only enforcement and stable profile/deprecation output.
- `packages/lattice-cli/src/commands/repro.ts` - Reuses one policy across materialization and defensive verification.
- `packages/lattice-cli/test/{verify,repro}.test.ts` - Exercises bridge outcomes, parser flags, output contracts, and side-effect prevention.
- `packages/lattice-cli/src/eval/runner.ts` - Keeps the existing quality-floor probe compatible with the now-unioned receipt body type.
- `scripts/check-protocol-package-consumer.mjs` - Builds, packs, installs, and validates public runtime and CLI bridge behavior.
- `package.json` - Adds `check:protocol-package`.

## Decisions Made

- Default command behavior explicitly supplies `legacyPolicy: "allow"`; strict mode supplies `"reject"`, so migration semantics are visible at the call boundary.
- Repro derives the policy once and passes the same value to materialization and its defensive second verification, preventing policy drift between stages.
- Packed consumer fixtures are minimal envelopes and a public keyset derived from the committed corpus; the consumer never imports repository source paths.
- The packed smoke independently recomputes the payload CID with Node crypto before comparing the public `receiptCid` result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the CLI eval runner's receipt extension probe for the union body type**
- **Found during:** Task 2 CLI package typecheck
- **Issue:** `ReceiptBodyMaybeQualityFloor` was an interface extending `CapabilityReceiptBody`, which is now a union and cannot be an interface base type.
- **Fix:** Replaced the interface extension with an equivalent intersection type alias, preserving the existing optional quality-floor structural probe.
- **Files modified:** `packages/lattice-cli/src/eval/runner.ts`
- **Verification:** CLI typecheck and focused verify/repro tests pass.
- **Committed in:** `c915aca`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The type-only compatibility fix was necessary for the planned CLI gate and did not expand runtime behavior or public scope.

## Issues Encountered

- The first packed-consumer isolation assertion compared `/var/...` with macOS's real path `/private/var/...`. Resolving the consumer root before containment checks fixed the checker; the full pack/install/runtime/CLI flow then passed.
- The repository does not currently install a Prettier binary, so formatting verification used the existing TypeScript gates plus `git diff --check`.

## User Setup Required

None - the packed-package gate creates and cleans its own temporary consumer.

## Next Phase Readiness

- Plan 58-06 can wire named TypeScript, Python, reciprocal, oracle, and packed-package checks into CI.
- Replay and both CLI commands now expose the exact bridge state that CI and downstream migration automation need.
- No blockers remain.

## Self-Check: PASSED

- Task commits `7372ffe`, `c915aca`, and `9e8d340` exist.
- Materializer tests pass 9/9; CLI verify/repro tests pass 34/34.
- Lattice and CLI package typechecks pass.
- Full workspace build passes.
- `node scripts/check-protocol-package-consumer.mjs` passes against clean runtime and CLI tarballs.
- All nine implementation files are committed and diff-clean.

---
*Phase: 58-conformance-and-client-migration*
*Completed: 2026-07-16*
