---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Public Release + Canary Validation + Model-Aware SDK + Multi-Agent Surface
status: Awaiting next milestone
stopped_at: Phase 30 ready - canary bootstrap next
last_updated: "2026-06-15T07:55:49.222Z"
last_activity: 2026-06-15 — Milestone v1.3 completed and archived
progress:
  total_phases: 16
  completed_phases: 10
  total_plans: 42
  completed_plans: 44
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-09)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 30 — Canary Bootstrap + Layer 1 Fake-Provider Suite

## Current Position

Phase: Milestone v1.3 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-15 — Milestone v1.3 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 31 (v1.0 + v1.1 + v1.2)
- v1.2 plans: 25 across 9 phases
- v1.3 completed phase plans: 42 across Phases 24, 25, 26, 29, 33, 34, 35, 36, 37, 38, and Phase 39 plans 1-8; Phases 27 and 28 were externally/configuration driven with no per-plan files.
- Resets per milestone

**Recent Trend:**

- v1.2 milestone shipped 2026-05-31 with 9 phases, 25 plans, 46/46 REQ-IDs wired, 733/733 tests passing.
- v1.3 milestone opened 2026-06-03 and expanded to 16 phases after the model-capability registry and multi-agent surface were added. Current audited state: 13/16 phases complete; Phase 29 and Phase 39 are fully complete and the remaining work is Phases 30-32.
- `@full-self-browsing/lattice@1.3.0` and `@full-self-browsing/lattice-cli@1.3.0` are live on npm with SLSA provenance attestations and `latest` dist-tags. GitHub Release `v1.3.0` exists.

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
- [v1.3 Phase plan]: 16 phases (24-39). Completed: 24, 25, 26, 27, 28, 29, 33, 34, 35, 36, 37, 38, 39. Remaining: 30, 31, 32.
- [v1.3 Adapter hardening]: Output sanitizers and returned tool-call validators are opt-in adapter options, preserving default v1.2 behavior while giving consumers model-shape guardrails.

### Pending Todos

- None carried forward. The Phase 30/32 canary todos were superseded at v1.3 close — FSB-via-npm dogfooding replaces the synthetic canary. v1.4 todos will be authored during milestone planning.

### Blockers/Concerns

- None open. v1.3's canary-related blockers (separate canary repo, real-provider API-key secrets, cross-repo dispatch) were resolved by supersession — FSB-via-npm dogfooding replaces the synthetic canary. The v1.3.0 publish and GitHub Release `v1.3.0` are complete.
- Residual (tracked for v1.4): packaging-integrity validation of the published tarball now relies on FSB's npm consumption rather than an isolated, exhaustive canary; an unused public export could regress silently. Revisit a thin packaging canary if FSB coverage proves insufficient.

## Deferred Items

Acknowledged and deferred at v1.3 milestone close on 2026-06-15:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260422-gle-create-lattice-readme-matching-existing- | missing (stale index entry) |
| quick_task | 260609-ewo-clean-planning-state-after-v1-3-code-reg | missing (stale index entry) |

The Phase-25 partial human-UAT and one verification gap moved into `milestones/v1.3-phases/` with the archive and are documented in `milestones/v1.3-MILESTONE-AUDIT.md`.

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
| 2026-06-11 | Execute Phase 29 wave 1 and plan 02 local preflight | Added stable README/release-note extraction, refreshed stale model registry snapshot, passed full local release preflight, and stopped at GitHub Actions workflow permission checkpoint. |
| 2026-06-11 | Resolve Phase 29 GitHub Actions workflow permission gate | Used FSB + GitHub device flow to refresh `gh` with `admin:org`, enabled org and repo `can_approve_pull_request_reviews`, and verified both settings true. |
| 2026-06-11 | Complete Phase 29 stable v1.3.0 publish | Merged Version Packages PR #8, pushed `v1.3.0`, approved `npm-publish`, verified both npm packages at `1.3.0` with signatures/provenance, repaired GitHub Release notes, and closed PUB-02..04. |

## Session Continuity

Last session: 2026-06-11T21:12:48Z
Stopped at: Phase 30 ready - canary bootstrap next
Resume file: .planning/ROADMAP.md (Phase 30 section; Phase 30 artifacts not generated yet)

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
