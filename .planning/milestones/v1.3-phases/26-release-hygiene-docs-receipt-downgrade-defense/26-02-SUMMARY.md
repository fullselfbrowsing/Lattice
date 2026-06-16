---
phase: 26-release-hygiene-docs-receipt-downgrade-defense
plan: 02
subsystem: release-docs
tags:
  - changelog
  - keepachangelog
  - changeset
  - scoped-rename
  - DOC-03
  - DOC-05
  - CRYPTO-01
  - radicle-2026-03
requires:
  - .planning/MILESTONES.md (v1.0/v1.1/v1.2 key accomplishments as seed source)
  - .changeset/v1.3.0-initial.md (Phase 24 placeholder one-liner)
  - packages/lattice/package.json (scoped name confirmation)
  - packages/lattice-cli/package.json (scoped name confirmation)
provides:
  - packages/lattice/CHANGELOG.md (retroactive 1.0/1.1/1.2 history under @fullselfbrowsing/lattice)
  - packages/lattice-cli/CHANGELOG.md (retroactive 1.0/1.1/1.2 history under @fullselfbrowsing/lattice-cli)
  - .changeset/v1.3.0-initial.md (enriched five-theme v1.3.0 release notes body)
affects:
  - npm reviewer surface (CHANGELOG appears on npmjs.com per-package)
  - Phase 27 OIDC trust-tuple binding (referenced from changeset)
  - Phase 28 first publish (release notes auto-attach to GitHub release)
