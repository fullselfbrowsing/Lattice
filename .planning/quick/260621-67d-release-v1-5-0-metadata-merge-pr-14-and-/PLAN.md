---
quick_id: 260621-67d
slug: release-v1-5-0-metadata-merge-pr-14-and-
status: in_progress
---

# Release v1.5.0 Metadata, Merge PR 14, And Tag Release

## Goal

Prepare PR #14 for a safe v1.5.0 release, merge it to `main`, recreate the
local only `v1.5.0` tag on the final `main` commit, and push the tag so the
existing release workflow publishes both packages with provenance.

## Implementation

* Rerun the failed PR CI once before changing release metadata.
* Normalize package manifests and generated version constants to `1.5.0`.
* Add concise professional `1.5.0` changelog sections for runtime and CLI.
* Run the full local release gate from the release plan.
* Push PR #14, confirm CI and review state, mark ready, and merge.
* Recreate the stale local only `v1.5.0` tag on merged `main` and push it.

## Verification

* `pnpm -r build`
* `pnpm -r typecheck`
* `pnpm -r test`
* `pnpm -r test:types`
* `pnpm -r lint:packages`
* Release audit scripts listed in the user approved release plan.
