---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Public Release + Canary Validation + Model-Aware SDK + Multi-Agent Surface
status: ready_to_plan
stopped_at: Phase 35 complete (2/2 plans); ready to plan Phase 36
last_updated: "2026-06-09T16:43:33Z"
last_activity: 2026-06-09 -- Phase 35 prompt scaffolding helpers implemented and verified
progress:
  total_phases: 16
  completed_phases: 8
  total_plans: 21
  completed_plans: 21
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 36 — output sanitizer hook (opt-in)

## Current Position

Phase: 36
Plan: Not started
Status: Ready to plan
Last activity: 2026-06-09 -- Phase 35 prompt scaffolding helpers implemented and verified

Progress: [█████░░░░░] 50% (8/16 v1.3 phases complete; 8 phases remaining)

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 31 (v1.0 + v1.1 + v1.2)
- v1.2 plans: 25 across 9 phases
- v1.3 completed phase plans: 21 across Phases 24, 25, 26, 33, 34, and 35; Phases 27 and 28 were externally/configuration driven with no per-plan files.
- Resets per milestone

**Recent Trend:**

- v1.2 milestone shipped 2026-05-31 with 9 phases, 25 plans, 46/46 REQ-IDs wired, 733/733 tests passing.
- v1.3 milestone opened 2026-06-03 and expanded to 16 phases after the model-capability registry and multi-agent surface were added. Current audited state: 8/16 phases complete, 42/68 authored REQ-IDs complete, 19 planned REQ-IDs still need to be authored for Phases 36-39.
- `@full-self-browsing/lattice@1.3.0-rc.0` and `@full-self-browsing/lattice-cli@1.3.0-rc.0` are live on npm with SLSA provenance attestations. Stable `1.3.0` is not published.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.3 Scope]: Public release + canary validation now also includes the model-aware SDK surface from Phases 33-38 and the opt-in multi-agent crew surface in Phase 39. Stable publish remains deferred until that surface is complete.
- [v1.3 Distribution]: Publish under `@full-self-browsing` scope (both `lattice` and `lattice-cli`). CLI keeps user-facing `lattice` bin. The scope is claimed and rc.0 packages are published.
- [v1.3 Auth model]: OIDC Trusted Publisher binding `fullselfbrowsing/Lattice` to the npm scope. No long-lived `NPM_TOKEN`. Provenance attestations are present on the rc.0 tarballs.
- [v1.3 Release trigger]: Tag-driven (`v*.*.*` push triggers workflow publish job). Changesets PR-driven version bumps.
- [v1.3 Canary]: Single separate-repo public consumer (`fullselfbrowsing/lattice-canary`). Installs from npm, not workspace. Two coverage layers: type+runtime exports against published tarball with fake providers (PR-time), and real-provider integration (OpenAI + Anthropic + Gemini) against published tarball (nightly + manual dispatch).
- [v1.3 Real-provider posture]: Nightly cron + manual dispatch only. Never PR-time. Per-run cost ceiling enforced via Lattice's own `CostTracker`.
- [v1.3 Phase plan]: 16 phases (24-39). Completed: 24, 25, 26, 27, 28, 33, 34, 35. Remaining: 36, 37, 38, 39, 29, 30, 31, 32.

### Pending Todos

- Phase 36: Author `SANITIZE` requirements, then plan the opt-in output sanitizer hook.
- Phase 37-39: Author the remaining planned REQ-ID groups (`VALID`, `RECEIPT12`, `DELEG`) before treating roadmap coverage as 87/87.
- Phase 29: Do not cut stable `1.3.0` until Phases 30, 31, and 36-39 are complete and verified.
- Phase 30: Canary repo bootstrap can run against `1.3.0-rc.0` while the remaining v1.3 implementation phases land.
- Phase 32: Cross-repo dispatch and milestone audit remain last; verify all 87 REQ-IDs once the missing groups are authored and implemented.

### Blockers/Concerns

- Stable `1.3.0` is not published; registry currently exposes `0.0.0-bootstrap.0` and `1.3.0-rc.0`.
- Canary repo work is not present in this repository's branches. Validate the separate `fullselfbrowsing/lattice-canary` repo before marking Phases 30-32 complete.
- Phases 36-39 have no implementation in any checked branch/tag as of the 2026-06-09 audit.
- GitHub Environment required-reviewer configuration and npm Trusted Publisher UI state are external to git. The rc.0 OIDC publish with provenance proves the path works, but the UI settings should still be rechecked before stable publish.
- Real-provider integration tests need API key secrets configured in the canary repo. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` to be set before nightly cron arms.
- First publish (Phase 28) succeeded as the smoke test of `release.yml`. Future publish risk moves to stable promotion and cross-repo dispatch.

## Quick Tasks Completed

| Date | Task | Outcome |
| --- | --- | --- |
| 2026-06-09 | Clean planning state after v1.3 code/registry audit | Reconciled `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, and `PROJECT.md` against code, git refs, and npm registry state. |
| 2026-06-09 | Execute Phase 35 prompt scaffolding helpers | Added deterministic prompt scaffold helpers, snapshots, fake-provider regressions, tsd/public-surface tests, and changeset. |

## Session Continuity

Last session: 2026-06-09T16:43:33Z
Stopped at: Phase 35 complete (2/2 plans); ready to plan Phase 36
Resume file: .planning/ROADMAP.md
