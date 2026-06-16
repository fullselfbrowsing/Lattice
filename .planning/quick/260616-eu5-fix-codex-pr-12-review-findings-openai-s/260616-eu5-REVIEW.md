# Local Codex review — quick task 260616-eu5

Reviewer: `codex exec` (codex-cli 0.139.0, ChatGPT auth, read-only sandbox)
Scope: `git diff b3492fe..HEAD -- packages/` (the fix set, after the GitHub Codex bot hit code-review quota)
Date: 2026-06-16

---

**Findings**
- **P2** [create-ai.ts](/Users/lakshman/conductor/workspaces/lattice/dubai/packages/lattice/src/runtime/create-ai.ts:506): lineage fix is incomplete for non-success receipts. The success branch includes `attemptPackaging.packagedArtifacts`, but `validation-failed` and `tripwire-violated` receipts still call `maybeIssueReceipt` with only `artifacts: built.artifacts`. Those runs already performed provider packaging, so their receipt lineage can still omit the packaging transform.

- **P2** [packaging.ts](/Users/lakshman/conductor/workspaces/lattice/dubai/packages/lattice/src/providers/packaging.ts:362): the `noPublicUrl` + Gemini `fileUri` “not a bug” reasoning is not fully sound. Gemini `file-id` selection accepts any string from `geminiFileUri`, `providerFileUri`, or generic `fileUri`; `noPublicUrl` only blocks `transport === "url"`. A metadata value like `{ fileUri: "https://cdn.example.test/clip.mp4" }` can still flow through the `file-id` branch and be sent as `fileData.fileUri` in [gemini.ts](/Users/lakshman/conductor/workspaces/lattice/dubai/packages/lattice/src/providers/gemini.ts:170). The comment is only true if those metadata keys are validated or guaranteed to be provider-internal.

- **P3** [create-ai.test.ts](/Users/lakshman/conductor/workspaces/lattice/dubai/packages/lattice/src/runtime/create-ai.test.ts:595): streaming usage is tested at the adapter level, but not end-to-end through `ai.run` into `result.usage` and a signed receipt. The existing runtime OpenAI-compatible streaming test feeds usage but does not assert it.

**Resolved**
- OpenAI-compatible streaming request body fix looks correct: `stream_options: { include_usage: true }` is added only for streaming requests, and the adapter captures usage from the final SSE chunk.
- Receipt diff projection now covers the current receipt body fields, including `contractVerdict`, `contractHash`, `modelClass`, redaction fields, and step fields.
- The success-path lineage regression guard would fail if the `create-ai.ts` success-branch packaged-artifact wiring is reverted.

Tests not run; review only in read-only sandbox.
