---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Protocol and Runtime Integrity Bridge
status: executing
last_updated: "2026-07-17T01:19:42.282Z"
last_activity: 2026-07-17
progress:
  total_phases: 6
  completed_phases: 2
  total_plans: 17
  completed_plans: 14
  percent: 33
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 59 — Authoritative Runtime State

## Current Position

Phase: 59 (Authoritative Runtime State) — EXECUTING
Plan: 7 of 9
Status: Ready to execute
Last activity: 2026-07-17

Progress: [████████░░] 82%

## Recent Milestone Snapshot

| Milestone | Status | Requirements | Audit |
|-----------|--------|--------------|-------|
| v1.5 Polyglot Receipt Protocol + Conformance Vectors + Python Client | Shipped 2026-07-06 | 26/26 complete | passed |
| v1.5.0 Modular Adoption + Execution Parity | Shipped 2026-06-20 | 30/30 complete | passed |

## Quick Tasks Completed

| Quick Task | Date | Summary |
|------------|------|---------|
| 260706-scq Refresh paper for v1.5 protocol and conformance | 2026-07-07 | Updated `paper/main.tex`, `paper/refs.bib`, and `spec/SPEC.md` for v1.5 protocol/conformance facts; built with `tectonic`. |
| 260706-tm8 Fix review findings: conformance vector sig encoding and package README docs | 2026-07-07 | Fixed NEG-01 DSSE signature encoding, regenerated vector manifest, and replaced shipped package READMEs with docs matching current package surfaces. |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

Recent decisions affecting v1.6:

- The receipt protocol is now language-neutral while the runtime SDK remains TypeScript-first.
- The committed conformance vector set is the drift anchor for TypeScript and non-TypeScript clients.
- The Python client ships in-repo first; PyPI publishing is deferred until the client surface stabilizes.
- Canonical mainline also shipped modular package subpaths, native provider execution, external audit helpers, standalone core preparation, and external-consumer validation at package version 1.5.1.
- v1.6 follows protocol -> conformance -> runtime state -> audit/cost -> agent evidence -> operational closure.
- Reconcile and validate `origin/main` before Phase 57 implementation; the six product phases begin at 57 so neither v1.5 history's phase numbers are reused.
- [Phase 57]: Python mint accepts only lattice-receipt/v1.4 with signed signatureProfile dsse-v1. — This keeps historical base64-PAE support read-only and prevents algorithm downgrade through issuance.
- [Phase 58]: Versioned specification and schemas are normative; production TypeScript source is non-normative. — External implementers must reproduce protocol behavior without reading production source.
- [Phase 58]: Standard vectors carry explicit schema, profile, deprecation, result, and adversarial-axis metadata. — Harnesses must not infer cryptographic semantics from directory names or filenames.
- [Phase 58]: Aggregate evidence uses exact recursive set equality before hash verification. — This rejects valid subsets, stale files, duplicate entries, unsafe paths, and symlink substitution.
- [Phase 58]: The normative fixture is byte-identical to the designated independently generated standard vector. — A single artifact identity prevents prose examples and executable conformance evidence from drifting.
- [Phase 58]: Cross-language conformance requires reciprocal minting with byte, CID, profile, and deprecation parity. — Shared static fixtures or boolean-only verification cannot detect one-sided issuance drift.
- [Phase 58]: securesystemslib 1.4.0 is a test-only oracle for upstream PAE and Ed25519 signatures. — Lattice retains authority over canonical base64, schema, key state, signed kid, and legacy policy.
- [Phase 58]: CLI compatibility remains allow-by-default while --standard-only maps to the shared reject policy at every verification boundary. — One derived policy keeps verify and replay behavior consistent and prevents strict-mode side effects.
- [Phase 58]: Profile and deprecation output comes directly from VerifyOk; commands never infer cryptographic semantics from receipt versions. — Verifier-owned metadata keeps migration automation exact as receipt versions and accepted profiles evolve.
- [Phase 58]: Release smoke tests install runtime and CLI tarballs into a clean ESM project and exercise only declared public exports and the packed binary. — Workspace resolution can mask missing exports, dependency rewrites, and binary wiring defects.
- [Phase 58]: Conformance remains one least-privilege Node 24/Python 3.13 job; ordered named steps provide drift attribution without a broader runtime matrix. — Phase 58 needs identifiable protocol failures, while Phase 62 owns cross-version and provider-wire coverage.
- [Phase 58]: Python product conformance and the exact securesystemslib oracle run as separate CI steps. — Separate steps distinguish Lattice behavior drift from upstream DSSE PAE/signature drift.
- [Phase 58]: Reciprocal minting and exact aggregate coverage use dedicated non-watch package scripts. — Stable command names keep local and CI validation identical and prevent accidental watch-mode gates.
- [Phase 59]: Session branches inherit parent tenant/privacy/retention exactly and reject explicit scope changes. — This prevents scoped runs from silently adopting legacy or mismatched history.
- [Phase 59]: ExecutionPlan.artifactRefs remains declared history while ContextProjectionPlan records provider-visible evidence. — Compatibility and execution authority remain independently inspectable.
- [Phase 59]: Context materialization and persistence failures are terminal bounded public variants. — Fallback cannot repair policy/storage failures and must not expose raw causes.
- [Phase 59]: Store-returned artifact refs are authoritative and hashes remain separate evidence. — This prevents the runtime from fabricating storage scope or fingerprints after persistence.
- [Phase 59]: Reference-only artifacts bypass writes only after exact store, tenant, and retention checks plus non-downgraded privacy validation. — Existing refs must not cross scope boundaries or silently weaken policy.
- [Phase 59]: Context classification is stable-first and materialization loads only IDs named by included items. — This prevents summarized, archived, or unselected session artifacts from re-entering the provider projection.
- [Phase 59]: Missing stored context fails by default; explicit omit rewrites the final pack atomically with bounded warnings. — Plans and provider-visible content must agree even when compatibility policy permits unavailable refs to be skipped.
- [Phase 59]: Projection identity hashes route identity plus ordered artifact ID and input-hash pairs. — Plans and events can correlate exact provider-visible evidence without carrying raw content.
- [Phase 59]: Planning and primary execution consume one prepared materialized projection. — A single preparation authority prevents declared or omitted artifacts from bypassing route-specific context policy.
- [Phase 59]: Projection evidence is redacted at plan and attempt replay boundaries. — Store-returned references can contain signed URLs and must not leak through newly added evidence fields.
- [Phase 59]: Every fallback rebuilds route-local context and packaging from shared prepared inputs. — Only transforms, tools, and input persistence are route-independent; context budgets, summaries, hashes, and transport are attempt-specific.
- [Phase 59]: Receipts and telemetry bind to frozen attempt projection evidence. — Ordered hashes and bounded projection metadata must describe the adapter call they claim without leaking content or tenant/storage secrets.
- [Phase 59]: Provider outputs persist before session append or ordinary success. — A billable successful call must not be retried or reported as persisted when a required output write fails.
- [Phase 59]: Session continuity records only resolvable exact refs and validates append results. — Unconfigured or retention-none storage can preserve task and plan continuity but must not claim unavailable artifacts.

