# Phase 29: First v1.3.0 Stable Publish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 29-first-v1-3-0-stable-publish
**Areas discussed:** Sequencing and go/no-go, pre-publish gates, release notes and docs, publish execution path, failure handling, proof capture

---

## Workflow Note

The interactive question UI was unavailable in this workspace mode. Following the GSD fallback behavior, the recommended discussion path and conservative defaults were selected. The resulting decisions are captured in `29-CONTEXT.md`.

---

## Sequencing and Go/No-Go

| Option | Description | Selected |
| --- | --- | --- |
| Stable first, canary after | Resolve the roadmap conflict using the detailed dependencies: Phase 30/31 install `1.3.0` from npm, so Phase 29 must publish stable before canary validation can run. | Yes |
| Canary before stable | Treat STATE.md's pending todo literally and block stable until canary work exists, requiring a Phase 30/31 resequence against rc.0. |  |
| Planning only | Prepare release notes and gates but stop before publish. |  |

**Selected default:** Stable first, canary after.

**Rationale:** Phase 30 and Phase 31 success criteria explicitly consume `@full-self-browsing/*@1.3.0` from npm. Phase 29 should publish stable with strong gates, then canary validates the stable artifacts.

---

## Pre-Publish Gates

| Option | Description | Selected |
| --- | --- | --- |
| Full release gate | Run install, build, typecheck, tests, type tests, package lint, Changesets status, registry drift check, workflow safety check, and registry preflight. | Yes |
| CI-only | Trust branch protection and GitHub Actions without repeating local release checks. |  |
| Minimal publish gate | Only check Changesets version math and npm registry availability before merging the version PR. |  |

**Selected default:** Full release gate.

**Rationale:** Stable publish is irreversible and includes external side effects. The gate should prove both the local package surface and the external release prerequisites before approval.

---

## Release Notes and Docs

| Option | Description | Selected |
| --- | --- | --- |
| Refresh stale public docs | Update README/release-status text and ensure GitHub Release notes are sourced from generated changelog/changesets. | Yes |
| Publish as-is | Avoid docs churn and rely on existing changesets only. |  |
| Broad docs overhaul | Rewrite README and docs across the project before stable. |  |

**Selected default:** Refresh stale public docs.

**Rationale:** README currently still describes v1.3 as only through Phases 33-34 and has stale test counts. Stable should not ship with visibly outdated public status.

---

## Publish Execution Path

| Option | Description | Selected |
| --- | --- | --- |
| Standard Changesets path | Let push-to-main create/update the Version Packages PR, merge it, and let the resulting `v1.3.0` tag trigger OIDC publish. | Yes |
| Manual tag | Create the stable tag manually after local checks. |  |
| Local publish | Publish from the developer machine. |  |

**Selected default:** Standard Changesets path.

**Rationale:** Phase 28 built and tested this workflow shape. Local stable publish would bypass the OIDC/provenance trust model.

---

## Failure Handling

| Option | Description | Selected |
| --- | --- | --- |
| Stop-and-diagnose recovery tree | No force republish, no token fallback, inspect side effects, rerun only if no package published, and create a recovery plan for partial publish. | Yes |
| Auto-rerun workflow | Rerun the failed workflow until it passes. |  |
| Manual npm recovery | Use a local classic token or npm UI to repair the release. |  |

**Selected default:** Stop-and-diagnose recovery tree.

**Rationale:** A stable version cannot be overwritten on npm. Partial external side effects must be handled explicitly and auditably.

---

## Proof Capture

| Option | Description | Selected |
| --- | --- | --- |
| Release dossier in summary | Capture npm JSON proof, dist-tags, shasums/signatures/attestations, GitHub Release URL, workflow run ID, environment approval, and tarball sanity. | Yes |
| Minimal summary | Record only that publish passed. |  |
| Separate artifact archive | Create extra proof files under planning or `.context`. |  |

**Selected default:** Release dossier in summary.

**Rationale:** Phase 29's success is mostly external. The summary must preserve enough proof that later canary and audit phases can trust the release state without redoing archaeology.

---

## the agent's Discretion

- Exact task decomposition.
- Exact wording of README release-status updates.
- Exact implementation for GitHub Release notes, as long as notes are sourced from generated changelog/changesets.
- Exact recovery-plan file shape if partial publish occurs.

## Deferred Ideas

- Canary repository implementation belongs to Phases 30 and 31.
- Cross-repo dispatch and milestone audit belong to Phase 32.
