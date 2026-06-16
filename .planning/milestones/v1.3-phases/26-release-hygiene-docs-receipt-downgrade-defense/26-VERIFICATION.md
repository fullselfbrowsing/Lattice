---
phase: 26-release-hygiene-docs-receipt-downgrade-defense
verified: 2026-06-06T00:00:00Z
status: passed
score: 16/16 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 26: Release Hygiene Docs + Receipt Downgrade Defense Verification Report

**Phase Goal:** Author the docs npm requires for a credible first publish and harden verifyReceipt against the receipt-downgrade attack, coupling the security writeup to the code change in one phase.
**Verified:** 2026-06-06T00:00:00Z
**Status:** passed
**Re-verification:** No (initial verification)

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                            | Status     | Evidence                                                                                                                                                              |
| -- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | SECURITY.md at repo root names lakshmantvnm@gmail.com as the disclosure contact, 90-day window, and documents three threat categories | VERIFIED   | SECURITY.md:7 contact, :9 90-day window, :39 Ed25519 Signing Key Entropy, :49 Signing Key Rotation, :63 Receipt Downgrade Defense (CRYPTO-01)                          |
| 2  | SECURITY.md cites Radicle precedent, cross-references packages/lattice/src/receipts/verify.ts, and names schema-version-too-low literal | VERIFIED   | SECURITY.md:69 Radicle March 2026 wording, :71 verify.ts cross-reference + schema-version-too-low literal naming                                                       |
| 3  | CONTRIBUTING.md at repo root, <=200 lines, links AGENTS.md near top, lists four pnpm gates, covers Conventional Commits          | VERIFIED   | wc -l CONTRIBUTING.md = 87 (<=200); line 5 AGENTS.md link; lines 37-40 four pnpm gates verbatim; line 47 Conventional Commits link                                     |
| 4  | packages/lattice/CHANGELOG.md exists, keepachangelog format, four sections (Unreleased + 1.2.0/1.1.0/1.0.0 with correct dates), scoped name | VERIFIED   | CHANGELOG.md:1 header naming `@fullselfbrowsing/lattice`, sections at lines 8 (Unreleased), 14 ([1.2.0] - 2026-05-31), 40 ([1.1.0] - 2026-05-12), 60 ([1.0.0] - 2026-04-22) |
| 5  | packages/lattice-cli/CHANGELOG.md exists, same four-section structure, scoped CLI name                                            | VERIFIED   | lattice-cli/CHANGELOG.md:1 header naming `@fullselfbrowsing/lattice-cli`; same four sections at corresponding offsets                                                  |
| 6  | .changeset/v1.3.0-initial.md body enriched with five themes (rename, license/metadata, CI, OIDC, CRYPTO-01); frontmatter unchanged | VERIFIED   | Lines 2-3 both packages `minor`; sections: Package Rename (8), License and Metadata (15), CI Workflow (20), OIDC Trusted Publisher (25), Receipt Downgrade Defense CRYPTO-01 (29); 35 total lines |
| 7  | README.md has three badge image-link lines on a single line at the very top above the H1 (npm version, npm provenance, license MIT) | VERIFIED   | README.md line 1 holds all three: `shields.io/npm/v/@fullselfbrowsing/lattice`, `provenance-attested-success`, `license-MIT-blue`; H1 `# Lattice` at line 7              |
| 8  | README.md install block uses @fullselfbrowsing/lattice and @fullselfbrowsing/lattice-cli with note about bin name                  | VERIFIED   | README.md:155 `pnpm add @fullselfbrowsing/lattice`; :162 `pnpm add -g @fullselfbrowsing/lattice-cli`; :163 `lattice --version`; :166 blockquote noting bin name remains `lattice` (RENAME-2) |
| 9  | README.md has Provenance Verification section with `npm view @fullselfbrowsing/lattice --json | jq .dist` example                  | VERIFIED   | README.md:286 `## Provenance Verification` H2; :291 exact `npm view ... | jq .dist` fenced bash example; :295 SECURITY.md cross-reference                                |
| 10 | packages/lattice/src/receipts/types.ts VerifyErrorKind union includes "schema-version-too-low"                                    | VERIFIED   | types.ts:107 `| "schema-version-too-low";` appended as seventh union member; existing six members preserved                                                            |
| 11 | packages/lattice/src/receipts/verify.ts has rejection branch placed BEFORE Ed25519 signature check; rejects body.version undefined AND v1 | VERIFIED   | verify.ts:117-130 Step 4 branch with condition `body.version === undefined || body.version === "lattice-receipt/v1"`; precedes Step 5 keyset lookup (:132) and Step 7 signature verify (:159) |
| 12 | packages/lattice/src/receipts/verify.test.ts has tests covering BOTH downgrade branches plus positive control for v1.1            | VERIFIED   | verify.test.ts:429 new describe block; :430 version-absent test; :485 v1 literal test (strict schema-version-too-low assert at :525); :529 positive control v1.1 minted via createReceipt |
| 13 | `pnpm -r test` passes 736+                                                                                                        | VERIFIED   | `pnpm -r test` output: 51+13 test files, 592 lattice + 144 lattice-cli = 736 tests passing                                                                              |
| 14 | `pnpm -r typecheck` clean                                                                                                         | VERIFIED   | `pnpm -r typecheck` output: lattice + lattice-cli both Done with no errors                                                                                              |
| 15 | All three Phase 25 audit scripts still exit 0                                                                                     | VERIFIED   | check-tarball-leak.mjs exit 0 (inspected 2 tarballs); verify-rename.mjs exit 0 (168 files, no stale imports); check-workflow-safety.mjs exit 0 (1 workflow, no pull_request_target) |
| 16 | NO emojis and NO em-dashes between sentences anywhere in phase 26 authored artifacts                                              | VERIFIED   | perl unicode emoji scan on SECURITY.md, CONTRIBUTING.md, both CHANGELOGs, .changeset/v1.3.0-initial.md returns empty; em-dash/en-dash grep returns empty on same set; README phase 26 additions (badge line, install block, provenance section, bin-name blockquote) clean too |

