---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: FSB Integration + Agent Capability
status: shipped
stopped_at: v1.2.0 shipped on 2026-05-31. Audit + integration archived to .planning/milestones/v1.2-*. 9 phases, 25 plans, 46/46 REQ-IDs WIRED, 733/733 workspace tests passing. v1.2 branch merged to main via PR #1 (merge commit 5ca3e33); tag v1.2.0 pushed to origin (30067ba). Brand assets shipped under assets/ (mark, wordmark, app icon, favicons, social card, animated spin GIF). README rewritten for v1.2 surface. Ready for /gsd-new-milestone (v1.3).
last_updated: "2026-06-03T00:00:00.000Z"
last_activity: 2026-06-03 — v1.2 milestone archived
progress:
  total_phases: 10
  completed_phases: 10
  total_plans: 31
  completed_plans: 31
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-11)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 21 — Agent Infrastructure Primitives (cost tracker, transcript store, goal-progress tracker, action-history dedup, permission context). All compose with the Phase 19 agent runtime and Phase 20 host seams.

## Current Position

Phase: 21
Plan: Not started
Status: Phase 20 closed. Phase 21 next (AGENT-INFRA-01..04 + PERM-01).
Last activity: 2026-05-31

Progress: [███████░░░] 70%

### Completed Phases (v1.2 / Track A)

- Phase 14 — Public Surface Index + Packaging Readiness — merge commit a4c2dc3 — REQ-IDs closed: INDEX-01, PKG-01 (2)
- Phase 15 — Receipt v1.1 Schema Extension + Tripwire Band Pipeline + Lifecycle Events — merge commit a51262a — REQ-IDs closed: RECEIPT-EXT-01..03, BAND-01..05, LIFECYCLE-01, INDEX-02 (10)
- Phase 16 — Step-Transition Tracing + Checkpoint Hook — merge commit 103a2ac — REQ-IDs closed: TRACE-01, CHECKPOINT-01..04, INDEX-03 (6)
- Phase 17 — Provider Adapter Alignment + INV-03 Parity Smoke — merge commit 4391a70 — REQ-IDs closed: PROV-01..05, INDEX-04, PARITY-01 (7)
- Phase 18 — Survivability Adapter Contract — merge commit 03d7f72 — REQ-IDs closed: SURV-01..04, INDEX-05 (5). TRACE-EXT-01 deferred to Track B Phase 20.
- Phase 19 — Delegation Surface Policy Flip + Agent Runtime Entrypoint — plans 19-01..05 committed inline on v1.2 — REQ-IDs closed: DELEG-01, AGENT-01..04 (5). Native tool_use deferred to Phase 20 AgentHost transport seam.
- Phase 20 — Pluggable AgentHost Adapter + TRACE-EXT-01 — plans 20-01..03 committed inline on v1.2 (3794896 + aaab2bf) — REQ-IDs closed: HOST-01..03, TRACE-EXT-01 (4). Full eviction-resume contract verified end-to-end with real Ed25519 receipt verification across simulated process boundary.

**Track A total: 30 REQ-IDs closed across 23 originating commits (cherry-picked from FSB v0.10.0-attempt-2 Phases 1-5).**

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 11 (v1.0)
- Average duration: 5min
- Total execution time: 0.9 hours (v1.0)

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| (v1.1 phases not started) | 0 | 0 | — |
| 07 | 4 | - | - |
| 08 | 2 | - | - |
| 09 | 4 | - | - |
| 10 | 1 | - | - |
| 11 | 3 | - | - |
| 12 | 3 | - | - |
| 13 | 2 | - | - |
| 13.1 | 3 | - | - |
| 13.2 | 2 | - | - |

**Recent Trend:**

- v1.0 milestone shipped on 2026-04-22 with 11 plans across 6 phases.
- v1.1 milestone started 2026-05-11; trend resets at first v1.1 plan completion.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.2 Roadmap]: Phase numbering continues from v1.1 (which ended at Phase 13.2). v1.2 starts at Phase 14 and spans Phases 14-23.
- [v1.2 Roadmap]: Milestone splits into two tracks. Track A (Phases 14-18) is retro — code already on `local-fsb-integration` branch (HEAD `e95067b`, 23 commits, 414 vitest PASS) from FSB v0.10.0-attempt-2 Phases 1-5. Each phase backfills GSD artifacts and merges via `--no-ff` into the `v1.2` branch. Track B (Phases 19-23) is forward — opens the Delegation surface via a runtime-agnostic agent capability.
- [v1.2 Roadmap]: Track A history brought in via phase-grouped `--no-ff` merges (chosen over single-branch merge or cherry-pick) to preserve the 5 phase boundaries as readable merge commits matching `LATTICE-PIN.md` rows.
- [v1.2 Roadmap]: Agent capability ships as runtime-agnostic — no coupling to `chrome.*`, `importScripts`, or service-worker idioms. Pluggable AgentHost adapter (scheduler/transport/storage seams) composes with the SurvivabilityAdapter shipped in Phase 18.
- [v1.2 Roadmap]: Multi-agent crews stay Out of Scope; v1.2 opens the single-agent surface only. PROJECT.md Out of Scope section updated to reflect the narrowed scope.
- [v1.2 Stage 5]: Distribution model is git submodule pinned at the `v1.2.0` tag (FSB consumes via `file:./lattice/packages/lattice` against the submodule). npm publish of `@fullselfbrowsing/lattice@1.2.0` deferred until at least one external consumer asks.

### Pending Todos

- Stage 3: Land Track A as 5 phase-grouped merges (Phases 14-18) into v1.2 branch.
- Stage 4: `/gsd-discuss-phase 19` for Track B Phase 19 (agent runtime entrypoint + delegation policy flip).
- Stage 5: Tag v1.2.0, push to fullselfbrowsing/Lattice, switch FSB automation branch to git submodule pinned at the tag.

### Blockers/Concerns

- Track A merge risk: 23 commits authored before v1.1 sub-phases 13.1 + 13.2 landed in canonical main. Divergence point verified clean (`8fa7b03` v1.1 close), but TypeScript strict checks may surface incidental friction. Mitigation: `pnpm test` after each `--no-ff` merge; revert + rebase if a phase merge breaks.
- Track A `dist/` regeneration: original commits regenerated `dist/` locally per phase (commits say "dist rebuilt via tsdown clean:true"). Canonical Lattice gitignores `dist/`. Verify `.gitignore` matches before merging.
- Track B open questions captured in `.planning/milestones/v1.2-ROADMAP.md` Risks section: agent runtime entrypoint shape (`ai.runAgent(...)` method vs. separate `createAgent(...)` factory), tool registry surface (reuse v1.0 `defineTool` vs. new `AgentToolRegistry`). Resolve during `/gsd-discuss-phase 19`.

## Session Continuity

Last session: 2026-05-31
Stopped at: v1.2 milestone artifacts drafted (REQUIREMENTS + ROADMAP + top-level ROADMAP + PROJECT + this STATE). `local-fsb-integration` branch mirrored into canonical Lattice from `automation/lattice/`. Stage 3 (phase-grouped merges) next.
Resume file: None
