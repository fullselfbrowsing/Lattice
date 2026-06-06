# Phase 26: Release Hygiene Docs + Receipt Downgrade Defense - Context

**Gathered:** 2026-06-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Author the four documentation surfaces npm requires for a credible first publish (CONTRIBUTING.md, SECURITY.md, per-package CHANGELOG.md retroactively seeded with v1.0/v1.1/v1.2 history under the scoped names, README.md install + provenance section) AND harden `verifyReceipt` against the receipt-downgrade attack by rejecting receipts whose `body.version` is absent or equals `"lattice-receipt/v1"`. Coupling the security writeup to the code change in a single phase ensures the SECURITY.md documents an attack that the codebase actually defends against.

In scope:
- `CONTRIBUTING.md` (repo root)
- `SECURITY.md` (repo root)
- `packages/lattice/CHANGELOG.md` (new, retroactively seeded)
- `packages/lattice-cli/CHANGELOG.md` (new, retroactively seeded)
- `README.md` updates (install block, badges, provenance verification example)
- `.changeset/v1.3.0-initial.md` enrichment (it exists as a placeholder from Phase 24; Phase 26 fills it with real v1.3.0 release notes)
- `packages/lattice/src/receipts/verify.ts` — add `schema-version-too-low` rejection branch
- `packages/lattice/src/receipts/types.ts` — extend `VerifyErrorKind` union
- `packages/lattice/src/receipts/verify.test.ts` (or similar) — new unit test covering both downgrade branches

Out of scope:
- npm Trusted Publisher trust tuple registration (Phase 27)
- `.github/workflows/release.yml` (Phase 28)
- First publish (Phase 28 publishes 1.3.0-rc.0; full 1.3.0 publish is later)
- Canary consumer repo creation (Phase 29+, not yet detailed in ROADMAP)
- Adding new receipt body fields (the schema is locked per phase 9 CONTEXT — only NEW VerifyErrorKind values and a guard branch in verifyReceipt are in scope)

</domain>

<decisions>
## Implementation Decisions

### SECURITY.md content (DOC-02)
- **D-01:** Disclosure contact: `lakshmantvnm@gmail.com` (user choice). Document private disclosure with a 90-day window before any public CVE coordination.
- **D-02:** Documented threat categories:
  1. Ed25519 entropy assumption (random keypair generation relies on host CSPRNG via `crypto.subtle.generateKey`; no fallback to weaker PRNGs).
  2. Signing-key rotation guidance (KeySet rotation surface lives in `KeyEntry.state` — `current` / `next` / `retired`; rotation cadence recommendation: annually OR within 30 days of any suspected key compromise).
  3. Receipt-downgrade defense citing Radicle 2026-03 precedent (their receipt protocol was downgrade-vulnerable when the schema-version field was optional; same mitigation pattern applies here).
- **D-03:** SECURITY.md MUST cross-reference `packages/lattice/src/receipts/verify.ts` and the `schema-version-too-low` error kind so the writeup and the defense are auditably linked.

### CONTRIBUTING.md content (DOC-04)
- **D-04:** Concise OSS template (under 200 lines). Cover: development setup (pnpm install, Node 24+ requirement), test commands (`pnpm -r test`, `pnpm -r test:types`, `pnpm -r lint:packages`), PR conventions (link to ci.yml gates), commit message format (Conventional Commits — `feat:`, `fix:`, `docs:`, `refactor:`, `test:`), code of conduct boilerplate.
- **D-05:** Link to AGENTS.md (the existing 26KB internal contributor doc) at the top so deep-dive contributors get the full project context.

### CHANGELOG.md per package (DOC-03)
- **D-06:** Two new files: `packages/lattice/CHANGELOG.md`, `packages/lattice-cli/CHANGELOG.md`. (No root-level CHANGELOG.)
- **D-07:** Retroactive seeding from `.planning/MILESTONES.md`. Each entry uses the scoped package name (`@fullselfbrowsing/lattice` or `@fullselfbrowsing/lattice-cli`). Format: keepachangelog.com schema (header + version sections in descending order).
- **D-08:** Seeded sections (all dated per MILESTONES.md):
  - `## [Unreleased]` — points at the upcoming 1.3.0 release notes
  - `## [1.2.0] - 2026-05-31` — FSB Integration + Agent Capability (highlights from MILESTONES v1.2)
  - `## [1.1.0] - 2026-05-12` — Capability Receipts (RFC 8785 + Ed25519 + replay envelope)
  - `## [1.0.0] - 2026-04-22` — Foundation (package spine, artifact lifecycle, work-inbox showcase)
- **D-09:** Each version section follows keepachangelog categories: Added / Changed / Deprecated / Removed / Fixed / Security. Use 4-6 bullets per section pulled from MILESTONES.md "Key accomplishments".

