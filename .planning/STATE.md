---
gsd_state_version: 1.0
milestone: v1.6
milestone_name: Protocol and Runtime Integrity Bridge
status: verifying
last_updated: "2026-07-20T14:37:42.408Z"
last_activity: 2026-07-20
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 31
  completed_plans: 31
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-16)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 62 — Operational Interop and Hygiene

## Current Position

Phase: 62 (Operational Interop and Hygiene) — COMPLETE
Plan: 4 of 4
Status: Phase verified — ready for milestone audit
Last activity: 2026-07-20

Progress: [██████████] 100%

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
- [Phase 59]: Replay evidence is reconstructed from explicit safe fields. — Post-hoc key filtering cannot safely cover nested attempt, lineage, packaging, lifecycle, and arbitrary metadata surfaces.
- [Phase 59]: Telemetry accepts bounded authority classes and real persistence status only. — Closed sets prevent raw event strings from becoming span data while completed, skipped, and failed lifecycle outcomes remain inspectable.
- [Phase 59]: Authoritative materialization is a modular value and a root type contract. — The beginner root stays small while context and core consumers avoid deep imports.
- [Phase 59]: Lifecycle evidence is public; lifecycle failures and orchestration remain internal. — Stable reports are required by MaterializedContext without exposing raw causes or persistence helpers.
- [Phase 59]: Provider request order is the closure anchor for authoritative evidence. — Projection refs, packaging, attempt hashes, receipt hashes, and event identity must describe the exact adapter call in the same order.
- [Phase 59]: Session scope conflicts fail before artifact access or provider execution. — Tenant, privacy, and retention metadata is the first authorization boundary for persisted conversational context.
- [Phase 60]: Hard cost ceilings reject unknown estimates and known overages, while exact equality passes. — Route policy and capability contracts must make identical decisions from the same structured estimate.
- [Phase 60]: Structured cost evidence distinguishes known zero from unknown and retains per-dimension pricing provenance. — Execution plans and diagnostics must expose the facts actually used for deterministic selection without treating missing rates as free.
- [Phase 60]: Provider-reported non-null cost remains authoritative; configured pricing fills only absent cost from actual token counts. — One post-execution authority prevents estimates from replacing billed usage.
- [Phase 60]: Hard agent and crew ceilings require a known next-call estimate and reject projected overage before transport; equality passes. — Predictable budget failures must occur before billable provider work.
- [Phase 60]: Nested crew dispatch inherits every active ancestor's local cost. — Completed-run accounting alone cannot protect a shared pool while serial ancestors are suspended.
- [Phase 60]: Accumulated cost comparisons tolerate one ULP while direct single-estimate comparisons remain strict. — This preserves mathematical equality without weakening materially over-budget decisions.
- [Phase 60]: Cross-surface receipt evidence observes signer and provider call counts without adding Phase 61 receipt collectors. — This closes Phase 60 policy guarantees without preempting the stable identity and attachment contract owned by Phase 61.
- [Phase 60]: CLI integration files run serially because process cwd and dynamic package mocks are process-wide state. — Serialized files make the full CLI gate deterministic while preserving the deliberate process-level integration behavior.
- [Phase 60]: Showcase baseline tests partition evaluable success receipts while separately proving the full mixed set exits 2 without writing. — Strict evaluation must reject failure-class receipts with null output hashes and must never initialize a baseline from invalid input.
- [Phase 61]: Managed agent checkpoints execute after the caller pipeline through one invocation-local runner. — This preserves caller hook order while preventing automatic signer accumulation on reused pipelines.
- [Phase 61]: Terminal finalization attaches the issued envelope before successful host state is cleared. — The returned result and durable boundary must expose the exact final evidence before completed state is discarded.
- [Phase 61]: New agent-snapshot/v1 writes persist both executionId and the complete available iteration ledger. — A paired identity and ledger lets resume append without reminting while preserving historical v1 literals.
- [Phase 61]: Invalid present snapshots remain stored and return bounded recovery failure without signing or transport. — Clearing invalid evidence would allow a later invocation to silently restart and duplicate completed work.
- [Phase 61]: Agent runtime terminal envelopes are the only parent and child crew completion evidence. — One issuer preserves exact public identity and removes replacement signatures.
- [Phase 61]: Crew CIDs are indexed at collection under the known agent ID. — Direct ownership avoids decoding signed payloads and guarantees each CID hashes the exposed envelope.
- [Phase 61]: Public closure evidence combines real Ed25519 verification with bounded generated resume and crew cases. — Black-box cryptographic and work-count assertions prove the public contract without relying on private observers.
- [Phase 61]: Historical agent iteration and snapshot literals remain source compatible. — The new identity, ledger, and envelope fields stay optional at packed root and agents entrypoints.
- [Phase 62]: Adapter output ceilings remain additive and preserve omitted defaults. — Ordinary consumers keep established request behavior while the canary selects an explicit bound.
- [Phase 62]: Canary cost uses configured token pricing and fails closed on higher provider-reported cost. — Provider billing evidence may raise but cannot lower the bounded spend verdict.
- [Phase 62]: Retained canary evidence is rebuilt from an explicit field allowlist. — Credentials, URLs, headers, prompts, outputs, raw errors, and receipt payloads never enter the report surface.
- [Phase 62]: Production comment hygiene scans only repository-owned comment syntax with narrow reasoned exclusions and no baseline or suppression mechanism. — Comment-aware zero-baseline enforcement prevents workflow chronology without matching strings, generated output, or archived history.
- [Phase 62]: Production comment rewrites preserve durable security, protocol, provider-wire, concurrency, and compatibility rationale. — Deleting all comments would lose constraints; contextual rewrites remove chronology while retaining the engineering reason.
- [Phase 62]: SDK 1.6.0 remains independent from receipt schema v1.4. — All new issuance stays standard-only while bounded historical verification remains an explicit observable read policy.
- [Phase 62]: Packed consumers are the deterministic distribution authority; live canaries are optional operational evidence. — Isolated tarball validation is stable and complete across Node 24 and 26, while protected provider calls are scheduled or manual and cost-bounded.

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
| Phase 59 P07 | 20min | 2 tasks | 6 files |
| Phase 59 P08 | 20min | 1 tasks | 9 files |
| Phase 59 P09 | 18min | 1 tasks | 5 files |
| Phase 60 P01 | 14min | 2 tasks | 14 files |
| Phase 60 P03 | 6 | 2 tasks | 5 files |
| Phase 60 P02 | 22 | 2 tasks | 14 files |
| Phase 60 P04 | 18min | 2 tasks | 15 files |
| Phase 60 P05 | 22min | 2 tasks | 18 files |
| Phase 60 P06 | 18min | 1 tasks | 10 files |
| Phase 61 P01 | 7min | 2 tasks | 4 files |
| Phase 61 P02 | 8min | 2 tasks | 5 files |
| Phase 61 P03 | 5min | 2 tasks | 6 files |
| Phase 61 P04 | 12min | 1 tasks | 7 files |
| Phase 62 P01 | 9 min | 2 tasks | 11 files |
| Phase 62 P02 | 45 min | 2 tasks | 11 files |
| Phase 62 P03 | 44 min | 2 tasks | 82 files |
| Phase 62 P04 | 16 min | 2 tasks | 17 files |
