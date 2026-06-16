---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Provider Breadth + Live Multimodal + Observability Export
status: Awaiting next milestone
stopped_at: Milestone v1.4 completed and archived; ready for next milestone
last_updated: "2026-06-16T09:34:26Z"
last_activity: 2026-06-16 — Milestone v1.4 completed and archived
progress:
  total_phases: 10
  completed_phases: 10
  total_plans: 36
  completed_plans: 36
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-16)

**Core value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.
**Current focus:** Planning next milestone

## Current Position

Phase: Milestone v1.4 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-06-16 — Milestone v1.4 completed and archived

## Performance Metrics

**Velocity:**

- Total plans completed (lifetime): 31 (v1.0 + v1.1 + v1.2)
- v1.2 plans: 25 across 9 phases
- v1.3 completed phase plans: 42 across Phases 24, 25, 26, 29, 33, 34, 35, 36, 37, 38, and Phase 39 plans 1-8; Phases 27 and 28 were externally/configuration driven with no per-plan files.
- Resets per milestone

**Recent Trend:**

- v1.2 milestone shipped 2026-05-31 with 9 phases, 25 plans, 46/46 REQ-IDs wired, 733/733 tests passing.
- v1.3 milestone opened 2026-06-03 and expanded to 16 phases after the model-capability registry and multi-agent surface were added. It closed on 2026-06-15 with Phases 30-32 superseded by FSB-via-npm dogfooding.
- `@full-self-browsing/lattice@1.3.0` and `@full-self-browsing/lattice-cli@1.3.0` are live on npm with SLSA provenance attestations and `latest` dist-tags. GitHub Release `v1.3.0` exists.
- FSB dogfood validation passed against the published npm package for v1.3 and against the packed local package candidate for v1.4. Phase 49's candidate run installed from tarball in an isolated temp consumer, ran a generated FSB-side v1.4 smoke, and ran FSB's compatible provider smoke with 47 PASS assertions.

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

v1.3 shipped 2026-06-15 (full record in `milestones/v1.3-*`). Carryforward decisions affecting v1.4:

- [Validation]: FSB consumes Lattice via the published npm package (real-world dogfooding); the synthetic canary (Phases 30–32) was superseded and the initial FSB dogfood suite passed 426 / 426 checks.
- [Deploy story]: A managed/hosted runtime is out of scope; a lightweight deploy-adapter framing is parked for possible future pickup.
- [v1.4 scope]: Provider breadth + gateway delegation, live/streaming multimodal, eval + OpenTelemetry observability export — research-first.
- [v1.4 roadmap]: 44 REQ-IDs mapped across Phases 40-49. All 44 are complete and mapped to evidence in `49-MILESTONE-EVIDENCE.md`.

### Pending Todos

- None carried forward as blockers. The Phase 30/32 canary todos were superseded at v1.3 close, and FSB-via-npm dogfooding now has both published-package and packed-candidate validation runs. The Lattice version-stamping bug was closed in Phase 40.

### Blockers/Concerns

- None open. v1.3's canary-related blockers (separate canary repo, real-provider API-key secrets, cross-repo dispatch) were resolved by supersession, and FSB-via-npm dogfooding validated the published `1.3.0` tarball path. The v1.3.0 publish and GitHub Release `v1.3.0` are complete.
- Phase 40 closed the version-stamping bug: `latticeVersion` and CLI banner version are stamped from package manifests.
- Phase 49 closed the residual FSB coverage risk for v1.4 by adding a generated FSB-side package-candidate smoke that explicitly checks new public exports, version stamping, `collectStream`, `evalAgentRun`, and v1.3 receipt compatibility alongside FSB's compatible provider smoke.

### v1.4 Phase 49 validation

- Offline v1.4 validation passed via `examples/v14-validation`: streaming, gateway, OTel observability, and failure behavior all run against fake providers.
- FSB package-candidate dogfood passed from an isolated temp install of the packed runtime tarball. The original FSB checkout remained untouched; its two dirty generated files were pre-existing and unchanged.
- Tarball validation now checks packed runtime/CLI tarballs for stale bare `lattice` refs, install-time scripts, and native/heavy dependency leakage into core.
- `49-MILESTONE-EVIDENCE.md` maps all 44 v1.4 requirements to phase summaries, tests, package checks, or scoped deferral notes.

## Deferred Items

Items acknowledged and deferred at v1.4 milestone close on 2026-06-16:

