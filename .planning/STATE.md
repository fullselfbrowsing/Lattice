---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Public Release + Canary Validation
status: executing
stopped_at: Phase 25 context gathered
last_updated: "2026-06-06T03:37:19.123Z"
last_activity: 2026-06-04
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 3
  completed_plans: 3
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-03)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Phase 24 — atomic-scope-rename-license-hygiene

## Current Position

Phase: 25
Plan: Not started
Status: Executing Phase 24
Last activity: 2026-06-04

Progress: [░░░░░░░░░░] 0% (0/9 v1.3 phases complete)

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 31 (v1.0 + v1.1 + v1.2)
- v1.2 plans: 25 across 9 phases
- Resets per milestone

**Recent Trend:**

- v1.2 milestone shipped 2026-05-31 with 9 phases, 25 plans, 46/46 REQ-IDs wired, 733/733 tests passing.
- v1.3 milestone opened 2026-06-03; roadmap created same day (9 phases, 54 REQ-IDs). Trend resets at first v1.3 plan completion.

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
- [v1.3 Phase plan]: 9 phases (24-32). Phase 24 atomic rename + hygiene; Phase 25 PR-time CI; Phase 26 release docs + CRYPTO-01 receipt downgrade defense; Phase 27 user-driven npm org claim; Phase 28 release.yml + rc.0 OIDC smoke; Phase 29 v1.3.0 stable publish; Phase 30 canary bootstrap + Layer 1; Phase 31 canary Layer 2 real-provider + 3-layer cost ceiling; Phase 32 cross-repo dispatch + milestone audit.

### Pending Todos

- Phase 24: Spawn `/gsd-plan-phase 24` for the atomic scope rename + license hygiene plans (RENAME-01..05 + PKG-01..05).
- Phase 27 / 28 baton: Plan must hand the user the npm org + Trusted Publisher binding steps explicitly; FSB cannot fully automate the npmjs.com UI.
- Phase 30: Canary repo bootstrap requires v1.3.0 (or rc.0) to exist on the public registry before integration steps can run.
- Carryforward to v1.4: native tool-use, `lattice eval --agent`, KMS adapters, lineage merkle, receipt diff, OTel exporter, streaming, multimodal, OpenRouter routing, LM Studio diagnostics.

### Blockers/Concerns

- Package rename `lattice` → `@fullselfbrowsing/lattice` touches every import site (workspace + examples + tests). Surface is large but mechanical. publint + arethetypeswrong will catch regressions. The 5-surface atomic-rename gate (RENAME-01) is the long pole in Phase 24.
- `lattice-cli` ships `dependencies: { "lattice": "workspace:*" }`. The `* → ^` flip is the most easily-missed surface and propagates silently into the tarball if not caught — must land in the same commit as the rename.
- No `.github/workflows/` exists at all in Lattice repo. CI scaffolding starts from zero (not a tweak of existing workflows). All third-party actions must be SHA-pinned (TanStack 2026 mitigation).
- npm `@fullselfbrowsing` org creation requires user-driven sign-in on npmjs.com (no FSB credential saved). Trusted Publisher binding likewise. Phase 27 must hand the baton explicitly and verify completion via FSB recon before Phase 28 attempts the first publish.
- Real-provider integration tests need API key secrets configured in the canary repo. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` to be set before nightly cron arms.
- First publish (Phase 28) IS the smoke test of `release.yml` — OIDC cannot be dry-run against npm. rc.0 prerelease tag absorbs the failure mode without burning the v1.3.0 stable slot.

## Session Continuity

Last session: 2026-06-06T03:37:19.120Z
Stopped at: Phase 25 context gathered
Resume file: .planning/phases/25-pr-time-ci-workflow/25-CONTEXT.md
