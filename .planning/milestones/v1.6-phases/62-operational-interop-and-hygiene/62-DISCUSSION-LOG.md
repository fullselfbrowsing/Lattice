# Phase 62: Operational Interop and Hygiene - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-07-17
**Phase:** 62-operational-interop-and-hygiene
**Mode:** `--auto` under the user's approved v1.6 milestone execution
**Areas discussed:** Supported Node and packed consumers, provider canary contract, release documentation, production comment hygiene

---

## Supported Node and Packed Consumers

| Option | Description | Selected |
|--------|-------------|----------|
| All non-EOL lines admitted by `engines >=24` | Test Node 24 LTS and Node 26 Current; remove EOL exceptions. | yes |
| LTS only | Test Node 24 while leaving Node 26 unproven despite the engine range. | |
| Preserve Node 20 facade exception | Continue a code-level exception below the package engine. | |

**Auto-selected choice:** All non-EOL lines admitted by `engines >=24`.
**Notes:** The official Node release table lists Node 24 as LTS, Node 26 as Current,
and Node 20/25 as EOL on 2026-07-17. Real tarball installation, not workspace
resolution, is the compatibility proof.

## Provider Canary Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Packed scheduled/manual native-family canaries | One bounded call through each real provider factory with explicit three-state evidence. | yes |
| Pull-request canaries | Exercise secrets and paid providers on ordinary code review events. | |
| One gateway for every family | Send all requests through one OpenAI-compatible transport. | |

**Auto-selected choice:** Packed scheduled/manual native-family canaries.
**Notes:** The recommended contract uses fixed benign input, provider-specific wire
shapes, a 16-token response limit, one attempt, a 20-second timeout, configured
pricing/spend, strict receipt verification, and sanitized retained JSON.

## Release Documentation

| Option | Description | Selected |
|--------|-------------|----------|
| Update every shipped and release-facing surface | Keep root/package/CLI/protocol/migration/version/changelog/canary claims synchronized. | yes |
| Root README only | Leave packed package and migration documents stale. | |
| Changelogs only | Record history without fixing installation and compatibility guidance. | |

**Auto-selected choice:** Update every shipped and release-facing surface.
**Notes:** SDK v1.6 and receipt schema v1.4 remain separate version axes.

## Production Comment Hygiene

| Option | Description | Selected |
|--------|-------------|----------|
| Comment-aware production scan with reasoned exclusions | Rewrite workflow narration and retain durable rationale. | yes |
| Repository-wide text grep | Flag strings, tests, docs, generated data, and archived planning history. | |
| Delete all comments | Remove both workflow narration and necessary technical constraints. | |

**Auto-selected choice:** Comment-aware production scan with reasoned exclusions.
**Notes:** Exclusions must be centralized and justified; no accepted-finding baseline
or blanket ignore may hide production narration.

## The agent's Discretion

- Canary module layout, result schema naming, exact schedule minute, and artifact compression.
- Compatibility label spelling after the EOL Node 20 tier is removed.
- Comment lexer implementation and documentation section order.

## Deferred Ideas

- Broader provider/model/modality canaries.
- Node 22 package support.
- Legacy receipt verification removal.
- PyPI publication and new storage backends.
