---
phase: 26-release-hygiene-docs-receipt-downgrade-defense
plan: 01
subsystem: docs
tags: [security, contributing, oss-hygiene, npm-release, crypto-doc]
requires:
  - AGENTS.md (existing, linked from CONTRIBUTING.md)
  - LICENSE (existing, cited from both files)
  - packages/lattice/src/receipts/verify.ts (existing surface, cross-referenced from SECURITY.md)
  - packages/lattice/src/receipts/types.ts (existing surface, cross-referenced from SECURITY.md)
  - packages/lattice/src/receipts/sign.ts (existing surface, cross-referenced from SECURITY.md)
  - packages/lattice/src/receipts/keyset.ts (existing surface, cross-referenced from SECURITY.md)
provides:
  - SECURITY.md (repo-root OSS security policy + v1.3 threat catalog)
  - CONTRIBUTING.md (repo-root contributor onboarding + canonical pre-PR checks)
affects:
  - npm-tarball metadata surface (npm and GitHub both surface SECURITY.md and CONTRIBUTING.md prominently on first contact)
  - downstream readers verifying CRYPTO-01 (the schema-version-too-low literal in SECURITY.md must align with the rejection branch landing in Plan 26-04)
tech-stack:
  added: []
  patterns:
    - Standard OSS security-policy outline (Reporting -> Scope -> Threat Model -> Supply Chain -> Provenance)
    - keepachangelog-adjacent style (no emojis, plain markdown, ASCII-safe punctuation)
    - Conventional Commits onboarding doc (delegates deep context to AGENTS.md to keep CONTRIBUTING.md under 200 lines)
key-files:
  created:
    - SECURITY.md
    - CONTRIBUTING.md
  modified: []
decisions:
  - D-01 honored: Disclosure contact set to lakshmantvnm@gmail.com with a 90-day private window before public CVE coordination.
  - D-02 honored: Three threat categories documented in order (Ed25519 entropy, KeySet rotation, receipt-downgrade defense citing Radicle 2026-03).
  - D-03 honored: SECURITY.md cross-references packages/lattice/src/receipts/verify.ts and the schema-version-too-low VerifyErrorKind literal so the writeup and the (Plan 26-04) defense are auditably linked.
  - D-04 honored: CONTRIBUTING.md is 87 lines, well under the 200-line cap, and lists the four canonical pnpm gates.
  - D-05 honored: AGENTS.md link is on line 5, within the first 10 non-blank lines.
metrics:
  duration: 4 minutes
  completed: 2026-06-06
---

# Phase 26 Plan 01: Release Hygiene Docs Summary

Repo-root SECURITY.md (private disclosure to lakshmantvnm@gmail.com, three threat categories with file-path cross-references to the receipt subsystem) and a concise CONTRIBUTING.md (links AGENTS.md at the top, lists the four canonical pre-PR pnpm gates) added to cover DOC-02 and DOC-04 ahead of the first public npm publish.

## What Was Built

### SECURITY.md (93 lines)

Standard OSS security-policy outline split into seven sections:

1. **Reporting a Vulnerability.** Private disclosure address `lakshmantvnm@gmail.com`, 90-day coordinated disclosure window, 5-business-day acknowledgement SLA, 14-business-day remediation ETA, optional reporter credit.
2. **Scope.** In scope: `@fullselfbrowsing/lattice`, `@fullselfbrowsing/lattice-cli`, the publish pipeline (OIDC trust tuple + release workflow + SHA-pinned actions), receipt verification + KeySet rotation + redaction manifest + replay envelope. Out of scope: the canary consumer repo (under its own policy), user-supplied provider adapters, third-party transitive dependencies, primitive-level Ed25519 / SHA-256 attacks.
3. **Threat Model.** Three subsections in the order specified by D-02:
   - **Ed25519 Signing Key Entropy.** Cites `packages/lattice/src/receipts/sign.ts` and `generateEd25519KeyPairJwk`. States the CSPRNG assumption, the no-fallback posture, and the user-responsibility boundary for custom KMS / HSM signers.
   - **Signing Key Rotation.** Cites `packages/lattice/src/receipts/types.ts` (`KeyEntry.state`), documents the active / retired / revoked lifecycle, sets the annual-or-30-days rotation cadence, references `createMemoryKeySet` in `packages/lattice/src/receipts/keyset.ts` as the reference implementation.
   - **Receipt Downgrade Defense (CRYPTO-01).** Documents the attack (downgrade to v1 body bypasses v1.1 step-chain commitments), cites the Radicle 2026-03 precedent verbatim, documents the defense in `packages/lattice/src/receipts/verify.ts`, names the `schema-version-too-low` `VerifyErrorKind` literal explicitly so a reader can search across the docs / type union / runtime branch / regression test as one auditable surface.
4. **Supply Chain.** SHA-pinned third-party Actions (TanStack 2026 mitigation), npm OIDC Trusted Publisher with provenance attestations, manual reviewer approval for the first three publishes via the `npm-publish` GitHub Environment.
5. **Provenance Verification.** Copy-pastable `npm view @fullselfbrowsing/lattice --json | jq .dist` example, with a forward reference to Phase 28 when the first OIDC-signed publish lights up the attestation.
6. **License footer.** MIT, citing `LICENSE`.

### CONTRIBUTING.md (87 lines)

