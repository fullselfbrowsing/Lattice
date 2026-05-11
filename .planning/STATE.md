---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Capability Receipts
status: in_progress
stopped_at: Milestone v1.1 started — defining requirements
last_updated: "2026-05-11T00:00:00.000Z"
last_activity: 2026-05-11
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Milestone v1.1 — Capability Receipts (contracts, signed receipts, prod-to-laptop repro, eval CI gate)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-05-11 — Milestone v1.1 started

Progress: [          ] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 7
- Average duration: 5min
- Total execution time: 0.58 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-runtime-api-output-contracts | 4 | 21min | 5.25min |
| 02-artifact-lifecycle-storage | 3 | 14min | 4.67min |

**Recent Trend:**

- Last 5 plans: 5min, 6min, 4min, 5min, 5min
- Trend: stable

*Updated after each plan completion*
| Phase 01-runtime-api-output-contracts P01 | 6min | 2 tasks | 12 files |
| Phase 01-runtime-api-output-contracts P02 | 4min | 2 tasks | 9 files |
| Phase 01-runtime-api-output-contracts P03 | 5min | 3 tasks | 6 files |
| Phase 01-runtime-api-output-contracts P04 | 6min | 3 tasks | 8 files |
| Phase 02-artifact-lifecycle-storage P01 | 4min | 2 tasks | 7 files |
| Phase 02-artifact-lifecycle-storage P02 | 5min | 2 tasks | 13 files |
| Phase 02-artifact-lifecycle-storage P03 | 5min | 2 tasks | 9 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Use six coarse phases, compressing the eight research slices while preserving the critical order: contracts, artifacts, planning/execution, context/providers, tools/replay/observability, showcase.
- [Coverage]: Requirement coverage is based on the 54 concrete v1 requirement IDs found in REQUIREMENTS.md.
- [Phase 01-runtime-api-output-contracts]: Use local package name lattice with named exports prepared through an explicit ESM export map.
- [Phase 01-runtime-api-output-contracts]: Set tsdown fixedExtension to false so emitted files match the package export contract.
- [Phase 01-runtime-api-output-contracts]: Use Vitest runtime/typecheck plus tsd declaration tests for repeatable scaffold verification.
- [Phase 01-runtime-api-output-contracts]: Keep provider, storage, tracing, session, and artifact contracts owned by Lattice and free of provider SDK types.
- [Phase 01-runtime-api-output-contracts]: Normalize string providers into ProviderRef entries while preserving ProviderRef and ProviderAdapter objects unchanged.
- [Phase 01-runtime-api-output-contracts]: Limit artifact helpers to Phase 1 reference construction; no file IO, hashing, MIME sniffing, upload behavior, storage, or lineage.
- [Phase 01-runtime-api-output-contracts]: Represent disabled storage and tracing as absent normalized config values when users pass false.
- [Phase 01-runtime-api-output-contracts]: Use literal "text" for plain text output contracts rather than adding output.text() or a single-output shortcut.
- [Phase 01-runtime-api-output-contracts]: Use Standard Schema as the validation boundary so Zod and compatible validators share one code path.
- [Phase 01-runtime-api-output-contracts]: Return validation failures as RunResult ok:false objects with issue details, raw outputs, partial outputs, and the provided plan.
- [Phase 01-runtime-api-output-contracts]: Select the first configured Phase 1 provider adapter with execute() and return execution_unavailable when none exists.
- [Phase 01-runtime-api-output-contracts]: Expose createAI, artifact, output, and public runtime/result/config types as named exports only from lattice.
- [Phase 01-runtime-api-output-contracts]: Configure tsd to resolve the package self-import from lattice to the built declaration entrypoint for package-boundary tests.
- [Phase 02-artifact-lifecycle-storage]: Artifact constructors stay synchronous and IO-free; file paths are never read or statted during construction.
- [Phase 02-artifact-lifecycle-storage]: Path and Blob media inference is best-effort metadata only, with caller overrides preserved.
- [Phase 02-artifact-lifecycle-storage]: Lineage stores transform descriptors and payload-free parent refs without implementing provider packaging or media transforms.
- [Phase 02-artifact-lifecycle-storage]: Artifact storage now separates metadata refs from payload loading through get/list versus load.
- [Phase 02-artifact-lifecycle-storage]: Stored artifacts attach concrete store/key refs and SHA-256 fingerprints without changing public artifact IDs.
- [Phase 02-artifact-lifecycle-storage]: Local filesystem storage uses inspectable metadata.json envelopes plus payload.json or payload.bin files.
- [Phase 02-artifact-lifecycle-storage]: Provider/output artifact boundaries normalize payload-bearing refs to payload-free ArtifactRef before public results.
- [Phase 02-artifact-lifecycle-storage]: Public lattice exports now include artifact lifecycle, lineage, storage contracts, and memory/local store factories as named exports.
- [Phase 03-deterministic-planning-execution-spine]: Runtime now exposes `ai.plan(...)` and stable execution-plan JSON with deterministic route candidates, fallback chains, stages, warnings, estimates, attempts, and typed no-route results.
- [Phase 03-deterministic-planning-execution-spine]: Fake providers execute through the same provider-independent runtime path as real adapters and emit typed run events.
- [Phase 04-context-sessions-provider-packaging]: Sessions, context packs, provider attempts, artifact storage, and execution plans are modeled as separate state records.
- [Phase 04-context-sessions-provider-packaging]: Provider packaging records policy-safe transport choices and provider-packaging lineage refs before adapter execution.
- [Phase 05-tools-replay-observability]: Local and MCP-like tools validate inputs and return artifact-backed tool-result artifacts.
- [Phase 05-tools-replay-observability]: Replay envelopes are redacted by default and can be replayed offline or rerun live with drift warnings.
- [Phase 06-work-inbox-showcase]: The work-inbox showcase runs through the public package entrypoint with deterministic fixtures and prints route/context/packaging/replay inspection data.

### Pending Todos

None yet.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260422-gle | Create Lattice README matching existing repo style | 2026-04-22 | 20c95c3 | [260422-gle-create-lattice-readme-matching-existing-](./quick/260422-gle-create-lattice-readme-matching-existing-/) |

## Session Continuity

Last session: 2026-04-22T18:00:30.264Z
Stopped at: Milestone v1.0 completed, audited, and archived
Resume file: None
