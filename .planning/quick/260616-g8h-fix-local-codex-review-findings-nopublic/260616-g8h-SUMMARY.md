---
task: 260616-g8h
date: 2026-06-16
branch: recon
status: complete
---

# Quick Task 260616-g8h: Fix Local Codex Review Findings (noPublicUrl / Lineage / Streaming Usage)

## What Was Done

Three confirmed Codex review findings fixed on the `recon` branch feeding release PR #12 for v1.4 / 1.4.0.

### Finding 1 (P2-B): Block noPublicUrl bypass via file-id URL-valued metadata

**Problem:** An artifact with `metadata.fileUri = "https://cdn.example.test/clip.mp4"` and `policy.noPublicUrl = true` was being sent to Gemini as a `fileData.fileUri` via the `file-id` transport. Only the `url` transport was blocked; the `file-id` transport was not checked for HTTP-URL-valued metadata.

**Fix:** Added a second guard in `chooseTransport` (packaging.ts) immediately after the existing `noPublicUrl` + `url` guard. The new guard skips any `file-id` candidate whose `reference.metadataKey` resolves to an HTTP/HTTPS URL in `inputArtifact.metadata`. Provider-internal handles like `"files/audio-123"` are not HTTP URLs and pass `isHttpUrl()` as false, so they remain unblocked.

Deleted the inaccurate "not a bug" comment block and replaced it with an accurate comment explaining the guard.

**Tests added:** Two new tests in `packaging.test.ts`:
- Test A: `metadata.fileUri = "https://..."` + `noPublicUrl: true` → blocked
- Test B: `metadata.geminiFileUri = "files/audio-123"` + `noPublicUrl: true` → passes file-id

### Finding 2 (P2-A): Add lineageArtifacts to validation-failed and tripwire-violated receipts

**Problem:** The `maybeIssueReceipt` calls at the `validation-failed` (line ~506) and `tripwire-violated` (line ~583) sites in `create-ai.ts` were missing the `lineageArtifacts` field. This meant the receipt's `lineageMerkleRoot` was `undefined` on those paths, losing packaged artifact lineage in non-success receipts.

**Fix:** Added `lineageArtifacts: [...built.artifacts, ...attemptPackaging.packagedArtifacts]` to both `maybeIssueReceipt` calls. `artifactRefs` (output artifact references) are intentionally excluded — they are only available on the success path.

**Test added:** T4b in `create-ai.test.ts` — runs a tripwire-violating scenario with a source artifact, verifies `lineageMerkleRoot` is a valid sha256 hash, and asserts it differs from the root computed over raw input artifacts alone (regression guard that fails loud if the fix is reverted).

### Finding 3 (P3): End-to-end streaming usage assertion

**Problem:** The existing streaming test at line 595 fed `usage: { prompt_tokens: 2, completion_tokens: 3 }` in the OpenAI-compatible stream but did not assert `result.usage` or the signed receipt body usage.

**Fix:** Added a new test in the `Phase 43 streaming runtime` describe block that:
- Uses `createOpenAICompatibleProvider` with a streaming fetch returning a final SSE chunk with `usage: { prompt_tokens: 5, completion_tokens: 3 }`
- Configures a signer (local copy of `makeSignerAndKeySet` pattern)
- Asserts `result.usage.promptTokens > 0` and `result.usage.completionTokens > 0`
- Verifies the signed receipt body `usage.promptTokens > 0` and `usage.completionTokens > 0`

The eu5 fix (streaming `include_usage`) was already in place — the test passed immediately (GREEN without a production code fix). The test is committed as the coverage addition.

## Commits

| Hash | Message |
|------|---------|
| `9520cf5` | `test(packaging): add failing noPublicUrl+file-id URL-bypass tests` (RED) |
| `0a8eae5` | `fix(packaging): block noPublicUrl file-id transport when metadata value is a public URL` (GREEN) |
| `7ca6f75` | `test(create-ai): add failing tripwire-violated lineage merkle regression guard` (RED) |
| `97f6c56` | `fix(create-ai): add lineageArtifacts to validation-failed and tripwire-violated receipts` (GREEN) |
| `7fab2a4` | `test(create-ai): add failing streaming usage end-to-end assertion` (test-only; no GREEN commit needed) |

## CI Gate Result

All CI mirror steps passed:

- `pnpm -r build` — PASS
- `pnpm -r typecheck` — PASS
- `pnpm -r test` — PASS (1032 tests, 1 new in packaging, 2 new in create-ai)
- `pnpm -r test:types` — PASS (1226 type tests, no errors)
- `pnpm -r lint:packages` — PASS
- `node scripts/verify-rename.mjs` — PASS (263 files scanned)
- `node scripts/check-tarball-leak.mjs` — PASS (2 tarballs inspected)
- `node scripts/check-package-version-surfaces.mjs` — PASS
- `node scripts/check-core-package-boundary.mjs` — PASS
- `node scripts/check-workflow-safety.mjs` — PASS (3 workflow files audited)

## Deviations from Plan

### Finding 3 test approach (minor)

The plan gave two options for the streaming usage test: either use `ProviderStreamChunk` with a `"usage"` kind, or fall back to the `makeOpenAICompatibleStreamingFetch` pattern. The `ProviderStreamChunk` union does not have a `"usage"` variant (confirmed by inspection), so the OpenAI-compatible path was used as specified in the plan's fallback guidance. No deviation in intent.

### Finding 3: No GREEN commit needed

Per the plan: "If it passes immediately (fix already in place), the RED commit was the only needed step." The streaming usage test passed immediately against current `recon` code (eu5 fix already captured usage from the final SSE chunk). Only one commit for Finding 3 (the test), no production fix commit.

### isHttpUrl helper confirmed present

Confirmed `isHttpUrl` at packaging.ts line 430 before adding the guard. No new helper needed.

## No Changes To

- No `.changeset/` files added or modified
- No `package.json` version fields changed
- No ROADMAP.md changes
- Lines ~712 and ~750 in `create-ai.ts` (pre-packaging and post-loop receipt sites) left untouched as specified
