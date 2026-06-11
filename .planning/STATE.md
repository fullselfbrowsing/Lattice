---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Public Release + Canary Validation + Model-Aware SDK + Multi-Agent Surface
status: executing
stopped_at: Phase 29 plan 01 complete
last_updated: "2026-06-11T17:02:23.109Z"
last_activity: 2026-06-11 -- Phase 29 plan 01 complete
progress:
  total_phases: 16
  completed_phases: 12
  total_plans: 42
  completed_plans: 38
  percent: 75
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 29 — First v1.3.0 Stable Publish

## Current Position

Phase: 29 (First v1.3.0 Stable Publish) — EXECUTING
Plan: 2 of 4 (next: 29-02 local release preflight + Version Packages PR readiness)
Status: Wave 1 complete; awaiting Wave 2 release-preflight checkpoint
Last activity: 2026-06-11 -- Phase 29 plan 01 complete

Progress: [████████░░] 75% (12/16 v1.3 phases complete; 4 phases remaining)

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 31 (v1.0 + v1.1 + v1.2)
- v1.2 plans: 25 across 9 phases
- v1.3 completed phase plans: 38 across Phases 24, 25, 26, 33, 34, 35, 36, 37, 38, and Phase 39 plans 1-8; Phases 27 and 28 were externally/configuration driven with no per-plan files.
- Resets per milestone

**Recent Trend:**

- v1.2 milestone shipped 2026-05-31 with 9 phases, 25 plans, 46/46 REQ-IDs wired, 733/733 tests passing.
- v1.3 milestone opened 2026-06-03 and expanded to 16 phases after the model-capability registry and multi-agent surface were added. Current audited state: 12/16 phases complete; Phase 39 is fully complete and the remaining work is Phases 29-32.
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
- [v1.3 Phase plan]: 16 phases (24-39). Completed: 24, 25, 26, 27, 28, 33, 34, 35, 36, 37, 38, 39. Remaining: 29, 30, 31, 32.
- [v1.3 Adapter hardening]: Output sanitizers and returned tool-call validators are opt-in adapter options, preserving default v1.2 behavior while giving consumers model-shape guardrails.

### Pending Todos

- Phase 29: Execute stable `1.3.0` publish only after release preflight passes and GitHub Actions can create the Version Packages PR.
- Phase 30: Canary repo bootstrap can run against `1.3.0-rc.0` while the remaining v1.3 implementation phases land.
- Phase 32: Cross-repo dispatch and milestone audit remain last; verify all 87 REQ-IDs once the missing groups are authored and implemented.

### Blockers/Concerns

- Stable `1.3.0` is not published; registry currently exposes `0.0.0-bootstrap.0` and `1.3.0-rc.0`.
- Canary repo work is not present in this repository's branches. Validate the separate `fullselfbrowsing/lattice-canary` repo before marking Phases 30-32 complete.
- GitHub Environment required-reviewer configuration and npm Trusted Publisher UI state are external to git. The rc.0 OIDC publish with provenance proves the path works, but the UI settings should still be rechecked before stable publish.
- Real-provider integration tests need API key secrets configured in the canary repo. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` to be set before nightly cron arms.
- First publish (Phase 28) succeeded as the smoke test of `release.yml`. Future publish risk moves to stable promotion and cross-repo dispatch.

## Quick Tasks Completed

| Date | Task | Outcome |
| --- | --- | --- |
| 2026-06-09 | Clean planning state after v1.3 code/registry audit | Reconciled `STATE.md`, `ROADMAP.md`, `REQUIREMENTS.md`, and `PROJECT.md` against code, git refs, and npm registry state. |
| 2026-06-09 | Execute Phase 35 prompt scaffolding helpers | Added deterministic prompt scaffold helpers, snapshots, fake-provider regressions, tsd/public-surface tests, and changeset. |
| 2026-06-09 | Execute Phase 36 output sanitizer hook | Added opt-in `sanitizeOutput` across 7 adapters, built-in sanitizers, all-seven parity tests, tsd/public-surface coverage, and changeset. |
| 2026-06-09 | Plan Phase 37 tool-call validation layer | Authored VALID requirements, inline research/pattern map, and 3 execution plans after GSD subagent research failed with `Unsupported service_tier: flex`. |
| 2026-06-09 | Execute Phase 37 tool-call validation layer | Added opt-in returned tool-call validation across all 7 adapters, normalized `ProviderRunResponse.toolCalls`, runtime preference for validated calls, all-seven parity tests, package type tests, and changeset. |
| 2026-06-09 | Verify Phase 37 UAT | Completed conversational UAT with 4/4 checkpoints passed and 0 issues. |
| 2026-06-09 | Plan Phase 38 receipt v1.2 schema + modelClass tag | Authored RECEIPT12 requirements, inline research/pattern map, validation strategy, and 3 execution plans. |
| 2026-06-09 | Execute Phase 38 receipt v1.2 schema + modelClass tag | Added receipt v1.2 `modelClass`, runtime strict registry issuance, public type tests, changeset, and final verification gates. |
| 2026-06-11 | Execute Phase 39 plan 06 runAgentCrew orchestrator | Added `runAgentCrew`, `createAI().runAgentCrew`, public crew/rate-limit/CID exports, and public integration tests. |
| 2026-06-11 | Execute Phase 39 plan 07 agent crew showcase | Added `examples/agent-crew/` with built-dist receipt verification plus `evalAgentRun` crew regression coverage. |
| 2026-06-11 | Execute Phase 39 plan 08 public-contract closure | Flipped AGENTS/gap-row docs, added crew `tsd` coverage, staged changeset, and passed full phase gates. |

## Session Continuity

Last session: 2026-06-11T17:07:14Z
Stopped at: Phase 29 plan 01 complete
Resume file: .planning/phases/29-first-v1-3-0-stable-publish/29-02-PLAN.md