### .changeset enrichment
- **D-10:** Expand `.changeset/v1.3.0-initial.md` (placeholder created in Phase 24) into the actual 1.3.0 release notes. Both packages remain `minor` bumps. Body covers: new scope, license/metadata, OIDC publish posture, receipt-downgrade defense, CI workflow.

### README.md updates (DOC-01, DOC-05)
- **D-11:** Update install instructions to scoped name:
  - Runtime: `pnpm add @fullselfbrowsing/lattice` / `npm install @fullselfbrowsing/lattice`
  - CLI: `pnpm add -g @fullselfbrowsing/lattice-cli && lattice --version`
  - Important note: CLI bin name remains `lattice` (RENAME-2 from PITFALLS — package name and bin name diverge intentionally).
- **D-12:** Add three badge placeholders to the top of README.md:
  - `[![npm version](https://img.shields.io/npm/v/@fullselfbrowsing/lattice.svg)](https://www.npmjs.com/package/@fullselfbrowsing/lattice)`
  - `![npm provenance](https://img.shields.io/badge/provenance-attested-success.svg)` (placeholder; real provenance attestation lights up after Phase 28 publishes)
  - `![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)`
  - Layout: single line at the very top of README.md, above the H1.
- **D-13:** Add a "Provenance Verification" section showing the user-facing copy-pastable command:
  ```bash
  npm view @fullselfbrowsing/lattice --json | jq .dist
  # then inspect .dist.attestations.provenance after Phase 28 publishes
  ```
  Document that the provenance attestation will appear after the first OIDC-signed publish in Phase 28.

### Receipt downgrade defense (CRYPTO-01)
- **D-14:** New `VerifyErrorKind` literal: `"schema-version-too-low"`. Added to the `VerifyErrorKind` union in `packages/lattice/src/receipts/types.ts:100`.
- **D-15:** New rejection branch in `verifyReceipt` (file: `packages/lattice/src/receipts/verify.ts`, function starts at line 77). Insertion point: BEFORE the existing signature-validity check (the downgrade check should short-circuit before any cryptographic work). The branch reads:
  ```ts
  // CRYPTO-01: receipt-downgrade defense (Phase 26)
  // Reject receipts whose schemaVersion field is absent or below v1.1.
  // body.version must be the v1.1 literal — v1 receipts predate the
  // step-marker integrity surface and an attacker could submit a
  // v1-shaped body signed by an otherwise-valid KeySet to bypass v1.1
  // checks. See SECURITY.md and Radicle 2026-03 precedent.
  if (body.version === undefined || body.version === "lattice-receipt/v1") {
    return fail(
      "schema-version-too-low",
      "Receipt body.version must be 'lattice-receipt/v1.1' — v1 receipts are not accepted (CRYPTO-01).",
    );
  }
  ```
  Type narrowing: after this branch, `body.version` is the literal `"lattice-receipt/v1.1"`.
- **D-16:** Unit test exercises BOTH branches:
  - Hand-craft a `CapabilityReceiptBody` with `version` deleted (TypeScript: build via spread + Omit).
  - Hand-craft a body with `version: "lattice-receipt/v1"` (literal old value).
  - Sign each with an otherwise-valid `KeySet` so signature validation would pass if reached.
  - Assert `verifyReceipt` returns `{ ok: false, error: { kind: "schema-version-too-low" } }` in both cases.
  - Counter-test: a valid `version: "lattice-receipt/v1.1"` body succeeds (regression guard).

### Claude's Discretion
- Exact bullet wording inside CHANGELOG.md entries (use MILESTONES.md "Key accomplishments" as source).
- Exact CONTRIBUTING.md section ordering and word choice (keep concise, no fluff).
- Whether to bundle the v1.1.0 LIMITATION-1 note in the CHANGELOG (recommended: yes, under Security or Known Issues section).
- Provenance verification section exact wording (the success criterion requires "copy-pastable" only, not specific phrasing).
- Where to slot the receipt-downgrade test (existing test file `verify.test.ts` if it exists, otherwise new file).

### Folded Todos
None — no pending todos matched phase 26 keywords.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & milestone framing
- `.planning/ROADMAP.md` Phase 26 section — goal + 3 success criteria.
- `.planning/REQUIREMENTS.md` DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, CRYPTO-01 entries.
- `.planning/PROJECT.md` "Current Milestone: v1.3" section — release scoping + key constraints.
- `.planning/MILESTONES.md` — source of CHANGELOG seed content for v1.0, v1.1, v1.2.

### Threat model & precedent
- `.planning/research/PITFALLS.md` — supply-chain threat catalog. Specifically:
  - OIDC-1 (TanStack blast radius) — informs why SECURITY.md exists.
  - RENAME-2 (`bin: { lattice }` vs scoped package name) — README install copy must reflect.