**Score:** 16/16 truths verified

### Required Artifacts

| Artifact                                                | Expected                                                       | Status     | Details                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `SECURITY.md`                                           | OSS security policy + threat catalog + disclosure contact      | VERIFIED   | 93 lines; all required content blocks present                                                                                          |
| `CONTRIBUTING.md`                                       | Contributor onboarding + commands + PR conventions             | VERIFIED   | 87 lines (cap 200); AGENTS.md link line 5; four pnpm gates lines 37-40                                                                  |
| `packages/lattice/CHANGELOG.md`                         | Retroactive v1.0/v1.1/v1.2 history under scoped name           | VERIFIED   | 74 lines; scoped name in header; four sections in keepachangelog format with correct ISO dates                                          |
| `packages/lattice-cli/CHANGELOG.md`                     | Retroactive v1.0/v1.1/v1.2 history under scoped CLI name       | VERIFIED   | 60 lines; scoped CLI name in header; same four-section structure                                                                       |
| `.changeset/v1.3.0-initial.md`                          | v1.3.0 release notes covering all five themes                  | VERIFIED   | 35 lines (>=20); frontmatter unchanged minor/minor; body covers rename, license/metadata, CI, OIDC, CRYPTO-01                          |
| `README.md`                                             | Badges above H1, scoped install block, Provenance Verification | VERIFIED   | Line 1 holds three badges above H1 at line 7; install block at 149-166 uses scoped names with bin-name blockquote; provenance H2 at 286 |
| `packages/lattice/src/receipts/types.ts`                | Extended VerifyErrorKind union                                 | VERIFIED   | Line 107 contains `"schema-version-too-low"` as 7th member; six pre-existing members preserved                                          |
| `packages/lattice/src/receipts/verify.ts`               | Schema-version downgrade rejection branch                      | VERIFIED   | Step 4 (lines 117-130) short-circuits before keyset lookup (Step 5) and signature verify (Step 7); decision-tree comment updated         |
| `packages/lattice/src/receipts/verify.test.ts`          | Three new tests (2 negative + 1 positive control)              | VERIFIED   | Lines 429-550 new describe block; tests exercise both downgrade branches plus v1.1 positive control via createReceipt                   |
| `packages/lattice/src/receipts/receipt.ts`              | Collapsed version heuristic to always v1.1                     | VERIFIED   | Lines 86-91 always emit `"lattice-receipt/v1.1"`; CRYPTO-01 comment cites the rationale (v1 receipts now unverifiable by their runtime) |