### Pending Todos

- Plan Phase 57 with `$gsd-plan-phase 57` after confirming the repository precondition.

### Blockers / Concerns

- Repository precondition: reconcile and validate `origin/main` before Phase 57 implementation.
- Phase 57 planning must lock exact profile fields/literals and entrypoint-specific legacy defaults.
- Phase 59 planning must audit tenant/privacy/retention, fallback budgets, summarizer eligibility, and storage failure semantics.
- Phase 61 planning must define stable iteration identity and crew receipt ownership; Phase 62 planning must select bounded canary credentials and spend policy.

## Deferred Items

Items deferred at v1.4 milestone close (2026-06-16) that remain informational only:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260422-gle-create-lattice-readme-matching-existing- | missing (stale index entry) |
| quick_task | 260609-ewo-clean-planning-state-after-v1-3-code-reg | missing (stale index entry) |
| quick_task | 260615-5m0-author-ieee-latex-paper-on-lattice-capab | missing (stale index entry) |
| quick_task | 260615-689-polish-lattice-paper-mention-lattice-in- | missing (stale index entry) |
| quick_task | 260615-6t9-record-fsb-via-npm-dogfood-validation-an | missing (stale index entry) |
| quick_task | 260615-7qq-update-paper-author-name-to-lakshman-tur | missing (stale index entry) |
| quick_task | 260615-ei0-capitalize-t-in-paper-author-last-name-a | missing (stale index entry) |

## Operator Next Steps

- Reconcile and validate `origin/main` against the working branch.
- `$gsd-plan-phase 57` - plan Protocol Semantics after the repository precondition passes.

## Performance Metrics

| Phase | Plan | Duration | Notes |
|-------|------|----------|-------|
| Phase 58 P01 | 9min | 2 tasks | 17 files |
| Phase 58 P02 | 12min | 2 tasks | 23 files |
| Phase 58 P03 | 8min | 2 tasks | 7 files |
| Phase 58 P04 | 15min | 3 tasks | 11 files |
| Phase 58 P05 | 15min | 3 tasks | 9 files |
| Phase 58 P06 | 9min | 3 tasks | 5 files |
| Phase 59 P01 | 12 min | 1 tasks | 9 files |
| Phase 59 P02 | 9 min | 1 tasks | 8 files |
| Phase 59 P03 | 17 min | 2 tasks | 6 files |
| Phase 59 P04 | 30min | 2 tasks | 7 files |
| Phase 59 P05 | 29min | 2 tasks | 8 files |
| Phase 59 P06 | 18min | 2 tasks | 5 files |