- Radicle 2026-03 receipt-downgrade postmortem (cited inline in SECURITY.md and the verify.ts comment).

### Existing code surfaces touched by this phase
- `packages/lattice/src/receipts/verify.ts` (line 77 — `verifyReceipt` function entry).
- `packages/lattice/src/receipts/types.ts` (line 100 — `VerifyErrorKind` union).
- `packages/lattice/src/receipts/sign.ts` — KeySet operations referenced from SECURITY.md.
- `packages/lattice/src/receipts/receipt.ts` — body construction reference for the test.

### Phase 24 outputs (Phase 26 is a downstream consumer of the rename)
- `.planning/phases/24-atomic-scope-rename-license-hygiene/24-VERIFICATION.md` — the 18 truths that all DOC-* updates must preserve.
- `.changeset/v1.3.0-initial.md` — Phase 24 created the placeholder; Phase 26 enriches it.

### Phase 25 outputs (CI gates Phase 26 docs)
- `.planning/phases/25-pr-time-ci-workflow/25-CONTEXT.md` — CI gates Phase 26 docs will run against.
- `scripts/verify-rename.mjs` — will catch any README/CHANGELOG that re-introduces an unscoped `lattice` import string.

### Existing repo documentation surfaces
- `README.md` (30 KB) — current state; Phase 26 updates install block + adds badges + provenance section.
- `AGENTS.md` (26 KB) — existing internal contributor guide; CONTRIBUTING.md links to it.
- `LICENSE` — MIT, already at repo root.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/receipts/verify.ts` — `verifyReceipt` function already structured with a `fail(kind, message)` helper at line 18 that returns typed `VerifyResult`. Adding a new branch is one `if` + one `fail()` call; no architectural lift.
- `packages/lattice/src/receipts/types.ts` — `VerifyErrorKind` union at line 100 already accepts new string literals additively; extending it does not break exhaustive switches if every consumer handles `default`.
- `CapabilityReceiptBody.version` is already a discriminated literal (`"lattice-receipt/v1" | "lattice-receipt/v1.1"`). Type narrowing after the downgrade check works automatically.
- `.planning/MILESTONES.md` contains the full prior-version history; CHANGELOG retroactive seeding is a direct quote, no archaeology.
- `LICENSE` at repo root, MIT — no changes; README and CHANGELOG cite it.

### Established Patterns
- Receipt errors flow through the typed `VerifyResult` discriminated union (`VerifyOk | VerifyFail`); NEVER throw across the verification boundary (comment at verify.ts:62).
- Schema fields are LOCKED per Phase 9 CONTEXT — receipt body cannot be retrofitted with NEW fields. Phase 26 only adds a new ERROR kind, not a new body field. The check uses the existing `version` field.
- Tests use Vitest with real Ed25519 signing under an ephemeral KeySet (see `packages/lattice/test/` patterns from v1.1/v1.2).
- Documentation files are MIT-licensed inline (small footer line) per existing README convention.

### Integration Points
- ci.yml's `pnpm -r lint:packages` step will run publint on the publishable packages; CHANGELOG.md does NOT have to ship in the tarball (publint ignores it by default unless listed in `files`), but its presence in the package directory is conventional.
- The receipt-downgrade defense reuses the existing `fail(kind, message)` helper — no new function exports.
- README install instructions get verified by `scripts/verify-rename.mjs` indirectly (it allowlists `bin: { lattice }` references; everything else must be scoped).

</code_context>

<specifics>
## Specific Ideas

- SECURITY.md follows the standard OSS template (Reporting -> Scope -> Disclosure timeline -> Mitigations). The Mitigations section enumerates the three threat categories listed in D-02.
- CHANGELOG headers in keepachangelog.com format (`## [VERSION] - DATE` with the version in brackets, ISO date).
- README badges go on a single horizontal line at the very top, above the H1. No empty lines between badges.
- The provenance verification example shows the `npm view ... --json | jq` pattern, not a wrapper script — the user wants reviewers to see they can verify provenance with stock tooling.

</specifics>

<deferred>
## Deferred Ideas

- A markdown-lint pre-commit hook for docs (could enforce link integrity, badge format). Out of phase 26 scope.
- Auto-generating CHANGELOG entries from changesets going forward (changesets/cli already does this on `pnpm changeset version`). Phase 26 only seeds the retroactive history; future changeset-driven releases inherit from there.
- Translating SECURITY.md or README into additional languages.
- Adding a CODEOWNERS file (procedural enforcement vs the workflow-safety script we already have).

</deferred>

---

*Phase: 26-release-hygiene-docs-receipt-downgrade-defense*
*Context gathered: 2026-06-06*