### Key Link Verification

| From                                       | To                                                       | Via                                                          | Status | Details                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------- | ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| SECURITY.md                                | packages/lattice/src/receipts/verify.ts                  | Explicit file-path backtick reference                        | WIRED  | SECURITY.md:71 names verify.ts inline                                                                    |
| SECURITY.md                                | VerifyErrorKind schema-version-too-low literal           | Named cross-reference                                        | WIRED  | SECURITY.md:71 names the literal; :73 confirms grep-discoverability across doc/type/branch/test          |
| CONTRIBUTING.md                            | AGENTS.md                                                | Top-of-file [AGENTS.md](./AGENTS.md) link                    | WIRED  | CONTRIBUTING.md:5 link in first non-blank prose paragraph                                                |
| .changeset/v1.3.0-initial.md               | Phase 26 deliverables                                    | Release-notes body content                                   | WIRED  | Body lines 6-33 cover all five themes including schema-version-too-low + CRYPTO-01 + Radicle             |
| packages/lattice/CHANGELOG.md [Unreleased] | .changeset/v1.3.0-initial.md                             | Pointer to upcoming v1.3.0 release                           | WIRED  | CHANGELOG.md:12 points at the changeset                                                                  |
| README.md npm version badge                | https://www.npmjs.com/package/@fullselfbrowsing/lattice  | shields.io badge URL                                         | WIRED  | README.md:1 contains `shields.io/npm/v/@fullselfbrowsing/lattice.svg` wrapped in npmjs.com link           |
| README.md install block                    | @fullselfbrowsing/lattice                                | pnpm add / npm install command                               | WIRED  | README.md:155 `pnpm add @fullselfbrowsing/lattice`; :157 `npm install @fullselfbrowsing/lattice`         |
| README.md Provenance Verification section  | npm view command                                         | Fenced bash block                                            | WIRED  | README.md:291 exact command `npm view @fullselfbrowsing/lattice --json | jq .dist`                       |
| verifyReceipt downgrade branch             | VerifyErrorKind literal                                  | `fail("schema-version-too-low", ...)` call                   | WIRED  | verify.ts:126-129 fail call uses the literal verbatim                                                    |
| verify.test.ts downgrade tests             | verifyReceipt downgrade branch                           | `expect(result.error.kind).toBe("schema-version-too-low")`   | WIRED  | verify.test.ts:525 strict assertion; :479-481 also checks the literal in the version-absent test         |

### Data-Flow Trace (Level 4)

Not applicable. Phase 26 produces (a) documentation artifacts that present static text and (b) a verifier subsystem whose data flow is exercised end-to-end by the 736-test Vitest suite (including three new CRYPTO-01 tests). The new branch is a pure conditional with no dynamic data dependency to trace.

### Behavioral Spot-Checks