| Category | Item | Status |
|----------|------|--------|
| quick_task | 260422-gle-create-lattice-readme-matching-existing- | missing (stale index entry) |
| quick_task | 260609-ewo-clean-planning-state-after-v1-3-code-reg | missing (stale index entry) |
| quick_task | 260615-5m0-author-ieee-latex-paper-on-lattice-capab | missing (stale index entry) |
| quick_task | 260615-689-polish-lattice-paper-mention-lattice-in- | missing (stale index entry) |
| quick_task | 260615-6t9-record-fsb-via-npm-dogfood-validation-an | missing (stale index entry) |
| quick_task | 260615-7qq-update-paper-author-name-to-lakshman-tur | missing (stale index entry) |
| quick_task | 260615-ei0-capitalize-t-in-paper-author-last-name-a | missing (stale index entry) |

The Phase-25 partial human-UAT and one verification gap moved into `milestones/v1.3-phases/` with the archive and are documented in `milestones/v1.3-MILESTONE-AUDIT.md`.

## Recent Plan Metrics Snapshot

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 40 P01 | 18 min | 3 tasks | 8 files |
| Phase 40 P02 | 3 min | 2 tasks | 2 files |
| Phase 40 P03 | 5 min | 3 tasks | 5 files |
| Phase 41 P01 | 5 min | 3 tasks | 6 files |
| Phase 41 P02 | 5 min | 3 tasks | 6 files |
| Phase 41 P03 | 4 min | 3 tasks | 7 files |
| Phase 42 P01 | 15 min | 3 tasks | 4 files |
| Phase 42 P03 | 6 min | 3 tasks | 9 files |
| Phase 42 P02 | 5 min | 3 tasks | 6 files |
| Phase 44 P01 | 12min | 3 tasks | 11 files |
| Phase 44 P02 | 5min | 2 tasks | 2 files |
| Phase 44 P03 | 4min | 2 tasks | 2 files |
| Phase 44 P04 | 3min | 3 tasks | 3 files |

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
| 2026-06-15 | Author IEEE LaTeX paper on Lattice capability receipts and verifiable replay | Created top-level `paper/` (IEEEtran two-column `main.tex`, 19-entry `refs.bib`, README, Makefile, .gitignore). All quantitative claims verified against the codebase by 4 parallel agents and corrected vs stale planning docs (960 tests/82 files, 332 profiles, 7 providers, 7 verify error kinds). No-dash style enforced; pure ASCII. No TeX toolchain present, so PDF not compiled (verified structurally). See `.planning/quick/260615-5m0-author-ieee-latex-paper-on-lattice-capab/`. |
| 2026-06-15 | Polish Lattice paper (title, author, Times fonts, diagrams, graph) | Retitled to lead with "Lattice:", switched to Times fonts (newtxtext/newtxmath), updated author to Venkat Lakshman Turlapati (preferred Lakshman Turlapati) and email to lakshmanturlapati@gmail.com, and added TikZ diagrams (run-lifecycle figure*, receipt-construction flow) plus a pgfplots test-suite bar chart. Installed tectonic 0.16.9; `main.pdf` compiles clean (0 overfull, 8 pages) and was visually verified page by page. See `.planning/quick/260615-689-polish-lattice-paper-mention-lattice-in-/`. |
| 2026-06-15 | Correct paper author name spelling | Updated `paper/main.tex` and `paper/README.md` to use `Lakshman Turlapati`, then rebuilt `paper/main.pdf` from the corrected LaTeX source. See `.planning/quick/260615-7qq-update-paper-author-name-to-lakshman-tur/`. |
| 2026-06-15 | Capitalize paper author last name | Updated the paper author spelling to `Lakshman Turlapati` with an uppercase `T` in the last name, then rebuilt `paper/main.pdf`. See `.planning/quick/260615-ei0-capitalize-t-in-paper-author-last-name-a/`. |
| 2026-06-15 | Record FSB-via-npm dogfood validation and version-stamping follow-up | Recorded that FSB validates `@full-self-browsing/lattice@1.3.0` as a real npm downstream consumer with `npm run test:lattice` at 426 PASS / 0 FAIL, including `modelClass` signed-body coverage. Captured the remaining Lattice-side version-stamping bug as low-severity follow-up. |
| 2026-06-16 | Fix Codex PR #12 review findings (260616-eu5) | Verified each finding against code before changing anything. P1: added `stream_options.include_usage` to the OpenAI-compatible streaming request builder so streamed runs capture cost/usage. P2-1: broadened `lattice receipt diff` to compare all receipt body fields (incl. `contractVerdict`, `contractHash`, `modelClass`, redaction, step markers). P2-3: folded provider-packaged artifacts into the receipt lineage Merkle root and added a regression guard proving the wiring fails-loud if reverted. P2-2 (Gemini `noPublicUrl`/`fileUri`) initially judged NOT a bug — **later overturned** by the local Codex review and fixed in 260616-g8h. No version bump, no new changeset (fix-ups to already-changeset'd v1.4 features). 6 code commits on `recon` feeding PR #12; full CI mirror green. See `.planning/quick/260616-eu5-fix-codex-pr-12-review-findings-openai-s/`. |
| 2026-06-16 | Fix local-Codex review findings (260616-g8h) | A local `codex exec` review of the eu5 fix set (run after the GitHub Codex bot hit its code-review quota) surfaced three findings, all verified against code. **P2-B (security/privacy):** `noPublicUrl` was bypassable via the Gemini `file-id` transport — an artifact with an `https://` value in `fileUri`/`geminiFileUri`/`providerFileUri` metadata leaked the URL to Gemini. Added a `chooseTransport` guard that blocks file-id under `noPublicUrl` when the resolved value is a public http(s) URL (provider-internal `files/…` handles still pass); corrected the incorrect "not a bug" comment from eu5. This overturns eu5's P2-2 verdict. **P2-A:** extended packaged-artifact lineage to the `validation-failed` and `tripwire-violated` receipts (eu5 covered only the success path). **P3:** added an end-to-end test asserting streaming usage surfaces into `result.usage` and the signed receipt. 5 commits on `recon` (TDD RED/GREEN); the P2-B guard was proven load-bearing by reverting it; full CI mirror green. See `.planning/quick/260616-g8h-fix-local-codex-review-findings-nopublic/`. |
| 2026-06-16 | Harden noPublicUrl enforcement (260616-h31) | A `noPublicUrl` audit (triggered by the second local Codex review) found the policy is decided at the packaging boundary and correctly honored by the Anthropic and Gemini adapters, but the **OpenAI-compatible adapter** (`createOpenAICompatibleRequestBody`, shared by OpenAI/OpenRouter/xAI/LM Studio/LiteLLM) ignored the packaging transport and emitted artifact `url`/`value` raw — leaking a public URL under `noPublicUrl`. Gated url/value emission on `transport === "url"` (non-URL text content unaffected), promoted `isHttpUrl` to a shared export, and added a 5-test cross-adapter parity block (OpenAI-compat blocked url + value, positive no-over-block, Anthropic + Gemini regression locks) so the invariant can't silently drift again. Guard proven load-bearing. The executor agent hit a transient API 500 mid-run; the orchestrator reviewed/completed the staged fix, fixed a tsc-only type error in the parity tests, and ran the CI gate. 3 commits on `recon`; full CI mirror green. See `.planning/quick/260616-h31-harden-nopublicurl-enforcement-openai-co/`. |
| 2026-06-16 | Single-chokepoint noPublicUrl egress enforcement (260616-inn) | After three rounds of per-site patches, a third local Codex review showed `noPublicUrl` still had gaps (gateway metadata, base64-string mislabeling, custom adapters) because there was no single enforcement point. Added `assertNoPublicUrlEgress` (new `providers/no-public-url.ts`): a shared egress assertion called right before every run-request `fetch` in all three adapter families (OpenAI-compatible, Anthropic, Gemini — execute + stream). Under `noPublicUrl` it derives the set of public http(s) URLs from `request.artifacts` (value + string metadata) and throws a typed `NoPublicUrlEgressError` (surfaced as a RunFailure) if any appears in the serialized body — a fail-closed backstop that catches paths the per-site gating misses (e.g. a URL mislabeled as `metadata.base64Data`). **Scope decision:** `noPublicUrl` governs artifact-derived URLs, NOT user-set `policy.gateway.metadata` (documented in the module). New `parity.test.ts` + `no-public-url.test.ts` lock it across adapters; proven load-bearing (disabling the throw fails 7 tests). The executor caught and fixed a false-GREEN test design (mislabel artifacts needed `providerPackaging` to reach the body). 3 commits on `recon`; full CI mirror green. New public export `NoPublicUrlEgressError` added to the surface inventory; no new changeset (part of the already-changeset'd v1.4 multimodal feature). See `.planning/quick/260616-inn-add-single-chokepoint-nopublicurl-egress/`. |

## Session Continuity

Last session: 2026-06-16T04:16:14-05:00
Stopped at: Milestone v1.4 completed and archived; ready for next milestone
Resume: `/gsd-autonomous`

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