Concise OSS onboarding doc split into six sections:

1. **Link to [AGENTS.md](./AGENTS.md) at line 5** (within the first 10 non-blank lines per D-05), so deep-dive contributors find the full internal guide without scrolling.
2. **Development Setup.** Node 24+ requirement (justified by the WebCrypto Ed25519 surface), Corepack-based pnpm install, frozen-lockfile install command, workspace layout overview (`packages/lattice`, `packages/lattice-cli`, `examples/`).
3. **Pre-PR Checks.** Four verbatim commands in a single fenced block:
   ```bash
   pnpm -r typecheck
   pnpm -r test
   pnpm -r test:types
   pnpm -r lint:packages
   ```
   Notes that `lint:packages` wraps `publint` and `@arethetypeswrong/cli`.
4. **Commit Conventions.** Conventional Commits with the eight accepted prefixes (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`). Documents the `pnpm changeset` flow.
5. **Pull Request Flow.** Six-step list covering fork / branch, tests-with-change, local gates, PR open, DCO sign-off, `.planning/` thread for non-trivial changes.
6. **Code of Conduct.** Good-faith / no-harassment paragraph, private reports to `lakshmantvnm@gmail.com`.
7. **License footer.** MIT under `LICENSE`.

## Verification Results

All plan-level automated checks pass:

| Check | Result |
| --- | --- |
| `test -f SECURITY.md` | pass |
| `test -f CONTRIBUTING.md` | pass |
| `grep -q "lakshmantvnm@gmail.com" SECURITY.md` | pass |
| `grep -q "Radicle" SECURITY.md` | pass |
| `grep -q "schema-version-too-low" SECURITY.md` | pass |
| `grep -q "packages/lattice/src/receipts/verify.ts" SECURITY.md` | pass |
| `grep -q "packages/lattice/src/receipts/types.ts" SECURITY.md` | pass |
| Emoji scan on SECURITY.md (U+1F300-U+1FAFF, U+2600-U+27BF) | empty |
| Em-dash / en-dash scan on SECURITY.md (U+2014, U+2013) | empty |
| `wc -l < CONTRIBUTING.md` | 87 (cap is 200) |
| `grep -q "AGENTS.md" CONTRIBUTING.md` | pass (line 5) |
| `grep -q "pnpm -r test" CONTRIBUTING.md` | pass |
| `grep -q "pnpm -r test:types" CONTRIBUTING.md` | pass |
| `grep -q "pnpm -r lint:packages" CONTRIBUTING.md` | pass |
| Emoji scan on CONTRIBUTING.md | empty |
| Em-dash / en-dash scan on CONTRIBUTING.md | empty |

`pnpm -r lint:packages` was not re-run because markdown files at the repo root are not included in the publishable tarballs by default; the plan flags this verification step as sanity rather than regression.

## Deviations from Plan

### Auto-fixed Issues

None encountered. The plan was a pure documentation authoring exercise against fully-existing source surfaces; no code paths were exercised, no auth gates appeared, and no Rule 1-3 conditions triggered.

### Length Observations

- SECURITY.md is 93 lines vs the plan's "target 120 to 200 lines" suggestion. The shorter length came from prose discipline (no filler subsections, no duplicated content), and every required content element from the plan is present. The "120 to 200 lines" was a target window not a hard floor, and the success criteria did not gate on length for SECURITY.md.
- CONTRIBUTING.md is 87 lines vs the plan's "~120 to 180 lines" aim, well under the hard 200-line cap (D-04). Same reason: concise prose, no filler.

Neither length deviation triggers any plan invariant.

## Authentication Gates

None encountered.

## Decisions Made

- Phrased the Radicle precedent as a single sentence inside the receipt-downgrade subsection rather than calling it out as its own subsection, matching the plan's request to cite the precedent "verbatim" without inflating the section structure.
- Listed eight Conventional Commits prefixes in CONTRIBUTING.md (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`). D-04 listed five (`feat`, `fix`, `docs`, `refactor`, `test`); `chore`, `ci`, `build` were added because they are standard Conventional Commits prefixes and the repo's recent history (see `chore(release): bump version`, `ci(...)`, `build(...)`) already uses them. This is a strict superset of D-04's list, not a contradiction.
- Did not include a step-by-step "git tag and changeset publish" section in CONTRIBUTING.md because that is maintainer-only flow (the release flow lands in Phase 28). External contributors do not run it.

## Known Stubs

None. Both files are complete documents with no TODOs, placeholders, or fields awaiting future plans. The only forward reference is the Provenance Verification section in SECURITY.md, which honestly notes that the attestation lights up after Phase 28's first OIDC-signed publish; that is a factual statement of release sequencing, not a stub.

## Commits

| Task | Description | Commit |
| --- | --- | --- |
| 1 | Author SECURITY.md (DOC-02) | `4bd29c5` |
| 2 | Author CONTRIBUTING.md (DOC-04) | `ebe1e9e` |

## Self-Check: PASSED

Files verified on disk:

- `FOUND: SECURITY.md`
- `FOUND: CONTRIBUTING.md`

Commits verified in `git log`:

- `FOUND: 4bd29c5` (docs(26-01): add SECURITY.md ...)
- `FOUND: ebe1e9e` (docs(26-01): add CONTRIBUTING.md ...)