| Behavior                                                   | Command                                       | Result                                                                                                                              | Status |
| ---------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Full workspace test suite passes (target 736+)             | `pnpm -r test`                                | 51 lattice files, 592 tests; 13 lattice-cli files, 144 tests; total 736 passing                                                     | PASS   |
| Full workspace typecheck is clean                          | `pnpm -r typecheck`                           | lattice + lattice-cli both `Done` with no diagnostics                                                                                | PASS   |
| Phase 25 audit: no internal files leak into publish tarball | `node scripts/check-tarball-leak.mjs`         | "OK -- inspected 2 tarballs"; exit 0                                                                                                | PASS   |
| Phase 25 audit: no stale unscoped lattice imports          | `node scripts/verify-rename.mjs`              | "OK -- scanned 168 files, no stale unscoped lattice imports found"; exit 0                                                          | PASS   |
| Phase 25 audit: no unsafe workflow triggers                | `node scripts/check-workflow-safety.mjs`      | "OK -- audited 1 workflow file(s), no pull_request_target triggers, no out-of-scope id-token: write declarations"; exit 0           | PASS   |
| Emoji scan clean on phase 26 authored prose artifacts      | `perl -ne ... unicode emoji ranges`           | No matches across SECURITY.md, CONTRIBUTING.md, both CHANGELOGs, .changeset/v1.3.0-initial.md                                        | PASS   |
| Em-dash scan clean on phase 26 authored prose artifacts    | `grep -- "—|–"`                               | No matches across SECURITY.md, CONTRIBUTING.md, both CHANGELOGs, .changeset/v1.3.0-initial.md; README phase 26 additions also clean   | PASS   |

### Requirements Coverage

The user prompt frames the six phase 26 requirement IDs as a single set (DOC-01 through DOC-05 plus CRYPTO-01). REQUIREMENTS.md maps each ID to specific deliverables that differ slightly from plan-level frontmatter assignment, so the table below traces each ID to the underlying deliverable per the REQUIREMENTS.md descriptions.

| Requirement | Source Plan                | Description                                                                                                                                       | Status    | Evidence                                                                                                                     |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| DOC-01      | 26-01 (CONTRIBUTING.md)    | CONTRIBUTING.md at repo root with contribution flow, codeowner notes, commit conventions                                                          | SATISFIED | CONTRIBUTING.md 87 lines, six labeled sections including Pull Request Flow and Commit Conventions                            |
| DOC-02      | 26-01 (SECURITY.md)        | SECURITY.md at repo root with CVE disclosure address, Ed25519 entropy, signing-key rotation, receipt-downgrade defense                            | SATISFIED | SECURITY.md 93 lines covering all four content blocks; cross-references verify.ts and schema-version-too-low literal           |
| DOC-03      | 26-02 (CHANGELOGs)         | CHANGELOG seeded with v1.0 / v1.1 / v1.2 history retroactively                                                                                    | SATISFIED | packages/lattice/CHANGELOG.md and packages/lattice-cli/CHANGELOG.md both seeded with four sections each in keepachangelog format |
| DOC-04      | 26-02 (.changeset/v1.3.0)  | Initial changeset created seeding v1.3.0 release notes                                                                                            | SATISFIED | .changeset/v1.3.0-initial.md body covers five themes; both packages remain `minor`                                            |
| DOC-05      | 26-03 (README)             | README.md updated with install instructions (`@fullselfbrowsing/lattice`), npm + provenance + license badges, provenance verification example     | SATISFIED | README.md line 1 badges, lines 149-166 scoped install with bin-name note, lines 286-295 provenance verification section       |
| CRYPTO-01   | 26-04 (defense)            | verifyReceipt enforces schemaVersion >= 1.1; new error kind schema-version-too-low; documented in SECURITY.md with Radicle 2026-03 precedent      | SATISFIED | types.ts:107 union extension, verify.ts:117-130 Step 4 branch, verify.test.ts:429-550 three tests, SECURITY.md:63-73 writeup    |

Notes:
- Plan frontmatter assigns these IDs slightly differently (e.g., plan 26-01 claims DOC-02+DOC-04, plan 26-03 claims DOC-01+DOC-05). The mapping divergence is cosmetic — every underlying deliverable described in REQUIREMENTS.md is produced and verifiable on disk.
- No orphaned requirements: REQUIREMENTS.md maps exactly these six IDs to Phase 26 and all six are covered by plan output.

### Anti-Patterns Found

