---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Public Release + Canary Validation
status: defining_requirements
stopped_at: Milestone v1.3 opened on 2026-06-03. PROJECT.md updated with Current Milestone section. STATE reset. Next step is requirements scoping then roadmap.
last_updated: "2026-06-03T00:00:00.000Z"
last_activity: 2026-06-03 — milestone v1.3 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-03)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Scope v1.3 (Public Release + Canary Validation). Requirements being defined.

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-06-03 — Milestone v1.3 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 31 (v1.0 + v1.1 + v1.2)
- v1.2 plans: 25 across 9 phases
- Resets per milestone

**Recent Trend:**

- v1.2 milestone shipped 2026-05-31 with 9 phases, 25 plans, 46/46 REQ-IDs wired, 733/733 tests passing.
- v1.3 milestone opened 2026-06-03; trend resets at first v1.3 plan completion.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.3 Scope]: Publish + canary only. Carryforward themes from v1.2 (native tool-use, `lattice eval --agent`, KMS adapters, lineage merkle, receipt diff, OTel exporter, streaming, multimodal) deferred to v1.4. Rationale: first public npm release is its own stress test.
- [v1.3 Distribution]: Publish under `@fullselfbrowsing` scope (both `lattice` and `lattice-cli`). CLI keeps user-facing `lattice` bin. Scope confirmed unclaimed via npm registry probe.
- [v1.3 Auth model]: OIDC Trusted Publisher binding `fullselfbrowsing/Lattice` to the npm scope. No long-lived `NPM_TOKEN`. Provenance attestations enabled.
- [v1.3 Release trigger]: Tag-driven (`v*.*.*` push triggers workflow). Changesets PR-driven version bumps.
- [v1.3 Canary]: Single separate-repo public consumer (`fullselfbrowsing/lattice-canary`). Installs from npm, not workspace. Two coverage layers: type+runtime exports against published tarball with fake providers (PR-time), and real-provider integration (OpenAI + Anthropic + Gemini) against published tarball (nightly + manual dispatch).
- [v1.3 Real-provider posture]: Nightly cron + manual dispatch only. Never PR-time. Per-run cost ceiling enforced via Lattice's own `CostTracker`.

### Pending Todos

- Step 8: Research decision (skip vs. parallel research agents).
- Step 9: Define REQUIREMENTS.md for v1.3.
- Step 10: Spawn gsd-roadmapper for v1.3 phase breakdown.
- Step 11: User-driven npm org registration + Trusted Publisher binding (executes during the relevant phase).
- Carryforward to v1.4: native tool-use, `lattice eval --agent`, KMS adapters, lineage merkle, receipt diff, OTel exporter, streaming, multimodal, OpenRouter routing, LM Studio diagnostics.

### Blockers/Concerns

- Package rename `lattice` → `@fullselfbrowsing/lattice` touches every import site (workspace + examples + tests). Surface is large but mechanical. publint + arethetypeswrong will catch regressions.
- `lattice-cli` ships `dependencies: { "lattice": "workspace:*" }`. pnpm rewrites `workspace:*` at publish time, but the rename phase must update the dep name itself before publint passes.
- No `.github/workflows/` exists at all in Lattice repo. CI scaffolding starts from zero (not a tweak of existing workflows).
- npm `@fullselfbrowsing` org creation requires user-driven sign-in on npmjs.com (no FSB credential saved). Trusted Publisher binding likewise. These steps cannot be fully automated; the relevant phase plan must hand the baton to the user at the right moment.
- Real-provider integration tests need API key secrets configured in the canary repo. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` to be set before nightly cron arms.

## Session Continuity

Last session: 2026-06-03
Stopped at: v1.3 milestone opened, PROJECT.md updated, STATE.md reset. Next is research decision + REQUIREMENTS.md scoping.
Resume file: None