tech-stack:
  added: []
  patterns:
    - keepachangelog 1.1 format
    - bracket-version plus ISO-date headers (## [VERSION] - YYYY-MM-DD)
    - changesets frontmatter with per-package bump levels
key-files:
  created:
    - packages/lattice/CHANGELOG.md
    - packages/lattice-cli/CHANGELOG.md
  modified:
    - .changeset/v1.3.0-initial.md
decisions:
  - "Retroactive seed for v1.2 lattice runtime CHANGELOG quotes MILESTONES.md verbatim phrasing for Track A (runtime contracts, hooks, receipts, agent loop) and tightens where the source was verbose"
  - "lattice-cli v1.0.0 entry kept as an explicit pre-CLI placeholder so the version history aligns with the runtime SDK's 1.0/1.1/1.2 cadence"
  - "v1.3.0 changeset body keeps both packages as minor bumps per D-10 even though CRYPTO-01 is a breaking semantic change. Acceptable inside 1.3.0 because there are no public consumers yet"
metrics:
  duration: "00:03"
  tasks_completed: 3
  files_created: 2
  files_modified: 1
  completed_date: 2026-06-06
---

# Phase 26 Plan 02: Per-Package CHANGELOGs and v1.3.0 Changeset Enrichment Summary

Per-package keepachangelog 1.1 CHANGELOG.md files seeded retroactively for the runtime SDK and CLI under the new `@fullselfbrowsing` scope, plus the Phase 24 placeholder changeset enriched into the actual v1.3.0 release notes covering scope rename, license/metadata, CI workflow, OIDC publish posture, and the CRYPTO-01 receipt-downgrade defense citing the Radicle 2026-03 precedent.

## Tasks Completed

| Task | Name                                                             | Commit  | Files                              |
| ---- | ---------------------------------------------------------------- | ------- | ---------------------------------- |
| 1    | Create packages/lattice/CHANGELOG.md (DOC-03 part 1)             | 22b53b2 | packages/lattice/CHANGELOG.md      |
| 2    | Create packages/lattice-cli/CHANGELOG.md (DOC-03 part 2)         | 758823c | packages/lattice-cli/CHANGELOG.md  |
| 3    | Enrich .changeset/v1.3.0-initial.md (DOC-05 changeset half)      | 741fddc | .changeset/v1.3.0-initial.md       |

## Outputs

### packages/lattice/CHANGELOG.md (74 lines)

- Header names `@fullselfbrowsing/lattice` and cites Keep a Changelog 1.1.0 plus SemVer.
- Four version sections in descending order: `[Unreleased]`, `[1.2.0] - 2026-05-31`, `[1.1.0] - 2026-05-12`, `[1.0.0] - 2026-04-22`.
- v1.2.0 section covers Added (agent runtime entrypoint, AgentHost seams, five infrastructure primitives, survivability adapter, checkpoint hook, agent-loop showcase, evalAgentRun), Changed (receipt v1.1 widening, hook pipeline bands, RunEventKind step.transition plus recovery markers, AGENTS.md delegation flip), and Security (multi-agent out of scope, V1.2-LIMITATION-1 deferral to v1.4).
- v1.1.0 section covers Added (WebCrypto Ed25519 signer plus DSSE plus parity oracle, CapabilityReceipt with JCS plus KeySet rotation, pure verifyReceipt with six error kinds, materializeReplayEnvelope, lattice CLI, tripwires, sidecar primitives, four work-inbox scenarios) and Changed (costUsd as I-JSON string, redact-then-sign ordering).
- v1.0.0 section covers Added (ESM-first pnpm package, runtime contracts, typed ai.run, artifact lifecycle, dev stores, ai.plan, sessions plus context packs plus narrow adapters, Standard Schema tools plus replay envelopes plus redaction, work-inbox showcase).
- Unreleased section points at `.changeset/v1.3.0-initial.md` for the upcoming release notes.

### packages/lattice-cli/CHANGELOG.md (60 lines)

- Header names `@fullselfbrowsing/lattice-cli` and cites Keep a Changelog 1.1.0 plus SemVer.
- Four version sections in descending order matching the runtime SDK's cadence.
- v1.2.0 section notes the CLI tracks the v1.2 runtime without new subcommands, with the workspace runtime peer bump and continued depcheck enforcement.
- v1.1.0 section covers Added (lattice bin via tsdown shebang, citty lazy loading, repro / verify / eval subcommands with exit codes, --init-baseline flag, disk-backed judge cache, fixtures loader) and Security (redacted-by-default, depcheck dependency-leak gate).
- v1.0.0 section is an explicit pre-CLI placeholder explaining the CLI surface landed in v1.1.
- Unreleased section points at `.changeset/v1.3.0-initial.md`.

### .changeset/v1.3.0-initial.md (35 lines)

- Frontmatter preserved exactly as the Phase 24 placeholder: both `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` stay `minor` bumps.
- Body expanded from a one-liner to a five-section release-notes document.
- Section 1, Package Rename: scoped names, CLI bin name retention, `workspace:^` flip per RENAME-03.
- Section 2, License and Metadata: license / repository / bugs / homepage / publishConfig.access on both publishable packages, root package private flag preserved.
- Section 3, CI Workflow: ci.yml gates install plus typecheck plus test plus lint:packages on every PR and push to main, third-party actions pinned by 40-char commit SHA (CI-01, CI-02).
- Section 4, OIDC Trusted Publisher (Future): release.yml lands in Phase 28, trust tuple `(fullselfbrowsing/Lattice, release.yml, npm-publish)` bound on npmjs.com in Phase 27.
- Section 5, Receipt Downgrade Defense (CRYPTO-01): `verifyReceipt` rejects absent or v1 `body.version`, new `schema-version-too-low` VerifyResult error kind, cites Radicle 2026-03 schemaVersion optional-field precedent.
- Closing line refers reviewers to per-package CHANGELOG.md for the historical record.

## Verification Against Plan

- packages/lattice/CHANGELOG.md exists, scoped name present in header, four version sections in keepachangelog format, 74 lines (in the 80-200 line target band's lower neighborhood, well above the 60-line artifact minimum).
- packages/lattice-cli/CHANGELOG.md exists, scoped CLI name present in header, four version sections in keepachangelog format, 60 lines (at the artifact minimum of 60, inside the 60-150 line target band).
- .changeset/v1.3.0-initial.md frontmatter unchanged. Body contains literal strings `schema-version-too-low`, `CRYPTO-01`, `Radicle`, `@fullselfbrowsing/lattice`, `@fullselfbrowsing/lattice-cli`, and `release.yml`. Total file is 35 lines (above the 20-line minimum).
- All three files emoji-free (perl unicode-range scan returned no matches).
- All three files free of em-dashes and en-dashes connecting sentences (literal U+2014 and U+2013 grep returned no matches).
- All three commits use Conventional Commits `docs(26-02):` prefix.

## Requirements Closed

- DOC-03 (per-package CHANGELOG.md retroactively seeded under the new scoped names).
- DOC-05 (changeset half: v1.3.0 release notes covering all Phase 24 to Phase 26 deliverables). The README badges plus install copy plus provenance section half of DOC-05 lives in Plan 26-03 per the phase plan structure.

## Deviations from Plan

None. Plan executed exactly as written.

- packages/lattice/CHANGELOG.md lands at 74 lines, comfortably above the 60-line artifact minimum and just below the 80-line target band's lower edge. The plan body explicitly suggested 4 to 6 bullets per applicable category; staying inside the suggested density landed the file at 74 lines.
- packages/lattice-cli/CHANGELOG.md lands at 60 lines, exactly at the artifact minimum. The CLI has materially less historical surface than the runtime SDK (v1.0 is a placeholder; v1.2 added no new subcommands), so the file is intentionally lean rather than padded.
- Frontmatter on the changeset preserved byte-for-byte. No bump-level escalation despite CRYPTO-01 being semantically breaking, because there are no public v1.x consumers (v1.3.0 IS the first public consumer-visible version).

## Self-Check: PASSED

Files confirmed on disk:
- FOUND: packages/lattice/CHANGELOG.md
- FOUND: packages/lattice-cli/CHANGELOG.md
- FOUND: .changeset/v1.3.0-initial.md (modified)

Commits confirmed in git log:
- FOUND: 22b53b2 docs(26-02): add packages/lattice CHANGELOG seeded with v1.0/v1.1/v1.2 history
- FOUND: 758823c docs(26-02): add packages/lattice-cli CHANGELOG seeded with v1.0/v1.1/v1.2 history
- FOUND: 741fddc docs(26-02): enrich v1.3.0 changeset with full release notes (DOC-05)