| File                                            | Line       | Pattern                                                                                          | Severity | Impact                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| packages/lattice/src/receipts/verify.ts         | 128        | One em-dash (U+2014) inside a runtime error-message string literal                               | Info     | Per phase rule, em-dashes inside code string literals are exempt. Confirmed in plan 26-04 action text ("D-15 specifies that one em-dash in the error MESSAGE string literal verbatim") and 26-REVIEW finding #4 ("em-dashes ... in one runtime error string -- pre-existing code style, exempt") |
| packages/lattice/src/receipts/verify.ts         | 67         | One em-dash in JSDoc above verifyReceipt                                                          | Info     | Pre-existing source comment, exempt per phase rule                                                                                                                                                                                                                       |
| verify.ts step 4 comment + verify.test.ts:429   | various    | Em-dash in describe block name `"verify.ts — schema-version-too-low downgrade defense (CRYPTO-01)"` and decision-tree JSDoc | Info     | Maintains file-internal consistency with pre-existing describe blocks (verify.test.ts:63, :91, :298, :343 all use em-dashes in describe names per Phase 9 convention). Exempt under "pre-existing source comments" rule                                                  |
| receipt.ts:90-91                                | 90-91      | Type union `"lattice-receipt/v1" | "lattice-receipt/v1.1"` declared wider than reachable          | Info     | Code-review IN-01 finding; cosmetic, does not affect correctness. Acceptable per phase scope (the union literal must remain in types.ts for the verify-side regression tests to hand-craft v1 bodies)                                                                    |
| verify.ts asReceiptBody undefined arm           | 39-49      | `body.version === undefined` clause in Step 4 is statically unreachable today because asReceiptBody accepts undefined and Step 3 + Step 4 share the rejection load | Info     | Code-review WR-01 was addressed in commit 9735a61 ("make Step 4 the single chokepoint"). asReceiptBody now accepts `version` either undefined or a v1/v1.1 string so all version-absent and v1-literal bodies flow through Step 4. Defense surface intact                  |

No Blockers. No Warnings impacting the goal. All anti-pattern matches are intentional, scope-exempt, or addressed in a follow-up commit (9735a61).

### Human Verification Required

None. All must-haves are verifiable programmatically (file existence, content greps, line counts, test exit codes, audit-script exit codes, type-check status, emoji/em-dash unicode scans). No visual rendering, no real-time behavior, no external services, no UI flow.

### Gaps Summary

None. Every must-have item from the prompt is verified against on-disk HEAD state:

- Documentation artifacts (SECURITY.md, CONTRIBUTING.md, both CHANGELOGs, README additions, .changeset/v1.3.0-initial.md body) exist with the required content, scoped names, structural elements, and cross-references.
- Receipt-downgrade defense (CRYPTO-01) is wired end-to-end: union extension in types.ts, Step 4 branch in verify.ts placed before keyset lookup and signature verification, three new tests in verify.test.ts covering both negative branches and a positive v1.1 control.
- Test posture: 736 tests pass (592 lattice + 144 lattice-cli), exceeding the 736+ target.
- Typecheck clean across the workspace.
- All three Phase 25 audit scripts still exit 0 (no regressions introduced by phase 26 file additions or rename touches).
- Emoji policy: zero emojis in any phase 26 authored artifact (perl unicode-range scan empty).
- Em-dash-between-sentences policy: zero em-dashes connecting sentences in SECURITY.md, CONTRIBUTING.md, both CHANGELOGs, README additions, or the changeset body. Em-dashes present in pre-existing JSDoc comments, one runtime error string literal, and pre-existing describe block names in verify.test.ts are exempt per the phase rule.

Code-review (26-REVIEW.md) findings WR-01 and WR-02 were resolved in commit 9735a61 ("make Step 4 the single chokepoint for schema-version downgrade"); other findings (IN-01 through IN-04) are cosmetic/stylistic and do not gate the goal.

---

_Verified: 2026-06-06T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
